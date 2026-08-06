// src/routes/monitoring-transfer/dashboard.routes.js
const express = require("express");
const router = express.Router();
const DashboardController = require("../../controllers/monitoring-transfer/dashboard/DashboardController");

router.get("/data", DashboardController.dashboardData);

module.exports = router;
