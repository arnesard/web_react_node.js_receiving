// src/controllers/ProductionController.js
const EmployeeModel = require("../../../models/karyawan/EmployeeModel");
const ReceptionModel = require("../../../models/penerimaan-produksi/ReceptionModel");
const response = require("../../../utils/response");
const path = require("path");
const fs = require("fs");

class ProductionController {
  // GET /api/production/input?plant=B&group=A
  // Equivalen: inputForm() di Laravel — ambil employees + liveData
  async getInputData(req, res) {
    try {
      const { plant, group, bagian } = req.query;

      // Paralel query — equivalen 2 query terpisah di Laravel
      const [employees, liveData, inputtedIds] = await Promise.all([
        EmployeeModel.getByPlant(plant, group, bagian),
        ReceptionModel.getLiveToday(plant),
        ReceptionModel.getInputtedEmployeeIds(plant),
      ]);

      return response.success(res, { employees, liveData, inputtedIds });
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  // POST /api/production/input/:plant
  // Equivalen: storeInput() di Laravel
  async store(req, res) {
    try {
      const { plant } = req.params;
      const {
        employee_id,
        shift,
        date,
        production_count,
        ritase_result,
        notes,
      } = req.body;

      // job_today dikirim sebagai array dari frontend
      let jobTodayArray = req.body.job_today;
      if (!Array.isArray(jobTodayArray)) {
        jobTodayArray = jobTodayArray ? [jobTodayArray] : [];
      }
      const jobs = jobTodayArray.map((j) => j.trim()).filter(Boolean);

      if (!jobs.length) {
        return response.error(res, "Pilih minimal satu pekerjaan", 422);
      }

      // Handle file upload
      let photoPath = null;
      if (req.file) {
        photoPath = "uploads/production/" + req.file.filename;
      }

      // Loop per job — equivalen foreach di Laravel storeInput()
      const created = [];
      for (const jobName of jobs) {
        const data = await ReceptionModel.create({
          employee_id,
          shift,
          ritase_result,
          date,
          production_count,
          job_today: jobName,
          notes,
          photo: photoPath,
        });
        created.push(data);
      }

      return response.success(res, created, "Data berhasil disimpan", 201);
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  // GET /api/production/input/:plant/:id/edit
  async getEditData(req, res) {
    try {
      const { plant, id } = req.params;
      const [reception, employees] = await Promise.all([
        ReceptionModel.findById(id),
        EmployeeModel.getByPlant(plant),
      ]);

      if (!reception) return response.notFound(res, "Data tidak ditemukan");

      return response.success(res, { reception, employees });
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  // PUT /api/production/input/:plant/:id
  async update(req, res) {
    try {
      const { id } = req.params;
      const reception = await ReceptionModel.findById(id);
      if (!reception) return response.notFound(res, "Data tidak ditemukan");

      let jobTodayArray = req.body.job_today;
      if (!Array.isArray(jobTodayArray)) {
        jobTodayArray = jobTodayArray ? [jobTodayArray] : [];
      }
      const jobs = jobTodayArray.map((j) => j.trim()).filter(Boolean);

      let photoPath = reception.photo; // keep foto lama
      if (req.file) {
        // Hapus foto lama kalau ada
        if (reception.photo) {
          const oldPath = path.join("public", reception.photo);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
        photoPath = "uploads/production/" + req.file.filename;
      } else if (req.body.remove_photo === "true" || req.body.remove_photo === "1") {
        // User klik tombol hapus foto, gak upload foto baru
        if (reception.photo) {
          const oldPath = path.join("public", reception.photo);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
        photoPath = null;
      }

      const updateData = {
        employee_id: req.body.employee_id,
        shift: req.body.shift,
        production_count: req.body.production_count,
        ritase_result: req.body.ritase_result,
        notes: req.body.notes,
        date: req.body.date,
        job_today: jobs[0] || reception.job_today,
        photo: photoPath,
      };

      await ReceptionModel.update(id, updateData);

      // Kalau ada job lebih dari 1, insert baris baru
      for (let i = 1; i < jobs.length; i++) {
        await ReceptionModel.create({ ...updateData, job_today: jobs[i] });
      }

      return response.success(res, null, "Data berhasil diupdate");
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  // DELETE /api/production/:plant/:id
  async destroy(req, res) {
    try {
      const { id } = req.params;
      const reception = await ReceptionModel.findById(id);
      if (!reception) return response.notFound(res);

      // Hapus foto kalau ada
      if (reception.photo) {
        const filePath = path.join("public", reception.photo);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }

      await ReceptionModel.delete(id);
      return response.success(res, null, "Data berhasil dihapus");
    } catch (err) {
      return response.error(res, err.message);
    }
  }
}

module.exports = new ProductionController();
