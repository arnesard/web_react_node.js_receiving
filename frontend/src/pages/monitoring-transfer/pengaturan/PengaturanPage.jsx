// src/pages/Transfer/Pengaturan.jsx
// Halaman baru (belum ada di versi Laravel) — CRUD master data buat modul
// Transfer Rak: Supir, Kendaraan, Lokasi. Dipakai biar dropdown di halaman
// Monitoring gak typo-typo dan datanya terkontrol dari satu tempat.
import { useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import Swal from "sweetalert2";
import {
  Repeat,
  LayoutDashboard,
  FileText,
  Home,
  Settings,
} from "lucide-react";
import api from "../../../api/axiosInstance";

function TransferSubNav() {
  const location = useLocation();
  const items = [
    { to: "/transfer", label: "Monitoring", icon: <Repeat size={15} /> },
    {
      to: "/transfer/dashboard",
      label: "Dashboard",
      icon: <LayoutDashboard size={15} />,
    },
    { to: "/transfer/laporan", label: "Laporan", icon: <FileText size={15} /> },
    {
      to: "/transfer/pengaturan",
      label: "Pengaturan",
      icon: <Settings size={15} />,
    },
  ];
  return (
    <div className="tr-subnav">
      <Link to="/" className="tr-home-btn" title="Kembali ke Pilih Menu">
        <Home size={17} />
      </Link>
      {items.map((it) => (
        <Link
          key={it.to}
          to={it.to}
          className={
            "tr-subnav-link" + (location.pathname === it.to ? " active" : "")
          }
          title={it.label}
        >
          {it.icon}
          <span>{it.label}</span>
        </Link>
      ))}
    </div>
  );
}

const toastSuccess = (message) =>
  Swal.fire({
    icon: "success",
    title: message,
    timer: 1400,
    showConfirmButton: false,
  });

const showError = (err) =>
  Swal.fire("Gagal", err.response?.data?.message || err.message, "error");

const DRIVER_FIELDS = [
  { key: "employee_id", label: "ID Karyawan", placeholder: "Contoh: 100234" },
  {
    key: "nama_karyawan",
    label: "Nama Supir",
    placeholder: "Nama lengkap supir",
  },
];
const VEHICLE_FIELDS = [
  {
    key: "nama_kendaraan",
    label: "Nama Kendaraan",
    placeholder: "Contoh: L 1234 CD / Forklift 2",
  },
];
const LOKASI_FIELDS = [
  {
    key: "nama_lokasi",
    label: "Nama Lokasi",
    placeholder: "Contoh: Gudang BPW 1",
  },
];

const TABS = [
  {
    key: "supir",
    label: "🚚 Supir",
    endpoint: "/transfer-rak/master/drivers",
    fields: DRIVER_FIELDS,
    itemLabel: "Supir",
  },
  {
    key: "kendaraan",
    label: "🚙 Kendaraan",
    endpoint: "/transfer-rak/master/vehicles",
    fields: VEHICLE_FIELDS,
    itemLabel: "Kendaraan",
  },
  {
    key: "lokasi",
    label: "📍 Lokasi",
    endpoint: "/transfer-rak/master/lokasi",
    fields: LOKASI_FIELDS,
    itemLabel: "Lokasi",
  },
];

export default function TransferPengaturan() {
  const [tab, setTab] = useState("supir");
  const activeTab = TABS.find((t) => t.key === tab);

  return (
    <div className="tr-page">
      <style>{trStyles}</style>
      <TransferSubNav />

      <div className="tr-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={"tr-tab-btn" + (tab === t.key ? " active" : "")}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="tr-card">
        {/* key= biar state form/list ke-reset bersih tiap ganti tab */}
        <MasterCrudSection key={activeTab.key} {...activeTab} />
      </div>
    </div>
  );
}

function MasterCrudSection({ endpoint, fields, itemLabel }) {
  const emptyForm = () => Object.fromEntries(fields.map((f) => [f.key, ""]));

  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  const load = useCallback(() => {
    setLoading(true);
    api
      .get(endpoint)
      .then((res) => setList(res.data.data || []))
      .catch((err) => showError(err))
      .finally(() => setLoading(false));
  }, [endpoint]);

  useEffect(() => {
    load();
  }, [load]);

  const displayText = (item) =>
    fields
      .map((f) => item[f.key])
      .filter(Boolean)
      .join(" — ");

  const handleAdd = async () => {
    for (const f of fields) {
      if (!form[f.key]?.trim()) {
        return Swal.fire("Eits", `${f.label} wajib diisi.`, "warning");
      }
    }
    setSaving(true);
    try {
      await api.post(endpoint, form);
      setForm(emptyForm());
      load();
      toastSuccess(`${itemLabel} berhasil ditambahkan`);
    } catch (err) {
      showError(err);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditForm(
      Object.fromEntries(fields.map((f) => [f.key, item[f.key] || ""])),
    );
  };

  const handleSaveEdit = async (id) => {
    for (const f of fields) {
      if (!editForm[f.key]?.trim()) {
        return Swal.fire("Eits", `${f.label} wajib diisi.`, "warning");
      }
    }
    try {
      await api.put(`${endpoint}/${id}`, editForm);
      setEditingId(null);
      load();
      toastSuccess(`${itemLabel} berhasil diperbarui`);
    } catch (err) {
      showError(err);
    }
  };

  const handleDelete = async (item) => {
    const result = await Swal.fire({
      title: `Hapus ${itemLabel.toLowerCase()} ini?`,
      text: displayText(item),
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Ya, hapus",
      cancelButtonText: "Batal",
      confirmButtonColor: "#dc3545",
    });
    if (!result.isConfirmed) return;
    try {
      await api.delete(`${endpoint}/${item.id}`);
      load();
    } catch (err) {
      showError(err);
    }
  };

  return (
    <div>
      <div className="tr-master-add-form">
        {fields.map((f) => (
          <input
            key={f.key}
            className="tr-input"
            placeholder={f.placeholder}
            value={form[f.key]}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, [f.key]: e.target.value }))
            }
          />
        ))}
        <button
          className="tr-btn-primary tr-master-add-btn"
          disabled={saving}
          onClick={handleAdd}
        >
          {saving ? "Menyimpan..." : `+ Tambah ${itemLabel}`}
        </button>
      </div>

      <div className="tr-master-list">
        {loading && <div className="tr-empty">Memuat...</div>}
        {!loading && list.length === 0 && (
          <div className="tr-empty">
            Belum ada data {itemLabel.toLowerCase()}.
          </div>
        )}
        {list.map((item) => (
          <div key={item.id} className="tr-master-row">
            {editingId === item.id ? (
              <>
                <div className="tr-master-edit-fields">
                  {fields.map((f) => (
                    <input
                      key={f.key}
                      className="tr-input"
                      placeholder={f.placeholder}
                      value={editForm[f.key]}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          [f.key]: e.target.value,
                        }))
                      }
                    />
                  ))}
                </div>
                <div className="tr-master-row-actions">
                  <button
                    className="tr-btn-link"
                    onClick={() => handleSaveEdit(item.id)}
                  >
                    Simpan
                  </button>
                  <button
                    className="tr-btn-link"
                    onClick={() => setEditingId(null)}
                  >
                    Batal
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="tr-master-row-text">{displayText(item)}</div>
                <div className="tr-master-row-actions">
                  <button
                    className="tr-btn-link"
                    onClick={() => startEdit(item)}
                  >
                    Edit
                  </button>
                  <button
                    className="tr-btn-link tr-btn-link-danger"
                    onClick={() => handleDelete(item)}
                  >
                    Hapus
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const trStyles = `
  .tr-page { max-width: 720px; margin: 0 auto; padding: 20px 16px 40px; color: #1e293b; }
  .tr-subnav { display: flex; gap: 6px; margin-bottom: 16px;
    background: #ffffff; box-shadow: 0 1px 3px rgba(15,23,42,0.06);
    padding: 6px; border-radius: 14px; border: 1px solid #e2e8f0; }
  .tr-home-btn { display: flex; align-items: center; justify-content: center;
    width: 38px; flex-shrink: 0; border-radius: 10px; color: #475569;
    text-decoration: none; transition: 0.2s; }
  .tr-home-btn:hover { background: #e2e8f0; color: #1e293b; }
  .tr-subnav-link { flex: 1; display: flex; align-items: center; justify-content: center;
    gap: 6px; padding: 9px; border-radius: 10px; text-decoration: none;
    color: #475569; font-weight: 600; font-size: 13px; transition: 0.2s; }
  .tr-subnav-link:hover { background: #f1f5f9; }
  .tr-subnav-link.active { background: #3b82f6; color: #fff; }
  /* Mobile: navbar sub-menu jangan meluber — sembunyiin label teks,
     sisain icon doang biar 4 menu + tombol home tetep muat sebaris */
  @media (max-width: 560px) {
    .tr-subnav { gap: 4px; padding: 5px; }
    .tr-home-btn { width: 34px; }
    .tr-subnav-link { flex-direction: column; gap: 2px; padding: 7px 2px; font-size: 9px; }
    .tr-subnav-link span { display: none; }
  }
  .tr-card { background: #ffffff; box-shadow: 0 1px 3px rgba(15,23,42,0.06);
    border-radius: 18px; border: 1px solid #e2e8f0;
    padding: 20px; margin-bottom: 16px; }
  .tr-tabs { display: flex; gap: 8px; margin-bottom: 16px; }
  .tr-tab-btn { flex: 1; display: flex; align-items: center; justify-content: center;
    gap: 8px; padding: 12px; border-radius: 14px; border: 1.5px solid #cbd5e1;
    background: #f8fafc; color: #475569; font-weight: 700; cursor: pointer; }
  .tr-tab-btn.active { background: #3b82f6; border-color: #3b82f6; color: #fff; }
  .tr-input { width: 100%; padding: 10px 12px; border-radius: 10px;
    border: 1.5px solid #cbd5e1; background: #f1f5f9;
    color: #1e293b; font-size: 14px; outline: none; }
  .tr-input::placeholder { color: #64748b; }
  .tr-input:focus { border-color: #3b82f6; background: #e2e8f0; }
  .tr-master-add-form { display: flex; flex-wrap: wrap; gap: 10px; align-items: stretch;
    margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px dashed #cbd5e1; }
  .tr-master-add-form .tr-input { flex: 1; min-width: 160px; }
  .tr-master-add-btn { width: auto; padding: 10px 18px; flex-shrink: 0; }
  .tr-master-list { display: flex; flex-direction: column; gap: 8px; }
 .tr-master-row { display: flex; flex-direction: column; align-items: flex-start;
  gap: 8px; background: #f8fafc; border: 1px solid #e2e8f0;
  border-radius: 10px; padding: 10px 14px; }
  .tr-master-row-text { font-size: 13.5px; color: #1e293b; font-weight: 600; }
  .tr-master-row-actions { display: flex; gap: 14px; flex-shrink: 0; }
  .tr-master-edit-fields { display: flex; flex-wrap: wrap; gap: 8px; flex: 1; }
  .tr-master-edit-fields .tr-input { flex: 1; min-width: 140px; }
  .tr-btn-primary { padding: 12px; border-radius: 12px; border: none;
    background: linear-gradient(135deg,#3b82f6,#2563eb); color: #fff; font-weight: 700;
    font-size: 14px; cursor: pointer; }
  .tr-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
  .tr-btn-link { background: none; border: none; color: #2563eb; font-weight: 700;
    font-size: 12.5px; cursor: pointer; padding: 0; }
  .tr-btn-link-danger { color: #b91c1c; }
  .tr-empty { text-align: center; color: #64748b; font-size: 13px; padding: 20px 0; }
`;
