// src/controllers/stok-opname-karawang/TransferPlanController.js
// Upload Item Request (Excel) + Tire Trip Planner. Trip planner
// menggabungkan item request jenis TIRE hari ini dengan data Schedule OEM
// dari bpw_dept_db.sch_oem (lihat KarawangItemRequestModel.getTireTripItems).
const KarawangItemRequestModel = require("../../models/stok-opname-karawang/KarawangItemRequestModel");

const ExcelJS = require("exceljs");
const response = require("../../utils/response");

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

  async tireTripPlan(req, res) {
    try {
      const kapasitas = Number(req.query.kapasitas || 52);

      if (!kapasitas || kapasitas <= 0) {
        return response.error(res, "Kapasitas trip harus lebih besar dari 0.");
      }

      const items = await KarawangItemRequestModel.getTireTripItems();

      const trips = KarawangItemRequestModel.buildTireTrips(items, kapasitas);

      const totalQty = items.reduce(
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
        total_qty: totalQty,
        total_volume: Number(totalVolume.toFixed(3)),
        jumlah_trip: trips.length,
        trips,
      });
    } catch (err) {
      console.error("TransferPlanController.tireTripPlan gagal:", err);

      return response.error(res, "Gagal membuat Tire Trip Plan.");
    }
  }
}

module.exports = new TransferPlanController();
