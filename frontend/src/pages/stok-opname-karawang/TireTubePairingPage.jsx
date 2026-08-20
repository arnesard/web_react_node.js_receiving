// src/pages/stok-opname-karawang/TireTubePairingPage.jsx
// Admin master pasangan Tire (tubetype) <-> Tube. Dipakai fitur Transfer
// Plan: pas tire masuk trip, tube pasangannya otomatis ikut ditambahin
// (qty 1:1) berdasarkan data di halaman ini.
import { useState, useEffect, useMemo } from "react";
import Swal from "sweetalert2";
import {
  Loader2,
  Upload,
  Plus,
  Trash2,
  Pencil,
  Search,
  Link2,
} from "lucide-react";
import api from "../../api/axiosInstance";
import KarawangSubNav from "./KarawangSubNav";
import { karawangStyles } from "./karawangStyles";

const emptyForm = {
  id: null,
  tire_code: "",
  tire_description: "",
  tube_code: "",
  tube_description: "",
  customer: "",
};

export default function TireTubePairingPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const [showFormModal, setShowFormModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const loadRows = async () => {
    setLoading(true);
    try {
      const res = await api.get("/stok-opname-karawang/tire-tube-pairing");
      setRows(res.data?.data || []);
    } catch (err) {
      Swal.fire(
        "Gagal Memuat Data",
        err.response?.data?.message || err.message,
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, []);

  const filteredRows = useMemo(() => {
    const q = search.trim().toUpperCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.tire_code?.toUpperCase().includes(q) ||
        r.tube_code?.toUpperCase().includes(q) ||
        r.tire_description?.toUpperCase().includes(q) ||
        r.tube_description?.toUpperCase().includes(q) ||
        r.customer?.toUpperCase().includes(q),
    );
  }, [rows, search]);

  const handleUpload = async () => {
    if (!uploadFile) {
      Swal.fire("File Belum Dipilih", "Pilih file Excel dulu.", "warning");
      return;
    }
    if (uploading) return;

    const formData = new FormData();
    formData.append("file", uploadFile);

    setUploading(true);
    try {
      const res = await api.post(
        "/stok-opname-karawang/tire-tube-pairing/upload",
        formData,
      );

      await Swal.fire({
        icon: "success",
        title: "Import Berhasil",
        text: res.data?.data?.message || "Data pasangan Tire-Tube berhasil diimport.",
        timer: 5000,
        showConfirmButton: false,
      });

      setUploadFile(null);
      await loadRows();
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Import Gagal",
        text: err.response?.data?.message || err.message,
      });
    } finally {
      setUploading(false);
    }
  };

  const openAddForm = () => {
    setForm(emptyForm);
    setShowFormModal(true);
  };

  const openEditForm = (row) => {
    setForm({
      id: row.id,
      tire_code: row.tire_code || "",
      tire_description: row.tire_description || "",
      tube_code: row.tube_code || "",
      tube_description: row.tube_description || "",
      customer: row.customer || "",
    });
    setShowFormModal(true);
  };

  const handleSaveForm = async () => {
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
      if (form.id) {
        await api.put(
          `/stok-opname-karawang/tire-tube-pairing/${form.id}`,
          form,
        );
      } else {
        await api.post("/stok-opname-karawang/tire-tube-pairing", form);
      }

      setShowFormModal(false);
      setForm(emptyForm);
      await loadRows();
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Gagal Menyimpan",
        text: err.response?.data?.message || err.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row) => {
    const result = await Swal.fire({
      title: "Hapus Pasangan Ini?",
      text: `${row.tire_code} <-> ${row.tube_code} akan dihapus dari master.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Ya, Hapus",
      cancelButtonText: "Batal",
      confirmButtonColor: "#dc2626",
    });

    if (!result.isConfirmed) return;

    try {
      await api.delete(`/stok-opname-karawang/tire-tube-pairing/${row.id}`);
      await loadRows();
    } catch (err) {
      Swal.fire(
        "Gagal Menghapus",
        err.response?.data?.message || err.message,
        "error",
      );
    }
  };

  return (
    <div style={karawangStyles.page}>
      <KarawangSubNav />

      <div style={{ padding: "20px 24px", maxWidth: 1200, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            marginBottom: 18,
          }}
        >
          <div>
            <h2
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 19,
                fontWeight: 800,
                color: "#0f172a",
                margin: 0,
              }}
            >
              <Link2 size={20} />
              Master Pasangan Tire - Tube
            </h2>
            <p style={{ fontSize: 12.5, color: "#64748b", margin: "4px 0 0" }}>
              Dipakai Transfer Plan: pas tire (tubetype) masuk trip, tube
              pasangannya otomatis ikut (qty 1:1).
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                background: "#fff",
                border: "1px solid #cbd5e1",
                borderRadius: 8,
                fontSize: 12.5,
                fontWeight: 600,
                color: "#334155",
                cursor: "pointer",
              }}
            >
              <Upload size={14} />
              {uploadFile ? uploadFile.name : "Pilih File Excel"}
              <input
                type="file"
                accept=".xlsx,.xls"
                style={{ display: "none" }}
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              />
            </label>

            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading || !uploadFile}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                background: uploading || !uploadFile ? "#94a3b8" : "#2563eb",
                border: "none",
                borderRadius: 8,
                color: "#fff",
                fontSize: 12.5,
                fontWeight: 700,
                cursor: uploading || !uploadFile ? "not-allowed" : "pointer",
              }}
            >
              {uploading ? (
                <Loader2 size={14} className="ko-spin" />
              ) : (
                <Upload size={14} />
              )}
              {uploading ? "Mengimport..." : "Import Excel"}
            </button>

            <button
              type="button"
              onClick={openAddForm}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                background: "#16a34a",
                border: "none",
                borderRadius: 8,
                color: "#fff",
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <Plus size={14} />
              Tambah Pasangan
            </button>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            padding: "8px 12px",
            maxWidth: 380,
          }}
        >
          <Search size={15} color="#94a3b8" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari kode tire / tube / customer..."
            style={{
              border: "none",
              outline: "none",
              fontSize: 13,
              flex: 1,
              background: "transparent",
            }}
          />
        </div>

        <div
          style={{
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          {loading ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "40px 0",
                color: "#64748b",
                fontSize: 13,
              }}
            >
              <Loader2 size={16} className="ko-spin" />
              Memuat data...
            </div>
          ) : filteredRows.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "40px 0",
                color: "#94a3b8",
                fontSize: 13,
              }}
            >
              Belum ada data pasangan Tire-Tube. Import Excel atau tambah
              manual dulu.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {[
                      "Kode Tire",
                      "Deskripsi Tire",
                      "Kode Tube",
                      "Deskripsi Tube",
                      "Customer",
                      "",
                    ].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "left",
                          padding: "10px 12px",
                          color: "#64748b",
                          fontWeight: 700,
                          borderBottom: "1px solid #e2e8f0",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "9px 12px", fontWeight: 700, color: "#0f172a" }}>
                        {row.tire_code}
                      </td>
                      <td style={{ padding: "9px 12px", color: "#334155" }}>
                        {row.tire_description || "-"}
                      </td>
                      <td style={{ padding: "9px 12px", fontWeight: 700, color: "#0f172a" }}>
                        {row.tube_code}
                      </td>
                      <td style={{ padding: "9px 12px", color: "#334155" }}>
                        {row.tube_description || "-"}
                      </td>
                      <td style={{ padding: "9px 12px", color: "#334155" }}>
                        {row.customer || "-"}
                      </td>
                      <td style={{ padding: "9px 12px", whiteSpace: "nowrap" }}>
                        <button
                          type="button"
                          onClick={() => openEditForm(row)}
                          title="Edit"
                          style={{
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            color: "#2563eb",
                            marginRight: 8,
                          }}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(row)}
                          title="Hapus"
                          style={{
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            color: "#dc2626",
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showFormModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: 16,
          }}
          onClick={() => setShowFormModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 14,
              padding: 22,
              width: "100%",
              maxWidth: 420,
            }}
          >
            <h3 style={{ margin: "0 0 14px", fontSize: 15.5, fontWeight: 800, color: "#0f172a" }}>
              {form.id ? "Edit Pasangan" : "Tambah Pasangan"}
            </h3>

            {[
              { key: "tire_code", label: "Kode Tire *" },
              { key: "tire_description", label: "Deskripsi Tire" },
              { key: "tube_code", label: "Kode Tube *" },
              { key: "tube_description", label: "Deskripsi Tube" },
              { key: "customer", label: "Customer" },
            ].map((f) => (
              <div key={f.key} style={{ marginBottom: 10 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: "#64748b",
                    marginBottom: 4,
                  }}
                >
                  {f.label}
                </label>
                <input
                  value={form[f.key]}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, [f.key]: e.target.value }))
                  }
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    border: "1px solid #cbd5e1",
                    borderRadius: 7,
                    fontSize: 13,
                    boxSizing: "border-box",
                  }}
                />
              </div>
            ))}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button
                type="button"
                onClick={() => setShowFormModal(false)}
                style={{
                  padding: "8px 16px",
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  borderRadius: 8,
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveForm}
                disabled={saving}
                style={{
                  padding: "8px 16px",
                  border: "none",
                  background: saving ? "#94a3b8" : "#2563eb",
                  color: "#fff",
                  borderRadius: 8,
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: saving ? "not-allowed" : "pointer",
                }}
              >
                {saving ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
