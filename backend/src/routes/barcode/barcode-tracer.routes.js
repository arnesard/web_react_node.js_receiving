// src/routes/barcode/barcode-tracer.routes.js
const express = require("express");
const router = express.Router();
const BarcodeTracerController = require("../../controllers/barcode/BarcodeTracerController");

router.get("/search", BarcodeTracerController.searchBarcode);

module.exports = router;
