// src/routes/monitoring-transfer/pengaturan.routes.js
const express = require("express");
const router = express.Router();
const MasterController = require("../../controllers/monitoring-transfer/pengaturan/MasterController");

// ── Pengaturan: CRUD master data Supir / Kendaraan / Lokasi ──
router.get("/drivers", MasterController.listDrivers);
router.post("/drivers", MasterController.createDriver);
router.put("/drivers/:id", MasterController.updateDriver);
router.delete("/drivers/:id", MasterController.deleteDriver);

router.get("/vehicles", MasterController.listVehicles);
router.post("/vehicles", MasterController.createVehicle);
router.put("/vehicles/:id", MasterController.updateVehicle);
router.delete("/vehicles/:id", MasterController.deleteVehicle);

router.get("/lokasi", MasterController.listLokasi);
router.post("/lokasi", MasterController.createLokasi);
router.put("/lokasi/:id", MasterController.updateLokasi);
router.delete("/lokasi/:id", MasterController.deleteLokasi);

module.exports = router;
