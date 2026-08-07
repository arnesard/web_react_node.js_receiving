// src/models/stok-opname-karawang/KarawangEdpModel.js
// Verifikasi LIVE ke database tim EDP (db pandu) pas operator scan collie
// di lapangan. READ-ONLY, gak pernah nulis ke db pandu.
//
// Sumbernya `fginvc.rack` (tabel status stok real, 1 baris = 1 unit/pcs
// yang sedang ada di rak), filter cuma by `bc_entried_prod` (kode collie),
// gak perlu disandingin sama rackcode maupun data target excel — collie
// ketemu di rack = valid, titik.
const { poolEdp } = require("../../config/database");

class KarawangEdpModel {
  static async _getDescriptions(itemCodes) {
    const map = new Map();
    if (!itemCodes.length) return map;
    const [rows] = await poolEdp.query(
      `SELECT item, descr FROM bcmcfgv1.itemcatalog WHERE item IN (?)`,
      [itemCodes],
    );
    rows.forEach((r) => {
      map.set((r.item || "").trim(), (r.descr || "").trim());
    });
    return map;
  }

  // Public: ambil deskripsi 1 item dari bcmcfgv1.itemcatalog. Dipake pas
  // scan collie — item/qty/kategori sekarang dari Cross Docking, tapi
  // deskripsinya tetap join ke db pandu (Cross Docking gak nyediain
  // deskripsi). Balikin "-" kalau item gak ketemu di katalog.
  static async descriptionForItem(item) {
    const kode = (item || "").trim();
    if (!kode) return "-";
    const map = await this._getDescriptions([kode]);
    return map.get(kode) || "-";
  }

  // Verifikasi 1 collie: fginvc.rack itu 1 baris = 1 pcs, gak punya kolom
  // qty — jadi qty per collie dihitung dari COUNT(*) baris yang punya
  // bc_entried_prod (kode collie) yang sama, digroup per item+probcode
  // (biasanya 1 group; kalau ternyata ada campuran item dalam 1 collie,
  // item/kategori diambil dari group terbanyak, tapi qty tetap total
  // semua pcs-nya). Gak perlu cocokin ke rackcode yang lagi discan
  // ataupun ke data target excel — collie ketemu di rack = valid.
  // Balikin null kalau collie-nya sama sekali gak ada di rack (berarti
  // udah keluar / gak ada fisiknya). Kalau cocok:
  // { item, qty, kategori, deskripsi }
  static async verifyCollie(collie) {
    const kodeCollie = (collie || "").trim();
    if (!kodeCollie) return null;

    const [rows] = await poolEdp.query(
      `SELECT item, probcode, COUNT(*) as qty
       FROM rack
       WHERE bc_entried_prod = ?
       GROUP BY item, probcode
       ORDER BY qty DESC`,
      [kodeCollie],
    );
    if (!rows.length) return null;

    const item = (rows[0].item || "").trim();
    const kategori = (rows[0].probcode || "").trim()
      ? rows[0].probcode.trim().toUpperCase()
      : "OK";
    const qty = rows.reduce((sum, r) => sum + Number(r.qty), 0);

    let deskripsi = "-";
    try {
      const descrMap = await this._getDescriptions([item]);
      deskripsi = descrMap.get(item) || "-";
    } catch (err) {
      console.error("KarawangEdpModel._getDescriptions gagal:", err);
    }

    return { item, qty, kategori, deskripsi };
  }

  static async rackDetailsByBarcode(barcodes, chunkSize = 1000) {
    const map = new Map();
    const cleanBarcodes = [
      ...new Set(
        (barcodes || []).map((b) => String(b || "").trim()).filter(Boolean),
      ),
    ];
    if (!cleanBarcodes.length) return map;

    for (let i = 0; i < cleanBarcodes.length; i += chunkSize) {
      const chunk = cleanBarcodes.slice(i, i + chunkSize);
      const [rows] = await poolEdp.query(
        `SELECT barcode,
                GROUP_CONCAT(DISTINCT rackcode ORDER BY rackcode SEPARATOR ', ') as rackcodes,
                GROUP_CONCAT(DISTINCT bc_entried_prod ORDER BY bc_entried_prod SEPARATOR ', ') as collies
         FROM (
           SELECT bc_entried as barcode, rackcode, bc_entried_prod
           FROM rack
           WHERE bc_entried IN (?)
           UNION ALL
           SELECT bc_entried_prod as barcode, rackcode, bc_entried_prod
           FROM rack
           WHERE bc_entried_prod IN (?)
         ) hits
         WHERE barcode IS NOT NULL AND barcode <> ''
         GROUP BY barcode`,
        [chunk, chunk],
      );
      rows.forEach((r) => {
        const barcode = (r.barcode || "").trim();
        if (barcode) {
          map.set(barcode, {
            rackcodes: (r.rackcodes || "").trim(),
            collies: (r.collies || "").trim(),
          });
        }
      });
    }

    return map;
  }

  static async rackcodesByBarcode(barcodes, chunkSize = 1000) {
    const detailMap = await this.rackDetailsByBarcode(barcodes, chunkSize);
    const map = new Map();
    detailMap.forEach((value, key) => map.set(key, value.rackcodes));
    return map;
  }
}

module.exports = KarawangEdpModel;
