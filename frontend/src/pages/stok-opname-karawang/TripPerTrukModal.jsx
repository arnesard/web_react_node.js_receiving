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
import { Truck, PackageSearch, X, Download } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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

  // Dikelompokin per truk (trip.truck, hasil pilih di "Pilih Truk") --
  // BUKAN dinomorin per-trip kayak sebelumnya. Jadi kalau 3 trip
  // dipilihin truk yang sama ("Truk 2" misalnya), ketiganya nampil
  // gabung di 1 kartu "Truk 2".
  const truckGroupsMap = new Map();
  filledTrips.forEach((trip) => {
    const label = (trip.truck || "").trim() || "Belum Dipilih Truk";
    if (!truckGroupsMap.has(label)) truckGroupsMap.set(label, []);
    truckGroupsMap.get(label).push(trip);
  });

  const truckGroups = Array.from(truckGroupsMap.entries()).sort((a, b) => {
    const numA = Number(a[0].match(/^Truk\s+(\d+)$/i)?.[1]);
    const numB = Number(b[0].match(/^Truk\s+(\d+)$/i)?.[1]);
    if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB;
    if (!Number.isNaN(numA)) return -1;
    if (!Number.isNaN(numB)) return 1;
    return a[0].localeCompare(b[0]);
  });

  // Export "Trip per Truk" ke PDF -- 1 tabel per truk (No Trip, Item,
  // Deskripsi, Qty, Volume), plus ringkasan total di paling atas. Dibikin
  // pake jspdf-autotable (bukan screenshot DOM) biar hasilnya rapi buat
  // dicetak/di-print ulang, bukan cuma foto layar.
  const handleExportPdf = () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const today = new Date();
    const todayStr = `${String(today.getDate()).padStart(2, "0")}/${String(
      today.getMonth() + 1,
    ).padStart(2, "0")}/${today.getFullYear()}`;

    doc.setFontSize(14);
    doc.setFont(undefined, "bold");
    doc.text("Trip per Truk - Transfer Plan Karawang", 40, 40);
    doc.setFontSize(9);
    doc.setFont(undefined, "normal");
    doc.text(
      `Dicetak: ${todayStr}  |  ${truckGroups.length} truk, ${filledTrips.length} DN, total ${fmtVol(totalVolumeAll)} m3`,
      40,
      56,
    );

    let cursorY = 72;

    truckGroups.forEach(([truckLabel, tripsInTruck]) => {
      const truckVolume = tripsInTruck.reduce(
        (sum, t) =>
          sum +
          (t.items || []).reduce(
            (s, it) => s + Number(it.total_volume ?? 0),
            0,
          ),
        0,
      );

      const rows = [];
      tripsInTruck.forEach((trip) => {
        (trip.items || []).forEach((it) => {
          rows.push([
            trip.no_trip || "-",
            it.item || "-",
            it.deskripsi || "-",
            fmt(it.qty),
            fmtVol(it.total_volume),
          ]);
        });
      });

      autoTable(doc, {
        startY: cursorY,
        margin: { left: 40, right: 40 },
        head: [
          [
            `${truckLabel} (${tripsInTruck.length} trip, ${fmtVol(truckVolume)} m3)`,
            "",
            "",
            "",
            "",
          ],
        ],
        body: [["No Trip", "Item", "Deskripsi", "Qty", "Vol (m3)"], ...rows],
        theme: "grid",
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: {
          fillColor: [67, 56, 202],
          textColor: 255,
          fontStyle: "bold",
        },
        didParseCell: (data) => {
          // Baris pertama body (label kolom) ditebelin biar beda sama
          // baris data biasa -- karena head[] cuma dipakai buat judul
          // truk (colspan), bukan label kolom aslinya.
          if (data.row.index === 0 && data.section === "body") {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = [241, 245, 249];
          }
        },
        didDrawPage: (data) => {
          cursorY = data.cursor.y + 14;
        },
      });

      cursorY = doc.lastAutoTable.finalY + 14;

      // Mulai halaman baru kalau ruang sisa udah mepet.
      if (cursorY > doc.internal.pageSize.getHeight() - 80) {
        doc.addPage();
        cursorY = 40;
      }
    });

    doc.save(`trip-per-truk_${todayStr.replace(/\//g, "-")}.pdf`);
  };

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

            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              {filledTrips.length > 0 && (
                <button
                  type="button"
                  onClick={handleExportPdf}
                  title="Download PDF"
                  style={{
                    height: 34,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "0 12px",
                    border: "1px solid #bfdbfe",
                    background: "#eff6ff",
                    color: "#1d4ed8",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 12.5,
                    fontWeight: 700,
                  }}
                >
                  <Download size={15} />
                  PDF
                </button>
              )}

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
                {truckGroups.length} truk &middot; {filledTrips.length} trip
                &middot; total {fmtVol(totalVolumeAll)} m&sup3;
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
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 10,
            }}
          >
            {truckGroups.map(([truckLabel, tripsInTruck]) => {
              const isUnassigned = truckLabel === "Belum Dipilih Truk";
              const truckVolume = tripsInTruck.reduce(
                (sum, t) =>
                  sum +
                  (t.items || []).reduce(
                    (s, it) => s + Number(it.total_volume ?? 0),
                    0,
                  ),
                0,
              );

              return (
                <div
                  key={truckLabel}
                  style={{
                    border: `1px solid ${isUnassigned ? "#fecaca" : "#e2e8f0"}`,
                    borderRadius: 9,
                    padding: "8px 9px",
                    background: isUnassigned ? "#fef2f2" : "#f8fafc",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  {/* Header kartu: nama truk + jumlah trip di dalamnya */}
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
                        background: isUnassigned ? "#fee2e2" : "#eef2ff",
                        color: isUnassigned ? "#b91c1c" : "#4338ca",
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
                          color: isUnassigned ? "#b91c1c" : "#0f172a",
                        }}
                      >
                        {truckLabel}
                      </div>
                      <div style={{ fontSize: 9, color: "#64748b" }}>
                        {tripsInTruck.length} trip
                      </div>
                    </div>
                  </div>

                  {/* Tiap trip di dalam truk ini, masing2 dengan daftar itemnya */}
                  {tripsInTruck.map((trip) => {
                    const items = trip.items || [];
                    const totalVolume = items.reduce(
                      (s, it) => s + Number(it.total_volume ?? 0),
                      0,
                    );

                    return (
                      <div
                        key={trip.id}
                        style={{
                          borderTop: "1px dashed #e2e8f0",
                          paddingTop: 5,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            color: "#64748b",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            marginBottom: 3,
                          }}
                          title={trip.no_trip}
                        >
                          {trip.no_trip || "-"}
                        </div>

                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
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

                        <div
                          style={{
                            display: "flex",
                            justifyContent: "flex-end",
                            fontSize: 8.5,
                            color: "#16a34a",
                            fontWeight: 700,
                            marginTop: 2,
                          }}
                        >
                          {fmtVol(totalVolume)} m&sup3;
                        </div>
                      </div>
                    );
                  })}

                  {/* Footer kartu: total volume seluruh trip di truk ini */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: 9.5,
                      borderTop: "1px solid #e2e8f0",
                      paddingTop: 5,
                      marginTop: 1,
                    }}
                  >
                    <span style={{ color: "#64748b", fontWeight: 700 }}>
                      Total Vol Truk
                    </span>
                    <span style={{ fontWeight: 800, color: "#16a34a" }}>
                      {fmtVol(truckVolume)} m&sup3;
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
