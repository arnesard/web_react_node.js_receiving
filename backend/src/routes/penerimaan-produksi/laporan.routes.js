// src/routes/penerimaan-produksi/laporan.routes.js
const express = require("express");
const router = express.Router();
const LaporanController = require("../../controllers/penerimaan-produksi/laporan/LaporanController");
// middleware/auth belum ada di project ini (belum ada sistem login/JWT),
// jadi verifyToken dilepas dulu biar server bisa jalan. Aktifkan lagi
// kalau nanti auth-nya udah dibikin.

router.get("/", LaporanController.index);
router.get("/export", LaporanController.exportExcel);

module.exports = router;
