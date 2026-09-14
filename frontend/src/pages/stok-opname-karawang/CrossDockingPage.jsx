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

// Field lastupdated dari Cross Docking ditampilin apa adanya (dd/mm/yyyy,
// hh.mm.ss) biar konsisten sama gaya tampilan tanggal di web sumbernya.
function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const datePart = d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timePart = d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return `${datePart}, ${timePart}`;
}

// Age KRW = udah berapa hari item itu di Karawang, dihitung dari selisih
// lastupdated ke waktu sekarang (dibulatkan ke bawah). Server (endpoint
// /cross-docking/detail) udah ngirim field age_krw jadi ini cuma fallback
// kalau field itu belum ada.
function computeAgeKrw(lastupdated) {
  if (!lastupdated) return null;
  const d = new Date(lastupdated);
  if (Number.isNaN(d.getTime())) return null;
  const diffMs = Date.now() - d.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

// Kolom "Last Update" + "Age KRW" dipatok muncul TEPAT SETELAH "Loccode" di
// tabel Ringkasan Stock (dalam urutan itu), walaupun urutan aslinya (posisi
// key pertama kali muncul di data) naro-nya di paling belakang (field ini
// ditempelin belakangan lewat enrichSummaryWithLastUpdate, bukan dari API
// summary aslinya).
function reorderLastUpdateAfterLoccode(columns) {
  const extra = ["lastupdate", "age_krw"].filter((c) => columns.includes(c));
  if (!extra.length) return columns;
  const withoutExtra = columns.filter((c) => !extra.includes(c));
  const idxLoccode = withoutExtra.indexOf("loccode");
  if (idxLoccode === -1) return columns; // gak ada loccode, biarin apa adanya
  const result = [...withoutExtra];
  result.splice(idxLoccode + 1, 0, ...extra);
  return result;
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

// Urutin baris berdasarkan curweek dari yang PALING TUA (angka terkecil)
// duluan — format curweek biasanya YYWW (mis. 2634), jadi urut ascending
// numerik = dari minggu paling lama ke paling baru. Baris yang curweek-nya
// kosong/gak kebaca angka ditaro paling belakang.
function sortByCurweekOldestFirst(rows) {
  return [...rows].sort((a, b) => {
    const weekA = Number(getFieldValue(a, "curweek"));
    const weekB = Number(getFieldValue(b, "curweek"));
    const validA = Number.isFinite(weekA);
    const validB = Number.isFinite(weekB);
    if (!validA && !validB) return 0;
    if (!validA) return 1;
    if (!validB) return -1;
    return weekA - weekB;
  });
}

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

function DynamicTable({ rows, emptyMessage, onRowClick }) {
  if (!rows || rows.length === 0) {
    return <div className="ko-empty">{emptyMessage}</div>;
  }
  const truncated = rows.length > MAX_TABLE_RENDER_ROWS;
  const visibleRows = truncated ? rows.slice(0, MAX_TABLE_RENDER_ROWS) : rows;
  const columns = reorderLastUpdateAfterLoccode(collectColumns(visibleRows));
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
                <th key={col}>
                  {col === "lastupdate"
                    ? "Last Update"
                    : col === "age_krw"
                      ? "Age KRW"
                      : humanizeKey(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, idx) => (
              <tr
                key={idx}
                className={onRowClick ? "ko-cd-row-clickable" : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <td
                    key={col}
                    className={
                      typeof row[col] === "number" || col === "age_krw"
                        ? "ko-mono"
                        : undefined
                    }
                  >
                    {col === "lastupdate"
                      ? formatDateTime(row[col])
                      : col === "age_krw"
                        ? row[col] === null || row[col] === undefined
                          ? "-"
                          : `${Number(row[col]).toLocaleString("id-ID")} hari`
                        : formatCellValue(row[col])}
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

// Kolom modal detail per-baris (RACKCODE/ITEM), dibuka pas user klik salah
// satu baris tabel Ringkasan Stock. Struktur mirip DETAIL_ALL_COLUMNS,
// tapi field-nya dipatok sesuai yang diminta: Rackcode, Item, Curweek,
// Collie, Barcode, Last Update, Age KRW.
const ROW_DETAIL_COLUMNS = [
  { key: "rackcode", label: "Rackcode" },
  { key: "item", label: "Item" },
  { key: "curweek", label: "Cur Week" },
  { key: "bc_collie", label: "Collie" },
  { key: "barcode", label: "Barcode" },
  { key: "lastupdated", label: "Last Update" },
  { key: "age_krw", label: "Age KRW" },
];

// Modal "Detail: RACKCODE / ITEM" — popup pas salah satu baris di tabel
// Ringkasan Stock diklik. Beda dari DetailAllModal: datanya per SATU
// pasangan rackcode+item (bukan semua rack sekaligus), dan nampilin Age
// KRW = umur item itu di Karawang (hari) dihitung dari lastupdated.
function RowDetailModal({ pair, rows, loading, error, onClose }) {
  const showTable = rows !== null && rows.length > 0;
  return (
    <div className="ko-cd-modal-backdrop" onClick={onClose}>
      <div className="ko-cd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ko-cd-modal-header">
          <h2>
            Detail: {pair?.rackcode} / {pair?.item}
          </h2>
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
          {loading && (
            <div className="ko-empty">
              <Loader2 size={20} className="ko-spin" /> Memuat detail...
            </div>
          )}

          {!loading && error && <div className="ko-cd-error">{error}</div>}

          {!loading && !error && !showTable && (
            <div className="ko-empty">Tidak ada data detail.</div>
          )}

          {!loading && !error && showTable && (
            <div className="ko-cd-modal-table-scroll">
              <table className="ko-data-table">
                <thead>
                  <tr>
                    {ROW_DETAIL_COLUMNS.map((col) => (
                      <th key={col.key}>{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={idx}>
                      {ROW_DETAIL_COLUMNS.map((col) => {
                        if (col.key === "lastupdated") {
                          return (
                            <td key={col.key}>
                              {formatDateTime(row.lastupdated)}
                            </td>
                          );
                        }
                        if (col.key === "age_krw") {
                          const age =
                            row.age_krw ?? computeAgeKrw(row.lastupdated);
                          return (
                            <td key={col.key} className="ko-mono">
                              {age === null || age === undefined
                                ? "-"
                                : `${age.toLocaleString("id-ID")} hari`}
                            </td>
                          );
                        }
                        const value = row[col.key];
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

// Kolom tabel hasil cari Lokasi — beda dari DETAIL_ALL_COLUMNS (yang per
// pcs/baris), ini udah digroup per rackcode+item sama backend
// (CrossDockingController.locationSearch), jadi ada kolom Qty.
const LOCATION_COLUMNS = [
  { key: "loccode", label: "Lokasi" },
  { key: "rackcode", label: "Rackcode" },
  { key: "item", label: "Item" },
  { key: "deskripsi", label: "Deskripsi" },
  { key: "curweek_tertua", label: "Curweek Tertua" },
  { key: "qty", label: "Qty" },
];

// Modal "Cari Lokasi" — operator masukin kode loccode, hasilnya rackcode +
// item + deskripsi + qty apa aja yang ada di lokasi itu (digroup dari
// data Cross Docking). Bisa langsung dicetak (window.print, pola sama
// kayak Cetak RMB di TransferPlanPage).
function LocationModal({
  loccode,
  onLoccodeChange,
  onSearch,
  onClose,
  onPrint,
  loading,
  error,
  rows,
  searched,
  sampleHint,
}) {
  const showTable = rows !== null && rows.length > 0;
  return (
    <div className="ko-cd-modal-backdrop" onClick={onClose}>
      <div className="ko-cd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ko-cd-modal-header">
          <h2>Cari Lokasi</h2>
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
          <div
            className="ko-cd-modal-toolbar"
            style={{
              justifyContent: "flex-start",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <input
              className="ko-text-input"
              value={loccode}
              onChange={(e) => onLoccodeChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSearch();
              }}
              placeholder="Kode lokasi, bisa prefix (mis. DCK01-A)"
              style={{ flex: "1 1 200px", width: "auto", margin: 0 }}
              autoFocus
            />
            <button
              type="button"
              className="ko-btn-primary"
              onClick={onSearch}
              disabled={loading || !loccode.trim()}
              style={{
                width: "auto",
                margin: 0,
                padding: "10px 18px",
                flexShrink: 0,
              }}
            >
              {loading ? (
                <Loader2 size={16} className="ko-spin" />
              ) : (
                <Layers size={16} />
              )}
              Cari
            </button>
            {showTable && (
              <button
                type="button"
                className="ko-btn-secondary ko-btn-download"
                onClick={onPrint}
                style={{ width: "auto", flexShrink: 0 }}
              >
                <Printer size={16} /> Print
              </button>
            )}
          </div>

          {loading && (
            <div className="ko-empty">
              <Loader2 size={20} className="ko-spin" /> Mencari data lokasi...
            </div>
          )}

          {!loading && error && <div className="ko-cd-error">{error}</div>}

          {!loading && !error && searched && !showTable && (
            <div className="ko-empty">
              Gak ada barang ditemukan di lokasi ini.
              {sampleHint && sampleHint.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 12, color: "#64748b" }}>
                  Contoh kode lokasi yang ada di data (cek formatnya, mungkin
                  beda sama yang lo ketik):
                  <br />
                  {sampleHint.join(", ")}
                </div>
              )}
            </div>
          )}

          {!loading && !error && showTable && (
            <div className="ko-cd-modal-table-scroll">
              <table className="ko-data-table">
                <thead>
                  <tr>
                    {LOCATION_COLUMNS.map((col) => (
                      <th key={col.key}>{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={idx}>
                      {LOCATION_COLUMNS.map((col) => (
                        <td
                          key={col.key}
                          className={col.key === "qty" ? "ko-mono" : undefined}
                        >
                          {formatCellValue(row[col.key])}
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
  const [detailNote, setDetailNote] = useState(""); // info non-fatal, mis. Bc Collie dilewati
  const [summaryNote, setSummaryNote] = useState(""); // info non-fatal, mis. Last Update/Loccode dilewati
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

  // Modal detail per-baris (rackcode+item), dibuka pas baris tabel
  // Ringkasan Stock diklik.
  const [rowDetailPair, setRowDetailPair] = useState(null); // { rackcode, item } | null
  const [rowDetailRows, setRowDetailRows] = useState(null);
  const [rowDetailLoading, setRowDetailLoading] = useState(false);
  const [rowDetailError, setRowDetailError] = useState("");

  // Modal "Cari Lokasi" — cari isi 1 lokasi (loccode), independen dari
  // filter Item/Rackcode/Barcode/Week di halaman utama.
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locationCode, setLocationCode] = useState("");
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [locationRows, setLocationRows] = useState(null); // null = belum pernah cari
  const [locationSearched, setLocationSearched] = useState(false);
  const [locationSampleHint, setLocationSampleHint] = useState([]); // contoh loccode kalau gak ketemu

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
    setSummaryNote("");
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
      setSummaryRows(sortByCurweekOldestFirst(summaryRes.data?.data || []));
      setTotals(totalsRes.data?.data || null);
      setLoaded(true);
      const meta = summaryRes.data?.meta;
      if (
        meta &&
        meta.lastUpdateEnriched === false &&
        meta.lastUpdateSkippedReason
      ) {
        setSummaryNote(meta.lastUpdateSkippedReason);
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Gagal mengambil data dari Cross Docking. Cek koneksi jaringan / kredensial CROSS_DOCKING_* di backend.",
      );
      setSummaryRows([]);
      setTotals(null);
      setSummaryNote("");
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
      setDetailRows(sortByCurweekOldestFirst(res.data?.data || []));
    } catch (err) {
      setShowDetailModal(false);
      setError(
        err.response?.data?.message || "Gagal mengambil data Detail All.",
      );
    } finally {
      setDetailLoading(false);
    }
  };

  // Cari isi 1 lokasi (loccode) — independen dari filter halaman utama,
  // jalan lewat CrossDockingController.locationSearch di backend.
  const handleLocationSearch = async () => {
    const kode = locationCode.trim();
    if (!kode) return;
    setLocationLoading(true);
    setLocationError("");
    setLocationSearched(false);
    setLocationSampleHint([]);
    try {
      const res = await api.get(
        "/stok-opname-karawang/cross-docking/location",
        { params: { loccode: kode } },
      );
      setLocationRows(res.data?.data || []);
      setLocationSampleHint(res.data?.meta?.sampleLoccodes || []);
    } catch (err) {
      setLocationRows(null);
      setLocationError(
        err.response?.data?.message ||
          "Gagal mencari data lokasi. Cek koneksi jaringan / kredensial CROSS_DOCKING_* di backend.",
      );
    } finally {
      setLocationLoading(false);
      setLocationSearched(true);
    }
  };

  // Cetak hasil cari lokasi — window.print di tab baru, pola sama kayak
  // Cetak RMB di TransferPlanPage (buildRmbPrintHtml). 1 tabel menyatu
  // (bukan per halaman), tapi tiap ganti LOKASI dikasih warna
  // selang-seling (zebra per grup, bukan per baris) + nomor urut reset
  // dari 1 lagi tiap lokasi — biar batas antar lokasi keliatan jelas
  // walau tabelnya nyambung terus dari 1 lokasi ke lokasi lain (prefix
  // search bisa nangkep beberapa lokasi sekaligus, lihat locationSearch
  // di backend).
  const handlePrintLocation = () => {
    if (!locationRows || !locationRows.length) return;

    // Group per loccode — locationRows udah kesortir loccode asc dari
    // backend, jadi tinggal kelompokin baris yang loccode-nya berurutan
    // sama.
    const groups = [];
    locationRows.forEach((r) => {
      const loc = r.loccode || "-";
      const last = groups[groups.length - 1];
      if (last && last.loccode === loc) {
        last.rows.push(r);
      } else {
        groups.push({ loccode: loc, rows: [r] });
      }
    });

    const rowsHtml = groups
      .map((group, gIdx) => {
        const shade = gIdx % 2 === 0 ? "shade-a" : "shade-b";
        const bodyRows = group.rows
          .map(
            (r, idx) => `
      <tr class="${shade}">
        <td class="c">${idx + 1}</td>
        <td>${r.loccode || ""}</td>
        <td>${r.rackcode || ""}</td>
        <td>${r.item || ""}</td>
        <td>${r.deskripsi || ""}</td>
        <td class="c">${r.curweek_tertua || "-"}</td>
        <td class="r">${Number(r.qty || 0).toLocaleString("id-ID")}</td>
      </tr>`,
          )
          .join("");
        const subtotalQty = group.rows.reduce(
          (sum, r) => sum + (r.qty || 0),
          0,
        );
        const subtotalRow = `
      <tr class="${shade} subtotal">
        <td class="c"></td>
        <td colspan="4"></td>
        <td>Subtotal ${group.loccode}</td>
        <td class="r">${subtotalQty.toLocaleString("id-ID")}</td>
      </tr>`;
        return bodyRows + subtotalRow;
      })
      .join("");

    const totalQty = locationRows.reduce((sum, r) => sum + (r.qty || 0), 0);
    const now = new Date();
    const cetakPada = `${String(now.getDate()).padStart(2, "0")}/${String(
      now.getMonth() + 1,
    ).padStart(2, "0")}/${now.getFullYear()} ${String(now.getHours()).padStart(
      2,
      "0",
    )}:${String(now.getMinutes()).padStart(2, "0")}`;

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Lokasi ${locationCode}</title>
<style>
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; font-size: 12px; margin: 0; }
  .company { font-weight: 700; font-size: 15px; }
  .addr { font-size: 11px; margin-bottom: 12px; }
  h1 { font-size: 15px; margin: 10px 0 2px; }
  .meta { font-size: 11px; color: #475569; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #cbd5e1; padding: 5px 8px; font-size: 11px; }
  th { background: #f1f5f9; text-align: left; }
  td.c { text-align: center; width: 32px; }
  td.r, th.r { text-align: right; }
  tr.shade-a td { background: #ffffff; }
  tr.shade-b td { background: #eef2ff; }
  tr.subtotal td { font-weight: 700; border-top: 1.5px solid #94a3b8; background: #f8fafc !important; }
  tr.grand-total td { font-weight: 700; border-top: 2px solid #94a3b8; background: #e2e8f0 !important; }
</style>
</head>
<body>
  <div class="company">PT. GAJAH TUNGGAL TBK</div>
  <div class="addr">Gudang Ban Motor — DC Karawang</div>
  <h1>Isi Lokasi: ${locationCode}</h1>
  <div class="meta">Dicetak: ${cetakPada}</div>
  <table>
    <thead>
      <tr>
        <th class="c">No</th>
        <th>Lokasi</th>
        <th>Rackcode</th>
        <th>Item</th>
        <th>Deskripsi</th>
        <th class="c">Curweek Tertua</th>
        <th class="r">Qty</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
      <tr class="grand-total">
        <td class="c"></td>
        <td colspan="4"></td>
        <td>Grand Total</td>
        <td class="r">${totalQty.toLocaleString("id-ID")}</td>
      </tr>
    </tbody>
  </table>
</body>
</html>`;

    const printWindow = window.open("", "_blank", "width=1000,height=800");
    if (!printWindow) {
      setLocationError(
        "Gagal membuka jendela cetak. Pastikan popup tidak diblokir browser.",
      );
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  };

  // Klik baris di tabel Ringkasan Stock -> buka modal detail per
  // rackcode+item (rackcode, item, curweek, collie, barcode, last update,
  // age krw). Data ditarik on-demand (bukan sekaligus buat semua baris)
  // biar ringan.
  const handleRowClick = async (row) => {
    const rackcode = getFieldValue(row, "rackcode");
    const item = getFieldValue(row, "item");
    if (!rackcode || !item) return;
    setRowDetailPair({ rackcode, item });
    setRowDetailRows(null);
    setRowDetailError("");
    setRowDetailLoading(true);
    try {
      const res = await api.get("/stok-opname-karawang/cross-docking/detail", {
        params: { rackcode, item },
      });
      setRowDetailRows(res.data?.data || []);
    } catch (err) {
      setRowDetailError(
        err.response?.data?.message || "Gagal mengambil data detail.",
      );
    } finally {
      setRowDetailLoading(false);
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
      const exportRows = sortByCurweekOldestFirst(res.data?.data || []);
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
          <h1>Monitoring Stock Cross Docking</h1>
          <p>
            Data per rack/item, total, dan detail all — ditarik langsung dari
            web Cross Docking.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="ko-btn-secondary"
            onClick={() => {
              setShowLocationModal(true);
              setLocationRows(null);
              setLocationSearched(false);
              setLocationError("");
            }}
          >
            <Layers size={16} /> Location
          </button>
          <Link to="/karawang/fifo" className="ko-btn-primary ko-cd-fifo-btn">
            <ArrowDownWideNarrow size={16} /> Control FIFO
          </Link>
        </div>
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
            onClick={() =>
              downloadCsv(
                sortByCurweekOldestFirst(summaryRows),
                "cross-docking-summary",
              )
            }
            disabled={summaryRows.length === 0}
          >
            <Download size={16} /> Export CSV
          </button>
          <button
            className="ko-btn-secondary"
            onClick={() =>
              printRows(
                sortByCurweekOldestFirst(summaryRows),
                "Monitoring Stock Cross Docking",
              )
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
            {summaryNote && (
              <div className="ko-cd-truncate-notice">{summaryNote}</div>
            )}
            <DynamicTable
              rows={summaryRows}
              emptyMessage="Tidak ada data summary."
              onRowClick={handleRowClick}
            />
          </div>
        </>
      )}

      {showDetailModal && (
        <DetailAllModal
          rows={detailRows}
          loading={detailLoading}
          note={detailNote}
          exporting={exportingCsv}
          onClose={() => setShowDetailModal(false)}
          onExportCsv={handleExportDetailAllCsv}
        />
      )}

      {rowDetailPair && (
        <RowDetailModal
          pair={rowDetailPair}
          rows={rowDetailRows}
          loading={rowDetailLoading}
          error={rowDetailError}
          onClose={() => setRowDetailPair(null)}
        />
      )}

      {showLocationModal && (
        <LocationModal
          loccode={locationCode}
          onLoccodeChange={setLocationCode}
          onSearch={handleLocationSearch}
          onClose={() => setShowLocationModal(false)}
          onPrint={handlePrintLocation}
          loading={locationLoading}
          error={locationError}
          rows={locationRows}
          searched={locationSearched}
          sampleHint={locationSampleHint}
        />
      )}
    </div>
  );
}
