// src/models/ControlStockModel.js
// Fitur "Control Stock" — kebalikan dari alur Transfer Rak (scan rackcode →
// dapet item). Di sini input-nya ITEM, output-nya SEMUA LOKASI (lot) tempat
// item itu berada, lengkap qty & jumlah rak per lokasi, diurutkan dari
// whsweek paling tua.
//
// Sumber data (semua di server DB-PANDU / DB EDP, read-only, sama seperti
// RackVerificationModel):
//   - fginvc.fgloc          → peta lokasi: whscode/locblock/loccol (loccol =
//                             kode LOT/lokasi fisik yang bener, mis.
//                             "BPW01-A0101" — JANGAN pakai `loccode`, itu
//                             bukan kode lokasi, melainkan kode family/tipe
//                             item, mis. "IBD1301"), item yang "ditempatkan"
//                             di lokasi itu, sampai 4 slot rackcode
//                             (rackcode1..4), maxrack, obstacle.
//   - fginvc.rack           → isi real tiap rackcode: item, probcode, qty
//                             (1 baris = 1 unit/pcs, sama kayak dipakai di
//                             RackVerificationModel), DAN `curweek` (kode
//                             minggu masuk gudang, format YYWW — 2 digit
//                             tahun DULU baru 2 digit minggu, mis. "2609" =
//                             tahun 2026 minggu-09).
//   - bcmcfgv1.itemcatalog  → deskripsi item.
//
// PENTING soal whsweek yang ditampilkan ke user: nilainya sekarang diambil
// dari `rack.curweek`, BUKAN `fgloc.whsweek` lagi (fgloc.whsweek gak
// reliable menurut tim EDP). Karena 1 rackcode bisa aja isinya campur
// beberapa curweek (mis. sisa 1 unit lama nyempil di antara batch baru),
// curweek yang dipakai per rak = curweek MAYORITAS (unit terbanyak), bukan
// yang paling tua lagi. whsweek per LOKASI (buat urutan "paling tua
// duluan") tetap diambil dari curweek PALING TUA di antara rak-rak yang
// ngisi lokasi itu.
//
// PENTING: kalau ada lebih dari 1 baris fgloc yang loccol-nya (lot) SAMA,
// semuanya digabung jadi SATU baris lokasi di hasil akhir — rak-raknya
// disatuin (dedupe per rackcode) dan whsweek-nya dihitung ulang dari
// gabungan semua rak itu. Jadi 1 lot = 1 baris, gak dobel.
//
// PENTING soal data drift: `fgloc.item` cuma nyatet lokasi itu "resminya"
// dialokasikan buat item apa — tapi kalau rak itu dipakai gantian buat
// item lain dan fgloc.item belum di-update, stok yang beneran ada di rak
// itu bisa "ngumpet" kalau pencarian cuma andelin fgloc.item = ?. Makanya
// pencarian dilakukan 2 jalur: (A) fgloc.item = item yang dicari (jalur
// normal), DAN (B) rackcode yang FISIKNYA (tabel rack) beneran isi item
// itu, lepas dari fgloc.item-nya kecatet buat item apa. Hasil dari jalur B
// ditandai lewat field `item_terdaftar_lain` di tiap lokasi.
//
// PENTING soal rak yang ditampilkan: HANYA rackcode yang KEBUKTI FISIK
// (tabel rack) beneran isi item yang dicari yang muncul di hasil. Slot
// kosong (belum ada rak terverifikasi) dan slot yang isinya item lain
// (anomali/mismatch/tetangga di baris fgloc yang sama) di-skip semua —
// gak ditampilkan ke user. Lokasi yang abis difilter jadi 0 rak juga
// dibuang dari hasil.
//
// Kenapa perlu join 2 tabel (fgloc + rack) padahal fgloc udah punya kolom
// `item`: fgloc cuma bilang lokasi itu "dialokasikan" buat item apa &
// whsweek berapa, tapi TIDAK punya qty. Qty & kategori (probcode) real-nya
// harus diambil dari tabel `rack` per rackcode — sama persis kayak logic
// verifikasi scan rak yang udah ada.
const { poolEdp } = require("../../config/database");

class ControlStockModel {
  // Ambil deskripsi item dari bcmcfgv1.itemcatalog. Balikin Map<item, descr>.
  //
  // PENTING soal performa: JANGAN bungkus kolom dengan TRIM()/fungsi lain di
  // WHERE — itu bikin MySQL gak bisa pakai index di kolom itu (harus full
  // table scan tiap query). Makanya perbandingan di bawah ini pakai kolom
  // apa adanya (item = ? / item IN (?)), sama kayak pola yang udah dipakai
  // RackVerificationModel (yang udah kebukti cepat).
  static async _getDescriptions(itemCodes) {
    const map = new Map();
    if (!itemCodes.length) return map;
    const [rows] = await poolEdp.query(
      `SELECT item, descr FROM bcmcfgv1.itemcatalog WHERE item IN (?)`,
      [itemCodes],
    );
    rows.forEach((r) => {
      map.set((r.item || "").trim(), (r.descr || "").trim());
    });
    return map;
  }

  // Ambil isi real tiap rackcode dari fginvc.rack, dikelompokkan per
  // rackcode + item + probcode. Balikin Map<rackcode, [{item, kategori, qty, curweek}]>.
  // Array (bukan objek tunggal) buat nangani kasus langka rak ternyata
  // campur >1 item/kategori (sama seperti RackVerificationModel).
  //
  // `curweek` yang dibalikin = curweek MAYORITAS (yang unitnya paling
  // banyak) dalam grup rackcode+item+probcode itu — BUKAN yang paling tua
  // lagi. Kalau 1 rackcode isinya campur beberapa curweek (mis. 59 unit
  // @2631, 1 unit @2630 — sisa unit lama yang belum sempat kepindah),
  // yang ditampilkan adalah 2631 karena itu yang mewakili isi rak
  // sebenarnya. Kalau jumlahnya seri, dipilih yang paling tua (curweek
  // ASC) biar konsisten & deterministik. `qty` tetap TOTAL semua unit
  // (semua curweek digabung), cuma label minggunya yang dipilih mayoritas.
  static async _getRackContents(rackcodes) {
    const map = new Map();
    if (!rackcodes.length) return map;

    const [rows] = await poolEdp.query(
      `SELECT rackcode, item, probcode, curweek, qty_total AS qty
       FROM (
         SELECT rackcode, item, probcode, curweek,
                SUM(cnt) OVER (PARTITION BY rackcode, item, probcode) AS qty_total,
                ROW_NUMBER() OVER (
                  PARTITION BY rackcode, item, probcode
                  ORDER BY cnt DESC, curweek ASC
                ) AS rn
         FROM (
           SELECT rackcode, item, probcode, curweek, COUNT(*) AS cnt
           FROM rack
           WHERE rackcode IN (?)
           GROUP BY rackcode, item, probcode, curweek
         ) base
       ) ranked
       WHERE rn = 1`,
      [rackcodes],
    );

    rows.forEach((r) => {
      const kode = (r.rackcode || "").trim();
      if (!map.has(kode)) map.set(kode, []);
      map.get(kode).push({
        item: (r.item || "").trim(),
        kategori: (r.probcode || "").trim()
          ? r.probcode.trim().toUpperCase()
          : "OK",
        qty: Number(r.qty),
        curweek: (r.curweek == null ? "" : String(r.curweek)).trim(),
      });
    });
    return map;
  }

  // Ambil detail rak yang UDAH FISIK ke-scan (tabel `rack`, rackcode
  // beneran, bukan "~") tapi rackcode itu BELUM nempel di slot manapun
  // (rackcode1-4) di baris `fgloc` manapun — artinya rak itu udah eksis &
  // udah isi item, tapi belum di-assign ke lot/loccode.
  //
  // `rackcodes` di sini udah hasil filter di caller: rackcode fisik milik
  // item ini yang TERBUKTI gak ketemu di query fgloc manapun.
  //
  // PENTING soal performa: query LANGSUNG filter `item = ?` di WHERE
  // (bukan reuse _getRackContents yang narik SEMUA item di rackcode itu
  // terus difilter belakangan di JS) — soalnya rackcode di sini kadang
  // jumlahnya banyak (item yang umum/sering dipake bisa punya ratusan-
  // ribuan rak fisik), jadi query yang gak perlu narik data item lain
  // penting biar gak nambah beban ke DB EDP yang udah dipanggil beberapa
  // kali di alur ini.
  static async _getRakBelumMasukLot(
    rackcodes,
    itemCode,
    kategoriFilter = null,
  ) {
    if (!rackcodes.length) {
      return {
        ada: false,
        jumlah_rak: 0,
        qty_total: 0,
        kategori_breakdown: [],
        racks: [],
      };
    }
    const kode = (itemCode || "").trim();

    // curweek per rackcode+probcode = curweek MAYORITAS (unit terbanyak),
    // sama pola kayak _getRackContents — cuma di sini scope-nya udah
    // dipersempit ke 1 item doang lewat WHERE item = ?, jadi jauh lebih
    // murah buat DB dibanding narik semua item dulu baru difilter di JS.
    const [rows] = await poolEdp.query(
      `SELECT rackcode, probcode, curweek, qty_total AS qty
       FROM (
         SELECT rackcode, probcode, curweek,
                SUM(cnt) OVER (PARTITION BY rackcode, probcode) AS qty_total,
                ROW_NUMBER() OVER (
                  PARTITION BY rackcode, probcode
                  ORDER BY cnt DESC, curweek ASC
                ) AS rn
         FROM (
           SELECT rackcode, probcode, curweek, COUNT(*) AS cnt
           FROM rack
           WHERE item = ? AND rackcode IN (?)
           GROUP BY rackcode, probcode, curweek
         ) base
       ) ranked
       WHERE rn = 1`,
      [kode, rackcodes],
    );

    const byRackcode = new Map();
    rows.forEach((r) => {
      const rc = (r.rackcode || "").trim();
      if (!byRackcode.has(rc)) byRackcode.set(rc, []);
      byRackcode.get(rc).push({
        kategori: (r.probcode || "").trim()
          ? r.probcode.trim().toUpperCase()
          : "OK",
        curweek: (r.curweek == null ? "" : String(r.curweek)).trim(),
        qty: Number(r.qty),
      });
    });

    let racks = [...byRackcode.entries()].map(([rc, isi]) => {
      const qty = isi.reduce((s, c) => s + c.qty, 0);
      const kategoriList = [...new Set(isi.map((c) => c.kategori))];
      const curweek = [...isi].sort((a, b) => {
        if (b.qty !== a.qty) return b.qty - a.qty;
        return a.curweek.localeCompare(b.curweek);
      })[0].curweek;
      return {
        rackcode: rc,
        qty,
        kategori: kategoriList.join(", "),
        kategoriList,
        curweek,
      };
    });

    if (kategoriFilter) {
      racks = racks.filter((r) => r.kategoriList.includes(kategoriFilter));
    }
    racks.sort((a, b) => (a.curweek || "").localeCompare(b.curweek || ""));

    const qtyTotal = racks.reduce((s, r) => s + r.qty, 0);
    const kategoriBreakdown = [
      ...racks
        .reduce((map, r) => {
          r.kategoriList.forEach((k) => {
            map.set(k, (map.get(k) || 0) + r.qty);
          });
          return map;
        }, new Map())
        .entries(),
    ].map(([kategori, qty]) => ({ kategori, qty }));

    return {
      ada: racks.length > 0,
      jumlah_rak: racks.length,
      qty_total: qtyTotal,
      kategori_breakdown: kategoriBreakdown,
      racks,
    };
  }

  // Ambil qty item yang MASIH NYANGKUT di rackcode "~" — yaitu unit yang
  // udah masuk tabel `rack` (udah tercatat sistem) tapi BELUM ditempatin
  // ke rak/lot fisik beneran (makanya rackcode-nya cuma placeholder "~",
  // bukan kode rak asli, dan otomatis gak nyantol ke slot rackcode1-4
  // manapun di `fgloc` — makanya harus di-query LANGSUNG ke `rack`,
  // gak bisa lewat join fgloc kayak alur lokasi normal).
  //
  // Dikelompokkan per probcode + curweek biar user bisa liat breakdown-nya
  // (mis. ada 40 unit OK minggu 2631, 5 unit OE minggu 2630, dst), bukan
  // cuma 1 angka total doang.
  static async _getBelumMasukLot(itemCode, kategoriFilter = null) {
    const kode = (itemCode || "").trim();
    const [rows] = await poolEdp.query(
      `SELECT probcode, curweek, COUNT(*) AS qty
       FROM rack
       WHERE item = ? AND rackcode = '~'
       GROUP BY probcode, curweek`,
      [kode],
    );

    let detail = rows.map((r) => ({
      kategori: (r.probcode || "").trim()
        ? r.probcode.trim().toUpperCase()
        : "OK",
      curweek: (r.curweek == null ? "" : String(r.curweek)).trim(),
      qty: Number(r.qty),
    }));

    // Sama kayak filter kategori di level lokasi — kalau ada filter
    // OK/OE, cuma baris yang kategorinya cocok yang dihitung.
    if (kategoriFilter) {
      detail = detail.filter((d) => d.kategori === kategoriFilter);
    }

    detail.sort((a, b) => (a.curweek || "").localeCompare(b.curweek || ""));

    const qtyTotal = detail.reduce((s, d) => s + d.qty, 0);
    const kategoriBreakdown = [
      ...detail
        .reduce((map, d) => {
          map.set(d.kategori, (map.get(d.kategori) || 0) + d.qty);
          return map;
        }, new Map())
        .entries(),
    ].map(([kategori, qty]) => ({ kategori, qty }));

    return {
      ada: qtyTotal > 0,
      qty_total: qtyTotal,
      kategori_breakdown: kategoriBreakdown,
      detail,
    };
  }

  // Autocomplete pencarian kode item (dipakai di kotak search halaman
  // Control Stock). Dua jalur digabung:
  //   A) fgloc.item diawali keyword (prefix match, index-friendly) — buat
  //      user yang ngetik kode item langsung, mis. "IBD1301" atau "MB67".
  //   B) itemcatalog.descr NGANDUNG keyword — buat user yang ngetik
  //      sebagian deskripsi, mis. ukuran "130" atau kode pattern "SCT001"
  //      (tanpa strip) buat nemuin deskripsi "130/70-13 SCT-001". Keyword
  //      DAN deskripsi sama-sama dibuang strip/spasinya + di-uppercase
  //      dulu sebelum dibandingin, biar "sct001" bisa ketemu "SCT-001".
  // Kedua jalur cuma balikin item yang emang ada lokasinya di fgloc (item
  // yang gak punya stok di lokasi manapun gak usah muncul di suggestion).
  static async searchItem(keyword, limit = 20) {
    const raw = (keyword || "").trim();
    if (!raw) return [];

    // Prefix match ("KODE%"), BUKAN "%KODE%" — leading wildcard bikin index
    // di kolom item gak kepake (full scan). Prefix match masih bisa pakai
    // index `key3 (item, whscode)` yang udah ada di tabel fgloc, jadi tetap
    // cepat walau tabelnya 100rb+ baris.
    const kwPrefix = `${raw}%`;
    const [itemRows] = await poolEdp.query(
      `SELECT DISTINCT item
       FROM fgloc
       WHERE item LIKE ? AND item <> ''`,
      [kwPrefix],
    );

    const kwNormalized = raw.replace(/[\s-]/g, "").toUpperCase();
    let descrRows = [];
    if (kwNormalized) {
      const [rows2] = await poolEdp.query(
        `SELECT DISTINCT item FROM bcmcfgv1.itemcatalog
         WHERE REPLACE(REPLACE(UPPER(descr), '-', ''), ' ', '') LIKE ?
           AND item IN (SELECT DISTINCT item FROM fgloc WHERE item <> '')`,
        [`%${kwNormalized}%`],
      );
      descrRows = rows2;
    }

    const itemSet = new Set();
    [...itemRows, ...descrRows].forEach((r) => {
      const it = (r.item || "").trim();
      if (it) itemSet.add(it);
    });

    const items = [...itemSet].sort().slice(0, limit);
    const descrMap = await this._getDescriptions(items);
    return items.map((item) => ({
      item,
      deskripsi: descrMap.get(item) || "-",
    }));
  }

  // Fungsi utama: cari SEMUA lokasi (lot) tempat sebuah kode item berada.
  // Balikin null kalau kode item kosong. Kalau item gak ketemu di lokasi
  // manapun, tetep balikin objek dengan `lokasi: []` (bukan null) biar
  // frontend bisa nampilin "tidak ditemukan" dengan jelas.
  //
  // `kategoriFilter`: "OK" | "OE" | null/undefined (semua). Filter ini
  // diterapkan di level RAK (bukan level lokasi) — kalau sebuah lokasi
  // isinya campur OK & OE, dan filter = "OK", cuma rak OK-nya yang
  // ditampilkan & dihitung; lokasi yang habis semua raknya kefilter
  // (gak ada rak OK sama sekali) gak ikut muncul di hasil.
  static async findLocationsByItem(itemCode, kategoriFilter = null) {
    const kode = (itemCode || "").trim();
    if (!kode) return null;
    const filterKategori = kategoriFilter
      ? kategoriFilter.trim().toUpperCase()
      : null;

    // Tahap A: lokasi yang TERDAFTAR resmi buat item ini (fgloc.item = kode).
    // Ini jalur normal — mayoritas kasus item ada di sini.
    const [directRows] = await poolEdp.query(
      `SELECT whscode, locblock, loccol, loccode, locitem, item,
              rackcode1, rackcode2, rackcode3, rackcode4,
              maxrack, obstacle
       FROM fgloc
       WHERE item = ?
       ORDER BY loccol ASC`,
      [kode],
    );

    // Tahap B: cari rackcode yang FISIKNYA (tabel `rack`) beneran isi item
    // ini, lepas dari fgloc.item-nya kecatet buat item apa. Ini nangkep
    // kasus data drift — rak dipakai gantian tapi `fgloc.item` belum
    // di-update ke item yang baru, jadi kalau cuma andelin fgloc.item,
    // stok yang beneran ada di rak itu "ngumpet" (gak pernah muncul di
    // hasil pencarian). Lokasi (fgloc) tempat rackcode itu nempel tetep
    // harus ditarik biar user liat stoknya, walau lokasinya "terdaftar"
    // buat item lain.
    const [rackHits] = await poolEdp.query(
      `SELECT DISTINCT rackcode FROM rack WHERE item = ? AND rackcode <> ''`,
      [kode],
    );
    // Rackcode "virtual" (bukan rak fisik gudang — lihat isRackcodeVirtual
    // di bawah) dibuang dari sini juga, biar gak ikut nambahin item ke
    // query IN (?) OR (?) OR (?) OR (?) ke fgloc di bawah maupun ke
    // hitungan "belum masuk lot" nanti.
    const isRackcodeVirtual = (rc) =>
      rc === "CUSTOMER" || rc === "COLLIE" || /^~?T-\d+$/i.test(rc);
    const rackcodesFisik = rackHits
      .map((r) => (r.rackcode || "").trim())
      .filter((rc) => rc && !isRackcodeVirtual(rc));

    let driftRows = [];
    if (rackcodesFisik.length) {
      const [rows2] = await poolEdp.query(
        `SELECT whscode, locblock, loccol, loccode, locitem, item,
                rackcode1, rackcode2, rackcode3, rackcode4,
                maxrack, obstacle
         FROM fgloc
         WHERE rackcode1 IN (?) OR rackcode2 IN (?)
            OR rackcode3 IN (?) OR rackcode4 IN (?)`,
        [rackcodesFisik, rackcodesFisik, rackcodesFisik, rackcodesFisik],
      );
      driftRows = rows2;
    }

    // Dari rackcode fisik yang beneran isi item ini, mana aja yang
    // KETEMU nempel di suatu baris fgloc (lewat driftRows di atas) —
    // sisanya (gak ketemu di manapun) berarti rak itu udah ke-scan tapi
    // BELUM di-assign ke lot/loccode manapun.
    const matchedRackcodeSet = new Set();
    driftRows.forEach((r) => {
      [r.rackcode1, r.rackcode2, r.rackcode3, r.rackcode4].forEach((rc) => {
        const trimmed = (rc || "").trim();
        if (trimmed) matchedRackcodeSet.add(trimmed);
      });
    });
    // (rackcodesFisik di atas udah dibuang duluan dari kode virtual kayak
    // "CUSTOMER"/"T-<angka>", jadi filter di sini cukup soal matched/'~')
    const rackcodesBelumMasukLot = rackcodesFisik.filter(
      (rc) => rc !== "~" && !matchedRackcodeSet.has(rc),
    );

    // Gabung Tahap A + B, dedupe (baris fgloc yang sama bisa aja ke-tarik
    // dua-duanya kalau fgloc.item-nya emang udah bener DAN rak fisiknya
    // juga cocok — itu wajar, cukup ambil sekali).
    const seenRowKey = new Set();
    const rows = [];
    [...directRows, ...driftRows].forEach((r) => {
      const key = [
        r.whscode,
        r.locblock,
        r.loccol,
        r.item,
        r.rackcode1,
        r.rackcode2,
        r.rackcode3,
        r.rackcode4,
      ].join("|");
      if (seenRowKey.has(key)) return;
      seenRowKey.add(key);
      rows.push(r);
    });

    if (!rows.length) {
      // Walau item ini gak ketemu di lokasi/lot manapun, tetep bisa aja
      // ada unit yang udah masuk sistem tapi nyangkut di rackcode "~"
      // (belum ditempatin), ATAU udah ke-scan ke rak fisik tapi rak itu
      // belum di-assign ke lot/loccode manapun. Cek dua-duanya biar gak
      // keliatan "kosong total" padahal sebenernya ada stok yang lagi
      // nunggu ditempatin.
      const [descrMap, belumMasukLot, rakBelumMasukLot] = await Promise.all([
        this._getDescriptions([kode]),
        this._getBelumMasukLot(kode, filterKategori),
        this._getRakBelumMasukLot(rackcodesBelumMasukLot, kode, filterKategori),
      ]);
      return {
        item: kode,
        deskripsi: descrMap.get(kode) || "-",
        filter_kategori: filterKategori || "ALL",
        summary: { total_lokasi: 0, total_rak: 0, total_qty: 0 },
        lokasi: [],
        belum_masuk_lot: belumMasukLot,
        rak_belum_masuk_lot: rakBelumMasukLot,
      };
    }

    // Kumpulin semua kode rak (slot 1-4) yang keisi di semua lokasi ini,
    // biar bisa di-query sekali (batch) ke tabel `rack`, bukan per-rak.
    const allRackcodes = new Set();
    rows.forEach((r) => {
      [r.rackcode1, r.rackcode2, r.rackcode3, r.rackcode4].forEach((rc) => {
        const trimmed = (rc || "").trim();
        if (trimmed) allRackcodes.add(trimmed);
      });
    });

    const [rackMap, descrMap, belumMasukLot, rakBelumMasukLot] =
      await Promise.all([
        this._getRackContents([...allRackcodes]),
        this._getDescriptions([kode]),
        this._getBelumMasukLot(kode, filterKategori),
        this._getRakBelumMasukLot(rackcodesBelumMasukLot, kode, filterKategori),
      ]);

    const deskripsi = descrMap.get(kode) || "-";

    let totalRakGlobal = 0;
    let totalQtyGlobal = 0;

    // Tahap 1: ubah tiap baris fgloc jadi objek lokasi mentah (allRacks
    // BELUM difilter kategori). Dipisah dari tahap gabung, karena satu
    // loccol (lot) bisa muncul di lebih dari 1 baris fgloc (mis. beda
    // baris tapi lot fisiknya sama) — semua rak & minggu dari baris-baris
    // itu harus digabung jadi SATU lokasi sebelum dihitung/ditampilkan.
    const rawLokasi = rows.map((r) => {
      const rackSlots = [r.rackcode1, r.rackcode2, r.rackcode3, r.rackcode4]
        .map((rc) => (rc || "").trim())
        .filter(Boolean);
      const fglocItem = (r.item || "").trim();

      let allRacks = rackSlots.map((rc) => {
        const isi = rackMap.get(rc) || [];
        // Prioritas: qty item yang lagi dicari. Kalau ternyata rak ini
        // (menurut tabel `rack`) isinya item lain — data fgloc.item vs
        // rack.item beda (mismatch/data drift) — tetep tampilkan qty
        // total rak itu dan tandai `sesuai: false` biar ketauan ada
        // selisih.
        const isiItemIni = isi.filter((c) => c.item === kode);
        const qtyItemIni = isiItemIni.reduce((s, c) => s + c.qty, 0);
        const qtyTotalRak = isi.reduce((s, c) => s + c.qty, 0);
        const sesuai = isi.length === 0 || isiItemIni.length === isi.length;
        const kategoriList = [
          ...new Set(
            (isiItemIni.length ? isiItemIni : isi).map((c) => c.kategori),
          ),
        ];

        return {
          rackcode: rc,
          qty: isiItemIni.length ? qtyItemIni : qtyTotalRak,
          kategori: kategoriList.length ? kategoriList.join(", ") : "-",
          kategoriList,
          terverifikasi: isi.length > 0,
          sesuai,
          // Rak ini kebukti (dari tabel rack) beneran isi item yang lagi
          // dicari? Dipakai buat nyaring noise di baris hasil jalur B.
          isiItemDicari: isiItemIni.length > 0,
          // curweek rak ini = curweek dari entri dengan qty TERBESAR (entri
          // di sini udah per item+probcode, dan tiap entri sendiri udah
          // bawa curweek mayoritas dari _getRackContents). Kalau qty-nya
          // sama besar, ambil yang paling tua biar deterministik.
          curweek: (() => {
            const kandidat = (isiItemIni.length ? isiItemIni : isi).filter(
              (c) => c.curweek,
            );
            if (!kandidat.length) return "";
            return [...kandidat].sort((a, b) => {
              if (b.qty !== a.qty) return b.qty - a.qty;
              return a.curweek.localeCompare(b.curweek);
            })[0].curweek;
          })(),
        };
      });

      // Cuma rackcode yang KEBUKTI FISIK isinya item yang lagi dicari yang
      // ditampilin — slot kosong (belum ada rak terverifikasi) dan slot
      // yang isinya item lain (anomali/mismatch) di-skip semua, gak usah
      // ditampilin ke user. Berlaku sama buat baris "asli" maupun baris
      // hasil jalur drift (B).
      allRacks = allRacks.filter((x) => x.isiItemDicari);

      return {
        whscode: (r.whscode || "").trim(),
        locblock: (r.locblock || "").trim(),
        loccol: (r.loccol || "").trim(),
        loccode: (r.loccode || "").trim(),
        maxrack: r.maxrack,
        obstacle: r.obstacle,
        fglocItem,
        allRacks,
      };
    });

    // Tahap 2: gabung berdasarkan loccol (lot) — lot yang sama disatuin
    // jadi 1 lokasi, rak & minggunya digabung semua di 1 tempat.
    const groupedByLoccol = new Map();
    rawLokasi.forEach((loc) => {
      const key = loc.loccol || `__nolot__${loc.whscode}-${loc.locblock}`;
      if (!groupedByLoccol.has(key)) {
        groupedByLoccol.set(key, {
          whscode: loc.whscode,
          locblock: loc.locblock,
          loccol: loc.loccol,
          loccode: loc.loccode,
          maxrack: loc.maxrack,
          obstacle: loc.obstacle,
          allRacks: [],
          _rackcodeSeen: new Set(),
          itemTerdaftarLain: new Set(),
        });
      }
      const grup = groupedByLoccol.get(key);
      // maxrack dipakai yang paling besar antar baris yang digabung (biar
      // "jumlah rak / maxrack" tetap masuk akal).
      if ((loc.maxrack || 0) > (grup.maxrack || 0)) grup.maxrack = loc.maxrack;
      if (loc.obstacle) grup.obstacle = loc.obstacle;
      // Kalau baris fgloc ini "resminya" terdaftar buat item LAIN (bukan
      // item yang lagi dicari) — berarti lot ini ke-tarik lewat Tahap B
      // (data drift). Catet biar bisa dikasih tanda di hasil akhir.
      if (loc.fglocItem && loc.fglocItem !== kode) {
        grup.itemTerdaftarLain.add(loc.fglocItem);
      }
      loc.allRacks.forEach((rack) => {
        // Dedupe per rackcode — 1 rackcode fisik cuma dihitung sekali
        // walau kebetulan muncul di lebih dari 1 baris fgloc yang digabung.
        if (grup._rackcodeSeen.has(rack.rackcode)) return;
        grup._rackcodeSeen.add(rack.rackcode);
        grup.allRacks.push(rack);
      });
    });

    const lokasi = [...groupedByLoccol.values()]
      .map((grup) => {
        const allRacks = grup.allRacks;

        // Dominan kategori lokasi ini (dihitung dari SEMUA rak gabungan,
        // sebelum difilter) — dipakai buat warna badge lokasi: hijau=OK,
        // kuning/OE=oranye, campur=ungu, kosong (gak ada rak)=abu-abu.
        const semuaKategori = new Set(
          allRacks.flatMap((x) => x.kategoriList).filter((k) => k !== "-"),
        );
        let dominantKategori = "KOSONG";
        if (semuaKategori.size > 1) dominantKategori = "MIXED";
        else if (semuaKategori.has("OE")) dominantKategori = "OE";
        else if (semuaKategori.has("OK")) dominantKategori = "OK";

        // whsweek lokasi = curweek PALING TUA di antara SEMUA rak gabungan
        // yang ngisi lot ini (dihitung dari semua rak, sebelum difilter
        // kategori, biar konsisten sama dominantKategori di atas). Ini
        // yang bikin "minggu" per lot jadi satu nilai gabungan, bukan
        // kepencar per baris fgloc lagi.
        // Kalau lot ini isinya campur >1 week beda, kasih tau week
        // termudanya juga (whsweek_termuda) — biar UI bisa nampilin
        // "2630 s/d 2632", sama kayak pola di Control FIFO.
        const semuaCurweekSet = new Set(
          allRacks.map((x) => x.curweek).filter(Boolean),
        );
        const semuaCurweekSorted = [...semuaCurweekSet].sort();
        const whsweek = semuaCurweekSorted.length ? semuaCurweekSorted[0] : "";
        const whsweekTermuda =
          semuaCurweekSorted.length > 1
            ? semuaCurweekSorted[semuaCurweekSorted.length - 1]
            : "";

        // Terapkan filter (kalau ada) — level rak, bukan level lokasi.
        const racks = filterKategori
          ? allRacks.filter((x) => x.kategoriList.includes(filterKategori))
          : allRacks;

        const qtyLokasi = racks.reduce((s, x) => s + (x.qty || 0), 0);

        return {
          whscode: grup.whscode,
          locblock: grup.locblock,
          loccol: grup.loccol,
          loccode: grup.loccode,
          whsweek,
          whsweek_termuda: whsweekTermuda || undefined,
          maxrack: grup.maxrack,
          obstacle: grup.obstacle,
          dominant_kategori: dominantKategori,
          jumlah_rak: racks.length,
          qty_lokasi: qtyLokasi,
          racks,
          item_terdaftar_lain: [...grup.itemTerdaftarLain],
        };
      })
      // Buang lokasi yang gak ada rak sama sekali yang beneran isi item
      // ini (abis difilter di atas) — dan/atau kalau filter kategori aktif,
      // buang juga lokasi yang gak sisa rak setelah difilter kategori.
      .filter((loc) => loc.racks.length > 0)
      // whsweek baru ketauan setelah data `rack` digabung (gak bisa lagi
      // ORDER BY di level SQL fgloc), jadi sorting akhir "paling tua
      // duluan" dilakukan di sini. Lokasi tanpa whsweek (gak ada rak
      // terverifikasi sama sekali) ditaruh paling belakang.
      .sort((a, b) => {
        if (!a.whsweek && !b.whsweek) return a.loccol.localeCompare(b.loccol);
        if (!a.whsweek) return 1;
        if (!b.whsweek) return -1;
        return a.whsweek.localeCompare(b.whsweek);
      });

    lokasi.forEach((loc) => {
      totalRakGlobal += loc.jumlah_rak;
      totalQtyGlobal += loc.qty_lokasi;
    });

    return {
      item: kode,
      deskripsi,
      filter_kategori: filterKategori || "ALL",
      summary: {
        total_lokasi: lokasi.length,
        total_rak: totalRakGlobal,
        total_qty: totalQtyGlobal,
      },
      lokasi,
      // Section: unit item ini yang masih nyangkut di rackcode "~" (belum
      // pernah ke-scan ke rak fisik sama sekali).
      belum_masuk_lot: belumMasukLot,
      // Section: rak yang UDAH FISIK ke-scan & isi item ini, tapi
      // rackcode-nya belum ke-assign ke slot manapun di fgloc (belum
      // punya loccode/lot).
      rak_belum_masuk_lot: rakBelumMasukLot,
    };
  }
}

module.exports = ControlStockModel;
