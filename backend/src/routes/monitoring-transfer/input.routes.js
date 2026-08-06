// src/routes/monitoring-transfer/input.routes.js
const express = require("express");
const router = express.Router();
const InputController = require("../../controllers/monitoring-transfer/input/InputController");

// middleware/auth belum ada di project ini (sama seperti laporan.routes.js),
// jadi belum ada verifyToken. Aktifkan lagi kalau nanti auth-nya udah dibikin.

// ── Halaman input & data dropdown ──
router.get("/", InputController.index);
router.get("/drivers", InputController.getDrivers);
router.get("/vehicles", InputController.getVehicles);
router.get("/lokasi", InputController.getLokasi);

// ── Alur kirim (rak isi) ──
router.post("/start", InputController.start);
router.post("/scan", InputController.scan);
router.post("/scan/cancel", InputController.cancelScan);
router.post("/finish", InputController.finish);
router.post("/cancel", InputController.cancel);

// ── Alur kirim rak/palet kosong ──
router.post("/start-kosong", InputController.startKosong);

// ── Alur terima ──
router.post("/scan-mobil-penerima", InputController.scanMobilPenerima);
router.post("/scan-terima", InputController.scanTerima);
router.post("/terima", InputController.terima);

module.exports = router;
