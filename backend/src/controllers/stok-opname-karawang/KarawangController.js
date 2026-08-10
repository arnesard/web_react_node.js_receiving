// src/controllers/stok-opname-karawang/KarawangController.js
// Modul "Stok Opname DC Karawang". Alur (Agustus 2026, versi full-live —
// GAK ADA LAGI HALAMAN/STEP UPLOAD SAMA SEKALI): batch aktif dibikin
// otomatis pas operator buka halaman scan (lihat getActiveBatch), gak
// butuh input manual apa pun sebelum mulai. Operator scan RAK → divalidasi
// LANGSUNG ke API Cross Docking: rackcode harus ketemu di sana, DAN lokasi
// (loccol) yang diinput operator harus cocok sama field `loccode` versi
// Cross Docking (live, bukan dari tabel lokal lagi) — lihat scanRak. Lalu
// scan COLLIE (kode fisik yang cuma ada pas scan lapangan, divalidasi LIVE
// ke API Cross Docking) → tiap collie yang ketemu di Cross Docking itu
// baru disimpan sebagai hasil opname, dengan item/qty/kategori DIAMBIL
// DARI Cross Docking. Data target (qty per item) di dashboard juga
// dihitung LIVE dari Cross Docking (dicache singkat, lihat dashboard()),
// scoped ke rackcode-rackcode yang UDAH discan di batch ini — SENGAJA gak
// pernah query Cross Docking tanpa filter sama sekali (lihat
// CrossDockingController: query tanpa filter dianggap kebanyakan beban
// buat server sumbernya).
//
// CATATAN: db pandu EDP (KarawangEdpModel) SUDAH GAK DIPAKAI lagi buat
// VERIFIKASI rak/collie ATAU buat data target — itu sepenuhnya API Cross
// Docking sekarang (lihat KarawangCrossDockingModel). db pandu masih
// dipanggil, tapi CUMA buat ambil deskripsi item (join
// bcmcfgv1.itemcatalog) — bukan buat nentuin sah/gaknya collie atau
// jumlah target. KarawangEdpModel juga masih dipakai penuh di fitur lain
// (Halaman Barcode).
//
// PENTING — efek samping yang perlu diketahui: KarawangTargetModel (tabel
// stok_opname_karawang_target) dan KarawangLokasiModel (tabel
// stok_opname_karawang_lokasi), hasil dari upload excel/manual jaman dulu,
// SEKARANG GAK PERNAH DIISI LAGI SAMA SEKALI karena gak ada upload/input
// manual lagi. Dashboard, scan rak, dan scan collie semua udah dipindah ke
// sumber Cross Docking / live, TAPI fitur "Halaman Barcode"
// (listBarcodeDetails, chart "Jumlah Barcode per In WH") MASIH baca dari
// tabel target itu — jadi fitur itu bakal selalu kosong sampai dipindah ke
// sumber lain juga (belum dikerjain di sini, di luar permintaan yang
// diminta).
const KarawangTargetModel = require("../../models/stok-opname-karawang/KarawangTargetModel");
const KarawangScanModel = require("../../models/stok-opname-karawang/KarawangScanModel");
const KarawangEdpModel = require("../../models/stok-opname-karawang/KarawangEdpModel");
const KarawangCrossDockingModel = require("../../models/stok-opname-karawang/KarawangCrossDockingModel");
const CrossDockingClient = require("../../services/crossDockingClient");
const { getField } = require("../../utils/apiField");
const { mapWithConcurrency } = require("../../utils/concurrency");
const { enrichWithBcCollie } = require("../../utils/bcCollieEnrichment");
const KarawangBatchModel = require("../../models/stok-opname-karawang/KarawangBatchModel");
const response = require("../../utils/response");
const {
  getKarantinaCutoff,
  isKarantinaCutoffManual,
  setKarantinaCutoff,
  clearKarantinaCutoff,
} = require("../../utils/karantinaCutoffStore");

// Belum ada auth/JWT di project ini (lihat catatan sama di modul lain).
function currentUserId(req) {
  return req.body?.id_karyawan || req.query?.id_karyawan || null;
}

function getInWhFromRackcode(rackcode) {
  const kode = String(rackcode || "").trim();
  const firstRackcode = kode.split(",")[0].trim();
  // Terima dua panjang: "T-2DDMMYY" (EDP, 6 digit) atau "T-2DDMMYYxxx"
  // (Cross Docking, ada 3 digit ekor/serial) — 3 digit ekor opsional.
  const match = firstRackcode.match(/^T\s*-\s*2(\d{6})(?:\d{3})?$/i);
  return match ? match[1] : "";
}

function getIsoWeekFromInWh(inWh) {
  const kode = String(inWh || "").trim();
  const match = kode.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (!match) return "";

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = 2000 + Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return "";
  }

  const thursday = new Date(date);
  const dayNumber = thursday.getUTCDay() || 7;
  thursday.setUTCDate(thursday.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  return Math.ceil(((thursday - yearStart) / 86400000 + 1) / 7);
}

// Cache dashboard per batch_id di memory proses backend (bukan per-user) —
// tujuannya biar 10 operator/atasan yang buka dashboard bareng-bareng buat
// batch yang SAMA gak masing-masing nembak Cross Docking sendiri-sendiri.
// TTL pendek (bukan snapshot permanen) karena datanya emang dimaksudkan
// live, cuma dibikin gak se-live-itu literally-setiap-request.
const DASHBOARD_CACHE_TTL_MS = 45 * 1000;
const dashboardCache = new Map(); // batch_id -> { expiresAt, data }

// Sandi buat tombol "Reset Data Scan" di Dashboard — sengaja hardcode
// simpel (project ini belum ada auth/login sama sekali, lihat catatan
// currentUserId di atas), tujuannya cuma nyegah kepencet gak sengaja,
// BUKAN keamanan beneran.
const TRUNCATE_SCAN_PASSWORD = "devbpw";

// Cache TERPISAH buat "Stok Semua Cross Docking" (item + qty/barcode se-DC,
// TANPA scope rackcode) — dasar target buat dashboard versi baru (compare
// ke SEMUA stok, bukan cuma rak yang udah discan). GAK PAKAI TTL yang
// auto-expire — sengaja cuma diisi/diganti kalau operator klik tombol
// "Refresh Data Cross Docking" secara eksplisit (lihat dashboardFull() +
// route-nya), soalnya query `/stock-cd/detail-all` TANPA FILTER ini bisa
// balikin puluhan ribu baris dan berat buat server sumbernya — kalau
// di-refresh otomatis tiap X menit / tiap dashboard dibuka, bisa berulang
// kali nembak Cross Docking tanpa operator sadar. Snapshot ini dipakai
// terus sampai ada yang klik refresh lagi (biarpun udah "basi" beberapa
// jam), itu trade-off yang sengaja dipilih demi gak ngebom server sumber.
let allStockCache = null; // { data, fetchedAt } — cuma 1 entry, gak per-batch
let allStockPromise = null; // biar request bareng-bareng numpang 1 query aja
// Layer MENTAH (network+db) di-cache TERPISAH dari allStockCache di atas —
// allStockCache itu hasil OLAHAN (udah displit stok normal vs karantina
// pakai cutoff tertentu), sedangkan rawStockCache nyimpen rows Cross
// Docking + hasil enrichment lastupdated + deskripsi item APA ADANYA
// (belum peduli cutoff). Dipisah supaya kalau operator ganti cutoff lewat
// tombol gear, dashboard bisa langsung kehitung ulang PAKAI DATA YANG SAMA
// (murah, cuma loop JS) TANPA perlu nembak ulang Cross Docking (mahal).
let rawStockCache = null; // { rows, lastUpdatedByBarcode, descrMap, fetched_at }

// Cache row-level buat Halaman Barcode versi live Cross Docking (barcode,
// rackcode, item per baris — beda dari allStockCache yang cuma nyimpen
// AGREGAT qty per item, gak per-barcode). Pola cache-nya SAMA kayak
// allStockCache: gak ada TTL auto-expire, cuma diisi/diganti pas operator
// klik tombol "Refresh Data Cross Docking" di halaman Barcode (query
// `/stock-cd/detail-all` TANPA filter itu berat buat server sumbernya).
let barcodeLiveCache = null; // { data } — data.items = array per-barcode
let barcodeLivePromise = null;

async function getBarcodeLiveData({ forceRefresh = false } = {}) {
  if (!forceRefresh && barcodeLiveCache) return barcodeLiveCache.data;
  if (barcodeLivePromise) return barcodeLivePromise;

  barcodeLivePromise = (async () => {
    const rows = await CrossDockingClient.fetchDetailAll({ detail: true });

    // Collie (bc_collie) gak ikut kebalikin di /stock-cd/detail-all, jadi
    // di-"tempelin" belakangan lewat enrichWithBcCollie (sama pola yang
    // dipake CrossDockingController buat export CSV) — TANPA batas maxPairs
    // (null), soalnya halaman ini emang cuma nembak Cross Docking pas
    // operator eksplisit klik "Refresh Data Cross Docking" (bukan tiap buka
    // halaman), jadi wajar kalau agak lama. Beda dari bc_collie, lokasi
    // (loccode) UDAH ikut kebalikin di /stock-cd/detail-all sendiri, jadi
    // gak perlu enrichment tambahan buat itu.
    const { rows: enrichedRows } = await enrichWithBcCollie(rows || [], {
      maxPairs: null,
      concurrency: 10,
    });

    const itemSet = new Set();
    const barcodeSet = new Set();
    const rawRows = (enrichedRows || [])
      .map((row) => {
        const item = (getField(row, "item") || "").toString().trim();
        if (!item) return null;
        itemSet.add(item);
        const rackcode = (getField(row, "rackcode") || "").toString().trim();
        const barcodeRaw = getField(row, "barcode");
        const barcode =
          barcodeRaw !== undefined && barcodeRaw !== null
            ? String(barcodeRaw).trim()
            : "";
        if (barcode) barcodeSet.add(barcode);
        const loccolRaw = getField(row, "loccode");
        const lokasi =
          loccolRaw !== undefined && loccolRaw !== null
            ? String(loccolRaw).trim()
            : "";
        const collieRaw = getField(row, "bc_collie");
        const collie =
          collieRaw !== undefined && collieRaw !== null
            ? String(collieRaw).trim()
            : "";
        return {
          item,
          rackcode,
          barcode,
          lokasi,
          collie,
        };
      })
      .filter(Boolean);

    let descrMap = new Map();
    try {
      descrMap = await KarawangEdpModel.descriptionsForItems([...itemSet]);
    } catch (err) {
      console.error(
        "getBarcodeLiveData: gagal ambil deskripsi dari db pandu:",
        err,
      );
    }

    // "transfer": rackcode versi DB-PANDU EDP (bukan Cross Docking), dicari
    // per barcode lewat fginvc.rack (bc_entried / bc_entried_prod). Beda dari
    // `rak` yang tetap dari Cross Docking. Barcode yang gak ketemu di EDP
    // (misal collie sudah keluar rak / gak ada fisiknya) transfer-nya "-".
    let edpRackMap = new Map();
    try {
      edpRackMap = await KarawangEdpModel.rackDetailsByBarcode([...barcodeSet]);
    } catch (err) {
      console.error(
        "getBarcodeLiveData: gagal ambil rackcode dari db pandu:",
        err,
      );
    }

    const items = rawRows.map((r) => {
      const transfer = edpRackMap.get(r.barcode)?.rackcodes || "";
      // In WH & Week dihitung dari Transfer (rackcode versi EDP, format
      // T-2DDMMYY), BUKAN dari rackcode Cross Docking (`rak`) — itu kode
      // lokasi rak fisik (mis. "BRH12358"), gak ngandung tanggal.
      const inWh = getInWhFromRackcode(transfer);
      return {
        rak: r.rackcode || "-",
        barcode: r.barcode || "-",
        collie: r.collie || "-",
        lokasi: r.lokasi || "-",
        item: r.item,
        deskripsi: descrMap.get(r.item) || "-",
        transfer: transfer || "-",
        in_wh: inWh || "-",
        week: inWh ? getIsoWeekFromInWh(inWh) || "-" : "-",
      };
    });

    const data = {
      items,
      total_item: itemSet.size,
      total_barcode: items.length,
      fetched_at: new Date().toISOString(),
    };
    barcodeLiveCache = { data };
    return data;
  })();

  try {
    return await barcodeLivePromise;
  } finally {
    barcodeLivePromise = null;
  }
}

// Hitung target (qty per item) LIVE dari Cross Docking, scoped ke
// rackcode-rackcode yang ada di lokasi batch ini — dicache singkat (lihat
// DASHBOARD_CACHE_TTL_MS) biar banyak orang buka dashboard bareng-bareng
// gak masing-masing nembak Cross Docking sendiri-sendiri.
async function getLiveTarget(batchId) {
  const cached = dashboardCache.get(batchId);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  // Scope-nya rak-rak yang UDAH discan di batch ini — dulu scope-nya dari
  // tabel lokasi hasil upload manual, sekarang gak ada lagi upload-nya,
  // jadi dashboard nampilin target utk rak yang emang udah dikunjungi
  // operator (SENGAJA tetep discope, bukan query Cross Docking tanpa
  // filter sama sekali, lihat catatan di atas).
  const rackcodes = await KarawangScanModel.distinctRackcodes(batchId);
  const qtyPerItem = new Map(); // item -> qty (jumlah baris pcs)

  // Concurrency dibatasi (bukan tembak semua rak sekaligus) — konsisten
  // sama pola yang udah dipake di enrichWithBcCollie/verifyCollie, biar
  // gak ngebom server Cross Docking meski scope-nya udah difilter per
  // rackcode (BUKAN query tanpa filter sama sekali).
  await mapWithConcurrency(rackcodes, 8, async (rackcode) => {
    let rows;
    try {
      rows = await CrossDockingClient.fetchDetailAll({ rackcode });
    } catch (err) {
      console.error(
        `getLiveTarget: gagal ambil detail-all rak ${rackcode} dari Cross Docking:`,
        err,
      );
      return;
    }
    (rows || []).forEach((row) => {
      const item = (getField(row, "item") || "").toString().trim();
      if (!item) return;
      qtyPerItem.set(item, (qtyPerItem.get(item) || 0) + 1);
    });
  });

  const items = [...qtyPerItem.keys()];
  let descrMap = new Map();
  try {
    descrMap = await KarawangEdpModel.descriptionsForItems(items);
  } catch (err) {
    console.error("getLiveTarget: gagal ambil deskripsi dari db pandu:", err);
  }

  const target = items.map((item) => ({
    item,
    deskripsi: descrMap.get(item) || "-",
    qty_target: qtyPerItem.get(item),
  }));

  const data = {
    target,
    total_item: items.length,
    total_qty_target: target.reduce((sum, t) => sum + t.qty_target, 0),
  };
  dashboardCache.set(batchId, {
    expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS,
    data,
  });
  return data;
}

// Ambil SEMUA item yang ada di Cross Docking se-DC (TANPA scope rackcode)
// — dasar target buat dashboard versi "compare ke semua stok". BEDA dari
// getLiveTarget: itu di-scope ke rak yang udah discan di 1 batch, ini gak
// di-scope sama sekali. `forceRefresh: true` cuma dipanggil dari tombol
// Refresh di UI (lihat dashboardFull di bawah) — kalau enggak, fungsi ini
// SELALU balikin snapshot cache terakhir (bisa null kalau belum pernah
// di-refresh sama sekali), TIDAK PERNAH nembak Cross Docking sendiri.
//
// Sengaja gak nyimpen array barcode per item di sini (cuma jumlahnya) —
// item bisa punya ribuan barcode, gak perlu dikirim semua ke frontend
// buat ditampilin, cuma bikin payload gede tanpa guna (lihat juga
// dashboardFull: yang ditampilin di UI level item cuma qty, bukan daftar
// barcode-nya satu-satu).
// Detail All bulk (/stock-cd/detail-all) TERBUKTI gak ikut ngebalikin field
// lastupdated (dicek langsung 08/08/2026 — cuma ada rackcode, barcode,
// whsweek, curweek, probcode, item, jdge, txtnote, loccode, hold_reasonX).
// lastupdated CUMA ada di endpoint detail per rackcode+item
// (/stock-cd/detail, sama endpoint yang dipake enrichWithBcCollie buat
// bc_collie) — jadi caranya SAMA: kumpulin pasangan rackcode+item unik,
// query /stock-cd/detail buat tiap pasangan (dibatasi concurrency), lalu
// cocokin balik ke tiap baris Detail All lewat barcode. Dipisah dari
// enrichWithBcCollie (bukan digabung) karena beda kebutuhan: ini dipakai
// buat SEMUA stok se-DC (getAllStock, unscoped), sedangkan bc_collie cuma
// dibutuhin pas export CSV / halaman Barcode.
async function getLastUpdatedMap(rows, { concurrency = 10 } = {}) {
  const pairs = new Map(); // "rackcode||item" -> { rackcode, item }
  (rows || []).forEach((row) => {
    const rackcode = getField(row, "rackcode");
    const item = getField(row, "item");
    if (rackcode && item) {
      pairs.set(`${rackcode}||${item}`, { rackcode, item });
    }
  });
  const uniquePairs = Array.from(pairs.values());
  const barcodeToLastUpdated = new Map();
  if (!uniquePairs.length) return barcodeToLastUpdated;

  let failedPairs = 0;
  await mapWithConcurrency(uniquePairs, concurrency, async (pair) => {
    let detailRows;
    try {
      detailRows = await CrossDockingClient.fetchDetail(
        pair.rackcode,
        pair.item,
      );
    } catch (err) {
      failedPairs += 1;
      console.error(
        `getLastUpdatedMap: gagal ambil detail ${pair.rackcode}/${pair.item}:`,
        err,
      );
      return;
    }
    (detailRows || []).forEach((detailRow) => {
      const barcodeRaw = getField(detailRow, "barcode");
      const lastupdated = getField(detailRow, "lastupdated");
      if (barcodeRaw !== undefined) {
        barcodeToLastUpdated.set(String(barcodeRaw).trim(), lastupdated);
      }
    });
  });

  if (failedPairs > 0) {
    console.warn(
      `getLastUpdatedMap: ${failedPairs} dari ${uniquePairs.length} pasangan rackcode+item gagal diambil (barisnya tetap dianggap stok normal, bukan karantina, karena lastupdated-nya gak kebaca).`,
    );
  }

  return barcodeToLastUpdated;
}

async function getAllStock({ forceRefresh = false } = {}) {
  if (!forceRefresh && rawStockCache) {
    return computeAllStockData(rawStockCache, getKarantinaCutoff());
  }
  if (allStockPromise) return allStockPromise;

  allStockPromise = (async () => {
    const rows = await CrossDockingClient.fetchDetailAll({ detail: true });

    // Nembak /stock-cd/detail per pasangan rackcode+item unik buat narik
    // lastupdated (lihat komentar getLastUpdatedMap di atas) — ini yang
    // bikin "Refresh Data Cross Docking" makin lama dari sebelumnya,
    // tapi emang cuma jalan pas operator eksplisit klik Refresh, sama
    // kayak enrichment bc_collie di Halaman Barcode.
    const lastUpdatedByBarcode = await getLastUpdatedMap(rows);

    const allItemsForDescr = new Set();
    (rows || []).forEach((row) => {
      const item = (getField(row, "item") || "").toString().trim();
      if (item) allItemsForDescr.add(item);
    });
    let descrMap = new Map();
    try {
      descrMap = await KarawangEdpModel.descriptionsForItems([
        ...allItemsForDescr,
      ]);
    } catch (err) {
      console.error("getAllStock: gagal ambil deskripsi dari db pandu:", err);
    }

    rawStockCache = {
      rows,
      lastUpdatedByBarcode,
      descrMap,
      fetched_at: new Date().toISOString(),
    };

    return computeAllStockData(rawStockCache, getKarantinaCutoff());
  })();

  try {
    return await allStockPromise;
  } finally {
    allStockPromise = null;
  }
}

// Bagian MURAH (tanpa network/db call) — ambil data mentah yang udah
// di-cache (rawStockCache) lalu displit jadi stok normal vs karantina
// berdasarkan `cutoff` yang dikasih. Dipanggil ulang tiap ganti cutoff
// (lewat tombol gear) TANPA perlu fetch ulang ke Cross Docking.
function computeAllStockData(raw, cutoff) {
  const { rows, lastUpdatedByBarcode, descrMap } = raw;

  // item -> { qty } — dipisah 2 map: stok normal (perItem) vs yang kena
  // cutoff (karantinaPerItem). barcodeSet cuma dipakai buat ngitung
  // total_barcode unik (kartu ringkasan), gak ikut dibalikin per-item.
  const perItem = new Map();
  const karantinaPerItem = new Map();
  const totalBarcodeSet = new Set();
  // Set semua loccode unik yang ada di data ini — dipakai buat validasi
  // lokasi di step Scan (KarawangController.validasiLokasi) TANPA perlu
  // nembak Cross Docking terpisah tiap operator input lokasi. Tetap
  // diisi dari SEMUA baris (termasuk yang karantina), soalnya ini cuma
  // dipakai buat cek lokasi valid/enggak, bukan buat hitungan stok.
  const locationSet = new Set();
  let skippedNoLastUpdate = 0;
  (rows || []).forEach((row) => {
    const item = (getField(row, "item") || "").toString().trim();
    if (!item) return;
    const barcodeRaw = getField(row, "barcode");
    const barcode =
      barcodeRaw !== undefined && barcodeRaw !== null
        ? String(barcodeRaw).trim()
        : "";
    const loc = (getField(row, "loccode") || "").toString().trim();
    if (loc) locationSet.add(loc.toUpperCase());

    // lastupdated TERBUKTI gak ikut kebalikin di /stock-cd/detail-all
    // (dicek langsung 08/08/2026), jadi diambil dari lastUpdatedByBarcode
    // (hasil enrichment getLastUpdatedMap) lewat barcode baris ini. Kalau
    // barcode-nya gak ketemu di map / gagal diparse sebagai tanggal
    // valid, aman di-treat sebagai stok normal (bukan karantina) — jangan
    // sampai baris yang seharusnya kehitung stok malah "ilang" gara-gara
    // enrichment gagal buat pasangan rackcode+item itu.
    const lastUpdateRaw = barcode
      ? lastUpdatedByBarcode.get(barcode)
      : undefined;
    const lastUpdate = lastUpdateRaw ? new Date(lastUpdateRaw) : null;
    const isValidDate = lastUpdate && !Number.isNaN(lastUpdate.getTime());
    if (lastUpdateRaw && !isValidDate) skippedNoLastUpdate += 1;
    const isKarantina =
      isValidDate && lastUpdate.getTime() >= cutoff.getTime();

    const targetMap = isKarantina ? karantinaPerItem : perItem;
    if (!targetMap.has(item)) targetMap.set(item, { qty: 0 });
    targetMap.get(item).qty += 1;
    if (!isKarantina && barcode) totalBarcodeSet.add(barcode);
  });

  if (skippedNoLastUpdate > 0) {
    console.warn(
      `computeAllStockData: ${skippedNoLastUpdate} baris punya lastupdated tapi gagal diparse jadi tanggal (dianggap stok normal, bukan karantina). Cek format field lastupdated dari Cross Docking.`,
    );
  }

  const list = [...perItem.keys()]
    .map((item) => ({
      item,
      deskripsi: descrMap.get(item) || "-",
      qty: perItem.get(item).qty,
    }))
    .sort((a, b) => a.item.localeCompare(b.item));

  const karantina = [...karantinaPerItem.keys()]
    .map((item) => ({
      item,
      deskripsi: descrMap.get(item) || "-",
      qty: karantinaPerItem.get(item).qty,
    }))
    .sort((a, b) => a.item.localeCompare(b.item));

  const data = {
    items: list,
    total_item: list.length,
    total_qty: list.reduce((sum, t) => sum + t.qty, 0),
    total_barcode: totalBarcodeSet.size,
    locations: [...locationSet],
    karantina,
    total_karantina_item: karantina.length,
    total_karantina_qty: karantina.reduce((sum, t) => sum + t.qty, 0),
    karantina_cutoff: cutoff.toISOString(),
    karantina_cutoff_manual: isKarantinaCutoffManual(),
    fetched_at: raw.fetched_at,
  };
  allStockCache = { data };
  return data;
}

class KarawangController {
  // GET /api/stok-opname-karawang/batches
  async listBatches(req, res) {
    try {
      const batches = await KarawangBatchModel.listAll();
      return response.success(res, batches);
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  // GET /api/stok-opname-karawang/batches/active
  // Gak ada lagi step "mulai opname" manual (dulu lewat halaman Upload) —
  // batch aktif dibikin otomatis di sini kalau belum ada, karena target &
  // validasi lokasi sekarang full live dari Cross Docking, gak butuh data
  // yang diinput manual sebelum mulai scan.
  async getActiveBatch(req, res) {
    try {
      let batch = await KarawangBatchModel.findLatestActive();
      if (!batch) {
        batch = await KarawangBatchModel.create({
          nama_batch: `Opname ${new Date().toLocaleDateString("id-ID")}`,
          nama_file: null,
          id_karyawan_upload: currentUserId(req),
        });
      }
      return response.success(res, batch);
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  // POST /api/stok-opname-karawang/scan-rak
  // POST /api/stok-opname-karawang/validasi-lokasi
  // Step BARU sebelum scan rak: cek lokasi (loccol) yang diinput/discan
  // operator itu beneran ada di Cross Docking, sebelum lanjut ke scan rak.
  // Gak nembak Cross Docking sendiri (biar gak berat tiap operator input
  // lokasi) — pakai snapshot cache dari getAllStock (field `locations`),
  // yang sama dipakai/di-refresh lewat tombol "Refresh Data Cross Docking"
  // di halaman Dashboard/Cross Docking/Barcode.
  async validasiLokasi(req, res) {
    try {
      const { loccol } = req.body;
      if (!loccol) {
        return response.error(res, "loccol wajib diisi", 422);
      }
      const kode = String(loccol).trim();

      if (!allStockCache) {
        return res.status(409).json({
          status: "error",
          message:
            'Data Cross Docking belum pernah ditarik, jadi lokasi belum bisa divalidasi. Buka halaman Dashboard atau Cross Docking dan klik "Refresh Data Cross Docking" dulu.',
          data: null,
        });
      }

      const ada = (allStockCache.data.locations || []).includes(
        kode.toUpperCase(),
      );
      if (!ada) {
        return response.error(
          res,
          `Lokasi "${kode}" tidak ditemukan di Cross Docking (data terakhir ditarik: ${new Date(allStockCache.data.fetched_at).toLocaleString("id-ID")}). Cek lagi kode lokasinya.`,
          404,
        );
      }
      return response.success(res, { loccol: kode, valid: true });
    } catch (err) {
      console.error("KarawangController.validasiLokasi gagal:", err);
      return response.error(res, err.message);
    }
  }

  // Klik/scan kode rak dulu → validasi: (a) kebagian di lokasi yang
  // diinput operator pas mulai opname, (b) BENERAN ADA di API Cross
  // Docking (live) — kalau enggak, berarti rak ini gak dikenal Cross
  // Docking dan gak boleh lanjut ke scan collie sama sekali. Sekalian
  // tampilin progress rak tsb (sudah/berapa collie).
  async scanRak(req, res) {
    try {
      const { batch_id, rackcode, loccol } = req.body;
      if (!batch_id || !rackcode || !loccol) {
        return response.error(
          res,
          "batch_id, rackcode, dan loccol wajib diisi",
          422,
        );
      }
      const kode = String(rackcode).trim();
      const kodeLoccol = String(loccol).trim();

      let rakDiCrossDocking;
      try {
        rakDiCrossDocking = await KarawangCrossDockingModel.rackExists(kode);
      } catch (cdErr) {
        console.error("KarawangCrossDockingModel.rackExists gagal:", cdErr);
        return res.status(502).json({
          status: "error",
          message:
            "Gagal terhubung ke API Cross Docking. Coba lagi, atau hubungi IT kalau terus gagal.",
          data: null,
          cross_docking_unreachable: true,
        });
      }
      if (!rakDiCrossDocking) {
        return response.error(
          res,
          `Rak "${kode}" tidak ditemukan di Cross Docking. Cek lagi kode raknya.`,
          404,
        );
      }

      // Validasi lokasi: LIVE ke field loccode dari Cross Docking (bukan
      // lagi ke tabel lokal hasil upload) — rak ini beneran kebagian di
      // lokasi "kodeLoccol" MENURUT Cross Docking sekarang.
      const cocokLokasi = rakDiCrossDocking.locations.some(
        (loc) => loc.toUpperCase() === kodeLoccol.toUpperCase(),
      );
      if (!cocokLokasi) {
        return response.error(
          res,
          `Rak "${kode}" tidak ada di lokasi "${kodeLoccol}" menurut Cross Docking. Cek lagi kode raknya, atau ganti lokasi kalau memang mau pindah.`,
          422,
        );
      }

      const sudahDiscanCollie = await KarawangScanModel.countByRak(
        batch_id,
        kode,
      );
      const sudahDiscanQty = await KarawangScanModel.sumQtyByRak(
        batch_id,
        kode,
      );
      const totalQtyTarget = rakDiCrossDocking.qty;
      const itemDiRak = rakDiCrossDocking.items;

      return response.success(res, {
        rackcode: kode,
        loccol: kodeLoccol,
        item_di_rak: itemDiRak,
        // Progress utama: pcs (qty), bukan jumlah collie — data target dari
        // excel gak punya info collie yang reliable (cuma daftar barcode
        // per-baris, gak ada relasi collie-ke-banyak-pcs kayak di EDP).
        total_qty_target: totalQtyTarget,
        total_qty_scanned: sudahDiscanQty,
        // Jumlah collie discan tetep dikirim buat info di UI, TANPA target
        // pembandingnya.
        total_collie_scanned: sudahDiscanCollie,
        scan_list: await KarawangScanModel.listByRak(batch_id, kode),
        // Dikirim balik biar frontend bisa nyimpen & kirim ulang lewat
        // body scan-collie (field `items_cross_docking`) — biar gak perlu
        // manggil rackExists() dua kali (sekali di sini, sekali lagi di
        // scanCollie) buat rak yang sama.
        items_cross_docking: rakDiCrossDocking.items,
      });
    } catch (err) {
      console.error("KarawangController.scanRak gagal:", err);
      return response.error(res, err.message);
    }
  }

  // POST /api/stok-opname-karawang/scan-collie
  // Validasi sebelum disimpan: LIVE ke API Cross Docking — collie ini
  // beneran ada & isinya apa/berapa SEKARANG (item, qty, kategori/probcode
  // SEMUA diambil dari Cross Docking, bukan dari excel maupun db pandu).
  // TIDAK disandingin ke data target excel ("Detail All"), karena kode
  // collie emang gak pernah muncul di situ — Detail All cuma level pcs
  // (rackcode+barcode+item), gak punya info collie sama sekali (lihat juga
  // catatan di uploadExcel).
  async scanCollie(req, res) {
    try {
      const {
        batch_id,
        rackcode,
        collie,
        id_karyawan,
        loccol,
        items_cross_docking, // optional, dari respons scan-rak — hindari rackExists() dobel
      } = req.body;
      if (!batch_id || !rackcode || !collie) {
        return response.error(
          res,
          "batch_id, rackcode, dan collie wajib diisi",
          422,
        );
      }
      const kodeRak = String(rackcode).trim();
      const kodeCollie = String(collie).trim();

      const sudahAda = await KarawangScanModel.existsCollie(
        batch_id,
        kodeCollie,
      );
      if (sudahAda) {
        return res.status(400).json({
          status: "error",
          message: "❌ Collie ini sudah discan sebelumnya!",
          data: null,
          duplicate: true,
        });
      }

      // Validasi: live ke API Cross Docking doang (gak ke db pandu lagi),
      // gak disandingin sama data target excel.
      let verifCd;
      try {
        verifCd = await KarawangCrossDockingModel.verifyCollie(
          kodeRak,
          kodeCollie,
          Array.isArray(items_cross_docking) ? items_cross_docking : undefined,
        );
      } catch (cdErr) {
        console.error("KarawangCrossDockingModel.verifyCollie gagal:", cdErr);
        return res.status(502).json({
          status: "error",
          message:
            "Gagal terhubung ke API Cross Docking. Coba lagi, atau hubungi IT kalau terus gagal.",
          data: null,
          cross_docking_unreachable: true,
        });
      }
      if (!verifCd) {
        return response.error(
          res,
          `Collie "${kodeCollie}" tidak ditemukan di Cross Docking untuk rak "${kodeRak}". Cek lagi kode collie-nya.`,
          404,
        );
      }

      // Tolak scan kalau barangnya lagi status KARANTINA (lastupdated
      // Cross Docking >= cutoff yang lagi aktif, manual atau otomatis —
      // lihat karantinaCutoffStore & gear icon di Dashboard). Barang yang
      // baru masuk (in bound) belum resmi jadi stok gudang, jadi belum
      // boleh discan dulu sampai lewat cutoff / operator ubah cutoff-nya.
      if (verifCd.lastupdated) {
        const lu = new Date(verifCd.lastupdated);
        if (!Number.isNaN(lu.getTime())) {
          const cutoff = getKarantinaCutoff();
          if (lu.getTime() >= cutoff.getTime()) {
            return res.status(422).json({
              status: "error",
              message: `❌ Barang ini IN BOUND (cut off) — masuk KARANTINA, belum bisa discan.`,
              data: null,
              karantina: true,
            });
          }
        }
      }

      // Deskripsi item tetap dari db pandu (bcmcfgv1.itemcatalog) — Cross
      // Docking gak nyediain deskripsi. Non-fatal kalau gagal: tetap
      // lanjut simpan collie-nya, deskripsi cuma tampil "-".
      let deskripsi = "-";
      try {
        deskripsi = await KarawangEdpModel.descriptionForItem(verifCd.item);
      } catch (descErr) {
        console.error(
          `Gagal ambil deskripsi item ${verifCd.item} dari db pandu:`,
          descErr,
        );
      }

      const saved = await KarawangScanModel.create({
        batch_id,
        rackcode: kodeRak,
        collie: kodeCollie,
        item: verifCd.item,
        deskripsi,
        kategori: verifCd.kategori,
        qty: verifCd.qty,
        id_karyawan: id_karyawan || currentUserId(req),
        loccol: loccol || null,
      });

      const totalCollieDiRak = await KarawangScanModel.countByRak(
        batch_id,
        kodeRak,
      );
      const totalQtyDiRak = await KarawangScanModel.sumQtyByRak(
        batch_id,
        kodeRak,
      );
      // Target qty pcs buat rak ini: LIVE dari Cross Docking (jumlah baris
      // detail-all buat rackcode ini = jumlah pcs, sama pola hitungnya
      // kayak dulu pas dari excel). Non-fatal kalau gagal — tetep balikin
      // hasil scan collie-nya, cuma progress target di rak ini nampil null.
      let totalQtyTargetDiRak = null;
      try {
        const rowsRak = await CrossDockingClient.fetchDetailAll({
          rackcode: kodeRak,
        });
        totalQtyTargetDiRak = (rowsRak || []).length;
      } catch (cdErr) {
        console.error(
          `Gagal ambil target qty Cross Docking buat rak ${kodeRak}:`,
          cdErr,
        );
      }

      return response.success(res, {
        ...saved,
        total_qty_scanned_di_rak: totalQtyDiRak,
        total_qty_target_di_rak: totalQtyTargetDiRak,
        total_collie_scanned_di_rak: totalCollieDiRak,
        message: `Collie ${kodeCollie} (${verifCd.item}, qty ${verifCd.qty}) berhasil disimpan.`,
      });
    } catch (err) {
      console.error("KarawangController.scanCollie gagal:", err);
      return response.error(res, err.message);
    }
  }

  // POST /api/stok-opname-karawang/scan-collie/cancel
  async cancelScan(req, res) {
    try {
      const { batch_id, collie } = req.body;
      if (!batch_id || !collie) {
        return response.error(res, "batch_id dan collie wajib diisi", 422);
      }
      await KarawangScanModel.deleteCollie(batch_id, collie);
      return response.success(res, { success: true });
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  // POST /api/stok-opname-karawang/truncate-scan
  // Reset TOTAL hasil scan (TRUNCATE tabel stok_opname_karawang_scan) —
  // dilindungi sandi statis (lihat TRUNCATE_SCAN_PASSWORD) biar gak
  // kepencet gak sengaja, dipanggil dari tombol "Reset Data Scan" di
  // Dashboard. Batch/target/lokasi TIDAK ikut kehapus, cuma progress scan.
  async truncateScan(req, res) {
    try {
      const { password } = req.body;
      if (password !== TRUNCATE_SCAN_PASSWORD) {
        return response.error(res, "Sandi salah.", 403);
      }
      await KarawangScanModel.truncateAll();
      // Cache dashboard per-batch (TTL 45 detik) masih bisa nyimpen angka
      // lama sesaat — bersihin biar dashboard langsung nampilin 0 abis
      // reset, gak nunggu TTL habis.
      dashboardCache.clear();
      return response.success(res, { success: true });
    } catch (err) {
      console.error("KarawangController.truncateScan gagal:", err);
      return response.error(res, err.message);
    }
  }

  // GET /api/stok-opname-karawang/dashboard?batch_id=
  async dashboard(req, res) {
    try {
      const batchId = req.query.batch_id;
      if (!batchId) {
        return response.error(res, "batch_id wajib diisi", 422);
      }

      const batch = await KarawangBatchModel.findById(batchId);
      if (!batch) {
        return response.error(res, "Batch tidak ditemukan", 404);
      }

      const [{ target, total_item, total_qty_target }, scanned, picRakRows] =
        await Promise.all([
          getLiveTarget(batchId),
          KarawangScanModel.summaryPerItem(batchId),
          KarawangScanModel.summaryPerItemPerPicRak(batchId),
        ]);
      const scannedMap = new Map(scanned.map((s) => [s.item, s]));

      // Digabung jadi 1 baris per (operator + rak + lokasi) per item, biar
      // modal detail item nampilin operator, rak, dan lokasi dalam 1 tabel
      // yang sama — bukan 2 tabel terpisah.
      const detailByItem = new Map();
      picRakRows.forEach((r) => {
        if (!detailByItem.has(r.item)) detailByItem.set(r.item, []);
        detailByItem.get(r.item).push({
          id_karyawan: r.id_karyawan,
          employee_id: r.employee_id,
          nama: r.nama_karyawan,
          rackcode: r.rackcode,
          loccol: r.loccol,
          collie_scanned: r.collie_scanned,
          qty_scanned: r.qty_scanned,
        });
      });

      const items = target.map((t) => {
        const s = scannedMap.get(t.item) || {
          collie_scanned: 0,
          qty_scanned: 0,
        };
        return {
          item: t.item,
          deskripsi: t.deskripsi,
          qty_target: t.qty_target,
          qty_scanned: s.qty_scanned,
          // collie_scanned: murni hasil scan, TANPA target — Cross Docking
          // gak punya sumber collie target yang reliable (cuma qty pcs).
          collie_scanned: s.collie_scanned,
          sisa_qty: t.qty_target - s.qty_scanned,
          persen: t.qty_target
            ? Math.min(100, Math.floor((s.qty_scanned / t.qty_target) * 100))
            : 0,
          overscan: t.qty_target
            ? s.qty_scanned > t.qty_target
            : s.qty_scanned > 0,
          // Operator + rak + lokasi yang scan item ini, digabung 1 baris.
          detail: detailByItem.get(t.item) || [],
        };
      });

      const totalScanned = await KarawangScanModel.totals(batchId);

      return response.success(res, {
        batch,
        items,
        ringkasan: {
          total_item,
          total_qty_target,
          // total_collie_scanned: murni jumlah collie yang udah discan,
          // TANPA dibandingin ke target — gak ada sumber collie target yang
          // reliable dari Cross Docking.
          total_collie_scanned: totalScanned.total_collie,
          total_qty_scanned: totalScanned.total_qty,
          persen: total_qty_target
            ? Math.min(
                100,
                Math.floor((totalScanned.total_qty / total_qty_target) * 100),
              )
            : 0,
        },
      });
    } catch (err) {
      console.error("KarawangController.dashboard gagal:", err);
      return response.error(res, err.message);
    }
  }

  // GET /api/stok-opname-karawang/dashboard/full?batch_id=&refresh=true
  // Dashboard versi "compare ke SEMUA stok Cross Docking" (bukan cuma rak
  // yang udah discan). Query berat (`detail-all` tanpa filter) CUMA
  // dijalanin kalau `refresh=true` dikirim eksplisit dari tombol "Refresh
  // Data Cross Docking" di UI — kalau enggak, endpoint ini SELALU pakai
  // snapshot cache terakhir (allStockCache), gak pernah nembak Cross
  // Docking sendiri. Kalau belum pernah ada yang refresh sama sekali,
  // balikin has_data:false biar frontend nampilin ajakan "klik Refresh
  // dulu" — bukan nunggu query berat jalan otomatis.
  async dashboardFull(req, res) {
    try {
      const batchId = req.query.batch_id;
      if (!batchId) {
        return response.error(res, "batch_id wajib diisi", 422);
      }
      const batch = await KarawangBatchModel.findById(batchId);
      if (!batch) {
        return response.error(res, "Batch tidak ditemukan", 404);
      }

      const wantRefresh = req.query.refresh === "true";
      if (!wantRefresh && !allStockCache) {
        return response.success(res, { batch, has_data: false });
      }

      let allStock;
      try {
        allStock = await getAllStock({ forceRefresh: wantRefresh });
      } catch (cdErr) {
        console.error(
          "KarawangController.dashboardFull gagal ambil Cross Docking:",
          cdErr,
        );
        // Kalau refresh gagal TAPI masih ada cache lama, tetep tampilin cache
        // lama (mendingan data agak basi daripada dashboard blank), sambil
        // kasih tau di response kalau refresh barusan gagal.
        if (allStockCache) {
          allStock = allStockCache.data;
        } else {
          return res.status(502).json({
            status: "error",
            message:
              "Gagal mengambil data dari Cross Docking. Coba klik Refresh lagi beberapa saat.",
            data: null,
          });
        }
      }

      const [scanned, picRakRows, totalScanned] = await Promise.all([
        KarawangScanModel.summaryPerItem(batchId),
        KarawangScanModel.summaryPerItemPerPicRak(batchId),
        KarawangScanModel.totals(batchId),
      ]);
      const scannedMap = new Map(scanned.map((s) => [s.item, s]));

      // Digabung jadi 1 baris per (operator + rak + lokasi) — sebelumnya
      // dipecah 2 (picByItem & rakByItem) yang bikin operator, rak, dan
      // lokasi nampil di 2 tabel terpisah di modal.
      const detailByItem = new Map();
      picRakRows.forEach((r) => {
        if (!detailByItem.has(r.item)) detailByItem.set(r.item, []);
        detailByItem.get(r.item).push({
          id_karyawan: r.id_karyawan,
          employee_id: r.employee_id,
          nama: r.nama_karyawan,
          rackcode: r.rackcode,
          loccol: r.loccol,
          collie_scanned: r.collie_scanned,
          qty_scanned: r.qty_scanned,
        });
      });

      let items = allStock.items.map((t) => {
        const s = scannedMap.get(t.item) || {
          collie_scanned: 0,
          qty_scanned: 0,
        };
        return {
          item: t.item,
          deskripsi: t.deskripsi,
          qty_target: t.qty,
          qty_scanned: s.qty_scanned,
          collie_scanned: s.collie_scanned,
          sisa_qty: t.qty - s.qty_scanned,
          persen: t.qty
            ? Math.min(100, Math.floor((s.qty_scanned / t.qty) * 100))
            : 0,
          // Overscan: qty yang kescan udah ngelewatin target Cross Docking
          // buat item ini (lihat diskusi soal scanCollie yang gak ngeblock
          // qty berlebih, cuma ngeblock collie duplikat) — dipakai frontend
          // buat nge-highlight card item ini warna merah pastel, beda dari
          // "done" (hijau, pas-pasan) biar operator/supervisor langsung
          // notice ada anomali di item ini.
          overscan: t.qty ? s.qty_scanned > t.qty : s.qty_scanned > 0,
          detail: detailByItem.get(t.item) || [],
        };
      });

      // Validasi OUTBOUND: khusus item overscan, cek live per rak apakah
      // qty-nya SEKARANG di Cross Docking udah berkurang dibanding pas
      // discan (indikasi barang udah outbound setelah discan, bukan salah
      // input). Jalan OTOMATIS tiap dashboard dibuka (bukan cuma pas
      // refresh), tapi di-scope KETAT cuma buat rak-rak item overscan aja
      // (bukan detail-all), dan dibatasin concurrency biar gak nembak CD
      // kebanyakan sekaligus kalau item overscan-nya banyak.
      const outboundChecks = [];
      items.forEach((it) => {
        if (!it.overscan) return;
        const rakMap = new Map(); // rackcode -> total qty_scanned di item ini
        it.detail.forEach((d) => {
          if (!d.rackcode) return;
          rakMap.set(
            d.rackcode,
            (rakMap.get(d.rackcode) || 0) + (d.qty_scanned || 0),
          );
        });
        rakMap.forEach((qtyScanned, rackcode) => {
          outboundChecks.push({ item: it.item, rackcode, qtyScanned });
        });
      });

      if (outboundChecks.length) {
        const results = await mapWithConcurrency(
          outboundChecks,
          5,
          async (chk) =>
            KarawangCrossDockingModel.checkOutbound(
              chk.rackcode,
              chk.item,
              chk.qtyScanned,
            ),
        );

        const outboundByItem = new Map();
        outboundChecks.forEach((chk, idx) => {
          const r = results[idx];
          if (!outboundByItem.has(chk.item)) outboundByItem.set(chk.item, []);
          outboundByItem.get(chk.item).push({ ...r, item: chk.item });
        });

        items = items.map((it) => {
          const racks = outboundByItem.get(it.item);
          if (!racks) return it;
          // NET dulu SEMUA rak dalam 1 item (boleh minus per rak), baru
          // floor 0 di paling akhir — biar surplus di 1 rak (nampung
          // pindahan dari rak lain yang sama-sama udah discan) nge-offset
          // defisit di rak lain, bukan keitung dobel jadi outbound.
          const netDiff = racks.reduce((sum, r) => sum + (r.diff || 0), 0);
          const confirmedQty = Math.max(0, netDiff);
          const overQty = it.qty_scanned - it.qty_target;
          // NETTING: qty yang udah confirmed outbound dianggap "gak lagi
          // ada" pas dihitung ke card/progress — jadi card balik nampilin
          // qty_scanned seolah gak overscan (misal 1100 discan, 100
          // confirmed outbound -> card nampilin 1000/1000, ijo). Angka
          // MENTAH (sebelum di-netting) tetep disimpen di raw_qty_scanned
          // buat dipakai detail biru di modal.
          const rawQtyScanned = it.qty_scanned;
          // Netting DIBATASI cuma buat nutup selisih overscan (overQty) —
          // gak boleh lebih, biar gak bikin card keliatan defisit baru di
          // bawah target. Kalau confirmedQty > overQty (net outbound lebih
          // gede dari yang dibutuhin buat nutup selisih), sisanya dianggap
          // di luar tanggung jawab validasi overscan ini — tetep dicatet
          // & keliatan di detail modal, tapi gak dipotong lagi dari card.
          const nettedQty = Math.min(confirmedQty, Math.max(0, overQty));
          const effectiveScanned = Math.max(0, rawQtyScanned - nettedQty);
          return {
            ...it,
            raw_qty_scanned: rawQtyScanned,
            qty_scanned: effectiveScanned,
            sisa_qty: it.qty_target - effectiveScanned,
            persen: it.qty_target
              ? Math.min(100, Math.floor((effectiveScanned / it.qty_target) * 100))
              : 0,
            overscan: it.qty_target
              ? effectiveScanned > it.qty_target
              : effectiveScanned > 0,
            outbound: {
              checked: true,
              confirmed_qty: confirmedQty,
              netted_qty: nettedQty,
              excess_qty: confirmedQty - nettedQty,
              // Selisih overscan udah kejelasin SELURUHNYA sama outbound
              // yang confirmed di rak-rak ini -> aman diklasifikasiin
              // "outbound", bukan anomali/salah input.
              fully_explained: confirmedQty >= overQty,
              // Tampilan per-rak buat modal: diff positif = pcs yang
              // ilang dari rak itu (outbound kandidat), diff negatif =
              // rak itu malah nampung pindahan (surplus) dari rak lain.
              racks: racks.map((r) => ({
                rackcode: r.rackcode,
                qty_scanned: r.qty_scanned,
                qty_live: r.qty_live,
                check_failed: r.check_failed,
                qty_outbound: r.diff > 0 ? r.diff : 0,
                qty_surplus: r.diff < 0 ? -r.diff : 0,
                is_outbound: r.diff > 0,
              })),
            },
          };
        });
      }

      const totalBarcode = allStock.total_qty; // 1 baris Detail All = 1 pcs = 1 barcode
      const variance = totalBarcode - totalScanned.total_qty;

      return response.success(res, {
        batch,
        has_data: true,
        fetched_at: allStock.fetched_at,
        items,
        karantina: allStock.karantina || [],
        karantina_cutoff: allStock.karantina_cutoff || null,
        karantina_cutoff_manual: allStock.karantina_cutoff_manual || false,
        ringkasan: {
          total_item: allStock.total_item,
          total_barcode: totalBarcode,
          total_qty_scanned: totalScanned.total_qty,
          total_collie_scanned: totalScanned.total_collie,
          variance,
          persen: totalBarcode
            ? Math.min(
                100,
                Math.floor((totalScanned.total_qty / totalBarcode) * 100),
              )
            : 0,
          total_karantina_item: allStock.total_karantina_item || 0,
          total_karantina_qty: allStock.total_karantina_qty || 0,
        },
      });
    } catch (err) {
      console.error("KarawangController.dashboardFull gagal:", err);
      return response.error(res, err.message);
    }
  }

  // GET /api/stok-opname-karawang/barcode-details?batch_id=
  async barcodeDetails(req, res) {
    try {
      const batchId = req.query.batch_id;
      if (!batchId) {
        return response.error(res, "batch_id wajib diisi", 422);
      }

      const batch = await KarawangBatchModel.findById(batchId);
      if (!batch) {
        return response.error(res, "Batch tidak ditemukan", 404);
      }

      const targets = await KarawangTargetModel.listBarcodeDetails(batchId);
      let edpMap = new Map();
      try {
        edpMap = await KarawangEdpModel.rackDetailsByBarcode(
          targets.map((t) => t.barcode),
        );
      } catch (err) {
        console.error("Gagal ambil detail barcode dari db pandu:", err);
      }

      const items = targets.map((t) => {
        const edpDetail = edpMap.get(String(t.barcode || "").trim()) || {};
        const rak = t.rackcodes_upload || "";
        const transfer = edpDetail.rackcodes || t.rackcodes_upload || "";
        const inWh = getInWhFromRackcode(transfer);
        return {
          ...t,
          rackcodes_upload: undefined,
          rak: rak || "-",
          transfer: transfer || "-",
          in_wh: inWh || "-",
          week: inWh ? getIsoWeekFromInWh(inWh) || "-" : "-",
        };
      });

      return response.success(res, { batch, items });
    } catch (err) {
      console.error("KarawangController.barcodeDetails gagal:", err);
      return response.error(res, err.message);
    }
  }

  // GET /api/stok-opname-karawang/barcode-details-live?batch_id=&refresh=true
  // Versi baru Halaman Barcode: ambil LANGSUNG dari Cross Docking (per
  // baris/barcode), bukan lagi dari tabel target hasil upload Detail All
  // yang udah gak pernah keisi lagi (lihat catatan besar di atas file ini).
  // Sama kayak dashboardFull: query `/stock-cd/detail-all` TANPA filter itu
  // berat, jadi CUMA jalan pas ?refresh=true (tombol "Refresh Data Cross
  // Docking" di UI) — kalau belum pernah ada yang refresh sama sekali,
  // balikin has_data:false.
  async barcodeDetailsLive(req, res) {
    try {
      const batchId = req.query.batch_id;
      if (!batchId) {
        return response.error(res, "batch_id wajib diisi", 422);
      }
      const batch = await KarawangBatchModel.findById(batchId);
      if (!batch) {
        return response.error(res, "Batch tidak ditemukan", 404);
      }

      const wantRefresh = req.query.refresh === "true";
      if (!wantRefresh && !barcodeLiveCache) {
        return response.success(res, { batch, has_data: false });
      }

      let data;
      try {
        data = await getBarcodeLiveData({ forceRefresh: wantRefresh });
      } catch (cdErr) {
        console.error(
          "KarawangController.barcodeDetailsLive gagal ambil Cross Docking:",
          cdErr,
        );
        if (barcodeLiveCache) {
          data = barcodeLiveCache.data;
        } else {
          return res.status(502).json({
            status: "error",
            message:
              "Gagal mengambil data dari Cross Docking. Coba klik Refresh lagi beberapa saat.",
            data: null,
          });
        }
      }

      return response.success(res, { batch, has_data: true, ...data });
    } catch (err) {
      console.error("KarawangController.barcodeDetailsLive gagal:", err);
      return response.error(res, err.message);
    }
  }

  // ── Setting cutoff "Barang Karantina" (tombol gear di Dashboard) ──
  // GET: baca cutoff yang lagi aktif (manual kalau udah di-set, atau
  // otomatis "hari ini jam 12:00 WIB" kalau belum pernah di-set).
  async getKarantinaCutoffSetting(req, res) {
    try {
      const cutoff = getKarantinaCutoff();
      return response.success(res, {
        cutoff: cutoff.toISOString(),
        is_manual: isKarantinaCutoffManual(),
      });
    } catch (err) {
      console.error(
        "KarawangController.getKarantinaCutoffSetting gagal:",
        err,
      );
      return response.error(res, err.message);
    }
  }

  // PUT body: { cutoff: "2026-08-09T14:00:00+07:00" } (atau format lain
  // yang bisa dibaca `new Date(...)`) — begitu di-set, dashboard LANGSUNG
  // kehitung ulang pakai cutoff baru ini tanpa perlu nembak Cross Docking
  // lagi (lihat computeAllStockData / getAllStock di atas), soalnya cuma
  // ganti cara nge-split data yang UDAH ke-cache, bukan re-fetch.
  async setKarantinaCutoffSetting(req, res) {
    try {
      const { cutoff } = req.body || {};
      if (!cutoff) {
        return response.error(res, "Field cutoff wajib diisi", 400);
      }
      const saved = setKarantinaCutoff(cutoff);
      // rawStockCache di-reuse (gak perlu fetch ulang) — cukup panggil
      // getAllStock TANPA forceRefresh biar allStockCache ke-refresh pakai
      // cutoff baru dari data yang udah ada.
      const data = rawStockCache
        ? computeAllStockData(rawStockCache, saved)
        : null;
      return response.success(res, {
        cutoff: saved.toISOString(),
        is_manual: true,
        dashboard: data,
      });
    } catch (err) {
      console.error(
        "KarawangController.setKarantinaCutoffSetting gagal:",
        err,
      );
      return response.error(res, err.message || "Gagal simpan cutoff", 400);
    }
  }

  // Balikin ke perilaku otomatis (hari ini jam 12:00 WIB, geser tiap hari).
  async resetKarantinaCutoffSetting(req, res) {
    try {
      clearKarantinaCutoff();
      const cutoff = getKarantinaCutoff();
      const data = rawStockCache
        ? computeAllStockData(rawStockCache, cutoff)
        : null;
      return response.success(res, {
        cutoff: cutoff.toISOString(),
        is_manual: false,
        dashboard: data,
      });
    } catch (err) {
      console.error(
        "KarawangController.resetKarantinaCutoffSetting gagal:",
        err,
      );
      return response.error(res, err.message);
    }
  }
}

module.exports = new KarawangController();
