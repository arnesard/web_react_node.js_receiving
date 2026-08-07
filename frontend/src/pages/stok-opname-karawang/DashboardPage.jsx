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
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { Loader2, RefreshCw, AlertTriangle, X, Trash2, Pencil } from "lucide-react";
import api from "../../api/axiosInstance";
import KarawangSubNav from "./KarawangSubNav";
import { karawangStyles } from "./karawangStyles";

// Modal detail per-item: nama operator yang scan, qty, item & deskripsinya.
// Sebelumnya info operator ini nempel langsung di card (bikin sesak di
// layar penuh item) — sekarang dipindah ke sini, muncul pas card diklik.
function ItemDetailModal({ item, onClose, onEdit }) {
  const detail = item.detail || [];
  return (
    <div className="ko-cd-modal-backdrop" onClick={onClose}>
      <div
        className="ko-cd-modal"
        style={{ width: "min(880px, 96vw)", maxHeight: "min(760px, 90vh)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ko-cd-modal-header">
          <h2>{item.item}</h2>
          <button
            type="button"
            className="ko-cd-modal-close"
            onClick={onClose}
            aria-label="Tutup"
          >
            <X size={18} />
          </button>
        </div>
        <div className="ko-cd-modal-body">
          <div className="ko-modal-detail-row">
            <span>Deskripsi</span>
            <strong style={{ textAlign: "right" }}>{item.deskripsi}</strong>
          </div>
          <div className="ko-modal-detail-row">
            <span>Qty discan / target</span>
            <strong>
              {item.qty_scanned} / {item.qty_target}
            </strong>
          </div>
          <div className="ko-modal-detail-row">
            <span>Collie discan</span>
            <strong>{item.collie_scanned}</strong>
          </div>
          <div className="ko-modal-detail-row">
            <span>Sisa belum discan</span>
            <strong>{Math.max(0, item.sisa_qty)}</strong>
          </div>

          <div className="ko-modal-section-title">
            Operator &amp; rak yang sudah discan ({detail.length})
          </div>
          {detail.length === 0 ? (
            <div className="ko-empty" style={{ padding: "1.2rem" }}>
              Belum ada yang scan item ini.
            </div>
          ) : (
            <div className="ko-cd-modal-table-scroll" style={{ maxHeight: 320 }}>
              <table className="ko-data-table">
                <thead>
                  <tr>
                    <th>Operator</th>
                    <th>Rak</th>
                    <th>Lokasi</th>
                    <th>Qty Discan</th>
                    <th>Collie Discan</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {detail.map((d, idx) => (
                    <tr key={`${d.id_karyawan}-${d.rackcode}-${idx}`}>
                      <td>{d.nama}</td>
                      <td className="ko-strong">{d.rackcode}</td>
                      <td>{d.loccol || "-"}</td>
                      <td className="ko-mono">{d.qty_scanned}</td>
                      <td className="ko-mono">{d.collie_scanned}</td>
                      <td>
                        <button
                          type="button"
                          className="ko-btn-ganti"
                          onClick={() =>
                            onEdit({ rackcode: d.rackcode, loccol: d.loccol })
                          }
                        >
                          <Pencil size={11} style={{ verticalAlign: -1 }} />{" "}
                          Edit
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
    </div>
  );
}

// Modal variance: nampilin item + deskripsi yang belum discan lengkap sama
// operator (sisa_qty > 0), diurutin dari yang paling banyak kurangnya.
function VarianceDetailModal({ items, onClose }) {
  const belum = items
    .filter((it) => it.sisa_qty > 0)
    .sort((a, b) => b.sisa_qty - a.sisa_qty);

  return (
    <div className="ko-cd-modal-backdrop" onClick={onClose}>
      <div className="ko-cd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ko-cd-modal-header">
          <h2>Item Belum Discan Lengkap ({belum.length})</h2>
          <button
            type="button"
            className="ko-cd-modal-close"
            onClick={onClose}
            aria-label="Tutup"
          >
            <X size={18} />
          </button>
        </div>
        <div className="ko-cd-modal-body">
          {belum.length === 0 ? (
            <div className="ko-empty">
              Semua item udah kescan lengkap, gak ada variance.
            </div>
          ) : (
            <div className="ko-cd-modal-table-scroll">
              <table className="ko-data-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Deskripsi</th>
                    <th>Target</th>
                    <th>Discan</th>
                    <th>Sisa</th>
                  </tr>
                </thead>
                <tbody>
                  {belum.map((it) => (
                    <tr key={it.item}>
                      <td className="ko-strong">{it.item}</td>
                      <td>{it.deskripsi}</td>
                      <td className="ko-mono">{it.qty_target}</td>
                      <td className="ko-mono">{it.qty_scanned}</td>
                      <td className="ko-mono">{it.sisa_qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Format tanggal jadi dd/mm/yy + jam terpisah, biar gampang dibedain mana
// tanggal (bold, tegas) mana jam (lebih ringan/terang).
function formatFetchedAt(iso) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  const time = d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return { date: `${dd}/${mm}/${yy}`, time };
}

// 3 status warna item: putih (belum ada yang discan sama sekali), kuning
// (lagi proses, sebagian udah kescan), hijau (selesai/qty udah sesuai target).
function getItemStatus(it) {
  if (it.qty_scanned <= 0) return "empty";
  if (it.persen >= 100) return "done";
  return "progress";
}

export default function KarawangDashboardPage() {
  const navigate = useNavigate();
  const [batch, setBatch] = useState(null);
  const [noBatch, setNoBatch] = useState(false);
  const [initLoading, setInitLoading] = useState(true);

  const [full, setFull] = useState(null); // payload dari /dashboard/full
  const [loading, setLoading] = useState(false); // load biasa (pakai cache)
  const [refreshing, setRefreshing] = useState(false); // klik tombol Refresh
  const [error, setError] = useState("");

  const [selectedItem, setSelectedItem] = useState(null); // buat modal detail item
  const [showVarianceModal, setShowVarianceModal] = useState(false);

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
  const fetchedAt = full?.fetched_at ? formatFetchedAt(full.fetched_at) : null;

  // Tombol "Reset Data Scan" — minta sandi dulu (SweetAlert input, biar
  // gak kepencet gak sengaja), lalu konfirmasi sekali lagi karena ini
  // ngosongin SEMUA hasil scan (batch/target tetap ada, cuma progress
  // scan yang balik ke 0). Kalau sandi salah, backend balikin 403 dan
  // ditampilin apa adanya ke operator.
  const handleTruncateScan = async () => {
    const { value: password } = await Swal.fire({
      title: "Reset Data Scan",
      html: "Semua hasil scan (rak &amp; collie) akan dihapus total dan gak bisa dibalikin lagi. Masukkan sandi buat lanjut:",
      input: "password",
      inputPlaceholder: "Sandi",
      showCancelButton: true,
      confirmButtonText: "Lanjut",
      cancelButtonText: "Batal",
      confirmButtonColor: "#dc2626",
      inputValidator: (value) => (!value ? "Sandi wajib diisi" : undefined),
    });
    if (!password) return;

    const confirm = await Swal.fire({
      icon: "warning",
      title: "Yakin reset semua data scan?",
      text: "Tindakan ini gak bisa dibatalkan.",
      showCancelButton: true,
      confirmButtonText: "Ya, reset",
      cancelButtonText: "Batal",
      confirmButtonColor: "#dc2626",
    });
    if (!confirm.isConfirmed) return;

    try {
      await api.post("/stok-opname-karawang/truncate-scan", { password });
      Swal.fire({
        icon: "success",
        title: "Data scan berhasil direset",
        timer: 1600,
        showConfirmButton: false,
      });
      if (batch) loadFull(batch.id, false);
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Gagal reset data scan",
        text: err.response?.data?.message || err.message,
      });
    }
  };

  // Tombol "Edit" di baris operator+rak — balik ke halaman Scan, langsung
  // kebuka di rak itu (skip step pilih lokasi & scan rak manual) biar
  // operator bisa langsung koreksi/tambah collie di rak yang sama. Detail
  // rak-nya (scan_list dsb) ditarik ulang LIVE di halaman Scan, bukan
  // dikirim dari sini, biar datanya gak basi.
  const handleEditRak = ({ rackcode, loccol }) => {
    navigate("/karawang", { state: { editRak: { rackcode, loccol } } });
  };

  return (
    <div className="ko-page ko-page-full ko-dashboard-shell">
      <style>{karawangStyles}</style>

      {/* ── Bagian atas (navbar s/d 3 card ringkasan) dibikin freeze, gak
          ikut kescroll — cuma grid item di bawah yang scroll sendiri. ── */}
      <div className="ko-dashboard-fixed">
        <KarawangSubNav />

        <div className="ko-dashboard-title-row">
          <div className="ko-header">
            <h1>Dashboard Stok Opname DC Karawang</h1>
            <p>Stok semua item Cross Docking dibandingkan hasil scan operator.</p>
          </div>
          {!initLoading && !noBatch && batch && (
            <div style={{ display: "flex", gap: 8 }}>
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
              <button
                type="button"
                className="ko-btn-secondary"
                onClick={handleTruncateScan}
                style={{ color: "#dc2626", borderColor: "#fca5a5" }}
              >
                <Trash2 size={13} />
                Reset Data Scan
              </button>
            </div>
          )}
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
            {fetchedAt && (
              <div className="ko-allstock-meta" style={{ marginBottom: 10 }}>
                <strong>
                  Data Cross Docking terakhir diambil: {fetchedAt.date}
                </strong>
                <span className="ko-allstock-time">, {fetchedAt.time}</span>
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
                  <button
                    type="button"
                    className="ko-summary-box ko-summary-box-clickable"
                    onClick={() => setShowVarianceModal(true)}
                    title="Klik buat liat item yang belum discan lengkap"
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
                  </button>
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
              </>
            )}
          </>
        )}
      </div>

      {/* ── Bagian bawah (grid item) — ini aja yang scroll ── */}
      {!initLoading &&
        !noBatch &&
        batch &&
        !refreshing &&
        !loading &&
        !error &&
        full &&
        full.has_data && (
          <div className="ko-dashboard-scroll">
            <div className="ko-items-grid">
              {full.items.map((it) => {
                const status = getItemStatus(it);
                return (
                  <button
                    key={it.item}
                    type="button"
                    className={`ko-item-card ko-item-card-${status}`}
                    onClick={() => setSelectedItem(it)}
                  >
                    <div
                      className="ko-radial"
                      style={{ "--pct": it.persen, "--ring-color": "#7c3aed" }}
                    >
                      <span className="ko-radial-label">{it.persen}%</span>
                    </div>
                    <div className="ko-item-info">
                      <div className="ko-item-code">{it.item}</div>
                      <div className="ko-item-descr">{it.deskripsi}</div>
                    </div>
                    <div className="ko-item-qty" style={{ textAlign: "right" }}>
                      {it.qty_scanned} / {it.qty_target}
                      <div className="ko-muted" style={{ fontSize: 9 }}>
                        {it.collie_scanned} collie
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

      {selectedItem && (
        <ItemDetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onEdit={handleEditRak}
        />
      )}
      {showVarianceModal && full?.items && (
        <VarianceDetailModal
          items={full.items}
          onClose={() => setShowVarianceModal(false)}
        />
      )}
    </div>
  );
}
