// src/routes/system.routes.js
const express = require("express");
const router = express.Router();
const SystemController = require("../../controllers/shared/SystemController");

// GET /api/system/server-time
// Dipakai frontend buat ambil "tanggal hari ini" dari server, bukan dari
// jam device — soalnya jam di sebagian barcode scanner PDT (Android lawas)
// suka salah setting dan gak bisa diandelin.
router.get("/server-time", SystemController.serverTime);

module.exports = router;
