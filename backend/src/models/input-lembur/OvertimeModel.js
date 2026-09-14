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
    const {
      employee_name,
      employee_id,
      overtime_date,
      start_time,
      end_time,
      total_jam,
      reason,
    } = data;
    const [result] = await poolUtama.query(
      `INSERT INTO overtime_data 
       (employee_name, employee_id, overtime_date, start_time, end_time, total_jam, reason, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        employee_name,
        employee_id || null,
        overtime_date,
        start_time,
        end_time,
        total_jam,
        reason,
      ],
    );
    return { id: result.insertId, ...data };
  }

  static async update(id, data) {
    const {
      employee_name,
      overtime_date,
      start_time,
      end_time,
      total_jam,
      reason,
    } = data;
    const [result] = await poolUtama.query(
      `UPDATE overtime_data SET
       employee_name=?, overtime_date=?, start_time=?, end_time=?, total_jam=?, reason=?
       WHERE id=?`,
      [
        employee_name,
        overtime_date,
        start_time,
        end_time,
        total_jam,
        reason,
        id,
      ],
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

  // ── Kunci cetak — sekali tanggal dicetak (lihat OvertimeController.lockDates),
  // tanggal itu gak boleh ditambah/diedit/dihapus lagi datanya. Tabelnya
  // cuma daftar tanggal yang udah dikunci, gak nyimpen apa-apa selain itu.

  static async getLockedDates(startDate, endDate) {
    let sql = "SELECT overtime_date FROM overtime_locked_dates WHERE 1=1";
    const params = [];
    if (startDate) {
      sql += " AND overtime_date >= ?";
      params.push(startDate);
    }
    if (endDate) {
      sql += " AND overtime_date <= ?";
      params.push(endDate);
    }
    const [rows] = await poolUtama.query(sql, params);
    // MySQL balikin object Date buat kolom DATE — normalisasi ke string
    // "YYYY-MM-DD" biar gampang dibandingin di frontend (Date.toISOString
    // bisa geser hari kalau kena timezone, jadi format manual).
    return rows.map((r) => {
      const d = r.overtime_date;
      if (d instanceof Date) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      }
      return String(d).slice(0, 10);
    });
  }

  static async isDateLocked(date) {
    const [rows] = await poolUtama.query(
      "SELECT 1 FROM overtime_locked_dates WHERE overtime_date = ? LIMIT 1",
      [date],
    );
    return rows.length > 0;
  }

  // Kunci banyak tanggal sekaligus (dipanggil pas Cetak — semua tanggal
  // yang lagi ditampilkan di laporan langsung dikunci bareng). INSERT
  // IGNORE biar aman kalau ada tanggal yang udah kekunci sebelumnya.
  static async lockDates(dates) {
    if (!dates || !dates.length) return;
    const values = dates.map((d) => [d]);
    await poolUtama.query(
      "INSERT IGNORE INTO overtime_locked_dates (overtime_date) VALUES ?",
      [values],
    );
  }
}

module.exports = OvertimeModel;
