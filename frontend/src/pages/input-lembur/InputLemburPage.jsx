// src/pages/Overtime/Index.jsx
import { useEffect, useState } from "react";
import api from "../../api/axiosInstance";
import Swal from "sweetalert2";
import XLSX from "xlsx-js-style";
import {
  todayJakarta,
  formatDateID,
  toJakartaDateString,
} from "../../utils/date";

// Beberapa Android browser punya bug Intl.DateTimeFormat "en-CA" yang return
// format aneh (misal ada karakter unicode/spasi) — fallback manual supaya
// value input[type=date] selalu dapat YYYY-MM-DD yang bersih.
const todayStr = () => {
  try {
    const result = todayJakarta();
    // Pastiin formatnya bener: 4 digit - 2 digit - 2 digit
    if (/^\d{4}-\d{2}-\d{2}$/.test(result)) return result;
  } catch (_) {
    /* fallback */
  }
  // Fallback manual WIB (UTC+7)
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Lets people type "2300" and have it auto-format into "23:00" as they go —
// the native <input type="time"> pops up a wheel-picker on mobile that can't
// be typed into directly, this is a plain text field instead.
const formatTimeTyping = (raw) => {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
};

export default function Overtime() {
  const [employees, setEmployees] = useState([]);
  const [overtimes, setOvertimes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());

  const [tab, setTab] = useState("internal");

  const [employeeName, setEmployeeName] = useState("");
  const [employeeIdSelected, setEmployeeIdSelected] = useState("");
  const [operatorSearch, setOperatorSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [extName, setExtName] = useState("");
  const [extId, setExtId] = useState("");
  const [overtimeDate, setOvertimeDate] = useState(todayStr());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [totalJamInput, setTotalJamInput] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editData, setEditData] = useState(null);

  // Tanggal "hari ini" yang dipakai app, awalnya dari jam device (todayStr())
  // biar form langsung kepakai, lalu di-overwrite begitu server-time datang —
  // ini yang jadi sumber kebenaran, karena jam device (terutama scanner PDT
  // lawas) suka salah setting.
  const [serverToday, setServerToday] = useState(todayStr());

  useEffect(() => {
    let cancelled = false;
    api
      .get("/system/server-time")
      .then((res) => {
        if (cancelled) return;
        const serverDate = res.data?.data?.date;
        if (serverDate && /^\d{4}-\d{2}-\d{2}$/.test(serverDate)) {
          setServerToday(serverDate);
          // Kalau field yang masih default (belum diubah manual sama user)
          // masih nyamain jam device yang lama, betulin ke tanggal server.
          setOvertimeDate((prev) => (prev === todayStr() ? serverDate : prev));
          setStartDate((prev) => (prev === todayStr() ? serverDate : prev));
          setEndDate((prev) => (prev === todayStr() ? serverDate : prev));
        }
      })
      .catch(() => {
        // Gagal ambil dari server (misal offline) — tetep pakai jam device
        // sebagai fallback, jangan sampai form malah gak kepakai sama sekali.
        console.warn(
          "Gagal ambil server-time, pakai jam device sebagai fallback.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    loadInit();
  }, []);
  useEffect(() => {
    loadOvertimes();
  }, [startDate, endDate]);

  // Auto-tutup dropdown saat user scroll (penting di mobile: kalau dropdown
  // terbuka lalu user scroll ke bawah, backdrop fixed akan block tombol Edit/Hapus)
  useEffect(() => {
    if (!showDropdown) return;
    const handleScroll = () => setShowDropdown(false);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [showDropdown]);

  const loadInit = async () => {
    try {
      const res = await api.get("/employees");
      setEmployees(res.data.data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadOvertimes = async () => {
    setLoading(true);
    try {
      const res = await api.get("/overtime", {
        params: { start_date: startDate, end_date: endDate },
      });
      setOvertimes(res.data.data);
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEmployeeName("");
    setEmployeeIdSelected("");
    setOperatorSearch("");
    setExtName("");
    setExtId("");
    setOvertimeDate(serverToday);
    setStartTime("");
    setEndTime("");
    setTotalJamInput("");
    setReason("");
  };

  const selectEmployee = (emp) => {
    setEmployeeName(emp.name);
    setEmployeeIdSelected(emp.employee_id);
    setOperatorSearch(`${emp.name} (${emp.employee_id})`);
    setShowDropdown(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    let empId = employeeIdSelected;
    let empName = employeeName;
    let ambiguousMatches = [];

    // Kalau belum "dipilih" dari dropdown, coba cocokkan otomatis
    // dari teks yang udah diketik — TAPI cuma kalau hasilnya unik
    // (persis 1 karyawan). Kalau ada beberapa karyawan dengan nama
    // yang sama, jangan nebak — biar user pilih manual dari dropdown
    // biar gak salah orang.
    if (tab === "internal" && !empId && operatorSearch.trim()) {
      const typed = operatorSearch.trim().toLowerCase();

      // Match by ID selalu unik (ID gak mungkin kembar)
      const byId = employees.find(
        (emp) => emp.employee_id.toLowerCase() === typed,
      );
      if (byId) {
        empId = byId.employee_id;
        empName = byId.name;
      } else {
        const byName = employees.filter(
          (emp) => emp.name.toLowerCase() === typed,
        );
        if (byName.length === 1) {
          empId = byName[0].employee_id;
          empName = byName[0].name;
        } else if (byName.length > 1) {
          ambiguousMatches = byName;
        }
      }
    }

    if (tab === "internal" && !empId) {
      if (ambiguousMatches.length > 1) {
        setShowDropdown(true);
        Swal.fire(
          "Peringatan",
          `Ada ${ambiguousMatches.length} karyawan dengan nama "${operatorSearch.trim()}". Dropdown-nya udah kebuka di bawah kolom Karyawan — pilih salah satu (cek ID-nya) biar gak salah orang.`,
          "warning",
        );
      } else {
        Swal.fire(
          "Peringatan",
          "Karyawan tidak ditemukan. Pastikan nama/ID sesuai daftar, atau pilih dari dropdown.",
          "warning",
        );
      }
      return;
    }
    if (tab === "external" && !extName.trim()) {
      Swal.fire("Peringatan", "Nama karyawan wajib diisi!", "warning");
      return;
    }
    if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
      Swal.fire(
        "Peringatan",
        "Format jam belum lengkap/benar. Ketik dalam format HH:MM, contoh 23:00.",
        "warning",
      );
      return;
    }
    const totalJamNum = parseFloat(totalJamInput);
    if (!totalJamInput || isNaN(totalJamNum) || totalJamNum <= 0) {
      Swal.fire("Peringatan", "Total Jam Lembur wajib diisi angka lebih dari 0.", "warning");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        overtime_date: overtimeDate,
        start_time: startTime,
        end_time: endTime,
        total_jam: totalJamNum,
        reason,
      };
      if (tab === "internal") {
        payload.employee_name = empName;
        payload.employee_id = empId;
      } else {
        payload.employee_name_manual = extName;
        payload.employee_id_manual = extId;
      }

      await api.post("/overtime", payload);
      await Swal.fire({
        icon: "success",
        title: "Pengajuan lembur terkirim!",
        timer: 1500,
        showConfirmButton: false,
      });
      resetForm();
      loadOvertimes();
    } catch (err) {
      Swal.fire("Error", err.response?.data?.message || err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (ot) => {
    try {
      setEditData({
        id: ot.id,
        employee_name: ot.employee_name,
        overtime_date: toJakartaDateString(ot.overtime_date),
        start_time: String(ot.start_time).substring(0, 5),
        end_time: String(ot.end_time).substring(0, 5),
        total_jam: ot.total_jam != null ? String(ot.total_jam) : "",
        reason: ot.reason,
      });
      setShowEditModal(true);
    } catch (err) {
      console.error("openEdit ERROR:", err.message, err);
      Swal.fire("Error", "Gagal buka form edit: " + err.message, "error");
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    const totalJamNum = parseFloat(editData.total_jam);
    if (!editData.total_jam || isNaN(totalJamNum) || totalJamNum <= 0) {
      Swal.fire("Peringatan", "Total Jam Lembur wajib diisi angka lebih dari 0.", "warning");
      return;
    }
    try {
      await api.put(`/overtime/${editData.id}`, {
        ...editData,
        total_jam: totalJamNum,
      });
      await Swal.fire({
        icon: "success",
        title: "Data diperbarui!",
        timer: 1200,
        showConfirmButton: false,
      });
      setShowEditModal(false);
      loadOvertimes();
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    }
  };

  const handleDelete = async (ot) => {
    const result = await Swal.fire({
      title: "Hapus Pengajuan?",
      html: `Yakin hapus lembur <b>${ot.displayName}</b>?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Hapus",
      cancelButtonText: "Batal",
      confirmButtonColor: "#dc3545",
    });
    if (!result.isConfirmed) return;
    try {
      await api.delete(`/overtime/${ot.id}`);
      loadOvertimes();
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    }
  };

  const filteredEmployees = employees.filter(
    (e) =>
      e.name.toLowerCase().includes(operatorSearch.toLowerCase()) ||
      e.employee_id.toLowerCase().includes(operatorSearch.toLowerCase()),
  );

  const filteredOvertimes = overtimes.filter(
    (ot) =>
      !search || ot.displayName.toLowerCase().includes(search.toLowerCase()),
  );

  const exportExcel = () => {
    if (filteredOvertimes.length === 0) {
      Swal.fire("Info", "Belum ada data lembur untuk diekspor.", "info");
      return;
    }

    const headers = [
      "No",
      "Nama Karyawan",
      "ID",
      "Tanggal",
      "Jam Mulai",
      "Jam Selesai",
      "Total Jam",
      "Pekerjaan",
    ];

    const rows = filteredOvertimes.map((ot, idx) => [
      idx + 1,
      ot.displayName,
      ot.displayId || "-",
      formatDateID(ot.overtime_date, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
      ot.start_time.substring(0, 5),
      ot.end_time.substring(0, 5),
      ot.totalJam,
      ot.reason,
    ]);

    const titleRow = ["LAPORAN PENGAJUAN LEMBUR"];
    const periodRow = [`Periode: ${startDate} s/d ${endDate}`];

    const ws = XLSX.utils.aoa_to_sheet([
      titleRow,
      periodRow,
      [],
      headers,
      ...rows,
    ]);

    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: headers.length - 1 } },
    ];

    ws["!cols"] = [
      { wch: 5 },
      { wch: 28 },
      { wch: 12 },
      { wch: 14 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 40 },
    ];

    const titleStyle = {
      font: { bold: true, sz: 14, color: { rgb: "0F172A" } },
      alignment: { horizontal: "center" },
    };
    const periodStyle = {
      font: { sz: 10, color: { rgb: "475569" } },
      alignment: { horizontal: "center" },
    };
    const headerStyle = {
      font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
      fill: { fgColor: { rgb: "0EA5E9" } },
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "0369A1" } },
        bottom: { style: "thin", color: { rgb: "0369A1" } },
        left: { style: "thin", color: { rgb: "0369A1" } },
        right: { style: "thin", color: { rgb: "0369A1" } },
      },
    };
    const cellStyle = {
      font: { sz: 10, color: { rgb: "1E293B" } },
      alignment: { vertical: "center", wrapText: true },
      border: {
        top: { style: "thin", color: { rgb: "94A3B8" } },
        bottom: { style: "thin", color: { rgb: "94A3B8" } },
        left: { style: "thin", color: { rgb: "94A3B8" } },
        right: { style: "thin", color: { rgb: "94A3B8" } },
      },
    };

    ws["A1"].s = titleStyle;
    ws["A2"].s = periodStyle;

    const headerRowIdx = 3;
    headers.forEach((_, c) => {
      const cellRef = XLSX.utils.encode_cell({ r: headerRowIdx, c });
      if (ws[cellRef]) ws[cellRef].s = headerStyle;
    });

    rows.forEach((row, rIdx) => {
      row.forEach((_, c) => {
        const cellRef = XLSX.utils.encode_cell({
          r: headerRowIdx + 1 + rIdx,
          c,
        });
        if (ws[cellRef]) ws[cellRef].s = cellStyle;
      });
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Laporan Lembur");
    XLSX.writeFile(wb, `Laporan_Lembur_${startDate}_sd_${endDate}.xlsx`);
  };

  return (
    <div>
      <style>{`
        .ot-header { margin-bottom: 20px; }
        .ot-title { font-weight: 800; font-size: 22px; margin: 0; color: #0f172a; }
        .ot-subtitle { color: #94a3b8; font-size: 13px; margin: 2px 0 0; }

        .ot-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }

        .ot-form-card {
          background: #fff; border-radius: 16px; padding: 20px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }
        .ot-form-card h5 { font-weight: 800; font-size: 16px; margin: 0 0 16px; color: #0f172a; }

        .ot-list-card {
          background: #fff; border-radius: 16px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
          padding: 20px;
        }
        .ot-list-card h5 { font-weight: 800; font-size: 16px; margin: 0; color: #0f172a; }

        .ot-tabs { display: flex; gap: 6px; background: #f1f5f9; padding: 4px;
          border-radius: 999px; margin-bottom: 18px; }
        .ot-tab {
          flex: 1; text-align: center; padding: 9px 0; border-radius: 999px;
          border: none; background: transparent; font-weight: 700; font-size: 13px;
          color: #64748b; cursor: pointer; transition: all 0.2s;
        }
        .ot-tab.active { background: #0ea5e9; color: white; }

        .field-group { margin-bottom: 12px; }
        .field-label {
          font-size: 11px; font-weight: 700; text-transform: uppercase;
          color: #64748b; margin-bottom: 5px; display: block;
        }
        .field-input {
          width: 100%; font-size: 16px !important; min-height: 46px;
          border-radius: 12px; border: 1.5px solid #e2e8f0;
          padding: 10px 14px; background: #f8fafc; color: #1e293b;
          outline: none; transition: border-color 0.2s; box-sizing: border-box;
        }
        .field-input:focus { border-color: #0ea5e9; background: #fff; }
        .field-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

        .op-dropdown {
          position: absolute; top: calc(100% + 4px); left: 0; right: 0;
          background: #fff; border: 1.5px solid #e2e8f0; border-radius: 12px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.12); z-index: 200;
          max-height: 200px; overflow-y: auto;
        }
        .op-option { padding: 12px 14px; font-size: 13px; cursor: pointer; border-bottom: 1px solid #f8fafc; }
        .op-option:hover { background: #f0f9ff; }
        .op-option:last-child { border-bottom: none; }
        .op-option-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .op-option-id {
          font-family: monospace; font-size: 11px; font-weight: 700;
          color: #0284c7; background: #e0f2fe; border-radius: 6px;
          padding: 2px 6px; flex-shrink: 0;
        }
        .op-option-name { font-weight: 600; color: #0f172a; }
        .op-option-sub { font-size: 11px; color: #94a3b8; margin-top: 3px; }

        .duration-box {
          background: #f0f9ff; color: #0284c7; border-radius: 10px;
          padding: 10px 14px; font-size: 13px; font-weight: 600;
          margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;
        }

        .btn-submit-ot {
          width: 100%; min-height: 50px; border-radius: 14px; border: none;
          background: linear-gradient(135deg,#0ea5e9,#0284c7);
          color: white; font-size: 15px; font-weight: 700;
          margin-top: 8px; cursor: pointer;
        }
        .btn-submit-ot:disabled { opacity: 0.6; }

        .ot-filter-bar { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
        .ot-filter-bar input { font-size: 16px !important; min-height: 42px;
          border-radius: 10px; border: 1.5px solid #e2e8f0; padding: 6px 12px; background: #f8fafc; }
        .ot-date-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

        .ot-card {
          background: #f8fafc; border-radius: 12px; padding: 14px;
          margin-bottom: 10px; border: 1px solid #f1f5f9;
        }
        .ot-card-top { display: flex; justify-content: space-between; margin-bottom: 8px; }
        .ot-name { font-weight: 700; font-size: 14px; color: #0f172a; }
        .ot-id { font-size: 11px; color: #0ea5e9; font-weight: 600; }
        .ot-jam { font-size: 18px; font-weight: 900; color: #0ea5e9; text-align: right; }
        .ot-time { font-size: 11px; color: #94a3b8; text-align: right; }
        .ot-reason { font-size: 12px; color: #475569; margin-bottom: 10px; }
        .ot-meta { font-size: 11px; color: #94a3b8; margin-bottom: 10px; }
        .ot-actions { display: flex; gap: 8px; }
        .ot-actions button {
          flex: 1; min-height: 36px; border-radius: 8px; border: none;
          font-size: 12px; font-weight: 600; cursor: pointer;
        }

        .desktop-ot-table { display: none; }
        .mobile-ot-list { display: block; }

        .ot-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .ot-table th, .ot-table td { box-sizing: border-box; }
        .ot-table th:nth-child(1), .ot-table td:nth-child(1) { width: 26%; }
        .ot-table th:nth-child(2), .ot-table td:nth-child(2) { width: 12%; }
        .ot-table th:nth-child(3), .ot-table td:nth-child(3) { width: 14%; }
        .ot-table th:nth-child(4), .ot-table td:nth-child(4) { width: 24%; }
        .ot-table th:nth-child(5), .ot-table td:nth-child(5) { width: 92px; }
        .ot-table td:nth-child(4) {
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .ot-table th {
          padding: 8px 12px; font-size: 10.5px; font-weight: 700; text-transform: uppercase;
          color: #94a3b8; border-bottom: 2px solid #f1f5f9; text-align: left;
        }
        .ot-table td { padding: 7px 12px; border-bottom: 1px solid #f8fafc; font-size: 12.5px; vertical-align: middle; }
        .ot-table tbody tr:nth-child(even) { background: #fbfcfe; }
        .ot-table tbody tr:hover { background: #eff6ff; }
        .ot-table .btn-row-action {
          border: none; border-radius: 6px; padding: 4px 6px;
          font-size: 12px; cursor: pointer; margin: 1px;
        }

        .modal-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(15,23,42,0.6);
          backdrop-filter: blur(4px); z-index: 1000;
          display: flex; align-items: center; justify-content: center; padding: 16px;
        }
        .modal-box {
          background: #fff; border-radius: 20px; width: 100%; max-width: 460px;
          padding: 20px; max-height: 90vh; overflow-y: auto;
        }
        .modal-box h5 { font-weight: 800; margin: 0 0 4px; }

        .print-only { display: none; }
        @media print {
          @page { size: landscape; margin: 6mm; }

          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: white !important; }
          .ot-form-card, .ot-header { display: none !important; }
          .ot-grid { display: block !important; }

          /* Print preview renders at paper width, which is under the 992px breakpoint —
             so without this it silently falls back to the mobile card list instead of the table */
          .mobile-ot-list { display: none !important; }
          .desktop-ot-table { display: block !important; }

          /* This is what was cutting the list off after 1 screen's worth — reset it for print */
          .ot-list-card {
            position: static !important;
            max-height: none !important;
            overflow: visible !important;
            box-shadow: none !important;
            display: block !important;
            padding: 0 !important;
          }
          .ot-list-sticky-head { padding: 0 0 10px !important; border-bottom: none !important; }
          .ot-list-scroll-body { max-height: none !important; overflow: visible !important; padding: 0 !important; }

          .ot-table { width: 100% !important; border-collapse: collapse !important; }
          .ot-table thead { display: table-header-group; } /* repeat header on every printed page */
          .ot-table tr { page-break-inside: avoid; }
          .ot-table th, .ot-table td {
            font-size: 8px !important; padding: 2px 5px !important; line-height: 1.25 !important;
            border: 1px solid #94a3b8 !important;
          }
          .ot-table th {
            background: #dbeafe !important; color: #0f172a !important;
            -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
          }
          .ot-table tbody tr:nth-child(even) td {
            background: #f8fafc !important;
            -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
          }
          .ot-table td div { font-size: 8px !important; }
        }

        @media (min-width: 992px) {
          .ot-grid { grid-template-columns: 420px 1fr; align-items: start; gap: 24px; }
          .ot-filter-bar { flex-direction: row; align-items: center; }
          .ot-filter-bar input { flex: 1.5; }
          .ot-date-row { flex: 1; }
          .mobile-ot-list { display: none; }
          .desktop-ot-table { display: block; }

          /* Sticky but no overflow clipping — that's what was cutting off the dropdown */
          /* z-index needed: position:sticky always creates a new stacking context, which
             trapped the .op-dropdown (z-index:200) *inside* it — so the full-screen click-outside
             backdrop (z-index:99, rendered later in the DOM) painted on top of the whole card
             and swallowed clicks meant for the dropdown options. Desktop only, since mobile
             has no sticky/stacking-context here. */
          .ot-form-card { position: sticky; top: 16px; z-index: 150; }

          .ot-list-card { position: sticky; top: 16px; max-height: calc(100vh - 32px);
            display: flex; flex-direction: column; padding: 0; overflow: hidden; }
          .ot-list-sticky-head { padding: 20px 20px 16px; flex-shrink: 0; border-bottom: 1px solid #f1f5f9; }
          .ot-list-scroll-body { padding: 16px 20px 20px; overflow-y: auto; overflow-x: auto; flex: 1; scrollbar-gutter: stable; }
        }

        @media (min-width: 1600px) {
          .ot-grid { grid-template-columns: 460px 1fr; }
        }
      `}</style>

      <div className="ot-header">
        <h4 className="ot-title">Input Lembur</h4>
        <p className="ot-subtitle">Pengajuan dan riwayat lembur karyawan</p>
      </div>

      <div className="ot-grid">
        <div className="ot-form-card">
          <h5>Form Pengajuan Lembur</h5>

          <div className="ot-tabs">
            <button
              type="button"
              className={`ot-tab ${tab === "internal" ? "active" : ""}`}
              onClick={() => setTab("internal")}
            >
              Internal
            </button>
            <button
              type="button"
              className={`ot-tab ${tab === "external" ? "active" : ""}`}
              onClick={() => setTab("external")}
            >
              Bagian Lain
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            {tab === "internal" ? (
              <div className="field-group" style={{ position: "relative" }}>
                <label className="field-label">Karyawan *</label>
                <input
                  className="field-input"
                  placeholder="Ketik nama atau ID..."
                  value={operatorSearch}
                  autoComplete="off"
                  onChange={(e) => {
                    setOperatorSearch(e.target.value);
                    setShowDropdown(true);
                    setEmployeeName("");
                    setEmployeeIdSelected("");
                  }}
                  onFocus={() => setShowDropdown(true)}
                  onClick={() => setShowDropdown(true)}
                />
                {employeeIdSelected && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "#16a34a",
                      marginTop: 4,
                      fontWeight: 600,
                    }}
                  >
                    ✓ Terpilih: {employeeName} ({employeeIdSelected})
                  </div>
                )}
                {showDropdown && (
                  <div className="op-dropdown">
                    {filteredEmployees.length === 0 ? (
                      <div className="op-option text-muted">
                        Tidak ditemukan
                      </div>
                    ) : (
                      filteredEmployees.map((emp) => (
                        <div
                          key={emp.employee_id}
                          className="op-option"
                          onMouseDown={() => selectEmployee(emp)}
                        >
                          <div className="op-option-top">
                            <span className="op-option-id">
                              {emp.employee_id}
                            </span>
                            <span className="op-option-name">{emp.name}</span>
                          </div>
                          {(emp.plant || emp.group || emp.department) && (
                            <div className="op-option-sub">
                              {[
                                emp.department,
                                emp.plant &&
                                  `Plant ${emp.plant}${emp.group ? ` / Grup ${emp.group}` : ""}`,
                              ]
                                .filter(Boolean)
                                .join(" • ")}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="field-group">
                  <label className="field-label">Nama Karyawan *</label>
                  <input
                    className="field-input"
                    placeholder="Contoh: ardiansyah"
                    value={extName}
                    onChange={(e) => setExtName(e.target.value)}
                  />
                </div>
                <div className="field-group">
                  <label className="field-label">ID Karyawan (Opsional)</label>
                  <input
                    className="field-input"
                    placeholder="Contoh: 08-8888"
                    value={extId}
                    onChange={(e) => setExtId(e.target.value)}
                  />
                </div>
              </>
            )}

            <div className="field-group">
              <label className="field-label">Tanggal *</label>
              <input
                type="date"
                className="field-input"
                value={overtimeDate}
                max={serverToday}
                onChange={(e) => setOvertimeDate(e.target.value)}
                required
              />
            </div>

            <div className="field-row-2">
              <div className="field-group">
                <label className="field-label">Jam Mulai *</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="HH:MM"
                  maxLength={5}
                  pattern="^([01]\d|2[0-3]):[0-5]\d$"
                  className="field-input"
                  value={startTime}
                  onChange={(e) =>
                    setStartTime(formatTimeTyping(e.target.value))
                  }
                  required
                />
              </div>
              <div className="field-group">
                <label className="field-label">Jam Selesai *</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="HH:MM"
                  maxLength={5}
                  pattern="^([01]\d|2[0-3]):[0-5]\d$"
                  className="field-input"
                  value={endTime}
                  onChange={(e) => setEndTime(formatTimeTyping(e.target.value))}
                  required
                />
              </div>
            </div>

            <div className="field-group">
              <label className="field-label">Total Jam Lembur *</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.5"
                min="0.5"
                placeholder="Contoh: 7"
                className="field-input"
                value={totalJamInput}
                onChange={(e) => setTotalJamInput(e.target.value)}
                required
              />
            </div>

            <div className="field-group">
              <label className="field-label">Job *</label>
              <textarea
                className="field-input"
                rows={3}
                placeholder="Pekerjaan yang dikerjakan, contoh: scan..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                style={{ minHeight: "unset", resize: "none" }}
                required
              />
            </div>

            <button
              type="submit"
              className="btn-submit-ot"
              disabled={submitting}
            >
              {submitting ? "⏳ Mengirim..." : "📤 Ajukan Lembur"}
            </button>
          </form>
        </div>

        <div className="ot-list-card">
          <div className="ot-list-sticky-head">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
              className="no-print"
            >
              <h5>Laporan Pengajuan Lembur</h5>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={exportExcel}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 10,
                    border: "1.5px solid #16a34a",
                    background: "#fff",
                    color: "#16a34a",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  📊 Export Excel
                </button>
                <button
                  onClick={() => window.print()}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 10,
                    border: "1.5px solid #0ea5e9",
                    background: "#fff",
                    color: "#0ea5e9",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  🖨️ Cetak
                </button>
              </div>
            </div>

            <div
              className="print-only"
              style={{ textAlign: "center", marginBottom: 6 }}
            >
              <h5
                style={{
                  fontWeight: 800,
                  textDecoration: "underline",
                  fontSize: 14,
                  margin: 0,
                }}
              >
                LAPORAN PENGAJUAN LEMBUR
              </h5>
              <p style={{ fontSize: 9, color: "#475569", margin: "2px 0 0" }}>
                Periode: {startDate} s/d {endDate}
              </p>
            </div>

            <div className="ot-filter-bar no-print">
              <input
                placeholder="🔍 Cari nama karyawan..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="ot-date-row">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="ot-list-scroll-body">
            {loading ? (
              <div className="text-center py-4 text-muted">
                <div className="spinner-border spinner-border-sm mb-2" />
                <div style={{ fontSize: 13 }}>Loading...</div>
              </div>
            ) : filteredOvertimes.length === 0 ? (
              <div
                className="text-center py-4 text-muted"
                style={{ fontSize: 13 }}
              >
                Belum ada pengajuan lembur
              </div>
            ) : (
              <>
                <div className="mobile-ot-list">
                  {filteredOvertimes.map((ot) => (
                    <div className="ot-card" key={ot.id}>
                      <div className="ot-card-top">
                        <div>
                          <div className="ot-name">{ot.displayName}</div>
                          {ot.displayId && (
                            <div className="ot-id">{ot.displayId}</div>
                          )}
                        </div>
                        <div>
                          <div className="ot-jam">{ot.totalJam} Jam</div>
                          <div className="ot-time">
                            {ot.start_time.substring(0, 5)} -{" "}
                            {ot.end_time.substring(0, 5)}
                          </div>
                        </div>
                      </div>
                      <div className="ot-reason">{ot.reason}</div>
                      <div className="ot-meta">
                        📅{" "}
                        {formatDateID(ot.overtime_date, {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </div>
                      <div className="ot-actions no-print">
                        <button
                          style={{ background: "#dbeafe", color: "#1d4ed8" }}
                          onClick={() => openEdit(ot)}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          style={{ background: "#fee2e2", color: "#dc2626" }}
                          onClick={() => handleDelete(ot)}
                        >
                          🗑️ Hapus
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="desktop-ot-table">
                  <table className="ot-table">
                    <thead>
                      <tr>
                        <th>Karyawan</th>
                        <th>Tanggal</th>
                        <th>Waktu</th>
                        <th>Pekerjaan</th>
                        <th
                          className="no-print"
                          style={{ textAlign: "center" }}
                        >
                          Aksi
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOvertimes.map((ot) => (
                        <tr key={ot.id}>
                          <td>
                            <div style={{ fontWeight: 700, color: "#0f172a" }}>
                              {ot.displayName}
                            </div>
                            {ot.displayId && (
                              <div
                                style={{
                                  fontSize: 11,
                                  color: "#0ea5e9",
                                  fontWeight: 600,
                                }}
                              >
                                {ot.displayId}
                              </div>
                            )}
                          </td>
                          <td>
                            {formatDateID(ot.overtime_date, {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </td>
                          <td>
                            <div style={{ fontWeight: 700 }}>
                              {ot.totalJam} Jam
                            </div>
                            <div style={{ fontSize: 11, color: "#94a3b8" }}>
                              {ot.start_time.substring(0, 5)} -{" "}
                              {ot.end_time.substring(0, 5)}
                            </div>
                          </td>
                          <td
                            style={{ color: "#475569", fontSize: 11.5 }}
                            title={ot.reason}
                          >
                            {ot.reason}
                          </td>
                          <td
                            className="no-print"
                            style={{
                              textAlign: "center",
                              whiteSpace: "nowrap",
                            }}
                          >
                            <button
                              className="btn-row-action"
                              title="Edit"
                              style={{
                                background: "#dbeafe",
                                color: "#1d4ed8",
                              }}
                              onClick={() => openEdit(ot)}
                            >
                              ✏️
                            </button>
                            <button
                              className="btn-row-action"
                              title="Hapus"
                              style={{
                                background: "#fee2e2",
                                color: "#dc2626",
                              }}
                              onClick={() => handleDelete(ot)}
                            >
                              🗑️
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Backdrop untuk tutup dropdown — HANYA aktif saat dropdown terbuka.
          Di mobile (single column), form ada di atas dan list di bawah.
          Backdrop ini perlu pointer-events:none saat tidak aktif supaya
          tombol Edit/Hapus di list card tetap bisa diklik.
          z-index 99 = di bawah dropdown (200) tapi di atas konten biasa.
          Tapi list card ada di luar form-card, jadi seharusnya tidak
          ter-intercept selama backdrop hanya muncul saat showDropdown=true
          dan user belum scroll ke bawah. */}
      {showDropdown && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 99,
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
            setShowDropdown(false);
          }}
          onClick={() => setShowDropdown(false)}
        />
      )}

      {showEditModal && editData && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowEditModal(false);
          }}
        >
          <div className="modal-box">
            <h5>Edit Lembur</h5>
            <p
              style={{
                color: "#0ea5e9",
                fontWeight: 600,
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              {editData.employee_name}
            </p>
            <form onSubmit={handleUpdate}>
              <div className="field-group">
                <label className="field-label">Tanggal *</label>
                <input
                  type="date"
                  className="field-input"
                  value={editData.overtime_date}
                  onChange={(e) =>
                    setEditData({ ...editData, overtime_date: e.target.value })
                  }
                  required
                />
              </div>
              <div className="field-row-2">
                <div className="field-group">
                  <label className="field-label">Mulai *</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="HH:MM"
                    maxLength={5}
                    pattern="^([01]\d|2[0-3]):[0-5]\d$"
                    className="field-input"
                    value={editData.start_time}
                    onChange={(e) =>
                      setEditData({
                        ...editData,
                        start_time: formatTimeTyping(e.target.value),
                      })
                    }
                    required
                  />
                </div>
                <div className="field-group">
                  <label className="field-label">Selesai *</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="HH:MM"
                    maxLength={5}
                    pattern="^([01]\d|2[0-3]):[0-5]\d$"
                    className="field-input"
                    value={editData.end_time}
                    onChange={(e) =>
                      setEditData({
                        ...editData,
                        end_time: formatTimeTyping(e.target.value),
                      })
                    }
                    required
                  />
                </div>
              </div>
              <div className="field-group">
                <label className="field-label">Total Jam Lembur *</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min="0.5"
                  placeholder="Contoh: 7"
                  className="field-input"
                  value={editData.total_jam}
                  onChange={(e) =>
                    setEditData({ ...editData, total_jam: e.target.value })
                  }
                  required
                />
              </div>
              <div className="field-group">
                <label className="field-label">Job *</label>
                <textarea
                  className="field-input"
                  rows={3}
                  value={editData.reason}
                  onChange={(e) =>
                    setEditData({ ...editData, reason: e.target.value })
                  }
                  style={{ minHeight: "unset", resize: "none" }}
                  required
                />
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid #e2e8f0",
                    background: "#f8fafc",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 12,
                    border: "none",
                    background: "#0ea5e9",
                    color: "white",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
