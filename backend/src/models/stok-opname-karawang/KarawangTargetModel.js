// src/models/stok-opname-karawang/KarawangTargetModel.js
// Data acuan/target hasil import excel "Data Detail All Karawang".
// 1 baris = 1 collie (kode di kolom bc_entried_prod), sudah diagregasi dari
// baris per-unit di excel (lihat KarawangController.uploadExcel).
//
// CATATAN (Agustus 2026): sudah gak dipakai lagi buat isi data (upload
// excel udah dihapus dari alur, target sekarang dihitung live dari Cross
// Docking) DAN konsep "batch" sudah dihapus total — kolom `batch_id` udah
// di-drop dari tabel ini juga (lihat
// sql/stok_opname_karawang_drop_batch.sql).
const { poolUtama } = require("../../config/database");

class KarawangTargetModel {
  // rows: [{ rackcode, collie, item, deskripsi, kategori, qty }, ...]
  // Insert per-chunk (mysql2 bulk insert style) biar aman buat ribuan baris.
  static async bulkInsert(rows, chunkSize = 2000) {
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const values = chunk.map((r) => [
        r.rackcode,
        r.collie,
        r.item,
        r.deskripsi || null,
        r.kategori || null,
        r.qty,
      ]);
      await poolUtama.query(
        `INSERT INTO stok_opname_karawang_target
          (rackcode, collie, item, deskripsi, kategori, qty)
         VALUES ?`,
        [values],
      );
    }
  }

  // Dipakai pas scan RAK — cek rak ini kebagian di data target,
  // sekalian tau ada berapa collie & item apa aja menurut excel.
  static async findByRackcode(rackcode) {
    const [rows] = await poolUtama.query(
      `SELECT * FROM stok_opname_karawang_target WHERE rackcode = ?`,
      [rackcode],
    );
    return rows;
  }

  // Ringkasan target per item — dasar kolom "target" di dashboard.
  static async summaryPerItem() {
    const [rows] = await poolUtama.query(
      `SELECT item,
              MAX(deskripsi) as deskripsi,
              COUNT(*) as collie_target,
              SUM(qty) as qty_target
       FROM stok_opname_karawang_target
       GROUP BY item
       ORDER BY item ASC`,
    );
    return rows.map((r) => ({
      item: r.item,
      deskripsi: r.deskripsi,
      collie_target: Number(r.collie_target),
      qty_target: Number(r.qty_target),
    }));
  }

  static async listBarcodeDetails() {
    const [rows] = await poolUtama.query(
      `SELECT collie as barcode,
              item,
              MAX(deskripsi) as deskripsi,
              GROUP_CONCAT(DISTINCT rackcode ORDER BY rackcode SEPARATOR ', ') as rackcodes_upload,
              SUM(qty) as qty_target
       FROM stok_opname_karawang_target
       GROUP BY collie, item
       ORDER BY item ASC, collie ASC`,
    );

    return rows.map((r) => ({
      barcode: r.barcode,
      item: r.item,
      deskripsi: r.deskripsi || "-",
      rackcodes_upload: r.rackcodes_upload || "",
      qty_target: Number(r.qty_target || 0),
    }));
  }
}

module.exports = KarawangTargetModel;
