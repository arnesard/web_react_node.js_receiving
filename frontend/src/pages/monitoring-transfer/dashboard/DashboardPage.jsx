// src/pages/Transfer/Dashboard.jsx
// Equivalen resources/views/MonitoringTransferRak/dashboard.blade.php (Laravel)
import { useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Repeat,
  LayoutDashboard,
  FileText,
  Loader2,
  Home,
  Settings,
  Send,
  PackageCheck,
  Box,
  Archive,
  ChevronDown,
  MapPin,
  Truck,
} from "lucide-react";
import api from "../../../api/axiosInstance";
import { todayJakarta } from "../../../utils/date";

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

// Catatan: tanggal awal filter dashboard SEMENTARA masih pakai jam device
// (todayJakarta) biar form langsung kepakai duluan, tapi begitu mount,
// langsung ditimpa sama tanggal asli dari server (lihat useEffect di bawah)
// — soalnya jam HP scanner suka salah setting, sama kayak halaman Input Produksi.

// Simplifikasi status jadi 2 kondisi aja buat operator lapangan: lagi DIKIRIM
// (mobil masih di jalan / masih diisi, belum ada yang discan diterima) atau
// udah DITERIMA (minimal sebagian rak udah discan sampai). 'batal' gak pernah
// nyampe sini karena udah difilter dari backend.
function statusInfo(status) {
  const sudahDiterima = status === "diterima" || status === "sebagian";
  return {
    label: sudahDiterima
      ? status === "sebagian"
        ? "Diterima (Sebagian)"
        : "Diterima"
      : "Dikirim",
    dotClass: sudahDiterima ? "tr-live-dot-diterima" : "tr-live-dot-kirim",
    badgeClass: sudahDiterima ? "tr-badge-diterima" : "tr-badge-kirim",
  };
}

export default function TransferDashboard() {
  const [date, setDate] = useState(todayJakarta());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Tanggal "hari ini" versi SERVER, bukan versi jam device — jam HP/scanner
  // di lapangan suka salah setting, jadi jangan diandelin buat filter tanggal.
  // Pola sama kayak Input Produksi: default device dulu biar form gak nge-blank,
  // begitu response server-time dateng, tanggal filter & serverToday di-overwrite
  // (KECUALI operator udah ganti tanggal manual, biar gak nimpa pilihan dia).
  const [serverToday, setServerToday] = useState(todayJakarta());
  useEffect(() => {
    let cancelled = false;
    api
      .get("/system/server-time")
      .then((res) => {
        if (cancelled) return;
        const serverDate = res.data?.data?.date;
        if (serverDate && /^\d{4}-\d{2}-\d{2}$/.test(serverDate)) {
          setServerToday(serverDate);
          setDate((prev) => (prev === todayJakarta() ? serverDate : prev));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  // Shift 1/2/3 di-hide default (dropdown/accordion) biar Aktivitas Terbaru
  // yang paling sering dipantau operator langsung kelihatan tanpa scroll.
  const [openShift, setOpenShift] = useState(null);
  // Trip Selesai per Kendaraan di-hide default (accordion), biar gak makan
  // tempat di atas Aktivitas Terbaru yang lebih sering dipantau operator.
  const [tripOpen, setTripOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/transfer-rak/dashboard/data", {
        params: { date },
      });
      setData(res.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 30000); // auto-refresh tiap 30 detik
    return () => clearInterval(timer);
  }, [fetchData]);

  const shifts = data?.shifts || [];

  return (
    <div className="tr-page tr-dash-page">
      <style>{trStyles}</style>
      <TransferSubNav />

      <div className="tr-dash-range">
        <input
          type="date"
          className="tr-input tr-date-input"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <button className="tr-range-btn" onClick={() => setDate(serverToday)}>
          Hari Ini
        </button>
        {loading && <Loader2 className="tr-spin" size={16} />}
      </div>

      {(data?.sedang_proses_detail || []).length > 0 && (
        <div className="tr-card">
          <div className="tr-section-title">
            🚚 Mobil Sedang Jalan
            <span className="tr-shift-trip">
              {data.sedang_proses_detail.length} unit
            </span>
          </div>
          {data.sedang_proses_detail.map((m, i) => (
            <div className="tr-vehicle-row" key={i}>
              <span className="tr-live-dot tr-live-dot-kirim" />
              <Truck size={14} color="#64748b" />
              <b>{m.mobil}</b>
              <span className="tr-vehicle-meta">
                {m.supir} ·{" "}
                {m.tipe === "rak_kosong"
                  ? [
                      m.total_rak > 0 ? `${m.total_rak} rak` : null,
                      m.total_palet > 0 ? `${m.total_palet} palet` : null,
                    ]
                      .filter(Boolean)
                      .join(", ") + " (KOSONG)"
                  : `${m.total_rak} rak`}{" "}
                · sejak {m.sejak}
              </span>
            </div>
          ))}
        </div>
      )}

      {(data?.trip_per_kendaraan || []).length > 0 && (
        <div
          className={
            "tr-card tr-shift-accordion tr-trip-accordion" +
            (tripOpen ? " open" : "")
          }
        >
          <button
            type="button"
            className="tr-shift-header tr-trip-header"
            onClick={() => setTripOpen((v) => !v)}
          >
            <span>🏁 Trip Selesai per Kendaraan</span>
            <span className="tr-shift-header-right">
              <span className="tr-shift-trip">
                {data.trip_per_kendaraan.reduce((a, v) => a + v.total, 0)} trip
              </span>
              <ChevronDown size={16} className="tr-shift-chevron" />
            </span>
          </button>
          {tripOpen && (
            <div className="tr-shift-body">
              {data.trip_per_kendaraan.map((v, i) => (
                <div className="tr-vehicle-row tr-vehicle-row-shift" key={i}>
                  <div className="tr-vehicle-row-top">
                    <Truck size={14} color="#16a34a" />
                    <b>{v.mobil}</b>
                    <span className="tr-vehicle-meta tr-vehicle-trip">
                      {v.total} trip
                    </span>
                  </div>
                  <div className="tr-vehicle-shift-breakdown">
                    {[1, 2, 3].map((s) => (
                      <span key={s} className="tr-vehicle-shift-chip">
                        S{s}: <b>{v.per_shift[s] || 0}</b>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="tr-card tr-shift-accordion">
        <div className="tr-section-title">📦 Detail Per Shift</div>
        {shifts.map((s) => {
          const isOpen = openShift === s.shift;
          return (
            <div
              className={"tr-shift-item" + (isOpen ? " open" : "")}
              key={s.shift}
            >
              <button
                type="button"
                className="tr-shift-header"
                onClick={() => setOpenShift(isOpen ? null : s.shift)}
              >
                <span>🕘 {s.label}</span>
                <span className="tr-shift-header-right">
                  <span className="tr-shift-trip">
                    {s.transfer_selesai} trip selesai
                  </span>
                  <ChevronDown size={16} className="tr-shift-chevron" />
                </span>
              </button>
              {isOpen && (
                <div className="tr-shift-body">
                  <div className="tr-shift-grid">
                    <div className="tr-shift-cell">
                      <Send size={16} color="#2563eb" />
                      <div className="tr-shift-value">{s.rak_isi_dikirim}</div>
                      <div className="tr-shift-label">Rak Isi Dikirim</div>
                    </div>
                    <div className="tr-shift-cell">
                      <PackageCheck size={16} color="#16a34a" />
                      <div className="tr-shift-value">{s.rak_isi_diterima}</div>
                      <div className="tr-shift-label">Rak Isi Diterima</div>
                    </div>
                    <div className="tr-shift-cell">
                      <Box size={16} color="#b45309" />
                      <div className="tr-shift-value">
                        {s.rak_kosong_dikirim}
                      </div>
                      <div className="tr-shift-label">Rak Kosong Dikirim</div>
                    </div>
                    <div className="tr-shift-cell">
                      <Archive size={16} color="#db2777" />
                      <div className="tr-shift-value">
                        {s.rak_kosong_diterima}
                      </div>
                      <div className="tr-shift-label">Rak Kosong Diterima</div>
                    </div>
                    <div className="tr-shift-cell">
                      <Box size={16} color="#7c3aed" />
                      <div className="tr-shift-value">
                        {s.palet_kosong_dikirim}
                      </div>
                      <div className="tr-shift-label">Palet Kosong Dikirim</div>
                    </div>
                    <div className="tr-shift-cell">
                      <Archive size={16} color="#e11d48" />
                      <div className="tr-shift-value">
                        {s.palet_kosong_diterima}
                      </div>
                      <div className="tr-shift-label">
                        Palet Kosong Diterima
                      </div>
                    </div>
                  </div>

                  {(s.breakdown_kirim?.length > 0 ||
                    s.breakdown_terima?.length > 0) && (
                    <div className="tr-plan-grid">
                      {s.breakdown_kirim?.length > 0 && (
                        <div className="tr-plan-col">
                          <div className="tr-plan-title">
                            <MapPin size={13} color="#2563eb" /> Dikirim per
                            Plan
                          </div>
                          {s.breakdown_kirim.map((b, i) => (
                            <div className="tr-plan-row" key={i}>
                              <span>{b.lokasi}</span>
                              <b>{b.jumlah}</b>
                            </div>
                          ))}
                        </div>
                      )}
                      {s.breakdown_terima?.length > 0 && (
                        <div className="tr-plan-col">
                          <div className="tr-plan-title">
                            <MapPin size={13} color="#16a34a" /> Diterima per
                            Lokasi
                          </div>
                          {s.breakdown_terima.map((b, i) => (
                            <div className="tr-plan-row" key={i}>
                              <span>{b.lokasi}</span>
                              <b>{b.jumlah}</b>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="tr-card">
        <div className="tr-section-title">🕒 Aktivitas Terbaru (Live)</div>
        {(data?.activity || []).length === 0 && (
          <div className="tr-empty">Belum ada aktivitas.</div>
        )}
        {(data?.activity || []).map((a, i) => {
          const info = statusInfo(a.status);
          return (
            <div key={i} className="tr-activity-row">
              <div className="tr-activity-top">
                <span className={"tr-live-dot " + info.dotClass} />
                <span className={"tr-badge " + info.badgeClass}>
                  {info.label}
                </span>
                <span className="tr-activity-date">
                  {a.jam_kirim}
                  {a.jam_terima !== "-" ? ` → ${a.jam_terima}` : ""}
                </span>
              </div>
              <div className="tr-activity-body">
                <b>{a.mobil}</b> ({a.supir}) — {a.total_rak} rak
                {a.tipe === "rak_kosong"
                  ? `, ${a.total_palet} palet (KOSONG)`
                  : ""}
              </div>
              <div className="tr-activity-people">
                {a.operator_kirim} → {a.operator_terima}
              </div>
            </div>
          );
        })}
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
  .tr-dash-range { display: flex; gap: 8px; align-items: center; margin-bottom: 16px; }
  .tr-date-input { width: auto; padding: 8px 12px; border-radius: 10px;
    border: 1.5px solid #cbd5e1; background: #ffffff;
    color: #1e293b; font-weight: 600; font-size: 13px; }
  .tr-range-btn { padding: 8px 16px; border-radius: 999px; border: 1.5px solid #cbd5e1;
    background: #ffffff; color: #475569; font-weight: 700; font-size: 13px; cursor: pointer; }
  .tr-range-btn.active { background: #3b82f6; border-color: #3b82f6; color: #fff; }
  .tr-spin { animation: tr-spin 1s linear infinite; color: #2563eb; }
  @keyframes tr-spin { to { transform: rotate(360deg); } }
  .tr-kpi-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 16px; }
  .tr-kpi-card { background: #ffffff; border: 1px solid #e2e8f0;
    border-radius: 16px; padding: 16px; text-align: center; }
  .tr-kpi-value { font-size: 22px; font-weight: 800; color: #1e293b; margin-top: 6px; }
  .tr-kpi-label { font-size: 11px; color: #64748b; font-weight: 700; margin-top: 2px;
    text-transform: uppercase; }
  .tr-section-title { font-weight: 800; font-size: 14px; color: #1e293b; margin-bottom: 12px;
    display: flex; align-items: center; justify-content: space-between; }
  .tr-shift-trip { font-size: 11px; font-weight: 700; color: #16a34a; text-transform: none; }
  .tr-shift-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .tr-shift-cell { background: #f8fafc; border: 1px solid #f1f5f9;
    border-radius: 12px; padding: 12px; text-align: center; }
  .tr-shift-value { font-size: 20px; font-weight: 800; color: #1e293b; margin-top: 4px; }
  .tr-shift-label { font-size: 10px; color: #64748b; font-weight: 700; margin-top: 2px;
    text-transform: uppercase; }
  .tr-empty { text-align: center; color: #64748b; font-size: 13px; padding: 16px 0; }
  .tr-activity-row { padding: 10px 0; border-bottom: 1px solid #f1f5f9; }
  .tr-activity-row:last-child { border-bottom: none; }
  .tr-activity-top { display: flex; justify-content: flex-start; align-items: center;
    gap: 8px; margin-bottom: 4px; }
  .tr-activity-date { font-size: 11px; color: #64748b; font-weight: 600; margin-left: auto; }
  .tr-activity-body { font-size: 13px; color: #1e293b; }
  .tr-activity-people { font-size: 11px; color: #475569; margin-top: 2px; }
  .tr-live-dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; flex-shrink: 0;
    box-shadow: 0 0 0 0 rgba(34,197,94,0.7); animation: tr-pulse-green 1.6s infinite; }
  .tr-live-dot-diterima { background: #22c55e; animation: tr-pulse-green 1.6s infinite; }
  .tr-live-dot-kirim { background: #f59e0b; animation: tr-pulse-amber 1.6s infinite; }
  @keyframes tr-pulse-green {
    0% { box-shadow: 0 0 0 0 rgba(34,197,94,0.6); }
    70% { box-shadow: 0 0 0 7px rgba(34,197,94,0); }
    100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
  }
  @keyframes tr-pulse-amber {
    0% { box-shadow: 0 0 0 0 rgba(245,158,11,0.6); }
    70% { box-shadow: 0 0 0 7px rgba(245,158,11,0); }
    100% { box-shadow: 0 0 0 0 rgba(245,158,11,0); }
  }
  .tr-badge { font-size: 10px; font-weight: 800; padding: 3px 10px; border-radius: 999px;
    text-transform: uppercase; }
  .tr-badge-kirim { background: #fef3c7; color: #b45309; }
  .tr-badge-diterima { background: #dcfce7; color: #15803d; }

  .tr-vehicle-row { display: flex; align-items: center; gap: 8px; padding: 8px 0;
    border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #1e293b; }
  .tr-vehicle-row:last-child { border-bottom: none; }
  .tr-vehicle-meta { margin-left: auto; font-size: 11px; color: #475569; font-weight: 600; }
  .tr-vehicle-trip { color: #16a34a; font-weight: 800; }

  .tr-vehicle-row-shift { flex-direction: column; align-items: stretch; gap: 6px; }
  .tr-vehicle-row-top { display: flex; align-items: center; gap: 8px; }
  .tr-vehicle-shift-breakdown { display: flex; gap: 8px; padding-left: 22px; }
  .tr-vehicle-shift-chip { font-size: 11px; color: #475569; font-weight: 600;
    background: #ffffff; border: 1px solid #e2e8f0;
    border-radius: 999px; padding: 2px 9px; }
  .tr-vehicle-shift-chip b { color: #1e293b; }

  .tr-trip-accordion .tr-trip-header { border: none; padding: 4px 0 0; }
  .tr-trip-accordion.open .tr-trip-header { padding-bottom: 12px; margin-bottom: 12px;
    border-bottom: 1px solid #f1f5f9; }
  .tr-trip-accordion.open .tr-shift-chevron { transform: rotate(180deg); }
  .tr-trip-accordion .tr-shift-body { padding: 0; }

  .tr-activity-group { margin-bottom: 6px; }
  .tr-activity-group-title { font-size: 11px; font-weight: 800; color: #2563eb;
    text-transform: uppercase; letter-spacing: 0.03em; margin: 14px 0 4px;
    padding-bottom: 4px; border-bottom: 1px solid rgba(96,165,250,0.2); }
  .tr-activity-group:first-child .tr-activity-group-title { margin-top: 0; }

  .tr-shift-accordion .tr-section-title { margin-bottom: 8px; }
  .tr-shift-item { border: 1px solid #f1f5f9; border-radius: 12px;
    margin-bottom: 8px; overflow: hidden; background: #f8fafc; }
  .tr-shift-item:last-child { margin-bottom: 0; }
  .tr-shift-header { width: 100%; display: flex; align-items: center; justify-content: space-between;
    background: transparent; border: none; color: #1e293b; font-weight: 700; font-size: 13px;
    padding: 12px 14px; cursor: pointer; text-align: left; }
  .tr-shift-header-right { display: flex; align-items: center; gap: 10px; }
  .tr-shift-chevron { color: #64748b; transition: transform 0.2s; }
  .tr-shift-item.open .tr-shift-chevron { transform: rotate(180deg); }
  .tr-shift-item.open .tr-shift-header { border-bottom: 1px solid #f1f5f9; }
  .tr-shift-body { padding: 14px; }
  .tr-plan-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 12px; }
  .tr-plan-col { background: #f8fafc; border: 1px solid #f1f5f9;
    border-radius: 10px; padding: 10px 12px; }
  .tr-plan-title { display: flex; align-items: center; gap: 5px; font-size: 10px; font-weight: 800;
    color: #475569; text-transform: uppercase; margin-bottom: 6px; }
  .tr-plan-row { display: flex; justify-content: space-between; font-size: 12px; color: #1e293b;
    padding: 3px 0; }
  .tr-plan-row b { color: #fff; }
  @media (max-width: 640px) { .tr-kpi-grid { grid-template-columns: repeat(2, 1fr); }
    .tr-shift-grid { grid-template-columns: repeat(2, 1fr); }
    .tr-plan-grid { grid-template-columns: 1fr; } }
`;
