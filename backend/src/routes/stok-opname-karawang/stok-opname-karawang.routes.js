// src/routes/stok-opname-karawang/stok-opname-karawang.routes.js
const express = require("express");
const multer = require("multer");
const router = express.Router();
const KarawangController = require("../../controllers/stok-opname-karawang/KarawangController");

// File excel diproses langsung di memory (gak perlu disimpan ke disk,
// beda dari foto produksi), max 15MB — data detail all bisa puluhan ribu baris.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

router.post("/upload", upload.single("file"), KarawangController.uploadExcel);
router.get("/batches", KarawangController.listBatches);
router.get("/batches/active", KarawangController.getActiveBatch);
router.post("/validasi-lokasi", KarawangController.validasiLokasi);
router.post("/scan-rak", KarawangController.scanRak);
router.post("/scan-collie", KarawangController.scanCollie);
router.post("/scan-collie/cancel", KarawangController.cancelScan);
router.get("/dashboard", KarawangController.dashboard);
router.get("/barcode-details", KarawangController.barcodeDetails);

module.exports = router;
