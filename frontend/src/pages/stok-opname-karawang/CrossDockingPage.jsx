// src/pages/stok-opname-karawang/CrossDockingPage.jsx
// "Mirror" halaman Monitoring Stock Cross Docking (web FGINVC terpisah),
// datanya ditarik lewat backend Karawang yang jadi proxy ke API Cross
// Docking (login + Bearer token, lihat backend/src/services/crossDockingClient.js).
// Kolom tabel & kartu total dirender dinamis dari field apapun yang
// dibalikin API-nya, biar gak perlu tau persis nama field di sana.
import { useState } from "react";
import { RefreshCw, Loader2, Download, Layers } from "lucide-react";
import api from "../../api/axiosInstance";
import KarawangSubNav from "./KarawangSubNav";
import { karawangStyles } from "./karawangStyles";

const VIEW_MODES = [
  { value: "byRack", label: "by Rack" },
  { value: "byItem", label: "by Item" },
];

const FILTER_MODES = [
  { value: "all", label: "All" },
  { value: "hold", label: "Holds" },
  { value: "oe", label: "OE" },
];

const STAT_COLORS = ["blue", "blue", "blue", "blue", "amber", "orange", "red", "red"];

// "totalHoldQc" / "TOTAL_HOLD_QC" -> "Total Hold Qc", biar enak dibaca
// sebagai judul kolom/kartu apapun konvensi penamaan field dari API-nya.
function humanizeKey(key) {
  const spaced = String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return spaced
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function formatCellValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return value.toLocaleString("id-ID");
  return String(value);
}

// Union kolom dari beberapa baris pertama (bukan cuma baris pertama),
// jaga-jaga kalau baris awal kebetulan gak punya semua field.
function collectColumns(rows, sampleSize = 30) {
  const columns = [];
  const seen = new Set();
  rows.slice(0, sampleSize).forEach((row) => {
    Object.keys(row || {}).forEach((key) => {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    });
  });
  return columns;
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function downloadCsv(rows, filenamePrefix) {
  if (!rows || rows.length === 0) return;
  const columns = collectColumns(rows);
  const csv = [columns, ...rows.map((r) => columns.map((c) => r[c]))]
    .map((row) => row.map(csvEscape).join(","))
    .join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function DynamicTable({ rows, emptyMessage }) {
  if (!rows || rows.length === 0) {
    return <div className="ko-empty">{emptyMessage}</div>;
  }
  const columns = collectColumns(rows);
  return (
    <div className="ko-table-scroll">
      <table className="ko-data-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col}>{humanizeKey(col)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx}>
              {columns.map((col) => (
                <td
                  key={col}
                  className={typeof row[col] === "number" ? "ko-mono" : undefined}
                >
                  {formatCellValue(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatsGrid({ totals }) {
  if (!totals) return null;
  const entries = Object.entries(totals).filter(
    ([, v]) => typeof v === "number" || typeof v === "string",
  );
  if (!entries.length) return null;
  return (
    <div className="ko-cd-stats-grid">
      {entries.map(([key, value], idx) => (
        <div
          key={key}
          className={`ko-cd-stat-card ko-cd-stat-${STAT_COLORS[idx % STAT_COLORS.length]}`}
        >
          <span className="ko-cd-stat-label">{humanizeKey(key)}</span>
          <strong className="ko-cd-stat-value">{formatCellValue(value)}</strong>
        </div>
      ))}
    </div>
  );
}

const EMPTY_FILTERS = { item: "", rackcode: "", barcode: "", weekFrom: "", weekTo: "" };

export default function CrossDockingPage() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [viewMode, setViewMode] = useState("byRack");
  const [filterMode, setFilterMode] = useState("all");

  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [summaryRows, setSummaryRows] = useState([]);
  const [totals, setTotals] = useState(null);

  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRows, setDetailRows] = useState(null); // null = belum pernah diminta

  const setFilterField = (key) => (e) =>
    setFilters((prev) => ({ ...prev, [key]: e.target.value }));

  const queryParams = () => ({
    item: filters.item.trim() || undefined,
    rackcode: filters.rackcode.trim() || undefined,
    barcode: filters.barcode.trim() || undefined,
    weekFrom: filters.weekFrom.trim() || undefined,
    weekTo: filters.weekTo.trim() || undefined,
    filterMode,
  });

  const handleRefresh = async () => {
    setLoading(true);
    setError("");
    setDetailRows(null); // filter berubah, detail all lama udah gak nyambung
    try {
      const [summaryRes, totalsRes] = await Promise.all([
        api.get("/stok-opname-karawang/cross-docking/summary", {
          params: { viewMode, ...queryParams() },
        }),
        api.get("/stok-opname-karawang/cross-docking/totals", {
          params: queryParams(),
        }),
      ]);
      setSummaryRows(summaryRes.data?.data || []);
      setTotals(totalsRes.data?.data || null);
      setLoaded(true);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Gagal mengambil data dari Cross Docking. Cek koneksi jaringan / kredensial CROSS_DOCKING_* di backend.",
      );
      setSummaryRows([]);
      setTotals(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadDetailAll = async () => {
    setDetailLoading(true);
    setError("");
    try {
      const res = await api.get("/stok-opname-karawang/cross-docking/detail-all", {
        params: queryParams(),
      });
      setDetailRows(res.data?.data || []);
    } catch (err) {
      setError(err.response?.data?.message || "Gagal mengambil data Detail All.");
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="ko-page ko-page-wide">
      <style>{karawangStyles}</style>
      <KarawangSubNav />

      <div className="ko-header">
        <h1>Monitoring Stock Cross Docking</h1>
        <p>
          Data per rack/item, total, dan detail all — ditarik langsung dari web
          Cross Docking.
        </p>
      </div>

      <div className="ko-card">
        <div className="ko-cd-filter-grid">
          <div className="ko-cd-field">
            <label className="ko-field-label">Item prefix</label>
            <input
              className="ko-text-input"
              value={filters.item}
              onChange={setFilterField("item")}
              placeholder="Item prefix"
            />
          </div>
          <div className="ko-cd-field">
            <label className="ko-field-label">Rackcode prefix</label>
            <input
              className="ko-text-input"
              value={filters.rackcode}
              onChange={setFilterField("rackcode")}
              placeholder="Rackcode prefix"
            />
          </div>
          <div className="ko-cd-field">
            <label className="ko-field-label">Barcode / Note</label>
            <input
              className="ko-text-input"
              value={filters.barcode}
              onChange={setFilterField("barcode")}
              placeholder="Barcode / Note"
            />
          </div>
          <div className="ko-cd-field">
            <label className="ko-field-label">Week From</label>
            <input
              className="ko-text-input"
              value={filters.weekFrom}
              onChange={setFilterField("weekFrom")}
              placeholder="YYWW"
            />
          </div>
          <div className="ko-cd-field">
            <label className="ko-field-label">Week To</label>
            <input
              className="ko-text-input"
              value={filters.weekTo}
              onChange={setFilterField("weekTo")}
              placeholder="YYWW"
            />
          </div>
        </div>

        <div className="ko-cd-options-row">
          <div className="ko-radio-group">
            {VIEW_MODES.map((opt) => (
              <label key={opt.value} className="ko-radio-option">
                <input
                  type="radio"
                  name="viewMode"
                  checked={viewMode === opt.value}
                  onChange={() => setViewMode(opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>
          <div className="ko-radio-group">
            {FILTER_MODES.map((opt) => (
              <label key={opt.value} className="ko-radio-option">
                <input
                  type="radio"
                  name="filterMode"
                  checked={filterMode === opt.value}
                  onChange={() => setFilterMode(opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>
          <button
            className="ko-btn-primary ko-cd-refresh-btn"
            onClick={handleRefresh}
            disabled={loading}
          >
            {loading ? (
              <Loader2 size={16} className="ko-spin" />
            ) : (
              <RefreshCw size={16} />
            )}
            Refresh
          </button>
        </div>
      </div>

      {error && <div className="ko-cd-error">{error}</div>}

      {!loaded && !loading && !error && (
        <div className="ko-empty">
          Isi filter lalu klik Refresh untuk menampilkan data stock.
        </div>
      )}

      {loading && (
        <div className="ko-empty">
          <Loader2 size={20} className="ko-spin" /> Memuat data dari Cross
          Docking...
        </div>
      )}

      {!loading && loaded && (
        <>
          <StatsGrid totals={totals} />

          <div className="ko-card">
            <div className="ko-chart-header">
              <h2 className="ko-chart-title">
                Ringkasan Stock ({viewMode === "byRack" ? "per Rack" : "per Item"})
              </h2>
              <button
                className="ko-btn-secondary ko-btn-download"
                onClick={() => downloadCsv(summaryRows, "cross-docking-summary")}
                disabled={summaryRows.length === 0}
              >
                <Download size={16} /> Export CSV
              </button>
            </div>
            <DynamicTable rows={summaryRows} emptyMessage="Tidak ada data summary." />
          </div>

          <div className="ko-card">
            <div className="ko-chart-header">
              <h2 className="ko-chart-title">Detail All</h2>
              <div className="ko-cd-detail-actions">
                {detailRows && detailRows.length > 0 && (
                  <button
                    className="ko-btn-secondary ko-btn-download"
                    onClick={() => downloadCsv(detailRows, "cross-docking-detail-all")}
                  >
                    <Download size={16} /> Export CSV
                  </button>
                )}
                <button
                  className="ko-btn-secondary"
                  onClick={handleLoadDetailAll}
                  disabled={detailLoading}
                >
                  {detailLoading ? (
                    <Loader2 size={16} className="ko-spin" />
                  ) : (
                    <Layers size={16} />
                  )}
                  {detailRows ? "Muat Ulang Detail" : "Tampilkan Detail All"}
                </button>
              </div>
            </div>
            {detailRows === null ? (
              <div className="ko-empty">
                Klik "Tampilkan Detail All" untuk memuat data detail (bisa
                banyak baris, jadi gak otomatis kebuka bareng Refresh).
              </div>
            ) : (
              <DynamicTable rows={detailRows} emptyMessage="Tidak ada data detail." />
            )}
          </div>
        </>
      )}
    </div>
  );
}
