import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import axiosInstance from "../../../api/axiosInstance";
import { todayJakarta, addDaysJakarta, formatDateID } from "../../../utils/date";

const today = todayJakarta();
const thisMonth = today.slice(0, 7);
const thisYear = today.slice(0, 4);
const sevenDaysAgo = addDaysJakarta(today, -7);

export default function ReportsIndex() {
  const navigate = useNavigate();
  const [filterType, setFilterType] = useState("daily");
  const [shift, setShift] = useState("");
  const [plant, setPlant] = useState("");
  const [group, setGroup] = useState("");
  const [bagian, setBagian] = useState("");
  const [jobToday, setJobToday] = useState("");
  const [operatorName, setOperatorName] = useState("");
  const [startDate, setStartDate] = useState(sevenDaysAgo);
  const [endDate, setEndDate] = useState(today);
  const [startMonth, setStartMonth] = useState(thisMonth);
  const [endMonth, setEndMonth] = useState(thisMonth);
  const [year, setYear] = useState(thisYear);

  // Plant & Grup diambil dari menu Pengaturan (/production-options), sama
  // kaya di halaman Input & Karyawan — biar konsisten satu sumber data,
  // otomatis ikut kalau nanti ada plant baru (BPW1/BPW2/BPW3 dll).
  const [plants, setPlants] = useState([]);
  const [groups, setGroups] = useState([]);
  const [bagians, setBagians] = useState([]);

  useEffect(() => {
    axiosInstance
      .get("/production-options")
      .then((res) => {
        const opts = res.data?.data || {};
        setPlants((opts.plant || []).map((o) => o.value));
        setGroups((opts.group || []).map((o) => o.value));
        setBagians((opts.bagian || []).map((o) => o.value));
      })
      .catch((err) => {
        console.warn("Gagal ambil opsi plant/grup/bagian:", err.message);
      });
  }, []);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const buildParams = useCallback(
    () => ({
      filter_type: filterType,
      shift,
      plant,
      group,
      bagian,
      job_today: jobToday,
      operator_name: operatorName,
      start_date: startDate,
      end_date: endDate,
      start_month: startMonth,
      end_month: endMonth,
      year,
    }),
    [
      filterType,
      shift,
      plant,
      group,
      bagian,
      jobToday,
      operatorName,
      startDate,
      endDate,
      startMonth,
      endMonth,
      year,
    ],
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axiosInstance.get("/reports", {
        params: buildParams(),
      });
      setData(res.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData();
    }, 400); // debounce biar gak nembak request tiap ketikan
    return () => clearTimeout(timer);
  }, [fetchData]);

  const handleExport = (exportType) => {
    const params = new URLSearchParams({
      ...buildParams(),
      export_type: exportType,
    });
    window.open(`/api/reports/export?${params.toString()}`, "_blank");
    setShowDropdown(false);
  };

  const reset = () => {
    setFilterType("daily");
    setShift("");
    setPlant("");
    setGroup("");
    setBagian("");
    setJobToday("");
    setOperatorName("");
    setStartDate(sevenDaysAgo);
    setEndDate(today);
    setStartMonth(thisMonth);
    setEndMonth(thisMonth);
    setYear(thisYear);
  };

  const handleEdit = (r) => {
    navigate(`/production/edit/${r.emp_plant}/${r.id}`);
  };

  const handleDelete = async (r) => {
    const result = await Swal.fire({
      title: "Hapus data?",
      html: `Yakin hapus data <b>${r.emp_name || "-"}</b> tanggal ${formatDateID(r.date)}?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Hapus",
      cancelButtonText: "Batal",
      confirmButtonColor: "#dc3545",
    });
    if (!result.isConfirmed) return;
    try {
      await axiosInstance.delete(`/production/${r.emp_plant}/${r.id}`);
      fetchData();
    } catch (err) {
      Swal.fire("Error", err.response?.data?.message || err.message, "error");
    }
  };

  return (
    <div
      style={{ padding: "1.5rem", background: "#f8fafc", minHeight: "100vh" }}
    >
      {/* ── Header ── */}
      <div className="glass-card mb-4" style={styles.card}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div>
            <h4 style={{ margin: 0, fontWeight: 700 }}>Laporan</h4>
            <p style={{ margin: 0, color: "#64748b", fontSize: "0.875rem" }}>
              Analisis data produksi
            </p>
          </div>
          {/* Export Dropdown */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              style={styles.btnSuccess}
            >
              ⬇ Export Excel ▾
            </button>
            {showDropdown && (
              <div style={styles.dropdown}>
                <div style={styles.dropdownHeader}>Pilih Jenis Export</div>
                {[
                  {
                    type: "daily",
                    icon: "📅",
                    label: "Rekap Harian",
                    desc: "Pivot per tanggal sesuai filter",
                  },
                  {
                    type: "monthly_recap",
                    icon: "📊",
                    label: "Rekap Bulanan",
                    desc: "Avg per bulan, ranking operator",
                  },
                  {
                    type: "group_ranking",
                    icon: "🏆",
                    label: "Ranking Grup per Plant",
                    desc: "Produksi grup berdasarkan leader",
                  },
                ].map((opt, i) => (
                  <div key={i}>
                    {i > 0 && (
                      <hr
                        style={{
                          margin: "4px 0",
                          border: "none",
                          borderTop: "1px solid #e2e8f0",
                        }}
                      />
                    )}
                    <button
                      onClick={() => handleExport(opt.type)}
                      style={styles.dropdownItem}
                    >
                      <span style={{ fontSize: "1.2rem" }}>{opt.icon}</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                          {opt.label}
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "#64748b" }}>
                          {opt.desc}
                        </div>
                      </div>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Filter ── */}
      <div style={{ ...styles.card, marginBottom: "1.5rem" }}>
        {/* Row 1 */}
        <div style={styles.filterRow}>
          <div style={styles.filterCol}>
            <label style={styles.label}>Tipe</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              style={styles.input}
            >
              <option value="daily">Harian</option>
              <option value="monthly">Bulanan</option>
              <option value="yearly">Tahunan</option>
            </select>
          </div>
          <div style={styles.filterCol}>
            <label style={styles.label}>Shift</label>
            <select
              value={shift}
              onChange={(e) => setShift(e.target.value)}
              style={styles.input}
            >
              <option value="">Semua</option>
              {[1, 2, 3].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div style={styles.filterCol}>
            <label style={styles.label}>Plant</label>
            <select
              value={plant}
              onChange={(e) => setPlant(e.target.value)}
              style={styles.input}
            >
              <option value="">Semua</option>
              {plants.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div style={styles.filterCol}>
            <label style={styles.label}>Grup</label>
            <select
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              style={styles.input}
            >
              <option value="">Semua</option>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div style={styles.filterCol}>
            <label style={styles.label}>Bagian</label>
            <select
              value={bagian}
              onChange={(e) => setBagian(e.target.value)}
              style={styles.input}
            >
              <option value="">Semua</option>
              {bagians.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div style={{ ...styles.filterCol, flex: 2 }}>
            <label style={styles.label}>Pekerjaan</label>
            <select
              value={jobToday}
              onChange={(e) => setJobToday(e.target.value)}
              style={styles.input}
            >
              <option value="">Semua Pekerjaan</option>
              {data?.allJobs?.map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 2 */}
        <div style={{ ...styles.filterRow, marginTop: "1rem" }}>
          {/* Date filters */}
          <div style={{ ...styles.filterCol, flex: 2 }}>
            {filterType === "daily" && (
              <>
                <label style={styles.label}>Tanggal Awal</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={styles.input}
                />
                <label style={{ ...styles.label, marginTop: "0.5rem" }}>
                  Tanggal Akhir
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={styles.input}
                />
              </>
            )}
            {filterType === "monthly" && (
              <>
                <label style={styles.label}>Bulan Awal</label>
                <input
                  type="month"
                  value={startMonth}
                  onChange={(e) => setStartMonth(e.target.value)}
                  style={styles.input}
                />
                <label style={{ ...styles.label, marginTop: "0.5rem" }}>
                  Bulan Akhir
                </label>
                <input
                  type="month"
                  value={endMonth}
                  onChange={(e) => setEndMonth(e.target.value)}
                  style={styles.input}
                />
              </>
            )}
            {filterType === "yearly" && (
              <>
                <label style={styles.label}>Tahun</label>
                <input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  min="2020"
                  max="2030"
                  style={styles.input}
                />
              </>
            )}
          </div>
          {/* Operator search */}
          <div style={{ ...styles.filterCol, flex: 2 }}>
            <label style={styles.label}>Nama Operator</label>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="text"
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchData()}
                placeholder="Cari nama operator..."
                list="operatorNames"
                style={{ ...styles.input, flex: 1 }}
              />
              <button onClick={fetchData} style={styles.btnPrimary}>
                🔍
              </button>
            </div>
            <datalist id="operatorNames">
              {data?.allEmployees?.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
        </div>

        {/* Action buttons */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
            marginTop: "1rem",
            paddingTop: "1rem",
            borderTop: "1px solid #e2e8f0",
          }}
        >
          <button onClick={reset} style={styles.btnSecondary}>
            ↺ Reset
          </button>
          <button onClick={fetchData} style={styles.btnPrimary}>
            🔍 Cari Data
          </button>
        </div>
      </div>

      {/* ── Tabel Data ── */}
      <div
        style={{
          ...styles.card,
          marginBottom: "1.5rem",
          padding: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontWeight: 700 }}>📊 Monitoring Hasil</span>
          <span style={styles.badge}>{data?.receptions?.length || 0} Item</span>
        </div>
        <div style={{ maxHeight: "500px", overflowY: "auto" }}>
          <table style={styles.table}>
            <thead>
              <tr style={{ background: "#f8fafc", position: "sticky", top: 0 }}>
                {[
                  "Tanggal",
                  "Nama",
                  "Plant",
                  "Grup",
                  "Shift",
                  "Pekerjaan",
                  "Produksi",
                  "Aksi",
                ].map((h) => (
                  <th key={h} style={styles.th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={8}
                    style={{
                      textAlign: "center",
                      padding: "2rem",
                      color: "#64748b",
                    }}
                  >
                    Loading...
                  </td>
                </tr>
              ) : data?.receptions?.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    style={{
                      textAlign: "center",
                      padding: "2rem",
                      color: "#94a3b8",
                    }}
                  >
                    Tidak ada data
                  </td>
                </tr>
              ) : (
                data?.receptions?.map((r, i) => (
                  <tr
                    key={r.id}
                    style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc" }}
                  >
                    <td style={styles.td}>
                      {formatDateID(r.date)}
                    </td>
                    <td style={{ ...styles.td, fontWeight: 600 }}>
                      {r.emp_name || "-"}
                    </td>
                    <td style={styles.td}>{r.emp_plant || "-"}</td>
                    <td style={styles.td}>{r.emp_group || "-"}</td>
                    <td style={{ ...styles.td, textAlign: "center" }}>
                      {r.shift}
                    </td>
                    <td style={styles.td}>{r.job_today || "-"}</td>
                    <td style={{ ...styles.td, textAlign: "right" }}>
                      <span style={styles.prodBadge}>
                        {Number(r.production_count).toLocaleString()}
                      </span>
                    </td>
                    <td style={{ ...styles.td, textAlign: "center" }}>
                      <div
                        style={{
                          display: "flex",
                          gap: "6px",
                          justifyContent: "center",
                        }}
                      >
                        <button
                          onClick={() => handleEdit(r)}
                          style={styles.btnEdit}
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDelete(r)}
                          style={styles.btnDelete}
                          title="Hapus"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Ranking Grup Per Plant ── */}
      {data?.groupRanking && Object.keys(data.groupRanking).length > 0 && (
        <div style={{ ...styles.card, marginBottom: "1.5rem" }}>
          <div style={{ fontWeight: 700, marginBottom: "1rem" }}>
            👥 Peringkat Grup Per Plant
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "1rem",
            }}
          >
            {Object.entries(data.groupRanking).map(([plantName, groups]) => (
              <div
                key={plantName}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  padding: "12px",
                  background: "#f8fafc",
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: "0.75rem",
                    textTransform: "uppercase",
                    color: "#64748b",
                    marginBottom: "8px",
                    paddingBottom: "8px",
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  Plant {plantName}
                </div>
                {groups.map((g, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "4px 0",
                      fontSize: "0.85rem",
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>Grup {g.name}</span>
                    <span style={styles.greenBadge}>
                      {Number(g.production).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Ranking Operator Per Plant ── */}
      {data?.operatorRanking &&
        Object.keys(data.operatorRanking).length > 0 && (
          <div style={styles.card}>
            <div style={{ fontWeight: 700, marginBottom: "1rem" }}>
              🏆 Peringkat Operator Per Plant
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "1rem",
              }}
            >
              {Object.entries(data.operatorRanking).map(
                ([plantName, operators]) => (
                  <div
                    key={plantName}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      padding: "12px",
                      background: "#f8fafc",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "8px",
                        paddingBottom: "8px",
                        borderBottom: "1px solid #e2e8f0",
                      }}
                    >
                      <span style={{ fontWeight: 700 }}>Plant {plantName}</span>
                      <span style={styles.badge}>{operators.length} Orang</span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "0.65rem",
                        textTransform: "uppercase",
                        color: "#94a3b8",
                        marginBottom: "4px",
                      }}
                    >
                      <span>Operator</span>
                      <span>Produksi</span>
                    </div>
                    {operators.map((op, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "4px 0",
                          borderBottom: "1px solid #f1f5f9",
                          fontSize: "0.85rem",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            gap: "6px",
                            alignItems: "center",
                            maxWidth: "60%",
                          }}
                        >
                          <span
                            style={{
                              color: "#94a3b8",
                              fontWeight: 700,
                              minWidth: "18px",
                            }}
                          >
                            {i + 1}.
                          </span>
                          <span
                            style={{
                              fontWeight: 600,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {op.name}
                          </span>
                        </div>
                        <span style={styles.greenBadge}>
                          {Number(op.production).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                ),
              )}
            </div>
          </div>
        )}
    </div>
  );
}

const styles = {
  card: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "1.25rem",
    padding: "1.5rem",
    boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)",
  },
  filterRow: { display: "flex", gap: "1rem", flexWrap: "wrap" },
  filterCol: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minWidth: "140px",
  },
  label: {
    fontSize: "0.7rem",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "#64748b",
    marginBottom: "6px",
  },
  input: {
    padding: "0.6rem 0.75rem",
    border: "1.5px solid #e2e8f0",
    borderRadius: "0.5rem",
    fontSize: "0.875rem",
    color: "#0f172a",
    width: "100%",
    boxSizing: "border-box",
    background: "#fff",
  },
  btnPrimary: {
    background: "#0ea5e9",
    color: "#fff",
    border: "none",
    borderRadius: "999px",
    padding: "0.6rem 1.25rem",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: "0.875rem",
  },
  btnSuccess: {
    background: "#10b981",
    color: "#fff",
    border: "none",
    borderRadius: "999px",
    padding: "0.6rem 1.25rem",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: "0.875rem",
  },
  btnSecondary: {
    background: "#fff",
    color: "#475569",
    border: "1.5px solid #e2e8f0",
    borderRadius: "999px",
    padding: "0.6rem 1.25rem",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: "0.875rem",
  },
  dropdown: {
    position: "absolute",
    right: 0,
    top: "110%",
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "0.75rem",
    boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)",
    zIndex: 100,
    minWidth: "240px",
    padding: "8px 0",
  },
  dropdownHeader: {
    padding: "6px 16px",
    fontSize: "0.7rem",
    fontWeight: 700,
    textTransform: "uppercase",
    color: "#94a3b8",
  },
  dropdownItem: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px 16px",
    width: "100%",
    border: "none",
    background: "none",
    cursor: "pointer",
    textAlign: "left",
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" },
  th: {
    padding: "10px 12px",
    textAlign: "left",
    fontWeight: 700,
    fontSize: "0.7rem",
    textTransform: "uppercase",
    color: "#475569",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "10px 12px",
    borderBottom: "1px solid #f1f5f9",
    verticalAlign: "middle",
  },
  badge: {
    background: "#f1f5f9",
    color: "#334155",
    borderRadius: "999px",
    padding: "2px 10px",
    fontSize: "0.75rem",
    fontWeight: 600,
  },
  greenBadge: {
    background: "#ecfdf5",
    color: "#047857",
    border: "1px solid #a7f3d0",
    borderRadius: "6px",
    padding: "2px 8px",
    fontSize: "0.75rem",
    fontWeight: 700,
  },
  prodBadge: {
    background: "#ecfdf5",
    color: "#047857",
    border: "1px solid #a7f3d0",
    borderRadius: "6px",
    padding: "2px 8px",
    fontWeight: 700,
  },
  btnEdit: {
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    borderRadius: "6px",
    width: "28px",
    height: "28px",
    cursor: "pointer",
    fontSize: "0.8rem",
    lineHeight: 1,
  },
  btnDelete: {
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: "6px",
    width: "28px",
    height: "28px",
    cursor: "pointer",
    fontSize: "0.8rem",
    lineHeight: 1,
  },
};
