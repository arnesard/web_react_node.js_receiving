// src/controllers/stok-opname-karawang/KarawangController.js
// Modul "Stok Opname DC Karawang". Alur: upload file "Data Detail All
// Karawang" (xlsx ATAU csv — format baru udah termasuk kolom Barcode &
// Location jadi 1 file, gak perlu sheet lokasi terpisah lagi) jadi data
// target. PENTING: Detail All itu level PCS (rackcode+barcode+item, 1
// baris = 1 pcs asli), BUKAN level collie — kode "collie" gak pernah
// muncul di data ini sama sekali, jadi qty target dipercaya langsung dari
// hasil hitung baris excel, gak ada override/lookup ke EDP. Operator lalu
// scan RAK (validasi ke rackcode+lokasi dari Detail All, DAN ke API Cross
// Docking — rackcode harus ketemu di sana) lalu scan COLLIE (kode fisik
// yang cuma ada pas scan lapangan, divalidasi LIVE ke API Cross Docking
// doang — gak disandingin ke data target excel karena memang gak ada
// datanya di situ) → tiap collie yang ketemu di Cross Docking itu baru
// disimpan sebagai hasil opname, dengan item/qty/kategori DIAMBIL DARI
// Cross Docking (bukan dari excel maupun db pandu) → dashboard bandingin
// target pcs (excel) vs hasil scan pcs, dan collie ditampilin murni dari
// hasil scan aja.
//
// CATATAN: db pandu EDP (KarawangEdpModel) SUDAH GAK DIPAKAI lagi buat
// VERIFIKASI rak/collie — itu sepenuhnya API Cross Docking sekarang
// (lihat KarawangCrossDockingModel). db pandu masih dipanggil di
// scanCollie, tapi CUMA buat ambil deskripsi item (join
// bcmcfgv1.itemcatalog) — bukan buat nentuin sah/gaknya collie.
// KarawangEdpModel juga masih dipakai penuh di fitur lain (Halaman
// Barcode).
const ExcelJS = require("exceljs");
const { Readable } = require("stream");
const KarawangTargetModel = require("../../models/stok-opname-karawang/KarawangTargetModel");
const KarawangScanModel = require("../../models/stok-opname-karawang/KarawangScanModel");
const KarawangEdpModel = require("../../models/stok-opname-karawang/KarawangEdpModel");
const KarawangCrossDockingModel = require("../../models/stok-opname-karawang/KarawangCrossDockingModel");
const KarawangBatchModel = require("../../models/stok-opname-karawang/KarawangBatchModel");
const KarawangLokasiModel = require("../../models/stok-opname-karawang/KarawangLokasiModel");
const response = require("../../utils/response");

// Belum ada auth/JWT di project ini (lihat catatan sama di modul lain).
function currentUserId(req) {
  return req.body?.id_karyawan || req.query?.id_karyawan || null;
}

// Kolom wajib ada di sheet data (rackcode + item selalu wajib; kolom
// collie boleh namanya "bc_entried_prod" (format lama) ATAU "barcode"
// (format baru export "Detail All Karawang" per Agustus 2026)).
const REQUIRED_COLUMNS_BASE = ["rackcode", "item"];
const COLLIE_COLUMN_ALIASES = ["bc_entried_prod", "barcode"];
// Kolom sheet "lokasi" TERPISAH — cuma dipakai sebagai fallback kalau file
// yang diupload format LAMA (gak punya kolom "location" langsung di sheet
// data-nya).
const REQUIRED_COLUMNS_LOKASI = ["loccol", "rackcode"];

function buildHeaderMap(sheet) {
  const headerRow = sheet.getRow(1);
  const map = {};
  headerRow.eachCell((cell, colNumber) => {
    const key = String(cell.value || "")
      .trim()
      .toLowerCase();
    if (key) map[key] = colNumber;
  });
  return map;
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

class KarawangController {
  // POST /api/stok-opname-karawang/upload  (multipart, field: file)
  // Terima .xlsx/.xls ATAU .csv. Parse "Data Detail All Karawang", agregasi
  // per collie (bc_entried_prod/barcode), lalu simpan jadi batch + data
  // target + data lokasi baru.
  async uploadExcel(req, res) {
    try {
      if (!req.file) {
        return response.error(res, "File wajib diupload", 422);
      }
      const namaBatch =
        (req.body.nama_batch || "").trim() ||
        `Opname ${new Date().toLocaleDateString("id-ID")}`;

      const namaFile = req.file.originalname || "";
      const isCsv =
        /\.csv$/i.test(namaFile) || req.file.mimetype === "text/csv";

      const workbook = new ExcelJS.Workbook();
      if (isCsv) {
        await workbook.csv.read(Readable.from(req.file.buffer));
      } else {
        await workbook.xlsx.load(req.file.buffer);
      }

      // Cari sheet yang punya kolom-kolom wajib (biar gak hardcode nama
      // sheet — file dari EDP/gudang kadang beda-beda nama sheetnya).
      let targetSheet = null;
      let headerMap = null;
      let colCollieName = null;
      for (const sheet of workbook.worksheets) {
        const map = buildHeaderMap(sheet);
        const hasBase = REQUIRED_COLUMNS_BASE.every((c) => map[c]);
        const collieAlias = COLLIE_COLUMN_ALIASES.find((c) => map[c]);
        if (hasBase && collieAlias) {
          targetSheet = sheet;
          headerMap = map;
          colCollieName = collieAlias;
          break;
        }
      }

      if (!targetSheet) {
        return response.error(
          res,
          `Sheet dengan kolom ${REQUIRED_COLUMNS_BASE.join(", ")} + salah satu dari (${COLLIE_COLUMN_ALIASES.join(" / ")}) tidak ditemukan di file ini`,
          422,
        );
      }

      const colRackcode = headerMap["rackcode"];
      const colItem = headerMap["item"];
      const colCollie = headerMap[colCollieName];
      const colProbcode = headerMap["probcode"]; // opsional
      const colLocation = headerMap["location"]; // opsional — format baru

      // Agregasi per collie: 1 collie = 1 baris target, qty = jumlah unit
      // (baris) dengan bc_entried_prod/barcode yang sama. Sekalian, kalau
      // sheet ini punya kolom "location", langsung petain loccol->rackcode
      // dari situ juga (format baru, gak perlu sheet lokasi terpisah lagi).
      const grouped = new Map(); // key: rackcode|collie
      const lokasiSeen = new Set();
      const lokasiRows = [];
      targetSheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // skip header
        const rackcode = String(row.getCell(colRackcode).value || "").trim();
        const collie = String(row.getCell(colCollie).value || "").trim();
        const item = String(row.getCell(colItem).value || "").trim();
        if (!rackcode || !collie || !item) return; // baris kosong/rusak, skip

        const probcodeRaw = colProbcode
          ? String(row.getCell(colProbcode).value || "").trim()
          : "";
        const kategori = probcodeRaw ? probcodeRaw.toUpperCase() : "OK";

        const key = `${rackcode}|${collie}`;
        if (!grouped.has(key)) {
          grouped.set(key, { rackcode, collie, item, kategori, qty: 0 });
        }
        grouped.get(key).qty += 1;

        if (colLocation) {
          const loccol = String(row.getCell(colLocation).value || "").trim();
          if (loccol) {
            const lokasiKey = `${loccol}|${rackcode}`;
            if (!lokasiSeen.has(lokasiKey)) {
              lokasiSeen.add(lokasiKey);
              lokasiRows.push({ loccol, rackcode });
            }
          }
        }
      });

      if (!grouped.size) {
        return response.error(
          res,
          "Tidak ada baris data yang valid di file ini",
          422,
        );
      }

      const targetRows = [...grouped.values()];

      // Fallback FORMAT LAMA: kalau sheet data gak punya kolom "location"
      // (atau semua kosong), cari sheet "lokasi" terpisah (loccol+rackcode).
      if (!lokasiRows.length) {
        let lokasiSheet = null;
        let lokasiHeaderMap = null;
        for (const sheet of workbook.worksheets) {
          const map = buildHeaderMap(sheet);
          if (REQUIRED_COLUMNS_LOKASI.every((c) => map[c])) {
            lokasiSheet = sheet;
            lokasiHeaderMap = map;
            break;
          }
        }
        if (lokasiSheet) {
          const colLoccol = lokasiHeaderMap["loccol"];
          const colRackcodeLokasi = lokasiHeaderMap["rackcode"];
          lokasiSheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;
            const loccol = String(row.getCell(colLoccol).value || "").trim();
            const rackcodeLokasi = String(
              row.getCell(colRackcodeLokasi).value || "",
            ).trim();
            if (!loccol || !rackcodeLokasi) return;
            const key = `${loccol}|${rackcodeLokasi}`;
            if (lokasiSeen.has(key)) return;
            lokasiSeen.add(key);
            lokasiRows.push({ loccol, rackcode: rackcodeLokasi });
          });
        }
      }

      if (!lokasiRows.length) {
        return response.error(
          res,
          `Tidak ada data lokasi ditemukan — file ini butuh kolom "Location" di sheet data, atau sheet terpisah dengan kolom ${REQUIRED_COLUMNS_LOKASI.join(", ")}`,
          422,
        );
      }

      // Ambil deskripsi item dari db pandu (bcmcfgv1.itemcatalog) buat
      // ditampilkan di dashboard, biar operator/atasan gak cuma liat kode item.
      const { poolEdp } = require("../../config/database");
      const uniqueItems = [...new Set(targetRows.map((r) => r.item))];
      let descrMap = new Map();
      try {
        const [rows] = await poolEdp.query(
          `SELECT item, descr FROM bcmcfgv1.itemcatalog WHERE item IN (?)`,
          [uniqueItems],
        );
        rows.forEach((r) =>
          descrMap.set((r.item || "").trim(), (r.descr || "").trim()),
        );
      } catch (err) {
        console.error("Gagal ambil deskripsi item dari db pandu:", err);
      }
      targetRows.forEach((r) => {
        r.deskripsi = descrMap.get(r.item) || "-";
      });

      // CATATAN (Agustus 2026): dulu di sini ada step "override" qty per
      // baris pakai COUNT(*) dari db pandu (fginvc.rack), dengan asumsi
      // kolom "Barcode"/collie di excel itu 1 kode dipakai berulang buat
      // banyak pcs fisik (kayak format lama bc_entried_prod). Ternyata
      // TIDAK — kolom Barcode di "Detail All" itu udah level pcs (1 baris
      // = 1 pcs asli, kodenya unik per baris; gak ada relasi collie->banyak
      // pcs di data ini sama sekali). Kode "collie" yang beneran (yang
      // discan operator di lapangan) juga gak pernah muncul di Detail All.
      // Jadi qty target sekarang dipercaya langsung dari hasil hitung baris
      // excel (lihat `grouped.get(key).qty += 1` di atas) — gak perlu lagi
      // nembak EDP buat "koreksi" qty, karena datanya udah akurat dari sononya.

      // Data lama (target + lokasi + hasil scan sebelumnya) otomatis kehapus
      // tiap kali upload excel baru — cukup 1 data aktif, gak numpuk batch.
      await KarawangBatchModel.deleteAll();
      const batch = await KarawangBatchModel.create({
        nama_batch: namaBatch,
        nama_file: req.file.originalname,
        id_karyawan_upload: currentUserId(req),
      });

      await KarawangTargetModel.bulkInsert(batch.id, targetRows);
      await KarawangLokasiModel.bulkInsert(batch.id, lokasiRows);

      const totalQty = targetRows.reduce((sum, r) => sum + r.qty, 0);
      await KarawangBatchModel.updateTotals(batch.id, {
        total_item: uniqueItems.length,
        total_collie: targetRows.length,
        total_qty: totalQty,
      });

      return response.success(res, {
        batch_id: batch.id,
        nama_batch: namaBatch,
        total_item: uniqueItems.length,
        total_collie: targetRows.length,
        total_qty: totalQty,
        total_lokasi: new Set(lokasiRows.map((r) => r.loccol)).size,
        message: `Data berhasil diimport: ${totalQty} pcs, ${uniqueItems.length} item, ${new Set(lokasiRows.map((r) => r.loccol)).size} lokasi.`,
      });
    } catch (err) {
      console.error("KarawangController.uploadExcel gagal:", err);
      return response.error(res, "Gagal memproses file. " + err.message);
    }
  }

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
  async getActiveBatch(req, res) {
    try {
      const batch = await KarawangBatchModel.findLatestActive();
      return response.success(res, batch);
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  // POST /api/stok-opname-karawang/validasi-lokasi
  // Dipanggil sebelum operator mulai scan rak — cek lokasi (loccol) yang
  // diinput ada di data lokasi batch ini.
  async validasiLokasi(req, res) {
    try {
      const { batch_id, loccol } = req.body;
      if (!batch_id || !loccol) {
        return response.error(res, "batch_id dan loccol wajib diisi", 422);
      }
      const kode = String(loccol).trim();

      const rakDiLokasi = await KarawangLokasiModel.findByLoccol(
        batch_id,
        kode,
      );
      if (!rakDiLokasi.length) {
        return response.error(
          res,
          `Lokasi "${kode}" tidak ditemukan di data lokasi untuk batch ini.`,
          404,
        );
      }

      return response.success(res, {
        loccol: kode,
        total_rak: rakDiLokasi.length,
      });
    } catch (err) {
      console.error("KarawangController.validasiLokasi gagal:", err);
      return response.error(res, err.message);
    }
  }

  // POST /api/stok-opname-karawang/scan-rak
  // Klik/scan kode rak dulu → validasi: (a) kebagian di lokasi yang
  // diinput operator, (b) kebagian di data target (excel/csv "Detail All
  // Karawang") batch ini, (c) BENERAN ADA di API Cross Docking (live) —
  // kalau enggak, berarti rak ini gak dikenal Cross Docking dan gak boleh
  // lanjut ke scan collie sama sekali. Sekalian tampilin progress rak tsb
  // (sudah/berapa collie).
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

      const cocokLokasi = await KarawangLokasiModel.rackBelongsToLoccol(
        batch_id,
        kodeLoccol,
        kode,
      );
      if (!cocokLokasi) {
        return response.error(
          res,
          `Rak "${kode}" bukan bagian dari lokasi "${kodeLoccol}". Cek lagi kode raknya, atau ganti lokasi kalau memang mau pindah.`,
          422,
        );
      }

      const targetRak = await KarawangTargetModel.findByRackcode(
        batch_id,
        kode,
      );
      if (!targetRak.length) {
        return response.error(
          res,
          `Rak "${kode}" tidak ditemukan di data Detail All Karawang untuk batch ini.`,
          404,
        );
      }

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

      const sudahDiscanCollie = await KarawangScanModel.countByRak(
        batch_id,
        kode,
      );
      const sudahDiscanQty = await KarawangScanModel.sumQtyByRak(
        batch_id,
        kode,
      );
      const totalQtyTarget = targetRak.reduce((sum, t) => sum + t.qty, 0);
      const itemDiRak = [...new Set(targetRak.map((t) => t.item))];

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
      const targetRak = await KarawangTargetModel.findByRackcode(
        batch_id,
        kodeRak,
      );
      const totalQtyTargetDiRak = targetRak.reduce((sum, t) => sum + t.qty, 0);

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

      const [target, scanned] = await Promise.all([
        KarawangTargetModel.summaryPerItem(batchId),
        KarawangScanModel.summaryPerItem(batchId),
      ]);
      const scannedMap = new Map(scanned.map((s) => [s.item, s]));

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
          // collie_scanned: murni hasil scan, TANPA target — data target dari
          // excel Detail All gak punya info collie yang reliable (lihat
          // catatan di bagian import/upload di atas).
          collie_scanned: s.collie_scanned,
          sisa_qty: t.qty_target - s.qty_scanned,
          persen: t.qty_target
            ? Math.min(100, Math.round((s.qty_scanned / t.qty_target) * 100))
            : 0,
        };
      });

      const totalScanned = await KarawangScanModel.totals(batchId);

      return response.success(res, {
        batch,
        items,
        ringkasan: {
          total_item: batch.total_item,
          total_qty_target: batch.total_qty,
          // total_collie_scanned: murni jumlah collie yang udah discan,
          // TANPA dibandingin ke target — gak ada sumber collie target yang
          // reliable di excel Detail All.
          total_collie_scanned: totalScanned.total_collie,
          total_qty_scanned: totalScanned.total_qty,
          persen: batch.total_qty
            ? Math.min(
                100,
                Math.round((totalScanned.total_qty / batch.total_qty) * 100),
              )
            : 0,
        },
      });
    } catch (err) {
      console.error("KarawangController.dashboard gagal:", err);
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
