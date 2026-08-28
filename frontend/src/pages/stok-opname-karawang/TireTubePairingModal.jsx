// src/pages/stok-opname-karawang/TireTubePairingModal.jsx
// Modal "Kelola Master Tire-Tube" -- CRUD + import Excel master pasangan
// Tire (tubetype) <-> Tube. Dipanggil dari TransferPlanPage lewat tombol
// "Kelola Master Tire-Tube". Backend: KarawangTireTubePairingController
// (GET/POST/PUT/DELETE /stok-opname-karawang/tire-tube-pairing[...]).
import { useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import { Link2, X, Plus, Pencil, Trash2, Upload, Search } from "lucide-react";
import api from "../../api/axiosInstance";

const emptyForm = {
  tire_code: "",
  tire_description: "",
  tube_code: "",
  tube_description: "",
  customer: "",
};

const fmt = (n) => Number(n || 0).toLocaleString("id-ID");

export default function TireTubePairingModal({ onClose, onChanged }) {
  const [pairs, setPairs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  // null = form tertutup, "new" = lagi nambah baru, angka = lagi edit id itu
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get("/stok-opname-karawang/tire-tube-pairing");
      setPairs(res.data?.data || []);
    } catch (err) {
      console.error("Gagal mengambil master pasangan Tire-Tube:", err);
      Swal.fire(
        "Gagal Memuat Data",
        err.response?.data?.message || "Gagal mengambil data master Tire-Tube.",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredPairs = useMemo(() => {
    const q = search.trim().toUpperCase();
    if (!q) return pairs;
    return pairs.filter((p) =>
      [
        p.tire_code,
        p.tire_description,
        p.tube_code,
        p.tube_description,
        p.customer,
      ]
        .filter(Boolean)
        .some((v) => String(v).toUpperCase().includes(q)),
    );
  }, [pairs, search]);

  const openAddForm = () => {
    setForm(emptyForm);
    setEditingId("new");
  };

  const openEditForm = (row) => {
    setForm({
      tire_code: row.tire_code || "",
      tire_description: row.tire_description || "",
      tube_code: row.tube_code || "",
      tube_description: row.tube_description || "",
      customer: row.customer || "",
    });
    setEditingId(row.id);
  };

  const closeForm = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    if (!form.tire_code.trim() || !form.tube_code.trim()) {
      Swal.fire(
        "Belum Lengkap",
        "Kode Tire dan Kode Tube wajib diisi.",
        "warning",
      );
      return;
    }

    setSaving(true);
    try {
      if (editingId === "new") {
        await api.post("/stok-opname-karawang/tire-tube-pairing", form);
      } else {
        await api.put(
          `/stok-opname-karawang/tire-tube-pairing/${editingId}`,
          form,
        );
      }

      closeForm();
      await load();
      onChanged?.();
    } catch (err) {
      console.error("Gagal menyimpan pasangan Tire-Tube:", err);
      Swal.fire(
        "Gagal Menyimpan",
        err.response?.data?.message || "Gagal menyimpan pasangan Tire-Tube.",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row) => {
    const result = await Swal.fire({
      title: "Hapus Pasangan Ini?",
      html: `<b>${row.tire_code}</b> &harr; <b>${row.tube_code}</b> akan dihapus dari master.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Ya, Hapus",
      cancelButtonText: "Batal",
      confirmButtonColor: "#dc2626",
    });
    if (!result.isConfirmed) return;

    try {
      await api.delete(`/stok-opname-karawang/tire-tube-pairing/${row.id}`);
      await load();
      onChanged?.();
    } catch (err) {
      console.error("Gagal menghapus pasangan Tire-Tube:", err);
      Swal.fire(
        "Gagal Menghapus",
        err.response?.data?.message || "Gagal menghapus pasangan Tire-Tube.",
        "error",
      );
    }
  };

  const handlePickFile = () => fileInputRef.current?.click();

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // biar bisa pilih file yang sama lagi kalau perlu
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    setUploading(true);
    try {
      const res = await api.post(
        "/stok-opname-karawang/tire-tube-pairing/upload",
        formData,
      );
      await Swal.fire({
        icon: "success",
        title: "Import Berhasil",
        text:
          res.data?.data?.message || "Data master Tire-Tube berhasil diimport.",
        timer: 4000,
        showConfirmButton: false,
      });
      await load();
      onChanged?.();
    } catch (err) {
      console.error("Gagal import Excel Tire-Tube:", err);
      Swal.fire(
        "Import Gagal",
        err.response?.data?.message || "Gagal memproses file Excel.",
        "error",
      );
    } finally {
      setUploading(false);
    }
  };

  const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    padding: "6px 8px",
    border: "1px solid #cbd5e1",
    borderRadius: 6,
    fontSize: 12,
    outline: "none",
  };

  const thStyle = {
    textAlign: "left",
    padding: "8px 10px",
    fontSize: 10.5,
    fontWeight: 700,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    borderBottom: "1px solid #e2e8f0",
    whiteSpace: "nowrap",
  };

  const tdStyle = {
    padding: "8px 10px",
    fontSize: 12.5,
    color: "#334155",
    borderBottom: "1px solid #f1f5f9",
    verticalAlign: "top",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(3px)",
        WebkitBackdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 16,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          width: "100%",
          maxWidth: 900,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 70px rgba(0,0,0,0.25)",
          overflow: "hidden",
        }}
      >
        {/* ===== HEADER ===== */}
        <div
          style={{
            padding: "18px 22px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div>
            <h2
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 18,
                fontWeight: 800,
                color: "#0f172a",
                margin: 0,
              }}
            >
              <Link2 size={18} />
              Kelola Master Tire-Tube
            </h2>
            <p style={{ fontSize: 12, color: "#64748b", margin: "4px 0 0" }}>
              Pasangan Tire (tubetype) &harr; Tube -- dipakai buat auto-nambahin
              tube pasangan tiap kali tire masuk trip.
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={handlePickFile}
              disabled={uploading}
              style={{
                height: 34,
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "0 12px",
                border: "1px solid #bae6fd",
                background: "#f0f9ff",
                color: "#0369a1",
                borderRadius: 8,
                cursor: uploading ? "not-allowed" : "pointer",
                fontSize: 12.5,
                fontWeight: 700,
                opacity: uploading ? 0.6 : 1,
              }}
            >
              <Upload size={14} />
              {uploading ? "Meng-upload..." : "Import Excel"}
            </button>

            <button
              type="button"
              onClick={() => onClose?.()}
              title="Tutup"
              style={{
                height: 34,
                width: 34,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid #cbd5e1",
                background: "#fff",
                color: "#334155",
                borderRadius: 8,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ===== TOOLBAR: search + tambah ===== */}
        <div
          style={{
            padding: "12px 22px",
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexShrink: 0,
            borderBottom: "1px solid #f1f5f9",
          }}
        >
          <div style={{ position: "relative", flex: 1, maxWidth: 320 }}>
            <Search
              size={14}
              style={{
                position: "absolute",
                left: 9,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#94a3b8",
              }}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari kode tire / tube / customer..."
              style={{ ...inputStyle, paddingLeft: 30 }}
            />
          </div>

          <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>
            {filteredPairs.length} dari {pairs.length} pasangan
          </span>

          <div style={{ flex: 1 }} />

          <button
            type="button"
            onClick={openAddForm}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 12px",
              border: "1px solid #bbf7d0",
              background: "#f0fdf4",
              color: "#15803d",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 12.5,
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            <Plus size={14} />
            Tambah Pasangan
          </button>
        </div>

        {/* ===== FORM tambah/edit ===== */}
        {editingId !== null && (
          <div
            style={{
              padding: "14px 22px",
              background: "#f8fafc",
              borderBottom: "1px solid #e2e8f0",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: 10,
                marginBottom: 10,
              }}
            >
              <div>
                <label
                  style={{ fontSize: 10.5, fontWeight: 700, color: "#64748b" }}
                >
                  Kode Tire *
                </label>
                <input
                  type="text"
                  value={form.tire_code}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, tire_code: e.target.value }))
                  }
                  style={inputStyle}
                  placeholder="mis. IAI2717-0"
                />
              </div>
              <div>
                <label
                  style={{ fontSize: 10.5, fontWeight: 700, color: "#64748b" }}
                >
                  Deskripsi Tire
                </label>
                <input
                  type="text"
                  value={form.tire_description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, tire_description: e.target.value }))
                  }
                  style={inputStyle}
                />
              </div>
              <div>
                <label
                  style={{ fontSize: 10.5, fontWeight: 700, color: "#64748b" }}
                >
                  Kode Tube *
                </label>
                <input
                  type="text"
                  value={form.tube_code}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, tube_code: e.target.value }))
                  }
                  style={inputStyle}
                />
              </div>
              <div>
                <label
                  style={{ fontSize: 10.5, fontWeight: 700, color: "#64748b" }}
                >
                  Deskripsi Tube
                </label>
                <input
                  type="text"
                  value={form.tube_description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, tube_description: e.target.value }))
                  }
                  style={inputStyle}
                />
              </div>
              <div>
                <label
                  style={{ fontSize: 10.5, fontWeight: 700, color: "#64748b" }}
                >
                  Customer
                </label>
                <input
                  type="text"
                  value={form.customer}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, customer: e.target.value }))
                  }
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: "7px 14px",
                  border: "none",
                  background: "#2563eb",
                  color: "#fff",
                  borderRadius: 7,
                  cursor: saving ? "not-allowed" : "pointer",
                  fontSize: 12.5,
                  fontWeight: 700,
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? "Menyimpan..." : "Simpan"}
              </button>
              <button
                type="button"
                onClick={closeForm}
                disabled={saving}
                style={{
                  padding: "7px 14px",
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  color: "#334155",
                  borderRadius: 7,
                  cursor: "pointer",
                  fontSize: 12.5,
                  fontWeight: 700,
                }}
              >
                Batal
              </button>
            </div>
          </div>
        )}

        {/* ===== TABEL ===== */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {loading && (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                color: "#94a3b8",
                fontSize: 13,
              }}
            >
              Memuat data...
            </div>
          )}

          {!loading && filteredPairs.length === 0 && (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                color: "#94a3b8",
                fontSize: 13,
              }}
            >
              {pairs.length === 0
                ? "Belum ada data master Tire-Tube. Tambah manual atau import dari Excel."
                : "Gak ada pasangan yang cocok sama pencarian."}
            </div>
          )}

          {!loading && filteredPairs.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Kode Tire</th>
                  <th style={thStyle}>Deskripsi Tire</th>
                  <th style={thStyle}>Kode Tube</th>
                  <th style={thStyle}>Deskripsi Tube</th>
                  <th style={thStyle}>Customer</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>
                    Vol Tube (m&sup3;)
                  </th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredPairs.map((row) => (
                  <tr key={row.id}>
                    <td
                      style={{ ...tdStyle, fontWeight: 700, color: "#1d4ed8" }}
                    >
                      {row.tire_code}
                    </td>
                    <td style={tdStyle}>{row.tire_description || "-"}</td>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>
                      {row.tube_code}
                    </td>
                    <td style={tdStyle}>{row.tube_description || "-"}</td>
                    <td style={tdStyle}>{row.customer || "-"}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      {fmt(row.tube_volume)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                          justifyContent: "center",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => openEditForm(row)}
                          title="Edit"
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "#2563eb",
                            cursor: "pointer",
                            padding: 4,
                            display: "flex",
                          }}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(row)}
                          title="Hapus"
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "#dc2626",
                            cursor: "pointer",
                            padding: 4,
                            display: "flex",
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
