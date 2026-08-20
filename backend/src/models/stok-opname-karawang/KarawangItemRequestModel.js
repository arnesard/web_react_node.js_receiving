const { poolUtama, poolCrossDocking } = require("../../config/database");

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

  // Qty TIRE gabungan dari 3 sumber, per kode item (TRIM+UPPER) — dipakai
  // bareng oleh getSummary() (card ringkasan) dan getTireTripItems() (trip
  // planner) biar dua-duanya selalu sinkron:
  // 1. Upload Item Request manual (stok_opname_karawang_item_req, jenis
  //    TIRE, hari ini)
  // 2. Schedule OEM dari database EDP dept BPW (bpw_dept_db.sch_oem),
  //    difilter DATE(updated_at) = hari ini
  // 3. Cross Docking DO (fginvc_cd.do_cd, server terpisah) — outstanding
  //    (requested - shipped) buat DO dengan ydo_date hari ini. Item yang
  //    udah full shipped (outstanding <= 0) dibuang.
  // Digabung di JS (bukan SQL UNION) karena do_cd ada di server database
  // yang beda (poolCrossDocking, host DB_CD_HOST) — gak bisa di-JOIN/UNION
  // langsung sama tabel di poolUtama.
  static async _getCombinedTireQtyMap() {
    const [reqRows] = await poolUtama.query(`
      SELECT TRIM(UPPER(item)) AS item, SUM(CAST(qty AS DECIMAL(15,3))) AS qty
      FROM stok_opname_karawang_item_req
      WHERE date = CURDATE() AND UPPER(jenis) LIKE 'OE TIRE%'
      GROUP BY TRIM(UPPER(item))
    `);

    const [schRows] = await poolUtama.query(`
      SELECT TRIM(UPPER(item)) AS item, SUM(CAST(qty AS DECIMAL(15,3))) AS qty
      FROM bpw_dept_db.sch_oem
      WHERE DATE(updated_at) = CURDATE()
      GROUP BY TRIM(UPPER(item))
    `);

    const [doCdRows] = await poolCrossDocking.query(`
      SELECT
        TRIM(UPPER(item)) AS item,
        descr AS deskripsi,
        SUM(CAST(requested AS SIGNED) - CAST(shipped AS SIGNED)) AS qty
      FROM do_cd
      WHERE ydo_date = DATE_FORMAT(CURDATE(), '%Y%m%d')
      GROUP BY TRIM(UPPER(item)), descr
      HAVING qty > 0
    `);

    const map = new Map();
    const addQty = (item, qty, deskripsi) => {
      if (!item || !qty) return;
      const existing = map.get(item);
      if (existing) {
        existing.qty += qty;
        if (!existing.deskripsi && deskripsi) existing.deskripsi = deskripsi;
      } else {
        map.set(item, { item, qty, deskripsi: deskripsi || null });
      }
    };

    reqRows.forEach((r) => addQty(r.item, Number(r.qty || 0)));
    schRows.forEach((r) => addQty(r.item, Number(r.qty || 0)));
    doCdRows.forEach((r) => addQty(r.item, Number(r.qty || 0), r.deskripsi));

    // Buang item yang qty akhirnya <= 0 (mis. do_cd yang udah full shipped
    // tapi ada koreksi minus dari sumber lain)
    for (const [key, val] of map.entries()) {
      if (val.qty <= 0) map.delete(key);
    }

    return map;
  }

  static async getSummary() {
    // Kategori selain TIRE (RIMBAND/TUBE/VALVE/dst) — murni dari upload
    // Excel manual, sama seperti sebelumnya.
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
      AND UPPER(r.jenis) NOT LIKE 'OE TIRE%'
    GROUP BY r.jenis
  `);

    // Kategori TIRE dihitung terpisah, gabungan item_req + sch_oem + do_cd.
    const tireMap = await this._getCombinedTireQtyMap();
    if (tireMap.size > 0) {
      const itemCodes = Array.from(tireMap.keys());
      const [masterRows] = await poolUtama.query(
        `SELECT TRIM(UPPER(code_no)) AS code_no, COALESCE(volume, 0) AS volume
         FROM stok_opname_karawang_master_item
         WHERE TRIM(UPPER(code_no)) IN (?)`,
        [itemCodes],
      );
      const volumeMap = new Map(
        masterRows.map((m) => [m.code_no, Number(m.volume || 0)]),
      );

      let totalQty = 0;
      let totalVolume = 0;
      for (const [item, { qty }] of tireMap.entries()) {
        totalQty += qty;
        totalVolume += qty * (volumeMap.get(item) || 0);
      }

      rows.push({
        jenis: "TIRE",
        jumlah_item: itemCodes.length,
        total_qty: totalQty,
        total_volume: totalVolume,
      });
    }

    rows.sort((a, b) => String(a.jenis).localeCompare(String(b.jenis)));

    return rows;
  }

  // Item TIRE (qty + deskripsi + volume) buat Tire Trip Plan — gabungan 3
  // sumber lewat _getCombinedTireQtyMap(), lalu di-enrich volume/deskripsi
  // dari master_item (fallback ke deskripsi bawaan do_cd kalau item gak
  // ketemu di master_item).
  static async getTireTripItems() {
    const tireMap = await this._getCombinedTireQtyMap();
    if (tireMap.size === 0) return [];

    const itemCodes = Array.from(tireMap.keys());
    // NOTE: kolom berat di bawah ini diasumsikan namanya "berat" di tabel
    // stok_opname_karawang_master_item (sumbernya sama kayak sheet "DATA
    // BERAT & VOLUME" — kolom Berat(Kg) & Volume(M3)). Kalau nama kolom
    // beratnya beda (misal weight/berat_kg), tinggal ganti di SELECT ini.
    const [masterRows] = await poolUtama.query(
      `SELECT TRIM(UPPER(code_no)) AS code_no, description, volume, berat
       FROM stok_opname_karawang_master_item
       WHERE TRIM(UPPER(code_no)) IN (?)`,
      [itemCodes],
    );
    const masterMap = new Map(masterRows.map((m) => [m.code_no, m]));

    const rows = itemCodes.map((item) => {
      const { qty, deskripsi: fallbackDeskripsi } = tireMap.get(item);
      const master = masterMap.get(item);
      const volume = Number(master?.volume || 0);
      const berat = Number(master?.berat || 0);
      const deskripsi = master?.description || fallbackDeskripsi || "-";
      return {
        item,
        qty,
        deskripsi,
        volume,
        total_volume: Number((qty * volume).toFixed(3)),
        berat,
        total_berat: Number((qty * berat).toFixed(2)),
      };
    });

    rows.sort(
      (a, b) => b.total_volume - a.total_volume || a.item.localeCompare(b.item),
    );

    console.log("TIRE TRIP ITEMS:", rows);

    return rows;
  }

  // Trip Planner (Manual): qty Request MURNI dari Upload Item Request
  // manual (stok_opname_karawang_item_req, SEMUA jenis hari ini — TIRE,
  // OE TUBE, OE VALVE, dst) — TIDAK digabung sama sch_oem/do_cd lagi (beda
  // dengan _getCombinedTireQtyMap yang masih dipakai getSummary buat card
  // ringkasan & khusus TIRE). Dulu fungsi ini cuma filter 'OE TIRE%' karena
  // Trip Plan awalnya cuma buat tire; sekarang manual trip planning juga
  // ngover OE TUBE/OE VALVE makanya filter jenis-nya dibuka semua.
  static async getTireTripItemsFromRequestOnly() {
    const [reqRows] = await poolUtama.query(`
      SELECT TRIM(UPPER(item)) AS item, SUM(CAST(qty AS DECIMAL(15,3))) AS qty
      FROM stok_opname_karawang_item_req
      WHERE date = CURDATE()
      GROUP BY TRIM(UPPER(item))
    `);

    if (reqRows.length === 0) return [];

    const itemCodes = reqRows.map((r) => r.item);

    // NOTE: sama seperti getTireTripItems() — ganti nama kolom "berat" di
    // sini kalau nama aslinya di tabel master_item beda.
    const [masterRows] = await poolUtama.query(
      `SELECT TRIM(UPPER(code_no)) AS code_no, description, volume, berat
       FROM stok_opname_karawang_master_item
       WHERE TRIM(UPPER(code_no)) IN (?)`,
      [itemCodes],
    );
    const masterMap = new Map(masterRows.map((m) => [m.code_no, m]));

    return reqRows.map((r) => {
      const qty = Number(r.qty || 0);
      const master = masterMap.get(r.item);
      const volume = Number(master?.volume || 0);
      const berat = Number(master?.berat || 0);
      const deskripsi = master?.description || "-";

      return {
        item: r.item,
        qty,
        deskripsi,
        volume,
        total_volume: Number((qty * volume).toFixed(3)),
        berat,
        total_berat: Number((qty * berat).toFixed(2)),
      };
    });
  }

  // No Trip / do_number generate on-the-fly (gak disimpan ke DB), format
  // sama kayak pola do_number Cross Docking: T-2 + tanggal DDMMYY + urutan
  // 3 digit (001, 002, dst), reset tiap hari & tiap kali halaman dibuka.
  static generateDoNumber(sequence) {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yy = String(now.getFullYear()).slice(-2);
    const seq = String(sequence).padStart(3, "0");

    return `T-2${dd}${mm}${yy}${seq}`;
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
          request_qty: qtyRemaining,
          volume: volumePerQty,
          total_volume: 0,
          berat: Number(item.berat || 0),
          total_berat: Number(
            (qtyRemaining * Number(item.berat || 0)).toFixed(2),
          ),
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
        const beratPerQty = Number(item.berat || 0);

        targetTrip.items.push({
          id: item.id,
          item: item.item,
          deskripsi: item.deskripsi,
          qty: qtyToPut,
          request_qty: qtyToPut,
          volume: volumePerQty,
          total_volume: volume,
          berat: beratPerQty,
          total_berat: Number((qtyToPut * beratPerQty).toFixed(2)),
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
