// src/pages/stok-opname-karawang/CrossDockingPage.jsx
// "Mirror" halaman Monitoring Stock Cross Docking (web FGINVC terpisah),
// datanya ditarik lewat backend Karawang yang jadi proxy ke API Cross
// Docking (login + Bearer token, lihat backend/src/services/crossDockingClient.js).
// Kolom tabel & kartu total dirender dinamis dari field apapun yang
// dibalikin API-nya, biar gak perlu tau persis nama field di sana.
import { useState } from "react";
import { RefreshCw, Loader2, Download, Layers, Printer, X } from "lucide-react";
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

const STAT_COLORS = [
  "blue",
  "blue",
  "blue",
  "blue",
  "amber",
  "orange",
  "red",
  "red",
];

// Batas jumlah baris yang beneran di-render ke <table>. Query tanpa filter
// (mis. Detail All pas checkbox "Detail" dicentang tanpa filter lain) bisa
// balikin puluhan ribu baris — nge-render semuanya ke HTML table bikin
// browser nge-hang/berasa "gak nampil apa-apa". CSV export tetap ambil
// SEMUA baris (gak kepotong), cuma tampilan tabelnya yang dibatasi.
const MAX_TABLE_RENDER_ROWS = 2000;

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

// Buka window baru berisi tabel HTML polos lalu langsung trigger dialog
// print browser — dipake tombol "Print Stock" biar hasilnya rapi tanpa
// ikut ke-print sidebar/filter/dll dari halaman utama.
function printRows(rows, title) {
  if (!rows || rows.length === 0) return;
  const columns = collectColumns(rows);
  const headHtml = columns.map((c) => `<th>${humanizeKey(c)}</th>`).join("");
  const bodyHtml = rows
    .map(
      (row) =>
        `<tr>${columns
          .map((c) => `<td>${formatCellValue(row[c])}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<title>${title}</title>
<style>
  body { font-family: Arial, sans-serif; padding: 16px; }
  h1 { font-size: 16px; margin-bottom: 4px; }
  p { font-size: 12px; color: #555; margin-top: 0; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; }
  th, td { border: 1px solid #ccc; padding: 4px 8px; text-align: left; }
  th { background: #f0f0f0; }
</style>
</head>
<body>
  <h1>${title}</h1>
  <p>Dicetak ${new Date().toLocaleString("id-ID")}</p>
  <table><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>
</body></html>`;
  const printWindow = window.open("", "_blank", "width=1000,height=700");
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
  };
}

function DynamicTable({ rows, emptyMessage }) {
  if (!rows || rows.length === 0) {
    return <div className="ko-empty">{emptyMessage}</div>;
  }
  const truncated = rows.length > MAX_TABLE_RENDER_ROWS;
  const visibleRows = truncated ? rows.slice(0, MAX_TABLE_RENDER_ROWS) : rows;
  const columns = collectColumns(visibleRows);
  return (
    <>
      {truncated && (
        <div className="ko-cd-truncate-notice">
          Menampilkan {MAX_TABLE_RENDER_ROWS.toLocaleString("id-ID")} dari{" "}
          {rows.length.toLocaleString("id-ID")} baris (biar browser gak
          nge-hang). Data lengkapnya tetep kebawa kalau lo klik Export CSV.
        </div>
      )}
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
            {visibleRows.map((row, idx) => (
              <tr key={idx}>
                {columns.map((col) => (
                  <td
                    key={col}
                    className={
                      typeof row[col] === "number" ? "ko-mono" : undefined
                    }
                  >
                    {formatCellValue(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// Modal "Detail All" — nyontek tampilan web sumber: header biru gelap +
// tombol close, Export CSV di pojok kanan atas, tabel dengan header sticky
// & scroll internal sendiri (gak ikut scroll halaman penuh).
function DetailAllModal({ rows, loading, onClose, onExportCsv }) {
  const showTable = rows !== null && rows.length > 0;
  const truncated = showTable && rows.length > MAX_TABLE_RENDER_ROWS;
  const visibleRows = showTable
    ? truncated
      ? rows.slice(0, MAX_TABLE_RENDER_ROWS)
      : rows
    : [];
  const columns = showTable ? collectColumns(visibleRows) : [];

  return (
    <div className="ko-cd-modal-backdrop" onClick={onClose}>
      <div className="ko-cd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ko-cd-modal-header">
          <h2>Detail All</h2>
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
          <div className="ko-cd-modal-toolbar">
            <button
              className="ko-btn-secondary ko-btn-download"
              onClick={onExportCsv}
              disabled={!showTable}
            >
              <Download size={16} /> Export CSV
            </button>
          </div>

          {loading && (
            <div className="ko-empty">
              <Loader2 size={20} className="ko-spin" /> Memuat data detail...
            </div>
          )}

          {!loading && truncated && (
            <div className="ko-cd-truncate-notice">
              Menampilkan {MAX_TABLE_RENDER_ROWS.toLocaleString("id-ID")} dari{" "}
              {rows.length.toLocaleString("id-ID")} baris (biar browser gak
              nge-hang). Data lengkapnya tetep kebawa kalau lo klik Export CSV.
            </div>
          )}

          {!loading && !showTable && (
            <div className="ko-empty">Tidak ada data detail.</div>
          )}

          {!loading && showTable && (
            <div className="ko-cd-modal-table-scroll">
              <table className="ko-data-table">
                <thead>
                  <tr>
                    {columns.map((col) => (
                      <th key={col}>{humanizeKey(col)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row, idx) => (
                    <tr key={idx}>
                      {columns.map((col) => (
                        <td
                          key={col}
                          className={
                            typeof row[col] === "number" ? "ko-mono" : undefined
                          }
                        >
                          {formatCellValue(row[col])}
                        </td>
                      ))}
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

const EMPTY_FILTERS = {
  item: "",
  rackcode: "",
  barcode: "",
  weekFrom: "",
  weekTo: "",
};

export default function CrossDockingPage() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [viewMode, setViewMode] = useState("byRack");
  const [filterMode, setFilterMode] = useState("all");
  const [detailChecked, setDetailChecked] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [summaryRows, setSummaryRows] = useState([]);
  const [totals, setTotals] = useState(null);

  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRows, setDetailRows] = useState(null); // null = belum pernah diminta
  const [showDetailModal, setShowDetailModal] = useState(false);

  const setFilterField = (key) => (e) =>
    setFilters((prev) => ({ ...prev, [key]: e.target.value }));

  // Minimal isi satu filter (Item / Rackcode / Barcode / Week) sebelum
  // boleh narik data — query tanpa filter terlalu berat buat server sumber.
  const hasAnyFilter =
    filters.item.trim() !== "" ||
    filters.rackcode.trim() !== "" ||
    filters.barcode.trim() !== "" ||
    filters.weekFrom.trim() !== "" ||
    filters.weekTo.trim() !== "";

  const queryParams = () => ({
    item: filters.item.trim() || undefined,
    rackcode: filters.rackcode.trim() || undefined,
    barcode: filters.barcode.trim() || undefined,
    weekFrom: filters.weekFrom.trim() || undefined,
    weekTo: filters.weekTo.trim() || undefined,
    filterMode,
    detail: detailChecked ? "true" : undefined,
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
    // Detail All boleh jalan tanpa filter KALAU checkbox "Detail" dicentang
    // (pengecualian) — di luar itu tetep wajib isi minimal satu filter.
    if (!detailChecked && !hasAnyFilter) {
      setError(
        'Minimal isi satu filter (Item / Rackcode / Barcode / Week), atau centang "Detail" dulu sebelum menarik Detail All.',
      );
      return;
    }
    setError("");
    setShowDetailModal(true); // buka modal duluan, isinya nyusul (loading state)
    setDetailLoading(true);
    try {
      const res = await api.get(
        "/stok-opname-karawang/cross-docking/detail-all",
        {
          params: queryParams(),
        },
      );
      setDetailRows(res.data?.data || []);
    } catch (err) {
      setShowDetailModal(false);
      setError(
        err.response?.data?.message || "Gagal mengambil data Detail All.",
      );
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
          <label className="ko-radio-option ko-cd-detail-check">
            <input
              type="checkbox"
              checked={detailChecked}
              onChange={(e) => setDetailChecked(e.target.checked)}
            />
            Detail
          </label>
          <button
            className="ko-btn-primary ko-cd-refresh-btn"
            onClick={handleRefresh}
            disabled={loading || !hasAnyFilter}
            title={
              !hasAnyFilter
                ? "Isi minimal satu filter (Item / Rackcode / Barcode / Week) dulu"
                : undefined
            }
          >
            {loading ? (
              <Loader2 size={16} className="ko-spin" />
            ) : (
              <RefreshCw size={16} />
            )}
            Refresh
          </button>
        </div>

        <div className="ko-cd-actions-row">
          <button
            className="ko-btn-secondary ko-btn-download"
            onClick={() => downloadCsv(summaryRows, "cross-docking-summary")}
            disabled={summaryRows.length === 0}
          >
            <Download size={16} /> Export CSV
          </button>
          <button
            className="ko-btn-secondary"
            onClick={() =>
              printRows(summaryRows, "Monitoring Stock Cross Docking")
            }
            disabled={summaryRows.length === 0}
          >
            <Printer size={16} /> Print Stock
          </button>
          <button
            className="ko-btn-secondary"
            onClick={handleLoadDetailAll}
            disabled={detailLoading || (!hasAnyFilter && !detailChecked)}
            title={
              !hasAnyFilter && !detailChecked
                ? 'Isi minimal satu filter, atau centang "Detail" dulu'
                : undefined
            }
          >
            {detailLoading ? (
              <Loader2 size={16} className="ko-spin" />
            ) : (
              <Layers size={16} />
            )}
            {detailRows ? "Muat Ulang Detail" : "Detail All"}
          </button>
        </div>
      </div>

      {error && <div className="ko-cd-error">{error}</div>}

      {!hasAnyFilter && !loading && (
        <div className="ko-empty">
          Minimal isi satu filter (Item / Rackcode / Barcode / Week) sebelum
          Refresh — query tanpa filter terlalu berat untuk server.
        </div>
      )}

      {hasAnyFilter && !loaded && !loading && !error && (
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
                Ringkasan Stock (
                {viewMode === "byRack" ? "per Rack" : "per Item"})
              </h2>
            </div>
            <DynamicTable
              rows={summaryRows}
              emptyMessage="Tidak ada data summary."
            />
          </div>
        </>
      )}

      {showDetailModal && (
        <DetailAllModal
          rows={detailRows}
          loading={detailLoading}
          onClose={() => setShowDetailModal(false)}
          onExportCsv={() =>
            downloadCsv(detailRows, "cross-docking-detail-all")
          }
        />
      )}
    </div>
  );
}
