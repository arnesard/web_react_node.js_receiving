// src/controllers/ReportController.js
const ReportModel = require("../../../models/penerimaan-produksi/ReportModel");
const response = require("../../../utils/response");
const ExcelJS = require("exceljs");
const {
  todayJakarta,
  addDaysJakarta,
  toJakartaDateString,
} = require("../../../utils/date");

// ─── Helper: extract params dari request ─────────────────────
function extractParams(req) {
  const today = todayJakarta();
  const thisMonth = today.slice(0, 7);
  const thisYear = today.slice(0, 4);
  const sevenDaysAgo = offsetDate(today, -7);
  const filterType = req.query.filter_type || "daily";
  const date = req.query.date || today;

  return {
    filterType,
    shift: req.query.shift || "",
    plant: req.query.plant || "",
    group: req.query.group || "",
    bagian: req.query.bagian || "",
    operatorName: (req.query.operator_name || "").trim(),
    jobToday: req.query.job_today || "",
    startDate: req.query.start_date || sevenDaysAgo,
    endDate: req.query.end_date || date,
    startMonth: req.query.start_month || thisMonth,
    endMonth: req.query.end_month || thisMonth,
    year: req.query.year || thisYear,
  };
}

function offsetDate(dateStr, days) {
  return addDaysJakarta(dateStr, days);
}

// ─── index() ─────────────────────────────────────────────────
class ReportController {
  async index(req, res) {
    try {
      const params = extractParams(req);
      const receptions = await ReportModel.getFiltered(params);

      // Hitung ranking
      const operatorMap = {};
      const groupMap = {};
      const plantMap = {};

      for (const r of receptions) {
        const plant = r.emp_plant || "Unknown";
        const group = r.emp_group || "Unknown";
        const empId = r.employee_id;
        const prod = Number(r.production_count) || 0;
        const rit = Number(r.ritase_result) || 0;

        if (!plantMap[plant]) plantMap[plant] = { name: plant, count: 0 };
        plantMap[plant].count += prod;

        if (!groupMap[plant]) groupMap[plant] = {};
        if (!groupMap[plant][group])
          groupMap[plant][group] = { name: group, production: 0, ritase: 0 };
        groupMap[plant][group].production += prod;
        groupMap[plant][group].ritase += rit;

        if (!operatorMap[plant]) operatorMap[plant] = {};
        if (!operatorMap[plant][empId])
          operatorMap[plant][empId] = {
            name: r.emp_name || "Unknown",
            production: 0,
            ritase: 0,
          };
        operatorMap[plant][empId].production += prod;
        operatorMap[plant][empId].ritase += rit;
      }

      // Sort operator ranking
      const operatorRanking = {};
      for (const [p, ops] of Object.entries(operatorMap)) {
        operatorRanking[p] = Object.values(ops).sort(
          (a, b) => b.production + b.ritase - (a.production + a.ritase),
        );
      }

      // Group ranking
      const groupRanking = {};
      for (const [p, groups] of Object.entries(groupMap)) {
        groupRanking[p] = Object.values(groups);
      }

      const plantRanking = Object.values(plantMap).sort(
        (a, b) => b.count - a.count,
      );

      const [allJobs, allEmployees] = await Promise.all([
        ReportModel.getAllJobs(),
        ReportModel.getAllEmployeeNames(),
      ]);

      return response.success(res, {
        receptions,
        operatorRanking,
        groupRanking,
        plantRanking,
        allJobs,
        allEmployees,
        filters: params,
      });
    } catch (err) {
      console.error("ReportController.index:", err);
      return response.error(res, err.message);
    }
  }

  async exportExcel(req, res) {
    try {
      const exportType = req.query.export_type || "daily";
      const params = extractParams(req);

      let exportParams = { ...params };
      if (exportType === "monthly_recap" || exportType === "group_ranking") {
        exportParams.filterType = "yearly";
      }

      const receptions = await ReportModel.getFilteredForExport(exportParams);
      const year = params.year || todayJakarta().slice(0, 4);

      let workbook, filename;

      if (exportType === "monthly_recap") {
        workbook = await buildMonthlyRecap(receptions, year, params.bagian);
        filename = `rekap_bulanan_${params.plant || "semua"}_${params.group || "semua"}_${params.bagian || "semua"}_${year}.xlsx`;
      } else if (exportType === "group_ranking") {
        workbook = await buildGroupRanking(receptions, year, params.bagian);
        filename = `ranking_grup_${params.plant || "semua"}_${params.bagian || "semua"}_${year}.xlsx`;
      } else {
        workbook = await buildDailyRecap(receptions, params);
        filename = `rekap_harian_${params.plant || "semua"}_${params.bagian || "semua"}_${params.filterType}_${today()}.xlsx`;
      }

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      console.error("ReportController.exportExcel:", err);
      return response.error(res, err.message);
    }
  }
}

module.exports = new ReportController();

// ─────────────────────────────────────────────────────────────
// EXCEL BUILDERS
// ─────────────────────────────────────────────────────────────

function today() {
  return todayJakarta();
}

function colLetter(n) {
  let s = "";
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

const GROUP_COLORS = {
  A: { bg: "FF4472C4", font: "FFFFFFFF" },
  B: { bg: "FF70AD47", font: "FFFFFFFF" },
  C: { bg: "FFED7D31", font: "FFFFFFFF" },
  D: { bg: "FFFFC000", font: "FF000000" },
};
// Warna header per PLANT (dipisah dari GROUP_COLORS biar gak ketuker —
// kebetulan Plant "B" jangan sampai kepakein warna Grup "B"). Plant yang
// belum ada di sini (mis. BPW1/2/3 nanti) fallback ke warna abu netral.
const PLANT_COLORS = {
  B: { bg: "FF2563EB", font: "FFFFFFFF" },
  H: { bg: "FF059669", font: "FFFFFFFF" },
  I: { bg: "FFD97706", font: "FFFFFFFF" },
  T: { bg: "FFDC2626", font: "FFFFFFFF" },
};
function plantColor(plant) {
  return PLANT_COLORS[plant] || { bg: "FF4B5563", font: "FFFFFFFF" };
}

// ─── Split sheet per PLANT + BAGIAN, dan pengelompokan baris per GRUP ──
// Kalau 1 plant punya lebih dari 1 nilai BAGIAN (mis. Plant I: OK / OE /
// Preparation), export dipecah jadi sheet terpisah per bagian. Plant yang
// cuma punya 1 bagian (atau kosong semua, kayak plant lain) tetap 1 sheet
// kayak sebelumnya — jadi gak ngubah behavior plant yang gak butuh bagian.
const GROUP_ORDER = ["A", "B", "C", "D"];
function groupRank(g) {
  const idx = GROUP_ORDER.indexOf((g || "").toUpperCase().trim());
  return idx === -1 ? 99 : idx;
}
function groupColor(g) {
  return (
    GROUP_COLORS[(g || "").toUpperCase().trim()] || {
      bg: "FF6B7280",
      font: "FFFFFFFF",
    }
  );
}
// Beberapa data lama ada kolom `bagian` yang isinya literal "\N" (sisa
// import CSV yang NULL-nya kebawa jadi teks, bukan NULL beneran) — itu
// harus dianggap kosong, bukan nama bagian sungguhan.
function normalizeBagian(raw) {
  const v = (raw || "").trim();
  if (!v || /^\\?n$/i.test(v)) return "";
  return v;
}
// Nama worksheet Excel gak boleh ada karakter * ? : \ / [ ] dan max 31
// karakter — dibersihin di sini biar data kotor apa pun gak bikin export
// gagal total.
function safeSheetName(name) {
  return name.replace(/[*?:\\/\[\]]/g, "-").slice(0, 31);
}
function splitPlantBagian(receptions) {
  const plants = [
    ...new Set(receptions.map((r) => r.emp_plant || "Unknown")),
  ].sort();
  const result = [];
  for (const plant of plants) {
    const plantData = receptions.filter((r) => r.emp_plant === plant);
    const bagianValues = [
      ...new Set(
        plantData.map((r) => normalizeBagian(r.emp_bagian)).filter(Boolean),
      ),
    ].sort();

    if (bagianValues.length >= 2) {
      for (const bagian of bagianValues) {
        result.push({
          plant,
          bagian,
          data: plantData.filter(
            (r) => normalizeBagian(r.emp_bagian) === bagian,
          ),
        });
      }
      const sisa = plantData.filter((r) => !normalizeBagian(r.emp_bagian));
      if (sisa.length) result.push({ plant, bagian: "LAINNYA", data: sisa });
    } else {
      result.push({ plant, bagian: null, data: plantData });
    }
  }
  return result;
}

// Baris pemisah full-width "GRUP A/B/C/D" di antara blok karyawan.
function addGroupBandRow(ws, rowNum, groupLabel, totalCols) {
  const color = groupColor(groupLabel);
  const row = ws.getRow(rowNum);
  row.height = 18;
  ws.mergeCells(rowNum, 1, rowNum, totalCols);
  const cell = row.getCell(1);
  cell.value =
    "GRUP " + (groupLabel && groupLabel !== "-" ? groupLabel : "LAINNYA");
  cell.font = {
    bold: true,
    size: 10,
    name: "Arial",
    color: { argb: color.font },
  };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: color.bg },
  };
  cell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  for (let c = 1; c <= totalCols; c++) {
    row.getCell(c).border = {
      top: { style: "thin" },
      bottom: { style: "thin" },
      left: { style: "thin" },
      right: { style: "thin" },
    };
  }
}

const BULAN = [
  "",
  "JANUARI",
  "FEBRUARI",
  "MARET",
  "APRIL",
  "MEI",
  "JUNI",
  "JULI",
  "AGUSTUS",
  "SEPTEMBER",
  "OKTOBER",
  "NOVEMBER",
  "DESEMBER",
];
const MEDALS = ["FFD700", "C0C0C0", "CD7F32"];

function styleHeader(cell, bgArgb, fontArgb = "FFFFFFFF") {
  cell.font = { bold: true, size: 9, name: "Arial", color: { argb: fontArgb } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgArgb } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  cell.border = {
    top: { style: "thin" },
    bottom: { style: "thin" },
    left: { style: "thin" },
    right: { style: "thin" },
  };
}

function styleInfoRow(cell) {
  cell.font = { bold: true, size: 11, name: "Arial" };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEDEDED" },
  };
  cell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
}

function borderThin(cell) {
  cell.border = {
    top: { style: "thin", color: { argb: "FFCCCCCC" } },
    bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
    left: { style: "thin", color: { argb: "FFCCCCCC" } },
    right: { style: "thin", color: { argb: "FFCCCCCC" } },
  };
}

function addTitleRows(ws, title, plantName, groupInfo, lastColLetter) {
  ws.getRow(1).height = 26;
  const t1 = ws.getCell("A1");
  t1.value = title;
  t1.font = { bold: true, size: 14, name: "Arial" };
  t1.alignment = { horizontal: "center", vertical: "middle" };
  ws.mergeCells(`A1:${lastColLetter}1`);

  ws.getRow(2).height = 18;
  const t2 = ws.getCell("A2");
  t2.value = "BAGIAN PENERIMAAN PRODUKSI";
  t2.font = { bold: true, size: 11, name: "Arial" };
  t2.alignment = { horizontal: "center", vertical: "middle" };
  ws.mergeCells(`A2:${lastColLetter}2`);

  ws.getRow(3).height = 8;

  ws.getRow(4).height = 18;
  const t4 = ws.getCell("A4");
  t4.value = "Plant : " + plantName;
  styleInfoRow(t4);
  ws.mergeCells(`A4:${lastColLetter}4`);

  ws.getRow(5).height = 18;
  const t5 = ws.getCell("A5");
  t5.value = groupInfo;
  styleInfoRow(t5);
  ws.mergeCells(`A5:${lastColLetter}5`);

  ws.getRow(6).height = 6;
}

function getDateStr(r) {
  if (!r.date) return "";
  if (typeof r.date === "string") return r.date.split("T")[0];
  return toJakartaDateString(r.date);
}

// ─── DAILY RECAP ─────────────────────────────────────────────
async function buildDailyRecap(receptions, params) {
  const wb = new ExcelJS.Workbook();

  // Generate date columns
  let dates = [];
  if (params.filterType === "daily" && params.startDate && params.endDate) {
    let cur = params.startDate;
    const end = params.endDate;
    while (cur <= end) {
      dates.push(cur);
      cur = addDaysJakarta(cur, 1);
    }
  } else if (
    params.filterType === "monthly" &&
    params.startMonth === params.endMonth
  ) {
    const start = new Date(params.startMonth + "-01");
    const days = new Date(
      start.getFullYear(),
      start.getMonth() + 1,
      0,
    ).getDate();
    for (let d = 1; d <= days; d++)
      dates.push(`${params.startMonth}-${String(d).padStart(2, "0")}`);
  } else {
    dates = [...new Set(receptions.map((r) => getDateStr(r)))].sort();
  }

  // Worksheet dipecah per PLANT (diambil dinamis dari data, otomatis
  // nyesuain kalau nanti nambah BPW1/2/3 dll). Kalau plant-nya punya lebih
  // dari 1 BAGIAN (mis. Plant I: OK / OE / Preparation), dipecah lagi jadi
  // sheet per bagian — dan tiap sheet dikelompokkan per GRUP A/B/C/D.
  const sheetGroups = splitPlantBagian(receptions);

  for (const { plant, bagian, data: plantData } of sheetGroups) {
    const bagianLabel = bagian || normalizeBagian(params.bagian);
    const sheetName = safeSheetName(
      bagianLabel ? `PLANT ${plant} - ${bagianLabel}` : "PLANT " + plant,
    );
    const ws = wb.addWorksheet(sheetName);
    const color = plantColor(plant);
    const totalCols = 5 + dates.length + 2;
    const lastColLetter = colLetter(totalCols);

    // Pivot
    const pivot = {},
      empInfo = {};
    for (const r of plantData) {
      const empId = r.employee_id;
      const job = r.job_today || "Lainnya";
      const date = getDateStr(r);
      const prod = Number(r.production_count) || 0;
      if (!pivot[empId]) pivot[empId] = {};
      if (!pivot[empId][job]) pivot[empId][job] = {};
      pivot[empId][job][date] = (pivot[empId][job][date] || 0) + prod;
      if (!empInfo[empId])
        empInfo[empId] = {
          name: (r.emp_name || "Unknown").toUpperCase(),
          nip: empId,
          group: r.emp_group || "-",
        };
    }

    const periodeLabel = `${params.startDate || "-"} s/d ${params.endDate || "-"}`;
    const infoLabel = bagianLabel
      ? `Periode : ${periodeLabel}  |  Bagian : ${bagianLabel}`
      : `Periode : ${periodeLabel}`;
    addTitleRows(
      ws,
      "LAPORAN REKAP PRODUKSI OPERATOR",
      plant,
      infoLabel,
      lastColLetter,
    );

    // Header row 7
    ws.getRow(7).height = 20;
    [
      "NO",
      "NAMA",
      "NIP",
      "GRUP",
      "PEKERJAAN",
      ...dates.map((d) => parseInt(d.split("-")[2])),
      "TOTAL",
      "RATA-RATA",
    ].forEach(
      (h, i) =>
        styleHeader(ws.getRow(7).getCell(i + 1), color.bg, color.font) ||
        (ws.getRow(7).getCell(i + 1).value = h),
    );

    ws.getColumn(1).width = 5;
    ws.getColumn(2).width = 28;
    ws.getColumn(3).width = 11;
    ws.getColumn(4).width = 7;
    ws.getColumn(5).width = 24;
    for (let c = 6; c <= 5 + dates.length; c++) ws.getColumn(c).width = 5.5;
    ws.getColumn(totalCols - 1).width = 10;
    ws.getColumn(totalCols).width = 10;

    let rowNum = 8,
      no = 1;
    const rowMeta = [];
    let currentGroup;

    const sortedEmpIds = Object.keys(pivot).sort((a, b) => {
      const ga = groupRank(empInfo[a]?.group);
      const gb = groupRank(empInfo[b]?.group);
      if (ga !== gb) return ga - gb;
      return (empInfo[a]?.name || "").localeCompare(empInfo[b]?.name || "");
    });

    for (const empId of sortedEmpIds) {
      const jobs = pivot[empId];
      const empGroup = empInfo[empId]?.group || "-";
      if (empGroup !== currentGroup) {
        addGroupBandRow(ws, rowNum, empGroup, totalCols);
        rowNum++;
        currentGroup = empGroup;
        no = 1;
      }

      let isFirst = true;
      for (const [job, dateData] of Object.entries(jobs)) {
        const row = ws.getRow(rowNum);
        row.height = 16;
        if (isFirst) {
          row.getCell(1).value = no;
          row.getCell(2).value = empInfo[empId]?.name || "";
          row.getCell(3).value = empInfo[empId]?.nip || "";
          row.getCell(4).value = empInfo[empId]?.group || "";
        }
        row.getCell(5).value = job;

        let total = 0,
          hasDays = 0;
        dates.forEach((date, i) => {
          const val = dateData[date] || 0;
          const cell = row.getCell(6 + i);
          cell.value = val > 0 ? val : null;
          cell.alignment = { horizontal: "center" };
          if (val > 0) {
            total += val;
            hasDays++;
          }
        });

        const tc = row.getCell(totalCols - 1);
        tc.value = total > 0 ? total : null;
        tc.font = { bold: true };
        tc.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFE2EFDA" },
        };
        tc.alignment = { horizontal: "center" };
        const ac = row.getCell(totalCols);
        ac.value = hasDays > 0 ? Math.round(total / hasDays) : null;
        ac.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFDAE3F3" },
        };
        ac.alignment = { horizontal: "center" };

        for (let c = 1; c <= totalCols; c++) borderThin(row.getCell(c));
        rowMeta.push({ rowNum, isFirst, no });
        rowNum++;
        isFirst = false;
      }
      no++;
    }

    let isEven = false;
    for (let i = 0; i < rowMeta.length; i++) {
      const { rowNum: rn, isFirst, no: rNo } = rowMeta[i];
      const next = rowMeta[i + 1];
      if (isFirst) isEven = !isEven;
      if (isEven)
        for (let c = 1; c <= totalCols; c++)
          ws.getRow(rn).getCell(c).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF2F2F2" },
          };
      if (!next || next.isFirst)
        for (let c = 1; c <= totalCols; c++)
          ws.getRow(rn).getCell(c).border = {
            ...ws.getRow(rn).getCell(c).border,
            bottom: { style: "medium", color: { argb: "FF888888" } },
          };
      ws.getRow(rn).getCell(1).alignment = { horizontal: "center" };
    }
    ws.views = [{ state: "frozen", xSplit: 5, ySplit: 7 }];
  }
  return wb;
}

// ─── MONTHLY RECAP ────────────────────────────────────────────
async function buildMonthlyRecap(receptions, year, bagianFilter) {
  const wb = new ExcelJS.Workbook();
  const sheetGroups = splitPlantBagian(receptions);

  for (const { plant, bagian, data: plantData } of sheetGroups) {
    const bagianLabel = bagian || normalizeBagian(bagianFilter);
    const sheetName = safeSheetName(
      bagianLabel ? `PLANT ${plant} - ${bagianLabel}` : "PLANT " + plant,
    );
    const ws = wb.addWorksheet(sheetName);
    const color = plantColor(plant);
    const months = [
      ...new Set(plantData.map((r) => new Date(r.date).getMonth() + 1)),
    ].sort((a, b) => a - b);
    const totalCols = 5 + months.length + 2;
    const lastColLetter = colLetter(totalCols);

    const pivot = {},
      empInfo = {};
    for (const r of plantData) {
      const empId = r.employee_id,
        job = r.job_today || "Lainnya";
      const month = new Date(r.date).getMonth() + 1;
      const prod = Number(r.production_count) || 0;
      if (!pivot[empId]) pivot[empId] = {};
      if (!pivot[empId][job]) pivot[empId][job] = {};
      if (!pivot[empId][job][month])
        pivot[empId][job][month] = { total: 0, days: 0 };
      pivot[empId][job][month].total += prod;
      pivot[empId][job][month].days += 1;
      if (!empInfo[empId])
        empInfo[empId] = {
          name: (r.emp_name || "Unknown").toUpperCase(),
          nip: empId,
          group: r.emp_group || "-",
        };
    }

    const ranked = {};
    for (const [empId, jobs] of Object.entries(pivot)) {
      let tot = 0,
        cnt = 0;
      for (const md of Object.values(jobs))
        for (const m of months)
          if (md[m]?.days > 0) {
            tot += md[m].total / md[m].days;
            cnt++;
          }
      ranked[empId] = cnt > 0 ? tot / cnt : 0;
    }
    // Urutan: per GRUP A/B/C/D dulu, baru di dalam grup diurut dari
    // produksi rata-rata tertinggi (medali emas/perak/perunggu jadi
    // per-grup, bukan ketiban ke grup A doang).
    const sortedIds = Object.keys(ranked).sort((a, b) => {
      const ga = groupRank(empInfo[a]?.group);
      const gb = groupRank(empInfo[b]?.group);
      if (ga !== gb) return ga - gb;
      return ranked[b] - ranked[a];
    });

    const infoLabel = bagianLabel
      ? `Tahun : ${year}  |  Bagian : ${bagianLabel}`
      : `Tahun : ${year}`;
    addTitleRows(
      ws,
      "LAPORAN REKAP BULANAN OPERATOR",
      plant,
      infoLabel,
      lastColLetter,
    );

    ws.getRow(7).height = 20;
    [
      "NO",
      "NAMA",
      "NIP",
      "GRUP",
      "PEKERJAAN",
      ...months.map((m) => BULAN[m]),
      "TOTAL AVG",
      "RATA-RATA",
    ].forEach((h, i) => {
      const c = ws.getRow(7).getCell(i + 1);
      c.value = h;
      styleHeader(c, color.bg, color.font);
    });

    ws.getColumn(1).width = 5;
    ws.getColumn(2).width = 28;
    ws.getColumn(3).width = 11;
    ws.getColumn(4).width = 7;
    ws.getColumn(5).width = 22;
    for (let c = 6; c <= 5 + months.length; c++) ws.getColumn(c).width = 12;
    ws.getColumn(totalCols - 1).width = 12;
    ws.getColumn(totalCols).width = 12;

    let rowNum = 8,
      no = 1;
    const rowMeta = [];
    let currentGroup;
    let localRank = 0;

    for (const empId of sortedIds) {
      const empGroup = empInfo[empId]?.group || "-";
      if (empGroup !== currentGroup) {
        addGroupBandRow(ws, rowNum, empGroup, totalCols);
        rowNum++;
        currentGroup = empGroup;
        localRank = 0;
        no = 1;
      }
      localRank++;

      let isFirst = true;
      for (const [job, monthData] of Object.entries(pivot[empId])) {
        const row = ws.getRow(rowNum);
        row.height = 16;
        if (isFirst) {
          row.getCell(1).value = no;
          row.getCell(2).value = empInfo[empId]?.name || "";
          row.getCell(3).value = empInfo[empId]?.nip || "";
          row.getCell(4).value = empInfo[empId]?.group || "";
        }
        row.getCell(5).value = job;
        let jt = 0,
          jc = 0;
        months.forEach((m, i) => {
          const cell = row.getCell(6 + i);
          if (monthData[m]?.days > 0) {
            const avg = monthData[m].total / monthData[m].days;
            cell.value = Math.round(avg);
            jt += avg;
            jc++;
          } else cell.value = null;
          cell.alignment = { horizontal: "center" };
        });
        const tc = row.getCell(totalCols - 1);
        tc.value = jc > 0 ? Math.round(jt) : null;
        tc.font = { bold: true };
        tc.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFE2EFDA" },
        };
        tc.alignment = { horizontal: "center" };
        const ac = row.getCell(totalCols);
        ac.value = jc > 0 ? Math.round(jt / jc) : null;
        ac.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFDAE3F3" },
        };
        ac.alignment = { horizontal: "center" };
        for (let c = 1; c <= totalCols; c++) borderThin(row.getCell(c));
        rowMeta.push({ rowNum, isFirst, no, localRank });
        rowNum++;
        isFirst = false;
      }
      no++;
    }

    let isEven = false;
    for (let i = 0; i < rowMeta.length; i++) {
      const { rowNum: rn, isFirst, localRank: lr } = rowMeta[i];
      const next = rowMeta[i + 1];
      if (isFirst) isEven = !isEven;
      if (isEven)
        for (let c = 1; c <= totalCols; c++)
          ws.getRow(rn).getCell(c).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF2F2F2" },
          };
      if (!next || next.isFirst)
        for (let c = 1; c <= totalCols; c++)
          ws.getRow(rn).getCell(c).border = {
            ...ws.getRow(rn).getCell(c).border,
            bottom: { style: "medium", color: { argb: "FF888888" } },
          };
      if (isFirst && lr <= 3) {
        ws.getRow(rn).getCell(1).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF" + MEDALS[lr - 1] },
        };
        ws.getRow(rn).getCell(1).font = { bold: true };
      }
      ws.getRow(rn).getCell(1).alignment = { horizontal: "center" };
    }
    ws.views = [{ state: "frozen", xSplit: 5, ySplit: 7 }];
  }
  return wb;
}

// ─── GROUP RANKING ────────────────────────────────────────────
async function buildGroupRanking(receptions, year, bagianFilter) {
  const wb = new ExcelJS.Workbook();
  const sheetGroups = splitPlantBagian(receptions.filter((r) => r.emp_plant));

  for (const { plant, bagian, data: plantData } of sheetGroups) {
    const bagianLabel = bagian || normalizeBagian(bagianFilter);
    const sheetName = safeSheetName(
      bagianLabel ? `PLANT ${plant} - ${bagianLabel}` : "PLANT " + plant,
    );
    const ws = wb.addWorksheet(sheetName);
    const months = [
      ...new Set(plantData.map((r) => new Date(r.date).getMonth() + 1)),
    ].sort((a, b) => a - b);
    const totalCols = 4 + months.length + 2;
    const lastColLetter = colLetter(totalCols);

    const groupPivot = {},
      groupLeader = {};
    for (const r of plantData) {
      const group = r.emp_group || "-",
        month = new Date(r.date).getMonth() + 1,
        prod = Number(r.production_count) || 0;
      if (!groupPivot[group]) groupPivot[group] = {};
      groupPivot[group][month] = (groupPivot[group][month] || 0) + prod;
      const isLeader =
        (r.emp_default_status || "").toLowerCase() === "leader" ||
        (r.emp_primary_job_type || "").toLowerCase() === "leader";
      if (isLeader && !groupLeader[group])
        groupLeader[group] = {
          name: (r.emp_name || "Unknown").toUpperCase(),
          nip: r.employee_id,
        };
    }

    const byTotalDesc = Object.entries(groupPivot)
      .map(([g, md]) => ({
        group: g,
        total: Object.values(md).reduce((a, b) => a + b, 0),
      }))
      .sort((a, b) => b.total - a.total);
    const rankMap = {};
    byTotalDesc.forEach((g, i) => (rankMap[g.group] = i + 1));

    // Baris ditampilkan berurutan GRUP A/B/C/D, tapi nomor RANK & warna
    // medali tetap pakai ranking produksi asli (rankMap).
    const ranked = [...byTotalDesc].sort(
      (a, b) => groupRank(a.group) - groupRank(b.group),
    );

    const groupRankInfoLabel = bagianLabel
      ? `Tahun : ${year}  |  Bagian : ${bagianLabel}`
      : `Tahun : ${year}`;
    addTitleRows(
      ws,
      "RANKING GRUP PER PLANT",
      plant,
      groupRankInfoLabel,
      lastColLetter,
    );

    ws.getRow(7).height = 20;
    [
      "RANK",
      "GROUP",
      "NAMA LEADER",
      "NIP LEADER",
      ...months.map((m) => BULAN[m]),
      "TOTAL",
      "RATA-RATA",
    ].forEach((h, i) => {
      const c = ws.getRow(7).getCell(i + 1);
      c.value = h;
      styleHeader(c, "FF243F60", "FFFFFFFF");
    });

    ws.getColumn(1).width = 6;
    ws.getColumn(2).width = 10;
    ws.getColumn(3).width = 28;
    ws.getColumn(4).width = 12;
    for (let c = 5; c <= 4 + months.length; c++) ws.getColumn(c).width = 12;
    ws.getColumn(totalCols - 1).width = 12;
    ws.getColumn(totalCols).width = 12;

    const GROUP_BG = {
      A: "FFDAEEF3",
      B: "FFEBF1DE",
      C: "FFFDE9D9",
      D: "FFFFF2CC",
    };
    let rowNum = 8;

    for (const { group, total } of ranked) {
      const rank = rankMap[group];
      const leader = groupLeader[group] || { name: "-", nip: "-" };
      const row = ws.getRow(rowNum);
      row.height = 18;
      row.getCell(1).value = rank;
      row.getCell(2).value = "GRUP " + group;
      row.getCell(3).value = leader.name;
      row.getCell(4).value = leader.nip;
      let cnt = 0;
      months.forEach((m, idx) => {
        const val = groupPivot[group][m] || 0;
        const cell = row.getCell(5 + idx);
        cell.value = val > 0 ? val : null;
        cell.alignment = { horizontal: "center" };
        if (val > 0) cnt++;
      });
      const tc = row.getCell(totalCols - 1);
      tc.value = total > 0 ? total : null;
      tc.font = { bold: true };
      tc.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE2EFDA" },
      };
      tc.alignment = { horizontal: "center" };
      const ac = row.getCell(totalCols);
      ac.value = cnt > 0 ? Math.round(total / cnt) : null;
      ac.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFDAE3F3" },
      };
      ac.alignment = { horizontal: "center" };
      const bgArgb = GROUP_BG[group] || "FFFFFFFF";
      for (let c = 1; c <= totalCols; c++) {
        const cell = row.getCell(c);
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: bgArgb },
        };
        cell.border = {
          bottom: { style: "medium", color: { argb: "FFAAAAAA" } },
          top: { style: "thin", color: { argb: "FFCCCCCC" } },
          left: { style: "thin", color: { argb: "FFCCCCCC" } },
          right: { style: "thin", color: { argb: "FFCCCCCC" } },
        };
      }
      if (rank <= 3) {
        row.getCell(1).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF" + MEDALS[rank - 1] },
        };
        row.getCell(1).font = { bold: true, size: 11 };
      }
      row.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(2).font = { bold: true };
      row.getCell(2).alignment = { horizontal: "center", vertical: "middle" };
      rowNum++;
    }
    ws.views = [{ state: "frozen", xSplit: 4, ySplit: 7 }];
  }
  return wb;
}
