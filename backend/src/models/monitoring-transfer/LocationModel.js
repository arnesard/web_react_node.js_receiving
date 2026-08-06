// src/models/LocationModel.js
// Master data lokasi (gudang/area) buat modul Transfer Rak.
// Tabel `transfer_lokasi` baru, belum ada di database Laravel lama —
// lihat catatan SQL di routes/transfer-rak.routes.js / dokumentasi delivery.
const { poolUtama } = require("../../config/database");

class LocationModel {
  static async getAll() {
    const [rows] = await poolUtama.query(
      "SELECT id, nama_lokasi FROM transfer_lokasi ORDER BY nama_lokasi ASC",
    );
    return rows;
  }

  // Autocomplete pencarian lokasi — GET /transfer-rak/lokasi?q=...
  static async search(q = "", limit = 20) {
    let sql = "SELECT id, nama_lokasi FROM transfer_lokasi";
    const params = [];
    if (q) {
      sql += " WHERE nama_lokasi LIKE ?";
      params.push(`%${q}%`);
    }
    sql += " ORDER BY nama_lokasi ASC LIMIT ?";
    params.push(limit);
    const [rows] = await poolUtama.query(sql, params);
    return rows;
  }

  static async findByName(nama) {
    const [rows] = await poolUtama.query(
      "SELECT * FROM transfer_lokasi WHERE nama_lokasi = ?",
      [nama],
    );
    return rows[0] || null;
  }

  static async findById(id) {
    const [rows] = await poolUtama.query(
      "SELECT * FROM transfer_lokasi WHERE id = ?",
      [id],
    );
    return rows[0] || null;
  }

  static async create(nama) {
    const [result] = await poolUtama.query(
      "INSERT INTO transfer_lokasi (nama_lokasi) VALUES (?)",
      [nama],
    );
    return this.findById(result.insertId);
  }

  static async update(id, nama) {
    await poolUtama.query(
      "UPDATE transfer_lokasi SET nama_lokasi = ? WHERE id = ?",
      [nama, id],
    );
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await poolUtama.query(
      "DELETE FROM transfer_lokasi WHERE id = ?",
      [id],
    );
    return result.affectedRows > 0;
  }
}

module.exports = LocationModel;
