// src/pages/stok-opname-karawang/CrossDockingPage.jsx
// "Mirror" halaman Monitoring Stock Cross Docking (web FGINVC terpisah),
// datanya ditarik lewat backend Karawang yang jadi proxy ke API Cross
// Docking (login + Bearer token, lihat backend/src/services/crossDockingClient.js).
// Kolom tabel & kartu total dirender dinamis dari field apapun yang
// dibalikin API-nya, biar gak perlu tau persis nama field di sana.
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  RefreshCw,
  Loader2,
  Download,
  Layers,
  Printer,
  X,
  ArrowDownWideNarrow,
} from "lucide-react";
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

// Ambil nilai field dari row biarpun casing/gaya penamaan field API-nya
// beda dari yang kita tebak (rackcode / RACKCODE / rackCode / RackCode),
// biar kolom "Detail All" yang formatnya udah dipatok gak gampang blank
// gara-gara mismatch huruf besar-kecil doang.
function getFieldValue(row, key) {
  if (!row) return undefined;
  if (row[key] !== undefined) return row[key];
  const upper = key.toUpperCase();
  if (row[upper] !== undefined) return row[upper];
  const lower = key.toLowerCase();
  if (row[lower] !== undefined) return row[lower];
  const camel = key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
  if (row[camel] !== undefined) return row[camel];
  const pascal = camel.charAt(0).toUpperCase() + camel.slice(1);
  if (row[pascal] !== undefined) return row[pascal];
  return undefined;
}

// Struktur kolom "Detail All" buat TAMPILAN WEB, dipatok manual (bukan
// auto dari field API) biar sama persis kayak web Cross Docking aslinya:
// Rackcode, Barcode, Item, Cur Week, Probcode, Judge, Location, lalu 4
// kolom Hold (QC/QA/QAA/RND). TANPA Bc Collie — field itu gak ada di
// respons /stock-cd/detail-all bawaan, dan nyari-in buat semua baris di
// tabel web bakal lambat (di lapangan datanya bisa ribuan baris). Bc
// Collie cuma ditarik pas Export CSV (lihat DETAIL_ALL_EXPORT_COLUMNS +
// handleExportDetailAllCsv), bukan buat tampilan langsung.
const DETAIL_ALL_COLUMNS = [
  { key: "rackcode", label: "Rackcode" },
  { key: "barcode", label: "Barcode" },
  { key: "item", label: "Item" },
  { key: "curweek", label: "Cur Week" },
  { key: "probcode", label: "Probcode" },
  { key: "jdge", label: "Judge" },
  { key: "loccode", label: "Location" },
  { key: "hold_reason1", label: "Hold QC" },
  { key: "hold_reason2", label: "Hold QA" },
  { key: "hold_reason3", label: "Hold QAA" },
  { key: "hold_reason4", label: "Hold RND" },
];

// Sama kayak DETAIL_ALL_COLUMNS, tapi khusus buat CSV export: nyelipin
// kolom Collie (field aslinya bc_collie) tepat setelah Barcode.
const DETAIL_ALL_EXPORT_COLUMNS = [
  { key: "rackcode", label: "Rackcode" },
  { key: "barcode", label: "Barcode" },
  { key: "bc_collie", label: "Collie" },
  { key: "item", label: "Item" },
  { key: "curweek", label: "Cur Week" },
  { key: "probcode", label: "Probcode" },
  { key: "jdge", label: "Judge" },
  { key: "loccode", label: "Location" },
  { key: "hold_reason1", label: "Hold QC" },
  { key: "hold_reason2", label: "Hold QA" },
  { key: "hold_reason3", label: "Hold QAA" },
  { key: "hold_reason4", label: "Hold RND" },
];

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

// `columns` opsional: kalau dikasih (array {key,label}), CSV-nya ikut
// urutan & label itu (dipake buat Detail All). Kalau enggak, kolomnya
// auto dari field yang ada di data (dipake buat Ringkasan/Summary).
function downloadCsv(rows, filenamePrefix, columns) {
  if (!rows || rows.length === 0) return;
  const cols = columns ? columns.map((c) => c.key) : collectColumns(rows);
  const headerRow = columns ? columns.map((c) => c.label) : cols;
  const getValue = columns
    ? (row, key) => getFieldValue(row, key)
    : (row, key) => row[key];
  const csv = [headerRow, ...rows.map((r) => cols.map((c) => getValue(r, c)))]
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
function DetailAllModal({
  rows,
  loading,
  note,
  exporting,
  onClose,
  onExportCsv,
}) {
  const showTable = rows !== null && rows.length > 0;
  const truncated = showTable && rows.length > MAX_TABLE_RENDER_ROWS;
  const visibleRows = showTable
    ? truncated
      ? rows.slice(0, MAX_TABLE_RENDER_ROWS)
      : rows
    : [];

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
              disabled={!showTable || exporting}
              title="CSV yang di-download ikut menyertakan kolom Bc Collie"
            >
              {exporting ? (
                <Loader2 size={16} className="ko-spin" />
              ) : (
                <Download size={16} />
              )}
              {exporting ? "Menyiapkan CSV..." : "Export CSV"}
            </button>
          </div>

          {exporting && (
            <div className="ko-cd-truncate-notice">
              Lagi narik data Bc Collie buat semua baris — bisa makan waktu
              beberapa menit kalau kombinasi rack/item-nya banyak. Jangan tutup
              halaman ini dulu.
            </div>
          )}

          {loading && (
            <div className="ko-empty">
              <Loader2 size={20} className="ko-spin" /> Memuat data detail...
            </div>
          )}

          {!loading && note && (
            <div className="ko-cd-truncate-notice">{note}</div>
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
                    {DETAIL_ALL_COLUMNS.map((col) => (
                      <th key={col.key}>{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row, idx) => (
                    <tr key={idx}>
                      {DETAIL_ALL_COLUMNS.map((col) => {
                        const value = getFieldValue(row, col.key);
                        return (
                          <td
                            key={col.key}
                            className={
                              typeof value === "number" ? "ko-mono" : undefined
                            }
                          >
                            {formatCellValue(value)}
                          </td>
                        );
                      })}
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

export default function TransferPlanPage() {
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
  const [detailNote, setDetailNote] = useState(""); // info non-fatal, mis. Bc Collie dilewati
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

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
    setDetailNote("");
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

  // Export CSV Detail All: fetch ULANG dari endpoint export khusus (bukan
  // pake detailRows yang lagi tampil di tabel), soalnya di endpoint ini
  // bc_collie di-enrich buat SEMUA baris tanpa batas jumlah kombinasi —
  // bisa makan waktu lumayan lama kalau datanya ribuan baris, makanya
  // dipisah dari tampilan tabel biar tabelnya sendiri tetep cepat.
  const handleExportDetailAllCsv = async () => {
    if (!detailChecked && !hasAnyFilter) {
      setError(
        'Minimal isi satu filter (Item / Rackcode / Barcode / Week), atau centang "Detail" dulu sebelum export.',
      );
      return;
    }
    setError("");
    setExportingCsv(true);
    try {
      const res = await api.get(
        "/stok-opname-karawang/cross-docking/detail-all-export",
        {
          params: queryParams(),
          timeout: 5 * 60 * 1000, // 5 menit — bisa lama kalau kombinasi rack+item banyak
        },
      );
      const exportRows = res.data?.data || [];
      const meta = res.data?.meta;
      downloadCsv(
        exportRows,
        "cross-docking-detail-all",
        DETAIL_ALL_EXPORT_COLUMNS,
      );
      if (
        meta &&
        meta.bcCollieEnriched === false &&
        meta.bcCollieSkippedReason
      ) {
        setDetailNote(meta.bcCollieSkippedReason);
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Gagal menyiapkan file CSV (termasuk Bc Collie). Coba lagi, atau persempit filter kalau datanya kebanyakan.",
      );
    } finally {
      setExportingCsv(false);
    }
  };

  return (
    <div className="ko-page ko-page-wide">
      <style>{karawangStyles}</style>
      <KarawangSubNav />

      <div className="ko-cd-title-row">
        <div className="ko-header">
          <h1>Transfer Plan</h1>
          <p>
            Form input transaksi transfer dan retur barang antar lokasi gudang.
          </p>
        </div>
      </div>
    </div>
  );
}
