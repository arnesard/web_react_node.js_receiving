// src/controllers/stok-opname-karawang/KarawangTireTubePairingController.js
// Admin master pasangan Tire (tubetype) <-> Tube. File Excel sumbernya
// (contoh: "Panduan Setting Tire Tubetype dengan Tube") layout-nya:
// kolom A-C = No/Code/Description TUBE, kolom D-F = No/Code/Description
// TIRE, kolom G = Customer. Baris tube DI-MERGE ke beberapa baris tire
// (1 tube bisa dipasangin ke banyak tire) — makanya kalau kolom tube kosong
// di suatu baris, itu "warisan" dari baris tube terakhir yang keisi
// (merged cell), BUKAN berarti tire itu gak punya pasangan.
const ExcelJS = require("exceljs");
const KarawangTireTubePairingModel = require("../../models/stok-opname-karawang/KarawangTireTubePairingModel");
const response = require("../../utils/response");

function parseWorksheet(worksheet) {
  const rows = [];
  let lastTubeCode = "";
  let lastTubeDescription = "";

  worksheet.eachRow((row) => {
    const tubeCode = String(row.getCell(2).value ?? "").trim();
    const tubeDescription = String(row.getCell(3).value ?? "").trim();
    const tireCode = String(row.getCell(5).value ?? "").trim();
    const tireDescription = String(row.getCell(6).value ?? "").trim();
    const customer = String(row.getCell(7).value ?? "").trim();

    // Baris valid = ada kode tire-nya. Baris judul/header/section label
    // ("TUBE LOKAL", "NO", "CODE", dst) gak punya kode tire di kolom E,
    // jadi otomatis ke-skip.
    if (!tireCode || tireCode.toUpperCase() === "CODE") return;

    // Merged cell: kolom tube kosong -> warisan dari baris sebelumnya.
    if (tubeCode) {
      lastTubeCode = tubeCode;
      lastTubeDescription = tubeDescription;
    }

    if (!lastTubeCode) return; // belum ketemu tube pasangan sama sekali, skip

    rows.push({
      tire_code: tireCode,
      tire_description: tireDescription || null,
      tube_code: lastTubeCode,
      tube_description: lastTubeDescription || null,
      customer: customer || null,
    });
  });

  return rows;
}

class KarawangTireTubePairingController {
  async list(req, res) {
    try {
      const rows = await KarawangTireTubePairingModel.list();
      return response.success(res, rows);
    } catch (err) {
      console.error("KarawangTireTubePairingController.list gagal:", err);
      return response.error(res, "Gagal mengambil data master Tire-Tube.");
    }
  }

  // Lookup banyak tire_code sekaligus, dipakai Transfer Plan preload map
  // pasangan begitu halaman dibuka.
  async lookupByTireCodes(req, res) {
    try {
      const codes = String(req.query.codes || "")
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);

      const rows = await KarawangTireTubePairingModel.findByTireCodes(codes);
      return response.success(res, rows);
    } catch (err) {
      console.error(
        "KarawangTireTubePairingController.lookupByTireCodes gagal:",
        err,
      );
      return response.error(res, "Gagal mengambil pasangan Tire-Tube.");
    }
  }

  async upload(req, res) {
    try {
      if (!req.file) {
        return response.error(res, "File Excel wajib dipilih.", 422);
      }

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);

      if (workbook.worksheets.length === 0) {
        return response.error(res, "Sheet Excel tidak ditemukan.", 422);
      }

      // Baca SEMUA sheet (file contoh punya 2 sheet, BPW-F-63 & (2)),
      // digabung lalu di-upsert bareng (dedup otomatis by tire_code lewat
      // ON DUPLICATE KEY di bulkUpsert).
      let rows = [];
      workbook.worksheets.forEach((ws) => {
        rows = rows.concat(parseWorksheet(ws));
      });

      if (rows.length === 0) {
        return response.error(
          res,
          "Tidak ada baris pasangan Tire-Tube yang terbaca dari file ini.",
          422,
        );
      }

      const result = await KarawangTireTubePairingModel.bulkUpsert(rows);

      return response.success(res, {
        total: result.inserted,
        message: `${rows.length} pasangan Tire-Tube berhasil diimport.`,
      });
    } catch (err) {
      console.error("KarawangTireTubePairingController.upload gagal:", err);
      return response.error(
        res,
        err.message || "Gagal memproses file Excel.",
        422,
      );
    }
  }

  async create(req, res) {
    try {
      const id = await KarawangTireTubePairingModel.create(req.body || {});
      return response.success(res, { id });
    } catch (err) {
      console.error("KarawangTireTubePairingController.create gagal:", err);
      return response.error(res, err.message || "Gagal menambah pasangan.", 422);
    }
  }

  async update(req, res) {
    try {
      await KarawangTireTubePairingModel.update(req.params.id, req.body || {});
      return response.success(res, { message: "Pasangan berhasil diupdate." });
    } catch (err) {
      console.error("KarawangTireTubePairingController.update gagal:", err);
      return response.error(res, err.message || "Gagal update pasangan.", 422);
    }
  }

  async remove(req, res) {
    try {
      await KarawangTireTubePairingModel.remove(req.params.id);
      return response.success(res, { message: "Pasangan berhasil dihapus." });
    } catch (err) {
      console.error("KarawangTireTubePairingController.remove gagal:", err);
      return response.error(res, "Gagal menghapus pasangan.");
    }
  }
}

module.exports = new KarawangTireTubePairingController();
