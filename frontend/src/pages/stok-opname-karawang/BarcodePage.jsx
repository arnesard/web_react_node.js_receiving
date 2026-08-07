// src/pages/stok-opname-karawang/BarcodePage.jsx
// Tabel barcode LANGSUNG dari Cross Docking (per baris/barcode, live),
// diperkaya deskripsi item dari EDP dan kalkulasi in WH + week dari
// rackcode. Sama kayak Dashboard "Refresh Data Cross Docking": query
// `/stock-cd/detail-all` TANPA filter itu berat buat server sumbernya,
// jadi CUMA jalan pas operator eksplisit klik tombol Refresh — kalau
// belum pernah ada yang klik refresh sama sekali, halaman ini nampilin
// ajakan buat klik refresh dulu (gak pernah nembak Cross Docking sendiri
// pas halaman dibuka/refresh browser biasa).
import { useEffect, useMemo, useState, useCallback } from "react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import {
  Barcode,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Search,
} from "lucide-react";
import api from "../../api/axiosInstance";
import KarawangSubNav from "./KarawangSubNav";
import { karawangStyles } from "./karawangStyles";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
);

const PAGE_SIZE = 50;

// "060826" (DDMMYY, lihat getInWhFromRackcode di KarawangController) ->
// "06/08/26" buat label chart yang gampang dibaca. Kalau formatnya gak
// sesuai (harusnya gak pernah kejadian, backend udah validasi), balikin
// apa adanya.
function formatInWh(inWh) {
  const kode = String(inWh || "").trim();
  const match = kode.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (!match) return kode;
  return `${match[1]}/${match[2]}/${match[3]}`;
}

// "060826" (DDMMYY) -> "2026-08-06" biar bisa dibandingin string-wise sama
// value dari <input type="date"> (YYYY-MM-DD). Balikin null kalau formatnya
// gak sesuai, biar gampang dibuang dari filter tanggal.
function inWhToIso(inWh) {
  const kode = String(inWh || "").trim();
  const match = kode.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (!match) return null;
  const [, dd, mm, yy] = match;
  return `20${yy}-${mm}-${dd}`;
}

// Format tanggal jadi dd/mm/yy + jam terpisah, konsisten sama Dashboard.
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

export default function KarawangBarcodePage() {
  const [batch, setBatch] = useState(null);
  const [noBatch, setNoBatch] = useState(false);
  const [initLoading, setInitLoading] = useState(true);

  const [data, setData] = useState(null); // payload dari /barcode-details-live
  const [loading, setLoading] = useState(false); // load biasa (pakai cache)
  const [refreshing, setRefreshing] = useState(false); // klik tombol Refresh
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const loadData = useCallback((batchId, refresh) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    return api
      .get("/stok-opname-karawang/barcode-details-live", {
        params: { batch_id: batchId, ...(refresh ? { refresh: "true" } : {}) },
      })
      .then((res) => setData(res.data.data))
      .catch((err) => {
        setError(
          err.response?.data?.message ||
            "Gagal mengambil data barcode. Coba lagi.",
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
        return loadData(b.id, false).finally(() => setInitLoading(false));
      })
      .catch(() => {
        setNoBatch(true);
        setInitLoading(false);
      });
  }, [loadData]);

  const busy = loading || refreshing;
  const fetchedAt = data?.fetched_at ? formatFetchedAt(data.fetched_at) : null;

  // Item yang tampil di tabel/CSV/grafik: gabungan filter search (rak,
  // barcode, item, deskripsi, transfer, in_wh, week) dan rentang tanggal
  // in_wh (dari-sampai). Kalau dateFrom/dateTo kosong, gak ada pembatasan
  // tanggal. Item dengan in_wh gak valid ("-") dibuang begitu salah satu
  // filter tanggal aktif, soalnya gak ada tanggalnya buat dibandingin.
  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const items = data?.items || [];

    const bySearch = q
      ? items.filter((it) =>
          [
            it.rak,
            it.barcode,
            it.item,
            it.deskripsi,
            it.transfer,
            it.in_wh,
            it.week,
          ]
            .join(" ")
            .toLowerCase()
            .includes(q),
        )
      : items;

    if (!dateFrom && !dateTo) return bySearch;
    return bySearch.filter((it) => {
      const iso = inWhToIso(it.in_wh);
      if (!iso) return false;
      if (dateFrom && iso < dateFrom) return false;
      if (dateTo && iso > dateTo) return false;
      return true;
    });
  }, [data, search, dateFrom, dateTo]);

  // Grafik: jumlah barcode (baris = 1 pcs, lihat catatan level pcs di
  // KarawangController) dikelompokkan per in_wh, sumbernya filteredItems
  // (ikut filter search + rentang tanggal). Kode "-" (in_wh gak kebaca dari
  // rackcode) dikelompokin terpisah dan ditaruh paling akhir.
  const inWhChartData = useMemo(() => {
    const counts = new Map();
    filteredItems.forEach((it) => {
      const key = it.in_wh || "-";
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    const knownKeys = [...counts.keys()]
      .filter((k) => k !== "-")
      .sort((a, b) => a.localeCompare(b));
    const orderedKeys = counts.has("-") ? [...knownKeys, "-"] : knownKeys;

    return {
      labels: orderedKeys.map((k) =>
        k === "-" ? "Tanpa In WH" : formatInWh(k),
      ),
      datasets: [
        {
          label: "Jumlah Barcode",
          data: orderedKeys.map((k) => counts.get(k)),
          backgroundColor: orderedKeys.map((k) =>
            k === "-" ? "#94a3b8" : "#3b82f6",
          ),
          borderRadius: 4,
        },
      ],
    };
  }, [filteredItems]);

  const pageCount = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, pageCount);
  const pageStart = filteredItems.length ? (safePage - 1) * PAGE_SIZE : 0;
  const pageEnd = Math.min(pageStart + PAGE_SIZE, filteredItems.length);
  const paginatedItems = filteredItems.slice(pageStart, pageEnd);

  const csvEscape = (value) => {
    const text = String(value ?? "");
    if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };

  const handleDownloadCsv = () => {
    const headers = [
      "Rak",
      "Barcode",
      "Item",
      "Deskripsi",
      "Transfer",
      "In WH",
      "Week",
    ];
    const rows = filteredItems.map((it) => [
      it.rak,
      it.barcode,
      it.item,
      it.deskripsi,
      it.transfer,
      it.in_wh,
      it.week,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map(csvEscape).join(","))
      .join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const batchName = (batch?.nama_batch || "barcode-karawang")
      .trim()
      .replace(/[^\w-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();
    link.href = url;
    link.download = `${batchName || "barcode-karawang"}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="ko-page ko-page-wide">
      <style>{karawangStyles}</style>
      <KarawangSubNav />

      <div className="ko-dashboard-title-row">
        <div className="ko-header">
          <h1>Barcode Detail All Karawang</h1>
          <p>
            Barcode langsung dari Cross Docking, item, deskripsi EDP, transfer,
            in WH, week.
          </p>
        </div>
        {!initLoading && !noBatch && batch && (
          <button
            type="button"
            className="ko-btn-secondary"
            onClick={() => loadData(batch.id, true)}
            disabled={busy}
          >
            {refreshing ? (
              <Loader2 size={13} className="ko-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
            Refresh Data Cross Docking
          </button>
        )}
      </div>

      {initLoading && (
        <div className="ko-empty">
          <Loader2 size={20} className="ko-spin" /> Memuat halaman barcode...
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
              <Loader2 size={20} className="ko-spin" /> Menarik semua barcode
              dari Cross Docking... (bisa agak lama, mohon tunggu)
            </div>
          )}

          {!refreshing && loading && (
            <div className="ko-empty">
              <Loader2 size={20} className="ko-spin" /> Memuat data barcode...
            </div>
          )}

          {!refreshing && !loading && error && (
            <div className="ko-empty">
              <AlertTriangle size={18} /> {error}
            </div>
          )}

          {!refreshing && !loading && !error && data && !data.has_data && (
            <div className="ko-card" style={{ textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "#475569", marginBottom: 10 }}>
                Belum ada data barcode Cross Docking yang ditarik. Klik tombol
                "Refresh Data Cross Docking" di atas buat mulai (bisa agak lama
                pertama kali, tergantung banyaknya stok se-DC).
              </div>
            </div>
          )}

          {!refreshing && !loading && !error && data && data.has_data && (
            <>
              <div className="ko-batch-badge">
                <Barcode size={13} /> {batch.nama_batch}
              </div>

              <div className="ko-card">
                <div className="ko-chart-header">
                  <h2 className="ko-chart-title">Jumlah Barcode per In WH</h2>
                  <div className="ko-date-filter">
                    <div className="ko-date-field">
                      <input
                        type="date"
                        className="ko-date-input"
                        value={dateFrom}
                        max={dateTo || undefined}
                        onChange={(e) => {
                          setDateFrom(e.target.value);
                          setCurrentPage(1);
                        }}
                        aria-label="Dari tanggal"
                      />
                    </div>
                    <span className="ko-date-sep">–</span>
                    <div className="ko-date-field">
                      <input
                        type="date"
                        className="ko-date-input"
                        value={dateTo}
                        min={dateFrom || undefined}
                        onChange={(e) => {
                          setDateTo(e.target.value);
                          setCurrentPage(1);
                        }}
                        aria-label="Sampai tanggal"
                      />
                    </div>
                    {(dateFrom || dateTo) && (
                      <button
                        type="button"
                        className="ko-date-reset"
                        onClick={() => {
                          setDateFrom("");
                          setDateTo("");
                          setCurrentPage(1);
                        }}
                        title="Reset filter tanggal"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
                {filteredItems.length === 0 ? (
                  <div className="ko-empty">
                    Tidak ada data untuk ditampilkan di grafik.
                  </div>
                ) : (
                  <div className="ko-chart-wrap">
                    <Bar
                      data={inWhChartData}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: { display: false },
                          tooltip: {
                            callbacks: {
                              label: (ctx) => `${ctx.parsed.y} barcode`,
                            },
                          },
                        },
                        scales: {
                          x: { title: { display: true, text: "In WH" } },
                          y: {
                            beginAtZero: true,
                            ticks: { precision: 0 },
                            title: { display: true, text: "Jumlah Barcode" },
                          },
                        },
                      }}
                    />
                  </div>
                )}
              </div>

              <div className="ko-card">
                <div className="ko-table-toolbar">
                  <label className="ko-search-wrap">
                    <Search size={16} />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setCurrentPage(1);
                      }}
                      placeholder="Cari barcode, item, deskripsi, transfer..."
                    />
                  </label>
                  <div className="ko-date-filter">
                    {(dateFrom || dateTo) && (
                      <button
                        type="button"
                        className="ko-date-reset"
                        onClick={() => {
                          setDateFrom("");
                          setDateTo("");
                          setCurrentPage(1);
                        }}
                        title="Reset filter tanggal"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                  <button
                    className="ko-btn-secondary ko-btn-download"
                    onClick={handleDownloadCsv}
                    disabled={filteredItems.length === 0}
                  >
                    <Download size={16} /> Download CSV
                  </button>
                </div>
                <div className="ko-table-info">
                  {filteredItems.length
                    ? `${pageStart + 1}-${pageEnd} dari ${filteredItems.length}`
                    : "0"}{" "}
                  barcode tampil, total {data.items.length}
                </div>
              </div>

              <div className="ko-table-card">
                <div className="ko-table-scroll">
                  <table className="ko-data-table">
                    <thead>
                      <tr>
                        <th>Rak</th>
                        <th>Barcode</th>
                        <th>Item</th>
                        <th>Deskripsi</th>
                        <th>Transfer</th>
                        <th>In WH</th>
                        <th>Week</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.length === 0 && (
                        <tr>
                          <td colSpan={7} className="ko-table-empty">
                            Data tidak ditemukan.
                          </td>
                        </tr>
                      )}
                      {paginatedItems.map((it, index) => (
                        <tr key={`${it.barcode}-${it.item}-${index}`}>
                          <td className="ko-mono">{it.rak}</td>
                          <td className="ko-mono">{it.barcode}</td>
                          <td className="ko-strong">{it.item}</td>
                          <td>{it.deskripsi}</td>
                          <td className="ko-mono">{it.transfer}</td>
                          <td className="ko-mono">{it.in_wh}</td>
                          <td>{it.week}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="ko-pagination">
                  <button
                    className="ko-page-btn"
                    onClick={() =>
                      setCurrentPage((page) => Math.max(1, page - 1))
                    }
                    disabled={safePage === 1}
                    title="Halaman sebelumnya"
                  >
                    <ChevronLeft size={16} /> Prev
                  </button>
                  <div className="ko-page-status">
                    Halaman {safePage} / {pageCount}
                  </div>
                  <button
                    className="ko-page-btn"
                    onClick={() =>
                      setCurrentPage((page) => Math.min(pageCount, page + 1))
                    }
                    disabled={safePage === pageCount}
                    title="Halaman berikutnya"
                  >
                    Next <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
