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
import {
  Loader2,
  RefreshCw,
  AlertTriangle,
  X,
  Trash2,
  Pencil,
  Settings,
} from "lucide-react";
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

          {item.outbound && item.outbound.confirmed_qty > 0 && (
            <>
              <div
                className="ko-modal-detail-row"
                style={{
                  background: "#eff6ff",
                  borderRadius: 6,
                  padding: "4px 6px",
                }}
              >
                <span style={{ color: "#1d4ed8" }}>
                  Qty hasil scan asli (sebelum netting)
                </span>
                <strong style={{ color: "#1d4ed8" }}>
                  {item.raw_qty_scanned}
                </strong>
              </div>
              <div
                className="ko-modal-section-title"
                style={{ color: "#1d4ed8" }}
              >
                Status Outbound —{" "}
                {item.outbound.fully_explained
                  ? "selisih terjelaskan penuh, rak sudah outbound"
                  : "sebagian terjelaskan outbound"}
              </div>
              <div
                className="ko-cd-modal-table-scroll"
                style={{ maxHeight: 200 }}
              >
                <table className="ko-data-table">
                  <thead>
                    <tr>
                      <th>Rak</th>
                      <th>Qty Discan</th>
                      <th>Qty Live CD Sekarang</th>
                      <th>Keterangan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.outbound.racks.map((r, idx) => (
                      <tr key={`${r.rackcode}-${idx}`}>
                        <td className="ko-strong">{r.rackcode}</td>
                        <td className="ko-mono">{r.qty_scanned}</td>
                        <td className="ko-mono">
                          {r.check_failed ? "gagal cek" : r.qty_live}
                        </td>
                        <td className="ko-mono">
                          {r.check_failed ? (
                            "-"
                          ) : r.qty_outbound > 0 ? (
                            <span style={{ color: "#1d4ed8" }}>
                              outbound {r.qty_outbound}
                            </span>
                          ) : r.qty_surplus > 0 ? (
                            <span style={{ color: "#059669" }}>
                              nampung pindahan +{r.qty_surplus}
                            </span>
                          ) : (
                            "sesuai"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="ko-muted" style={{ fontSize: 10, marginTop: 4 }}>
                Rak dengan "nampung pindahan" dianggap nutup selisih outbound di
                rak lain (barang pindah rak, bukan bener-bener keluar gudang) —
                makanya cuma selisih bersih yang dianggap outbound.
                {item.outbound.excess_qty > 0 && (
                  <>
                    {" "}
                    Dari total {item.outbound.confirmed_qty} pcs confirmed
                    outbound, cuma {item.outbound.netted_qty} pcs yang dipotong
                    dari card (buat nutup selisih ke target); sisa{" "}
                    {item.outbound.excess_qty} pcs outbound di luar selisih ini
                    gak mempengaruhi tampilan qty di card.
                  </>
                )}
              </div>
            </>
          )}

          <div className="ko-modal-section-title">
            Operator &amp; rak yang sudah discan ({detail.length})
          </div>
          {detail.length === 0 ? (
            <div className="ko-empty" style={{ padding: "1.2rem" }}>
              Belum ada yang scan item ini.
            </div>
          ) : (
            <div
              className="ko-cd-modal-table-scroll"
              style={{ maxHeight: 320 }}
            >
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
                    <th>Barcode</th>
                    <th>counted</th>
                    <th>variance</th>
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

// Modal setting cutoff karantina (tombol gear) — operator pilih tanggal +
// jam manual. Begitu disimpan, cutoff-nya FIXED (gak ikut geser otomatis
// tiap ganti hari lagi) sampai diubah manual lagi atau di-reset ke
// otomatis. Input date & time dipisah 2 field HTML native (lebih gampang
// dipakai di HP/tablet dibanding datetime-local yang UI-nya beda-beda per
// browser).
function KarantinaCutoffSettingModal({
  currentCutoff,
  isManual,
  onClose,
  onSaved,
}) {
  const initial = currentCutoff ? new Date(currentCutoff) : new Date();
  const pad = (n) => String(n).padStart(2, "0");
  // Ambil tanggal & jam APA ADANYA dalam WIB (bukan waktu lokal browser),
  // biar konsisten sama cara backend nampilin & ngitung (semua WIB).
  const wibParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .formatToParts(initial)
    .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});

  const [dateVal, setDateVal] = useState(
    `${wibParts.year}-${wibParts.month}-${wibParts.day}`,
  );
  const [timeVal, setTimeVal] = useState(`${wibParts.hour}:${wibParts.minute}`);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!dateVal || !timeVal) {
      Swal.fire({
        icon: "warning",
        title: "Tanggal & jam wajib diisi",
      });
      return;
    }
    setSaving(true);
    try {
      // Bikin instant absolut dari tanggal+jam yang dipilih, DIANGGAP WIB
      // (+07:00) — bukan timezone browser operator, biar konsisten di HP
      // mana pun cutoff-nya sama.
      const iso = `${dateVal}T${timeVal}:00+07:00`;
      const parsed = new Date(iso);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error("Format tanggal/jam gak valid");
      }
      const res = await api.put(
        "/stok-opname-karawang/dashboard/karantina-cutoff",
        { cutoff: iso },
      );
      onSaved(res.data.data);
      Swal.fire({
        icon: "success",
        title: "Cutoff karantina disimpan",
        timer: 1400,
        showConfirmButton: false,
      });
      onClose();
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Gagal simpan cutoff",
        text: err.response?.data?.message || err.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleResetOtomatis = async () => {
    setSaving(true);
    try {
      const res = await api.delete(
        "/stok-opname-karawang/dashboard/karantina-cutoff",
      );
      onSaved(res.data.data);
      Swal.fire({
        icon: "success",
        title: "Balik ke cutoff otomatis",
        text: 'Cutoff bakal otomatis "hari ini jam 12:00 WIB", geser tiap ganti hari.',
        timer: 2000,
        showConfirmButton: false,
      });
      onClose();
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Gagal reset cutoff",
        text: err.response?.data?.message || err.message,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ko-cd-modal-backdrop" onClick={onClose}>
      <div
        className="ko-cd-modal"
        style={{ maxWidth: 420 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ko-cd-modal-header">
          <h2>Atur Cutoff Barang Karantina</h2>
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
          <div style={{ fontSize: 12, color: "#475569", marginBottom: 14 }}>
            Barang dengan tanggal update Cross Docking (WIB) mulai dari tanggal
            &amp; jam di bawah ini dianggap "Barang Karantina" — belum resmi
            masuk stok gudang, gak dihitung di Total Barcode / Variance /
            Progress Scan.
          </div>

          <div style={{ marginBottom: 4, fontSize: 12, color: "#334155" }}>
            Status saat ini:{" "}
            <strong>
              {isManual
                ? "Diset manual (gak ikut geser otomatis)"
                : "Otomatis (hari ini jam 12:00 WIB, geser tiap ganti hari)"}
            </strong>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              marginTop: 14,
              marginBottom: 4,
            }}
          >
            <div style={{ flex: 1 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  color: "#64748b",
                  marginBottom: 4,
                }}
              >
                Tanggal
              </label>
              <input
                type="date"
                className="ko-input"
                value={dateVal}
                onChange={(e) => setDateVal(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  color: "#64748b",
                  marginBottom: 4,
                }}
              >
                Jam (WIB)
              </label>
              <input
                type="time"
                className="ko-input"
                value={timeVal}
                onChange={(e) => setTimeVal(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
              marginTop: 20,
            }}
          >
            <button
              type="button"
              className="ko-btn-secondary"
              onClick={handleResetOtomatis}
              disabled={saving}
              style={{ fontSize: 12 }}
            >
              Balik ke Otomatis
            </button>
            <button
              type="button"
              className="ko-btn-primary"
              onClick={handleSave}
              disabled={saving}
              style={{ fontSize: 12 }}
            >
              {saving ? (
                <Loader2 size={13} className="ko-spin" />
              ) : (
                "Simpan Cutoff"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Modal karantina: item + deskripsi + qty yang last_update-nya kena cutoff
// (hari ini jam 12:00 WIB ke atas) — dianggap barang baru masuk, BELUM
// resmi jadi stok gudang yang wajib discan operator.
function KarantinaDetailModal({ items, cutoff, onClose }) {
  const sorted = [...items].sort((a, b) => b.qty - a.qty);
  const totalQty = sorted.reduce((sum, it) => sum + it.qty, 0);
  const cutoffLabel = cutoff ? formatFetchedAt(cutoff) : null;

  return (
    <div className="ko-cd-modal-backdrop" onClick={onClose}>
      <div className="ko-cd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ko-cd-modal-header">
          <h2>Barang Karantina ({sorted.length} item)</h2>
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
          {cutoffLabel && (
            <div style={{ fontSize: 12, color: "#475569", marginBottom: 10 }}>
              Barang dengan last update Cross Docking mulai{" "}
              <strong>
                {cutoffLabel.date} {cutoffLabel.time}
              </strong>{" "}
              dianggap belum resmi masuk stok gudang, tidak dihitung di Total
              Barcode / Variance / Progress Scan.
            </div>
          )}
          {sorted.length === 0 ? (
            <div className="ko-empty">Gak ada barang karantina saat ini.</div>
          ) : (
            <div className="ko-cd-modal-table-scroll">
              <table className="ko-data-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Deskripsi</th>
                    <th>Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((it) => (
                    <tr key={it.item}>
                      <td className="ko-strong">{it.item}</td>
                      <td>{it.deskripsi}</td>
                      <td className="ko-mono">{it.qty}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="ko-strong">Total</td>
                    <td></td>
                    <td className="ko-mono ko-strong">{totalQty}</td>
                  </tr>
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

// 4 status warna item: putih (belum ada yang discan sama sekali), kuning
// (lagi proses, sebagian udah kescan), hijau (selesai/qty udah sesuai
// target — INI JUGA statusnya kalau overscan-nya udah ke-konfirmasi live
// outbound di Cross Docking, karena qty_scanned yang ditampilin di card
// udah di-netting sama qty yang outbound; detail biru-nya taro di modal,
// bukan di warna card), merah pastel (over — masih overscan dan
// belum/gak kejelasin sama outbound, kemungkinan ada barcode yang
// harusnya gak boleh kescan atau dobel input).
function getItemStatus(it) {
  if (it.overscan) return "over";
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
  const [showKarantinaModal, setShowKarantinaModal] = useState(false);
  const [showCutoffSettingModal, setShowCutoffSettingModal] = useState(false);

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
            <p>
              Stok semua item Cross Docking dibandingkan hasil scan operator.
            </p>
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
              <button
                type="button"
                className="ko-btn-secondary"
                onClick={() => setShowCutoffSettingModal(true)}
                title="Atur cutoff Barang Karantina"
              >
                <Settings size={13} />
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
                dari Cross Docking &amp; cek tanggal masuk tiap rak/item...
                (bisa lebih lama dari biasanya, mohon tunggu)
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
                <div
                  style={{ fontSize: 13, color: "#475569", marginBottom: 10 }}
                >
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
                    <strong>
                      {full.ringkasan.total_barcode.toLocaleString("id-ID")}
                    </strong>
                    <span>TOTAL BARCODE (TIRE)</span>
                  </div>
                  <button
                    type="button"
                    className="ko-summary-box ko-summary-box-clickable"
                    onClick={() => setShowVarianceModal(true)}
                    title="Klik buat liat item yang belum discan lengkap"
                    style={
                      full.ringkasan.variance !== 0
                        ? {
                            background:
                              "linear-gradient(135deg, #b91c1c, #dc2626)",
                          }
                        : {
                            background:
                              "linear-gradient(135deg, #15803d, #16a34a)",
                          }
                    }
                  >
                    <strong>
                      {full.ringkasan.variance > 0
                        ? "-"
                        : full.ringkasan.variance < 0
                          ? "+"
                          : ""}
                      {Math.abs(full.ringkasan.variance).toLocaleString(
                        "id-ID",
                      )}
                    </strong>
                    <span>VARIANCE</span>
                  </button>
                  <div className="ko-summary-box">
                    <strong>{full.ringkasan.persen}%</strong>
                    <span>PROGRESS SCAN</span>
                  </div>
                  <button
                    type="button"
                    className="ko-summary-box ko-summary-box-clickable"
                    onClick={() => setShowKarantinaModal(true)}
                    title="Klik buat liat item barang karantina"
                    style={{
                      background:
                        full.ringkasan.total_karantina_item > 0
                          ? "linear-gradient(135deg, #b45309, #d97706)"
                          : "linear-gradient(135deg, #475569, #64748b)",
                    }}
                  >
                    <strong>
                      {full.ringkasan.total_karantina_item}{" "}
                      <span style={{ fontSize: 11, fontWeight: 600 }}>
                        item
                      </span>
                    </strong>
                    <span>BARANG KARANTINA</span>
                  </button>
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
                    {full.ringkasan.total_barcode.toLocaleString("id-ID")} pcs
                    discan ({full.ringkasan.total_item} item,{" "}
                    {full.ringkasan.total_collie_scanned.toLocaleString(
                      "id-ID",
                    )}{" "}
                    collie discan)
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
                      style={{
                        "--pct": it.persen,
                        "--ring-color":
                          status === "over" ? "#dc2626" : "#7c3aed",
                      }}
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
                        {it.outbound && it.outbound.confirmed_qty > 0 && (
                          <span style={{ color: "#2563eb" }}>
                            {" "}
                            · ada outbound
                          </span>
                        )}
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
      {showKarantinaModal && (
        <KarantinaDetailModal
          items={full?.karantina || []}
          cutoff={full?.karantina_cutoff}
          onClose={() => setShowKarantinaModal(false)}
        />
      )}
      {showCutoffSettingModal && (
        <KarantinaCutoffSettingModal
          currentCutoff={full?.karantina_cutoff}
          isManual={full?.karantina_cutoff_manual || false}
          onClose={() => setShowCutoffSettingModal(false)}
          onSaved={(saved) => {
            // saved = { cutoff, is_manual, dashboard } dari backend —
            // dashboard-nya hasil re-split data yang UDAH ke-cache pakai
            // cutoff baru (gak nembak Cross Docking lagi), jadi tinggal
            // gabungin ke state `full` yang ada biar UI langsung update.
            setFull((prev) => {
              if (!prev) return prev;
              const next = {
                ...prev,
                karantina_cutoff: saved.cutoff,
                karantina_cutoff_manual: saved.is_manual,
              };
              if (saved.dashboard) {
                next.karantina = saved.dashboard.karantina || [];
                next.items = saved.dashboard.items || prev.items;
                next.ringkasan = {
                  ...prev.ringkasan,
                  total_item: saved.dashboard.total_item,
                  total_barcode: saved.dashboard.total_barcode,
                  total_karantina_item: saved.dashboard.total_karantina_item,
                  total_karantina_qty: saved.dashboard.total_karantina_qty,
                  variance:
                    saved.dashboard.total_barcode -
                    prev.ringkasan.total_qty_scanned,
                  persen: saved.dashboard.total_barcode
                    ? Math.min(
                        100,
                        Math.floor(
                          (prev.ringkasan.total_qty_scanned /
                            saved.dashboard.total_barcode) *
                            100,
                        ),
                      )
                    : 0,
                };
              }
              return next;
            });
          }}
        />
      )}
    </div>
  );
}
