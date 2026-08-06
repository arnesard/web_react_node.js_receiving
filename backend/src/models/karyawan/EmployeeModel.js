// src/models/EmployeeModel.js
const { poolUtama } = require("../../config/database");

class EmployeeModel {
  static async getByPlant(plant, group = null, bagian = null) {
    let sql = `SELECT employee_id, name, plant, \`group\`, bagian, primary_job_type, default_status 
               FROM employees WHERE 1=1`;
    const params = [];
    if (plant) {
      sql += " AND plant = ?";
      params.push(plant);
    }
    if (group) {
      sql += " AND `group` = ?";
      params.push(group);
    }
    if (bagian) {
      sql += " AND bagian = ?";
      params.push(bagian);
    }
    sql += " ORDER BY name ASC";
    const [rows] = await poolUtama.query(sql, params);
    return rows;
  }

  static async findById(employeeId) {
    const [rows] = await poolUtama.query(
      "SELECT * FROM employees WHERE employee_id = ?",
      [employeeId],
    );
    return rows[0] || null;
  }

  static async getAll() {
    const [rows] = await poolUtama.query(
      "SELECT * FROM employees ORDER BY name ASC",
    );
    return rows;
  }

  // Dipakai modul Monitoring Transfer Rak — cuma karyawan bagian TRANSFER
  // yang muncul di dropdown "Operator yang Bertugas" / "Karyawan Penerima".
  static async getByBagian(bagian) {
    const [rows] = await poolUtama.query(
      "SELECT id, employee_id, name, bagian FROM employees WHERE bagian = ? ORDER BY name ASC",
      [bagian],
    );
    return rows;
  }

  static async findByPk(id) {
    const [rows] = await poolUtama.query(
      "SELECT * FROM employees WHERE id = ?",
      [id],
    );
    return rows[0] || null;
  }

  static async create(data) {
    const {
      name,
      employee_id,
      plant,
      group,
      bagian,
      department,
      position,
      default_status,
      primary_job_type,
      phone,
      address,
      hire_date,
    } = data;
    const [result] = await poolUtama.query(
      `INSERT INTO employees 
       (name, employee_id, plant, \`group\`, bagian, department, position,
        default_status, primary_job_type, phone, address, hire_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        employee_id,
        plant,
        group,
        bagian || null,
        department,
        position,
        default_status,
        primary_job_type,
        phone,
        address,
        hire_date,
      ],
    );
    return { id: result.insertId, ...data };
  }

  static async update(id, data) {
    const {
      name,
      employee_id,
      plant,
      group,
      bagian,
      department,
      position,
      default_status,
      primary_job_type,
      phone,
      address,
      hire_date,
    } = data;
    const [result] = await poolUtama.query(
      `UPDATE employees SET
       name=?, employee_id=?, plant=?, \`group\`=?, bagian=?, department=?, position=?,
       default_status=?, primary_job_type=?, phone=?, address=?, hire_date=?
       WHERE id=?`,
      [
        name,
        employee_id,
        plant,
        group,
        bagian || null,
        department,
        position,
        default_status,
        primary_job_type,
        phone,
        address,
        hire_date,
        id,
      ],
    );
    return result.affectedRows > 0;
  }

  static async delete(id) {
    const [result] = await poolUtama.query(
      "DELETE FROM employees WHERE id = ?",
      [id],
    );
    return result.affectedRows > 0;
  }

  static async checkDuplicateEmployeeId(employee_id, excludeId = null) {
    let sql = "SELECT id FROM employees WHERE employee_id = ?";
    const params = [employee_id];
    if (excludeId) {
      sql += " AND id != ?";
      params.push(excludeId);
    }
    const [rows] = await poolUtama.query(sql, params);
    return rows.length > 0;
  }
}

module.exports = EmployeeModel;
