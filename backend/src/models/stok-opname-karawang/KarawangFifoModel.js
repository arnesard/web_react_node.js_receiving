// src/models/stok-opname-karawang/KarawangFifoModel.js
// Fitur "Control FIFO" (khusus DC Karawang / Cross Docking) — kebalikan
// dari alur biasa: input-nya ITEM (dicari dari deskripsi ATAU kode),
// hasilnya SEMUA LOT (lokasi) tempat item itu berada di Cross Docking,
// lengkap qty & jumlah rak per lot (plus detail per-rakcode), diurutkan
// dari week paling tua.
//
// Sumber data: API "Monitoring Stock Cross Docking" (lihat
// services/crossDockingClient.js) — endpoint /stock-cd/detail-all, yang
// balikin 1 baris = 1 unit/pcs, lengkap field rackcode, item, curweek
// (format YYWW), loccode (lot/lokasi), probcode (kategori OK/OE).
//
// BEDA dengan ControlStockModel (modul "Control Stock" gudang utama):
// itu narik langsung dari db pandu (fgloc + rack, join manual). Di sini
// datanya udah "flat" per unit dari API Cross Docking, jadi tinggal
// dikelompokkan per loccode — gak perlu join fgloc lagi.
//
// PENTING soal filter item: API Cross Docking (/stock-cd/detail-all)
// match parameter `item` pakai PREFIX, BUKAN exact — search "IBD1001"
// ikut kebalikin baris item lain yang prefix-nya sama, mis. "IBD1001SP"
// (web Cross Docking aslinya juga begitu, bukan bug di sini). Makanya
// WAJIB difilter ULANG persis (exact match, case-insensitive) di sisi
// kita sebelum dikelompokkan, biar item "IBD1001" gak kecampur sama
// "IBD1001SP".
const CrossDockingClient = require("../../services/crossDockingClient");
const KarawangEdpModel = require("./KarawangEdpModel");
const { getField } = require("../../utils/apiField");
const { enrichWithBcCollie } = require("../../utils/bcCollieEnrichment");
const { poolCrossDocking } = require("../../config/database");

// Urutan bantu: curweek "YYWW" ASC (kosong ditaruh paling belakang).
function compareWeekAsc(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

class KarawangFifoModel {
  // Cari semua lot (loccode) tempat 1 item berada di Cross Docking DC
  // Karawang, dikelompokkan per loccode (+ detail per rackcode di
  // dalamnya), diurutkan week paling tua duluan.
  //
  // `filterMode`: "all" | "hold" | "oe" — diteruskan apa adanya ke API
  // Cross Docking (sama seperti dipakai halaman Monitoring Stock Cross
  // Docking), jadi filter kategori/hold-nya konsisten dengan halaman itu.
  static async locationsByItem(itemCode, filterMode = "all") {
    const kode = (itemCode || "").trim();
    if (!kode) return null;
    const kodeUpper = kode.toUpperCase();

    const rawRows = await CrossDockingClient.fetchDetailAll({
      item: kode,
      filterMode: filterMode || "all",
    });

    const deskripsi = await KarawangEdpModel.descriptionForItem(kode);

    // Filter ulang exact match — lihat catatan panjang di atas.
    const rows = (rawRows || []).filter((row) => {
      const rowItem = (getField(row, "item") || "").toString().trim();
      return rowItem.toUpperCase() === kodeUpper;
    });

    if (!rows.length) {
      return {
        item: kode,
        deskripsi,
        filter_mode: filterMode || "all",
        summary: { total_lot: 0, total_rak: 0, total_qty: 0 },
        lokasi: [],
      };
    }

    // Kelompokkan tiap baris (1 baris = 1 unit/pcs) per loccode (lot),
    // dan di dalam tiap lot dikelompokkan lagi per rackcode (buat detail
    // "lot ini isinya rak apa aja").
    const groupedByLot = new Map();
    rows.forEach((row) => {
      const loccode = (getField(row, "loccode") || "").toString().trim();
      const rackcode = (getField(row, "rackcode") || "").toString().trim();
      const curweek = (getField(row, "curweek") || "").toString().trim();
      const probcodeRaw = (getField(row, "probcode") || "").toString().trim();
      const kategori = probcodeRaw ? probcodeRaw.toUpperCase() : "OK";

      const lotKey = loccode || "__tanpa_lokasi__";
      if (!groupedByLot.has(lotKey)) {
        groupedByLot.set(lotKey, {
          loccode: loccode || "-",
          qty: 0,
          kategoriSet: new Set(),
          weekSet: new Set(),
          rackMap: new Map(),
        });
      }
      const grupLot = groupedByLot.get(lotKey);
      grupLot.qty += 1;
      if (kategori) grupLot.kategoriSet.add(kategori);
      if (curweek) grupLot.weekSet.add(curweek);

      const rackKey = rackcode || "__tanpa_rak__";
      if (!grupLot.rackMap.has(rackKey)) {
        grupLot.rackMap.set(rackKey, {
          rackcode: rackcode || "-",
          qty: 0,
          kategoriSet: new Set(),
          weekSet: new Set(),
        });
      }
      const grupRak = grupLot.rackMap.get(rackKey);
      grupRak.qty += 1;
      if (kategori) grupRak.kategoriSet.add(kategori);
      if (curweek) grupRak.weekSet.add(curweek);
    });

    let totalRakGlobal = 0;
    let totalQtyGlobal = 0;

    const lokasi = [...groupedByLot.values()]
      .map((grupLot) => {
        // week lot ini = week PALING TUA di antara semua unit yang ngisi
        // lot itu (sortir string YYWW ASC — aman karena formatnya udah
        // fixed 2 digit tahun + 2 digit minggu).
        const weeksSorted = [...grupLot.weekSet].sort();
        const week = weeksSorted.length ? weeksSorted[0] : "";
        const weekTermuda =
          weeksSorted.length > 1 ? weeksSorted[weeksSorted.length - 1] : "";

        const dominantKategori =
          grupLot.kategoriSet.size > 1
            ? "MIXED"
            : grupLot.kategoriSet.size === 1
              ? [...grupLot.kategoriSet][0]
              : "OK";

        // Detail per rackcode di dalam lot ini — dipakai buat expand
        // "lot X isinya rak apa aja" di frontend. Diurut week paling tua
        // duluan, sama kayak urutan lot di luar.
        const racks = [...grupLot.rackMap.values()]
          .map((grupRak) => {
            const rakWeeksSorted = [...grupRak.weekSet].sort();
            return {
              rackcode: grupRak.rackcode,
              qty: grupRak.qty,
              kategori: [...grupRak.kategoriSet].join(", ") || "-",
              curweek: rakWeeksSorted.length ? rakWeeksSorted[0] : "",
              curweek_termuda:
                rakWeeksSorted.length > 1
                  ? rakWeeksSorted[rakWeeksSorted.length - 1]
                  : undefined,
            };
          })
          .sort(
            (a, b) =>
              compareWeekAsc(a.curweek, b.curweek) ||
              a.rackcode.localeCompare(b.rackcode),
          );

        totalRakGlobal += racks.length;
        totalQtyGlobal += grupLot.qty;

        return {
          loccode: grupLot.loccode,
          week,
          // Kalau lot ini isinya campur >1 week, kasih tau week
          // termudanya juga (buat UI nampilin "2601 s/d 2609" mis.).
          week_termuda: weekTermuda || undefined,
          jumlah_rak: racks.length,
          qty: grupLot.qty,
          dominant_kategori: dominantKategori,
          racks,
        };
      })
      // Urutan utama: week paling tua duluan. Lot tanpa week (jarang
      // terjadi, data tidak lengkap dari sumbernya) ditaruh paling
      // belakang, bukan dianggap paling tua.
      .sort(
        (a, b) =>
          compareWeekAsc(a.week, b.week) || a.loccode.localeCompare(b.loccode),
      );

    return {
      item: kode,
      deskripsi,
      filter_mode: filterMode || "all",
      summary: {
        total_lot: lokasi.length,
        total_rak: totalRakGlobal,
        total_qty: totalQtyGlobal,
      },
      lokasi,
    };
  }

  // Cari 1 barcode spesifik di Cross Docking DC Karawang — dipakai tombol
  // "Search Barcode" di Control FIFO buat operator yang megang 1 barcode
  // fisik (mis. abis discan) dan mau tau: barang ini ada di rak/lot mana,
  // dan collie (koli) apa. 1 barcode = 1 unit/pcs, jadi normalnya cuma
  // ketemu 1 baris (tapi tetep ditangani sebagai array, jaga-jaga kalau
  // suatu saat ada duplikat data di sumbernya).
  //
  // 3 tingkat, dari tercepat ke paling berat:
  //   1) LANGSUNG KE DB (poolCrossDocking, fginvc_cd.rack_cd) — gak ada
  //      login/HTTP round-trip kayak lewat REST API, jadi jauh lebih
  //      responsif. Ini jalur utama; kalau tabelnya beneran punya kolom
  //      collie sendiri, bahkan gak perlu nyentuh REST API sama sekali.
  //   2) REST API filter `barcode` — fallback kalau query DB di atas
  //      error (mis. jaringan ke DB lagi bermasalah) atau kolomnya
  //      ternyata beda dari dugaan (0 hasil).
  //   3) REST API tarik SEMUA data lalu disaring sendiri — fallback
  //      terakhir, KETAHUAN dari pengetesan manual parameter `barcode`
  //      di /stock-cd/detail-all gak selalu beneran difilter di server
  //      sumbernya. Ini query BERAT, sengaja paling akhir.
  static async searchByBarcode(barcodeCode) {
    const kode = (barcodeCode || "").trim();
    if (!kode) return null;
    const kodeUpper = kode.toUpperCase();

    const matchExact = (list) =>
      (list || []).filter((row) => {
        const rowBarcode = (getField(row, "barcode") || "").toString().trim();
        return rowBarcode.toUpperCase() === kodeUpper;
      });

    // Jalur 1: query langsung ke DB. `dbRows` sengaja dibedain null (gagal
    // konek/error query) vs [] (konek sukses, cuma emang 0 baris) — biar
    // "0 baris" gak salah ke-anggap error terus buang-buang waktu nyoba
    // REST API juga (tetep lanjut ke jalur 2/3 di bawah kalau 0 baris,
    // cuma gak nge-log error/dianggap koneksi bermasalah).
    //
    // Kolom barcode di tabel ini namanya `bc_entried` (dikonfirmasi
    // langsung), BUKAN `barcode` — di-alias `AS barcode` di SELECT biar
    // kode di bawah (getField(row, "barcode")) tetep jalan tanpa perlu
    // diubah lagi.
    let rows = [];
    try {
      const [dbRows] = await poolCrossDocking.query(
        `SELECT *, bc_entried AS barcode FROM fginvc_cd.rack_cd WHERE bc_entried = ? LIMIT 50`,
        [kode],
      );
      rows = matchExact(dbRows);
    } catch (err) {
      console.error(
        "KarawangFifoModel.searchByBarcode: query langsung ke fginvc_cd.rack_cd gagal, fallback ke REST API Cross Docking:",
        err,
      );
    }

    // Jalur 2: REST API, filter `barcode` (cepat kalau kebetulan server
    // sumbernya beneran nyaring).
    if (!rows.length) {
      rows = matchExact(
        await CrossDockingClient.fetchDetailAll({ barcode: kode }),
      );
    }

    // Jalur 3: REST API, tarik semua data (BERAT) lalu disaring sendiri.
    if (!rows.length) {
      const allRows = await CrossDockingClient.fetchDetailAll({
        detail: true,
      });
      rows = matchExact(allRows);
    }

    if (!rows.length) return null;

    // Nama kolom collie/koli di tabel `rack_cd`: `bc_entried_prod`
    // (dikonfirmasi langsung). Kandidat lain dibiarin sebagai fallback,
    // jaga-jaga kalau suatu saat sumbernya berubah nama kolom.
    const COLLIE_COLUMN_CANDIDATES = [
      "bc_entried_prod",
      "bc_collie",
      "collie",
      "koli",
      "no_koli",
    ];
    const pickCollieFromRow = (row) => {
      for (const col of COLLIE_COLUMN_CANDIDATES) {
        const val = getField(row, col);
        if (val !== undefined && val !== null && String(val).trim() !== "") {
          return String(val).trim();
        }
      }
      return undefined;
    };

    // Kalau SEMUA baris hasil jalur 1 (DB) udah bawa kolom collie sendiri,
    // gak perlu enrichment REST sama sekali — full-speed, 0 panggilan API
    // luar. Kalau ada yang belum (mis. hasil dari jalur 2/3 REST, yang
    // emang gak punya bc_collie), baru enrichment dipanggil buat SEMUA
    // baris (biar konsisten, bukan campur sebagian dari kolom DB sebagian
    // dari REST).
    const allRowsAlreadyHaveCollie = rows.every(
      (row) => pickCollieFromRow(row) !== undefined,
    );

    let enrichedRows = rows;
    if (!allRowsAlreadyHaveCollie) {
      const enrichResult = await enrichWithBcCollie(rows, {
        maxPairs: null,
        concurrency: 4,
      });
      enrichedRows = enrichResult.rows;
    }

    const results = await Promise.all(
      enrichedRows.map(async (row) => {
        const item = (getField(row, "item") || "").toString().trim();
        const probcodeRaw = (getField(row, "probcode") || "")
          .toString()
          .trim();
        return {
          barcode: (getField(row, "barcode") || "").toString().trim(),
          item,
          deskripsi: await KarawangEdpModel.descriptionForItem(item),
          rackcode: (getField(row, "rackcode") || "").toString().trim() || "-",
          loccode: (getField(row, "loccode") || "").toString().trim() || "-",
          curweek: (getField(row, "curweek") || "").toString().trim(),
          kategori: probcodeRaw ? probcodeRaw.toUpperCase() : "OK",
          collie: pickCollieFromRow(row) || "-",
          lastupdated: getField(row, "lastupdated") || null,
        };
      }),
    );

    return results;
  }
}

module.exports = KarawangFifoModel;
