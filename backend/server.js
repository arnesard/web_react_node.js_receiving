// server.js

// Paksa semua operasi Date/waktu di proses Node ini pakai zona waktu
// Jakarta (WIB, UTC+7), apapun timezone default OS/server hosting-nya.
// Harus di baris paling atas, sebelum module lain di-require.
process.env.TZ = "Asia/Jakarta";

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

// Load koneksi DB
require("./src/config/database");

// Master router
const apiRoutes = require("./src/routes/api.routes");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api", apiRoutes);

// Serve file hasil upload (foto production, dll) dari folder ../public
// supaya URL kayak /uploads/production/xxx.png beneran bisa diakses.
app.use(express.static(path.join(__dirname, "..", "public")));

// Serve hasil build frontend (../frontend/dist) dari server yang sama,
// jadi cuma butuh 1 proses & 1 port buat backend + frontend sekaligus.
const frontendDist = path.join(__dirname, "..", "frontend", "dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));

  // SPA fallback: route non-/api (mis. /overtime, /dashboard) diarahkan
  // ke index.html biar react-router yang nanganin di sisi client.
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
} else {
  app.get("/", (req, res) => {
    res.json({
      message: "API Gudang Ban Motor — PT Gajah Tunggal Tbk",
      version: "1.0.0",
      status: "running (frontend belum di-build — jalankan npm run build di folder frontend)",
    });
  });
}

const PORT = process.env.PORT || 8098;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running → http://localhost:${PORT}`);
});
