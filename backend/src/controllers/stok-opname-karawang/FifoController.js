// src/controllers/stok-opname-karawang/FifoController.js
// Endpoint buat fitur "Control FIFO" DC Karawang: search item (kode atau
// deskripsi) lalu tampilkan semua lot Cross Docking tempat item itu
// berada, diurut week paling tua duluan. Lihat KarawangFifoModel buat
// logic lengkapnya.
const KarawangEdpModel = require("../../models/stok-opname-karawang/KarawangEdpModel");
const KarawangFifoModel = require("../../models/stok-opname-karawang/KarawangFifoModel");

class FifoController {
  // GET /fifo/search-item?keyword=...
  // Autocomplete kotak search: cocokkan ke kode ATAU deskripsi item dari
  // bcmcfgv1.itemcatalog (db pandu/EDP).
  static async searchItem(req, res) {
    try {
      const keyword = (req.query.keyword || req.query.q || "").trim();
      if (!keyword) return res.json({ data: [] });
      const data = await KarawangEdpModel.searchByKeyword(keyword, 20);
      res.json({ data });
    } catch (err) {
      console.error("FifoController.searchItem gagal:", err);
      res.status(500).json({
        message: err.message || "Gagal mencari item",
      });
    }
  }

  // GET /fifo/locations?item=...&filterMode=all|hold|oe
  static async locations(req, res) {
    try {
      const item = (req.query.item || "").trim();
      if (!item) {
        return res.status(400).json({ message: "Kode item wajib diisi." });
      }
      const filterMode = req.query.filterMode || "all";
      const data = await KarawangFifoModel.locationsByItem(item, filterMode);
      res.json({ data });
    } catch (err) {
      console.error("FifoController.locations gagal:", err);
      res.status(502).json({
        message:
          err.message || "Gagal mengambil data lokasi FIFO dari Cross Docking",
      });
    }
  }
}

module.exports = FifoController;
