// src/models/stok-opname-karawang/KarawangLokasiModel.js
// Data acuan lokasi (loccol -> rackcode) dari sheet "lokasi" di excel
// "Data Detail All Karawang". Dipakai buat 2 hal:
//   1) validasi input lokasi operator sebelum mulai scan rak
//   2) validasi rak yang discan operator beneran bagian dari lokasi itu
const { poolUtama } = require("../../config/database");

class KarawangLokasiModel {
  // rows: [{ loccol, rackcode }, ...]
  static async bulkInsert(batchId, rows, chunkSize = 500) {
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const values = chunk.map((r) => [batchId, r.loccol, r.rackcode]);
      await poolUtama.query(
        `INSERT INTO stok_opname_karawang_lokasi (batch_id, loccol, rackcode)
         VALUES ?`,
        [values],
      );
    }
  }

  // Dipakai pas operator input lokasi — cek lokasi ini ada di data batch
  // ini, sekalian tau ada berapa rak yang kebagian di lokasi tsb.
  static async findByLoccol(batchId, loccol) {
    const [rows] = await poolUtama.query(
      `SELECT DISTINCT rackcode FROM stok_opname_karawang_lokasi
       WHERE batch_id = ? AND loccol = ?`,
      [batchId, loccol],
    );
    return rows.map((r) => r.rackcode);
  }

  // Dipakai pas scan rak — pastikan rak yang discan beneran bagian dari
  // lokasi yang diinput operator (bukan rak dari lokasi lain).
  static async rackBelongsToLoccol(batchId, loccol, rackcode) {
    const [rows] = await poolUtama.query(
      `SELECT id FROM stok_opname_karawang_lokasi
       WHERE batch_id = ? AND loccol = ? AND rackcode = ? LIMIT 1`,
      [batchId, loccol, rackcode],
    );
    return rows.length > 0;
  }

  // Semua rackcode unik dalam scope batch ini (gabungan dari semua lokasi
  // yang diinput pas mulai opname) — dipakai buat narik target LIVE dari
  // Cross Docking per rackcode (lihat KarawangController.dashboard).
  static async distinctRackcodes(batchId) {
    const [rows] = await poolUtama.query(
      `SELECT DISTINCT rackcode FROM stok_opname_karawang_lokasi WHERE batch_id = ?`,
      [batchId],
    );
    return rows.map((r) => r.rackcode);
  }
}

module.exports = KarawangLokasiModel;
