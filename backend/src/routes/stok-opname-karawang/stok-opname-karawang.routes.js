// src/routes/stok-opname-karawang/stok-opname-karawang.routes.js
const express = require("express");
const router = express.Router();
const KarawangController = require("../../controllers/stok-opname-karawang/KarawangController");
const CrossDockingController = require("../../controllers/stok-opname-karawang/CrossDockingController");

router.post("/mulai-opname", KarawangController.mulaiOpname);
router.get("/batches", KarawangController.listBatches);
router.get("/batches/active", KarawangController.getActiveBatch);
router.post("/validasi-lokasi", KarawangController.validasiLokasi);
router.post("/scan-rak", KarawangController.scanRak);
router.post("/scan-collie", KarawangController.scanCollie);
router.post("/scan-collie/cancel", KarawangController.cancelScan);
router.get("/dashboard", KarawangController.dashboard);
router.get("/barcode-details", KarawangController.barcodeDetails);

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
