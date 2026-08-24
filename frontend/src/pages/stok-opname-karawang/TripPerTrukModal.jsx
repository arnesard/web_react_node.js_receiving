// src/pages/stok-opname-karawang/TripPerTrukModal.jsx
// Modal "Trip per Truk" — dipanggil dari dalam halaman Transfer Plan
// (tombol di sebelah "Kelola Master Tire-Tube"), bukan halaman/menu
// terpisah. Rekap jumlah trip tiap truk (nopol) hari ini, beserta item +
// ukuran ban + qty per trip.
// Sumber data: API "Monitoring Transfer" milik server Cross Docking
// (lihat backend: CrossDockingClient.fetchTransferOrders,
// KarawangTripPerTrukModel) — BUKAN dari Tire Trip Plan lokal, ini rekap
// trip yang BENERAN udah jalan di lapangan.
import { useState, useEffect, useCallback } from "react";
import {
  Truck,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  PackageSearch,
  X,
} from "lucide-react";
import api from "../../api/axiosInstance";

const STATUS_COLOR = {
  FINISHED: { bg: "#dcfce7", text: "#166534" },
  LOADING: { bg: "#dbeafe", text: "#1d4ed8" },
  WAITING: { bg: "#fef3c7", text: "#b45309" },
  PROBLEM: { bg: "#fee2e2", text: "#b91c1c" },
};

const fmt = (n) => Number(n || 0).toLocaleString("id-ID");

export default function TripPerTrukModal({ onClose }) {
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
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(3px)",
        WebkitBackdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 16,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          width: "100%",
          maxWidth: 900,
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 25px 70px rgba(0,0,0,0.25)",
        }}
      >
        <div style={{ padding: "20px 24px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 12,
              marginBottom: 18,
            }}
          >
            <div>
              <h2
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 19,
                  fontWeight: 800,
                  color: "#0f172a",
                  margin: 0,
                }}
              >
                <Truck size={20} />
                Trip per Truk
              </h2>
              <p style={{ fontSize: 12.5, color: "#64748b", margin: "4px 0 0" }}>
                Dalam 1 truk (nopol) hari ini ada berapa trip, beserta item,
                ukuran ban, dan qty per trip — data live Monitoring Transfer.
              </p>
            </div>

            <button
              type="button"
              onClick={() => onClose?.()}
              title="Tutup"
              style={{
                height: 34,
                width: 34,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid #cbd5e1",
                background: "#fff",
                color: "#334155",
                borderRadius: 8,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <X size={16} />
            </button>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 10,
              flexWrap: "wrap",
              marginBottom: 14,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#94a3b8",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Tanggal
              </span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={{
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  padding: "6px 8px",
                  fontSize: 12,
                  color: "#334155",
                }}
              />
            </div>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                border: "1px solid #cbd5e1",
                background: "#f8fafc",
                color: "#334155",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
              }}
            >
              <RefreshCw
                size={14}
                style={
                  loading
                    ? { animation: "tpt-spin 0.8s linear infinite" }
                    : undefined
                }
              />
              {loading ? "Memuat..." : "Refresh"}
            </button>
            <style>{`@keyframes tpt-spin { to { transform: rotate(360deg); } }`}</style>

            {!loading && trucks.length > 0 && (
              <span
                style={{
                  fontSize: 12,
                  color: "#64748b",
                  fontWeight: 700,
                  marginLeft: "auto",
                }}
              >
                {trucks.length} truk &middot; {totalTrip} trip total
              </span>
            )}
          </div>

          {error && (
            <div
              style={{
                background: "#fef2f2",
                color: "#b91c1c",
                border: "1px solid #fecaca",
                borderRadius: 10,
                padding: "10px 12px",
                fontSize: 12.5,
                marginBottom: 12,
              }}
            >
              {error}
            </div>
          )}

          {!loading && !error && trucks.length === 0 && (
            <div
              style={{
                textAlign: "center",
                padding: "2.5rem 1rem",
                color: "#94a3b8",
                fontSize: 13.5,
              }}
            >
              <PackageSearch
                size={28}
                style={{ marginBottom: 8, opacity: 0.6 }}
              />
              <div>Belum ada data trip untuk tanggal ini.</div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {trucks.map((truk) => {
              const isOpen = expanded.has(truk.nopol);
              return (
                <div
                  key={truk.nopol}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 12,
                  }}
                >
                  <div
                    onClick={() => toggleTruk(truk.nopol)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      cursor: "pointer",
                      padding: "12px 14px",
                    }}
                  >
                    <Truck size={17} color="#0021b3" />
                    <div style={{ flex: 1 }}>
                      <div
                        style={{ fontWeight: 800, fontSize: 13.5, color: "#0f172a" }}
                      >
                        {truk.nopol}
                      </div>
                      <div style={{ fontSize: 11.5, color: "#64748b" }}>
                        Request {fmt(truk.total_requested)} &middot; Actual{" "}
                        {fmt(truk.total_actual)}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: "#4338ca",
                        background: "#eef2ff",
                        padding: "4px 10px",
                        borderRadius: 999,
                      }}
                    >
                      {truk.jumlah_trip} trip
                    </span>
                    {isOpen ? (
                      <ChevronUp size={16} color="#64748b" />
                    ) : (
                      <ChevronDown size={16} color="#64748b" />
                    )}
                  </div>

                  {isOpen && (
                    <div
                      style={{
                        padding: "0 14px 14px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                      }}
                    >
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
                              background: "#f8fafc",
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
                              <span
                                style={{
                                  fontWeight: 800,
                                  color: "#0021b3",
                                  fontSize: 12.5,
                                }}
                              >
                                {trip.loadId}
                              </span>
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
                              <span
                                style={{
                                  fontSize: 11.5,
                                  color: "#94a3b8",
                                  marginLeft: "auto",
                                }}
                              >
                                {trip.sopir !== "-" ? `Sopir: ${trip.sopir}` : ""}
                              </span>
                            </div>
                            <div style={{ overflowX: "auto" }}>
                              <table
                                style={{
                                  width: "100%",
                                  minWidth: 440,
                                  borderCollapse: "collapse",
                                  fontSize: 11.5,
                                }}
                              >
                                <thead>
                                  <tr>
                                    <th style={thStyle}>Item</th>
                                    <th style={thStyle}>Ukuran Ban</th>
                                    <th style={thStyle}>Req</th>
                                    <th style={thStyle}>Actual</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {trip.items.map((it, idx) => (
                                    <tr key={`${trip.loadId}-${it.item}-${idx}`}>
                                      <td style={tdStyle}>{it.item}</td>
                                      <td style={tdStyle}>{it.ukuran}</td>
                                      <td style={tdStyle}>{fmt(it.requested)}</td>
                                      <td style={tdStyle}>{fmt(it.actual)}</td>
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
        </div>
      </div>
    </div>
  );
}

const thStyle = {
  textAlign: "left",
  padding: "6px 8px",
  fontSize: 10,
  fontWeight: 700,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  borderBottom: "1px solid #e2e8f0",
  whiteSpace: "nowrap",
};

const tdStyle = {
  padding: "6px 8px",
  borderBottom: "1px solid #e2e8f0",
  color: "#334155",
  fontFamily: "'Consolas','SFMono-Regular',monospace",
};
