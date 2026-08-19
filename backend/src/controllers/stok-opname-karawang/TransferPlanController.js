// src/controllers/stok-opname-karawang/TransferPlanController.js
// Upload Item Request (Excel) + Tire Trip Planner. Trip planner
// menggabungkan item request jenis TIRE hari ini dengan data Schedule OEM
// dari bpw_dept_db.sch_oem (lihat KarawangItemRequestModel.getTireTripItems).
const KarawangItemRequestModel = require("../../models/stok-opname-karawang/KarawangItemRequestModel");
const KarawangTripPlanModel = require("../../models/stok-opname-karawang/KarawangTripPlanModel");
const ControlStockModel = require("../../models/control-stock/ControlStockModel");
const KarawangFifoModel = require("../../models/stok-opname-karawang/KarawangFifoModel");
const { mapWithConcurrency } = require("../../utils/concurrency");

const ExcelJS = require("exceljs");
const response = require("../../utils/response");

// Kode item di master_item / Item Request pakai suffix "-<angka>" di
// belakang (mis. "IBD1002-0"), tapi kode item ASLI di database EDP
// (fgloc/rack, dipakai Control Stock) dan Cross Docking (dipakai Control
// FIFO) gak pakai suffix itu ("IBD1002" polos) — makanya query stok harus
// pakai kode yang udah di-strip, biar ketemu. Kode aslinya (dengan suffix)
// tetap dipakai buat ditampilkan & disimpan ke trip.
function stripItemSuffix(itemCode) {
  return String(itemCode || "").trim().replace(/-\d+$/, "");
}

class TransferPlanController {
  async uploadItemRequest(req, res) {
    try {
      if (!req.file) {
        return response.error(res, "File Excel wajib dipilih.", 422);
      }

      const workbook = new ExcelJS.Workbook();

      await workbook.xlsx.load(req.file.buffer);

      const worksheet = workbook.worksheets[0];

      if (!worksheet) {
        return response.error(res, "Sheet Excel tidak ditemukan.", 422);
      }

      const rows = [];

      // Baris 1 = header
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;

        const date = row.getCell(1).value;
        const jenis = String(row.getCell(2).value || "").trim();
        const item = String(row.getCell(3).value || "").trim();
        const qty = row.getCell(4).value;
        const ket = String(row.getCell(5).value || "").trim();

        // Skip baris kosong
        if (!item && !qty && !ket) {
          return;
        }

        if (!item) {
          throw new Error(`Item pada baris ${rowNumber} belum diisi.`);
        }

        const qtyNum = Number(qty);

        if (!Number.isInteger(qtyNum) || qtyNum <= 0) {
          throw new Error(
            `Qty pada baris ${rowNumber} harus berupa angka lebih dari 0.`,
          );
        }

        rows.push({
          date,
          jenis,
          item,
          qty: String(qtyNum),
          ket,
        });
      });

      if (rows.length === 0) {
        return response.error(
          res,
          "Tidak ada data yang bisa dimasukkan dari file Excel.",
          422,
        );
      }

      const result = await KarawangItemRequestModel.bulkCreate(rows);

      return response.success(res, {
        total: result.inserted,
        message: `${result.inserted} data berhasil dimasukkan.`,
      });
    } catch (err) {
      console.error("TransferPlanController.uploadItemRequest gagal:", err);

      return response.error(
        res,
        err.message || "Gagal memproses file Excel.",
        422,
      );
    }
  }

  async itemRequestSummary(req, res) {
    try {
      const summary = await KarawangItemRequestModel.getSummary();

      return response.success(res, summary);
    } catch (err) {
      console.error("TransferPlanController.itemRequestSummary gagal:", err);

      return response.error(res, "Gagal mengambil summary item request.");
    }
  }

  // Preview manual: item request TIRE hari ini (qty request), di-enrich
  // stok Tangerang (Control Stock, db pandu/EDP) & stok Karawang (Control
  // FIFO, Cross Docking) per item — dipakai user buat MANUAL milih No
  // Trip + item mana yang mau dimasukkan ke tiap trip (bukan auto
  // bin-packing lagi). Concurrency dibatasi (3) biar gak nembak EDP &
  // Cross Docking sekaligus buat semua item.
  async previewItemRequest(req, res) {
    try {
      const items =
        await KarawangItemRequestModel.getTireTripItemsFromRequestOnly();

      if (items.length === 0) {
        return response.success(res, []);
      }

      const enriched = await mapWithConcurrency(items, 3, async (item) => {
        const lookupCode = stripItemSuffix(item.item);

        let stokTangerang = 0;
        let stokKarawang = 0;

        try {
          // Stok Tangerang cuma dihitung kategori OE (bukan OK+OE gabungan)
          const dataTangerang = await ControlStockModel.findLocationsByItem(
            lookupCode,
            "OE",
          );
          stokTangerang = dataTangerang?.summary?.total_qty || 0;
        } catch (err) {
          console.error(
            `previewItemRequest: gagal ambil stok Tangerang untuk ${item.item} (lookup ${lookupCode}):`,
            err.message,
          );
        }

        try {
          const dataKarawang = await KarawangFifoModel.locationsByItem(
            lookupCode,
            "all",
          );
          stokKarawang = dataKarawang?.summary?.total_qty || 0;
        } catch (err) {
          console.error(
            `previewItemRequest: gagal ambil stok Karawang untuk ${item.item} (lookup ${lookupCode}):`,
            err.message,
          );
        }

        return {
          ...item,
          stok_tangerang: stokTangerang,
          stok_karawang: stokKarawang,
        };
      });

      return response.success(res, enriched);
    } catch (err) {
      console.error("TransferPlanController.previewItemRequest gagal:", err);

      return response.error(
        res,
        "Gagal mengambil preview item request beserta stok.",
      );
    }
  }

  async tireTripPlan(req, res) {
    try {
      const kapasitas = Number(req.query.kapasitas || 52);

      if (!kapasitas || kapasitas <= 0) {
        return response.error(res, "Kapasitas trip harus lebih besar dari 0.");
      }

      const items =
        await KarawangItemRequestModel.getTireTripItemsFromRequestOnly();

      const trips = KarawangItemRequestModel.buildTireTrips(items, kapasitas);

      // No Trip / do_number di-generate on-the-fly, urutan 1..N ngikutin
      // urutan trip hasil bin-packing (bukan disimpan ke DB).
      trips.forEach((trip, idx) => {
        trip.trip = idx + 1;
        trip.do_number = KarawangItemRequestModel.generateDoNumber(idx + 1);
      });

      const totalRequest = items.reduce(
        (sum, item) => sum + Number(item.qty || 0),
        0,
      );

      const totalVolume = items.reduce(
        (sum, item) => sum + Number(item.total_volume || 0),
        0,
      );

      return response.success(res, {
        kapasitas,
        total_item: items.length,
        total_request: totalRequest,
        total_qty: totalRequest,
        total_volume: Number(totalVolume.toFixed(3)),
        jumlah_trip: trips.length,
        trips,
      });
    } catch (err) {
      console.error("TransferPlanController.tireTripPlan gagal:", err);

      return response.error(res, "Gagal membuat Tire Trip Plan.");
    }
  }

  // Simpan hasil Trip Plan (yang lagi ditampilkan di halaman) ke histori —
  // 1 baris per trip (No Trip), beserta item + qty request + total volume.
  // Dipanggil tombol "Simpan Trip Plan" di frontend, BUKAN otomatis tiap
  // kali kapasitas di-utak-atik, biar histori gak numpuk data percobaan.
  async saveTripPlan(req, res) {
    try {
      const { trips, kapasitas } = req.body || {};

      if (!Array.isArray(trips) || trips.length === 0) {
        return response.error(res, "Tidak ada data Trip Plan untuk disimpan.", 422);
      }

      const payload = trips.map((trip, idx) => ({
        no_trip:
          trip.do_number ||
          KarawangItemRequestModel.generateDoNumber(trip.trip || idx + 1),
        kapasitas: kapasitas || trip.kapasitas,
        items: Array.isArray(trip.items)
          ? trip.items.map((item) => ({
              item: item.item,
              deskripsi: item.deskripsi,
              qty: item.qty,
              volume: item.volume,
              total_volume: item.total_volume,
            }))
          : [],
      }));

      const totalRows = await KarawangTripPlanModel.bulkCreate(payload);

      return response.success(res, {
        total: totalRows,
        message: `Trip Plan berhasil disimpan (${trips.length} trip, ${totalRows} baris item).`,
      });
    } catch (err) {
      console.error("TransferPlanController.saveTripPlan gagal:", err);

      return response.error(res, err.message || "Gagal menyimpan Trip Plan.");
    }
  }

  // Histori Trip Plan — filter tanggal (dateFrom/dateTo) buat tombol
  // "Filter Riwayat" di halaman Transfer Plan.
  async tripPlanHistory(req, res) {
    try {
      const { dateFrom, dateTo, noTrip } = req.query;

      const rows = await KarawangTripPlanModel.list({
        dateFrom,
        dateTo,
        noTrip,
      });

      return response.success(res, rows);
    } catch (err) {
      console.error("TransferPlanController.tripPlanHistory gagal:", err);

      return response.error(res, "Gagal mengambil histori Trip Plan.");
    }
  }
}

module.exports = new TransferPlanController();
