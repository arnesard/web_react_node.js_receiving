// src/routes/penerimaan-produksi/dashboard.routes.js
const express = require("express");
const router = express.Router();
const DashboardController = require("../../controllers/penerimaan-produksi/dashboard/DashboardController");

router.get("/", DashboardController.index);
router.get("/trend7", DashboardController.trend7Days);
router.get("/plantgroup", DashboardController.plantGroup);
router.get("/individu", DashboardController.trendIndividu);

module.exports = router;
