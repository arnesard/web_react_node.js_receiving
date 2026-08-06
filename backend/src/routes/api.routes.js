const express = require("express");
const router = express.Router();

// ── Penerimaan Produksi ──
router.use("/production", require("./penerimaan-produksi/input.routes"));
router.use("/dashboard", require("./penerimaan-produksi/dashboard.routes"));
router.use("/reports", require("./penerimaan-produksi/laporan.routes"));
router.use("/production-options", require("./penerimaan-produksi/options.routes"));

// ── Monitoring Transfer ──
router.use("/transfer-rak", require("./monitoring-transfer/transfer-rak.routes"));

// ── Input Lembur ──
router.use("/overtime", require("./input-lembur/overtime.routes"));

// ── Karyawan ──
router.use("/employees", require("./karyawan/employee.routes"));

// ── Control Stock ──
router.use("/control-stock", require("./control-stock/control-stock.routes"));

// ── Stok Opname DC Karawang ──
router.use(
  "/stok-opname-karawang",
  require("./stok-opname-karawang/stok-opname-karawang.routes"),
);

// ── Shared ──
router.use("/system", require("./shared/system.routes"));

module.exports = router;
