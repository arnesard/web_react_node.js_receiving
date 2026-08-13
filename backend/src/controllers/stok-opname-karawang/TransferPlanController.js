// src/controllers/stok-opname-karawang/TransferPlanController.js
// "Transfer Plan" (Tangerang -> Karawang) & "Retur" (Karawang ->
// Tangerang): form input transaksi, langsung tercatat (TANPA approval),
// plus daftar histori. Cross Docking di sini CUMA dipakai read-only buat
// nampilin info stok Karawang saat ini sebagai referensi pas isi form —
// gak pernah nulis/update apapun ke Cross Docking.
const KarawangEdpModel = require("../../models/stok-opname-karawang/KarawangEdpModel");
const KarawangFifoModel = require("../../models/stok-opname-karawang/KarawangFifoModel");
const KarawangTransferPlanModel = require("../../models/stok-opname-karawang/KarawangTransferPlanModel");
const response = require("../../utils/response");

const JENIS_VALID = ["TRANSFER", "RETUR"];

class TransferPlanController {
  // GET /transfer-plan/search-item?keyword=...
  // Autocomplete kotak item — sama persis sumbernya kayak Control FIFO
  // (bcmcfgv1.itemcatalog di EDP, cocok ke kode ATAU deskripsi).
  async searchItem(req, res) {
    try {
      const keyword = (req.query.keyword || req.query.q || "").trim();
      if (!keyword) return response.success(res, []);
      const data = await KarawangEdpModel.searchByKeyword(keyword, 20);
      return response.success(res, data);
    } catch (err) {
      console.error("TransferPlanController.searchItem gagal:", err);
      return response.error(res, "Gagal mencari item dari database EDP.");
    }
  }

  // GET /transfer-plan/stock-info?item=...
  // Info stok item ini SAAT INI di Cross Docking DC Karawang — READ ONLY,
  // cuma buat referensi operator pas isi form (mis. mastiin qty retur gak
  // lebih besar dari stok yang beneran ada di Karawang). Reuse logic
  // Control FIFO (KarawangFifoModel.locationsByItem), tapi cuma balikin
  // ringkasannya, bukan detail lot lengkap.
  async stockInfo(req, res) {
    try {
      const item = (req.query.item || "").trim();
      if (!item) return response.error(res, "Kode item wajib diisi", 422);
      const data = await KarawangFifoModel.locationsByItem(item, "all");
      if (!data) {
        return response.success(res, {
          item,
          deskripsi: "-",
          total_qty: 0,
          total_lot: 0,
        });
      }
      return response.success(res, {
        item: data.item,
        deskripsi: data.deskripsi,
        total_qty: data.summary.total_qty,
        total_lot: data.summary.total_lot,
      });
    } catch (err) {
      console.error("TransferPlanController.stockInfo gagal:", err);
      return response.error(
        res,
        "Gagal mengambil info stok dari Cross Docking. Boleh dilewati, form tetap bisa disubmit.",
      );
    }
  }

  // GET /transfer-plan?jenis=&item=&dateFrom=&dateTo=
  async list(req, res) {
    try {
      const { jenis, item, dateFrom, dateTo } = req.query;
      if (jenis && !JENIS_VALID.includes(jenis)) {
        return response.error(res, "jenis tidak valid", 422);
      }
      const rows = await KarawangTransferPlanModel.list({
        jenis: jenis || undefined,
        item: (item || "").trim() || undefined,
        dateFrom: (dateFrom || "").trim() || undefined,
        dateTo: (dateTo || "").trim() || undefined,
      });
      return response.success(res, rows);
    } catch (err) {
      console.error("TransferPlanController.list gagal:", err);
      return response.error(res, "Gagal mengambil histori transfer plan.");
    }
  }

  // POST /transfer-plan  { jenis, item, qty, keterangan, id_karyawan }
  async create(req, res) {
    try {
      const { jenis, item, qty, keterangan, id_karyawan } = req.body;
      if (!JENIS_VALID.includes(jenis)) {
        return response.error(
          res,
          'jenis wajib diisi "TRANSFER" atau "RETUR"',
          422,
        );
      }
      const kodeItem = (item || "").trim();
      const qtyNum = Number(qty);
      if (!kodeItem || !qtyNum || qtyNum <= 0) {
        return response.error(res, "Item dan qty (angka > 0) wajib diisi", 422);
      }

      // Snapshot deskripsi dari EDP pas dicatat (lihat catatan di
      // migration SQL) — kalau EDP lagi gak bisa diakses, tetap lanjut
      // simpan tanpa deskripsi (bukan alasan buat gagalin pencatatan).
      let deskripsi = "-";
      try {
        deskripsi = await KarawangEdpModel.descriptionForItem(kodeItem);
      } catch (err) {
        console.error(
          "TransferPlanController.create: gagal ambil deskripsi EDP:",
          err,
        );
      }

      const saved = await KarawangTransferPlanModel.create({
        jenis,
        item: kodeItem,
        deskripsi,
        qty: qtyNum,
        keterangan: (keterangan || "").trim() || null,
        id_karyawan: id_karyawan || null,
      });
      return response.success(res, saved);
    } catch (err) {
      console.error("TransferPlanController.create gagal:", err);
      return response.error(res, "Gagal menyimpan transaksi.");
    }
  }

  // DELETE /transfer-plan/:id — koreksi kalau salah input (gak ada alur
  // approval, jadi cukup hapus baris histori-nya langsung).
  async remove(req, res) {
    try {
      const id = Number(req.params.id);
      if (!id) return response.error(res, "id tidak valid", 422);
      const affected = await KarawangTransferPlanModel.remove(id);
      if (!affected) {
        return response.error(res, "Data tidak ditemukan", 404);
      }
      return response.success(res, { deleted: true });
    } catch (err) {
      console.error("TransferPlanController.remove gagal:", err);
      return response.error(res, "Gagal menghapus data.");
    }
  }
}

module.exports = new TransferPlanController();
