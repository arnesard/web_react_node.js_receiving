// src/pages/Employees/Index.jsx
import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import api from "../../api/axiosInstance";
import Swal from "sweetalert2";
import { todayJakarta } from "../../utils/date";

// Plant & Grup sekarang diambil dari API /production-options (menu
// Pengaturan) — sumber datanya sama persis dengan yang dipakai di form
// Input Hasil Kerja, jadi cukup dikelola di satu tempat.
const JOB_TYPES = [
  "Scan",
  "Strapping",
  "Tempel Stiker",
  "Susun Tire",
  "Pressing",
  "Driver",
  "Leader",
  "Pasang Product Tage OE",
];
const STATUSES = ["Team Leader", "Operator", "Driver Forklift"];

const PLANT_COLORS = {
  B: "#0d6efd",
  H: "#0dcaf0",
  I: "#ffc107",
  T: "#fd7e14",
};
const STATUS_COLORS = {
  "Team Leader": "#10b981",
  Operator: "#6366f1",
  "Driver Forklift": "#f59e0b",
};

const emptyForm = {
  name: "",
  employee_id: "",
  plant: "",
  group: "",
  bagian: "",
  department: "",
  position: "",
  default_status: "",
  primary_job_type: "",
  hire_date: todayJakarta(),
  phone: "",
  address: "",
};

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterPlant, setFilterPlant] = useState("");
  const [filterGroup, setFilterGroup] = useState("");
  const [filterBagian, setFilterBagian] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  // Daftar Plant, Grup & Bagian dinamis dari menu Pengaturan
  const [plants, setPlants] = useState([]);
  const [groups, setGroups] = useState([]);
  const [bagians, setBagians] = useState([]);

  // Modal Pengaturan Plant, Grup & Bagian — dibuka di halaman ini juga
  // (bukan pindah ke halaman terpisah kayak di menu Penerimaan Produksi)
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [rawOptions, setRawOptions] = useState({
    plant: [],
    group: [],
    bagian: [],
  });
  const [newPlant, setNewPlant] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [newBagian, setNewBagian] = useState("");
  const [savingOptionType, setSavingOptionType] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadEmployees();
    loadOptions();
  }, []);

  const loadOptions = async () => {
    try {
      const res = await api.get("/production-options");
      const opts = res.data?.data || {};
      setRawOptions({
        plant: opts.plant || [],
        group: opts.group || [],
        bagian: opts.bagian || [],
      });
      setPlants((opts.plant || []).map((o) => o.value));
      setGroups((opts.group || []).map((o) => o.value));
      setBagians((opts.bagian || []).map((o) => o.value));
    } catch (err) {
      console.warn("Gagal ambil opsi plant/grup/bagian:", err.message);
    }
  };

  const handleAddOption = async (type) => {
    const value = (
      type === "plant" ? newPlant : type === "group" ? newGroup : newBagian
    ).trim();
    if (!value) return;

    setSavingOptionType(type);
    try {
      await api.post("/production-options", { type, value });
      if (type === "plant") setNewPlant("");
      else if (type === "group") setNewGroup("");
      else setNewBagian("");
      await loadOptions();
    } catch (err) {
      Swal.fire(
        "Gagal",
        err.response?.data?.message || err.message,
        "error",
      );
    } finally {
      setSavingOptionType(null);
    }
  };

  const OPTION_LABELS = { plant: "Plant", group: "Grup", bagian: "Bagian" };

  const handleDeleteOption = async (type, item) => {
    const result = await Swal.fire({
      title: `Hapus ${OPTION_LABELS[type] || type} ini?`,
      html: `Yakin hapus <b>${item.value}</b>? Data karyawan yang sudah pakai nilai ini tidak akan terhapus, ini cuma hilang dari pilihan.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Hapus",
      cancelButtonText: "Batal",
      confirmButtonColor: "#dc3545",
    });
    if (!result.isConfirmed) return;

    try {
      await api.delete(`/production-options/${item.id}`);
      await loadOptions();
    } catch (err) {
      Swal.fire("Error", err.response?.data?.message || err.message, "error");
    }
  };

  const loadEmployees = async () => {
    setLoading(true);
    try {
      const res = await api.get("/employees");
      setEmployees(res.data.data);
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const filtered = employees.filter((e) => {
    const matchSearch =
      !search ||
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.employee_id.toLowerCase().includes(search.toLowerCase());
    const matchPlant = !filterPlant || e.plant === filterPlant;
    const matchGroup = !filterGroup || e.group === filterGroup;
    const matchBagian = !filterBagian || e.bagian === filterBagian;
    return matchSearch && matchPlant && matchGroup && matchBagian;
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (emp) => {
    setEditingId(emp.id);
    setForm({
      name: emp.name,
      employee_id: emp.employee_id,
      plant: emp.plant,
      group: emp.group,
      bagian: emp.bagian || "",
      department: emp.department || "",
      position: emp.position || "",
      default_status: emp.default_status,
      primary_job_type: emp.primary_job_type,
      hire_date: emp.hire_date?.split("T")[0] || "",
      phone: emp.phone || "",
      address: emp.address || "",
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingId) {
        await api.put(`/employees/${editingId}`, form);
      } else {
        await api.post("/employees", form);
      }
      await Swal.fire({
        icon: "success",
        title: editingId ? "Data diperbarui!" : "Karyawan ditambahkan!",
        timer: 1500,
        showConfirmButton: false,
      });
      setShowModal(false);
      loadEmployees();
    } catch (err) {
      Swal.fire("Error", err.response?.data?.message || err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (emp) => {
    const result = await Swal.fire({
      title: "Hapus Karyawan?",
      html: `Yakin hapus <b>${emp.name}</b>?<br><small class="text-danger">Data tidak bisa dikembalikan!</small>`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Hapus",
      cancelButtonText: "Batal",
      confirmButtonColor: "#dc3545",
    });
    if (!result.isConfirmed) return;
    try {
      await api.delete(`/employees/${emp.id}`);
      loadEmployees();
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    }
  };

  const handleExport = () => {
    setExporting(true);
    const params = new URLSearchParams({
      search,
      plant: filterPlant,
      group: filterGroup,
      bagian: filterBagian,
    });
    // Base URL export ngikutin baseURL axios (dev: host eksplisit, prod: relatif)
    const base = api.defaults.baseURL.replace(/\/$/, "");
    window.open(`${base}/employees/export?${params.toString()}`, "_blank");
    setTimeout(() => setExporting(false), 800);
  };

  const f = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  // ── FORM FIELDS — dipakai di mobile & desktop modal
  const FormFields = () => (
    <>
      <div className="modal-field-row">
        <div className="modal-field">
          <label>Nama Lengkap *</label>
          <input
            placeholder="Nama lengkap"
            required
            value={form.name}
            onChange={(e) => f("name", e.target.value)}
          />
        </div>
        <div className="modal-field">
          <label>ID Karyawan *</label>
          <input
            placeholder="Contoh: 08-0631"
            required
            value={form.employee_id}
            onChange={(e) => f("employee_id", e.target.value)}
          />
        </div>
      </div>

      <div className="modal-field-row">
        <div className="modal-field">
          <label>Plant *</label>
          <select
            required
            value={form.plant}
            onChange={(e) => f("plant", e.target.value)}
          >
            <option value="">Pilih</option>
            {plants.map((p) => (
              <option key={p} value={p}>
                Plant {p}
              </option>
            ))}
          </select>
        </div>
        <div className="modal-field">
          <label>Grup *</label>
          <select
            required
            value={form.group}
            onChange={(e) => f("group", e.target.value)}
          >
            <option value="">Pilih</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                Grup {g}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="modal-field">
        <label>Bagian</label>
        <select value={form.bagian} onChange={(e) => f("bagian", e.target.value)}>
          <option value="">— Tidak ada / tidak perlu —</option>
          {bagians.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>

      <div className="modal-field-row">
        <div className="modal-field">
          <label>Department *</label>
          <input
            placeholder="Produksi"
            required
            value={form.department}
            onChange={(e) => f("department", e.target.value)}
          />
        </div>
        <div className="modal-field">
          <label>Position *</label>
          <input
            placeholder="Operator"
            required
            value={form.position}
            onChange={(e) => f("position", e.target.value)}
          />
        </div>
      </div>

      <div className="modal-field">
        <label>Status Default *</label>
        <select
          required
          value={form.default_status}
          onChange={(e) => f("default_status", e.target.value)}
        >
          <option value="">Pilih Status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="modal-field">
        <label>Pekerjaan Utama *</label>
        <select
          required
          value={form.primary_job_type}
          onChange={(e) => f("primary_job_type", e.target.value)}
        >
          <option value="">Pilih Pekerjaan</option>
          {JOB_TYPES.map((j) => (
            <option key={j} value={j}>
              {j}
            </option>
          ))}
        </select>
      </div>

      <div className="modal-field-row">
        <div className="modal-field">
          <label>Tanggal Masuk *</label>
          <input
            type="date"
            required
            value={form.hire_date}
            onChange={(e) => f("hire_date", e.target.value)}
          />
        </div>
        <div className="modal-field">
          <label>No. Telepon</label>
          <input
            type="tel"
            placeholder="08xxx"
            value={form.phone}
            onChange={(e) => f("phone", e.target.value)}
          />
        </div>
      </div>

      <div className="modal-field">
        <label>Alamat</label>
        <textarea
          rows={2}
          placeholder="Alamat lengkap..."
          value={form.address}
          onChange={(e) => f("address", e.target.value)}
        />
      </div>
    </>
  );

  return (
    <div>
      <style>{`
        /* ════════════════════════════════
           BASE STYLES
        ════════════════════════════════ */
        .emp-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        .emp-title { font-weight: 800; font-size: 22px; margin: 0; color: #0f172a; }
        .emp-subtitle { color: #94a3b8; font-size: 13px; margin: 2px 0 0; }

        /* Tombol tambah — desktop only */
        .btn-tambah-desktop {
          display: none;
          align-items: center; gap: 8px;
          padding: 10px 20px;
          background: linear-gradient(135deg, #0d6efd, #0284c7);
          color: white; border: none; border-radius: 12px;
          font-size: 14px; font-weight: 700; cursor: pointer;
          box-shadow: 0 4px 12px rgba(13,110,253,0.3);
          transition: transform 0.15s;
        }
        .btn-tambah-desktop:hover { transform: translateY(-1px); }

        /* Tombol Pengaturan — di sebelah Tambah Karyawan, tampil di
           mobile (icon only) & desktop (icon + label) */
        .emp-header-actions { display: flex; align-items: center; gap: 8px; }
        .btn-pengaturan {
          display: flex; align-items: center; gap: 6px;
          padding: 10px 14px;
          background: #fff; color: #475569;
          border: 1.5px solid #e2e8f0; border-radius: 12px;
          font-size: 13px; font-weight: 700; cursor: pointer;
          transition: all 0.15s;
        }
        .btn-pengaturan:hover { border-color: #0d6efd; color: #0d6efd; }
        .btn-pengaturan-label { display: none; }
        @media (min-width: 768px) {
          .btn-pengaturan-label { display: inline; }
        }

        /* Stat grid */
        .emp-stat-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 16px;
        }
        .emp-stat-card {
          border-radius: 16px; padding: 16px;
          color: white; border: none;
        }
        .emp-stat-card .label {
          font-size: 10px; font-weight: 700;
          text-transform: uppercase; opacity: 0.85; margin-bottom: 4px;
        }
        .emp-stat-card .value { font-size: 32px; font-weight: 900; line-height: 1; }

        /* Filter bar */
        .filter-bar {
          background: #fff;
          border-radius: 16px;
          padding: 14px;
          margin-bottom: 16px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
          display: flex; flex-direction: column; gap: 8px;
        }
        .filter-bar input,
        .filter-bar select {
          font-size: 16px !important;
          min-height: 44px;
          border-radius: 10px;
          border: 1.5px solid #e2e8f0;
          padding: 8px 12px;
          width: 100%;
          background: #f8fafc;
        }
        .filter-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }

        /* ════════════════════════════════
           MOBILE — CARD VIEW
        ════════════════════════════════ */
        .mobile-view { display: block; }
        .desktop-view { display: none; }

        .emp-card {
          background: #fff; border-radius: 16px; padding: 16px;
          margin-bottom: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.06);
          border: 1px solid #f1f5f9;
        }
        .emp-card-top {
          display: flex; align-items: center; gap: 12px; margin-bottom: 12px;
        }
        .emp-avatar {
          width: 46px; height: 46px; border-radius: 14px; flex-shrink: 0;
          background: linear-gradient(135deg,#0ea5e9,#2563eb);
          color: white; display: flex; align-items: center;
          justify-content: center; font-weight: 800; font-size: 13px;
        }
        .emp-name { font-weight: 700; font-size: 14px; color: #0f172a; margin-bottom: 2px; }
        .emp-id   { font-size: 11px; color: #94a3b8; font-family: monospace; }

        .emp-badges { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 12px; }
        .emp-badge {
          font-size: 10px; font-weight: 700;
          padding: 3px 10px; border-radius: 999px; color: white;
        }

        .emp-info-grid {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 6px; margin-bottom: 12px;
        }
        .emp-info-item { background: #f8fafc; border-radius: 10px; padding: 8px 10px; }
        .emp-info-label {
          font-size: 9px; font-weight: 700; text-transform: uppercase;
          color: #94a3b8; margin-bottom: 2px;
        }
        .emp-info-value { font-size: 12px; font-weight: 600; color: #1e293b; }

        .emp-card-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .emp-card-actions button {
          min-height: 40px; border-radius: 10px;
          font-size: 13px; font-weight: 600; border: none; cursor: pointer;
        }

        /* FAB */
        .fab-btn {
          position: fixed; bottom: 24px; right: 20px;
          width: 56px; height: 56px; border-radius: 18px;
          background: linear-gradient(135deg,#0d6efd,#0284c7);
          color: white; border: none; font-size: 28px;
          box-shadow: 0 8px 24px rgba(13,110,253,0.4);
          z-index: 500; display: flex;
          align-items: center; justify-content: center; cursor: pointer;
        }

        /* ════════════════════════════════
           MODAL
        ════════════════════════════════ */
        .modal-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(15,23,42,0.6);
          backdrop-filter: blur(4px);
          z-index: 1000;
          display: flex; align-items: flex-end; /* mobile: dari bawah */
        }
        .modal-sheet {
          background: #fff;
          border-radius: 24px 24px 0 0;
          width: 100%; max-height: 92vh;
          overflow-y: auto; padding: 0 0 32px;
          animation: slideUp 0.3s ease;
        }
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
        .modal-handle {
          width: 40px; height: 4px; background: #e2e8f0;
          border-radius: 999px; margin: 12px auto 0;
        }
        .modal-head {
          display: flex; justify-content: space-between; align-items: center;
          padding: 16px 20px 12px;
          border-bottom: 1px solid #f1f5f9;
        }
        .modal-head h5 { font-weight: 800; margin: 0; font-size: 17px; color: #0f172a; }
        .modal-head small { color: #94a3b8; font-size: 12px; }
        .btn-close-modal {
          background: #f1f5f9; border: none; border-radius: 10px;
          width: 34px; height: 34px; font-size: 16px; cursor: pointer; color: #64748b;
        }
        .modal-body-inner { padding: 16px 20px 0; }

        .modal-field { margin-bottom: 12px; }
        .modal-field label {
          font-size: 11px; font-weight: 700; text-transform: uppercase;
          color: #64748b; margin-bottom: 5px; display: block;
        }
        .modal-field input,
        .modal-field select,
        .modal-field textarea {
          width: 100%; font-size: 16px !important; min-height: 46px;
          border-radius: 12px; border: 1.5px solid #e2e8f0;
          padding: 10px 14px; background: #f8fafc; color: #1e293b;
          outline: none; transition: border-color 0.2s; box-sizing: border-box;
        }
        .modal-field input:focus,
        .modal-field select:focus,
        .modal-field textarea:focus {
          border-color: #0d6efd; background: #fff;
        }
        .modal-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

        .btn-submit-modal {
          width: 100%; min-height: 52px; border-radius: 14px; border: none;
          background: linear-gradient(135deg,#0d6efd,#0284c7);
          color: white; font-size: 16px; font-weight: 700;
          margin-top: 12px; cursor: pointer; transition: opacity 0.2s;
        }
        .btn-submit-modal:disabled { opacity: 0.6; }

        /* Modal Pengaturan Plant & Grup */
        .settings-section { margin-bottom: 20px; }
        .settings-section h6 {
          font-weight: 800; font-size: 13px; margin: 0 0 10px;
          color: #0f172a; text-transform: uppercase; letter-spacing: 0.02em;
        }
        .settings-add-row { display: flex; gap: 8px; margin-bottom: 12px; }
        .settings-add-row input {
          flex: 1; font-size: 14px; min-height: 42px;
          border-radius: 10px; border: 1.5px solid #e2e8f0;
          padding: 8px 14px; background: #f8fafc; color: #1e293b;
          outline: none; transition: border-color 0.2s;
        }
        .settings-add-row input:focus { border-color: #0d6efd; background: #fff; }
        .settings-add-btn {
          min-height: 42px; padding: 0 16px; border-radius: 10px; border: none;
          background: #0d6efd; color: #fff; font-weight: 700; font-size: 13px;
          cursor: pointer; white-space: nowrap; transition: opacity 0.15s;
        }
        .settings-add-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .settings-chip-list { display: flex; flex-wrap: wrap; gap: 8px; }
        .settings-chip {
          display: flex; align-items: center; gap: 8px;
          background: #f0f9ff; border: 1px solid #bae6fd; color: #0369a1;
          border-radius: 999px; padding: 6px 8px 6px 14px;
          font-size: 13px; font-weight: 600;
        }
        .settings-chip-remove {
          display: flex; align-items: center; justify-content: center;
          width: 20px; height: 20px; border-radius: 50%; border: none;
          background: rgba(220,38,38,0.1); color: #dc2626; cursor: pointer;
          font-size: 12px; line-height: 1; flex-shrink: 0;
        }
        .settings-chip-remove:hover { background: rgba(220,38,38,0.2); }
        .settings-empty { font-size: 13px; color: #94a3b8; }

        /* ════════════════════════════════
           DESKTOP OVERRIDE (≥ 768px)
        ════════════════════════════════ */
        @media (min-width: 768px) {

          /* Header */
          .btn-tambah-desktop { display: flex; }
          .fab-btn { display: none; }

          /* Stat */
          .emp-stat-grid { grid-template-columns: repeat(4, 1fr); }
          .emp-stat-card .value { font-size: 36px; }

          /* Filter inline */
          .filter-bar { flex-direction: row; align-items: center; }
          .filter-bar input { flex: 2; }
          .filter-row { flex: 1.4; display: grid; grid-template-columns: 1fr 1fr 1fr; }

          /* View switch */
          .mobile-view  { display: none; }
          .desktop-view { display: block; }

          /* Desktop table */
          .emp-table {
            width: 100%; border-collapse: collapse;
            background: #fff; border-radius: 16px; overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,0.06);
          }
          .emp-table thead tr {
            background: #f8fafc;
            border-bottom: 2px solid #f1f5f9;
          }
          .emp-table th {
            padding: 12px 16px; font-size: 11px; font-weight: 700;
            text-transform: uppercase; color: #94a3b8; text-align: left;
          }
          .emp-table td {
            padding: 14px 16px; border-bottom: 1px solid #f8fafc;
            font-size: 13px; vertical-align: middle;
          }
          .emp-table tbody tr:hover { background: #fafbff; }
          .emp-table tbody tr:last-child td { border-bottom: none; }

          .tbl-avatar {
            width: 36px; height: 36px; border-radius: 10px;
            background: linear-gradient(135deg,#0ea5e9,#2563eb);
            color: white; display: inline-flex;
            align-items: center; justify-content: center;
            font-weight: 800; font-size: 11px; margin-right: 10px;
            vertical-align: middle;
          }
          .tbl-name { font-weight: 700; color: #0f172a; }
          .tbl-id   { font-size: 11px; color: #94a3b8; font-family: monospace; }

          .tbl-badge {
            font-size: 11px; font-weight: 700; padding: 3px 10px;
            border-radius: 999px; color: white; display: inline-block;
          }

          .tbl-btn {
            padding: 6px 14px; border-radius: 8px; font-size: 12px;
            font-weight: 600; border: none; cursor: pointer; margin: 0 3px;
            transition: opacity 0.15s;
          }
          .tbl-btn:hover { opacity: 0.85; }

          /* Modal — pop-up tengah di desktop */
          .modal-overlay { align-items: center; }
          .modal-sheet {
            border-radius: 20px;
            max-width: 580px; margin: 0 auto;
            max-height: 88vh; animation: fadeIn 0.25s ease;
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: scale(0.96); }
            to   { opacity: 1; transform: scale(1); }
          }
          .modal-handle { display: none; }
        }
      `}</style>

      {/* ── HEADER ── */}
      <div className="emp-header">
        <div>
          <h4 className="emp-title">Karyawan</h4>
          <p className="emp-subtitle">Kelola data karyawan</p>
        </div>
        <div className="emp-header-actions">
          <button
            className="btn-pengaturan"
            onClick={handleExport}
            disabled={exporting}
            title="Export Excel"
          >
            📊 <span className="btn-pengaturan-label">
              {exporting ? "Mengekspor..." : "Export Excel"}
            </span>
          </button>
          <button
            className="btn-pengaturan"
            onClick={() => setShowSettingsModal(true)}
            title="Pengaturan Plant, Grup & Bagian"
          >
            <Settings size={16} />
            <span className="btn-pengaturan-label">Pengaturan</span>
          </button>
          <button className="btn-tambah-desktop" onClick={openCreate}>
            ＋ Tambah Karyawan
          </button>
        </div>
      </div>

      {/* ── STAT CARDS ── */}
      <div className="emp-stat-grid">
        {[
          {
            label: "Total Karyawan",
            value: employees.length,
            bg: "linear-gradient(135deg,#0ea5e9,#2563eb)",
          },
          {
            label: "Plant Aktif",
            value: [...new Set(employees.map((e) => e.plant))].length,
            bg: "linear-gradient(135deg,#10b981,#059669)",
          },
          {
            label: "Team Leader",
            value: employees.filter((e) => e.default_status === "Team Leader")
              .length,
            bg: "linear-gradient(135deg,#6366f1,#4f46e5)",
          },
          {
            label: "Operator",
            value: employees.filter((e) => e.default_status === "Operator")
              .length,
            bg: "linear-gradient(135deg,#f59e0b,#d97706)",
          },
        ].map((c, i) => (
          <div key={i} className="emp-stat-card" style={{ background: c.bg }}>
            <div className="label">{c.label}</div>
            <div className="value">{c.value}</div>
          </div>
        ))}
      </div>

      {/* ── FILTER ── */}
      <div className="filter-bar">
        <input
          type="text"
          placeholder="🔍 Cari nama atau ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="filter-row">
          <select
            value={filterPlant}
            onChange={(e) => setFilterPlant(e.target.value)}
          >
            <option value="">Semua Plant</option>
            {plants.map((p) => (
              <option key={p} value={p}>
                Plant {p}
              </option>
            ))}
          </select>
          <select
            value={filterGroup}
            onChange={(e) => setFilterGroup(e.target.value)}
          >
            <option value="">Semua Grup</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                Grup {g}
              </option>
            ))}
          </select>
          <select
            value={filterBagian}
            onChange={(e) => setFilterBagian(e.target.value)}
          >
            <option value="">Semua Bagian</option>
            {bagians.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Result count */}
      <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>
        Menampilkan <b>{filtered.length}</b> dari <b>{employees.length}</b>{" "}
        karyawan
      </div>

      {loading ? (
        <div className="text-center py-5 text-muted">
          <div className="spinner-border mb-2" role="status" />
          <div>Loading...</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-5 text-muted">
          <div style={{ fontSize: 48 }}>👷</div>
          <div style={{ fontWeight: 600 }}>Tidak ada karyawan ditemukan</div>
        </div>
      ) : (
        <>
          {/* ════ MOBILE VIEW — CARD ════ */}
          <div className="mobile-view">
            {filtered.map((emp) => (
              <div className="emp-card" key={emp.id}>
                <div className="emp-card-top">
                  <div className="emp-avatar">
                    {emp.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="emp-name">{emp.name}</div>
                    <div className="emp-id">{emp.employee_id}</div>
                  </div>
                </div>

                <div className="emp-badges">
                  <span
                    className="emp-badge"
                    style={{ background: PLANT_COLORS[emp.plant] || "#6c757d" }}
                  >
                    Plant {emp.plant}
                  </span>
                  <span className="emp-badge" style={{ background: "#6366f1" }}>
                    Grup {emp.group}
                  </span>
                  <span
                    className="emp-badge"
                    style={{
                      background:
                        STATUS_COLORS[emp.default_status] || "#6c757d",
                    }}
                  >
                    {emp.default_status}
                  </span>
                  {emp.bagian && (
                    <span className="emp-badge" style={{ background: "#0d9488" }}>
                      {emp.bagian}
                    </span>
                  )}
                </div>

                <div className="emp-info-grid">
                  {[
                    { label: "Pekerjaan", value: emp.primary_job_type },
                    { label: "Department", value: emp.department },
                    { label: "Position", value: emp.position },
                    { label: "Telepon", value: emp.phone },
                  ].map((item, i) => (
                    <div className="emp-info-item" key={i}>
                      <div className="emp-info-label">{item.label}</div>
                      <div className="emp-info-value">{item.value || "-"}</div>
                    </div>
                  ))}
                </div>

                <div className="emp-card-actions">
                  <button
                    style={{ background: "#fef3c7", color: "#d97706" }}
                    onClick={() => openEdit(emp)}
                  >
                    ✏️ Edit
                  </button>
                  <button
                    style={{ background: "#fee2e2", color: "#dc2626" }}
                    onClick={() => handleDelete(emp)}
                  >
                    🗑️ Hapus
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* ════ DESKTOP VIEW — TABLE ════ */}
          <div className="desktop-view">
            <table className="emp-table">
              <thead>
                <tr>
                  <th>Karyawan</th>
                  <th>Plant</th>
                  <th>Grup</th>
                  <th>Bagian</th>
                  <th>Department</th>
                  <th>Status</th>
                  <th>Pekerjaan</th>
                  <th>Telepon</th>
                  <th style={{ textAlign: "center" }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp) => (
                  <tr key={emp.id}>
                    <td>
                      <span className="tbl-avatar">
                        {emp.name.substring(0, 2).toUpperCase()}
                      </span>
                      <span>
                        <div className="tbl-name">{emp.name}</div>
                        <div className="tbl-id">{emp.employee_id}</div>
                      </span>
                    </td>
                    <td>
                      <span
                        className="tbl-badge"
                        style={{
                          background: PLANT_COLORS[emp.plant] || "#6c757d",
                        }}
                      >
                        Plant {emp.plant}
                      </span>
                    </td>
                    <td>
                      <span
                        className="tbl-badge"
                        style={{ background: "#6366f1" }}
                      >
                        Grup {emp.group}
                      </span>
                    </td>
                    <td style={{ color: "#475569" }}>
                      {emp.bagian || "-"}
                    </td>
                    <td style={{ color: "#475569" }}>
                      {emp.department || "-"}
                    </td>
                    <td>
                      <span
                        className="tbl-badge"
                        style={{
                          background:
                            STATUS_COLORS[emp.default_status] || "#6c757d",
                        }}
                      >
                        {emp.default_status}
                      </span>
                    </td>
                    <td style={{ color: "#475569" }}>
                      {emp.primary_job_type || "-"}
                    </td>
                    <td style={{ color: "#475569" }}>{emp.phone || "-"}</td>
                    <td style={{ textAlign: "center" }}>
                      <button
                        className="tbl-btn"
                        style={{ background: "#fef3c7", color: "#d97706" }}
                        onClick={() => openEdit(emp)}
                      >
                        ✏️ Edit
                      </button>
                      <button
                        className="tbl-btn"
                        style={{ background: "#fee2e2", color: "#dc2626" }}
                        onClick={() => handleDelete(emp)}
                      >
                        🗑️ Hapus
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── FAB — mobile only ── */}
      <button className="fab-btn" onClick={openCreate}>
        ＋
      </button>

      {/* ── MODAL ── */}
      {showModal && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowModal(false);
          }}
        >
          <div className="modal-sheet">
            <div className="modal-handle" />
            <div className="modal-head">
              <div>
                <h5>{editingId ? "Edit Karyawan" : "Tambah Karyawan"}</h5>
                <small>
                  {editingId
                    ? "Perbarui data karyawan"
                    : "Lengkapi data karyawan baru"}
                </small>
              </div>
              <button
                className="btn-close-modal"
                onClick={() => setShowModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body-inner">
              <form onSubmit={handleSubmit}>
                <FormFields />
                <button
                  type="submit"
                  className="btn-submit-modal"
                  disabled={submitting}
                >
                  {submitting
                    ? "⏳ Menyimpan..."
                    : editingId
                      ? "💾 Update Data"
                      : "➕ Tambah Karyawan"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
      {/* ── MODAL PENGATURAN PLANT & GRUP ── */}
      {showSettingsModal && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowSettingsModal(false);
          }}
        >
          <div className="modal-sheet">
            <div className="modal-handle" />
            <div className="modal-head">
              <div>
                <h5>Pengaturan Plant, Grup & Bagian</h5>
                <small>Tambah atau hapus pilihan Plant, Grup, dan Bagian</small>
              </div>
              <button
                className="btn-close-modal"
                onClick={() => setShowSettingsModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body-inner" style={{ paddingBottom: 20 }}>
              {/* Plant */}
              <div className="settings-section">
                <h6>Plant</h6>
                <div className="settings-add-row">
                  <input
                    placeholder="Contoh: B"
                    value={newPlant}
                    onChange={(e) => setNewPlant(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddOption("plant");
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="settings-add-btn"
                    disabled={savingOptionType === "plant"}
                    onClick={() => handleAddOption("plant")}
                  >
                    {savingOptionType === "plant" ? "⏳" : "+ Tambah"}
                  </button>
                </div>
                {rawOptions.plant.length === 0 ? (
                  <div className="settings-empty">Belum ada data.</div>
                ) : (
                  <div className="settings-chip-list">
                    {rawOptions.plant.map((item) => (
                      <div className="settings-chip" key={item.id}>
                        <span>{item.value}</span>
                        <button
                          type="button"
                          className="settings-chip-remove"
                          title="Hapus"
                          onClick={() => handleDeleteOption("plant", item)}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Grup */}
              <div className="settings-section">
                <h6>Grup</h6>
                <div className="settings-add-row">
                  <input
                    placeholder="Contoh: A"
                    value={newGroup}
                    onChange={(e) => setNewGroup(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddOption("group");
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="settings-add-btn"
                    disabled={savingOptionType === "group"}
                    onClick={() => handleAddOption("group")}
                  >
                    {savingOptionType === "group" ? "⏳" : "+ Tambah"}
                  </button>
                </div>
                {rawOptions.group.length === 0 ? (
                  <div className="settings-empty">Belum ada data.</div>
                ) : (
                  <div className="settings-chip-list">
                    {rawOptions.group.map((item) => (
                      <div className="settings-chip" key={item.id}>
                        <span>{item.value}</span>
                        <button
                          type="button"
                          className="settings-chip-remove"
                          title="Hapus"
                          onClick={() => handleDeleteOption("group", item)}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Bagian */}
              <div className="settings-section">
                <h6>Bagian</h6>
                <small style={{ color: "#94a3b8" }}>
                  Contoh: OK, OE, Preparation (khusus Plant I). Boleh dikosongin
                  di form karyawan kalau plant-nya gak butuh bagian.
                </small>
                <div className="settings-add-row" style={{ marginTop: 8 }}>
                  <input
                    placeholder="Contoh: OK"
                    value={newBagian}
                    onChange={(e) => setNewBagian(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddOption("bagian");
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="settings-add-btn"
                    disabled={savingOptionType === "bagian"}
                    onClick={() => handleAddOption("bagian")}
                  >
                    {savingOptionType === "bagian" ? "⏳" : "+ Tambah"}
                  </button>
                </div>
                {rawOptions.bagian.length === 0 ? (
                  <div className="settings-empty">Belum ada data.</div>
                ) : (
                  <div className="settings-chip-list">
                    {rawOptions.bagian.map((item) => (
                      <div className="settings-chip" key={item.id}>
                        <span>{item.value}</span>
                        <button
                          type="button"
                          className="settings-chip-remove"
                          title="Hapus"
                          onClick={() => handleDeleteOption("bagian", item)}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
