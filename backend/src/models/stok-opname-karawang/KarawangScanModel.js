// src/models/stok-opname-karawang/KarawangScanModel.js
// Hasil scan rak+collie operator, yang sudah lolos validasi live db pandu
// DAN validasi ke data target (excel). Ini yang dihitung sebagai "sudah
// discan" di dashboard.
//
// CATATAN (Agustus 2026): konsep "batch" (sesi opname per periode) sudah
// dihapus total atas permintaan user — semua data scan nyambung terus,
// gak ada pemisah sesi lagi. Kolom `batch_id` sudah di-drop dari tabel
// stok_opname_karawang_scan (lihat sql/stok_opname_karawang_drop_batch.sql).
// Kalau butuh reset total, pakai tombol "Reset Data Scan" (truncateAll di
// bawah) — itu ngosongin SEMUA baris, bukan per-batch lagi.
const { poolUtama } = require("../../config/database");

class KarawangScanModel {
  static async existsCollie(collie) {
    const [rows] = await poolUtama.query(
      `SELECT id FROM stok_opname_karawang_scan WHERE collie = ?`,
      [collie],
    );
    return rows.length > 0;
  }

  static async create({
    rackcode,
    collie,
    item,
    deskripsi,
    kategori,
    qty,
    id_karyawan,
    loccol,
  }) {
    const [result] = await poolUtama.query(
      `INSERT INTO stok_opname_karawang_scan
        (rackcode, collie, item, deskripsi, kategori, qty, id_karyawan, loccol, waktu_scan)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        rackcode,
        collie,
        item,
        deskripsi || null,
        kategori || null,
        qty,
        id_karyawan || null,
        loccol || null,
      ],
    );
    const [rows] = await poolUtama.query(
      "SELECT * FROM stok_opname_karawang_scan WHERE id = ?",
      [result.insertId],
    );
    return rows[0];
  }

  // Batalkan 1 collie yang salah scan (buat tombol "batal" di UI).
  static async deleteCollie(collie) {
    const [result] = await poolUtama.query(
      `DELETE FROM stok_opname_karawang_scan WHERE collie = ?`,
      [collie],
    );
    return result.affectedRows;
  }

  // Progress 1 rak yang lagi discan — buat info "sudah X dari Y collie".
  static async countByRak(rackcode) {
    const [rows] = await poolUtama.query(
      `SELECT COUNT(*) as total FROM stok_opname_karawang_scan
       WHERE rackcode = ?`,
      [rackcode],
    );
    return Number(rows[0].total);
  }

  // Total pcs (SUM qty) yang udah discan di 1 rak — ini yang jadi progress
  // utama (bukan jumlah collie), karena data target excel gak reliable buat
  // dijadiin patokan jumlah collie (lihat catatan di KarawangController).
  static async sumQtyByRak(rackcode) {
    const [rows] = await poolUtama.query(
      `SELECT COALESCE(SUM(qty),0) as total FROM stok_opname_karawang_scan
       WHERE rackcode = ?`,
      [rackcode],
    );
    return Number(rows[0].total);
  }

  // List collie yang sudah discan di 1 rak, terbaru duluan (buat tampilan
  // daftar scan di halaman mobile).
  static async listByRak(rackcode) {
    const [rows] = await poolUtama.query(
      `SELECT * FROM stok_opname_karawang_scan
       WHERE rackcode = ?
       ORDER BY id DESC`,
      [rackcode],
    );
    return rows;
  }

  // List MENTAH semua collie yang sudah discan untuk 1 item (join nama
  // operator) — dasar buat export Excel per card di Dashboard (kolom
  // Collie + Barcode, lihat KarawangController.exportItemDetail).
  static async listByItem(item) {
    const [rows] = await poolUtama.query(
      `SELECT s.id, s.rackcode, s.collie, s.loccol, s.qty, s.waktu_scan,
              s.id_karyawan, e.employee_id AS employee_id, e.name AS nama
       FROM stok_opname_karawang_scan s
       LEFT JOIN employees e ON e.id = s.id_karyawan
       WHERE s.item = ?
       ORDER BY s.rackcode ASC, s.waktu_scan ASC`,
      [item],
    );
    return rows.map((r) => ({
      rackcode: r.rackcode,
      collie: r.collie,
      loccol: r.loccol,
      qty: Number(r.qty),
      waktu_scan: r.waktu_scan,
      id_karyawan: r.id_karyawan,
      employee_id: r.employee_id || null,
      nama: r.nama || (r.id_karyawan ? `#${r.id_karyawan}` : "Tanpa PIC"),
    }));
  }

  // Ringkasan realisasi per item — dasar kolom "sudah discan" di dashboard.
  static async summaryPerItem() {
    const [rows] = await poolUtama.query(
      `SELECT item,
              COUNT(*) as collie_scanned,
              SUM(qty) as qty_scanned
       FROM stok_opname_karawang_scan
       GROUP BY item`,
    );
    return rows.map((r) => ({
      item: r.item,
      collie_scanned: Number(r.collie_scanned),
      qty_scanned: Number(r.qty_scanned),
    }));
  }

  // Breakdown per item PER RAK — dipakai modal detail item di dashboard buat
  // nampilin rak mana aja yang udah discan buat item ini (beda dari
  // distinctRackcodes yang gak dipecah per item).
  static async summaryPerItemPerRak() {
    const [rows] = await poolUtama.query(
      `SELECT item,
              rackcode,
              loccol,
              COUNT(*) as collie_scanned,
              SUM(qty) as qty_scanned
       FROM stok_opname_karawang_scan
       GROUP BY item, rackcode, loccol
       ORDER BY qty_scanned DESC`,
    );
    return rows.map((r) => ({
      item: r.item,
      rackcode: r.rackcode,
      loccol: r.loccol,
      collie_scanned: Number(r.collie_scanned),
      qty_scanned: Number(r.qty_scanned),
    }));
  }

  // Breakdown per item PER OPERATOR + PER RAK sekaligus (gabungan, bukan
  // 2 tabel terpisah) — dipakai modal detail item di dashboard biar
  // operator, rak, dan lokasi yang dia scan ketemu dalam 1 baris yang
  // sama, bukan 2 tabel yang berdiri sendiri-sendiri.
  static async summaryPerItemPerPicRak() {
    const [rows] = await poolUtama.query(
      `SELECT s.item,
              s.id_karyawan,
              e.employee_id AS employee_id,
              e.name AS nama_karyawan,
              s.rackcode,
              s.loccol,
              COUNT(*) as collie_scanned,
              SUM(s.qty) as qty_scanned
       FROM stok_opname_karawang_scan s
       LEFT JOIN employees e ON e.id = s.id_karyawan
       GROUP BY s.item, s.id_karyawan, e.employee_id, e.name, s.rackcode, s.loccol
       ORDER BY qty_scanned DESC`,
    );
    return rows.map((r) => ({
      item: r.item,
      id_karyawan: r.id_karyawan,
      employee_id: r.employee_id || null,
      nama_karyawan:
        r.nama_karyawan || (r.id_karyawan ? `#${r.id_karyawan}` : "Tanpa PIC"),
      rackcode: r.rackcode,
      loccol: r.loccol,
      collie_scanned: Number(r.collie_scanned),
      qty_scanned: Number(r.qty_scanned),
    }));
  }

  // Breakdown per item PER PIC (karyawan yang scan) — join ke tabel
  // employees buat dapetin nama, dipakai dashboard buat nampilin siapa
  // yang ngerjain item apa (KarawangController.dashboard).
  static async summaryPerItemPerPic() {
    const [rows] = await poolUtama.query(
      `SELECT s.item,
              s.id_karyawan,
              e.employee_id AS employee_id,
              e.name AS nama_karyawan,
              COUNT(*) as collie_scanned,
              SUM(s.qty) as qty_scanned
       FROM stok_opname_karawang_scan s
       LEFT JOIN employees e ON e.id = s.id_karyawan
       GROUP BY s.item, s.id_karyawan, e.employee_id, e.name
       ORDER BY qty_scanned DESC`,
    );
    return rows.map((r) => ({
      item: r.item,
      id_karyawan: r.id_karyawan,
      employee_id: r.employee_id || null,
      nama_karyawan:
        r.nama_karyawan || (r.id_karyawan ? `#${r.id_karyawan}` : "Tanpa PIC"),
      collie_scanned: Number(r.collie_scanned),
      qty_scanned: Number(r.qty_scanned),
    }));
  }

  // Rak-rak unik yang udah pernah discan — dipakai buat scope target LIVE
  // Cross Docking di dashboard (gantiin scope lokasi hasil upload manual
  // yang udah dihapus, lihat KarawangController).
  static async distinctRackcodes() {
    const [rows] = await poolUtama.query(
      `SELECT DISTINCT rackcode FROM stok_opname_karawang_scan`,
    );
    return rows.map((r) => r.rackcode);
  }

  static async totals() {
    const [rows] = await poolUtama.query(
      `SELECT COUNT(*) as total_collie, COALESCE(SUM(qty),0) as total_qty
       FROM stok_opname_karawang_scan`,
    );
    return {
      total_collie: Number(rows[0].total_collie),
      total_qty: Number(rows[0].total_qty),
    };
  }

  // TRUNCATE total tabel scan — dipakai tombol "Reset Data Scan" di
  // Dashboard (dilindungi sandi, lihat KarawangController.truncateScan).
  static async truncateAll() {
    await poolUtama.query(`TRUNCATE TABLE stok_opname_karawang_scan`);
  }
}

module.exports = KarawangScanModel;
