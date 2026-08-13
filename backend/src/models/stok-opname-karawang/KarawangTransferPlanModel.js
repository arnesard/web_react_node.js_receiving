// src/models/stok-opname-karawang/KarawangTransferPlanModel.js
// Histori "Transfer Plan" (Tangerang -> Karawang) & "Retur" (Karawang ->
// Tangerang). Langsung tercatat pas diinput, TANPA alur approval — kalau
// salah, dihapus aja (lihat KarawangTransferPlanModel.remove).
const { poolUtama } = require("../../config/database");

class KarawangTransferPlanModel {
  static async create({
    jenis,
    item,
    deskripsi,
    qty,
    keterangan,
    id_karyawan,
  }) {
    const [result] = await poolUtama.query(
      `INSERT INTO stok_opname_karawang_transfer_plan
        (jenis, item, deskripsi, qty, keterangan, id_karyawan, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        jenis,
        item,
        deskripsi || null,
        qty,
        keterangan || null,
        id_karyawan || null,
      ],
    );
    const [rows] = await poolUtama.query(
      `SELECT t.*, e.employee_id AS employee_id, e.name AS nama_karyawan
       FROM stok_opname_karawang_transfer_plan t
       LEFT JOIN employees e ON e.id = t.id_karyawan
       WHERE t.id = ?`,
      [result.insertId],
    );
    return rows[0];
  }

  // filters: { jenis, item, dateFrom, dateTo } — semua opsional.
  static async list(filters = {}, limit = 300) {
    const where = [];
    const params = [];

    if (filters.jenis) {
      where.push("t.jenis = ?");
      params.push(filters.jenis);
    }
    if (filters.item) {
      where.push("t.item LIKE ?");
      params.push(`%${filters.item}%`);
    }
    if (filters.dateFrom) {
      where.push("t.created_at >= ?");
      params.push(`${filters.dateFrom} 00:00:00`);
    }
    if (filters.dateTo) {
      where.push("t.created_at <= ?");
      params.push(`${filters.dateTo} 23:59:59`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    params.push(limit);

    const [rows] = await poolUtama.query(
      `SELECT t.*, e.employee_id AS employee_id, e.name AS nama_karyawan
       FROM stok_opname_karawang_transfer_plan t
       LEFT JOIN employees e ON e.id = t.id_karyawan
       ${whereSql}
       ORDER BY t.created_at DESC
       LIMIT ?`,
      params,
    );
    return rows;
  }

  static async remove(id) {
    const [result] = await poolUtama.query(
      `DELETE FROM stok_opname_karawang_transfer_plan WHERE id = ?`,
      [id],
    );
    return result.affectedRows;
  }
}

module.exports = KarawangTransferPlanModel;
