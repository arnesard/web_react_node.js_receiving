// src/utils/karantinaCutoffStore.js
// Nyimpen cutoff "Barang Karantina" yang di-set MANUAL lewat tombol gear di
// Dashboard Stok Opname Karawang (lihat DashboardPage.jsx + endpoint
// dashboard/karantina-cutoff di KarawangController). Disimpen di file JSON
// biar gak butuh migration SQL baru buat 1 nilai doang.
//
// Kalau belum PERNAH di-set sama sekali (file belum ada) → fallback ke
// quarantineCutoffToday() (otomatis "hari ini jam 12:00 WIB", geser tiap
// ganti hari — perilaku awal sebelum ada setting manual). Begitu operator
// nyimpen cutoff lewat gear icon, nilainya FIXED (gak ikut geser otomatis
// lagi) sampai diubah manual lagi atau di-reset.
const fs = require("fs");
const path = require("path");
const { quarantineCutoffToday } = require("./date");

const FILE_PATH = path.join(__dirname, "../data/karantinaCutoff.json");

function readStoredCutoff() {
  try {
    const raw = fs.readFileSync(FILE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && parsed.cutoff) {
      const d = new Date(parsed.cutoff);
      if (!Number.isNaN(d.getTime())) return d;
    }
  } catch (err) {
    // Wajar kalau file belum pernah dibikin (ENOENT) — gak usah dianggap
    // error, cuma berarti belum pernah di-set manual sama sekali.
    if (err.code !== "ENOENT") {
      console.error("karantinaCutoffStore: gagal baca file cutoff:", err);
    }
  }
  return null;
}

// Cutoff yang BENERAN dipakai buat hitung karantina saat ini — manual kalau
// udah pernah di-set, kalau belum fallback ke otomatis (hari ini jam 12:00).
function getKarantinaCutoff() {
  return readStoredCutoff() || quarantineCutoffToday();
}

function isKarantinaCutoffManual() {
  return readStoredCutoff() !== null;
}

function setKarantinaCutoff(dateInput) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) {
    throw new Error("Tanggal/jam cutoff tidak valid");
  }
  fs.mkdirSync(path.dirname(FILE_PATH), { recursive: true });
  fs.writeFileSync(
    FILE_PATH,
    JSON.stringify(
      { cutoff: d.toISOString(), updated_at: new Date().toISOString() },
      null,
      2,
    ),
  );
  return d;
}

// Balikin ke perilaku otomatis (hari ini jam 12:00 WIB, geser tiap hari).
function clearKarantinaCutoff() {
  try {
    fs.unlinkSync(FILE_PATH);
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.error("karantinaCutoffStore: gagal hapus file cutoff:", err);
    }
  }
}

module.exports = {
  getKarantinaCutoff,
  isKarantinaCutoffManual,
  setKarantinaCutoff,
  clearKarantinaCutoff,
};
