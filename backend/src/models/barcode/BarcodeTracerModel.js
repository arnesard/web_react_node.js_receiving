// src/models/barcode/BarcodeTracerModel.js
// Modul "Barcode Tracer" — lacak riwayat mutasi (timeline) 1 barcode
// (collie/Pcs) lintas Plant (DB EDP / DB-PANDU, fginvc) dan DC Karawang
// (Cross Docking, fginvc_cd).
//
// Sumber data:
//   - poolEdp   → fginvc.rack + fginvc.trfloc, DAN bcmcfgv1.itemcatalog /
//                 bcmcfgv1.do_scan / bcmcfgv1.oprbld (semua di server
//                 DB-PANDU yang sama, lihat RackVerificationModel /
//                 ControlStockModel / KarawangEdpModel).
//   - poolCrossDocking → fginvc_cd.rack_cd + fginvc_cd.trfloc_cd (DC
//                 Karawang, lihat KarawangFifoModel yang query
//                 fginvc_cd.rack_cd dengan cara yang sama).
//
// Catatan adaptasi dari kode referensi yang dikasih user: lookup deskripsi
// item di kode referensi pakai tabel `msitem` (kolom item_polos/
// description) — tabel itu gak ada di project ini. Diganti pakai sumber
// deskripsi yang sudah dipakai di semua modul lain project ini:
// bcmcfgv1.itemcatalog (kolom item/descr) via poolEdp.
const { poolEdp, poolCrossDocking } = require("../../config/database");

class BarcodeTracerModel {
  // Step 1: cari semua barcode Pcs (bc_entried) yang terlibat — baik kalau
  // user scan/ketik barcode Collie (bc_entried_prod) maupun barcode Pcs
  // (bc_entried) itu sendiri. Dicari di kedua sumber (Plant & DC Karawang).
  static async findRelatedPcsBarcodes(cleanBarcode) {
    const pcsSet = new Set();

    try {
      const [rows] = await poolEdp.query(
        `SELECT bc_entried FROM rack WHERE bc_entried = ? OR bc_entried_prod = ?`,
        [cleanBarcode, cleanBarcode],
      );
      rows.forEach((r) => {
        if (r.bc_entried && r.bc_entried !== "-") pcsSet.add(r.bc_entried);
      });
    } catch (err) {
      console.warn(
        "BarcodeTracerModel.findRelatedPcsBarcodes gagal di poolEdp (fginvc.rack):",
        err.message,
      );
    }

    try {
      const [rows] = await poolCrossDocking.query(
        `SELECT bc_entried FROM fginvc_cd.rack_cd WHERE bc_entried = ? OR bc_entried_prod = ?`,
        [cleanBarcode, cleanBarcode],
      );
      rows.forEach((r) => {
        if (r.bc_entried && r.bc_entried !== "-") pcsSet.add(r.bc_entried);
      });
    } catch (err) {
      console.warn(
        "BarcodeTracerModel.findRelatedPcsBarcodes gagal di poolCrossDocking (fginvc_cd.rack_cd):",
        err.message,
      );
    }

    if (pcsSet.size === 0) pcsSet.add(cleanBarcode);
    return Array.from(pcsSet);
  }

  // Step 2a: riwayat mutasi dari sisi Plant (fginvc.rack + fginvc.trfloc)
  static async searchTimelinePlant(targetPcsArray) {
    const query = `
      SELECT
          'DB2 (Production)' AS source_db,
          t.ydate_shift,
          r.item,
          t.plant,
          r.jdge,
          r.probcode,
          r.whsweek,
          r.curweek,
          r.rackcode,
          r.bc_entried_prod,
          r.bc_entried AS rack_bc_entried,
          t.loc_from,
          t.loc_to,
          t.pic,
          t.scantime
      FROM rack r
      JOIN trfloc t ON t.bc_entried = r.bc_entried AND t.bc_entried_prod = r.bc_entried_prod
      WHERE r.bc_entried IN (?)
    `;
    try {
      const [rows] = await poolEdp.query(query, [targetPcsArray]);
      return rows;
    } catch (err) {
      console.warn(
        "BarcodeTracerModel.searchTimelinePlant gagal di poolEdp (fginvc.rack/trfloc):",
        err.message,
      );
      return [];
    }
  }

  // Step 2b: riwayat mutasi dari sisi DC Karawang (fginvc_cd.rack_cd +
  // fginvc_cd.trfloc_cd). Kalau trfloc_cd ternyata belum/tidak ada di DB
  // Cross Docking, ini bakal gagal dengan aman (log warning, balikin
  // array kosong) — sumber Plant tetap jalan normal.
  static async searchTimelineKarawang(targetPcsArray) {
    const query = `
      SELECT
          'DB3 (DC Karawang)' AS source_db,
          t.ydate_shift,
          r.item,
          t.plant,
          r.jdge,
          r.probcode,
          r.whsweek,
          r.curweek,
          r.rackcode,
          r.bc_entried_prod,
          r.bc_entried AS rack_bc_entried,
          t.loc_from,
          t.loc_to,
          t.pic,
          t.scantime
      FROM fginvc_cd.rack_cd r
      JOIN fginvc_cd.trfloc_cd t ON t.bc_entried = r.bc_entried AND t.bc_entried_prod = r.bc_entried_prod
      WHERE r.bc_entried IN (?)
    `;
    try {
      const [rows] = await poolCrossDocking.query(query, [targetPcsArray]);
      return rows;
    } catch (err) {
      console.warn(
        "BarcodeTracerModel.searchTimelineKarawang gagal di poolCrossDocking (fginvc_cd.rack_cd/trfloc_cd):",
        err.message,
      );
      return [];
    }
  }

  // Step 3: deskripsi item — sumbernya bcmcfgv1.itemcatalog (pola yang
  // sama dipakai RackVerificationModel/ControlStockModel/KarawangEdpModel),
  // bukan `msitem` seperti di kode referensi.
  static async getItemDescriptions(uniqueItems) {
    const map = {};
    if (!uniqueItems.length) return map;
    try {
      const [rows] = await poolEdp.query(
        `SELECT item, descr FROM bcmcfgv1.itemcatalog WHERE item IN (?)`,
        [uniqueItems],
      );
      rows.forEach((row) => {
        map[row.item] = row.descr;
      });
    } catch (err) {
      console.warn(
        "BarcodeTracerModel.getItemDescriptions gagal (bcmcfgv1.itemcatalog):",
        err.message,
      );
    }
    return map;
  }

  // Step 4a: No. DN, Customer tujuan, Kota, dan Operator (DO scan) per
  // barcode Pcs — semua dari bcmcfgv1.do_scan.
  static async getDoScanInfo(uniqueBarcodes) {
    const map = {};
    if (!uniqueBarcodes.length) return map;
    try {
      const [rows] = await poolEdp.query(
        `SELECT bc_entried, do_number, cust_name, cust_city, operator FROM bcmcfgv1.do_scan WHERE bc_entried IN (?)`,
        [uniqueBarcodes],
      );
      rows.forEach((row) => {
        map[row.bc_entried] = {
          do_number: row.do_number || "-",
          cust_name: row.cust_name || "-",
          cust_city: row.cust_city || "-",
          operator: row.operator || "-",
        };
      });
    } catch (err) {
      console.warn(
        "BarcodeTracerModel.getDoScanInfo gagal (bcmcfgv1.do_scan):",
        err.message,
      );
    }
    return map;
  }

  // Step 4b: nama operator (PIC) per kode operator.
  static async getOperatorInfo(uniquePics) {
    const map = {};
    if (!uniquePics.length) return map;
    try {
      const [rows] = await poolEdp.query(
        `SELECT oprcode, oprname, plant FROM bcmcfgv1.oprbld WHERE oprcode IN (?)`,
        [uniquePics],
      );
      rows.forEach((row) => {
        if (row.oprcode) {
          map[String(row.oprcode).trim()] = {
            nama: row.oprname || "-",
            plant_opr: row.plant || "-",
          };
        }
      });
    } catch (err) {
      console.warn(
        "BarcodeTracerModel.getOperatorInfo gagal (bcmcfgv1.oprbld):",
        err.message,
      );
    }
    return map;
  }
}

module.exports = BarcodeTracerModel;
