// src/pages/barcode/BarcodeTracerPage.jsx
// Modul "Barcode Tracer" — lacak riwayat mutasi (timeline) 1 barcode
// (Collie / Pcs) lintas Plant & DC Karawang. Diadaptasi dari referensi
// yang dikasih user supaya jalan di project ini (endpoint, format
// response {status,message,data}, dan dibikin responsive mobile+desktop).
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  Barcode,
  AlertCircle,
  ArrowUpDown,
  Route,
  UserCheck,
  FileText,
  Loader2,
  Factory,
  Warehouse,
  Truck,
  Building2,
  MapPin,
  Layers,
  Home,
  X,
} from "lucide-react";
import api from "../../api/axiosInstance";

const parseScanTime = (val) => {
  if (!val || val === "-" || val === "null") return 0;
  let d;
  const str = String(val).trim();

  if (str.includes("/") && (str.includes("AM") || str.includes("PM"))) {
    const [datePart, timePart, modifier] = str.split(" ");
    const [day, month, year] = datePart.split("/");
    let [hours, minutes, seconds] = timePart.split(":");
    if (modifier === "PM" && hours !== "12")
      hours = String(parseInt(hours, 10) + 12);
    if (modifier === "AM" && hours === "12") hours = "00";
    d = new Date(year, month - 1, day, hours, minutes, seconds);
  } else {
    d = new Date(str.replace(/-/g, "/").replace("T", " ").replace("Z", ""));
  }

  return isNaN(d.getTime()) ? 0 : d.getTime();
};

const formatDateIndo = (val) => {
  if (!val || val === "-" || val === "null") return "-";
  let d;
  const str = String(val).trim();

  if (str.includes("/") && (str.includes("AM") || str.includes("PM"))) {
    const [datePart, timePart, modifier] = str.split(" ");
    const [day, month, year] = datePart.split("/");
    let [hours, minutes, seconds] = timePart.split(":");
    if (modifier === "PM" && hours !== "12")
      hours = String(parseInt(hours, 10) + 12);
    if (modifier === "AM" && hours === "12") hours = "00";
    d = new Date(year, month - 1, day, hours, minutes, seconds);
  } else {
    d = new Date(str.replace(/-/g, "/").replace("T", " ").replace("Z", ""));
  }

  if (isNaN(d.getTime())) {
    d = new Date(str);
    if (isNaN(d.getTime())) return str;
  }

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");

  return `${dd}/${mm}/${yy} ${hh}:${min}:${ss}`;
};

const formatTimelineDate = (val) => {
  if (!val || val === "-" || val === "null") return { date: "-", time: "" };
  let d;
  const str = String(val).trim();

  if (str.includes("/") && (str.includes("AM") || str.includes("PM"))) {
    const [datePart, timePart, modifier] = str.split(" ");
    const [day, month, year] = datePart.split("/");
    let [hours, minutes, seconds] = timePart.split(":");
    if (modifier === "PM" && hours !== "12")
      hours = String(parseInt(hours, 10) + 12);
    if (modifier === "AM" && hours === "12") hours = "00";
    d = new Date(year, month - 1, day, hours, minutes, seconds);
  } else {
    d = new Date(str.replace(/-/g, "/").replace("T", " ").replace("Z", ""));
  }

  if (isNaN(d.getTime())) {
    d = new Date(str);
    if (isNaN(d.getTime())) return { date: str, time: "" };
  }

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");

  return { date: `${dd}/${mm}/${yyyy}`, time: `${hh}:${min}:${ss}` };
};

const getNodeIcon = (locStr) => {
  const loc = String(locStr || "").toUpperCase();
  if (loc.includes("PROD")) return <Factory size={13} color="#0021b3" />;
  if (loc.includes("CUSTOMER")) return <Building2 size={13} color="#b45309" />;
  if (loc.includes("T-") || loc.includes("TRUCK"))
    return <Truck size={13} color="#c2410c" />;
  if (loc.startsWith("BR") || loc.startsWith("BL"))
    return <Warehouse size={13} color="#059669" />;
  return <MapPin size={13} color="#94a3b8" />;
};

export default function BarcodeTracerPage() {
  const [barcodeInput, setBarcodeInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [dataResult, setDataResult] = useState([]);
  const [searched, setSearched] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [sortDirection, setSortDirection] = useState("asc");

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;

    setLoading(true);
    setSearched(true);
    setErrorMessage("");
    setDataResult([]);

    try {
      const res = await api.get("/barcode-tracer/search", {
        params: { barcode: barcodeInput.trim() },
      });

      // Backend selalu bungkus response {status, message, data}
      const payload = res.data?.data;
      let rows = payload?.data || [];
      rows.sort(
        (a, b) => parseScanTime(a.scantime) - parseScanTime(b.scantime),
      );
      setDataResult(rows);
      setSortDirection("asc");
    } catch (err) {
      console.error(err);
      setErrorMessage(
        err.response?.data?.message ||
          "Koneksi ke database warehouse terputus. Silakan coba kembali.",
      );
    } finally {
      setLoading(false);
    }
  };

  // Bersihkan input & hasil pencarian di layar — halaman ini cuma nampilin
  // riwayat mutasi (read-only dari Plant & DC Karawang), jadi ini bukan
  // hapus data, cuma reset tampilan biar siap buat pencarian baru.
  const handleClearSearch = () => {
    setBarcodeInput("");
    setDataResult([]);
    setSearched(false);
    setErrorMessage("");
    setSortDirection("asc");
  };

  const handleToggleSort = () => {
    const newDir = sortDirection === "asc" ? "desc" : "asc";
    setSortDirection(newDir);
    setDataResult((prev) =>
      [...prev].sort((a, b) => {
        const timeA = parseScanTime(a.scantime);
        const timeB = parseScanTime(b.scantime);
        return newDir === "asc" ? timeA - timeB : timeB - timeA;
      }),
    );
  };

  const buildGroupedTracking = () => {
    if (!dataResult || dataResult.length === 0) return [];

    const groups = {};
    dataResult.forEach((row) => {
      const pcsCode =
        row.rack_bc_entried && row.rack_bc_entried !== "-"
          ? row.rack_bc_entried
          : row.bc_entried_prod || "UNKNOWN_PCS";
      if (!groups[pcsCode]) groups[pcsCode] = [];
      groups[pcsCode].push(row);
    });

    return Object.entries(groups).map(([pcsBarcode, rows]) => {
      const timelineRows = [...rows].sort(
        (a, b) => parseScanTime(a.scantime) - parseScanTime(b.scantime),
      );
      const tableRows = [...rows].sort((a, b) => {
        const timeA = parseScanTime(a.scantime);
        const timeB = parseScanTime(b.scantime);
        return sortDirection === "asc" ? timeA - timeB : timeB - timeA;
      });

      const nodes = [];
      const firstRow = timelineRows[0];
      const firstT = formatTimelineDate(firstRow.scantime);
      nodes.push({
        location: firstRow.loc_from || "PROD",
        date: firstT.date,
        time: firstT.time,
        isOrigin: true,
      });

      let doNumber = "-";
      let customerName = "-";
      let cityName = "-";
      let doOperator = "-";
      timelineRows.forEach((r) => {
        const t = formatTimelineDate(r.scantime);
        const isCustomer = String(r.loc_to).toUpperCase().includes("CUSTOMER");
        if (r.do_number && r.do_number !== "-") doNumber = r.do_number;
        if (r.customer && r.customer !== "-") customerName = r.customer;
        if (r.customer_city && r.customer_city !== "-")
          cityName = r.customer_city;
        if (r.do_operator && r.do_operator !== "-") doOperator = r.do_operator;
        nodes.push({
          location: r.loc_to || "-",
          date: t.date,
          time: t.time,
          isOrigin: false,
          isCustomer,
        });
      });

      return {
        pcsBarcode,
        nodes,
        tableRows,
        deliveryInfo: { doNumber, customerName, cityName, doOperator },
      };
    });
  };

  const groupedTracking = buildGroupedTracking();

  return (
    <div className="bt-page">
      <style>{btStyles}</style>

      <div className="bt-home-bar">
        <Link to="/" className="bt-home-btn" title="Kembali ke Pilih Menu">
          <Home size={17} />
        </Link>
      </div>

      <div className="bt-header">
        <div className="bt-header-left">
          <div className="bt-header-icon">
            <Barcode size={22} color="#0021b3" />
          </div>
          <div>
            <h1>Barcode Tracer</h1>
            <p>Pelacakan mutasi dan riwayat barcode Plant & DC Karawang.</p>
          </div>
        </div>

        {groupedTracking.length > 0 && (
          <div className="bt-summary-chip">
            <Layers size={18} color="#0021b3" />
            <div>
              <span>Total Item Terlacak</span>
              <strong>
                {groupedTracking.length} <em>PCS</em>
              </strong>
            </div>
          </div>
        )}
      </div>

      <form className="bt-search-card" onSubmit={handleSearch}>
        <div className="bt-search-field">
          <Search size={16} />
          <input
            type="text"
            placeholder="Scan atau ketik Barcode Collie / Barcode Pcs..."
            value={barcodeInput}
            onChange={(e) => setBarcodeInput(e.target.value)}
            autoFocus
          />
        </div>
        <button type="submit" className="bt-btn-cari" disabled={loading}>
          {loading ? (
            <>
              <Loader2 size={14} className="bt-spin" />
              <span>Mencari...</span>
            </>
          ) : (
            <>
              <Search size={14} />
              <span>Lacak Barcode</span>
            </>
          )}
        </button>
        <button
          type="button"
          className="bt-btn-hapus"
          onClick={handleClearSearch}
          disabled={loading || (!barcodeInput && !searched)}
          title="Bersihkan input & hasil pencarian"
        >
          <X size={14} />
          <span>Hapus</span>
        </button>
      </form>

      {errorMessage && (
        <div className="bt-error-box">
          <AlertCircle size={18} color="#ef4444" />
          <span>{errorMessage}</span>
        </div>
      )}

      {searched && !loading && dataResult.length === 0 && !errorMessage && (
        <div className="bt-empty-state">
          <Barcode size={40} color="#475569" />
          <h3>Barcode Tidak Ditemukan</h3>
          <p>
            Tidak ada jejak mutasi untuk barcode <strong>{barcodeInput}</strong>
            .
          </p>
        </div>
      )}

      {groupedTracking.length > 0 && (
        <div className="bt-results">
          {groupedTracking.map((group, gIdx) => (
            <div
              key={gIdx}
              className={`bt-group-card ${gIdx % 2 === 0 ? "bt-group-a" : "bt-group-b"}`}
            >
              <div className="bt-top-row">
                <div className="bt-timeline-card">
                  <div className="bt-section-label bt-label-green">
                    <Route size={14} /> Tracking Jalur Mutasi (PER PCS)
                  </div>

                  <div className="bt-timeline-head">
                    <span className="bt-pcs-badge">{group.pcsBarcode}</span>
                    <div className="bt-timeline-scroll">
                      {group.nodes.map((node, nIdx) => (
                        <div className="bt-node-wrap" key={nIdx}>
                          <div className="bt-node">
                            <div
                              className={`bt-node-loc ${
                                node.isCustomer
                                  ? "bt-node-customer"
                                  : node.isOrigin
                                    ? "bt-node-origin"
                                    : ""
                              }`}
                            >
                              {getNodeIcon(node.location)}
                              <span>{node.location}</span>
                            </div>
                            <div className="bt-node-date">{node.date}</div>
                            <div className="bt-node-time">{node.time}</div>
                          </div>
                          {nIdx < group.nodes.length - 1 && (
                            <div className="bt-node-arrow">&gt;&gt;</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bt-delivery-card">
                  <div className="bt-section-label bt-label-yellow">
                    <Truck size={14} /> Informasi Pengiriman
                  </div>
                  {group.deliveryInfo.doNumber !== "-" ? (
                    <div className="bt-delivery-grid">
                      <div className="bt-delivery-col">
                        <span>No. DN</span>
                        <div className="bt-delivery-value bt-value-blue">
                          <FileText size={13} /> {group.deliveryInfo.doNumber}
                        </div>
                      </div>
                      <div className="bt-delivery-col">
                        <span>Customer Tujuan</span>
                        <div
                          className="bt-delivery-value bt-value-yellow"
                          title={group.deliveryInfo.customerName}
                        >
                          <Building2 size={13} />
                          <span className="bt-ellipsis">
                            {group.deliveryInfo.customerName}
                          </span>
                        </div>
                      </div>
                      <div className="bt-delivery-col">
                        <span>Kota</span>
                        <div
                          className="bt-delivery-value bt-value-green"
                          title={group.deliveryInfo.cityName}
                        >
                          <MapPin size={13} />
                          <span className="bt-ellipsis">
                            {group.deliveryInfo.cityName}
                          </span>
                        </div>
                      </div>
                      <div className="bt-delivery-col">
                        <span>Operator</span>
                        <div
                          className="bt-delivery-value bt-value-purple"
                          title={group.deliveryInfo.doOperator}
                        >
                          <UserCheck size={13} />
                          <span className="bt-ellipsis">
                            {group.deliveryInfo.doOperator}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bt-delivery-empty">
                      Belum ada data pengiriman.
                    </div>
                  )}
                </div>
              </div>

              {/* TABEL DETAIL — desktop */}
              <div className="bt-table-section">
                <div className="bt-table-title">Detail Data :</div>
                <div className="bt-table-wrap">
                  <table className="bt-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Deskripsi</th>
                        <th className="bt-center">Collie</th>
                        <th className="bt-center">Barcode Pcs</th>
                        <th>Jdge</th>
                        <th>Probcode</th>
                        <th>Shift</th>
                        <th>Loc_From</th>
                        <th>Loc_To</th>
                        <th className="bt-center">PIC</th>
                        <th>Nama</th>
                        <th>Plant (Opr)</th>
                        <th
                          onClick={handleToggleSort}
                          className="bt-sortable"
                          title="Klik untuk mengubah urutan Scan Time"
                        >
                          <span className="bt-sortable-inner">
                            Scan Time <ArrowUpDown size={11} />
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.tableRows.map((row, rIdx) => {
                        return (
                          <tr key={rIdx}>
                            <td className="bt-strong">{row.item}</td>
                            <td className="bt-wrap">{row.description}</td>
                            <td className="bt-center bt-mono">
                              {row.bc_entried_prod || "-"}
                            </td>
                            <td className="bt-center bt-mono bt-value-blue">
                              {row.rack_bc_entried || "-"}
                            </td>
                            <td>
                              <span
                                className={`bt-jdge-badge ${row.jdge === "OK" ? "bt-jdge-ok" : "bt-jdge-bad"}`}
                              >
                                {row.jdge}
                              </span>
                            </td>
                            <td>{row.probcode || "-"}</td>
                            <td>{row.ydate_shift}</td>
                            <td className="bt-mono bt-muted">
                              {row.loc_from || "-"}
                            </td>
                            <td>
                              <span
                                className={`bt-loc-badge ${
                                  String(row.loc_to)
                                    .toUpperCase()
                                    .includes("CUSTOMER")
                                    ? "bt-loc-customer"
                                    : ""
                                }`}
                              >
                                {row.loc_to || "-"}
                              </span>
                            </td>
                            <td className="bt-center bt-mono bt-muted">
                              {row.pic || "-"}
                            </td>
                            <td className="bt-value-green bt-wrap">
                              {row.nama !== "-" ? (
                                <span className="bt-inline-icon">
                                  <UserCheck size={11} /> {row.nama}
                                </span>
                              ) : (
                                "-"
                              )}
                            </td>
                            <td className="bt-value-purple">
                              {row.plant_opr || "-"}
                            </td>
                            <td className="bt-mono">
                              {formatDateIndo(row.scantime)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* LIST DETAIL — mobile (kartu, bukan tabel lebar) */}
                <div className="bt-mobile-list">
                  {group.tableRows.map((row, rIdx) => {
                    return (
                      <div className="bt-mobile-row" key={rIdx}>
                        <div className="bt-mobile-row-head">
                          <span className="bt-mono">
                            {formatDateIndo(row.scantime)}
                          </span>
                        </div>
                        <div className="bt-mobile-row-main">
                          <strong>{row.item}</strong>
                          <span>{row.description}</span>
                        </div>
                        <div className="bt-mobile-grid">
                          <div>
                            <span>Collie</span>
                            <strong className="bt-mono">
                              {row.bc_entried_prod || "-"}
                            </strong>
                          </div>
                          <div>
                            <span>Barcode Pcs</span>
                            <strong className="bt-mono bt-value-blue">
                              {row.rack_bc_entried || "-"}
                            </strong>
                          </div>
                          <div>
                            <span>Loc_From → Loc_To</span>
                            <strong className="bt-mono">
                              {row.loc_from || "-"} → {row.loc_to || "-"}
                            </strong>
                          </div>
                          <div>
                            <span>PIC / Nama</span>
                            <strong>
                              {row.pic || "-"}{" "}
                              {row.nama !== "-" ? `(${row.nama})` : ""}
                            </strong>
                          </div>
                          <div>
                            <span>Jdge / Probcode</span>
                            <strong>
                              {row.jdge} / {row.probcode || "-"}
                            </strong>
                          </div>
                          <div>
                            <span>Plant (Opr)</span>
                            <strong>{row.plant_opr || "-"}</strong>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const btStyles = `
.bt-page { max-width: 1300px; margin: 0 auto; min-height: 100vh;
  color: #0f172a; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
  padding: 16px; box-sizing: border-box; }
.bt-page * { box-sizing: border-box; }

.bt-home-bar { display: flex; gap: 6px; margin-bottom: 16px;
  background: #fff; border-radius: 12px; padding: 6px; width: fit-content;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
.bt-home-btn { display: flex; align-items: center; justify-content: center;
  width: 40px; height: 40px; border-radius: 8px; background: #f1f5f9; color: #475569; text-decoration: none; }
.bt-home-btn:hover { background: #e2e8f0; color: #1e293b; }

.bt-header { display: flex; justify-content: space-between; align-items: center;
  flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
.bt-header-left { display: flex; align-items: center; gap: 12px; }
.bt-header-icon { width: 42px; height: 42px; border-radius: 12px; flex-shrink: 0;
  background: rgba(0,33,179,0.1); display: flex; align-items: center; justify-content: center; }
.bt-header h1 { font-size: 22px; font-weight: 800; margin: 0; color: #0f172a; }
.bt-header p { margin: 2px 0 0; font-size: 13px; color: #64748b; }

.bt-summary-chip { display: flex; align-items: center; gap: 10px; background: #fff;
  padding: 8px 16px; border-radius: 14px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
.bt-summary-chip span { display: block; font-size: 0.62rem; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
.bt-summary-chip strong { font-size: 1rem; font-weight: 800; color: #0f172a; }
.bt-summary-chip em { font-style: normal; font-size: 0.72rem; color: #0021b3; font-weight: 700; }

.bt-search-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 14px;
  display: flex; gap: 10px; align-items: center; margin-bottom: 16px; flex-wrap: wrap;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
.bt-search-field { position: relative; flex: 1 1 220px; display: flex; align-items: center; gap: 8px;
  background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 0 14px; height: 42px; }
.bt-search-field svg { color: #64748b; flex-shrink: 0; }
.bt-search-field input { flex: 1; background: transparent; border: none; outline: none; color: #0f172a;
  font-size: 0.88rem; font-family: 'Consolas', 'SFMono-Regular', monospace; letter-spacing: 0.02em; }
.bt-btn-cari { flex-shrink: 0; height: 42px; padding: 0 22px; background: #0021b3;
  color: #fff; border: none; border-radius: 10px; font-weight: 700; font-size: 0.85rem; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 6px; }
.bt-btn-cari:hover { background: #001a8f; }
.bt-btn-cari:disabled { cursor: not-allowed; opacity: 0.7; }
.bt-btn-hapus { flex-shrink: 0; height: 42px; padding: 0 18px; background: #fff;
  color: #475569; border: 1px solid #cbd5e1; border-radius: 10px; font-weight: 700; font-size: 0.85rem; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 6px; }
.bt-btn-hapus:hover { background: #f1f5f9; border-color: #94a3b8; }
.bt-btn-hapus:disabled { cursor: not-allowed; opacity: 0.5; }
.bt-spin { animation: bt-spin 0.8s linear infinite; }
@keyframes bt-spin { to { transform: rotate(360deg); } }

.bt-error-box { padding: 10px 14px; background: #fef2f2; border: 1px solid #fecaca;
  border-radius: 12px; color: #b91c1c; display: flex; align-items: center; gap: 10px; font-size: 0.85rem; margin-bottom: 16px; }

.bt-empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center;
  text-align: center; background: #fff; border-radius: 16px; border: 1px dashed #cbd5e1;
  color: #94a3b8; padding: 40px 20px; gap: 6px; }
.bt-empty-state h3 { margin: 4px 0 0; color: #0f172a; font-size: 1rem; font-weight: 700; }
.bt-empty-state p { margin: 0; font-size: 0.84rem; }
.bt-empty-state strong { color: #0021b3; }

.bt-results { display: flex; flex-direction: column; gap: 16px; }
.bt-group-card { background: #fff; border-radius: 16px; border: 1px solid #e2e8f0;
  padding: 14px; display: flex; flex-direction: column; gap: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
.bt-group-a { border-left: 4px solid #0021b3; }
.bt-group-b { background: #fafbff; border-left: 4px solid #059669; }

.bt-top-row { display: flex; gap: 14px; flex-wrap: wrap; align-items: stretch; }
.bt-timeline-card { flex: 1 1 65%; min-width: 260px; background: #f8fafc; padding: 12px;
  border-radius: 12px; border: 1px solid #e2e8f0; }
.bt-delivery-card { flex: 1 1 230px; min-width: 220px; background: #fffbeb; padding: 12px;
  border-radius: 12px; border: 1px solid #fde68a; display: flex; flex-direction: column; justify-content: space-between; }

.bt-section-label { display: flex; align-items: center; gap: 6px; font-size: 0.72rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 10px; }
.bt-label-green { color: #059669; }
.bt-label-yellow { color: #b45309; }

.bt-timeline-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.bt-pcs-badge { flex-shrink: 0; display: inline-flex; align-items: center; padding: 6px 12px; border-radius: 8px;
  font-family: 'Consolas', 'SFMono-Regular', monospace; font-size: 0.8rem; font-weight: 700; color: #0021b3;
  background: #eef2ff; border: 1px solid #c7d2fe; letter-spacing: 0.02em; }
.bt-timeline-scroll { flex: 1; min-width: 100%; overflow-x: auto; }
.bt-node-wrap { display: inline-flex; align-items: center; gap: 10px; }
.bt-node { text-align: center; display: inline-flex; flex-direction: column; align-items: center; min-width: 78px; }
.bt-node-loc { display: inline-flex; align-items: center; gap: 4px; font-size: 0.76rem; font-weight: 700;
  font-family: 'Consolas', 'SFMono-Regular', monospace; color: #0f172a; margin-bottom: 2px; }
.bt-node-origin { color: #0021b3; }
.bt-node-customer { color: #b45309; }
.bt-node-date { font-size: 0.66rem; color: #475569; font-weight: 600; font-family: 'Consolas', monospace; }
.bt-node-time { font-size: 0.62rem; color: #94a3b8; font-family: 'Consolas', monospace; }
.bt-node-arrow { color: #059669; font-weight: 700; opacity: 0.85; }

.bt-delivery-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; }
.bt-delivery-col { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.bt-delivery-col span { font-size: 0.64rem; color: #94a3b8; text-transform: uppercase; font-weight: 600; }
.bt-delivery-value { display: flex; align-items: center; gap: 5px; font-size: 0.8rem; font-weight: 700; min-width: 0; }
.bt-value-blue { color: #0021b3; font-family: 'Consolas', 'SFMono-Regular', monospace; }
.bt-value-yellow { color: #b45309; }
.bt-value-green { color: #15803d; }
.bt-value-purple { color: #7e22ce; }
.bt-ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bt-delivery-empty { flex: 1; display: flex; align-items: center; justify-content: center; color: #94a3b8;
  font-size: 0.8rem; font-style: italic; text-align: center; padding: 10px 0; }

.bt-table-title { font-size: 0.8rem; font-weight: 700; color: #0f172a; margin-bottom: 8px; }
.bt-table-wrap { border-radius: 10px; border: 1px solid #e2e8f0; background: #fff; }
.bt-table { width: 100%; table-layout: auto; border-collapse: separate; border-spacing: 0; font-size: 0.72rem; text-align: left; }
.bt-table thead tr { color: #64748b; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
.bt-table th { padding: 8px 6px; font-weight: 700; text-transform: uppercase; white-space: nowrap; }
.bt-table td { padding: 6px 6px; border-bottom: 1px solid #f1f5f9; white-space: nowrap; }
.bt-table td.bt-wrap { white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
.bt-table tbody tr:hover { background: #f8fafc; }
.bt-center { text-align: center; }
.bt-mono { font-family: 'Consolas', 'SFMono-Regular', monospace; color: #334155; }
.bt-strong { font-weight: 700; color: #0f172a; }
.bt-muted { color: #94a3b8; }
.bt-sortable { cursor: pointer; color: #0021b3; user-select: none; }
.bt-sortable-inner { display: inline-flex; align-items: center; gap: 4px; }

.bt-source-badge { padding: 2px 6px; border-radius: 4px; font-size: 0.66rem; font-weight: 700; white-space: nowrap; }
.bt-source-plant { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
.bt-source-dc { background: #eef2ff; color: #0021b3; border: 1px solid #c7d2fe; }
.bt-jdge-badge { padding: 2px 5px; border-radius: 4px; font-size: 0.68rem; font-weight: 700; }
.bt-jdge-ok { background: #dcfce7; color: #15803d; }
.bt-jdge-bad { background: #fee2e2; color: #b91c1c; }
.bt-loc-badge { padding: 2px 5px; border-radius: 4px; font-family: 'Consolas', monospace; font-weight: 600;
  background: #f1f5f9; color: #475569; }
.bt-loc-customer { background: #fef3c7; color: #92400e; }
.bt-inline-icon { display: inline-flex; align-items: center; gap: 4px; }

.bt-mobile-list { display: none; flex-direction: column; gap: 10px; }
.bt-mobile-row { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px 12px; }
.bt-mobile-row-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 0.72rem; color: #94a3b8; }
.bt-mobile-row-main { display: flex; flex-direction: column; margin-bottom: 8px; }
.bt-mobile-row-main strong { color: #0f172a; font-size: 0.9rem; }
.bt-mobile-row-main span { color: #475569; font-size: 0.76rem; }
.bt-mobile-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.bt-mobile-grid > div { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.bt-mobile-grid span { font-size: 0.62rem; color: #94a3b8; text-transform: uppercase; }
.bt-mobile-grid strong { font-size: 0.78rem; color: #0f172a; overflow-wrap: anywhere; }

@media (max-width: 720px) {
  .bt-page { padding: 10px; }
  .bt-header h1 { font-size: 18px; }
  .bt-search-card { padding: 10px; }
  .bt-btn-cari { flex: 1 1 100%; }
  .bt-btn-hapus { flex: 1 1 100%; }
  .bt-table-wrap { display: none; }
  .bt-mobile-list { display: flex; }
  .bt-timeline-card, .bt-delivery-card { flex: 1 1 100%; }
}
`;
