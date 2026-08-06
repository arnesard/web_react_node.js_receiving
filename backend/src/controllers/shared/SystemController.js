// src/controllers/SystemController.js
const { todayJakarta, currentHourJakarta } = require("../../utils/date");
const response = require("../../utils/response");

class SystemController {
  // GET /api/system/server-time
  // Return tanggal & jam "hari ini" versi server (WIB), biar frontend
  // gak perlu percaya jam bawaan device (scanner PDT dll bisa salah setting).
  async serverTime(req, res) {
    try {
      response.success(res, {
        date: todayJakarta(), // "YYYY-MM-DD"
        hour: currentHourJakarta(), // 0-23
        timezone: "Asia/Jakarta",
      });
    } catch (err) {
      response.error(res, err.message);
    }
  }
}

module.exports = new SystemController();
