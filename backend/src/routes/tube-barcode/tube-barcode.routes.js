// backend/src/routes/tube-barcode/tube-barcode.routes.js
const express = require("express");
const router = express.Router();
const C = require("../../controllers/tube-barcode/TubeBarcodeController");

router.get("/employees", C.employees);
router.get("/item-lookup", C.itemLookup);

// Scan Collie
router.post("/scan", C.scanStore);
router.delete("/scan/:id", C.scanCancel);

// Receive
router.get("/receive", C.receiveList);
router.post("/receive/approve", C.receiveApprove);

// Transfer
router.get("/transfer/lookup", C.transferLookup);
router.post("/transfer/kurang", C.transferKurang);
router.post("/transfer/tambah", C.transferTambah);

// Monitoring
router.get("/monitoring", C.monitoring);

module.exports = router;
