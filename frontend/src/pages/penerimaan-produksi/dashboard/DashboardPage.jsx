// src/pages/Dashboard/Index.jsx
import { useEffect, useState } from "react";
import { Line, Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import api from "../../../api/axiosInstance";
import { formatDateID, todayJakarta, addDaysJakarta } from "../../../utils/date";

console.log("Dashboard component loaded");

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

const PLANT_COLORS = {
  B: "#3b82f6",
  H: "#10b981",
  I: "#f59e0b",
  T: "#ef4444",
};
const CHART_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
];
// Fallback warna buat plant yang belum ada di PLANT_COLORS (mis. BPW1/2/3
// yang bakal nyusul) — dipilih konsisten berdasar urutan huruf plant-nya.
const getPlantColor = (plant) => {
  if (PLANT_COLORS[plant]) return PLANT_COLORS[plant];
  let hash = 0;
  for (let i = 0; i < plant.length; i++) hash += plant.charCodeAt(i);
  return CHART_COLORS[hash % CHART_COLORS.length];
};

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // State chart data
  const [trend7Data, setTrend7Data] = useState({ labels: [], datasets: [] });
  const [plantChartData, setPlantChartData] = useState({});
  const [perfData, setPerfData] = useState({});
  const [jobFilter7, setJobFilter7] = useState("all");
  const [jobFilterPlant, setJobFilterPlant] = useState("all");
  const [jobPerPlant, setJobPerPlant] = useState({});
  const [jobTypesPerPlant, setJobTypesPerPlant] = useState({});
  // Daftar plant sekarang diturunkan dari data aktual (perPlant) yang
  // dibalikin backend, bukan hardcode — otomatis nambah kalau ada plant
  // baru (BPW1/BPW2/BPW3 dll) tanpa perlu ubah kode ini lagi.
  const [plants, setPlants] = useState([]);

  // Filter tanggal umum: kartu statistik, Pencapaian Per Plant & Grup,
  // dan tabel data. Default hari ini kalau belum di-set.
  const [dateFrom, setDateFrom] = useState(todayJakarta());
  const [dateTo, setDateTo] = useState(todayJakarta());
  // Filter start date khusus buat chart Tren Produksi 7 Hari — otomatis
  // nampilin 7 hari dari tanggal ini. Default: 6 hari sebelum hari ini
  // (biar hasilnya sama kayak sebelumnya: 7 hari terakhir s/d hari ini).
  const [trendStart, setTrendStart] = useState(addDaysJakarta(todayJakarta(), -6));

  useEffect(() => {
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, trendStart]);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const res = await api.get("/dashboard", {
        params: {
          date_from: dateFrom,
          date_to: dateTo,
          trend_start: trendStart,
        },
      });
      const d = res.data.data;
      setData(d);
      setJobFilter7("all");
      setJobFilterPlant("all");

      const plantList = Object.keys(d.perPlant || {}).sort();
      setPlants(plantList);
      setJobTypesPerPlant(d.jobTypesPerPlant || {});

      // Build trend 7 hari chart
      buildTrend7Chart(d.trend7Days);

      // Build plant charts
      buildPlantCharts(d.perPlant);

      // Load individu default job — job paling sering dikerjain per plant
      // (dari backend), bukan job pertama secara global. Kalau plant itu
      // belum punya data 7 hari terakhir, fallback ke job global pertama.
      const newJobPerPlant = {};
      await Promise.all(
        plantList.map(async (p) => {
          const defaultJob =
            d.selectedJobPerPlant?.[p] || d.allJobTypes?.[0];
          if (!defaultJob) return;
          newJobPerPlant[p] = defaultJob;
          await loadIndividu(p, defaultJob);
        }),
      );
      setJobPerPlant(newJobPerPlant);
    } catch (err) {
      console.error("Dashboard error:", err);
    } finally {
      setLoading(false);
    }
  };

  const buildTrend7Chart = (trend7Days) => {
    setTrend7Data({
      labels: trend7Days.map((d) => d.date),
      datasets: [
        {
          label: "Total Produksi",
          data: trend7Days.map((d) => Number(d.total)),
          borderColor: "#0d6efd",
          backgroundColor: "rgba(13,110,253,0.1)",
          tension: 0.4,
          fill: true,
          pointRadius: 6,
          pointBackgroundColor: "#0d6efd",
        },
      ],
    });
  };

  const buildPlantCharts = (perPlant) => {
    const newPlantData = {};
    Object.keys(perPlant).forEach((p) => {
      const groupData = perPlant[p]?.perGroup || {};
      const keys = Object.keys(groupData);
      const values = Object.values(groupData);
      const max = Math.max(...values);
      const min = Math.min(...values);

      newPlantData[p] = {
        labels: keys,
        datasets: [
          {
            data: values,
            backgroundColor: values.map((v) =>
              v === max
                ? "#10b981"
                : v === min && values.length > 1
                  ? "#ef4444"
                  : "#f59e0b",
            ),
            borderRadius: 4,
          },
        ],
      };
    });
    setPlantChartData(newPlantData);
  };

  const loadIndividu = async (plant, job) => {
    if (!job) return;
    try {
      const res = await api.get("/dashboard/individu", {
        params: { plant, job },
      });
      const { dates, series } = res.data.data;
      const names = Object.keys(series);

      setPerfData((prev) => ({
        ...prev,
        [plant]: {
          labels: dates,
          datasets: names.map((name, idx) => ({
            label: name,
            data: series[name],
            borderColor: CHART_COLORS[idx % CHART_COLORS.length],
            backgroundColor: "transparent",
            tension: 0.4,
            pointRadius: 4,
          })),
        },
      }));
    } catch (err) {
      console.error(err);
    }
  };

  const handleFilter7 = async (job) => {
    setJobFilter7(job);
    try {
      const res = await api.get("/dashboard/trend7", {
        params: { job, trend_start: trendStart },
      });
      const { dates, totals } = res.data.data;
      setTrend7Data((prev) => ({
        ...prev,
        labels: dates,
        datasets: [{ ...prev.datasets[0], data: totals }],
      }));
    } catch (err) {
      console.error(err);
    }
  };

  const handleFilterPlant = async (job) => {
    setJobFilterPlant(job);
    try {
      const res = await api.get("/dashboard/plantgroup", {
        params: { job, date_from: dateFrom, date_to: dateTo },
      });
      buildPlantCharts(
        Object.fromEntries(
          plants.map((p) => [p, { perGroup: res.data.data[p] || {} }]),
        ),
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleFilterIndividu = async (plant, job) => {
    setJobPerPlant((prev) => ({ ...prev, [plant]: job }));
    await loadIndividu(plant, job);
  };

  const chartOpts = (title = "") => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: {
        display: !!title,
        text: title,
        font: { size: 13, weight: "bold" },
      },
    },
    scales: {
      y: { beginAtZero: true, grid: { color: "#f1f5f9" } },
      x: { grid: { display: false } },
    },
  });

  const lineOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, grid: { color: "#f1f5f9" } },
      x: { grid: { display: false } },
    },
  };

  const perfOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom",
        labels: { font: { size: 10 }, boxWidth: 12 },
      },
    },
    scales: {
      y: { beginAtZero: true, grid: { color: "#f1f5f9" } },
      x: { grid: { display: false } },
    },
  };

  const barHorizOpts = (title) => ({
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: {
        display: true,
        text: "Plant " + title,
        font: { size: 12, weight: "bold" },
      },
    },
    scales: {
      x: { beginAtZero: true, display: false },
      y: { grid: { display: false } },
    },
  });

  const filteredReceptions = (data?.receptions || []).filter(
    (r) =>
      !search || r.operator_name?.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading && !data)
    return (
      <div
        className="d-flex justify-content-center align-items-center"
        style={{ height: "60vh" }}
      >
        <div className="text-center text-muted">
          <div className="spinner-border mb-3" role="status" />
          <div>Loading dashboard...</div>
        </div>
      </div>
    );

  const { stats, allJobTypes } = data;

  return (
    <div>
      {/* ── HEADER ── */}
      <div className="card border-0 shadow-sm mb-4 rounded-4 p-4">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-3">
          <h4 className="fw-bold mb-0">Dashboard Monitoring</h4>
          <div className="d-flex flex-wrap align-items-center gap-2">
            <span className="text-muted small fw-bold text-uppercase">
              Filter Tanggal
            </span>
            <input
              type="date"
              className="form-control form-control-sm"
              style={{ width: 155 }}
              value={dateFrom}
              max={dateTo}
              onChange={(e) => setDateFrom(e.target.value)}
            />
            <span className="text-muted small">s/d</span>
            <input
              type="date"
              className="form-control form-control-sm"
              style={{ width: 155 }}
              value={dateTo}
              min={dateFrom}
              onChange={(e) => setDateTo(e.target.value)}
            />
            {(dateFrom !== todayJakarta() || dateTo !== todayJakarta()) && (
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => {
                  setDateFrom(todayJakarta());
                  setDateTo(todayJakarta());
                }}
              >
                Reset ke Hari Ini
              </button>
            )}
            {loading && (
              <span className="text-muted small">Memuat...</span>
            )}
          </div>
        </div>
      </div>

      {/* ── STAT CARDS ── */}
      <div className="row g-3 mb-4">
        {[
          {
            label: "Total Produksi",
            value: Number(stats.totalProduction).toLocaleString("id-ID"),
            icon: "📦",
            bg: "primary",
          },
          {
            label: "Karyawan Aktif",
            value: stats.totalEmployees,
            icon: "👷",
            bg: "success",
          },
          {
            label: "Shift Saat Ini",
            value: `Shift ${stats.currentShift}`,
            icon: "⏰",
            bg: "danger",
          },
        ].map((card, i) => (
          <div className="col-md-4" key={i}>
            <div className="card border-0 shadow-sm h-100 rounded-4">
              <div className="card-body p-3">
                <div className="d-flex align-items-center justify-content-between">
                  <div>
                    <p className="text-muted small fw-bold text-uppercase mb-1">
                      {card.label}
                    </p>
                    <h3 className="fw-bold mb-0">{card.value}</h3>
                  </div>
                  <div
                    className={`rounded-3 p-3 bg-${card.bg} bg-opacity-10 fs-4`}
                  >
                    {card.icon}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── CHARTS ── */}
      <div className="card border-0 shadow-sm rounded-4 mb-4">
        <div className="card-body p-4">
          <div className="d-flex justify-content-between align-items-center mb-4">
            <h4 className="fw-bold mb-0">Visualisasi Produksi Harian</h4>
            <span className="badge bg-primary bg-opacity-10 text-primary px-3 py-2 rounded-pill">
              📅{" "}
              {dateFrom === dateTo
                ? formatDateID(dateFrom, {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })
                : `${formatDateID(dateFrom, { day: "2-digit", month: "short" })} - ${formatDateID(dateTo, { day: "2-digit", month: "short", year: "numeric" })}`}
            </span>
          </div>

          <div className="row">
            {/* Trend 7 Hari */}
            <div className="col-md-6 mb-4">
              <div className="p-3 border rounded-4" style={{ minHeight: 400 }}>
                <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                  <div className="d-flex align-items-center gap-2">
                    <div className="p-2 bg-primary bg-opacity-10 rounded-3">
                      📈
                    </div>
                    <h5 className="fw-bold m-0 small text-uppercase">
                      Tren Produksi 7 Hari
                    </h5>
                  </div>
                  <select
                    className="form-select form-select-sm border-0 bg-light"
                    style={{ width: "auto", minWidth: 130 }}
                    value={jobFilter7}
                    onChange={(e) => handleFilter7(e.target.value)}
                  >
                    <option value="all">Semua Pekerjaan</option>
                    {allJobTypes.map((j) => (
                      <option key={j} value={j}>
                        {j}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="d-flex align-items-center gap-2 mb-3">
                  <span className="text-muted small">Mulai tanggal</span>
                  <input
                    type="date"
                    className="form-control form-control-sm bg-light border-0"
                    style={{ width: "auto" }}
                    value={trendStart}
                    onChange={(e) => setTrendStart(e.target.value)}
                  />
                  <span className="text-muted small">
                    s/d{" "}
                    {formatDateID(addDaysJakarta(trendStart, 6), {
                      day: "2-digit",
                      month: "short",
                    })}
                  </span>
                </div>
                <div style={{ height: 260 }}>
                  <Line data={trend7Data} options={lineOpts} />
                </div>
              </div>
            </div>

            {/* Per Plant & Grup */}
            <div className="col-md-6 mb-4">
              <div className="p-3 border rounded-4" style={{ minHeight: 400 }}>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <div className="d-flex align-items-center gap-2">
                    <div className="p-2 bg-success bg-opacity-10 rounded-3">
                      🏭
                    </div>
                    <h5 className="fw-bold m-0 small text-uppercase">
                      Pencapaian Per Plant & Grup
                    </h5>
                  </div>
                  <select
                    className="form-select form-select-sm border-0 bg-light"
                    style={{ width: "auto", minWidth: 130 }}
                    value={jobFilterPlant}
                    onChange={(e) => handleFilterPlant(e.target.value)}
                  >
                    <option value="all">Semua Pekerjaan</option>
                    {allJobTypes.map((j) => (
                      <option key={j} value={j}>
                        {j}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="row g-2">
                  {plants.map((p) => (
                    <div className="col-6" key={p}>
                      <div
                        style={{ height: 160 }}
                        className="border rounded-3 p-1"
                      >
                        {plantChartData[p] && (
                          <Bar
                            data={plantChartData[p]}
                            options={barHorizOpts(p)}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <hr className="my-4 opacity-10" />

          {/* Trend Individu */}
          <h5 className="fw-bold mb-4 d-flex align-items-center gap-2">
            <div className="p-2 bg-warning bg-opacity-10 rounded-3">📊</div>
            Grafik Tren Kinerja Per Orang (Individu)
          </h5>
          <div className="row g-3">
            {plants.map((p) => (
              <div className="col-md-6" key={p}>
                <div className="p-3 border rounded-4 bg-light shadow-sm">
                  <h6 className="fw-bold small text-center text-uppercase text-muted border-bottom pb-2">
                    Plant {p}
                  </h6>
                  <select
                    className="form-select form-select-sm border-0 bg-white mt-2 mb-3"
                    value={jobPerPlant[p] || ""}
                    onChange={(e) => handleFilterIndividu(p, e.target.value)}
                  >
                    {(jobTypesPerPlant[p] || []).map((j) => (
                      <option key={j} value={j}>
                        {j}
                      </option>
                    ))}
                  </select>
                  <div style={{ height: 260 }}>
                    {perfData[p] ? (
                      <Line data={perfData[p]} options={perfOpts} />
                    ) : (
                      <div className="d-flex align-items-center justify-content-center h-100 text-muted small">
                        Belum ada data
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── TABEL ── */}
      <div className="card border-0 shadow-sm rounded-4">
        <div className="card-body p-0">
          <div className="p-3 border-bottom d-flex justify-content-between align-items-center">
            <h5 className="mb-0 fw-bold">Data Produksi Hari Ini</h5>
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="Cari operator..."
              style={{ width: 250 }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th>Operator</th>
                  <th>Group</th>
                  <th>Shift</th>
                  <th>Pekerjaan</th>
                  <th>Plant</th>
                  <th className="text-end">Produksi</th>
                  <th>Catatan</th>
                </tr>
              </thead>
              <tbody>
                {filteredReceptions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-4 text-muted">
                      Belum ada data
                    </td>
                  </tr>
                ) : (
                  filteredReceptions.map((r, i) => (
                    <tr key={i}>
                      <td className="fw-bold">{r.operator_name}</td>
                      <td>{r.group}</td>
                      <td>Shift {r.shift}</td>
                      <td>{r.job_today}</td>
                      <td>
                        <span
                          className="badge rounded-pill px-3"
                          style={{
                            background: getPlantColor(r.plant) + "20",
                            color: getPlantColor(r.plant),
                          }}
                        >
                          Plant {r.plant}
                        </span>
                      </td>
                      <td className="text-end">
                        {Number(r.production_count).toLocaleString("id-ID")}
                      </td>
                      <td className="text-muted small">{r.notes || "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
