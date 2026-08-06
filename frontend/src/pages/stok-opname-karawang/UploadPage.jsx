// src/pages/stok-opname-karawang/UploadPage.jsx
// Upload file excel "Data Detail All Karawang" → jadi data target/acuan
// buat 1 batch opname baru. Dilakukan sekali di awal tiap sesi opname.
import { useState, useRef } from "react";
import Swal from "sweetalert2";
import { UploadCloud, Loader2 } from "lucide-react";
import api from "../../api/axiosInstance";
import KarawangSubNav from "./KarawangSubNav";
import { karawangStyles } from "./karawangStyles";

export default function KarawangUploadPage() {
  const [namaBatch, setNamaBatch] = useState("");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleUpload = async () => {
    if (!file) {
      Swal.fire("Pilih file dulu", "File excel wajib diisi", "warning");
      return;
    }

    const confirm = await Swal.fire({
      title: "Upload data baru?",
      html: "Data Detail All & hasil scan yang <b>sekarang aktif</b> akan otomatis terhapus, diganti dengan data dari file ini.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Ya, lanjutkan",
      cancelButtonText: "Batal",
      confirmButtonColor: "#0021b3",
    });
    if (!confirm.isConfirmed) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (namaBatch.trim()) formData.append("nama_batch", namaBatch.trim());

      const res = await api.post("/stok-opname-karawang/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const data = res.data.data;
      await Swal.fire({
        icon: "success",
        title: "Data berhasil diimport!",
        html: `${data.message}`,
      });
      setNamaBatch("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      Swal.fire(
        "Gagal upload",
        err.response?.data?.message || err.message,
        "error",
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="ko-page">
      <style>{karawangStyles}</style>
      <KarawangSubNav />

      <div className="ko-header">
        <h1>Upload Data Detail All Karawang</h1>
      </div>

      <div className="ko-card">
        <div className="ko-upload-box">
          <UploadCloud size={28} style={{ marginBottom: 6 }} />
          <div>File Data Detail All Karawang (.xlsx, .xls, atau .csv)</div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="ko-upload-input"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </div>

        <button
          className="ko-btn-primary"
          onClick={handleUpload}
          disabled={uploading}
        >
          {uploading ? (
            <>
              <Loader2 size={16} className="ko-spin" /> Memproses...
            </>
          ) : (
            "Import Data"
          )}
        </button>
      </div>
    </div>
  );
}
