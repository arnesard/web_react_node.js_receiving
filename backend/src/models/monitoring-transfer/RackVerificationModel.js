// src/models/RackVerificationModel.js
// Verifikasi kode rak ke database tim EDP (session "DB-PANDU"). READ-ONLY —
// modul Transfer Rak tidak pernah menulis ke database ini, cuma baca buat
// tau isi rak (item), jumlah unit (qty), kategori (OK/OE dari `probcode`),
// dan deskripsi item.
//
// Dua tabel dipakai, dua-duanya di server DB-PANDU yang sama (makanya cukup
// 1 pool koneksi, tinggal query cross-database):
//   - fginvc.rack            → item, qty, kategori (probcode) per rackcode
//   - bcmcfgv1.itemcatalog   → deskripsi (descr) per kode item
//
// Asumsi struktur data: tiap baris di `fginvc.rack` mewakili satu unit/pcs
// yang sudah discan masuk ke rak tsb (kolom `bc_entried` = barcode per-unit).
// Jadi qty per rack dihitung dari COUNT(*) baris yang rackcode-nya sama,
// dikelompokkan per `item` + `probcode` (biasanya 1 rak isinya 1 jenis item
// dgn 1 kategori, tapi kode ini tetap menangani kalau ternyata campur —
// misal ada baris item A kategori OK dan item A kategori OE dalam 1 rak).
// Kolom `probcode` KOSONG/NULL berarti kategori OK; kalau ada isi (mis.
// "OE") berarti kategori itu yang dipakai apa adanya (uppercase).
const { poolEdp } = require("../../config/database");

class RackVerificationModel {
  // Ambil deskripsi item dari bcmcfgv1.itemcatalog buat sekumpulan kode
  // item. Balikin Map<item, descr>. Item yang gak ketemu di itemcatalog
  // gak masuk map (biar gampang di-fallback "-" di pemanggil).
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

  // Balikin null kalau rackcode gak ketemu sama sekali di DB EDP.
  // Kalau ketemu: { item, qty, kategori, deskripsi, items: [{item, qty, kategori, deskripsi}, ...] }
  // `items` disediakan buat kasus rak ternyata berisi >1 jenis item dan/atau
  // >1 kategori (jarang, tapi datanya real jadi kita tangani daripada
  // nyembunyiin).
  static async verify(rackcode) {
    const kode = (rackcode || "").trim();
    if (!kode) return null;

    const [rows] = await poolEdp.query(
      `SELECT item, probcode, COUNT(*) as qty
       FROM rack
       WHERE rackcode = ?
       GROUP BY item, probcode
       ORDER BY qty DESC`,
      [kode],
    );

    if (!rows.length) return null;

    const itemsRaw = rows.map((r) => ({
      item: (r.item || "").trim(),
      qty: Number(r.qty),
      kategori: (r.probcode || "").trim() ? r.probcode.trim().toUpperCase() : "OK",
    }));

    const uniqueItemCodes = [...new Set(itemsRaw.map((r) => r.item).filter(Boolean))];
    let descrMap = new Map();
    try {
      descrMap = await this._getDescriptions(uniqueItemCodes);
    } catch (err) {
      // Kalau lookup deskripsi gagal (mis. tabel/koneksi bermasalah), jangan
      // gagalin verifikasi rak — item/qty/kategori tetep lebih penting.
      // Deskripsi cukup fallback jadi "-".
      console.error("RackVerificationModel._getDescriptions gagal:", err);
    }

    const items = itemsRaw.map((r) => ({
      ...r,
      deskripsi: descrMap.get(r.item) || "-",
    }));

    const totalQty = items.reduce((sum, r) => sum + r.qty, 0);
    const uniqueKategori = [...new Set(items.map((r) => r.kategori))];
    const uniqueDeskripsi = [...new Set(items.map((r) => r.deskripsi))];

    return {
      item: items.length === 1 ? items[0].item : items.map((r) => r.item).join(", "),
      qty: totalQty,
      kategori: uniqueKategori.length === 1 ? uniqueKategori[0] : uniqueKategori.join(", "),
      deskripsi: uniqueDeskripsi.length === 1 ? uniqueDeskripsi[0] : uniqueDeskripsi.join(", "),
      items,
    };
  }
}

module.exports = RackVerificationModel;
