// src/routes/penerimaan-produksi/input.routes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const InputController = require("../../controllers/penerimaan-produksi/input/InputController");

// Setup upload folder — equivalen public_path('uploads/production') di Laravel
const uploadDir = path.join(__dirname, "../../../../public/uploads/production");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + "_" + file.originalname),
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } }); // max 5MB

// Routes — equivalen Route:: di Laravel
router.get("/input", InputController.getInputData); // GET data form
router.post("/input/:plant", upload.single("photo"), InputController.store);
router.get("/input/:plant/:id", InputController.getEditData);
router.put("/input/:plant/:id", upload.single("photo"), InputController.update);
router.delete("/:plant/:id", InputController.destroy);

module.exports = router;
