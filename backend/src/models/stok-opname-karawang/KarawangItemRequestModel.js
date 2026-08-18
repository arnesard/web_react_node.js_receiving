const { poolUtama } = require("../../config/database");

class KarawangItemReqModel {
  static async bulkCreate(rows) {
    if (!rows || rows.length === 0) {
      return {
        inserted: 0,
      };
    }

    const values = rows.map((row) => [
      row.date,
      row.jenis,
      row.item,
      row.qty,
      row.ket || "",
    ]);

    const [result] = await poolUtama.query(
      `INSERT INTO stok_opname_karawang_item_req
        (date, jenis, item, qty, ket)
       VALUES ?`,
      [values],
    );

    return {
      inserted: result.affectedRows,
    };
  }

  static async getSummary() {
    const [rows] = await poolUtama.query(`
    SELECT
      r.jenis,
      COUNT(DISTINCT r.item) AS jumlah_item,
      COALESCE(SUM(CAST(r.qty AS UNSIGNED)), 0) AS total_qty,
      COALESCE(
        SUM(
          CAST(r.qty AS DECIMAL(15,3)) *
          COALESCE(m.volume, 0)
        ),
        0
      ) AS total_volume
    FROM stok_opname_karawang_item_req r
    LEFT JOIN stok_opname_karawang_master_item m
      ON r.item = m.code_no
    WHERE r.date = CURDATE()
    GROUP BY r.jenis
    ORDER BY r.jenis
  `);

    return rows;
  }

  static async getTireTripItems() {
    const [rows] = await poolUtama.query(`
    SELECT
      r.id,
      r.item,
      r.qty,
      r.jenis,
      r.date,
      m.description AS deskripsi,
      COALESCE(m.volume, 0) AS volume,
      (
        CAST(r.qty AS DECIMAL(15,3)) *
        COALESCE(m.volume, 0)
      ) AS total_volume
    FROM stok_opname_karawang_item_req r
    LEFT JOIN stok_opname_karawang_master_item m
      ON r.item = m.code_no
    WHERE r.date = CURDATE()
      AND UPPER(r.jenis) = 'TIRE'
    ORDER BY total_volume DESC, r.item ASC
  `);

    console.log("TIRE TRIP ITEMS:", rows);

    return rows;
  }

  static buildTireTrips(items, kapasitas = 52) {
    const capacity = Number(kapasitas);

    if (!capacity || capacity <= 0) {
      throw new Error("Kapasitas trip harus lebih dari 0.");
    }

    const trips = [];

    for (const item of items) {
      let qtyRemaining = Number(item.qty || 0);
      const volumePerQty = Number(item.volume || 0);

      if (qtyRemaining <= 0) continue;

      // Kalau volume item 0, jangan bikin kalkulasi aneh
      if (volumePerQty <= 0) {
        let trip = trips[trips.length - 1];

        if (!trip) {
          trip = {
            trip: trips.length + 1,
            total_qty: 0,
            total_volume: 0,
            items: [],
          };

          trips.push(trip);
        }

        trip.items.push({
          id: item.id,
          item: item.item,
          deskripsi: item.deskripsi,
          qty: qtyRemaining,
          volume: volumePerQty,
          total_volume: 0,
        });

        trip.total_qty += qtyRemaining;

        continue;
      }

      while (qtyRemaining > 0) {
        // Cari trip yang masih punya kapasitas
        let targetTrip = null;
        let bestRemaining = Infinity;

        for (const trip of trips) {
          const remainingCapacity = capacity - trip.total_volume;

          if (
            remainingCapacity >= volumePerQty &&
            remainingCapacity < bestRemaining
          ) {
            targetTrip = trip;
            bestRemaining = remainingCapacity;
          }
        }

        // Kalau tidak ada trip yang muat → buat trip baru
        if (!targetTrip) {
          targetTrip = {
            trip: trips.length + 1,
            total_qty: 0,
            total_volume: 0,
            items: [],
          };

          trips.push(targetTrip);
        }

        const availableVolume = capacity - targetTrip.total_volume;

        const maxQty = Math.floor(
          (availableVolume + Number.EPSILON) / volumePerQty,
        );

        const qtyToPut = Math.min(qtyRemaining, maxQty);

        // Safety supaya tidak infinite loop
        if (qtyToPut <= 0) {
          targetTrip = {
            trip: trips.length + 1,
            total_qty: 0,
            total_volume: 0,
            items: [],
          };

          trips.push(targetTrip);
          continue;
        }

        const volume = qtyToPut * volumePerQty;

        targetTrip.items.push({
          id: item.id,
          item: item.item,
          deskripsi: item.deskripsi,
          qty: qtyToPut,
          volume: volumePerQty,
          total_volume: volume,
        });

        targetTrip.total_qty += qtyToPut;
        targetTrip.total_volume += volume;

        qtyRemaining -= qtyToPut;
      }
    }

    return trips.map((trip) => ({
      ...trip,
      total_volume: Number(trip.total_volume.toFixed(3)),
      utilization: Number(((trip.total_volume / capacity) * 100).toFixed(2)),
      remaining_volume: Number(
        Math.max(capacity - trip.total_volume, 0).toFixed(3),
      ),
    }));
  }
}

module.exports = KarawangItemReqModel;
