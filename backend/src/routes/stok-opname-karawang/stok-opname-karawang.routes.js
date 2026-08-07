// src/routes/stok-opname-karawang/stok-opname-karawang.routes.js
const express = require("express");
const router = express.Router();
const KarawangController = require("../../controllers/stok-opname-karawang/KarawangController");
const CrossDockingController = require("../../controllers/stok-opname-karawang/CrossDockingController");

router.get("/batches", KarawangController.listBatches);
router.get("/batches/active", KarawangController.getActiveBatch);
router.post("/scan-rak", KarawangController.scanRak);
router.post("/scan-collie", KarawangController.scanCollie);
router.post("/scan-collie/cancel", KarawangController.cancelScan);
router.get("/dashboard", KarawangController.dashboard);
// Dashboard versi "compare ke SEMUA stok Cross Docking" (bukan cuma rak
// yang udah discan) — query berat cuma jalan kalau ?refresh=true (tombol
// "Refresh Data Cross Docking" di UI), lihat catatan di
// KarawangController.dashboardFull.
router.get("/dashboard/full", KarawangController.dashboardFull);
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

module.exports = router;
