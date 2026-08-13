// src/models/stok-opname-karawang/KarawangLokasiModel.js
// Data acuan lokasi (loccol -> rackcode) dari sheet "lokasi" di excel
// "Data Detail All Karawang". Dipakai buat 2 hal:
//   1) validasi input lokasi operator sebelum mulai scan rak
//   2) validasi rak yang discan operator beneran bagian dari lokasi itu
//
// CATATAN (Agustus 2026): model ini sudah GAK DIPANGGIL sama sekali dari
// KarawangController — validasi lokasi & rak sekarang full live ke Cross
// Docking (lihat KarawangController.validasiLokasi & scanRak). Tetap
// dirapikan di sini (kolom batch_id dibuang) biar konsisten kalau suatu
// saat dipakai lagi, konsep "batch" udah dihapus total dari project ini.
const { poolUtama } = require("../../config/database");

class KarawangLokasiModel {
  // rows: [{ loccol, rackcode }, ...]
  static async bulkInsert(rows, chunkSize = 500) {
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const values = chunk.map((r) => [r.loccol, r.rackcode]);
      await poolUtama.query(
        `INSERT INTO stok_opname_karawang_lokasi (loccol, rackcode)
         VALUES ?`,
        [values],
      );
    }
  }

  // Dipakai pas operator input lokasi — cek lokasi ini ada di data,
  // sekalian tau ada berapa rak yang kebagian di lokasi tsb.
  static async findByLoccol(loccol) {
    const [rows] = await poolUtama.query(
      `SELECT DISTINCT rackcode FROM stok_opname_karawang_lokasi
       WHERE loccol = ?`,
      [loccol],
    );
    return rows.map((r) => r.rackcode);
  }

  // Dipakai pas scan rak — pastikan rak yang discan beneran bagian dari
  // lokasi yang diinput operator (bukan rak dari lokasi lain).
  static async rackBelongsToLoccol(loccol, rackcode) {
    const [rows] = await poolUtama.query(
      `SELECT id FROM stok_opname_karawang_lokasi
       WHERE loccol = ? AND rackcode = ? LIMIT 1`,
      [loccol, rackcode],
    );
    return rows.length > 0;
  }

  // Semua rackcode unik (gabungan dari semua lokasi yang diinput pas mulai
  // opname) — dipakai buat narik target LIVE dari Cross Docking per
  // rackcode (lihat KarawangController.dashboard).
  static async distinctRackcodes() {
    const [rows] = await poolUtama.query(
      `SELECT DISTINCT rackcode FROM stok_opname_karawang_lokasi`,
    );
    return rows.map((r) => r.rackcode);
  }
}

module.exports = KarawangLokasiModel;
