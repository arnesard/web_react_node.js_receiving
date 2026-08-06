// src/controllers/OvertimeController.js
const OvertimeModel = require("../../models/input-lembur/OvertimeModel");
const EmployeeModel = require("../../models/karyawan/EmployeeModel");
const response = require("../../utils/response");

class OvertimeController {
  // GET /api/overtime
  async index(req, res) {
    try {
      const { start_date, end_date } = req.query;
      const overtimes = await OvertimeModel.getAll(start_date, end_date);
      const employees = await EmployeeModel.getAll();

      // Map nama -> employee_id, equivalen $employeeMap di Laravel
      const employeeMap = {};
      employees.forEach((e) => {
        employeeMap[e.name.trim().toUpperCase()] = e.employee_id;
      });

      // Tambah info displayName, displayId, totalJam per item
      const enriched = overtimes.map((ot) => {
        const parts = ot.employee_name.split(" || ");
        const displayName = parts[0];
        const manualId = parts[1] || null;
        const normalizedName = displayName.trim().toUpperCase();

        // Utamakan employee_id yang beneran tersimpan di baris ini (dipilih user
        // dari dropdown saat submit). Baru kalau kosong (data lama sebelum kolom
        // employee_id ada), coba tebak dari nama — tapi ini bisa salah kalau ada
        // nama kembar, makanya cuma dipakai sebagai fallback untuk data lama.
        const displayId =
          ot.employee_id || manualId || employeeMap[normalizedName] || null;

        // Total jam sekarang diisi manual sama user (bukan dihitung dari
        // selisih jam mulai-selesai lagi, karena itu gak akurat kalau ada
        // jam istirahat di tengah shift). Data lama (sebelum kolom total_jam
        // ada) fallback ke selisih waktu mentah biar tetap kelihatan angkanya.
        let totalJam = ot.total_jam != null ? Number(ot.total_jam) : null;
        if (totalJam == null) {
          const [sh, sm] = ot.start_time.split(":").map(Number);
          const [eh, em] = ot.end_time.split(":").map(Number);
          let startMin = sh * 60 + sm;
          let endMin = eh * 60 + em;
          if (endMin < startMin) endMin += 24 * 60; // overnight
          totalJam = (endMin - startMin) / 60;
        }

        return { ...ot, displayName, displayId, totalJam };
      });

      return response.success(res, enriched);
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  // POST /api/overtime
  async store(req, res) {
    try {
      const {
        overtime_date,
        start_time,
        end_time,
        total_jam,
        reason,
        employee_name,
        employee_id,
        employee_name_manual,
        employee_id_manual,
      } = req.body;

      if (!overtime_date || !start_time || !end_time || !reason) {
        return response.error(res, "Data wajib diisi tidak lengkap", 422);
      }
      if (total_jam === undefined || total_jam === null || isNaN(Number(total_jam)) || Number(total_jam) <= 0) {
        return response.error(res, "Total Jam Lembur wajib diisi angka lebih dari 0", 422);
      }

      let finalName;
      let finalId = null;
      if (employee_name_manual) {
        finalName = employee_id_manual
          ? `${employee_name_manual} || ${employee_id_manual}`
          : employee_name_manual;
        finalId = employee_id_manual || null;
      } else {
        finalName = employee_name;
        finalId = employee_id || null;
      }

      if (!finalName) {
        return response.error(res, "Nama karyawan wajib diisi", 422);
      }

      const data = await OvertimeModel.create({
        employee_name: finalName,
        employee_id: finalId,
        overtime_date,
        start_time,
        end_time,
        total_jam: Number(total_jam),
        reason,
      });

      return response.success(
        res,
        data,
        "Pengajuan lembur berhasil dikirim",
        201,
      );
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  // PUT /api/overtime/:id
  async update(req, res) {
    try {
      const { id } = req.params;
      const overtime = await OvertimeModel.findById(id);
      if (!overtime)
        return response.notFound(res, "Data lembur tidak ditemukan");

      await OvertimeModel.update(id, req.body);
      return response.success(res, null, "Data lembur berhasil diperbarui");
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  // DELETE /api/overtime/:id
  async destroy(req, res) {
    try {
      const { id } = req.params;
      const overtime = await OvertimeModel.findById(id);
      if (!overtime) return response.notFound(res, "Data tidak ditemukan");

      await OvertimeModel.delete(id);
      return response.success(res, null, "Pengajuan lembur dihapus");
    } catch (err) {
      return response.error(res, err.message);
    }
  }
}

module.exports = new OvertimeController();
