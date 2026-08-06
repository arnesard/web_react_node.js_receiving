// src/controllers/ProductionOptionController.js
const ProductionOptionModel = require("../../../models/penerimaan-produksi/ProductionOptionModel");
const response = require("../../../utils/response");

class ProductionOptionController {
  // GET /api/production-options
  // Return semua opsi dikelompokkan: { job: [...], plant: [...], group: [...] }
  async index(req, res) {
    try {
      const grouped = await ProductionOptionModel.getAllGrouped();
      return response.success(res, grouped);
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  // POST /api/production-options
  // body: { type: 'job' | 'plant' | 'group', value: 'Nama Baru' }
  async store(req, res) {
    try {
      const { type, value } = req.body;

      if (!ProductionOptionModel.isValidType(type)) {
        return response.error(res, "Tipe tidak valid", 422);
      }
      const trimmed = (value || "").trim();
      if (!trimmed) {
        return response.error(res, "Nilai tidak boleh kosong", 422);
      }

      const alreadyExists = await ProductionOptionModel.existsValue(
        type,
        trimmed,
      );
      if (alreadyExists) {
        return response.error(res, "Nilai ini sudah ada", 422);
      }

      const created = await ProductionOptionModel.create(type, trimmed);
      return response.success(res, created, "Berhasil ditambahkan", 201);
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  // DELETE /api/production-options/:id
  async destroy(req, res) {
    try {
      const { id } = req.params;
      const existing = await ProductionOptionModel.findById(id);
      if (!existing) return response.notFound(res, "Data tidak ditemukan");

      await ProductionOptionModel.delete(id);
      return response.success(res, null, "Berhasil dihapus");
    } catch (err) {
      return response.error(res, err.message);
    }
  }
}

module.exports = new ProductionOptionController();
