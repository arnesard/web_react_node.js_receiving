// src/pages/stok-opname-karawang/TripPerTrukModal.jsx
// Modal "Trip per Truk" — dipanggil dari dalam halaman Transfer Plan
// (tombol di sebelah "Kelola Master Tire-Tube"). Nampilin rekap tiap
// truk/trip yang LAGI ditampilkan di halaman Transfer Plan (`manualTrips`
// dikirim dari parent lewat prop `trips`) — baik hasil "Rencana Transfer"
// (auto-generate) MAUPUN yang udah diedit manual (tambah/hapus item).
//
// BUKAN lagi ambil dari API Cross Docking / Monitoring Transfer (data
// live lapangan) — sekarang murni cerminan trip yang lagi disusun user
// di halaman ini, jadi selalu sinkron sama apa yang bakal di-print RMB.
import { Truck, PackageSearch, X } from "lucide-react";

const fmt = (n) => Number(n || 0).toLocaleString("id-ID");
const fmtVol = (n) =>
  Number(n || 0).toLocaleString("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function TripPerTrukModal({ trips = [], onClose }) {
  // Cuma truk/trip yang udah ada isinya yang ditampilkan (trip kosong
  // gak dianggap "truk" — belum ada barang buat dimuat).
  const filledTrips = trips.filter((t) => (t.items || []).length > 0);

  const totalVolumeAll = filledTrips.reduce(
    (sum, t) =>
      sum +
      (t.items || []).reduce((s, it) => s + Number(it.total_volume ?? 0), 0),
    0,
  );

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
          maxWidth: "calc(100vw - 32px)",
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
              <p
                style={{ fontSize: 12.5, color: "#64748b", margin: "4px 0 0" }}
              >
                Rekap truk 1 s/d truk terakhir dari Trip Plan yang lagi disusun
                di halaman ini (hasil generate otomatis / yang sudah diedit
                manual).
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

          {filledTrips.length > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                marginBottom: 14,
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>
                {filledTrips.length} truk &middot; total{" "}
                {fmtVol(totalVolumeAll)} m&sup3;
              </span>
            </div>
          )}

          {filledTrips.length === 0 && (
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
              <div>Belum ada trip berisi item di Trip Plan saat ini.</div>
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
              gap: 8,
            }}
          >
            {filledTrips.map((trip, idx) => {
              const items = trip.items || [];
              const totalVolume = items.reduce(
                (s, it) => s + Number(it.total_volume ?? 0),
                0,
              );

              return (
                <div
                  key={trip.id}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 9,
                    padding: "8px 9px",
                    background: "#f8fafc",
                    display: "flex",
                    flexDirection: "column",
                    gap: 5,
                  }}
                >
                  {/* Header kartu: Truk ke-N + No Trip */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 6,
                        background: "#eef2ff",
                        color: "#4338ca",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Truck size={11} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 800,
                          fontSize: 10.5,
                          color: "#0f172a",
                        }}
                      >
                        Truk {idx + 1}
                      </div>
                      <div
                        style={{
                          fontSize: 9,
                          color: "#64748b",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        title={trip.no_trip}
                      >
                        {trip.no_trip || "-"}
                      </div>
                    </div>
                  </div>

                  {/* Daftar item: kode item + ukuran/deskripsi + qty */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      borderTop: "1px dashed #e2e8f0",
                      borderBottom: "1px dashed #e2e8f0",
                      padding: "5px 0",
                    }}
                  >
                    {items.map((it, i) => (
                      <div
                        key={`${trip.id}-${it.item}-${i}`}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 0,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "baseline",
                            gap: 6,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 9.5,
                              fontWeight: 800,
                              color: "#1d4ed8",
                              fontFamily:
                                "'Consolas','SFMono-Regular',monospace",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={it.item}
                          >
                            {it.item}
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: "#0f172a",
                              flexShrink: 0,
                            }}
                          >
                            {fmt(it.qty)}
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: 9,
                            color: "#64748b",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={it.deskripsi || ""}
                        >
                          {it.deskripsi || "-"}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Footer kartu: total volume */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: 9.5,
                    }}
                  >
                    <span style={{ color: "#64748b", fontWeight: 700 }}>
                      Vol
                    </span>
                    <span style={{ fontWeight: 800, color: "#16a34a" }}>
                      {fmtVol(totalVolume)} m&sup3;
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
