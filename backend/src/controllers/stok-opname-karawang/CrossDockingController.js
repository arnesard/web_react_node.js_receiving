// src/controllers/stok-opname-karawang/CrossDockingController.js
// Proxy tipis ke API web "Monitoring Stock Cross Docking" (lihat
// services/crossDockingClient.js). Kegunaannya cuma nerjemahin
// query string dari frontend Karawang jadi filter, panggil API luar,
// dan balikin hasilnya apa adanya — gak ngubah bentuk datanya, biar
// field apapun yang dibalikin API itu tetap kepake di frontend.
const CrossDockingClient = require("../../services/crossDockingClient");
const { getField } = require("../../utils/apiField");

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

// Jalanin `mapper` ke tiap item di `items`, maksimal `limit` request
// bersamaan — biar gak nembak puluhan/ratusan request ke server Cross
// Docking sekaligus dan bikin dia keteteran/nge-rate-limit kita.
async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      results[current] = await mapper(items[current], current);
    }
  }
  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

// Detail All resmi (/stock-cd/detail-all) gak mengandung field bc_collie —
// field itu cuma ada di endpoint detail per rackcode+item (/stock-cd/detail,
// yang di web aslinya dibuka lewat popup "Detail: RACKCODE / ITEM"). Fungsi
// ini "nempelin" bc_collie ke tiap baris Detail All dengan cara: (1)
// kumpulin semua pasangan rackcode+item yang unik, (2) query detail buat
// tiap pasangan itu (dibatasi concurrency biar gak nembak semua sekaligus
// ke server sumber), (3) cocokin balik ke tiap baris lewat barcode.
//
// `maxPairs`: batas jumlah kombinasi rackcode+item sebelum nyerah (biar
// gak overload server sumber) — null/Infinity = gak ada batas. Dipake beda
// antara tampilan web (dibatasi, harus cepat) dan export CSV (gak
// dibatasi, karena user emang udah sengaja nunggu & butuh datanya lengkap).
async function enrichWithBcCollie(
  rows,
  { maxPairs = 150, concurrency = 8 } = {},
) {
  const pairs = new Map(); // "rackcode||item" -> { rackcode, item }
  rows.forEach((row) => {
    const rackcode = getField(row, "rackcode");
    const item = getField(row, "item");
    if (rackcode && item) {
      pairs.set(`${rackcode}||${item}`, { rackcode, item });
    }
  });
  const uniquePairs = Array.from(pairs.values());

  if (uniquePairs.length === 0) {
    return { rows, bcCollieEnriched: true, bcCollieSkippedReason: undefined };
  }

  if (
    maxPairs != null &&
    Number.isFinite(maxPairs) &&
    uniquePairs.length > maxPairs
  ) {
    return {
      rows,
      bcCollieEnriched: false,
      bcCollieSkippedReason: `Ada ${uniquePairs.length} kombinasi rackcode+item pada hasil ini (batas ${maxPairs}), jadi Bc Collie dilewati biar gak membebani server Cross Docking. Persempit filter (mis. isi Rackcode/Item lebih spesifik) untuk melihat Bc Collie.`,
    };
  }

  const barcodeToBcCollie = new Map();
  let anyPairFailed = false;
  let loggedSampleKeys = false; // debug: cetak sekali aja biar log gak banjir

  await mapWithConcurrency(uniquePairs, concurrency, async (pair) => {
    try {
      const detailRows = await CrossDockingClient.fetchDetail(
        pair.rackcode,
        pair.item,
      );
      (detailRows || []).forEach((detailRow) => {
        // barcode di-String()-in biar konsisten dipake sebagai key Map,
        // soalnya detail-all vs detail bisa aja balikin barcode dengan
        // tipe beda (angka vs string) walau nilainya sama.
        const barcodeRaw = getField(detailRow, "barcode");
        const bcCollie = getField(detailRow, "bc_collie");
        if (barcodeRaw !== undefined) {
          barcodeToBcCollie.set(String(barcodeRaw), bcCollie);
        }
        if (!loggedSampleKeys) {
          loggedSampleKeys = true;
          console.log(
            "[CrossDocking] Contoh key dari /stock-cd/detail:",
            Object.keys(detailRow || {}),
            "-> bc_collie kebaca:",
            bcCollie,
          );
        }
      });
    } catch (err) {
      anyPairFailed = true;
      console.error(
        `Gagal ambil detail Bc Collie untuk ${pair.rackcode}/${pair.item}:`,
        err,
      );
    }
  });

  const enrichedRows = rows.map((row) => {
    const barcodeRaw = getField(row, "barcode");
    const barcode = barcodeRaw !== undefined ? String(barcodeRaw) : undefined;
    const bcCollie =
      barcode !== undefined && barcodeToBcCollie.has(barcode)
        ? barcodeToBcCollie.get(barcode)
        : undefined;
    return { ...row, bc_collie: bcCollie };
  });

  return {
    rows: enrichedRows,
    bcCollieEnriched: !anyPairFailed,
    bcCollieSkippedReason: anyPairFailed
      ? 'Sebagian data Bc Collie gagal diambil (koneksi ke server Cross Docking sempat gagal untuk sebagian rack/item). Baris yang gagal akan tampil "-" di kolom Bc Collie.'
      : undefined,
  };
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
}

module.exports = CrossDockingController;
