// src/pages/stok-opname-karawang/BarcodePage.jsx
// Tabel barcode dari hasil upload Detail All Karawang, diperkaya rackcode
// transfer dari database EDP dan kalkulasi in WH + week.
import { useEffect, useMemo, useState } from "react";
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
  Search,
} from "lucide-react";
import api from "../../api/axiosInstance";
import KarawangSubNav from "./KarawangSubNav";
import { karawangStyles } from "./karawangStyles";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

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

export default function KarawangBarcodePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [noData, setNoData] = useState(false);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    api
      .get("/stok-opname-karawang/batches/active")
      .then((res) => {
        const batch = res.data.data;
        if (!batch) {
          setNoData(true);
          setLoading(false);
          return null;
        }
        return api
          .get("/stok-opname-karawang/barcode-details", {
            params: { batch_id: batch.id },
          })
          .then((res2) => setData(res2.data.data));
      })
      .catch(() => setNoData(true))
      .finally(() => setLoading(false));
  }, []);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const items = data?.items || [];
    if (!q) return items;
    return items.filter((it) =>
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
    );
  }, [data, search]);

  // Grafik: jumlah barcode (baris = 1 pcs, lihat catatan level pcs di
  // KarawangController) dikelompokkan per in_wh, sumbernya tabel yang lagi
  // tampil (ikut kefilter search). Kode "-" (in_wh gak kebaca dari
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
    const orderedKeys = counts.has("-")
      ? [...knownKeys, "-"]
      : knownKeys;

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
    const batchName = (data?.batch?.nama_batch || "barcode-karawang")
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

      <div className="ko-header">
        <h1>Barcode Detail All Karawang</h1>
        <p>Barcode hasil upload, item, deskripsi EDP, transfer, in WH, week.</p>
      </div>

      {loading && (
        <div className="ko-empty">
          <Loader2 size={20} className="ko-spin" /> Memuat data barcode...
        </div>
      )}

      {!loading && noData && (
        <div className="ko-empty">
          Belum ada data. Upload dulu file Detail All Karawang di menu "Upload
          Data".
        </div>
      )}

      {!loading && data && (
        <>
          <div className="ko-batch-badge">
            <Barcode size={13} /> {data.batch.nama_batch}
          </div>

          <div className="ko-card">
            <h2 className="ko-chart-title">Jumlah Barcode per In WH</h2>
            {filteredItems.length === 0 ? (
              <div className="ko-empty">Tidak ada data untuk ditampilkan di grafik.</div>
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
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
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
    </div>
  );
}
