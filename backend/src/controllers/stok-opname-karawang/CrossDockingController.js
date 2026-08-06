// src/controllers/stok-opname-karawang/CrossDockingController.js
// Proxy tipis ke API web "Monitoring Stock Cross Docking" (lihat
// services/crossDockingClient.js). Kegunaannya cuma nerjemahin
// query string dari frontend Karawang jadi filter, panggil API luar,
// dan balikin hasilnya apa adanya — gak ngubah bentuk datanya, biar
// field apapun yang dibalikin API itu tetap kepake di frontend.
const CrossDockingClient = require("../../services/crossDockingClient");

function filtersFromQuery(query) {
  return {
    item: query.item,
    rackcode: query.rackcode,
    barcode: query.barcode,
    weekFrom: query.weekFrom,
    weekTo: query.weekTo,
    filterMode: query.filterMode,
    detail: query.detail === "true",
    holdDepts: query.holdDepts
      ? String(query.holdDepts)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined,
  };
}

class CrossDockingController {
  static async summary(req, res) {
    try {
      const viewMode = req.query.viewMode === "byItem" ? "byItem" : "byRack";
      const data = await CrossDockingClient.fetchSummary(
        viewMode,
        filtersFromQuery(req.query),
      );
      res.json({ data });
    } catch (err) {
      console.error("CrossDockingController.summary gagal:", err);
      res.status(502).json({
        message: err.message || "Gagal mengambil data summary Cross Docking",
      });
    }
  }

  static async totals(req, res) {
    try {
      const data = await CrossDockingClient.fetchTotals(
        filtersFromQuery(req.query),
      );
      res.json({ data });
    } catch (err) {
      console.error("CrossDockingController.totals gagal:", err);
      res.status(502).json({
        message: err.message || "Gagal mengambil data totals Cross Docking",
      });
    }
  }

  static async detailAll(req, res) {
    try {
      const data = await CrossDockingClient.fetchDetailAll(
        filtersFromQuery(req.query),
      );
      res.json({ data });
    } catch (err) {
      console.error("CrossDockingController.detailAll gagal:", err);
      res.status(502).json({
        message:
          err.message || "Gagal mengambil data detail all Cross Docking",
      });
    }
  }
}

module.exports = CrossDockingController;
