// src/routes/overtime.routes.js
const express = require("express");
const router = express.Router();
const OvertimeController = require("../../controllers/input-lembur/OvertimeController");

router.get("/", OvertimeController.index);
router.post("/", OvertimeController.store);
router.put("/:id", OvertimeController.update);
router.delete("/:id", OvertimeController.destroy);

module.exports = router;
