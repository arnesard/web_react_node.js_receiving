// src/routes/control-stock.routes.js
const express = require("express");
const router = express.Router();
const ControlStockController = require("../../controllers/control-stock/ControlStockController");

router.get("/search-item", ControlStockController.searchItem);
router.get("/locations", ControlStockController.getLocations);

module.exports = router;
