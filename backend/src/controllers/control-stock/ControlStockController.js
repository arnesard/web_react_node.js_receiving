// src/controllers/ControlStockController.js
// Modul "Control Stock" — cek item ini lagi ada di lot/lokasi mana aja,
// berapa rak, berapa qty, whsweek berapa (diurut paling tua duluan).
const ControlStockModel = require("../../models/control-stock/ControlStockModel");
const response = require("../../utils/response");

class ControlStockController {
  // GET /api/control-stock/search-item?q=IBD
  // Autocomplete kotak pencarian kode item.
  async searchItem(req, res) {
    try {
      const q = (req.query.q || "").trim();
      if (!q) return response.success(res, []);
      const items = await ControlStockModel.searchItem(q, 20);
      return response.success(res, items);
    } catch (err) {
      console.error("ControlStockController.searchItem gagal:", err);
      return response.error(
        res,
        "Gagal mencari item dari database EDP. " + err.message,
      );
    }
  }

  // GET /api/control-stock/locations?item=IBD1301&kategori=OK
  // Data utama: semua lokasi tempat item ini berada.
  // `kategori` opsional: "OK" | "OE" — kalau dikirim, cuma rak dengan
  // kategori itu yang ditampilkan/dihitung (lihat ControlStockModel).
  async getLocations(req, res) {
    try {
      const item = (req.query.item || "").trim();
      const kategori = (req.query.kategori || "").trim();
      if (!item) {
        return response.error(res, "Kode item wajib diisi", 422);
      }

      const data = await ControlStockModel.findLocationsByItem(
        item,
        kategori || null,
      );
      return response.success(res, data);
    } catch (err) {
      console.error("ControlStockController.getLocations gagal:", err);
      return res.status(502).json({
        status: "error",
        message:
          "Gagal terhubung/ambil data dari database EDP. Coba lagi, atau hubungi IT kalau terus gagal.",
        data: null,
        edp_unreachable: true,
      });
    }
  }
}

module.exports = new ControlStockController();
