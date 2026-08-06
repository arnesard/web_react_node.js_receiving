// src/routes/monitoring-transfer/index.js
// Gabungin semua sub-route modul monitoring transfer jadi satu router,
// dipasang di routes/index.js sebagai /transfer-rak (URL publiknya TETAP
// sama kayak sebelum dipecah — cuma struktur filenya yang dirapiin).
const express = require("express");
const router = express.Router();

router.use("/", require("./input.routes")); // input & alur kirim/scan/terima
router.use("/dashboard", require("./dashboard.routes"));
router.use("/laporan", require("./laporan.routes"));
router.use("/master", require("./pengaturan.routes"));

module.exports = router;
