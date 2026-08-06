// src/pages/Settings/Index.jsx
import { useEffect, useState } from "react";
import api from "../../../api/axiosInstance";
import Swal from "sweetalert2";

// Konfigurasi tiap seksi pengaturan — biar gampang nambah tipe baru
// nanti kalau perlu, tinggal tambah di array ini.
const SECTIONS = [
  {
    type: "plant",
    title: "Plant",
    desc: "Daftar plant yang muncul di filter form Input Hasil Kerja",
    placeholder: "Contoh: B",
  },
  {
    type: "group",
    title: "Grup",
    desc: "Daftar grup yang muncul di filter form Input Hasil Kerja",
    placeholder: "Contoh: A",
  },
  {
    type: "job",
    title: "Pekerjaan Hari Ini",
    desc: "Daftar pilihan pekerjaan di form Input Hasil Kerja",
    placeholder: "Contoh: Scan Tire",
  },
];

export default function Settings() {
  const [options, setOptions] = useState({ job: [], plant: [], group: [] });
  const [loading, setLoading] = useState(true);
  const [inputs, setInputs] = useState({ job: "", plant: "", group: "" });
  const [savingType, setSavingType] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.get("/production-options");
      setOptions(res.data.data);
    } catch (err) {
      Swal.fire("Error", "Gagal load data: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (type) => {
    const value = inputs[type].trim();
    if (!value) return;

    setSavingType(type);
    try {
      await api.post("/production-options", { type, value });
      setInputs((prev) => ({ ...prev, [type]: "" }));
      await loadData();
    } catch (err) {
      Swal.fire(
        "Gagal",
        err.response?.data?.message || err.message,
        "error",
      );
    } finally {
      setSavingType(null);
    }
  };

  const handleDelete = async (type, item) => {
    const result = await Swal.fire({
      title: "Hapus opsi ini?",
      html: `Yakin hapus <b>${item.value}</b>? Data lama yang sudah tersimpan tidak akan terhapus, ini cuma hilang dari pilihan form.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Hapus",
      cancelButtonText: "Batal",
      confirmButtonColor: "#dc3545",
    });
    if (!result.isConfirmed) return;

    try {
      await api.delete(`/production-options/${item.id}`);
      loadData();
    } catch (err) {
      Swal.fire("Error", err.response?.data?.message || err.message, "error");
    }
  };

  return (
    <div>
      <style>{`
        .settings-card {
          background: #fff; border-radius: 16px; padding: 20px;
          margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }
        .settings-card h5 { font-weight: 800; font-size: 16px; margin: 0 0 4px; color: #0f172a; }
        .settings-card p  { font-size: 12px; color: #94a3b8; margin: 0 0 16px; }

        .settings-add-row { display: flex; gap: 8px; margin-bottom: 16px; }
        .settings-input {
          flex: 1; font-size: 14px; min-height: 42px;
          border-radius: 10px; border: 1.5px solid #e2e8f0;
          padding: 8px 14px; background: #f8fafc; color: #1e293b;
          outline: none; transition: border-color 0.2s;
        }
        .settings-input:focus { border-color: #0d6efd; background: #fff; }
        .settings-add-btn {
          min-height: 42px; padding: 0 18px; border-radius: 10px; border: none;
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
      `}</style>

      <div style={{ marginBottom: 16 }}>
        <h4 style={{ fontWeight: 800, margin: 0, color: "#0f172a" }}>
          Pengaturan
        </h4>
        <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>
          Kelola pilihan Plant, Grup, dan Pekerjaan di form Input Hasil Kerja
        </p>
      </div>

      {loading ? (
        <div className="settings-card text-center py-4 text-muted">
          <div className="spinner-border spinner-border-sm mb-2" />
          <div style={{ fontSize: 13 }}>Loading...</div>
        </div>
      ) : (
        SECTIONS.map((section) => {
          const items = options[section.type] || [];
          return (
            <div className="settings-card" key={section.type}>
              <h5>{section.title}</h5>
              <p>{section.desc}</p>

              <div className="settings-add-row">
                <input
                  className="settings-input"
                  placeholder={section.placeholder}
                  value={inputs[section.type]}
                  onChange={(e) =>
                    setInputs((prev) => ({
                      ...prev,
                      [section.type]: e.target.value,
                    }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAdd(section.type);
                    }
                  }}
                />
                <button
                  type="button"
                  className="settings-add-btn"
                  disabled={savingType === section.type}
                  onClick={() => handleAdd(section.type)}
                >
                  {savingType === section.type ? "⏳" : "+ Tambah"}
                </button>
              </div>

              {items.length === 0 ? (
                <div className="settings-empty">Belum ada data.</div>
              ) : (
                <div className="settings-chip-list">
                  {items.map((item) => (
                    <div className="settings-chip" key={item.id}>
                      <span>{item.value}</span>
                      <button
                        type="button"
                        className="settings-chip-remove"
                        title="Hapus"
                        onClick={() => handleDelete(section.type, item)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
