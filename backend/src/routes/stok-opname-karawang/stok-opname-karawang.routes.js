// src/routes/stok-opname-karawang/stok-opname-karawang.routes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const KarawangController = require("../../controllers/stok-opname-karawang/KarawangController");
const CrossDockingController = require("../../controllers/stok-opname-karawang/CrossDockingController");
const FifoController = require("../../controllers/stok-opname-karawang/FifoController");
const TransferPlanController = require("../../controllers/stok-opname-karawang/TransferPlanController");
const uploadItemReq = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});
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
// Data mentah (collie + barcode) buat tombol "Export Excel" di tiap card
// Dashboard — lihat KarawangController.exportItemDetail.
router.get("/dashboard/item-export/:item", KarawangController.exportItemDetail);
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

// Upload Item Request
router.post(
  "/item-req/upload",
  uploadItemReq.single("file"),
  TransferPlanController.uploadItemRequest,
);
router.get("/item-req/tire-trip-plan", TransferPlanController.tireTripPlan);

router.get("/item-req/summary", TransferPlanController.itemRequestSummary);
module.exports = router;
