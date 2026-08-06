// src/models/stok-opname-karawang/KarawangBatchModel.js
// 1 batch = 1 sesi opname (1x upload excel "Data Detail All Karawang").
// Scan rak/collie di lapangan selalu terikat ke 1 batch_id supaya progress
// opname per periode gak numpuk campur aduk sama opname sebelumnya.
const { poolUtama } = require("../../config/database");

class KarawangBatchModel {
  static async create({ nama_batch, nama_file, id_karyawan_upload }) {
    const [result] = await poolUtama.query(
      `INSERT INTO stok_opname_karawang_batch
        (nama_batch, nama_file, id_karyawan_upload, status)
       VALUES (?, ?, ?, 'aktif')`,
      [nama_batch, nama_file || null, id_karyawan_upload || null],
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await poolUtama.query(
      "SELECT * FROM stok_opname_karawang_batch WHERE id = ?",
      [id],
    );
    return rows[0] || null;
  }

  // Batch yang lagi dipakai buat scan — default-nya batch AKTIF paling baru.
  static async findLatestActive() {
    const [rows] = await poolUtama.query(
      `SELECT * FROM stok_opname_karawang_batch
       WHERE status = 'aktif' ORDER BY id DESC LIMIT 1`,
    );
    return rows[0] || null;
  }

  // Hapus SEMUA data lama (batch + target + scan + lokasi) — dipanggil
  // tiap kali upload excel/csv baru, karena project ini gak butuh nyimpen
  // banyak batch sekaligus, cukup 1 data aktif yang selalu paling baru.
  //
  // PENTING: tabel target/scan/lokasi TIDAK punya foreign key beneran ke
  // batch (lihat catatan di sql/stok_opname_karawang_migration.sql) —
  // jadi hapus 3 tabel itu manual dulu di sini, baru hapus batch-nya.
  // Kalau cuma hapus batch doang, baris lama di target/scan gak pernah
  // kehapus (numpuk terus) dan bikin error "Duplicate entry" pas upload
  // berikutnya, karena kolom `collie` UNIQUE-nya global bukan per-batch.
  static async deleteAll() {
    await poolUtama.query(`DELETE FROM stok_opname_karawang_scan`);
    await poolUtama.query(`DELETE FROM stok_opname_karawang_target`);
    await poolUtama.query(`DELETE FROM stok_opname_karawang_lokasi`);
    await poolUtama.query(`DELETE FROM stok_opname_karawang_batch`);
  }

  static async listAll() {
    const [rows] = await poolUtama.query(
      `SELECT * FROM stok_opname_karawang_batch ORDER BY id DESC`,
    );
    return rows;
  }

  static async updateTotals(id, { total_item, total_collie, total_qty }) {
    await poolUtama.query(
      `UPDATE stok_opname_karawang_batch
       SET total_item = ?, total_collie = ?, total_qty = ?
       WHERE id = ?`,
      [total_item, total_collie, total_qty, id],
    );
  }

  static async setStatus(id, status) {
    await poolUtama.query(
      `UPDATE stok_opname_karawang_batch SET status = ? WHERE id = ?`,
      [status, id],
    );
  }
}

module.exports = KarawangBatchModel;
