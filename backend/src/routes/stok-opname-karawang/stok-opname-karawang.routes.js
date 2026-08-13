// src/routes/stok-opname-karawang/stok-opname-karawang.routes.js
const express = require("express");
const router = express.Router();
const KarawangController = require("../../controllers/stok-opname-karawang/KarawangController");
const CrossDockingController = require("../../controllers/stok-opname-karawang/CrossDockingController");
const FifoController = require("../../controllers/stok-opname-karawang/FifoController");
const TransferPlanController = require("../../controllers/stok-opname-karawang/TransferPlanController");

router.post("/validasi-lokasi", KarawangController.validasiLokasi);
router.post("/scan-rak", KarawangController.scanRak);
router.post("/scan-collie", KarawangController.scanCollie);
router.post("/scan-collie/cancel", KarawangController.cancelScan);
router.post("/truncate-scan", KarawangController.truncateScan);
router.get("/dashboard", KarawangController.dashboard);
// Dashboard versi "compare ke SEMUA stok Cross Docking" (bukan cuma rak
// yang udah discan) — query berat cuma jalan kalau ?refresh=true (tombol
// "Refresh Data Cross Docking" di UI), lihat catatan di
// KarawangController.dashboardFull.
router.get("/dashboard/full", KarawangController.dashboardFull);
// Setting cutoff "Barang Karantina" (tombol gear di Dashboard) — GET buat
// baca nilai aktif, PUT buat set manual, DELETE buat balik ke otomatis
// (hari ini jam 12:00 WIB, geser tiap hari).
router.get(
  "/dashboard/karantina-cutoff",
  KarawangController.getKarantinaCutoffSetting,
);
router.put(
  "/dashboard/karantina-cutoff",
  KarawangController.setKarantinaCutoffSetting,
);
router.delete(
  "/dashboard/karantina-cutoff",
  KarawangController.resetKarantinaCutoffSetting,
);
router.get("/barcode-details", KarawangController.barcodeDetails);
// Versi live: langsung dari Cross Docking (per baris/barcode), query berat
// cuma jalan kalau ?refresh=true — sama pola caching-nya kayak dashboard/full.
router.get("/barcode-details-live", KarawangController.barcodeDetailsLive);

// ── Proxy ke web "Monitoring Stock Cross Docking" (sistem terpisah,
// diakses lewat API + login, lihat services/crossDockingClient.js) ──
router.get("/cross-docking/summary", CrossDockingController.summary);
router.get("/cross-docking/totals", CrossDockingController.totals);
router.get("/cross-docking/detail-all", CrossDockingController.detailAll);
router.get(
  "/cross-docking/detail-all-export",
  CrossDockingController.detailAllExport,
);

// ── Control FIFO: search item (kode/deskripsi) → semua lot Cross
// Docking tempat item itu berada, diurut week paling tua duluan ──
router.get("/fifo/search-item", FifoController.searchItem);
router.get("/fifo/search-barcode", FifoController.searchBarcode);
router.get("/fifo/locations", FifoController.locations);

// ── Transfer Plan (Tangerang -> Karawang) & Retur (Karawang ->
// Tangerang): form input, langsung tercatat (TANPA approval). Cross
// Docking di sini cuma dipakai read-only lewat /stock-info, buat referensi
// stok Karawang saat ini pas isi form ──
router.get("/transfer-plan/search-item", TransferPlanController.searchItem);
router.get("/transfer-plan/stock-info", TransferPlanController.stockInfo);
router.get("/transfer-plan", TransferPlanController.list);
router.post("/transfer-plan", TransferPlanController.create);
router.delete("/transfer-plan/:id", TransferPlanController.remove);

module.exports = router;
