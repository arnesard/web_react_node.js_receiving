// src/pages/stok-opname-karawang/DashboardPage.jsx
// Dashboard: stok SEMUA item Cross Docking (se-DC, gak dibatasi rak yang
// udah discan) dibandingin sama hasil scan operator — total barcode,
// variance, dan progress %, plus breakdown per item.
//
// PENTING soal performa: target dari Cross Docking (`detail-all` tanpa
// filter) itu QUERY BERAT (bisa puluhan ribu baris) dan di-cache di
// backend TANPA auto-expire — jadi endpoint ini TIDAK PERNAH nembak Cross
// Docking sendiri pas halaman dibuka/refresh browser biasa. Query berat
// itu CUMA jalan kalau operator eksplisit klik tombol "Refresh Data Cross
// Docking" di bawah. Kalau belum pernah ada yang klik refresh sama sekali
// (belum ada cache), dashboard nampilin ajakan buat klik refresh dulu.
import { useState, useEffect, useCallback } from "react";
import { Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import api from "../../api/axiosInstance";
import KarawangSubNav from "./KarawangSubNav";
import { karawangStyles } from "./karawangStyles";

export default function KarawangDashboardPage() {
  const [batch, setBatch] = useState(null);
  const [noBatch, setNoBatch] = useState(false);
  const [initLoading, setInitLoading] = useState(true);

  const [full, setFull] = useState(null); // payload dari /dashboard/full
  const [loading, setLoading] = useState(false); // load biasa (pakai cache)
  const [refreshing, setRefreshing] = useState(false); // klik tombol Refresh
  const [error, setError] = useState("");

  const loadFull = useCallback((batchId, refresh) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    return api
      .get("/stok-opname-karawang/dashboard/full", {
        params: { batch_id: batchId, ...(refresh ? { refresh: "true" } : {}) },
      })
      .then((res) => setFull(res.data.data))
      .catch((err) => {
        setError(
          err.response?.data?.message ||
            "Gagal mengambil data dashboard. Coba lagi.",
        );
      })
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, []);

  useEffect(() => {
    api
      .get("/stok-opname-karawang/batches/active")
      .then((res) => {
        const b = res.data.data;
        if (!b) {
          setNoBatch(true);
          setInitLoading(false);
          return;
        }
        setBatch(b);
        return loadFull(b.id, false).finally(() => setInitLoading(false));
      })
      .catch(() => {
        setNoBatch(true);
        setInitLoading(false);
      });
  }, [loadFull]);

  const busy = loading || refreshing;

  return (
    <div className="ko-page">
      <style>{karawangStyles}</style>
      <KarawangSubNav />

      <div className="ko-header">
        <h1>Dashboard Stok Opname DC Karawang</h1>
        <p>Stok semua item Cross Docking dibandingkan hasil scan operator.</p>
      </div>

      {initLoading && (
        <div className="ko-empty">
          <Loader2 size={20} className="ko-spin" /> Memuat dashboard...
        </div>
      )}

      {!initLoading && noBatch && (
        <div className="ko-empty">Belum ada batch opname aktif.</div>
      )}

      {!initLoading && !noBatch && batch && (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 14,
            }}
          >
            <div className="ko-batch-badge" style={{ margin: 0 }}>
              {batch.nama_batch}
            </div>
            <button
              type="button"
              className="ko-btn-secondary"
              onClick={() => loadFull(batch.id, true)}
              disabled={busy}
            >
              {refreshing ? (
                <Loader2 size={13} className="ko-spin" />
              ) : (
                <RefreshCw size={13} />
              )}
              Refresh Data Cross Docking
            </button>
          </div>

          {full?.fetched_at && (
            <div className="ko-allstock-meta" style={{ marginBottom: 10 }}>
              Data Cross Docking terakhir diambil:{" "}
              {new Date(full.fetched_at).toLocaleString("id-ID")}
            </div>
          )}

          {refreshing && (
            <div className="ko-empty">
              <Loader2 size={20} className="ko-spin" /> Menarik semua stok
              dari Cross Docking... (bisa agak lama, mohon tunggu)
            </div>
          )}

          {!refreshing && loading && (
            <div className="ko-empty">
              <Loader2 size={20} className="ko-spin" /> Memuat dashboard...
            </div>
          )}

          {!refreshing && !loading && error && (
            <div className="ko-empty">
              <AlertTriangle size={18} /> {error}
            </div>
          )}

          {!refreshing && !loading && !error && full && !full.has_data && (
            <div className="ko-card" style={{ textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "#475569", marginBottom: 10 }}>
                Belum ada data stok Cross Docking yang ditarik. Klik tombol
                "Refresh Data Cross Docking" di atas buat mulai (bisa agak
                lama pertama kali, tergantung banyaknya stok se-DC).
              </div>
            </div>
          )}

          {!refreshing && !loading && !error && full && full.has_data && (
            <>
              <div className="ko-summary-grid">
                <div className="ko-summary-box">
                  <strong>{full.ringkasan.total_barcode.toLocaleString("id-ID")}</strong>
                  <span>TOTAL BARCODE (TIRE)</span>
                </div>
                <div
                  className="ko-summary-box"
                  style={
                    full.ringkasan.variance !== 0
                      ? { background: "linear-gradient(135deg, #b91c1c, #dc2626)" }
                      : { background: "linear-gradient(135deg, #15803d, #16a34a)" }
                  }
                >
                  <strong>
                    {full.ringkasan.variance > 0 ? "-" : full.ringkasan.variance < 0 ? "+" : ""}
                    {Math.abs(full.ringkasan.variance).toLocaleString("id-ID")}
                  </strong>
                  <span>VARIANCE</span>
                </div>
                <div className="ko-summary-box">
                  <strong>{full.ringkasan.persen}%</strong>
                  <span>PROGRESS SCAN</span>
                </div>
              </div>

              <div className="ko-card" style={{ padding: "10px 14px" }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#475569",
                    marginBottom: 4,
                  }}
                >
                  {full.ringkasan.total_qty_scanned.toLocaleString("id-ID")} /{" "}
                  {full.ringkasan.total_barcode.toLocaleString("id-ID")} pcs discan
                  ({full.ringkasan.total_item} item, {full.ringkasan.total_collie_scanned.toLocaleString("id-ID")} collie discan)
                </div>
                <div className="ko-progress-bar-outer">
                  <div
                    className="ko-progress-bar-inner"
                    style={{ width: `${full.ringkasan.persen}%` }}
                  />
                </div>
              </div>

              <div className="ko-items-grid">
                {full.items.map((it) => {
                  const ringColor =
                    it.persen >= 100
                      ? "#16a34a"
                      : it.persen >= 50
                        ? "#2563eb"
                        : it.persen > 0
                          ? "#f59e0b"
                          : "#94a3b8";
                  const picHint =
                    it.pic && it.pic.length > 0
                      ? it.pic.map((p) => `${p.nama} (${p.qty_scanned} pcs)`).join(", ")
                      : "";
                  return (
                    <div key={it.item} className="ko-item-card" title={picHint}>
                      <div
                        className="ko-radial"
                        style={{ "--pct": it.persen, "--ring-color": ringColor }}
                      >
                        <span className="ko-radial-label">{it.persen}%</span>
                      </div>
                      <div className="ko-item-info">
                        <div className="ko-item-code">{it.item}</div>
                        <div className="ko-item-descr">{it.deskripsi}</div>
                        {picHint && (
                          <div className="ko-item-pic-hint">{picHint}</div>
                        )}
                      </div>
                      <div className="ko-item-qty" style={{ textAlign: "right" }}>
                        {it.qty_scanned} / {it.qty_target}
                        <div className="ko-muted" style={{ fontSize: 10 }}>
                          {it.collie_scanned} collie
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
