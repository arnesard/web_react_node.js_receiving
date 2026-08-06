// src/routes/employee.routes.js
const express = require("express");
const router = express.Router();
const EmployeeController = require("../../controllers/karyawan/EmployeeController");

router.get("/", EmployeeController.index);
router.get("/export", EmployeeController.exportExcel); // ← taruh sebelum /:id biar gak ketangkep jadi param id
router.post("/", EmployeeController.store);
router.get("/:id", EmployeeController.show);
router.put("/:id", EmployeeController.update);
router.delete("/:id", EmployeeController.destroy);

module.exports = router;
