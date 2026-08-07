// src/pages/stok-opname-karawang/UploadPage.jsx
// Mulai opname baru: input MANUAL daftar lokasi (loccol + rackcode), BUKAN
// upload excel lagi (Agustus 2026 — target sekarang dihitung live dari
// Cross Docking, lihat KarawangController.dashboard). Format paste: satu
// baris per rak, "LOCCOL,RACKCODE" (bisa juga dipisah TAB, kalau
// copy-paste dari Excel/Google Sheets 2 kolom).
import { useState } from "react";
import Swal from "sweetalert2";
import { ListChecks, Loader2 } from "lucide-react";
import api from "../../api/axiosInstance";
import KarawangSubNav from "./KarawangSubNav";
import { karawangStyles } from "./karawangStyles";

function parseLokasiText(text) {
  const rows = [];
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const parts = line.split(/[,\t]/).map((p) => p.trim());
      if (parts.length >= 2 && parts[0] && parts[1]) {
        rows.push({ loccol: parts[0], rackcode: parts[1] });
      }
    });
  return rows;
}

export default function KarawangUploadPage() {
  const [namaBatch, setNamaBatch] = useState("");
  const [lokasiText, setLokasiText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const parsedRows = parseLokasiText(lokasiText);

  const handleMulai = async () => {
    if (!parsedRows.length) {
      Swal.fire(
        "Belum ada data",
        'Isi minimal 1 baris "LOCCOL,RACKCODE"',
        "warning",
      );
      return;
    }

    const confirm = await Swal.fire({
      title: "Mulai opname baru?",
      html: `Data lokasi & hasil scan yang <b>sekarang aktif</b> akan otomatis terhapus, diganti dengan ${parsedRows.length} baris ini.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Ya, lanjutkan",
      cancelButtonText: "Batal",
      confirmButtonColor: "#0021b3",
    });
    if (!confirm.isConfirmed) return;

    setSubmitting(true);
    try {
      const res = await api.post("/stok-opname-karawang/mulai-opname", {
        nama_batch: namaBatch.trim() || undefined,
        lokasi: parsedRows,
      });
      const data = res.data.data;
      await Swal.fire({
        icon: "success",
        title: "Opname baru dimulai!",
        html: `${data.message}`,
      });
      setNamaBatch("");
      setLokasiText("");
    } catch (err) {
      Swal.fire(
        "Gagal memulai opname",
        err.response?.data?.message || err.message,
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ko-page">
      <style>{karawangStyles}</style>
      <KarawangSubNav />

      <div className="ko-header">
        <h1>Mulai Opname Baru</h1>
      </div>

      <div className="ko-card">
        <p style={{ fontSize: 13, color: "#555", marginTop: 0 }}>
          Gak perlu upload excel lagi — data target dihitung otomatis (live)
          dari Cross Docking. Cukup masukin lokasi (loccol) &amp; rak yang mau
          di-opname round ini, satu baris per rak:
        </p>
        <pre
          style={{
            background: "#f3f4f6",
            padding: "6px 10px",
            borderRadius: 6,
            fontSize: 12,
            marginBottom: 12,
          }}
        >
          DCK01-B08,BRB07976{"\n"}DCK01-B08,BRB08168{"\n"}DCK01-C02,BRB20046
        </pre>

        <input
          type="text"
          placeholder="Nama opname (opsional)"
          value={namaBatch}
          onChange={(e) => setNamaBatch(e.target.value)}
          className="ko-input"
          style={{ marginBottom: 10, width: "100%" }}
        />

        <textarea
          rows={10}
          placeholder="LOCCOL,RACKCODE (satu baris per rak — bisa juga paste 2 kolom dari Excel)"
          value={lokasiText}
          onChange={(e) => setLokasiText(e.target.value)}
          className="ko-input"
          style={{ width: "100%", fontFamily: "monospace", fontSize: 13 }}
        />

        <div style={{ fontSize: 12, color: "#666", margin: "6px 0 14px" }}>
          {parsedRows.length
            ? `${parsedRows.length} baris valid terbaca, ${new Set(parsedRows.map((r) => r.loccol)).size} lokasi unik.`
            : "Belum ada baris valid."}
        </div>

        <button
          className="ko-btn-primary"
          onClick={handleMulai}
          disabled={submitting}
        >
          {submitting ? (
            <>
              <Loader2 size={16} className="ko-spin" /> Memproses...
            </>
          ) : (
            <>
              <ListChecks size={16} /> Mulai Opname
            </>
          )}
        </button>
      </div>
    </div>
  );
}
