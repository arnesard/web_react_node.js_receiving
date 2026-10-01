// backend/src/controllers/tube-barcode/TubeBarcodeController.js
const TubeBarcodeModel = require("../../models/tube-barcode/TubeBarcodeModel");
const response = require("../../utils/response");

function fail(res, err) {
  if (err && err.status) return response.error(res, err.message, err.status);
  console.error("[TubeBarcode]", err);
  return response.error(res, err.message || "Terjadi kesalahan server");
}

const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    fail(res, err);
  }
};

module.exports = {
  employees: wrap(async (req, res) =>
    response.success(res, await TubeBarcodeModel.listEmployees()),
  ),

  // Lookup Item Catalog dari DB PANDU
  itemLookup: wrap(async (req, res) => {
    const q = req.query.q || req.query.barcode || req.query.item;
    return response.success(
      res,
      await TubeBarcodeModel.lookupItemCatalog(q),
      "Item ditemukan",
    );
  }),

  // Scan Collie
  scanStore: wrap(async (req, res) => {
    const data = await TubeBarcodeModel.createScan(req.body || {});
    const msg = data.tube_known
      ? "Scan tersimpan"
      : "Scan tersimpan, tapi item ini belum terdaftar sebagai tube di master pairing";
    return response.success(res, data, msg, 201);
  }),
  scanCancel: wrap(async (req, res) => {
    await TubeBarcodeModel.cancelScan(req.params.id);
    return response.success(res, null, "Scan dibatalkan");
  }),

  // Receive
  receiveList: wrap(async (req, res) =>
    response.success(res, await TubeBarcodeModel.listPending(req.query.rack)),
  ),
  receiveApprove: wrap(async (req, res) =>
    response.success(
      res,
      await TubeBarcodeModel.approve(req.body || {}),
      "Berhasil di-approve",
    ),
  ),

  // Transfer
  transferLookup: wrap(async (req, res) =>
    response.success(
      res,
      await TubeBarcodeModel.lookupStock(req.query.rack, req.query.collie),
    ),
  ),
  transferKurang: wrap(async (req, res) =>
    response.success(
      res,
      await TubeBarcodeModel.kurang(req.body || {}),
      "Stok dikurangi",
    ),
  ),
  transferTambah: wrap(async (req, res) =>
    response.success(
      res,
      await TubeBarcodeModel.tambah(req.body || {}),
      "Stok ditambahkan",
      201,
    ),
  ),

  // Monitoring
  monitoring: wrap(async (req, res) =>
    response.success(
      res,
      await TubeBarcodeModel.monitoring({
        rack_code: req.query.rack,
        collie: req.query.collie,
        item: req.query.item,
      }),
    ),
  ),
};
