// src/models/stok-opname-karawang/KarawangTripPlanDraftModel.js
// Draft "Trip Plan" yang lagi dikerjain di halaman Transfer Plan (BELUM
// disimpan ke histori). Payload disimpan mentah sebagai JSON string, isinya
// state React apa adanya (trips, truckCapacity, catatanByTrip, dst) --
// sengaja gak dinormalisasi karena ini cuma draft kerja, bukan data
// transaksi final.
//
// NOTE PENTING: draft di-upsert per tanggal (kolom `tanggal`, isinya
// CURDATE() dari sisi DB) SUPAYA histori antar hari kepisah rapi di tabel.
// TAPI getToday() SENGAJA GAK filter WHERE tanggal = CURDATE() lagi --
// dulu difilter kayak gitu, akibatnya kalau user generate/susun trip plan
// hari ini terus BESOKNYA baru dibuka lagi (belum sempat "Simpan Trip
// Plan"), query bakal nyari baris punya tanggal BESOK yang belum ada,
// draft keliatan "hilang" padahal masih ada di DB cuma nyantol di tanggal
// kemarin. Sekarang getToday() ambil baris PALING BARU (ORDER BY tanggal
// DESC) yang belum di-clear -- baru bener2 "hilang" pas user klik "Simpan
// Trip Plan" (atau clear manual), bukan gara-gara pergantian hari.
const { poolUtama } = require("../../config/database");

class KarawangTripPlanDraftModel {
  // Ambil draft kerja PALING BARU yang belum di-final-save/clear (kalau
  // ada). Return null kalau belum pernah disimpan / udah dikosongin (abis
  // "Simpan Trip Plan").
  static async getToday() {
    const [rows] = await poolUtama.query(
      `SELECT payload, updated_at
       FROM stok_opname_karawang_trip_plan_draft
       ORDER BY tanggal DESC, updated_at DESC
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

  // Kosongin SEMUA draft (bukan cuma tanggal hari ini) -- dipanggil pas
  // "Simpan Trip Plan" berhasil (trip udah pindah status jadi histori
  // final) ATAU pas user clear manual. Sengaja hapus semua baris, bukan
  // cuma WHERE tanggal = CURDATE(), soalnya getToday() sekarang ambil
  // baris PALING BARU tanpa peduli tanggal -- kalau cuma baris hari ini
  // yang dihapus, draft LAMA yang nyantol di tanggal sebelumnya (belum
  // sempat ke-generate ulang/ke-overwrite) bisa nongol lagi pas getToday()
  // dipanggil berikutnya.
  static async clearToday() {
    const [result] = await poolUtama.query(
      `DELETE FROM stok_opname_karawang_trip_plan_draft`,
    );
    return result.affectedRows;
  }
}

module.exports = KarawangTripPlanDraftModel;
