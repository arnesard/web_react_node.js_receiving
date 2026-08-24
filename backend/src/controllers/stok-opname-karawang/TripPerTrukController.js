// src/controllers/stok-opname-karawang/TripPerTrukController.js
const KarawangTripPerTrukModel = require("../../models/stok-opname-karawang/KarawangTripPerTrukModel");
const response = require("../../utils/response");

function todayJakarta() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });
}

class TripPerTrukController {
  // GET /stok-opname-karawang/trip-per-truk?date=YYYY-MM-DD
  static async index(req, res) {
    try {
      const date = req.query.date || todayJakarta();
      const data = await KarawangTripPerTrukModel.getTripPerTruk(date);
      return response.success(res, { date, trucks: data });
    } catch (err) {
      console.error("TripPerTrukController.index gagal:", err);
      return response.error(
        res,
        err.message || "Gagal mengambil data Trip per Truk",
        502,
      );
    }
  }
}

module.exports = TripPerTrukController;
