// src/controllers/stok-opname-karawang/CrossDockingController.js
// Proxy tipis ke API web "Monitoring Stock Cross Docking" (lihat
// services/crossDockingClient.js). Kegunaannya cuma nerjemahin
// query string dari frontend Karawang jadi filter, panggil API luar,
// dan balikin hasilnya apa adanya — gak ngubah bentuk datanya, biar
// field apapun yang dibalikin API itu tetap kepake di frontend.
const CrossDockingClient = require("../../services/crossDockingClient");
const KarawangEdpModel = require("../../models/stok-opname-karawang/KarawangEdpModel");
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
      // Tempelin kolom "Last Update" DAN benerin "Loccode" (yang di
      // /stock-cd/summary aslinya selalu null) per baris (rackcode+item) —
      // lihat enrichSummaryWithLastUpdate buat detail kenapa ini query
      // terpisah ke /stock-cd/detail. maxPairs dinaikin dari default 200 ke
      // 500 (filter yang cuma prefix pendek, mis. "b", bisa narik ratusan
      // rackcode sekaligus) — kalau masih kena skip juga, pesannya kebawa
      // ke frontend lewat meta.lastUpdateSkippedReason.
      const enriched = await enrichSummaryWithLastUpdate(data || [], {
        maxPairs: 200,
      });
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

  // Normalisasi kode lokasi buat dibandingin — trim, uppercase, dan buang
  // semua karakter selain alfanumerik (spasi/strip/underscore beda dikit
  // gak dianggap beda lokasi). Dipake biar loccode yang diketik operator
  // gak harus persis sama format-nya kayak yang tersimpan di Cross Docking.
  static _normalizeLoc(val) {
    return (val || "")
      .toString()
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  }

  // GET /cross-docking/location?loccode=XXX (+ optional item/rackcode/
  // barcode/week buat mempersempit) — cari LOKASI: isinya rackcode apa,
  // item apa, dan qty berapa (dihitung dari jumlah baris/pcs), buat operator
  // yang mau tau "rak ini isinya apa aja" tanpa perlu tau rackcode/item
  // duluan. Cross Docking API sendiri gak nyediain filter loccode
  // langsung, jadi caranya: tarik detail-all (dipersempit filter lain kalau
  // ada, atau full pull kalau kosong sama sekali — sama kayak pola
  // checkbox "Detail" yang udah ada), terus filter+group loccode-nya di
  // sini. Deskripsi item di-join dari db pandu (Cross Docking gak
  // nyediain), sama kayak fitur-fitur lain di project ini.
  static async locationSearch(req, res) {
    try {
      const loccode = (req.query.loccode || "").trim();
      if (!loccode) {
        return res.status(400).json({
          message: "Parameter loccode wajib diisi.",
        });
      }

      const filters = filtersFromQuery(req.query);
      // Kalau operator gak isi filter lain (item/rackcode/barcode/week),
      // paksa full pull (detail:true) — satu-satunya cara nyisir semua
      // loccode tanpa filter tambahan, konsisten sama checkbox "Detail"
      // yang udah ada di halaman ini.
      if (!hasAnyFilter(filters)) {
        filters.detail = true;
      }

      const rows = await CrossDockingClient.fetchDetailAll(filters);
      const target = CrossDockingController._normalizeLoc(loccode);

      // Kumpulin loccode unik yang beneran ADA (buat matching normalized
      // DAN buat debug kalau gak ketemu — biar keliatan format aslinya
      // apa aja, tanpa perlu buka network tab).
      const seenLoc = new Map(); // normalized -> raw pertama yang ketemu
      (rows || []).forEach((row) => {
        const raw = (getField(row, "loccode") || "").toString().trim();
        if (!raw) return;
        const norm = CrossDockingController._normalizeLoc(raw);
        if (!seenLoc.has(norm)) seenLoc.set(norm, raw);
      });

      // Prefix match (bukan cocok persis) — "DCK01-A" bakal nangkep semua
      // lokasi yang DIAWALI itu (mis. DCK01-A01, DCK01-A02, dst), berguna
      // buat nyari 1 blok/baris rak sekaligus tanpa perlu ketik kode
      // lengkap tiap lokasi.
      const matched = (rows || []).filter((row) => {
        const rowLoc = (getField(row, "loccode") || "").toString().trim();
        return CrossDockingController._normalizeLoc(rowLoc).startsWith(target);
      });

      // Group per loccode+rackcode+item (bukan cuma rackcode+item) — kalau
      // yang dicari itu prefix (nangkep beberapa lokasi sekaligus), tiap
      // lokasi tetep keliatan terpisah, gak numpuk jadi 1 angka qty yang
      // nyampur beberapa lokasi. Sekalian catet curweek PALING TUA
      // (format "YYWW", makin kecil = makin tua) per grup, buat bantu
      // liat FIFO — barang mana yang paling lama ngendon di rak itu.
      const groups = new Map(); // key `${loc}|${rackcode}|${item}` -> { loc, rackcode, item, qty, curweekTertua }
      matched.forEach((row) => {
        const loc = (getField(row, "loccode") || "").toString().trim();
        const rackcode = (getField(row, "rackcode") || "").toString().trim();
        const item = (getField(row, "item") || "").toString().trim();
        if (!rackcode || !item) return;
        const key = `${loc}|${rackcode}|${item}`;
        const curweek = (getField(row, "curweek") || "").toString().trim();
        if (!groups.has(key)) {
          groups.set(key, { loc, rackcode, item, qty: 0, curweekTertua: "" });
        }
        const g = groups.get(key);
        g.qty += 1;
        // "YYWW" ASC — string comparison udah cukup selama formatnya
        // konsisten 4 digit zero-padded (curweek kosong diabaikan).
        if (curweek && (!g.curweekTertua || curweek < g.curweekTertua)) {
          g.curweekTertua = curweek;
        }
      });

      const groupedRows = [...groups.values()];

      let descrMap = new Map();
      try {
        descrMap = await KarawangEdpModel.descriptionsForItems(
          groupedRows.map((g) => g.item),
        );
      } catch (err) {
        console.error(
          "CrossDockingController.locationSearch: gagal ambil deskripsi dari db pandu:",
          err,
        );
      }

      const data = groupedRows
        .map((g) => ({
          loccode: g.loc,
          rackcode: g.rackcode,
          item: g.item,
          deskripsi: descrMap.get(g.item) || "-",
          qty: g.qty,
          curweek_tertua: g.curweekTertua || "-",
        }))
        .sort(
          (a, b) =>
            a.loccode.localeCompare(b.loccode) ||
            a.rackcode.localeCompare(b.rackcode) ||
            a.item.localeCompare(b.item),
        );

      // Kalau gak ketemu sama sekali, sertain sample loccode yang beneran
      // ada di data ini (maks 8) — buat bantu operator/dev cocokin format
      // (dash, spasi, dll) tanpa harus buka log server.
      const meta = { totalPcs: matched.length, totalRowsFetched: rows.length };
      if (!matched.length) {
        meta.sampleLoccodes = [...seenLoc.values()].slice(0, 8);
      }

      res.json({ data, loccode, meta });
    } catch (err) {
      console.error("CrossDockingController.locationSearch gagal:", err);
      res.status(502).json({
        message: err.message || "Gagal mencari data lokasi di Cross Docking",
      });
    }
  }
}

module.exports = CrossDockingController;
