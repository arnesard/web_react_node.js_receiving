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
const KarawangBatchModel = require("../../models/stok-opname-karawang/KarawangBatchModel");
const response = require("../../utils/response");

// Belum ada auth/JWT di project ini (lihat catatan sama di modul lain).
function currentUserId(req) {
  return req.body?.id_karyawan || req.query?.id_karyawan || null;
}

function getInWhFromRackcode(rackcode) {
  const kode = String(rackcode || "").trim();
  const firstRackcode = kode.split(",")[0].trim();
  const match = firstRackcode.match(/^T\s*-\s*2(\d{6})\d{3}$/i);
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
async function getAllStock({ forceRefresh = false } = {}) {
  if (!forceRefresh && allStockCache) return allStockCache.data;
  if (allStockPromise) return allStockPromise;

  allStockPromise = (async () => {
    const rows = await CrossDockingClient.fetchDetailAll({ detail: true });

    // item -> { qty, barcodeSet } — barcodeSet cuma dipakai buat ngitung
    // total_barcode unik (kartu ringkasan), gak ikut dibalikin per-item.
    const perItem = new Map();
    let totalBarcodeSet = new Set();
    (rows || []).forEach((row) => {
      const item = (getField(row, "item") || "").toString().trim();
      if (!item) return;
      const barcodeRaw = getField(row, "barcode");
      const barcode =
        barcodeRaw !== undefined && barcodeRaw !== null
          ? String(barcodeRaw).trim()
          : "";
      if (!perItem.has(item)) {
        perItem.set(item, { qty: 0 });
      }
      perItem.get(item).qty += 1;
      if (barcode) totalBarcodeSet.add(barcode);
    });

    const items = [...perItem.keys()];
    let descrMap = new Map();
    try {
      descrMap = await KarawangEdpModel.descriptionsForItems(items);
    } catch (err) {
      console.error("getAllStock: gagal ambil deskripsi dari db pandu:", err);
    }

    const list = items
      .map((item) => ({
        item,
        deskripsi: descrMap.get(item) || "-",
        qty: perItem.get(item).qty,
      }))
      .sort((a, b) => a.item.localeCompare(b.item));

    const data = {
      items: list,
      total_item: list.length,
      total_qty: list.reduce((sum, t) => sum + t.qty, 0),
      total_barcode: totalBarcodeSet.size,
      fetched_at: new Date().toISOString(),
    };
    allStockCache = { data };
    totalBarcodeSet = null; // gak dipakai lagi, biar di-GC
    return data;
  })();

  try {
    return await allStockPromise;
  } finally {
    allStockPromise = null;
  }
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

      const [{ target, total_item, total_qty_target }, scanned, picRows] =
        await Promise.all([
          getLiveTarget(batchId),
          KarawangScanModel.summaryPerItem(batchId),
          KarawangScanModel.summaryPerItemPerPic(batchId),
        ]);
      const scannedMap = new Map(scanned.map((s) => [s.item, s]));

      // Kelompokin breakdown PIC per item, biar tiap item di dashboard bisa
      // nampilin siapa aja (+ berapa qty) yang scan item itu.
      const picByItem = new Map();
      picRows.forEach((p) => {
        if (!picByItem.has(p.item)) picByItem.set(p.item, []);
        picByItem.get(p.item).push({
          id_karyawan: p.id_karyawan,
          employee_id: p.employee_id,
          nama: p.nama_karyawan,
          collie_scanned: p.collie_scanned,
          qty_scanned: p.qty_scanned,
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
            ? Math.min(100, Math.round((s.qty_scanned / t.qty_target) * 100))
            : 0,
          // Siapa aja yang scan item ini (bisa lebih dari 1 orang).
          pic: picByItem.get(t.item) || [],
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
                Math.round((totalScanned.total_qty / total_qty_target) * 100),
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
        console.error("KarawangController.dashboardFull gagal ambil Cross Docking:", cdErr);
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

      const [scanned, picRows, totalScanned] = await Promise.all([
        KarawangScanModel.summaryPerItem(batchId),
        KarawangScanModel.summaryPerItemPerPic(batchId),
        KarawangScanModel.totals(batchId),
      ]);
      const scannedMap = new Map(scanned.map((s) => [s.item, s]));

      const picByItem = new Map();
      picRows.forEach((p) => {
        if (!picByItem.has(p.item)) picByItem.set(p.item, []);
        picByItem.get(p.item).push({
          id_karyawan: p.id_karyawan,
          employee_id: p.employee_id,
          nama: p.nama_karyawan,
          collie_scanned: p.collie_scanned,
          qty_scanned: p.qty_scanned,
        });
      });

      const items = allStock.items.map((t) => {
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
            ? Math.min(100, Math.round((s.qty_scanned / t.qty) * 100))
            : 0,
          pic: picByItem.get(t.item) || [],
        };
      });

      const totalBarcode = allStock.total_qty; // 1 baris Detail All = 1 pcs = 1 barcode
      const variance = totalBarcode - totalScanned.total_qty;

      return response.success(res, {
        batch,
        has_data: true,
        fetched_at: allStock.fetched_at,
        items,
        ringkasan: {
          total_item: allStock.total_item,
          total_barcode: totalBarcode,
          total_qty_scanned: totalScanned.total_qty,
          total_collie_scanned: totalScanned.total_collie,
          variance,
          persen: totalBarcode
            ? Math.min(
                100,
                Math.round((totalScanned.total_qty / totalBarcode) * 100),
              )
            : 0,
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
}

module.exports = new KarawangController();
