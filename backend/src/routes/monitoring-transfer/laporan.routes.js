// src/routes/monitoring-transfer/laporan.routes.js
const express = require("express");
const router = express.Router();
const LaporanController = require("../../controllers/monitoring-transfer/laporan/LaporanController");

// ── Laporan (taruh sebelum rute /:id kalau ada biar gak ketangkep param) ──
router.get("/data", LaporanController.getData);
router.get("/detail/:id", LaporanController.getDetail);
router.get("/export", LaporanController.exportExcel);
router.get("/", LaporanController.index);

module.exports = router;
