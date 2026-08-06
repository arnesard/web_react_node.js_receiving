// src/routes/penerimaan-produksi/options.routes.js
const express = require("express");
const router = express.Router();
const OptionController = require("../../controllers/penerimaan-produksi/input/OptionController");

// GET  /api/production-options            -> { job: [], plant: [], group: [] }
// POST /api/production-options             body: { type, value }
// DELETE /api/production-options/:id
router.get("/", OptionController.index);
router.post("/", OptionController.store);
router.delete("/:id", OptionController.destroy);

module.exports = router;
