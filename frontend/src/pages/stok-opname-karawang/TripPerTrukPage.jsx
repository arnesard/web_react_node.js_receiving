// src/pages/stok-opname-karawang/TripPerTrukPage.jsx
// Report "Trip per Truk" — dalam 1 truk (nopol) hari itu ada berapa trip
// (no trip/loadId), beserta item + ukuran ban + qty per trip.
// Sumber data: API "Monitoring Transfer" milik server Cross Docking
// (lihat backend: CrossDockingClient.fetchTransferOrders,
// KarawangTripPerTrukModel) — BUKAN dari Tire Trip Plan lokal punya
// modul ini, ini rekap trip yang BENERAN udah jalan di lapangan.
import { useState, useEffect, useCallback } from "react";
import { Truck, ChevronDown, ChevronUp, RefreshCw, PackageSearch } from "lucide-react";
import api from "../../api/axiosInstance";
import KarawangSubNav from "./KarawangSubNav";
import { karawangStyles } from "./karawangStyles";

const STATUS_COLOR = {
  FINISHED: { bg: "#dcfce7", text: "#166534" },
  LOADING: { bg: "#dbeafe", text: "#1d4ed8" },
  WAITING: { bg: "#fef3c7", text: "#b45309" },
  PROBLEM: { bg: "#fee2e2", text: "#b91c1c" },
};

const fmt = (n) => Number(n || 0).toLocaleString("id-ID");

export default function TripPerTrukPage() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [trucks, setTrucks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/stok-opname-karawang/trip-per-truk", {
        params: { date },
      });
      setTrucks(res.data?.data?.trucks || []);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          "Gagal mengambil data Trip per Truk",
      );
      setTrucks([]);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleTruk = (nopol) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(nopol)) next.delete(nopol);
      else next.add(nopol);
      return next;
    });
  };

  const totalTrip = trucks.reduce((s, t) => s + t.jumlah_trip, 0);

  return (
    <div className="ko-page ko-page-wide">
      <style>{karawangStyles}</style>
      <KarawangSubNav />

      <div className="ko-header">
        <h1>Trip per Truk</h1>
        <p>
          Rekap jumlah trip tiap truk (nopol) hari ini, beserta item, ukuran
          ban, dan qty per trip — dari data live Monitoring Transfer.
        </p>
      </div>

      <div className="ko-card">
        <div className="ko-table-toolbar">
          <div className="ko-date-field">
            <span className="ko-date-field-label">Tanggal</span>
            <input
              type="date"
              className="ko-date-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="ko-btn-secondary"
            onClick={load}
            disabled={loading}
            style={{ marginLeft: "auto" }}
          >
            <RefreshCw size={14} className={loading ? "ko-spin" : ""} />
            {loading ? "Memuat..." : "Refresh"}
          </button>
        </div>
        {!loading && trucks.length > 0 && (
          <div className="ko-table-info">
            {trucks.length} truk &middot; {totalTrip} trip total
          </div>
        )}
      </div>

      {error && (
        <div className="ko-card" style={{ color: "#b91c1c", fontSize: 13 }}>
          {error}
        </div>
      )}

      {!loading && !error && trucks.length === 0 && (
        <div className="ko-card">
          <div className="ko-empty">
            <PackageSearch size={28} style={{ marginBottom: 8, opacity: 0.6 }} />
            <div>Belum ada data trip untuk tanggal ini.</div>
          </div>
        </div>
      )}

      {trucks.map((truk) => {
        const isOpen = expanded.has(truk.nopol);
        return (
          <div className="ko-card" key={truk.nopol}>
            <div
              onClick={() => toggleTruk(truk.nopol)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
              }}
            >
              <Truck size={18} color="#0021b3" />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: "#0f172a" }}>
                  {truk.nopol}
                </div>
                <div style={{ fontSize: 11.5, color: "#64748b" }}>
                  {truk.jumlah_trip} trip &middot; Request {fmt(truk.total_requested)}{" "}
                  &middot; Actual {fmt(truk.total_actual)}
                </div>
              </div>
              <span className="ko-batch-badge" style={{ margin: 0 }}>
                {truk.jumlah_trip} trip
              </span>
              {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>

            {isOpen && (
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                {truk.trips.map((trip) => {
                  const color = STATUS_COLOR[trip.status] || {
                    bg: "#f1f5f9",
                    text: "#475569",
                  };
                  return (
                    <div
                      key={trip.loadId}
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: 10,
                        padding: "10px 12px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexWrap: "wrap",
                          marginBottom: 8,
                        }}
                      >
                        <span className="ko-strong">{trip.loadId}</span>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 800,
                            textTransform: "uppercase",
                            padding: "2px 8px",
                            borderRadius: 999,
                            background: color.bg,
                            color: color.text,
                          }}
                        >
                          {trip.status}
                        </span>
                        <span style={{ fontSize: 11.5, color: "#94a3b8", marginLeft: "auto" }}>
                          {trip.sopir !== "-" ? `Sopir: ${trip.sopir}` : ""}
                        </span>
                      </div>
                      <div className="ko-table-scroll">
                        <table className="ko-data-table ko-trip-table">
                          <thead>
                            <tr>
                              <th>Item</th>
                              <th>Ukuran Ban</th>
                              <th>Req</th>
                              <th>Actual</th>
                            </tr>
                          </thead>
                          <tbody>
                            {trip.items.map((it, idx) => (
                              <tr key={`${trip.loadId}-${it.item}-${idx}`}>
                                <td className="ko-mono">{it.item}</td>
                                <td>{it.ukuran}</td>
                                <td className="ko-mono">{fmt(it.requested)}</td>
                                <td className="ko-mono">{fmt(it.actual)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
