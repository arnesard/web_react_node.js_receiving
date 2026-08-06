// src/controllers/LaporanTransferRakController.js
// Equivalen App\Http\Controllers\MonitoringTransferRak\LaporanTransferRakController (Laravel)
const TransferRakModel = require("../../../models/monitoring-transfer/TransferRakModel");
const TransferRakDetailModel = require("../../../models/monitoring-transfer/TransferRakDetailModel");
const EmployeeModel = require("../../../models/karyawan/EmployeeModel");
const DriverModel = require("../../../models/monitoring-transfer/DriverModel");
const VehicleModel = require("../../../models/monitoring-transfer/VehicleModel");
const { poolUtama } = require("../../../config/database");
const response = require("../../../utils/response");
const { todayJakarta } = require("../../../utils/date");
const ExcelJS = require("exceljs");

class LaporanTransferRakController {
  // GET /api/transfer-rak/laporan  → data dropdown filter (operator/supir/kendaraan)
  async index(req, res) {
    try {
      // Sama seperti dropdown Operator di Monitoring — cuma karyawan bagian TRANSFER
      const operators = await EmployeeModel.getByBagian("TRANSFER");
      const [driverRows] = await poolUtama.query(
        "SELECT id, nama_karyawan FROM drivers ORDER BY nama_karyawan ASC",
      );
      const [vehicleRows] = await poolUtama.query(
        "SELECT id, nama_kendaraan FROM vehicles ORDER BY nama_kendaraan ASC",
      );
      return response.success(res, {
        operators: operators.map((o) => ({ id: o.id, name: o.name })),
        drivers: driverRows,
        vehicles: vehicleRows,
      });
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  // GET /api/transfer-rak/laporan/data?start_date=&end_date=&operator=&supir=&kendaraan=&page=&limit=
  async getData(req, res) {
    try {
      const today = todayJakarta();
      const startDate = req.query.start_date || today;
      const endDate = req.query.end_date || today;
      const operator = req.query.operator || "";
      const supir = req.query.supir || "";
      const kendaraan = req.query.kendaraan || "";
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.max(1, parseInt(req.query.limit, 10) || 20);

      const transfers = await TransferRakModel.findForLaporan({
        startDate,
        endDate,
        operator,
        supir,
        kendaraan,
      });

      // 1 transfer bisa jadi lebih dari 1 baris laporan: 1 baris per operator
      // yang bertugas (baik itu tugas KIRIM atau tugas TERIMA), bukan 1 baris
      // per sesi transfer — ngikutin cara laporan manual di lapangan.
      const allRows = await buildRows(transfers);

      const total = allRows.length;
      const start = (page - 1) * limit;
      const pageRows = allRows.slice(start, start + limit).map((r, i) => ({
        ...r,
        no: start + i + 1,
      }));

      return response.success(res, {
        data: pageRows,
        page,
        limit,
        total,
        total_pages: Math.max(1, Math.ceil(total / limit)),
      });
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  // GET /api/transfer-rak/laporan/detail/:id
  async getDetail(req, res) {
    try {
      const transfer = await TransferRakModel.findById(req.params.id);
      if (!transfer) {
        return response.notFound(res, "Transfer tidak ditemukan");
      }

      const durasi =
        transfer.waktu_mulai && transfer.waktu_selesai
          ? `${diffMinutes(transfer.waktu_mulai, transfer.waktu_selesai)} menit`
          : "-";

      const detailRows = await TransferRakDetailModel.findAllByTransfer(
        transfer.id,
      );
      const details = detailRows.map((d, idx) => ({
        no: idx + 1,
        kode_rak: d.kode_rak,
        item: d.item || "-",
        qty: d.qty ?? "-",
        kategori: d.kategori || "-",
        deskripsi: d.deskripsi || "-",
        lokasi_asal: d.lokasi_asal || transfer.lokasi_asal || "-",
        operator: d.nama_pengirim || "-",
        waktu_scan: d.waktu_scan ? toTimeString(d.waktu_scan) : "-",
        lokasi_terima: d.lokasi_diterima || "-",
        waktu_terima: d.waktu_diterima
          ? toTimeString(d.waktu_diterima)
          : "Belum",
        penerima: d.nama_penerima || "-",
      }));

      return response.success(res, {
        header: {
          tanggal: formatDate(transfer.created_at || transfer.waktu_mulai),
          operator: transfer.nama_karyawan || "-",
          supir: transfer.nama_supir || "-",
          kendaraan: transfer.nama_kendaraan || "-",
          total_rak:
            transfer.tipe === "rak_kosong"
              ? `${transfer.jumlah_rak_kosong} Rak / ${transfer.jumlah_palet_kosong} Palet`
              : `${transfer.total_rak} Rak`,
          waktu_mulai: transfer.waktu_mulai
            ? toTimeString(transfer.waktu_mulai)
            : "-",
          waktu_selesai: transfer.waktu_selesai
            ? toTimeString(transfer.waktu_selesai)
            : "-",
          durasi,
          status: (transfer.status || "").toUpperCase(),
          catatan: transfer.catatan || "-",
        },
        details,
      });
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  // GET /api/transfer-rak/laporan/export?start_date=&end_date=&operator=&supir=&kendaraan=
  async exportExcel(req, res) {
    try {
      const today = todayJakarta();
      const startDate = req.query.start_date || today;
      const endDate = req.query.end_date || today;
      const operator = req.query.operator || "";
      const supir = req.query.supir || "";
      const kendaraan = req.query.kendaraan || "";

      const transfers = await TransferRakModel.findForLaporan({
        startDate,
        endDate,
        operator,
        supir,
        kendaraan,
      });
      const rows = (await buildRows(transfers)).map((r, i) => ({
        ...r,
        no: i + 1,
      }));

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Laporan Transfer Rak");

      ws.columns = [
        { header: "No", key: "no", width: 6 },
        { header: "Tanggal", key: "tanggal", width: 12 },
        { header: "Operator", key: "operator", width: 26 },
        { header: "Jenis", key: "jenis", width: 10 },
        { header: "Waktu", key: "waktu", width: 10 },
        { header: "Supir", key: "supir", width: 18 },
        { header: "Kendaraan", key: "kendaraan", width: 16 },
        { header: "Total Rak", key: "total_rak", width: 24 },
        { header: "Catatan", key: "catatan", width: 26 },
      ];

      const headerRow = ws.getRow(1);
      headerRow.height = 20;
      headerRow.eachCell((cell) => {
        cell.font = {
          bold: true,
          size: 10,
          name: "Arial",
          color: { argb: "FFFFFFFF" },
        };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF0021B3" },
        };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = {
          top: { style: "thin" },
          bottom: { style: "thin" },
          left: { style: "thin" },
          right: { style: "thin" },
        };
      });

      rows.forEach((r) => {
        const row = ws.addRow(r);
        row.eachCell((cell) => {
          cell.font = { size: 9, name: "Arial" };
          cell.alignment = { vertical: "middle" };
          cell.border = {
            top: { style: "thin", color: { argb: "FFCCCCCC" } },
            bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
            left: { style: "thin", color: { argb: "FFCCCCCC" } },
            right: { style: "thin", color: { argb: "FFCCCCCC" } },
          };
        });
      });

      const filename = `laporan-transfer-rak_${startDate}_${endDate}.xlsx`;
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      await wb.xlsx.write(res);
      res.end();
    } catch (err) {
      console.error("LaporanTransferRakController.exportExcel:", err);
      return response.error(res, err.message);
    }
  }
}

// ── Bangun baris tabel siap-tampil dari daftar transfer (dipakai getData & exportExcel) ──
// 1 sesi transfer bisa melahirkan lebih dari 1 baris: 1 baris per operator per
// tugas yang dia kerjain (KIRIM atau TERIMA) — biar sama kaya laporan manual
// operator di lapangan, yang nulis laporan berdasarkan tugas dia sendiri,
// bukan gabungan operator+penerima+status dalam satu baris.
async function buildRows(transfers) {
  const rows = [];
  for (const t of transfers) {
    let labelRak = `${t.total_rak} Rak`;
    if (t.tipe === "rak_kosong") {
      labelRak = `${t.jumlah_rak_kosong} Rak, ${t.jumlah_palet_kosong} Palet (KOSONG)`;
    }

    const base = {
      id: t.id,
      tanggal: formatDate(t.created_at || t.waktu_mulai),
      supir: t.nama_supir || "-",
      kendaraan: t.nama_kendaraan || "-",
      total_rak: labelRak,
      catatan: t.catatan || "-",
    };

    // ── Baris tugas KIRIM ──
    let senders;
    if (t.tipe === "rak_kosong") {
      senders = t.nama_karyawan ? [t.nama_karyawan] : [];
    } else {
      senders = await TransferRakDetailModel.distinctPengirimNames(t.id);
      if (!senders.length && t.nama_karyawan) senders = [t.nama_karyawan];
    }
    for (const nama of senders) {
      rows.push({
        ...base,
        row_key: `${t.id}-kirim-${nama}`,
        operator: nama,
        jenis: "Kirim",
        waktu: t.waktu_mulai ? toTimeShort(t.waktu_mulai) : "-",
      });
    }

    // ── Baris tugas TERIMA (cuma ada kalau emang udah ada yang nerima) ──
    let receivers;
    if (t.tipe === "rak_kosong") {
      receivers = t.nama_penerima ? [t.nama_penerima] : [];
    } else {
      receivers = await TransferRakDetailModel.distinctPenerimaNames(t.id);
    }
    for (const nama of receivers) {
      rows.push({
        ...base,
        row_key: `${t.id}-terima-${nama}`,
        operator: nama,
        jenis: "Terima",
        waktu: t.waktu_diterima
          ? toTimeShort(t.waktu_diterima)
          : t.waktu_selesai
            ? toTimeShort(t.waktu_selesai)
            : "-",
      });
    }
  }
  return rows;
}

// ── Helpers ──
function diffMinutes(start, end) {
  const s = start instanceof Date ? start : new Date(start);
  const e = end instanceof Date ? end : new Date(end);
  return Math.round((e.getTime() - s.getTime()) / 60000);
}

function toTimeShort(value) {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  });
}

function toTimeString(value) {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  });
}

function formatDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

module.exports = new LaporanTransferRakController();
