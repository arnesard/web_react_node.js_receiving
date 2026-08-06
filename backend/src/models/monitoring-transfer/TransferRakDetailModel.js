// src/models/TransferRakDetailModel.js
// Equivalen App\Models\MonitoringTransferRak\TransferRakDetail (Laravel)
const { poolUtama } = require("../../config/database");

class TransferRakDetailModel {
  static async countByTransfer(transferId) {
    const [rows] = await poolUtama.query(
      "SELECT COUNT(*) as total FROM transfer_rak_details WHERE transfer_rak_id = ?",
      [transferId],
    );
    return Number(rows[0].total);
  }

  static async countReceivedByTransfer(transferId) {
    const [rows] = await poolUtama.query(
      `SELECT COUNT(*) as total FROM transfer_rak_details
       WHERE transfer_rak_id = ? AND waktu_diterima IS NOT NULL`,
      [transferId],
    );
    return Number(rows[0].total);
  }

  static async existsKodeRak(transferId, kodeRak) {
    const [rows] = await poolUtama.query(
      "SELECT id FROM transfer_rak_details WHERE transfer_rak_id = ? AND kode_rak = ?",
      [transferId, kodeRak],
    );
    return rows.length > 0;
  }

  static async findByTransferAndKode(transferId, kodeRak) {
    const [rows] = await poolUtama.query(
      "SELECT * FROM transfer_rak_details WHERE transfer_rak_id = ? AND kode_rak = ?",
      [transferId, kodeRak],
    );
    return rows[0] || null;
  }

  static async create({
    transfer_rak_id,
    kode_rak,
    id_karyawan_pengirim,
    id_lokasi_asal = null,
    lokasi_asal = null,
    item = null,
    qty = null,
    kategori = null,
    deskripsi = null,
  }) {
    const [result] = await poolUtama.query(
      `INSERT INTO transfer_rak_details
        (transfer_rak_id, kode_rak, id_lokasi_asal, lokasi_asal, item, qty, kategori, deskripsi, id_karyawan_pengirim, waktu_scan)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        transfer_rak_id,
        kode_rak,
        id_lokasi_asal,
        lokasi_asal,
        item,
        qty,
        kategori,
        deskripsi,
        id_karyawan_pengirim,
      ],
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await poolUtama.query(
      "SELECT * FROM transfer_rak_details WHERE id = ?",
      [id],
    );
    return rows[0] || null;
  }

  // Semua detail rak + nama pengirim & penerima (buat laporan/detail)
  static async findAllByTransfer(transferId) {
    const [rows] = await poolUtama.query(
      `SELECT d.*,
              ep.name AS nama_pengirim,
              er.name AS nama_penerima
       FROM transfer_rak_details d
       LEFT JOIN employees ep ON d.id_karyawan_pengirim = ep.id
       LEFT JOIN employees er ON d.id_penerima = er.id
       WHERE d.transfer_rak_id = ?
       ORDER BY d.id ASC`,
      [transferId],
    );
    return rows;
  }

  // Rak yang belum diterima (dipakai di scanMobilPenerima)
  static async unreceivedList(transferId) {
    const [rows] = await poolUtama.query(
      `SELECT id, kode_rak, id_lokasi_asal, lokasi_asal, item, qty, kategori, deskripsi, waktu_scan
       FROM transfer_rak_details
       WHERE transfer_rak_id = ? AND waktu_diterima IS NULL
       ORDER BY id ASC`,
      [transferId],
    );
    return rows;
  }

  // Ringkasan jumlah rak per lokasi asal dalam 1 sesi transfer — dipakai buat
  // nampilin badge "Plan I: 3 rak · Plan H: 3 rak" di monitoring & terima,
  // karena 1 sesi kirim sekarang bisa punya lebih dari 1 lokasi asal.
  static async originBreakdown(transferId) {
    const [rows] = await poolUtama.query(
      `SELECT COALESCE(lokasi_asal, '-') as lokasi_asal,
              COUNT(*) as total,
              SUM(CASE WHEN waktu_diterima IS NOT NULL THEN 1 ELSE 0 END) as sudah_diterima
       FROM transfer_rak_details
       WHERE transfer_rak_id = ?
       GROUP BY lokasi_asal
       ORDER BY MIN(id) ASC`,
      [transferId],
    );
    return rows.map((r) => ({
      lokasi_asal: r.lokasi_asal,
      total: Number(r.total),
      sudah_diterima: Number(r.sudah_diterima),
    }));
  }

  // Hapus 1 rak yang salah scan di sisi KIRIM, selama belum diterima.
  // (mirror dari tombol BATAL yang udah ada di sisi Terima)
  static async deleteUnreceived(transferId, kodeRak) {
    const [result] = await poolUtama.query(
      `DELETE FROM transfer_rak_details
       WHERE transfer_rak_id = ? AND kode_rak = ? AND waktu_diterima IS NULL`,
      [transferId, kodeRak],
    );
    return result.affectedRows;
  }

  // Nama-nama pengirim unik yang ikut scan di satu transfer
  static async distinctPengirimNames(transferId) {
    const [rows] = await poolUtama.query(
      `SELECT DISTINCT e.name
       FROM transfer_rak_details d
       JOIN employees e ON d.id_karyawan_pengirim = e.id
       WHERE d.transfer_rak_id = ? AND d.id_karyawan_pengirim IS NOT NULL`,
      [transferId],
    );
    return rows.map((r) => r.name);
  }

  // Nama-nama penerima unik yang menerima rak di satu transfer
  static async distinctPenerimaNames(transferId) {
    const [rows] = await poolUtama.query(
      `SELECT DISTINCT e.name
       FROM transfer_rak_details d
       JOIN employees e ON d.id_penerima = e.id
       WHERE d.transfer_rak_id = ? AND d.id_penerima IS NOT NULL`,
      [transferId],
    );
    return rows.map((r) => r.name);
  }

  // Tandai satu kode_rak sebagai diterima (hanya kalau belum diterima)
  static async markReceived(transferId, kodeRak, lokasiTujuan, idPenerima) {
    const [result] = await poolUtama.query(
      `UPDATE transfer_rak_details
       SET lokasi_diterima = ?, id_penerima = ?, waktu_diterima = NOW()
       WHERE transfer_rak_id = ? AND kode_rak = ? AND waktu_diterima IS NULL`,
      [lokasiTujuan, idPenerima, transferId, kodeRak],
    );
    return result.affectedRows;
  }
}

module.exports = TransferRakDetailModel;
