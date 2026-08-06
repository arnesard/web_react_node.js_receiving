// src/controllers/TransferMasterController.js
// CRUD master data buat halaman Pengaturan modul Transfer Rak:
// Supir (drivers), Kendaraan (vehicles), Lokasi (transfer_lokasi).
const DriverModel = require("../../../models/monitoring-transfer/DriverModel");
const VehicleModel = require("../../../models/monitoring-transfer/VehicleModel");
const LocationModel = require("../../../models/monitoring-transfer/LocationModel");
const response = require("../../../utils/response");

// Kalau baris masih dipakai di transfer_raks (FK), MySQL nolak delete
// dengan error ER_ROW_IS_REFERENCED_2 — kita tangkep jadi pesan yang enak dibaca.
function isForeignKeyError(err) {
  return err && (err.errno === 1451 || err.code === "ER_ROW_IS_REFERENCED_2");
}

class TransferMasterController {
  // ── SUPIR ──
  async listDrivers(req, res) {
    try {
      return response.success(res, await DriverModel.getAll());
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  async createDriver(req, res) {
    try {
      const { employee_id, nama_karyawan } = req.body;
      if (!employee_id || !nama_karyawan) {
        return response.error(res, "employee_id dan nama_karyawan wajib diisi", 422);
      }
      const driver = await DriverModel.create(employee_id.trim(), nama_karyawan.trim());
      return response.success(res, driver);
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  async updateDriver(req, res) {
    try {
      const { employee_id, nama_karyawan } = req.body;
      if (!employee_id || !nama_karyawan) {
        return response.error(res, "employee_id dan nama_karyawan wajib diisi", 422);
      }
      const driver = await DriverModel.update(req.params.id, employee_id.trim(), nama_karyawan.trim());
      return response.success(res, driver);
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  async deleteDriver(req, res) {
    try {
      await DriverModel.delete(req.params.id);
      return response.success(res, { success: true });
    } catch (err) {
      if (isForeignKeyError(err)) {
        return response.error(
          res,
          "Supir ini masih dipakai di data transfer, tidak bisa dihapus.",
          422,
        );
      }
      return response.error(res, err.message);
    }
  }

  // ── KENDARAAN ──
  async listVehicles(req, res) {
    try {
      return response.success(res, await VehicleModel.getAll());
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  async createVehicle(req, res) {
    try {
      const { nama_kendaraan } = req.body;
      if (!nama_kendaraan) {
        return response.error(res, "nama_kendaraan wajib diisi", 422);
      }
      const vehicle = await VehicleModel.create(nama_kendaraan.trim());
      return response.success(res, vehicle);
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  async updateVehicle(req, res) {
    try {
      const { nama_kendaraan } = req.body;
      if (!nama_kendaraan) {
        return response.error(res, "nama_kendaraan wajib diisi", 422);
      }
      const vehicle = await VehicleModel.update(req.params.id, nama_kendaraan.trim());
      return response.success(res, vehicle);
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  async deleteVehicle(req, res) {
    try {
      await VehicleModel.delete(req.params.id);
      return response.success(res, { success: true });
    } catch (err) {
      if (isForeignKeyError(err)) {
        return response.error(
          res,
          "Kendaraan ini masih dipakai di data transfer, tidak bisa dihapus.",
          422,
        );
      }
      return response.error(res, err.message);
    }
  }

  // ── LOKASI ──
  async listLokasi(req, res) {
    try {
      return response.success(res, await LocationModel.getAll());
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  async createLokasi(req, res) {
    try {
      const { nama_lokasi } = req.body;
      if (!nama_lokasi) {
        return response.error(res, "nama_lokasi wajib diisi", 422);
      }
      const lokasi = await LocationModel.create(nama_lokasi.trim());
      return response.success(res, lokasi);
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  async updateLokasi(req, res) {
    try {
      const { nama_lokasi } = req.body;
      if (!nama_lokasi) {
        return response.error(res, "nama_lokasi wajib diisi", 422);
      }
      const lokasi = await LocationModel.update(req.params.id, nama_lokasi.trim());
      return response.success(res, lokasi);
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  async deleteLokasi(req, res) {
    try {
      await LocationModel.delete(req.params.id);
      return response.success(res, { success: true });
    } catch (err) {
      if (isForeignKeyError(err)) {
        return response.error(
          res,
          "Lokasi ini masih dipakai di data transfer, tidak bisa dihapus.",
          422,
        );
      }
      return response.error(res, err.message);
    }
  }
}

module.exports = new TransferMasterController();
