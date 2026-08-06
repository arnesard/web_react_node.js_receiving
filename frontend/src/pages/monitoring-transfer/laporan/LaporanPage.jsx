// src/pages/Transfer/Laporan.jsx
// Equivalen resources/views/MonitoringTransferRak/laporan.blade.php (Laravel)
import { useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import Swal from "sweetalert2";
import {
  Repeat,
  LayoutDashboard,
  FileText,
  X,
  Home,
  Settings,
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

const JENIS_BADGE = {
  Kirim: "tr-badge-kirim2",
  Terima: "tr-badge-terima2",
};

export default function TransferLaporan() {
  const today = todayJakarta();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [operator, setOperator] = useState("");
  const [supir, setSupir] = useState("");
  const [kendaraan, setKendaraan] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;

  const [operators, setOperators] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    api
      .get("/transfer-rak/laporan")
      .then((res) => {
        const d = res.data.data;
        setOperators(d.operators || []);
        setDrivers(d.drivers || []);
        setVehicles(d.vehicles || []);
      })
      .catch((err) => console.warn("Gagal ambil filter laporan:", err.message));
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/transfer-rak/laporan/data", {
        params: {
          start_date: startDate,
          end_date: endDate,
          operator,
          supir,
          kendaraan,
          page,
          limit,
        },
      });
      setRows(res.data.data.data || []);
      setTotal(res.data.data.total || 0);
      setTotalPages(res.data.data.total_pages || 1);
    } catch (err) {
      Swal.fire("Gagal", err.response?.data?.message || err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, operator, supir, kendaraan, page]);

  // Reset ke halaman 1 tiap filter (bukan page) berubah
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, operator, supir, kendaraan]);

  // Auto-load: gak perlu tombol "Cari" lagi, filter/page berubah langsung
  // ngefetch sendiri (debounce dikit biar gak spam request pas ganti tanggal
  // dgn cepat / lagi ngetik).
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData();
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, operator, supir, kendaraan, page]);

  const openDetail = async (id) => {
    try {
      const res = await api.get(`/transfer-rak/laporan/detail/${id}`);
      setDetail(res.data.data);
    } catch (err) {
      Swal.fire("Gagal", err.response?.data?.message || err.message, "error");
    }
  };

  const handleExport = () => {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      operator,
      supir,
      kendaraan,
    });
    const base = api.defaults.baseURL || "/api";
    window.open(
      `${base}/transfer-rak/laporan/export?${params.toString()}`,
      "_blank",
    );
  };

  return (
    <div className="tr-page tr-laporan-page">
      <style>{trStyles}</style>
      <TransferSubNav />

      <div className="tr-card">
        <div className="tr-filter-grid">
          <div>
            <label className="tr-label">Dari Tanggal</label>
            <input
              type="date"
              className="tr-input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="tr-label">Sampai Tanggal</label>
            <input
              type="date"
              className="tr-input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div>
            <label className="tr-label">Operator</label>
            <select
              className="tr-input"
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
            >
              <option value="">Semua</option>
              {operators.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="tr-label">Supir</label>
            <select
              className="tr-input"
              value={supir}
              onChange={(e) => setSupir(e.target.value)}
            >
              <option value="">Semua</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nama_karyawan}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="tr-label">Kendaraan</label>
            <select
              className="tr-input"
              value={kendaraan}
              onChange={(e) => setKendaraan(e.target.value)}
            >
              <option value="">Semua</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nama_kendaraan}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="tr-filter-actions">
          {loading && <span className="tr-loading-inline">Memuat...</span>}
          <button className="tr-btn-outline" onClick={handleExport}>
            ⬇ Export Excel
          </button>
        </div>
      </div>

      <div className="tr-card tr-table-card">
        <div className="tr-table-wrap">
          <table className="tr-table">
            <thead>
              <tr>
                <th>No</th>
                <th>Tanggal</th>
                <th>Operator</th>
                <th>Jenis</th>
                <th>Waktu</th>
                <th>Supir</th>
                <th>Kendaraan</th>
                <th>Rak</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.row_key}>
                  <td>{r.no}</td>
                  <td>{r.tanggal}</td>
                  <td>{r.operator}</td>
                  <td>
                    <span
                      className={"tr-badge " + (JENIS_BADGE[r.jenis] || "")}
                    >
                      {r.jenis}
                    </span>
                  </td>
                  <td>{r.waktu}</td>
                  <td>{r.supir}</td>
                  <td>{r.kendaraan}</td>
                  <td>{r.total_rak}</td>
                  <td>
                    <button
                      className="tr-btn-link"
                      onClick={() => openDetail(r.id)}
                    >
                      Detail
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={9} className="tr-empty">
                    Tidak ada data untuk filter ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <div className="tr-pagination">
            <span className="tr-pagination-info">
              {total} baris · Halaman {page} dari {totalPages}
            </span>
            <div className="tr-pagination-btns">
              <button
                className="tr-btn-outline"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ← Sebelumnya
              </button>
              <button
                className="tr-btn-outline"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Berikutnya →
              </button>
            </div>
          </div>
        )}
      </div>

      {detail && (
        <div className="tr-modal-overlay" onClick={() => setDetail(null)}>
          <div className="tr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tr-modal-header">
              <b>Detail Transfer</b>
              <button
                className="tr-modal-close"
                onClick={() => setDetail(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="tr-info-grid" style={{ marginBottom: 14 }}>
              <div>
                <span className="tr-info-label">Tanggal</span>
                <span className="tr-info-value">{detail.header.tanggal}</span>
              </div>
              <div>
                <span className="tr-info-label">Operator</span>
                <span className="tr-info-value">{detail.header.operator}</span>
              </div>
              <div>
                <span className="tr-info-label">Supir</span>
                <span className="tr-info-value">{detail.header.supir}</span>
              </div>
              <div>
                <span className="tr-info-label">Kendaraan</span>
                <span className="tr-info-value">{detail.header.kendaraan}</span>
              </div>
              <div>
                <span className="tr-info-label">Total</span>
                <span className="tr-info-value">{detail.header.total_rak}</span>
              </div>
              <div>
                <span className="tr-info-label">Durasi</span>
                <span className="tr-info-value">{detail.header.durasi}</span>
              </div>
              <div>
                <span className="tr-info-label">Status</span>
                <span className="tr-info-value">{detail.header.status}</span>
              </div>
              <div>
                <span className="tr-info-label">Catatan</span>
                <span className="tr-info-value">{detail.header.catatan}</span>
              </div>
            </div>

            <div className="tr-table-wrap" style={{ maxHeight: 320 }}>
              <table className="tr-table">
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Kode Rak</th>
                    <th>Item</th>
                    <th>Deskripsi</th>
                    <th>Qty</th>
                    <th>Kategori</th>
                    <th>Operator</th>
                    <th>Waktu Scan</th>
                    <th>Lokasi Terima</th>
                    <th>Waktu Terima</th>
                    <th>Penerima</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.details.map((d) => (
                    <tr key={d.no}>
                      <td>{d.no}</td>
                      <td>{d.kode_rak}</td>
                      <td>{d.item}</td>
                      <td>{d.deskripsi}</td>
                      <td>{d.qty}</td>
                      <td>{d.kategori}</td>
                      <td>{d.operator}</td>
                      <td>{d.waktu_scan}</td>
                      <td>{d.lokasi_terima}</td>
                      <td>{d.waktu_terima}</td>
                      <td>{d.penerima}</td>
                    </tr>
                  ))}
                  {detail.details.length === 0 && (
                    <tr>
                      <td colSpan={9} className="tr-empty">
                        Tidak ada rincian rak (transfer rak/palet kosong).
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const trStyles = `
  .tr-page { margin: 0 auto; padding: 20px 16px 40px; color: #1e293b; }
  .tr-laporan-page { max-width: 1100px; }
  .tr-subnav { display: flex; gap: 6px; margin-bottom: 16px;
    background: #ffffff; box-shadow: 0 1px 3px rgba(15,23,42,0.06);
    padding: 6px; border-radius: 14px; border: 1px solid #e2e8f0; max-width: 720px; }
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
  .tr-label { display: block; font-size: 12px; font-weight: 700; color: #475569;
    margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.02em; }
  .tr-input { width: 100%; padding: 9px 10px; border-radius: 9px;
    border: 1.5px solid #cbd5e1; background: #f1f5f9;
    color: #1e293b; font-size: 13px; outline: none; }
  .tr-input:focus { border-color: #3b82f6; background: #e2e8f0; }
  select.tr-input option { background: #ffffff; color: #1e293b; }
  .tr-filter-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
  .tr-filter-actions { display: flex; gap: 8px; margin-top: 16px; }
  .tr-btn-primary { padding: 10px 20px; border-radius: 10px; border: none;
    background: linear-gradient(135deg,#3b82f6,#2563eb); color: #fff; font-weight: 700;
    font-size: 13px; cursor: pointer; }
  .tr-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
  .tr-btn-outline { padding: 10px 20px; border-radius: 10px; border: 1.5px solid #3b82f6;
    background: rgba(59,130,246,0.08); color: #1d4ed8; font-weight: 700; font-size: 13px; cursor: pointer; }
  .tr-kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
  .tr-kpi-card { background: #ffffff; border: 1px solid #e2e8f0;
    border-radius: 16px; padding: 16px; text-align: center; }
  .tr-kpi-value { font-size: 20px; font-weight: 800; color: #1e293b; }
  .tr-kpi-percent { font-size: 20px; font-weight: 800; color: #2563eb; }
  .tr-kpi-label { font-size: 11px; color: #64748b; font-weight: 700; margin-top: 2px;
    text-transform: uppercase; }
  .tr-table-card { padding: 0; overflow: hidden; }
  .tr-table-wrap { overflow-x: auto; }
  .tr-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  .tr-table th { background: #ffffff; color: #475569; font-weight: 700; text-align: left;
    padding: 10px 12px; border-bottom: 1px solid #cbd5e1; white-space: nowrap; }
  .tr-table td { padding: 9px 12px; border-bottom: 1px solid #f1f5f9;
    white-space: nowrap; color: #1e293b; }
  .tr-table tr:hover td { background: #f8fafc; }
  .tr-empty { text-align: center; color: #64748b; padding: 20px !important; }
  .tr-btn-link { background: none; border: none; color: #2563eb; font-weight: 700;
    font-size: 12px; cursor: pointer; }
  .tr-badge { font-size: 10px; font-weight: 800; padding: 3px 10px; border-radius: 999px;
    text-transform: uppercase; }
  .tr-badge-proses { background: #fef3c7; color: #b45309; }
  .tr-badge-selesai { background: rgba(59,130,246,0.15); color: #1d4ed8; }
  .tr-badge-sebagian { background: #fef3c7; color: #b45309; }
  .tr-badge-diterima { background: #dcfce7; color: #15803d; }
  .tr-badge-batal { background: rgba(239,68,68,0.15); color: #b91c1c; }
  .tr-badge-kirim2 { background: #fef3c7; color: #b45309; }
  .tr-badge-terima2 { background: #dcfce7; color: #15803d; }

  .tr-loading-inline { font-size: 12px; color: #475569; font-weight: 600;
    align-self: center; margin-right: auto; }

  .tr-pagination { display: flex; align-items: center; justify-content: space-between;
    padding: 14px 4px 4px; flex-wrap: wrap; gap: 10px; }
  .tr-pagination-info { font-size: 12px; color: #475569; }
  .tr-pagination-btns { display: flex; gap: 8px; }
  .tr-pagination-btns .tr-btn-outline:disabled { opacity: 0.4; cursor: not-allowed; }
  .tr-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .tr-info-label { display: block; font-size: 11px; color: #64748b; font-weight: 700;
    text-transform: uppercase; }
  .tr-info-value { display: block; font-size: 13px; color: #1e293b; font-weight: 600; }
  .tr-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.55);
    display: flex; align-items: center; justify-content: center; z-index: 2000; padding: 16px; }
  .tr-modal { background: #ffffff; border: 1px solid #cbd5e1;
    border-radius: 18px; padding: 20px; max-width: 800px;
    width: 100%; max-height: 90vh; overflow-y: auto; color: #1e293b; }
  .tr-modal-header { display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 14px; font-size: 15px; }
  .tr-modal-close { background: none; border: none; cursor: pointer; color: #475569; }
  @media (max-width: 900px) {
    .tr-filter-grid { grid-template-columns: 1fr 1fr; }
    .tr-kpi-grid { grid-template-columns: 1fr 1fr; }
    .tr-info-grid { grid-template-columns: 1fr; }
  }
`;
