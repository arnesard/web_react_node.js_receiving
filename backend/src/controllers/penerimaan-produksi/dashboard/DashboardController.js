// src/controllers/DashboardController.js
const { poolUtama } = require("../../../config/database");
const response = require("../../../utils/response");
const {
  toJakartaDateString,
  currentHourJakarta,
  addDaysJakarta,
} = require("../../../utils/date");

class DashboardController {
  async index(req, res) {
    try {
      const hour = currentHourJakarta();
      let currentShift = 3;
      if (hour >= 7 && hour < 15) currentShift = 1;
      else if (hour >= 15 && hour < 23) currentShift = 2;

      const today = toJakartaDateString();
      // Filter tanggal umum (kartu statistik, per plant/grup, tabel).
      // Default: hari ini doang kalau gak di-set.
      const dateFrom = req.query.date_from || today;
      const dateTo = req.query.date_to || today;
      // Filter start date khusus buat chart Tren Produksi 7 Hari — selalu
      // nampilin 7 hari (start date s/d start date+6), default 6 hari
      // sebelum hari ini s/d hari ini (perilaku lama).
      const trendStart = req.query.trend_start || addDaysJakarta(today, -6);
      const trendEnd = addDaysJakarta(trendStart, 6);

      const [statsRows, trend7Days, perPlantRows, receptions, allJobTypes, jobPerPlantRows] =
        await Promise.all([
          poolUtama.query(
            `
          SELECT 
            COALESCE(SUM(production_count), 0) as totalProduction,
            COALESCE(SUM(ritase_result), 0)    as totalRitase,
            COUNT(DISTINCT employee_id)         as totalEmployees
          FROM receptions
          WHERE (date BETWEEN ? AND ?)
             OR (shift = 3 AND DATE(date) = DATE_SUB(?, INTERVAL 1 DAY))
        `,
            [dateFrom, dateTo, dateFrom],
          ),
          poolUtama.query(
            `
          SELECT DATE_FORMAT(date, '%d %b') as date,
                 SUM(production_count) as total
          FROM receptions
          WHERE date BETWEEN ? AND ?
          GROUP BY DATE(date), DATE_FORMAT(date, '%d %b')
          ORDER BY DATE(date) ASC
        `,
            [trendStart, trendEnd],
          ),
          poolUtama.query(
            `
          SELECT e.plant, e.group,
                 SUM(r.production_count) as total
          FROM receptions r
          JOIN employees e ON r.employee_id = e.employee_id
          WHERE (r.date BETWEEN ? AND ?)
             OR (r.shift = 3 AND DATE(r.date) = DATE_SUB(?, INTERVAL 1 DAY))
          GROUP BY e.plant, e.group
          ORDER BY e.plant, e.group
        `,
            [dateFrom, dateTo, dateFrom],
          ),
          poolUtama.query(
            `
          SELECT r.id, r.shift, r.job_today, r.production_count,
                 r.notes, r.date, r.created_at,
                 e.name as operator_name, e.plant, e.group,
                 e.primary_job_type as job_type
          FROM receptions r
          LEFT JOIN employees e ON r.employee_id = e.employee_id
          WHERE (
            (r.date BETWEEN ? AND ?)
            OR (r.shift = 3 AND DATE(r.date) = DATE_SUB(?, INTERVAL 1 DAY))
          )
          ORDER BY r.created_at DESC
          LIMIT 100
        `,
            [dateFrom, dateTo, dateFrom],
          ),
          poolUtama.query(`
          SELECT DISTINCT job_today FROM receptions
          WHERE job_today IS NOT NULL AND job_today != ''
          ORDER BY job_today ASC
        `),
          // Jenis pekerjaan yang PERNAH dikerjain per plant (window Tren 7
          // Hari yang lagi aktif), diurutin dari paling sering — dipakai
          // buat isi dropdown filter di Tren Individu per plant.
          poolUtama.query(
            `
          SELECT e.plant, r.job_today, COUNT(*) as cnt
          FROM receptions r
          JOIN employees e ON r.employee_id = e.employee_id
          WHERE r.date BETWEEN ? AND ?
            AND r.job_today IS NOT NULL AND r.job_today != ''
          GROUP BY e.plant, r.job_today
          ORDER BY e.plant, cnt DESC
        `,
            [trendStart, trendEnd],
          ),
        ]);

      const perPlant = {};
      for (const row of perPlantRows[0]) {
        if (!perPlant[row.plant])
          perPlant[row.plant] = { total: 0, perGroup: {} };
        perPlant[row.plant].total += Number(row.total);
        perPlant[row.plant].perGroup[row.group] = Number(row.total);
      }

      // Susun jobTypesPerPlant (urut popularitas) & selectedJobPerPlant
      // (job paling sering per plant, dipakai sebagai default dropdown)
      const jobTypesPerPlant = {};
      const selectedJobPerPlant = {};
      for (const row of jobPerPlantRows[0]) {
        if (!jobTypesPerPlant[row.plant]) jobTypesPerPlant[row.plant] = [];
        jobTypesPerPlant[row.plant].push(row.job_today);
        if (!selectedJobPerPlant[row.plant])
          selectedJobPerPlant[row.plant] = row.job_today; // baris pertama = cnt paling tinggi
      }

      return response.success(res, {
        stats: { ...statsRows[0][0], currentShift },
        trend7Days: trend7Days[0],
        trendStart,
        perPlant,
        receptions: receptions[0],
        allJobTypes: allJobTypes[0].map((r) => r.job_today),
        jobTypesPerPlant,
        selectedJobPerPlant,
        dateFrom,
        dateTo,
      });
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  async trend7Days(req, res) {
    try {
      const { job } = req.query;
      const trendStart = req.query.trend_start || addDaysJakarta(toJakartaDateString(), -6);
      const trendEnd = addDaysJakarta(trendStart, 6);

      let sql = `
        SELECT DATE_FORMAT(date, '%d %b') as date,
               SUM(production_count) as total
        FROM receptions
        WHERE date BETWEEN ? AND ?
      `;
      const params = [trendStart, trendEnd];
      if (job && job !== "all") {
        sql += " AND job_today = ?";
        params.push(job);
      }
      sql +=
        " GROUP BY DATE(date), DATE_FORMAT(date, '%d %b') ORDER BY DATE(date) ASC";

      const [rows] = await poolUtama.query(sql, params);
      return response.success(res, {
        dates: rows.map((r) => r.date),
        totals: rows.map((r) => Number(r.total)),
      });
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  async plantGroup(req, res) {
    try {
      const { job } = req.query;
      const today = toJakartaDateString();
      const dateFrom = req.query.date_from || today;
      const dateTo = req.query.date_to || today;

      let sql = `
        SELECT e.plant, e.group, SUM(r.production_count) as total
        FROM receptions r
        JOIN employees e ON r.employee_id = e.employee_id
        WHERE (
          (r.date BETWEEN ? AND ?)
          OR (r.shift = 3 AND DATE(r.date) = DATE_SUB(?, INTERVAL 1 DAY))
        )
      `;
      const params = [dateFrom, dateTo, dateFrom];
      if (job && job !== "all") {
        sql += " AND r.job_today = ?";
        params.push(job);
      }
      sql += " GROUP BY e.plant, e.group ORDER BY e.plant, e.group";

      const [rows] = await poolUtama.query(sql, params);
      const result = {};
      for (const row of rows) {
        if (!result[row.plant]) result[row.plant] = {};
        result[row.plant][row.group] = Number(row.total);
      }
      return response.success(res, result);
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  async trendIndividu(req, res) {
    try {
      const { plant, job } = req.query;

      const today = toJakartaDateString();
      const dates = [];
      for (let i = 6; i >= 0; i--) {
        dates.push(addDaysJakarta(today, -i));
      }

      const [rows] = await poolUtama.query(
        `
        SELECT e.name, DATE(r.date) as tgl, SUM(r.production_count) as total
        FROM receptions r
        JOIN employees e ON r.employee_id = e.employee_id
        WHERE e.plant = ? AND r.job_today = ?
          AND r.date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
        GROUP BY e.name, DATE(r.date)
        ORDER BY e.name
      `,
        [plant, job],
      );

      const seriesMap = {};
      for (const row of rows) {
        const tgl =
          row.tgl instanceof Date
            ? toJakartaDateString(row.tgl)
            : String(row.tgl).split("T")[0];
        if (!seriesMap[row.name]) seriesMap[row.name] = {};
        seriesMap[row.name][tgl] = Number(row.total);
      }

      const series = {};
      for (const name of Object.keys(seriesMap)) {
        series[name] = dates.map((d) => seriesMap[name][d] || 0);
      }

      const dateLabels = dates.map((d) => {
        const dt = new Date(d + "T12:00:00Z");
        return dt.toLocaleDateString("id-ID", {
          day: "2-digit",
          month: "short",
          timeZone: "Asia/Jakarta",
        });
      });

      return response.success(res, { dates: dateLabels, series });
    } catch (err) {
      return response.error(res, err.message);
    }
  }
}

module.exports = new DashboardController();
