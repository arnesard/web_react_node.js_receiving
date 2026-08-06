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

// Minimal isi satu filter (Item / Rackcode / Barcode / Week) sebelum boleh
// query — biar gak ada yang bisa manggil endpoint ini tanpa filter sama
// sekali (mis. lewat Postman/curl langsung), soalnya query tanpa filter
// terlalu berat buat server Cross Docking sumbernya.
function hasAnyFilter(filters) {
  return Boolean(
    filters.item ||
    filters.rackcode ||
    filters.barcode ||
    filters.weekFrom ||
    filters.weekTo,
  );
}

class CrossDockingController {
  static async summary(req, res) {
    try {
      const filters = filtersFromQuery(req.query);
      if (!hasAnyFilter(filters)) {
        return res.status(400).json({
          message:
            "Minimal isi satu filter (Item / Rackcode / Barcode / Week) sebelum mengambil data.",
        });
      }
      const viewMode = req.query.viewMode === "byItem" ? "byItem" : "byRack";
      const data = await CrossDockingClient.fetchSummary(viewMode, filters);
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
      const filters = filtersFromQuery(req.query);
      if (!hasAnyFilter(filters)) {
        return res.status(400).json({
          message:
            "Minimal isi satu filter (Item / Rackcode / Barcode / Week) sebelum mengambil data.",
        });
      }
      const data = await CrossDockingClient.fetchTotals(filters);
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
      const filters = filtersFromQuery(req.query);
      // Pengecualian: kalau checkbox "Detail" dicentang (filters.detail true),
      // boleh tarik Detail All tanpa filter lain. Di luar itu tetep wajib
      // minimal satu filter, biar gak ada query berat tanpa filter sama sekali.
      if (!filters.detail && !hasAnyFilter(filters)) {
        return res.status(400).json({
          message:
            'Minimal isi satu filter (Item / Rackcode / Barcode / Week), atau centang "Detail" dulu sebelum mengambil data.',
        });
      }
      const data = await CrossDockingClient.fetchDetailAll(filters);
      res.json({ data });
    } catch (err) {
      console.error("CrossDockingController.detailAll gagal:", err);
      res.status(502).json({
        message: err.message || "Gagal mengambil data detail all Cross Docking",
      });
    }
  }
}

module.exports = CrossDockingController;
