// src/models/stok-opname-karawang/KarawangTireTubePairingModel.js
// Master pasangan Tire (tubetype) <-> Tube. Satu tire_code cuma boleh
// punya satu tube_code pasangan (UNIQUE tire_code di tabel), jadi
// import/upsert selalu "replace" pasangan lama kalau tire_code sama.
const { poolUtama } = require("../../config/database");

const norm = (v) =>
  String(v || "")
    .trim()
    .toUpperCase();

class KarawangTireTubePairingModel {
  // JOIN ke master_item buat narik volume/berat TUBE-nya sekalian — tube
  // gak pernah masuk Item Request (yang diupload cuma TIRE), jadi
  // volume/berat-nya gak ada di previewItems frontend; kudu nebeng dari
  // sini biar pas tube di-auto-add ke trip, kubikasinya kehitung bener.
  // NOTE COLLATE: tabel tire_tube_pairing (baru, default MySQL 8 ->
  // utf8mb4_0900_ai_ci) beda collation sama master_item (lama ->
  // utf8mb4_general_ci). Tanpa di-samain manual, MySQL nolak JOIN-nya
  // (ER_CANT_AGGREGATE_2COLLATIONS). Paksa COLLATE di kondisi ON biar aman
  // tanpa perlu ubah struktur/collation tabel manapun.
  static async list() {
    const [rows] = await poolUtama.query(`
      SELECT p.id, p.tire_code, p.tire_description, p.tube_code,
             p.tube_description, p.customer, p.created_at, p.updated_at,
             COALESCE(m.volume, 0) AS tube_volume,
             COALESCE(m.berat, 0) AS tube_berat
      FROM stok_opname_karawang_tire_tube_pairing p
      LEFT JOIN stok_opname_karawang_master_item m
        ON p.tube_code COLLATE utf8mb4_general_ci = m.code_no COLLATE utf8mb4_general_ci
      ORDER BY p.tube_code, p.tire_code
    `);
    return rows;
  }

  // Lookup 1 tire_code -> pasangan tube-nya (dipakai Transfer Plan pas
  // nambahin item tire ke trip). Return null kalau tire itu gak punya
  // pasangan tube terdaftar (mis. item non-tubetype).
  static async findByTireCode(tireCode) {
    const [rows] = await poolUtama.query(
      `SELECT p.id, p.tire_code, p.tire_description, p.tube_code,
              p.tube_description, p.customer,
              COALESCE(m.volume, 0) AS tube_volume,
              COALESCE(m.berat, 0) AS tube_berat
       FROM stok_opname_karawang_tire_tube_pairing p
       LEFT JOIN stok_opname_karawang_master_item m
         ON p.tube_code COLLATE utf8mb4_general_ci = m.code_no COLLATE utf8mb4_general_ci
       WHERE p.tire_code = ?
       LIMIT 1`,
      [norm(tireCode)],
    );
    return rows[0] || null;
  }

  // Lookup banyak sekaligus, dipakai frontend buat preload map pasangan
  // (tire_code -> tube_code) begitu halaman Transfer Plan dibuka, biar
  // add-item-to-trip gak perlu round-trip API tiap kali.
  static async findByTireCodes(tireCodes) {
    const codes = (tireCodes || []).map(norm).filter(Boolean);
    if (codes.length === 0) return [];

    const [rows] = await poolUtama.query(
      `SELECT p.tire_code, p.tire_description, p.tube_code,
              p.tube_description, p.customer,
              COALESCE(m.volume, 0) AS tube_volume,
              COALESCE(m.berat, 0) AS tube_berat
       FROM stok_opname_karawang_tire_tube_pairing p
       LEFT JOIN stok_opname_karawang_master_item m
         ON p.tube_code COLLATE utf8mb4_general_ci = m.code_no COLLATE utf8mb4_general_ci
       WHERE p.tire_code IN (?)`,
      [codes],
    );
    return rows;
  }

  static async create({
    tire_code,
    tire_description,
    tube_code,
    tube_description,
    customer,
  }) {
    if (!tire_code || !tube_code) {
      throw new Error("Kode Tire dan Kode Tube wajib diisi.");
    }

    const [result] = await poolUtama.query(
      `INSERT INTO stok_opname_karawang_tire_tube_pairing
        (tire_code, tire_description, tube_code, tube_description, customer)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        tire_description = VALUES(tire_description),
        tube_code = VALUES(tube_code),
        tube_description = VALUES(tube_description),
        customer = VALUES(customer)`,
      [
        norm(tire_code),
        tire_description || null,
        norm(tube_code),
        tube_description || null,
        customer || null,
      ],
    );

    return result.insertId;
  }

  static async update(
    id,
    { tire_code, tire_description, tube_code, tube_description, customer },
  ) {
    if (!tire_code || !tube_code) {
      throw new Error("Kode Tire dan Kode Tube wajib diisi.");
    }

    await poolUtama.query(
      `UPDATE stok_opname_karawang_tire_tube_pairing
       SET tire_code = ?, tire_description = ?, tube_code = ?,
           tube_description = ?, customer = ?
       WHERE id = ?`,
      [
        norm(tire_code),
        tire_description || null,
        norm(tube_code),
        tube_description || null,
        customer || null,
        id,
      ],
    );
  }

  static async remove(id) {
    await poolUtama.query(
      `DELETE FROM stok_opname_karawang_tire_tube_pairing WHERE id = ?`,
      [id],
    );
  }

  static async removeAll() {
    await poolUtama.query(
      `TRUNCATE TABLE stok_opname_karawang_tire_tube_pairing`,
    );
  }

  // Import dari Excel (dipanggil KarawangTireTubePairingController.upload).
  // Upsert by tire_code (UNIQUE) — kalau tire_code udah ada, pasangan
  // tube-nya di-replace sama data baru (biar re-upload file yang sama /
  // versi revisi gak bikin duplikat).
  static async bulkUpsert(rows) {
    if (!rows || rows.length === 0) {
      return { inserted: 0 };
    }

    const values = rows.map((r) => [
      norm(r.tire_code),
      r.tire_description || null,
      norm(r.tube_code),
      r.tube_description || null,
      r.customer || null,
    ]);

    const [result] = await poolUtama.query(
      `INSERT INTO stok_opname_karawang_tire_tube_pairing
        (tire_code, tire_description, tube_code, tube_description, customer)
       VALUES ?
       ON DUPLICATE KEY UPDATE
        tire_description = VALUES(tire_description),
        tube_code = VALUES(tube_code),
        tube_description = VALUES(tube_description),
        customer = VALUES(customer)`,
      [values],
    );

    return { inserted: result.affectedRows };
  }
}

module.exports = KarawangTireTubePairingModel;
