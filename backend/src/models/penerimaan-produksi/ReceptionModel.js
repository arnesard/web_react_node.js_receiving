// src/models/ReceptionModel.js
const { poolUtama } = require("../../config/database");

class ReceptionModel {
  // Ambil data live hari ini — equivalen query leftJoin di Laravel
  static async getLiveToday(plant = null) {
    let sql = `
      SELECT 
        r.id, r.shift, r.job_today, r.production_count,
        r.ritase_result, r.notes, r.photo, r.created_at, r.date,
        e.name as operator_name, e.employee_id as operator_id, e.plant as emp_plant
      FROM receptions r
      LEFT JOIN employees e ON r.employee_id = e.employee_id
      WHERE (
        DATE(r.date) = CURDATE()
        OR (r.shift = 3 AND DATE(r.date) = DATE_SUB(CURDATE(), INTERVAL 1 DAY))
      )
    `;
    const params = [];

    if (plant) {
      sql += " AND e.plant = ?";
      params.push(plant);
    }

    sql += " ORDER BY r.created_at DESC";
    const [rows] = await poolUtama.query(sql, params);
    return rows;
  }

  // Ambil sudah input hari ini (untuk disable di dropdown operator)
  static async getInputtedEmployeeIds(plant = null) {
    let sql = `
    SELECT DISTINCT r.employee_id
    FROM receptions r
    LEFT JOIN employees e ON r.employee_id = e.employee_id
    WHERE (
      DATE(r.date) = CURDATE()
      OR (r.shift = 3 AND DATE(r.date) = DATE_SUB(CURDATE(), INTERVAL 1 DAY))
    )
  `;
    const params = [];
    if (plant) {
      sql += " AND e.plant = ?";
      params.push(plant);
    }
    const [rows] = await poolUtama.query(sql, params);
    return rows.map((r) => r.employee_id);
  }

  // Insert satu baris — equivalen Reception::create($data)
  static async create(data) {
    const {
      employee_id,
      shift,
      ritase_result,
      date,
      production_count,
      job_today,
      notes,
      photo,
    } = data;
    const [result] = await poolUtama.query(
      `INSERT INTO receptions 
       (employee_id, shift, ritase_result, date, production_count, job_today, notes, photo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        employee_id,
        shift,
        ritase_result || 0,
        date,
        production_count || 0,
        job_today,
        notes,
        photo,
      ],
    );
    return { id: result.insertId, ...data };
  }

  static async findById(id) {
    const [rows] = await poolUtama.query(
      "SELECT * FROM receptions WHERE id = ?",
      [id],
    );
    return rows[0] || null;
  }

  static async update(id, data) {
    const {
      employee_id,
      shift,
      production_count,
      ritase_result,
      notes,
      date,
      job_today,
      photo,
    } = data;
    const [result] = await poolUtama.query(
      `UPDATE receptions 
       SET employee_id=?, shift=?, production_count=?, ritase_result=?, notes=?, date=?, job_today=?, photo=?
       WHERE id=?`,
      [
        employee_id,
        shift,
        production_count,
        ritase_result || 0,
        notes,
        date,
        job_today,
        photo,
        id,
      ],
    );
    return result.affectedRows > 0;
  }

  static async delete(id) {
    const [result] = await poolUtama.query(
      "DELETE FROM receptions WHERE id = ?",
      [id],
    );
    return result.affectedRows > 0;
  }
}

module.exports = ReceptionModel;
