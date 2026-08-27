// src/models/stok-opname-karawang/KarawangTripPlanDraftModel.js
// Draft "Trip Plan" yang lagi dikerjain di halaman Transfer Plan (BELUM
// disimpan ke histori). 1 baris per tanggal (CURDATE() dari sisi DB, biar
// konsisten sama pola lain di modul ini -- lihat KarawangTripPlanModel).
// Payload disimpan mentah sebagai JSON string, isinya state React apa
// adanya (trips, truckCapacity, catatanByTrip, dst) -- sengaja gak
// dinormalisasi karena ini cuma draft kerja, bukan data transaksi final.
const { poolUtama } = require("../../config/database");

class KarawangTripPlanDraftModel {
  // Ambil draft hari ini (kalau ada). Return null kalau belum pernah
  // disimpan / udah dikosongin (abis "Simpan Trip Plan").
  static async getToday() {
    const [rows] = await poolUtama.query(
      `SELECT payload, updated_at
       FROM stok_opname_karawang_trip_plan_draft
       WHERE tanggal = CURDATE()
       LIMIT 1`,
    );

    if (!rows.length) return null;

    try {
      return {
        payload: JSON.parse(rows[0].payload),
        updated_at: rows[0].updated_at,
      };
    } catch (err) {
      console.error("KarawangTripPlanDraftModel.getToday: payload rusak:", err);
      return null;
    }
  }

  // Upsert draft hari ini -- dipanggil berkala (debounced) dari frontend
  // tiap kali manualTrips berubah, jadi selalu nyimpen state PALING BARU.
  static async saveToday(payload) {
    const json = JSON.stringify(payload || {});

    await poolUtama.query(
      `INSERT INTO stok_opname_karawang_trip_plan_draft (tanggal, payload)
       VALUES (CURDATE(), ?)
       ON DUPLICATE KEY UPDATE payload = VALUES(payload)`,
      [json],
    );

    return true;
  }

  // Kosongin draft hari ini -- dipanggil pas "Simpan Trip Plan" berhasil
  // (trip udah pindah status jadi histori final, draft kerja gak relevan
  // lagi).
  static async clearToday() {
    const [result] = await poolUtama.query(
      `DELETE FROM stok_opname_karawang_trip_plan_draft WHERE tanggal = CURDATE()`,
    );
    return result.affectedRows;
  }
}

module.exports = KarawangTripPlanDraftModel;
