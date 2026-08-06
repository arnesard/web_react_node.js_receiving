// src/models/DriverModel.js
// Equivalen App\Models\MonitoringTransferRak\Driver (Laravel), + CRUD buat
// halaman Pengaturan modul Transfer Rak.
// CATATAN: kolom `employee_id` NOT NULL tanpa default, jadi wajib diisi
// setiap kali create/update.
const { poolUtama } = require("../../config/database");

class DriverModel {
  static async getAll() {
    const [rows] = await poolUtama.query(
      "SELECT id, employee_id, nama_karyawan FROM drivers ORDER BY nama_karyawan ASC",
    );
    return rows;
  }

  // Autocomplete pencarian supir — GET /transfer-rak/drivers?q=...
  static async search(q = "", limit = 20) {
    let sql = "SELECT id, employee_id, nama_karyawan FROM drivers";
    const params = [];
    if (q) {
      sql += " WHERE nama_karyawan LIKE ?";
      params.push(`%${q}%`);
    }
    sql += " ORDER BY nama_karyawan ASC LIMIT ?";
    params.push(limit);
    const [rows] = await poolUtama.query(sql, params);
    return rows;
  }

  static async findByName(nama) {
    const [rows] = await poolUtama.query(
      "SELECT * FROM drivers WHERE nama_karyawan = ?",
      [nama],
    );
    return rows[0] || null;
  }

  static async findById(id) {
    const [rows] = await poolUtama.query(
      "SELECT * FROM drivers WHERE id = ?",
      [id],
    );
    return rows[0] || null;
  }

  static async create(employeeId, nama) {
    const [result] = await poolUtama.query(
      "INSERT INTO drivers (employee_id, nama_karyawan) VALUES (?, ?)",
      [employeeId, nama],
    );
    return this.findById(result.insertId);
  }

  static async update(id, employeeId, nama) {
    await poolUtama.query(
      "UPDATE drivers SET employee_id = ?, nama_karyawan = ? WHERE id = ?",
      [employeeId, nama, id],
    );
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await poolUtama.query(
      "DELETE FROM drivers WHERE id = ?",
      [id],
    );
    return result.affectedRows > 0;
  }
}

module.exports = DriverModel;
