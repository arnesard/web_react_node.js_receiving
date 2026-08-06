// src/models/ReportModel.js
const { poolUtama } = require("../../config/database");
const { toJakartaDateString } = require("../../utils/date");

const BASE_SELECT = `
    SELECT
        r.id, r.employee_id, r.shift, r.ritase_result,
        r.production_count, r.date, r.job_today, r.notes, r.photo,
        e.name              AS emp_name,
        e.plant             AS emp_plant,
        e.\`group\`         AS emp_group,
        e.bagian            AS emp_bagian,
        e.default_status    AS emp_default_status,
        e.primary_job_type  AS emp_primary_job_type
    FROM receptions r
    LEFT JOIN employees e ON r.employee_id = e.employee_id
`;

function buildWhere(params) {
  const {
    filterType,
    shift,
    plant,
    group,
    bagian,
    jobToday,
    startDate,
    endDate,
    startMonth,
    endMonth,
    year,
    operatorName,
  } = params;

  const conditions = [];
  const values = [];

  if (filterType === "daily") {
    conditions.push("r.date BETWEEN ? AND ?");
    values.push(startDate, endDate);
  } else if (filterType === "monthly") {
    const s = startMonth + "-01";
    // Hari terakhir bulan `endMonth`, dihitung via UTC-noon supaya
    // gak kena geser hari akibat konversi timezone.
    const eDate = new Date(endMonth + "-01T12:00:00Z");
    eDate.setUTCMonth(eDate.getUTCMonth() + 1);
    eDate.setUTCDate(0);
    conditions.push("r.date BETWEEN ? AND ?");
    values.push(s, toJakartaDateString(eDate));
  } else if (filterType === "yearly") {
    conditions.push("YEAR(r.date) = ?");
    values.push(year);
  }

  if (shift) {
    conditions.push("r.shift = ?");
    values.push(shift);
  }
  if (plant) {
    conditions.push("e.plant = ?");
    values.push(plant);
  }
  if (group) {
    conditions.push("e.`group` = ?");
    values.push(group);
  }
  if (bagian) {
    conditions.push("e.bagian = ?");
    values.push(bagian);
  }
  if (jobToday) {
    conditions.push("r.job_today LIKE ?");
    values.push("%" + jobToday + "%");
  }
  if (operatorName) {
    const t = "%" + operatorName.toLowerCase() + "%";
    conditions.push("(LOWER(e.name) LIKE ? OR LOWER(r.employee_id) LIKE ?)");
    values.push(t, t);
  }

  return {
    where: conditions.length ? "WHERE " + conditions.join(" AND ") : "",
    values,
  };
}

class ReportModel {
  // Untuk halaman web — limit 1000
  async getFiltered(params) {
    const { where, values } = buildWhere(params);
    const sql = `${BASE_SELECT} ${where} ORDER BY r.date DESC, r.created_at DESC LIMIT 1000`;
    const [rows] = await poolUtama.query(sql, values);
    return rows;
  }

  // Untuk export — tanpa limit
  async getFilteredForExport(params) {
    const { where, values } = buildWhere(params);
    const sql = `${BASE_SELECT} ${where} ORDER BY r.date ASC, e.name ASC`;
    const [rows] = await poolUtama.query(sql, values);
    return rows;
  }

  async getAllJobs() {
    const [rows] = await poolUtama.query(
      "SELECT DISTINCT job_today FROM receptions WHERE job_today IS NOT NULL ORDER BY job_today",
    );
    return rows.map((r) => r.job_today);
  }

  async getAllEmployeeNames() {
    const [rows] = await poolUtama.query(
      "SELECT DISTINCT name FROM employees ORDER BY name",
    );
    return rows.map((r) => r.name);
  }
}

module.exports = new ReportModel();
