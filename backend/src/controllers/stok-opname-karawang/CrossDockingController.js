// src/controllers/stok-opname-karawang/CrossDockingController.js
// Proxy tipis ke API web "Monitoring Stock Cross Docking" (lihat
// services/crossDockingClient.js). Kegunaannya cuma nerjemahin
// query string dari frontend Karawang jadi filter, panggil API luar,
// dan balikin hasilnya apa adanya — gak ngubah bentuk datanya, biar
// field apapun yang dibalikin API itu tetap kepake di frontend.
const CrossDockingClient = require("../../services/crossDockingClient");
const { getField } = require("../../utils/apiField");
const {
  enrichWithBcCollie,
  enrichSummaryWithLastUpdate,
} = require("../../utils/bcCollieEnrichment");
const { daysSinceJakarta } = require("../../utils/date");

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
      // Tempelin kolom "Last Update" per baris (rackcode+item) — lihat
      // enrichSummaryWithLastUpdate buat alasan kenapa ini query terpisah
      // (endpoint /stock-cd/summary sendiri gak ngebalikin lastupdated).
      const enriched = await enrichSummaryWithLastUpdate(data || []);
      res.json({
        data: enriched.rows,
        meta: {
          lastUpdateEnriched: enriched.lastUpdateEnriched,
          lastUpdateSkippedReason: enriched.lastUpdateSkippedReason,
        },
      });
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

  // Buat ditampilin di tabel web — CEPAT, TANPA enrichment bc_collie
  // (soalnya di lapangan hasilnya bisa ribuan kombinasi rackcode+item,
  // kelamaan kalau nunggu enrichment sebelum tabelnya nongol).
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

  // Khusus buat Export CSV — sama query-nya kayak detailAll, TAPI di sini
  // bc_collie di-enrich buat SEMUA baris (gak ada batas jumlah kombinasi),
  // karena ini aksi yang user sengaja tunggu & butuh data lengkap buat
  // dibawa ke Excel/CSV, bukan buat tampilan langsung di tabel web.
  static async detailAllExport(req, res) {
    try {
      const filters = filtersFromQuery(req.query);
      if (!filters.detail && !hasAnyFilter(filters)) {
        return res.status(400).json({
          message:
            'Minimal isi satu filter (Item / Rackcode / Barcode / Week), atau centang "Detail" dulu sebelum mengambil data.',
        });
      }
      const data = await CrossDockingClient.fetchDetailAll(filters);
      const enriched = await enrichWithBcCollie(data || [], {
        maxPairs: null, // gak dibatasi buat export
        concurrency: 10,
      });
      res.json({
        data: enriched.rows,
        meta: {
          bcCollieEnriched: enriched.bcCollieEnriched,
          bcCollieSkippedReason: enriched.bcCollieSkippedReason,
        },
      });
    } catch (err) {
      console.error("CrossDockingController.detailAllExport gagal:", err);
      res.status(502).json({
        message:
          err.message ||
          "Gagal menyiapkan data export Detail All Cross Docking",
      });
    }
  }

  // Detail per SATU pasangan rackcode+item — dipanggil pas user klik salah
  // satu baris di tabel Ringkasan Stock (mirip popup "Detail: RACKCODE /
  // ITEM" di web Cross Docking aslinya). Balikin baris level pcs/collie
  // (rackcode, item, curweek, bc_collie, barcode, lastupdated) + `age_krw`
  // yang dihitung server (lastupdated dikurangin waktu sekarang, dalam
  // hari) biar konsisten walau jam client-nya keliru.
  static async detail(req, res) {
    try {
      const rackcode = (req.query.rackcode || "").trim();
      const item = (req.query.item || "").trim();
      if (!rackcode || !item) {
        return res.status(400).json({
          message: "Parameter rackcode dan item wajib diisi.",
        });
      }
      const rows = await CrossDockingClient.fetchDetail(rackcode, item);
      const data = (rows || []).map((row) => {
        const lastupdated = getField(row, "lastupdated");
        return {
          rackcode: getField(row, "rackcode") ?? rackcode,
          item: getField(row, "item") ?? item,
          curweek: getField(row, "curweek"),
          bc_collie: getField(row, "bc_collie"),
          barcode: getField(row, "barcode"),
          lastupdated,
          age_krw: daysSinceJakarta(lastupdated),
        };
      });
      res.json({ data });
    } catch (err) {
      console.error("CrossDockingController.detail gagal:", err);
      res.status(502).json({
        message: err.message || "Gagal mengambil data detail Cross Docking",
      });
    }
  }
}

module.exports = CrossDockingController;
