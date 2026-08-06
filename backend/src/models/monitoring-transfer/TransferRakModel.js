// src/models/TransferRakModel.js
// Equivalen App\Models\MonitoringTransferRak\TransferRak (Laravel)
const { poolUtama } = require("../../config/database");

// Join dasar yang sering dipakai berulang (equivalen ->with([...]) di Eloquent)
const BASE_SELECT = `
  SELECT t.*,
         ek.name         AS nama_karyawan,
         ep.name         AS nama_penerima,
         d.nama_karyawan AS nama_supir,
         v.nama_kendaraan AS nama_kendaraan
  FROM transfer_raks t
  LEFT JOIN employees ek ON t.id_karyawan = ek.id
  LEFT JOIN employees ep ON t.id_karyawan_penerima = ep.id
  LEFT JOIN drivers d ON t.id_supir = d.id
  LEFT JOIN vehicles v ON t.id_mobil = v.id
`;

class TransferRakModel {
  static async findById(id) {
    const [rows] = await poolUtama.query(`${BASE_SELECT} WHERE t.id = ?`, [id]);
    return rows[0] || null;
  }

  // Mobil ini masih ada transfer yang sedang 'proses'? (buat join multi-operator)
  static async findProsesByVehicle(vehicleId) {
    const [rows] = await poolUtama.query(
      "SELECT * FROM transfer_raks WHERE id_mobil = ? AND status = 'proses' LIMIT 1",
      [vehicleId],
    );
    return rows[0] || null;
  }

  // Mobil ini masih punya kiriman yang belum diterima sama sekali
  // (status di antara `statuses` DAN waktu_diterima masih NULL)
  static async findNotReceivedByVehicle(vehicleId, statuses) {
    const placeholders = statuses.map(() => "?").join(",");
    const [rows] = await poolUtama.query(
      `SELECT * FROM transfer_raks
       WHERE id_mobil = ? AND status IN (${placeholders}) AND waktu_diterima IS NULL
       LIMIT 1`,
      [vehicleId, ...statuses],
    );
    return rows[0] || null;
  }

  // Kiriman rak ISI (tipe=transfer) milik mobil ini yg masih nunggu diterima
  static async findActiveIsiByVehicle(vehicleId) {
    const [rows] = await poolUtama.query(
      `SELECT * FROM transfer_raks
       WHERE id_mobil = ? AND tipe = 'transfer' AND status IN ('selesai', 'sebagian')
       LIMIT 1`,
      [vehicleId],
    );
    return rows[0] || null;
  }

  // Kiriman rak KOSONG milik mobil ini yg masih nunggu diterima (buat join tambah qty)
  static async findActiveKosongByVehicle(vehicleId) {
    const [rows] = await poolUtama.query(
      `SELECT * FROM transfer_raks
       WHERE id_mobil = ? AND tipe = 'rak_kosong' AND status IN ('selesai', 'sebagian')
       LIMIT 1`,
      [vehicleId],
    );
    return rows[0] || null;
  }

  // Kiriman (isi ATAU kosong) terbaru milik mobil ini yg masih nunggu diterima
  // — dipakai pas scan mobil penerima
  static async findLatestWaitingReceiptByVehicle(vehicleId) {
    const [rows] = await poolUtama.query(
      `${BASE_SELECT}
       WHERE t.id_mobil = ? AND t.status IN ('selesai', 'sebagian')
       ORDER BY t.created_at DESC
       LIMIT 1`,
      [vehicleId],
    );
    return rows[0] || null;
  }

  static async create(data) {
    const {
      tipe = "transfer",
      user_id,
      id_karyawan,
      id_supir,
      id_mobil,
      lokasi_asal,
      jumlah_rak_kosong = 0,
      jumlah_palet_kosong = 0,
      status,
      catatan = null,
      waktu_mulai_now = false,
      waktu_selesai_now = false,
    } = data;

    const [result] = await poolUtama.query(
      `INSERT INTO transfer_raks
        (tipe, user_id, id_karyawan, id_supir, id_mobil, lokasi_asal,
         jumlah_rak_kosong, jumlah_palet_kosong, waktu_mulai, waktu_selesai, status, catatan)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${waktu_mulai_now ? "NOW()" : "NULL"}, ${
         waktu_selesai_now ? "NOW()" : "NULL"
       }, ?, ?)`,
      [
        tipe,
        user_id,
        id_karyawan,
        id_supir,
        id_mobil,
        lokasi_asal,
        jumlah_rak_kosong,
        jumlah_palet_kosong,
        status,
        catatan,
      ],
    );
    return this.findById(result.insertId);
  }

  static async updateStatus(id, status) {
    await poolUtama.query("UPDATE transfer_raks SET status = ? WHERE id = ?", [
      status,
      id,
    ]);
  }

  // Selesai kirim: total_rak final + status selesai
  static async markSelesai(id, totalRak) {
    await poolUtama.query(
      `UPDATE transfer_raks SET waktu_selesai = NOW(), total_rak = ?, status = 'selesai' WHERE id = ?`,
      [totalRak, id],
    );
  }

  // Selesai terima (full): status diterima + info penerima
  static async markDiterima(id, lokasiTujuan, idKaryawanPenerima) {
    await poolUtama.query(
      `UPDATE transfer_raks
       SET status = 'diterima', lokasi_tujuan = ?, id_karyawan_penerima = ?, waktu_diterima = NOW()
       WHERE id = ?`,
      [lokasiTujuan, idKaryawanPenerima, id],
    );
  }

  static async markSebagian(id) {
    await poolUtama.query(
      "UPDATE transfer_raks SET status = 'sebagian' WHERE id = ?",
      [id],
    );
  }

  static async incrementTotalRak(id, amount = 1) {
    await poolUtama.query(
      "UPDATE transfer_raks SET total_rak = total_rak + ? WHERE id = ?",
      [amount, id],
    );
  }

  // Dipakai pas operator BATAL satu scan rak isi (hapus dari daftar kirim)
  static async decrementTotalRak(id, amount = 1) {
    await poolUtama.query(
      "UPDATE transfer_raks SET total_rak = GREATEST(total_rak - ?, 0) WHERE id = ?",
      [amount, id],
    );
  }

  static async incrementRakKosong(id, jmlRak, jmlPalet) {
    await poolUtama.query(
      `UPDATE transfer_raks
       SET jumlah_rak_kosong = jumlah_rak_kosong + ?, jumlah_palet_kosong = jumlah_palet_kosong + ?
       WHERE id = ?`,
      [jmlRak, jmlPalet, id],
    );
  }

  static async appendCatatan(id, catatanBaru) {
    await poolUtama.query(
      `UPDATE transfer_raks
       SET catatan = CASE WHEN catatan IS NULL OR catatan = '' THEN ? ELSE CONCAT(catatan, ' | ', ?) END
       WHERE id = ?`,
      [catatanBaru, catatanBaru, id],
    );
  }

  static async cancel(id) {
    await poolUtama.query(
      "UPDATE transfer_raks SET status = 'batal' WHERE id = ?",
      [id],
    );
  }

  // ── LAPORAN: query terfilter tanggal/operator/supir/kendaraan ──
  static async findForLaporan({
    startDate,
    endDate,
    operator,
    supir,
    kendaraan,
  }) {
    // Filter tanggal pakai waktu_mulai (selalu keisi NOW() pas transfer dibuat),
    // fallback ke created_at kalau waktu_mulai kosong. Jangan andelin created_at
    // doang — kalau kolom itu NULL di data lama, transfer gak akan pernah
    // ketangkep filter tanggal berapa pun (DATE(NULL) selalu gagal dibandingin).
    let sql = `${BASE_SELECT}
      WHERE t.status IN ('selesai', 'diterima', 'sebagian', 'batal')
        AND DATE(COALESCE(t.waktu_mulai, t.created_at)) >= ?
        AND DATE(COALESCE(t.waktu_mulai, t.created_at)) <= ?`;
    const params = [startDate, endDate];

    if (operator) {
      sql += ` AND (
        t.id_karyawan = ? OR t.id_karyawan_penerima = ?
        OR EXISTS (
          SELECT 1 FROM transfer_rak_details trd
          WHERE trd.transfer_rak_id = t.id
            AND (trd.id_karyawan_pengirim = ? OR trd.id_penerima = ?)
        )
      )`;
      params.push(operator, operator, operator, operator);
    }
    if (supir) {
      sql += " AND t.id_supir = ?";
      params.push(supir);
    }
    if (kendaraan) {
      sql += " AND t.id_mobil = ?";
      params.push(kendaraan);
    }
    sql += " ORDER BY t.created_at DESC";

    const [rows] = await poolUtama.query(sql, params);
    return rows;
  }
}

module.exports = TransferRakModel;
