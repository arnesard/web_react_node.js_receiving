// src/models/stok-opname-karawang/KarawangTripPlanModel.js
// Histori "Tire Trip Plan" — tersimpan pas user klik "Simpan Trip Plan" di
// halaman Transfer Plan (frontend/src/pages/stok-opname-karawang/TransferPlanPage.jsx).
// 1 tabel aja (stok_opname_karawang_trip_plan), 1 baris per item per trip —
// no_trip diulang tiap baris item-nya.
const { poolUtama } = require("../../config/database");

class KarawangTripPlanModel {
  // Simpan banyak trip sekaligus (1 kali "Buat Trip Plan" = beberapa trip,
  // tiap trip punya beberapa item) — flatten jadi banyak baris item.
  // trips: [{ no_trip, kapasitas, items: [{ item, deskripsi, qty, volume, total_volume }] }]
  static async bulkCreate(trips) {
    if (!Array.isArray(trips) || trips.length === 0) {
      return 0;
    }

    // Ambil tanggal dari sisi DB (bukan Date() di JS) biar konsisten sama
    // pola lain di modul ini (hindari selisih jam gara-gara device clock).
    const [[{ today }]] = await poolUtama.query(`SELECT CURDATE() AS today`);

    const values = [];
    trips.forEach((trip) => {
      (trip.items || []).forEach((item) => {
        values.push([
          trip.no_trip,
          today,
          Number(trip.kapasitas || 0),
          item.item,
          item.deskripsi || null,
          Number(item.qty || 0),
          Number(item.volume || 0),
          Number(item.total_volume || 0),
        ]);
      });
    });

    if (values.length === 0) return 0;

    const [result] = await poolUtama.query(
      `INSERT INTO stok_opname_karawang_trip_plan
        (no_trip, tanggal, kapasitas, item, deskripsi, qty, volume, total_volume)
       VALUES ?`,
      [values],
    );

    return result.affectedRows;
  }

  // filters: { dateFrom, dateTo, noTrip } — semua opsional.
  // Return: array header per (tanggal + no_trip), masing-masing bawa
  // items[] hasil grouping di JS (tabelnya sendiri flat/denormalisasi).
  static async list(filters = {}, limit = 200) {
    const where = [];
    const params = [];

    if (filters.dateFrom) {
      where.push("tanggal >= ?");
      params.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      where.push("tanggal <= ?");
      params.push(filters.dateTo);
    }
    if (filters.noTrip) {
      where.push("no_trip LIKE ?");
      params.push(`%${filters.noTrip}%`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [rows] = await poolUtama.query(
      `SELECT *
       FROM stok_opname_karawang_trip_plan
       ${whereSql}
       ORDER BY tanggal DESC, no_trip DESC, id ASC`,
      params,
    );

    // Grouping jadi header per (tanggal, no_trip)
    const map = new Map();

    rows.forEach((row) => {
      const key = `${row.tanggal}_${row.no_trip}`;

      if (!map.has(key)) {
        map.set(key, {
          id: key,
          no_trip: row.no_trip,
          tanggal: row.tanggal,
          kapasitas: Number(row.kapasitas || 0),
          created_at: row.created_at,
          items: [],
          total_qty: 0,
          total_volume: 0,
        });
      }

      const trip = map.get(key);

      trip.items.push(row);
      trip.total_qty += Number(row.qty || 0);
      trip.total_volume += Number(row.total_volume || 0);
    });

    const result = Array.from(map.values()).map((trip) => {
      const totalVolume = Number(trip.total_volume.toFixed(3));

      return {
        ...trip,
        jumlah_item: trip.items.length,
        total_volume: totalVolume,
        utilization:
          trip.kapasitas > 0
            ? Number(((totalVolume / trip.kapasitas) * 100).toFixed(2))
            : 0,
      };
    });

    return result.slice(0, limit);
  }

  static async removeTrip(noTrip, tanggal) {
    const [result] = await poolUtama.query(
      `DELETE FROM stok_opname_karawang_trip_plan WHERE no_trip = ? AND tanggal = ?`,
      [noTrip, tanggal],
    );
    return result.affectedRows;
  }
}

module.exports = KarawangTripPlanModel;
