// src/models/VehicleModel.js
// Equivalen App\Models\MonitoringTransferRak\Vehicle (Laravel), + CRUD buat
// halaman Pengaturan modul Transfer Rak.
const { poolUtama } = require("../../config/database");

class VehicleModel {
  static async getAll() {
    const [rows] = await poolUtama.query(
      "SELECT id, nama_kendaraan FROM vehicles ORDER BY nama_kendaraan ASC",
    );
    return rows;
  }

  // Autocomplete pencarian kendaraan — GET /transfer-rak/vehicles?q=...
  static async search(q = "", limit = 20) {
    let sql = "SELECT id, nama_kendaraan FROM vehicles";
    const params = [];
    if (q) {
      sql += " WHERE nama_kendaraan LIKE ?";
      params.push(`%${q}%`);
    }
    sql += " ORDER BY nama_kendaraan ASC LIMIT ?";
    params.push(limit);
    const [rows] = await poolUtama.query(sql, params);
    return rows;
  }

  static async findByName(nama) {
    const [rows] = await poolUtama.query(
      "SELECT * FROM vehicles WHERE nama_kendaraan = ?",
      [nama],
    );
    return rows[0] || null;
  }

  static async findById(id) {
    const [rows] = await poolUtama.query(
      "SELECT * FROM vehicles WHERE id = ?",
      [id],
    );
    return rows[0] || null;
  }

  static async create(nama) {
    const [result] = await poolUtama.query(
      "INSERT INTO vehicles (nama_kendaraan) VALUES (?)",
      [nama],
    );
    return this.findById(result.insertId);
  }

  static async update(id, nama) {
    await poolUtama.query(
      "UPDATE vehicles SET nama_kendaraan = ? WHERE id = ?",
      [nama, id],
    );
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await poolUtama.query(
      "DELETE FROM vehicles WHERE id = ?",
      [id],
    );
    return result.affectedRows > 0;
  }
}

module.exports = VehicleModel;
