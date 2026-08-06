// src/models/OvertimeModel.js
const { poolUtama } = require("../../config/database");

class OvertimeModel {
  static async getAll(startDate, endDate) {
    let sql = `SELECT * FROM overtime_data WHERE 1=1`;
    const params = [];
    if (startDate) {
      sql += " AND DATE(overtime_date) >= ?";
      params.push(startDate);
    }
    if (endDate) {
      sql += " AND DATE(overtime_date) <= ?";
      params.push(endDate);
    }
    sql += " ORDER BY overtime_date DESC, created_at DESC";
    const [rows] = await poolUtama.query(sql, params);
    return rows;
  }

  static async findById(id) {
    const [rows] = await poolUtama.query(
      "SELECT * FROM overtime_data WHERE id = ?",
      [id],
    );
    return rows[0] || null;
  }

  static async create(data) {
    const { employee_name, employee_id, overtime_date, start_time, end_time, total_jam, reason } = data;
    const [result] = await poolUtama.query(
      `INSERT INTO overtime_data 
       (employee_name, employee_id, overtime_date, start_time, end_time, total_jam, reason, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [employee_name, employee_id || null, overtime_date, start_time, end_time, total_jam, reason],
    );
    return { id: result.insertId, ...data };
  }

  static async update(id, data) {
    const { employee_name, overtime_date, start_time, end_time, total_jam, reason } = data;
    const [result] = await poolUtama.query(
      `UPDATE overtime_data SET
       employee_name=?, overtime_date=?, start_time=?, end_time=?, total_jam=?, reason=?
       WHERE id=?`,
      [employee_name, overtime_date, start_time, end_time, total_jam, reason, id],
    );
    return result.affectedRows > 0;
  }

  static async delete(id) {
    const [result] = await poolUtama.query(
      "DELETE FROM overtime_data WHERE id = ?",
      [id],
    );
    return result.affectedRows > 0;
  }
}

module.exports = OvertimeModel;
