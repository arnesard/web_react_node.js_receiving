// backend/src/models/tube-barcode/TubeBarcodeModel.js
const { poolUtama, poolEdp } = require("../../config/database");
const KarawangTireTubePairingModel = require("../stok-opname-karawang/KarawangTireTubePairingModel");
const KarawangEdpModel = require("../stok-opname-karawang/KarawangEdpModel");

class HttpError extends Error {
  constructor(message, status = 422) {
    super(message);
    this.status = status;
  }
}

const norm = (v) =>
  String(v || "")
    .trim()
    .toUpperCase();

const FMT = "%d/%m/%Y %H:%i";

function validateSn(sn) {
  const s = String(sn || "").trim();
  if (!/^\d{4}$/.test(s)) {
    throw new HttpError(
      "SN harus 4 digit YYWW (contoh 2639 = tahun 26 minggu 39).",
    );
  }
  const week = Number(s.slice(2));
  if (week < 1 || week > 53) {
    throw new HttpError("SN tidak valid: minggu harus 01-53 (contoh 2639).");
  }
  return s;
}

function validateQty(qty) {
  const n = Number(qty);
  if (!Number.isInteger(n) || n <= 0) {
    throw new HttpError("Qty harus bilangan bulat lebih dari 0.");
  }
  return n;
}

function required(value, label) {
  const v = norm(value);
  if (!v) throw new HttpError(`${label} wajib diisi.`);
  return v;
}

class TubeBarcodeModel {
  // ── Master operator / PIC ──
  static async listEmployees() {
    const [rows] = await poolUtama.query(
      `SELECT employee_id, name FROM employees
       WHERE employee_id IS NOT NULL AND employee_id <> ''
       ORDER BY name ASC`,
    );
    return rows;
  }

  static async findEmployee(employeeId) {
    const id = String(employeeId || "").trim();
    if (!id) throw new HttpError("Operator/PIC wajib dipilih.");
    const [rows] = await poolUtama.query(
      `SELECT employee_id, name FROM employees WHERE employee_id = ? LIMIT 1`,
      [id],
    );
    if (!rows[0]) throw new HttpError("Operator/PIC tidak ditemukan.", 404);
    return rows[0];
  }

  // ── Lookup Item Catalog dari DB PANDU (bcmcfgv1.itemcatalog) ──
  static async lookupItemCatalog(barcodeOrItem) {
    const keyword = norm(barcodeOrItem);
    if (!keyword) throw new HttpError("Barcode / Custbar / Item wajib diisi.");

    try {
      const [rows] = await poolEdp.query(
        `SELECT item, descr, custbar 
         FROM bcmcfgv1.itemcatalog 
         WHERE custbar = ? OR item = ? 
         LIMIT 1`,
        [keyword, keyword],
      );

      if (!rows.length) {
        throw new HttpError(
          `Item atau Barcode "${keyword}" tidak terdaftar di itemcatalog.`,
          404,
        );
      }

      return {
        item: String(rows[0].item || "").trim(),
        descr: String(rows[0].descr || "").trim(),
        custbar: String(rows[0].custbar || "").trim(),
      };
    } catch (err) {
      if (err instanceof HttpError) throw err;
      console.error("TubeBarcodeModel.lookupItemCatalog error:", err.message);
      throw new HttpError(
        "Gagal mengambil data katalog item dari DB EDP/Pandu.",
      );
    }
  }

  // ── Scan Collie ──
  static async createScan({ operator_id, rack_code, collie, item, qty, sn }) {
    const emp = await this.findEmployee(operator_id);
    const rack = required(rack_code, "Rak");
    const kolie = required(collie, "Collie");
    const kode = required(item, "Item");
    const jumlah = validateQty(qty);
    const sn4 = validateSn(sn);

    const [result] = await poolUtama.query(
      `INSERT INTO tube_barcode_scan
         (operator_id, operator_name, rack_code, collie, item, qty, sn)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [emp.employee_id, emp.name, rack, kolie, kode, jumlah, sn4],
    );

    const [[known]] = await poolUtama.query(
      `SELECT COUNT(*) AS c FROM stok_opname_karawang_tire_tube_pairing WHERE tube_code = ?`,
      [kode],
    );
    return { id: result.insertId, tube_known: Number(known.c) > 0 };
  }

  static async listPending(rack_code) {
    const rack = required(rack_code, "Rak");
    const [rows] = await poolUtama.query(
      `SELECT id, operator_id AS pic_id, operator_name AS pic_name, rack_code,
              collie, item, qty, sn,
              DATE_FORMAT(scanned_at, '${FMT}') AS time
       FROM tube_barcode_scan
       WHERE rack_code = ? AND status = 'PENDING'
       ORDER BY id ASC`,
      [rack],
    );

    if (!rows.length) return [];

    // Ambil deskripsi item dari bcmcfgv1.itemcatalog (poolEdp)
    const uniqueItems = [...new Set(rows.map((r) => r.item).filter(Boolean))];
    const descMap = new Map();

    if (uniqueItems.length) {
      try {
        const [catRows] = await poolEdp.query(
          `SELECT item, descr FROM bcmcfgv1.itemcatalog WHERE item IN (?)`,
          [uniqueItems],
        );
        catRows.forEach((c) => {
          descMap.set(norm(c.item), String(c.descr || "").trim());
        });
      } catch (err) {
        console.error(
          "TubeBarcodeModel.listPending lookup deskripsi gagal:",
          err.message,
        );
      }
    }

    // Pasangkan deskripsi ke masing-masing baris
    return rows.map((r) => ({
      ...r,
      descr: descMap.get(norm(r.item)) || "-",
    }));
  }
  static async cancelScan(id) {
    const [result] = await poolUtama.query(
      `DELETE FROM tube_barcode_scan WHERE id = ? AND status = 'PENDING'`,
      [id],
    );
    if (!result.affectedRows) {
      throw new HttpError("Scan tidak ditemukan atau sudah di-approve.", 404);
    }
  }

  // ── Stok ──
  static async _upsertStock(conn, s) {
    await conn.query(
      `INSERT INTO tube_barcode_stock
         (rack_code, collie, item, sn, qty, source,
          scan_by_id, scan_by_name, scan_at,
          approve_by_id, approve_by_name, approve_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
          qty = qty + VALUES(qty),
          source = VALUES(source),
          scan_by_id = VALUES(scan_by_id),
          scan_by_name = VALUES(scan_by_name),
          scan_at = VALUES(scan_at),
          approve_by_id = VALUES(approve_by_id),
          approve_by_name = VALUES(approve_by_name),
          approve_at = NOW()`,
      [
        s.rack_code,
        s.collie,
        s.item,
        s.sn,
        s.qty,
        s.source,
        s.scan_by_id,
        s.scan_by_name,
        s.scan_at,
        s.approve_by_id,
        s.approve_by_name,
      ],
    );
  }

  // ── Receive ──
  static async approve({ pic_id, rack_code, ids }) {
    const pic = await this.findEmployee(pic_id);
    const rack = required(rack_code, "Rak");
    const idList = Array.isArray(ids)
      ? ids.map(Number).filter((n) => Number.isInteger(n) && n > 0)
      : [];

    const conn = await poolUtama.getConnection();
    try {
      await conn.beginTransaction();
      const params = [rack];
      let sql = `SELECT * FROM tube_barcode_scan
                 WHERE rack_code = ? AND status = 'PENDING'`;
      if (idList.length) {
        sql += ` AND id IN (?)`;
        params.push(idList);
      }
      sql += ` FOR UPDATE`;
      const [rows] = await conn.query(sql, params);
      if (!rows.length) {
        throw new HttpError(
          "Tidak ada data pending untuk di-approve di rak ini.",
          404,
        );
      }

      for (const r of rows) {
        await this._upsertStock(conn, {
          rack_code: r.rack_code,
          collie: r.collie,
          item: r.item,
          sn: r.sn,
          qty: r.qty,
          source: "SCAN",
          scan_by_id: r.operator_id,
          scan_by_name: r.operator_name,
          scan_at: r.scanned_at,
          approve_by_id: pic.employee_id,
          approve_by_name: pic.name,
        });
      }
      await conn.query(
        `UPDATE tube_barcode_scan
         SET status = 'APPROVED', approved_by_id = ?, approved_by_name = ?,
             approved_at = NOW()
         WHERE id IN (?)`,
        [pic.employee_id, pic.name, rows.map((r) => r.id)],
      );
      await conn.commit();
      return {
        approved: rows.length,
        total_qty: rows.reduce((a, r) => a + Number(r.qty), 0),
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  // ── Transfer ──
  static async lookupStock(rack_code, collie) {
    const rack = required(rack_code, "Rak");
    let sql = `SELECT id, rack_code, collie, item, sn, qty
               FROM tube_barcode_stock
               WHERE rack_code = ? AND qty > 0`;
    const params = [rack];

    if (norm(collie)) {
      sql += ` AND collie = ?`;
      params.push(norm(collie));
    }
    sql += ` ORDER BY item, sn`;

    const [rows] = await poolUtama.query(sql, params);
    if (!rows.length) {
      throw new HttpError(
        "Stok tube di rak ini tidak ditemukan (atau belum di-approve di menu Receive).",
        404,
      );
    }
    return rows;
  }

  static async kurang({ pic_id, rack_code, collie, item, sn, qty }) {
    const pic = await this.findEmployee(pic_id);
    const rack = required(rack_code, "Rak");
    const kolie = required(collie, "Collie");
    const kode = required(item, "Item");
    const sn4 = validateSn(sn);
    const jumlah = validateQty(qty);

    const conn = await poolUtama.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query(
        `SELECT id, qty FROM tube_barcode_stock
         WHERE rack_code = ? AND collie = ? AND item = ? AND sn = ?
         FOR UPDATE`,
        [rack, kolie, kode, sn4],
      );
      const row = rows[0];
      if (!row)
        throw new HttpError("Stok tidak ditemukan di rak + collie ini.", 404);
      if (Number(row.qty) < jumlah) {
        throw new HttpError(
          `Qty melebihi stok. Stok ${rack} / ${kolie} saat ini ${row.qty}.`,
        );
      }
      await conn.query(
        `UPDATE tube_barcode_stock SET qty = qty - ? WHERE id = ?`,
        [jumlah, row.id],
      );
      const [log] = await conn.query(
        `INSERT INTO tube_barcode_transfer
           (type, pic_id, pic_name, rack_code, collie, item, sn, qty)
         VALUES ('KURANG', ?, ?, ?, ?, ?, ?, ?)`,
        [pic.employee_id, pic.name, rack, kolie, kode, sn4, jumlah],
      );
      await conn.commit();
      return { ref_id: log.insertId, sisa: Number(row.qty) - jumlah };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  static async verifyTirePair(tireCollie, tubeItem) {
    const kolie = norm(tireCollie);
    const [rows] = await poolEdp.query(
      `SELECT item, rackcode, COUNT(*) AS qty
       FROM rack WHERE bc_entried_prod = ?
       GROUP BY item, rackcode ORDER BY qty DESC`,
      [kolie],
    );
    if (!rows.length) {
      throw new HttpError(
        `Collie tire "${kolie}" tidak ditemukan di stok Tangerang.`,
      );
    }
    const tireItem = String(rows[0].item || "").trim();
    const pair = await KarawangTireTubePairingModel.findByTireCode(tireItem);
    if (!pair) {
      throw new HttpError(
        `Tire ${tireItem} belum punya pasangan tube di master pairing, tidak bisa digabung.`,
      );
    }
    if (norm(pair.tube_code) !== norm(tubeItem)) {
      throw new HttpError(
        `Tube ${tubeItem} BUKAN pasangan Tire ${tireItem}. Pasangan yang benar: ${pair.tube_code}.`,
      );
    }
    return {
      tire_item: tireItem,
      tire_rack: String(rows[0].rackcode || "").trim(),
    };
  }

  static async tambah({
    pic_id,
    rack_code,
    collie,
    item,
    sn,
    qty,
    tire_collie,
    ref_id,
  }) {
    const pic = await this.findEmployee(pic_id);
    const rack = required(rack_code, "Rak tujuan");
    const kolie = required(collie, "Collie tujuan");
    const kode = required(item, "Item");
    const sn4 = validateSn(sn);
    const jumlah = validateQty(qty);

    let tire = null;
    if (norm(tire_collie)) {
      tire = await this.verifyTirePair(tire_collie, kode);
    }

    const conn = await poolUtama.getConnection();
    try {
      await conn.beginTransaction();

      let refId = null;
      if (ref_id) {
        const [refRows] = await conn.query(
          `SELECT id, item, sn, qty FROM tube_barcode_transfer
           WHERE id = ? AND type = 'KURANG' FOR UPDATE`,
          [Number(ref_id)],
        );
        const ref = refRows[0];
        if (!ref)
          throw new HttpError(
            "Referensi transfer (proses 1) tidak ditemukan.",
            404,
          );
        if (norm(ref.item) !== kode || String(ref.sn) !== sn4) {
          throw new HttpError(
            "Item / SN harus sama dengan yang diambil di proses 1.",
          );
        }
        const [[used]] = await conn.query(
          `SELECT COALESCE(SUM(qty), 0) AS q FROM tube_barcode_transfer
           WHERE ref_id = ? AND type = 'TAMBAH'`,
          [ref.id],
        );
        const sisa = Number(ref.qty) - Number(used.q);
        if (jumlah > sisa) {
          throw new HttpError(
            `Qty melebihi yang diambil. Sisa yang belum ditempatkan: ${sisa}.`,
          );
        }
        refId = ref.id;
      }

      await this._upsertStock(conn, {
        rack_code: rack,
        collie: kolie,
        item: kode,
        sn: sn4,
        qty: jumlah,
        source: "TRANSFER",
        scan_by_id: pic.employee_id,
        scan_by_name: pic.name,
        scan_at: new Date(),
        approve_by_id: pic.employee_id,
        approve_by_name: pic.name,
      });

      const [log] = await conn.query(
        `INSERT INTO tube_barcode_transfer
           (ref_id, type, pic_id, pic_name, rack_code, collie, item, sn, qty,
            tire_collie, tire_item)
         VALUES (?, 'TAMBAH', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          refId,
          pic.employee_id,
          pic.name,
          rack,
          kolie,
          kode,
          sn4,
          jumlah,
          tire ? norm(tire_collie) : null,
          tire ? tire.tire_item : null,
        ],
      );
      await conn.commit();
      return { id: log.insertId, tire };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  // ── Monitoring ──
  static async rackInfo(rack_code) {
    const rack = required(rack_code, "Rak");

    let location = null;
    try {
      const [loc] = await poolEdp.query(
        `SELECT loccol, whscode, locblock FROM fgloc
         WHERE rackcode1 = ? OR rackcode2 = ? OR rackcode3 = ? OR rackcode4 = ?
         LIMIT 1`,
        [rack, rack, rack, rack],
      );
      if (loc[0]) {
        location = {
          loccol: String(loc[0].loccol || "").trim(),
          whscode: String(loc[0].whscode || "").trim(),
          locblock: String(loc[0].locblock || "").trim(),
        };
      }
    } catch (err) {
      console.error("TubeBarcode.rackInfo lokasi gagal:", err.message);
    }

    let tires = [];
    try {
      const [rows] = await poolEdp.query(
        `SELECT item, bc_entried_prod AS collie, COUNT(*) AS qty
         FROM rack WHERE rackcode = ?
         GROUP BY item, bc_entried_prod
         ORDER BY item, bc_entried_prod LIMIT 300`,
        [rack],
      );
      tires = rows.map((r) => ({
        item: String(r.item || "").trim(),
        collie: String(r.collie || "").trim(),
        qty: Number(r.qty),
      }));
    } catch (err) {
      console.error("TubeBarcode.rackInfo tire gagal:", err.message);
    }

    const items = [...new Set(tires.map((t) => t.item).filter(Boolean))];
    let descMap = new Map();
    let pairRows = [];
    if (items.length) {
      try {
        descMap = await KarawangEdpModel.descriptionsForItems(items);
      } catch (err) {
        console.error("TubeBarcode.rackInfo deskripsi gagal:", err.message);
      }
      pairRows = await KarawangTireTubePairingModel.findByTireCodes(items);
    }
    const pairMap = new Map(
      pairRows.map((p) => [norm(p.tire_code), p.tube_code]),
    );

    tires = tires.map((t) => ({
      ...t,
      deskripsi: descMap.get(t.item) || "-",
      tube_pasangan: pairMap.get(norm(t.item)) || null,
    }));

    return { rack_code: rack, location, tires };
  }

  static async monitoring({ rack_code, collie, item, limit = 300 }) {
    const where = [`qty > 0`];
    const params = [];
    const pWhere = [`status = 'PENDING'`];
    const pParams = [];

    if (norm(rack_code)) {
      where.push(`rack_code = ?`);
      params.push(norm(rack_code));
      pWhere.push(`rack_code = ?`);
      pParams.push(norm(rack_code));
    }
    if (norm(collie)) {
      where.push(`collie LIKE ?`);
      params.push(`%${norm(collie)}%`);
      pWhere.push(`collie LIKE ?`);
      pParams.push(`%${norm(collie)}%`);
    }
    if (norm(item)) {
      where.push(`item LIKE ?`);
      params.push(`${norm(item)}%`);
      pWhere.push(`item LIKE ?`);
      pParams.push(`${norm(item)}%`);
    }
    const lim = Math.min(Math.max(Number(limit) || 300, 1), 1000);

    const [stock] = await poolUtama.query(
      `SELECT id, rack_code, collie, item, sn, qty, source,
              'APPROVED' AS status,
              scan_by_id, scan_by_name,
              DATE_FORMAT(scan_at, '${FMT}') AS scan_time,
              approve_by_id, approve_by_name,
              DATE_FORMAT(approve_at, '${FMT}') AS approve_time
       FROM tube_barcode_stock
       WHERE ${where.join(" AND ")}
       ORDER BY approve_at DESC, id DESC LIMIT ${lim}`,
      params,
    );

    const [pending] = await poolUtama.query(
      `SELECT id, rack_code, collie, item, sn, qty, 'SCAN' AS source,
              'PENDING' AS status,
              operator_id AS scan_by_id, operator_name AS scan_by_name,
              DATE_FORMAT(scanned_at, '${FMT}') AS scan_time,
              NULL AS approve_by_id, NULL AS approve_by_name,
              NULL AS approve_time
       FROM tube_barcode_scan
       WHERE ${pWhere.join(" AND ")}
       ORDER BY id DESC LIMIT ${lim}`,
      pParams,
    );

    const rows = [...pending, ...stock];
    const summary = {
      total_baris: rows.length,
      total_qty: rows.reduce((a, r) => a + Number(r.qty), 0),
      pending: pending.length,
    };

    let rack = null;
    if (norm(rack_code)) {
      rack = await this.rackInfo(rack_code);
      rows.forEach((r) => {
        r.tire_menempel = rack.tires
          .filter(
            (t) => t.tube_pasangan && norm(t.tube_pasangan) === norm(r.item),
          )
          .map((t) => ({ item: t.item, collie: t.collie, qty: t.qty }));
      });
    }

    return { rows, summary, rack };
  }
}

module.exports = TubeBarcodeModel;
module.exports.HttpError = HttpError;
