// src/pages/stok-opname-karawang/DashboardPage.jsx
// Dashboard: berapa stok "Data Detail All" DC Karawang (target, dari
// excel) vs berapa yang sudah discan (realisasi), per item + total.
// Cuma 1 data aktif (upload baru otomatis ganti yang lama), jadi gak ada
// dropdown pilih batch.
import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import api from "../../api/axiosInstance";
import KarawangSubNav from "./KarawangSubNav";
import { karawangStyles } from "./karawangStyles";

export default function KarawangDashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [noData, setNoData] = useState(false);

  useEffect(() => {
    api
      .get("/stok-opname-karawang/batches/active")
      .then((res) => {
        const batch = res.data.data;
        if (!batch) {
          setNoData(true);
          setLoading(false);
          return;
        }
        return api
          .get("/stok-opname-karawang/dashboard", {
            params: { batch_id: batch.id },
          })
          .then((res2) => setData(res2.data.data));
      })
      .catch(() => setNoData(true))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="ko-page">
      <style>{karawangStyles}</style>
      <KarawangSubNav />

      <div className="ko-header">
        <h1>Dashboard Stok Opname DC Karawang</h1>
        <p>Perbandingan Data Detail All vs hasil scan .</p>
      </div>

      {loading && (
        <div className="ko-empty">
          <Loader2 size={20} className="ko-spin" /> Memuat dashboard...
        </div>
      )}

      {!loading && noData && (
        <div className="ko-empty">Belum ada data opname untuk batch ini.</div>
      )}

      {!loading && data && (
        <>
          <div className="ko-batch-badge">{data.batch.nama_batch}</div>

          <div className="ko-summary-grid">
            <div className="ko-summary-box">
              <strong>{data.ringkasan.total_item}</strong>
              <span>ITEM</span>
            </div>
            <div className="ko-summary-box">
              <strong>{data.ringkasan.total_collie_scanned}</strong>
              <span>COLLIE DISCAN</span>
            </div>
            <div className="ko-summary-box">
              <strong>
                {data.ringkasan.total_qty_scanned} /{" "}
                {data.ringkasan.total_qty_target}
              </strong>
              <span>PCS DISCAN</span>
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
              Progress keseluruhan: {data.ringkasan.persen}%
            </div>
            <div className="ko-progress-bar-outer">
              <div
                className="ko-progress-bar-inner"
                style={{ width: `${data.ringkasan.persen}%` }}
              />
            </div>
          </div>

          {data.items.map((it) => (
            <div key={it.item} className="ko-item-card">
              <div className="ko-item-card-top">
                <div>
                  <div className="ko-item-code">{it.item}</div>
                  <div className="ko-item-descr">{it.deskripsi}</div>
                </div>
                <div className="ko-item-qty">
                  {it.qty_scanned} / {it.qty_target} pcs
                  <div className="ko-muted">
                    {it.collie_scanned} collie discan
                  </div>
                </div>
              </div>
              <div className="ko-progress-bar-outer">
                <div
                  className="ko-progress-bar-inner"
                  style={{ width: `${it.persen}%` }}
                />
              </div>
              {it.pic && it.pic.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    marginTop: 8,
                  }}
                >
                  {it.pic.map((p) => (
                    <span
                      key={`${it.item}-${p.id_karyawan}`}
                      style={{
                        fontSize: 11,
                        background: "#eef2ff",
                        color: "#3730a3",
                        borderRadius: 999,
                        padding: "3px 9px",
                        fontWeight: 600,
                      }}
                      title={p.employee_id || ""}
                    >
                      {p.nama} · {p.qty_scanned} pcs
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
