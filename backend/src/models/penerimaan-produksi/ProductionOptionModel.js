// src/models/ProductionOptionModel.js
// Simpan opsi dinamis buat form "Input Hasil Kerja": daftar Plant, Grup,
// dan Pekerjaan. Sebelumnya ini hardcoded di frontend (PLANTS/GROUPS/JOB_LIST),
// sekarang dipindah ke DB biar bisa diedit lewat menu Pengaturan tanpa
// perlu ubah kode & deploy ulang.
const { poolUtama } = require("../../config/database");

const VALID_TYPES = ["job", "plant", "group", "bagian"];

class ProductionOptionModel {
  static isValidType(type) {
    return VALID_TYPES.includes(type);
  }

  // Ambil satu tipe aja, urut sesuai sort_order lalu id (urutan input)
  static async getByType(type) {
    const [rows] = await poolUtama.query(
      "SELECT id, type, value, sort_order FROM production_options WHERE type = ? ORDER BY sort_order ASC, id ASC",
      [type],
    );
    return rows;
  }

  // Ambil semua tipe sekaligus, dikelompokkan — dipakai buat halaman
  // Pengaturan & buat form Input Hasil Kerja
  static async getAllGrouped() {
    const [rows] = await poolUtama.query(
      "SELECT id, type, value, sort_order FROM production_options ORDER BY type ASC, sort_order ASC, id ASC",
    );
    const grouped = { job: [], plant: [], group: [], bagian: [] };
    for (const row of rows) {
      if (grouped[row.type]) grouped[row.type].push(row);
    }
    return grouped;
  }

  static async existsValue(type, value, excludeId = null) {
    let sql = "SELECT id FROM production_options WHERE type = ? AND value = ?";
    const params = [type, value];
    if (excludeId) {
      sql += " AND id != ?";
      params.push(excludeId);
    }
    const [rows] = await poolUtama.query(sql, params);
    return rows.length > 0;
  }

  static async create(type, value) {
    const [[{ maxOrder }]] = await poolUtama.query(
      "SELECT COALESCE(MAX(sort_order), 0) as maxOrder FROM production_options WHERE type = ?",
      [type],
    );
    const [result] = await poolUtama.query(
      "INSERT INTO production_options (type, value, sort_order) VALUES (?, ?, ?)",
      [type, value, maxOrder + 1],
    );
    return { id: result.insertId, type, value, sort_order: maxOrder + 1 };
  }

  static async delete(id) {
    const [result] = await poolUtama.query(
      "DELETE FROM production_options WHERE id = ?",
      [id],
    );
    return result.affectedRows > 0;
  }

  static async findById(id) {
    const [rows] = await poolUtama.query(
      "SELECT id, type, value, sort_order FROM production_options WHERE id = ?",
      [id],
    );
    return rows[0] || null;
  }
}

module.exports = ProductionOptionModel;
