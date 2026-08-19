// src/pages/stok-opname-karawang/TransferPlanPage.jsx
// Halaman ini isinya 2 bagian:
// 1. Upload Item Request (Excel) — data disimpan di tabel lokal
//    stok_opname_karawang_item_req, ditampilkan di card ringkasan
//    "Jumlah Item" & "Total Request".
// 2. Tire Trip Planner — bikin rencana trip truk (bin-packing by m³)
//    dari item request jenis TIRE hari ini, digabung juga dengan data
//    Schedule OEM dari bpw_dept_db.sch_oem (lihat KarawangItemRequestModel
//    getTireTripItems di backend).
import { useState, useEffect, useMemo } from "react";
import Swal from "sweetalert2";
import {
  Loader2,
  Upload,
  Download,
  RotateCcw,
  Package,
  Save,
  Filter,
  X,
  History,
  Plus,
  Trash2,
  RefreshCw,
  ArrowRight,
} from "lucide-react";
import api from "../../api/axiosInstance";
import KarawangSubNav from "./KarawangSubNav";
import { karawangStyles } from "./karawangStyles";
import * as XLSX from "xlsx-js-style";

export default function TransferPlanPage() {
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  const [savingTripPlan, setSavingTripPlan] = useState(false);

  const [summaryItemReq, setSummaryItemReq] = useState([]);

  // ============ PREVIEW ITEM REQUEST + STOK TANGERANG/KARAWANG ============
  const [previewItems, setPreviewItems] = useState([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // ============ MANUAL TRIP BUILDER ============
  // manualTrips: [{ id, no_trip, items: [{item, deskripsi, qty, volume, total_volume}] }]
  const [manualTrips, setManualTrips] = useState([]);
  // Input qty & pilihan trip tujuan per baris item di tabel preview.
  const [rowQty, setRowQty] = useState({});
  const [rowTripSelect, setRowTripSelect] = useState({});

  // ============ HISTORI TRIP PLAN (Filter Riwayat) ============
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyDateFrom, setHistoryDateFrom] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [historyDateTo, setHistoryDateTo] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [historyData, setHistoryData] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historySearched, setHistorySearched] = useState(false);
  const [expandedHistoryId, setExpandedHistoryId] = useState(null);

  const loadSummaryItemReq = async () => {
    try {
      const res = await api.get("/stok-opname-karawang/item-req/summary");

      setSummaryItemReq(res.data?.data || []);
    } catch (err) {
      console.error("Gagal mengambil summary item request:", err);
    }
  };

  // Preview item request TIRE hari ini + stok Tangerang (Control Stock) &
  // stok Karawang (Control FIFO), dasar buat milih manual No Trip + item.
  const loadPreview = async () => {
    setLoadingPreview(true);

    try {
      const res = await api.get("/stok-opname-karawang/item-req/preview");

      setPreviewItems(res.data?.data || []);
    } catch (err) {
      Swal.fire(
        "Gagal Memuat Preview",
        err.response?.data?.message || err.message,
        "error",
      );
    } finally {
      setLoadingPreview(false);
    }
  };

  useEffect(() => {
    loadSummaryItemReq();
    loadPreview();
  }, []);

  const handleDownloadTemplate = () => {
    const wb = XLSX.utils.book_new();

    const wsData = [
      ["date", "jenis", "item", "qty", "ket"],
      [new Date(), "TIRE", "IAI1001-0", 10, "Prioritas"],
      [new Date(), "TIRE", "IBD1001-0", 20, ""],
      [new Date(), "TIRE", "IAF1102-0", 20, ""],
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Lebar kolom
    ws["!cols"] = [{ wch: 20 }, { wch: 10 }, { wch: 35 }];

    // Style header
    ["A1", "B1", "C1", "D1", "E1"].forEach((cell) => {
      ws[cell].s = {
        font: {
          bold: true,
          color: { rgb: "FFFFFF" },
        },
        fill: {
          fgColor: { rgb: "2563EB" },
        },
        alignment: {
          horizontal: "center",
          vertical: "center",
        },
        border: {
          top: { style: "thin", color: { rgb: "D1D5DB" } },
          bottom: { style: "thin", color: { rgb: "D1D5DB" } },
          left: { style: "thin", color: { rgb: "D1D5DB" } },
          right: { style: "thin", color: { rgb: "D1D5DB" } },
        },
      };
    });

    XLSX.utils.book_append_sheet(wb, ws, "Item Request");

    XLSX.writeFile(wb, "Template_Item_Request.xlsx");
  };

  const handleUploadFile = async () => {
    if (!uploadFile) {
      Swal.fire(
        "File belum dipilih",
        "Silakan pilih file Excel terlebih dahulu.",
        "warning",
      );
      return;
    }

    // Cegah upload dipanggil dua kali
    if (uploadingFile) return;

    const formData = new FormData();
    formData.append("file", uploadFile);

    setUploadingFile(true);

    try {
      const res = await api.post(
        "/stok-opname-karawang/item-req/upload",
        formData,
      );

      await Swal.fire({
        icon: "success",
        title: "Upload berhasil",
        text: `${res.data?.total || 0} data berhasil dimasukkan.`,
        timer: 5800,
        showConfirmButton: false,
      });

      // Bersihkan state
      setUploadFile(null);
      setShowUploadModal(false);

      await Promise.all([loadSummaryItemReq(), loadPreview()]);
    } catch (err) {
      console.error("UPLOAD ERROR:", err);

      Swal.fire({
        icon: "error",
        title: "Upload gagal",
        text:
          err.response?.data?.message ||
          err.message ||
          "Terjadi kesalahan saat upload.",
      });
    } finally {
      setUploadingFile(false);
    }
  };

  // ===== MANUAL TRIP BUILDER =====
  // Total qty per item yang UDAH dimasukkan ke salah satu trip manual —
  // dipakai buat nampilin "Sisa" di tabel preview (Request - Sudah Masuk Trip).
  const allocatedQtyMap = useMemo(() => {
    const map = {};
    manualTrips.forEach((trip) => {
      trip.items.forEach((item) => {
        map[item.item] = (map[item.item] || 0) + Number(item.qty || 0);
      });
    });
    return map;
  }, [manualTrips]);

  const manualTripTotals = useMemo(() => {
    let totalQty = 0;
    let totalVolume = 0;
    let totalItemLines = 0;

    manualTrips.forEach((trip) => {
      trip.items.forEach((item) => {
        totalQty += Number(item.qty || 0);
        totalVolume += Number(item.total_volume || 0);
        totalItemLines += 1;
      });
    });

    return {
      totalQty,
      totalVolume: Number(totalVolume.toFixed(3)),
      totalItemLines,
      jumlahTrip: manualTrips.filter((t) => t.items.length > 0).length,
    };
  }, [manualTrips]);

  const generateManualDoNumber = (sequence) => {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yy = String(now.getFullYear()).slice(-2);
    const seq = String(sequence).padStart(3, "0");

    return `T-2${dd}${mm}${yy}${seq}`;
  };

  // Bikin trip manual baru (No Trip auto-generate, tapi bisa diedit user).
  const addManualTrip = () => {
    const id = `trip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    setManualTrips((prev) => [
      ...prev,
      {
        id,
        no_trip: generateManualDoNumber(prev.length + 1),
        items: [],
      },
    ]);

    return id;
  };

  const updateManualTripNo = (tripId, value) => {
    setManualTrips((prev) =>
      prev.map((t) => (t.id === tripId ? { ...t, no_trip: value } : t)),
    );
  };

  const removeManualTrip = async (tripId) => {
    const result = await Swal.fire({
      title: "Hapus Trip Ini?",
      text: "Semua item yang sudah dimasukkan ke trip ini akan dihapus.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Ya, Hapus",
      cancelButtonText: "Batal",
      confirmButtonColor: "#dc2626",
    });

    if (!result.isConfirmed) return;

    setManualTrips((prev) => prev.filter((t) => t.id !== tripId));
  };

  const removeItemFromManualTrip = (tripId, itemCode) => {
    setManualTrips((prev) =>
      prev.map((t) =>
        t.id === tripId
          ? { ...t, items: t.items.filter((i) => i.item !== itemCode) }
          : t,
      ),
    );
  };

  // Masukkan 1 baris item preview (dengan qty yang diisi user) ke trip
  // yang dipilih di dropdown baris itu — kalau dropdown-nya "+ Trip Baru"
  // (atau belum ada trip sama sekali), trip baru dibuat dulu on-the-fly.
  const assignItemToTrip = (previewItem) => {
    const qty = Number(rowQty[previewItem.item]);

    if (!qty || qty <= 0) {
      Swal.fire(
        "Qty Belum Diisi",
        "Isi dulu qty yang mau dimasukkan ke trip (lebih dari 0).",
        "warning",
      );
      return;
    }

    const selectedTripId = rowTripSelect[previewItem.item] || "__new__";
    const volume = Number(previewItem.volume || 0);

    setManualTrips((prev) => {
      let trips = prev;
      let targetId = selectedTripId;
      const tripExists = prev.some((t) => t.id === selectedTripId);

      if (selectedTripId === "__new__" || !tripExists) {
        targetId = `trip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        trips = [
          ...prev,
          {
            id: targetId,
            no_trip: generateManualDoNumber(prev.length + 1),
            items: [],
          },
        ];
      }

      return trips.map((t) => {
        if (t.id !== targetId) return t;

        const idx = t.items.findIndex((i) => i.item === previewItem.item);

        if (idx >= 0) {
          const mergedQty = Number(t.items[idx].qty) + qty;
          const items = [...t.items];

          items[idx] = {
            ...items[idx],
            qty: mergedQty,
            total_volume: Number((mergedQty * volume).toFixed(3)),
          };

          return { ...t, items };
        }

        return {
          ...t,
          items: [
            ...t.items,
            {
              item: previewItem.item,
              deskripsi: previewItem.deskripsi,
              qty,
              volume,
              total_volume: Number((qty * volume).toFixed(3)),
            },
          ],
        };
      });
    });

    setRowQty((prev) => ({ ...prev, [previewItem.item]: "" }));
    setRowTripSelect((prev) => ({ ...prev, [previewItem.item]: "__new__" }));
  };

  // Export ke file Excel (.xlsx) beneran — bukan CSV lagi — biar format
  // angka & style header rapi pas dibuka di Excel.
  const exportTripsToExcel = (trips, filenamePrefix = "Trip_Plan") => {
    if (!trips?.length) {
      Swal.fire(
        "Belum Ada Data",
        "Belum ada hasil planning untuk di-export.",
        "warning",
      );
      return;
    }

    const wb = XLSX.utils.book_new();

    const wsData = [["No Trip", "Item", "Description", "Qty", "Kubikasi (m³)"]];

    trips.forEach((trip) => {
      (trip.items || []).forEach((item) => {
        const qty = Number(item.qty || 0);
        const volume = Number(item.volume || 0);
        const kubikasi = Number(item.total_volume ?? qty * volume);

        wsData.push([
          trip.do_number || trip.no_trip || `Trip ${trip.trip || ""}`,
          item.item || "",
          item.deskripsi || "",
          qty,
          Number(kubikasi.toFixed(2)),
        ]);
      });
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    ws["!cols"] = [
      { wch: 16 },
      { wch: 20 },
      { wch: 35 },
      { wch: 10 },
      { wch: 14 },
    ];

    ["A1", "B1", "C1", "D1", "E1"].forEach((cell) => {
      if (!ws[cell]) return;
      ws[cell].s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "2563EB" } },
        alignment: { horizontal: "center", vertical: "center" },
        border: {
          top: { style: "thin", color: { rgb: "D1D5DB" } },
          bottom: { style: "thin", color: { rgb: "D1D5DB" } },
          left: { style: "thin", color: { rgb: "D1D5DB" } },
          right: { style: "thin", color: { rgb: "D1D5DB" } },
        },
      };
    });

    XLSX.utils.book_append_sheet(wb, ws, "Trip Plan");

    XLSX.writeFile(
      wb,
      `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  };

  const handleExportManualTripPlan = () => {
    exportTripsToExcel(
      manualTrips
        .filter((t) => t.items.length > 0)
        .map((t) => ({ do_number: t.no_trip, items: t.items })),
      "Trip_Plan",
    );
  };

  // Simpan semua trip manual yang lagi dibuat ke histori (DB) — No Trip,
  // item, qty, dan total volume tiap trip.
  const handleSaveManualTripPlan = async () => {
    const tripsToSave = manualTrips.filter((t) => t.items.length > 0);

    if (!tripsToSave.length) {
      Swal.fire(
        "Belum Ada Data",
        "Masukkan minimal 1 item ke trip dulu sebelum disimpan.",
        "warning",
      );
      return;
    }

    if (savingTripPlan) return;

    setSavingTripPlan(true);

    try {
      const res = await api.post("/stok-opname-karawang/trip-plan/save", {
        trips: tripsToSave.map((t) => ({
          do_number: t.no_trip,
          items: t.items,
        })),
      });

      await Swal.fire({
        icon: "success",
        title: "Trip Plan Tersimpan",
        text:
          res.data?.data?.message ||
          "Trip Plan berhasil disimpan ke histori.",
        timer: 2200,
        showConfirmButton: false,
      });

      setManualTrips([]);
      setRowQty({});
      setRowTripSelect({});

      await Promise.all([loadSummaryItemReq(), loadPreview()]);
    } catch (err) {
      Swal.fire(
        "Gagal Menyimpan",
        err.response?.data?.message || err.message,
        "error",
      );
    } finally {
      setSavingTripPlan(false);
    }
  };

  // Ambil histori Trip Plan (Filter Riwayat) berdasarkan rentang tanggal.
  const loadTripPlanHistory = async () => {
    setLoadingHistory(true);
    setHistorySearched(true);

    try {
      const res = await api.get("/stok-opname-karawang/trip-plan/history", {
        params: {
          dateFrom: historyDateFrom,
          dateTo: historyDateTo,
        },
      });

      setHistoryData(res.data?.data || []);
    } catch (err) {
      Swal.fire(
        "Gagal Mengambil Histori",
        err.response?.data?.message || err.message,
        "error",
      );
    } finally {
      setLoadingHistory(false);
    }
  };
  const resetManualTripPlan = async () => {
    const result = await Swal.fire({
      title: "Reset Semua Trip?",
      text: "Semua trip manual yang sudah dibuat akan dihapus. Data Item Request tetap aman.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Ya, Reset Semua",
      cancelButtonText: "Batal",
      confirmButtonColor: "#dc2626",
    });

    if (!result.isConfirmed) return;

    setManualTrips([]);
    setRowQty({});
    setRowTripSelect({});

    Swal.fire({
      title: "Trip Berhasil Direset",
      text: "Semua trip sudah dihapus. Item Request tetap tersimpan.",
      icon: "success",
      timer: 1500,
      showConfirmButton: false,
    });
  };

  return (
    <div className="ko-page ko-page-full">
      <style>{karawangStyles}</style>
      <KarawangSubNav />

      <div className="ko-header">
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 16,
          }}
        >
          <div>
            <h1>Transfer Plan</h1>
            <p>
              Upload <strong>Item Request</strong> dan buat{" "}
              <strong>Tire Trip Plan</strong> berdasarkan kapasitas truk.
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => {
                setShowHistoryModal(true);
                if (!historySearched) loadTripPlanHistory();
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                border: "1px solid #cbd5e1",
                background: "#fff",
                color: "#334155",
                borderRadius: 8,
                padding: "9px 16px",
                cursor: "pointer",
                fontSize: 12.5,
                fontWeight: 700,
              }}
            >
              <Filter size={15} />
              Filter Riwayat
            </button>

            <button
              type="button"
              className="ko-btn-primary"
              onClick={() => setShowUploadModal(true)}
              style={{
                width: "auto",
                padding: "9px 16px",
              }}
            >
              <Upload size={15} />
              Upload Item Request
            </button>
          </div>
        </div>
      </div>

      <div
        style={{
          // display: "grid",
          // gridTemplateColumns: "1fr 1fr",
          // gap: 14,
          marginBottom: 20,

          width: "100%",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "4fr 8fr",
            gap: 14,
            marginBottom: 20,
          }}
        >
          {/* ================= JUMLAH ITEM ================= */}
          <div
            style={{
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              padding: "18px 20px",
              boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)",
            }}
          >
            {(() => {
              const totalItem = summaryItemReq.reduce(
                (total, item) => total + Number(item.jumlah_item || 0),
                0,
              );

              return (
                <>
                  {/* HEADER + TOTAL */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 12,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#64748b",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      Jumlah Item
                    </div>

                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 800,
                        color: "#0f172a",
                      }}
                    >
                      {totalItem.toLocaleString("id-ID")}{" "}
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: "#94a3b8",
                        }}
                      >
                        Item
                      </span>
                    </div>
                  </div>

                  {/* BREAKDOWN JENIS */}
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      overflowX: "auto",
                    }}
                  >
                    {summaryItemReq.map((item) => (
                      <div
                        key={item.jenis}
                        style={{
                          flex: 1,
                          minWidth: 60,
                          background: "#f8fafc",
                          border: "1px solid #e2e8f0",
                          borderRadius: 10,
                          padding: "11px 13px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 10.5,
                            fontWeight: 700,
                            color: "#64748b",
                            marginBottom: 6,
                            textTransform: "uppercase",
                          }}
                        >
                          {item.jenis}
                        </div>

                        <div
                          style={{
                            fontSize: 21,
                            fontWeight: 800,
                            color: "#0f172a",
                            lineHeight: 1,
                          }}
                        >
                          {Number(item.jumlah_item || 0).toLocaleString(
                            "id-ID",
                          )}
                        </div>

                        <div
                          style={{
                            fontSize: 10,
                            color: "#94a3b8",
                            marginTop: 5,
                          }}
                        >
                          Item
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>

          {/* ================= TOTAL REQUEST ================= */}
          <div
            style={{
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              padding: "18px 20px",
              boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)",
            }}
          >
            {(() => {
              const totalQty = summaryItemReq.reduce(
                (total, item) => total + Number(item.total_qty || 0),
                0,
              );

              const totalVolume = summaryItemReq.reduce(
                (total, item) => total + Number(item.total_volume || 0),
                0,
              );

              return (
                <>
                  {/* HEADER + TOTAL */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 12,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#64748b",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      Total Request
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        fontSize: 13,
                        fontWeight: 800,
                      }}
                    >
                      <span style={{ color: "#0f172a" }}>
                        {totalQty.toLocaleString("id-ID")}{" "}
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: "#94a3b8",
                          }}
                        >
                          Qty
                        </span>
                      </span>

                      <span style={{ color: "#16a34a" }}>
                        {totalVolume.toLocaleString("id-ID", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{" "}
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                          }}
                        >
                          m³
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* BREAKDOWN JENIS */}
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      overflowX: "auto",
                    }}
                  >
                    {summaryItemReq.map((item) => (
                      <div
                        key={item.jenis}
                        style={{
                          flex: 1,
                          minWidth: 105,
                          background: "#f8fafc",
                          border: "1px solid #e2e8f0",
                          borderRadius: 10,
                          padding: "11px 13px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 10.5,
                            fontWeight: 700,
                            color: "#64748b",
                            marginBottom: 6,
                            textTransform: "uppercase",
                          }}
                        >
                          {item.jenis}
                        </div>

                        {/* QTY | VOLUME */}
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "baseline",
                            gap: 7,
                            whiteSpace: "nowrap",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 21,
                              fontWeight: 800,
                              color: "#0f172a",
                              lineHeight: 1,
                            }}
                          >
                            {Number(item.total_qty || 0).toLocaleString(
                              "id-ID",
                            )}
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                color: "#94a3b8",
                                marginLeft: 4,
                              }}
                            >
                              Qty
                            </span>
                          </div>

                          <div
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: "#16a34a",
                            }}
                          >
                            {Number(item.total_volume || 0).toLocaleString(
                              "id-ID",
                              {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              },
                            )}{" "}
                            m³
                          </div>
                        </div>

                        {/* JUMLAH ITEM */}
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* ================= PREVIEW ITEM REQUEST + STOK ================= */}
      <div
        className="ko-card"
        style={{
          marginTop: 20,
          padding: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", margin: 0 }}>
              Preview Item Request &amp; Stok
            </h2>
            <p style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 4 }}>
              Item TIRE dari Item Request hari ini, lengkap stok Tangerang (Control
              Stock) &amp; stok Karawang (Control FIFO). Pilih No Trip &amp; qty
              manual per item di bawah.
            </p>
          </div>

          <button
            type="button"
            onClick={loadPreview}
            disabled={loadingPreview}
            style={{
              height: 34,
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "0 14px",
              border: "1px solid #cbd5e1",
              background: "#fff",
              color: "#334155",
              borderRadius: 8,
              cursor: loadingPreview ? "not-allowed" : "pointer",
              fontSize: 12,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {loadingPreview ? (
              <Loader2 size={14} className="ko-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            Refresh
          </button>
        </div>

        {loadingPreview && previewItems.length === 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "36px 0",
              color: "#64748b",
              fontSize: 13,
              gap: 8,
            }}
          >
            <Loader2 size={16} className="ko-spin" />
            Memuat preview...
          </div>
        )}

        {!loadingPreview && previewItems.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: "36px 0",
              color: "#94a3b8",
              fontSize: 13,
            }}
          >
            Belum ada Item Request TIRE hari ini. Upload Item Request dulu di
            atas.
          </div>
        )}

        {previewItems.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table className="ko-data-table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Deskripsi</th>
                  <th>Qty Request</th>
                  <th>Sudah Masuk Trip</th>
                  <th>Sisa</th>
                  <th>Stok Tangerang</th>
                  <th>Stok Karawang</th>
                  <th>Qty</th>
                  <th>Masukkan ke Trip</th>
                </tr>
              </thead>

              <tbody>
                {previewItems.map((item) => {
                  const allocated = Number(allocatedQtyMap[item.item] || 0);
                  const sisa = Number(item.qty || 0) - allocated;

                  return (
                    <tr key={item.item}>
                      <td className="ko-mono">{item.item}</td>

                      <td>{item.deskripsi || "-"}</td>

                      <td
                        className="ko-mono"
                        style={{ textAlign: "center", fontWeight: 700 }}
                      >
                        {Number(item.qty || 0).toLocaleString("id-ID")}
                      </td>

                      <td
                        className="ko-mono"
                        style={{
                          textAlign: "center",
                          color: allocated > 0 ? "#2563eb" : "#94a3b8",
                          fontWeight: 700,
                        }}
                      >
                        {allocated.toLocaleString("id-ID")}
                      </td>

                      <td
                        className="ko-mono"
                        style={{
                          textAlign: "center",
                          fontWeight: 800,
                          color:
                            sisa < 0
                              ? "#dc2626"
                              : sisa === 0
                                ? "#16a34a"
                                : "#0f172a",
                        }}
                      >
                        {sisa.toLocaleString("id-ID")}
                      </td>

                      <td
                        className="ko-mono"
                        style={{ textAlign: "center", color: "#475569" }}
                      >
                        {Number(item.stok_tangerang || 0).toLocaleString(
                          "id-ID",
                        )}
                      </td>

                      <td
                        className="ko-mono"
                        style={{ textAlign: "center", color: "#475569" }}
                      >
                        {Number(item.stok_karawang || 0).toLocaleString(
                          "id-ID",
                        )}
                      </td>

                      <td>
                        <input
                          type="number"
                          min={0}
                          placeholder={sisa > 0 ? String(sisa) : "0"}
                          value={rowQty[item.item] ?? ""}
                          onChange={(e) =>
                            setRowQty((prev) => ({
                              ...prev,
                              [item.item]: e.target.value,
                            }))
                          }
                          style={{
                            width: 78,
                            padding: "6px 8px",
                            border: "1px solid #cbd5e1",
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 700,
                            textAlign: "center",
                          }}
                        />
                      </td>

                      <td>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <select
                            value={rowTripSelect[item.item] || "__new__"}
                            onChange={(e) =>
                              setRowTripSelect((prev) => ({
                                ...prev,
                                [item.item]: e.target.value,
                              }))
                            }
                            style={{
                              padding: "6px 8px",
                              border: "1px solid #cbd5e1",
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 600,
                              color: "#334155",
                              minWidth: 130,
                            }}
                          >
                            <option value="__new__">+ Trip Baru</option>
                            {manualTrips.map((trip) => (
                              <option key={trip.id} value={trip.id}>
                                {trip.no_trip}
                              </option>
                            ))}
                          </select>

                          <button
                            type="button"
                            onClick={() => assignItemToTrip(item)}
                            title="Masukkan ke trip"
                            style={{
                              height: 30,
                              width: 30,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              border: "1px solid #bfdbfe",
                              background: "#eff6ff",
                              color: "#1d4ed8",
                              borderRadius: 6,
                              cursor: "pointer",
                              flexShrink: 0,
                            }}
                          >
                            <ArrowRight size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ================= MANUAL TRIP BUILDER ================= */}
      <div
        className="ko-card"
        style={{
          marginTop: 20,
          padding: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", margin: 0 }}>
            Trip Manual
          </h2>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={addManualTrip}
              style={{
                height: 34,
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "0 14px",
                border: "1px solid #bfdbfe",
                background: "#eff6ff",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 700,
                color: "#1d4ed8",
              }}
            >
              <Plus size={14} />
              Tambah Trip Baru
            </button>

            {manualTrips.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={resetManualTripPlan}
                  style={{
                    height: 34,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "0 14px",
                    border: "1px solid #fecaca",
                    background: "#fff",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#dc2626",
                  }}
                >
                  <RotateCcw size={14} />
                  Reset
                </button>

                <button
                  type="button"
                  onClick={handleExportManualTripPlan}
                  style={{
                    height: 34,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "0 14px",
                    border: "1px solid #bbf7d0",
                    background: "#fff",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#15803d",
                  }}
                >
                  <Download size={14} />
                  Export Excel
                </button>

                <button
                  type="button"
                  onClick={handleSaveManualTripPlan}
                  disabled={savingTripPlan}
                  style={{
                    height: 34,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "0 14px",
                    border: "1px solid #93c5fd",
                    background: "#2563eb",
                    borderRadius: 8,
                    cursor: savingTripPlan ? "not-allowed" : "pointer",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#fff",
                    opacity: savingTripPlan ? 0.7 : 1,
                  }}
                >
                  {savingTripPlan ? (
                    <Loader2 size={14} className="ko-spin" />
                  ) : (
                    <Save size={14} />
                  )}
                  {savingTripPlan ? "Menyimpan..." : "Simpan Trip Plan"}
                </button>
              </>
            )}
          </div>
        </div>

        {manualTrips.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 10,
              marginBottom: 18,
            }}
          >
            {[
              ["Trip", manualTripTotals.jumlahTrip],
              ["Baris Item", manualTripTotals.totalItemLines],
              ["Qty", manualTripTotals.totalQty.toLocaleString("id-ID")],
              [
                "Volume",
                `${manualTripTotals.totalVolume.toLocaleString("id-ID", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} m³`,
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  padding: "12px 14px",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    color: "#94a3b8",
                    fontWeight: 600,
                    textTransform: "uppercase",
                  }}
                >
                  {label}
                </div>

                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 800,
                    color: "#0f172a",
                    marginTop: 5,
                  }}
                >
                  {value}
                </div>
              </div>
            ))}
          </div>
        )}

        {manualTrips.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: "36px 0",
              color: "#94a3b8",
              fontSize: 13,
            }}
          >
            Belum ada trip. Klik <strong>Tambah Trip Baru</strong>, atau langsung
            pilih trip dari tabel preview di atas.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {manualTrips.map((trip) => {
            const tripQty = trip.items.reduce(
              (sum, i) => sum + Number(i.qty || 0),
              0,
            );
            const tripVolume = trip.items.reduce(
              (sum, i) => sum + Number(i.total_volume || 0),
              0,
            );

            return (
              <div
                key={trip.id}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 12,
                  overflow: "hidden",
                }}
              >
                {/* TRIP HEADER */}
                <div
                  style={{
                    padding: "10px 14px",
                    background: "#f8fafc",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input
                      type="text"
                      value={trip.no_trip}
                      onChange={(e) =>
                        updateManualTripNo(trip.id, e.target.value)
                      }
                      style={{
                        fontSize: 13.5,
                        fontWeight: 800,
                        color: "#0f172a",
                        border: "1px solid #cbd5e1",
                        borderRadius: 6,
                        padding: "6px 8px",
                        width: 170,
                      }}
                    />

                    <span style={{ fontSize: 11, color: "#94a3b8" }}>
                      {tripQty.toLocaleString("id-ID")} Qty
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 800,
                        color: "#16a34a",
                      }}
                    >
                      {tripVolume.toLocaleString("id-ID", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      m³
                    </div>

                    <button
                      type="button"
                      onClick={() => removeManualTrip(trip.id)}
                      title="Hapus trip"
                      style={{
                        height: 30,
                        width: 30,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: "1px solid #fecaca",
                        background: "#fff",
                        color: "#dc2626",
                        borderRadius: 6,
                        cursor: "pointer",
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* ITEMS */}
                {trip.items.length === 0 ? (
                  <div
                    style={{
                      padding: "16px 14px",
                      color: "#94a3b8",
                      fontSize: 12,
                    }}
                  >
                    Belum ada item di trip ini. Pilih trip ini dari tabel preview
                    di atas.
                  </div>
                ) : (
                  <div style={{ padding: 12 }}>
                    <div style={{ overflowX: "auto" }}>
                      <table className="ko-data-table" style={{ margin: 0 }}>
                        <thead>
                          <tr>
                            <th>Item</th>
                            <th>Deskripsi</th>
                            <th>Qty</th>
                            <th>Vol/Qty</th>
                            <th>Total Volume</th>
                            <th></th>
                          </tr>
                        </thead>

                        <tbody>
                          {trip.items.map((item) => (
                            <tr key={`${trip.id}-${item.item}`}>
                              <td className="ko-mono">{item.item}</td>
                              <td>{item.deskripsi || "-"}</td>
                              <td
                                className="ko-mono"
                                style={{ textAlign: "center", fontWeight: 700 }}
                              >
                                {Number(item.qty || 0).toLocaleString("id-ID")}
                              </td>
                              <td>
                                {Number(item.volume || 0).toLocaleString(
                                  "id-ID",
                                  { minimumFractionDigits: 3, maximumFractionDigits: 3 },
                                )}{" "}
                                m³
                              </td>
                              <td style={{ fontWeight: 700 }}>
                                {Number(item.total_volume || 0).toLocaleString(
                                  "id-ID",
                                  { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                                )}{" "}
                                m³
                              </td>
                              <td>
                                <button
                                  type="button"
                                  onClick={() =>
                                    removeItemFromManualTrip(trip.id, item.item)
                                  }
                                  title="Hapus item dari trip"
                                  style={{
                                    height: 26,
                                    width: 26,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    border: "1px solid #fecaca",
                                    background: "#fff",
                                    color: "#dc2626",
                                    borderRadius: 6,
                                    cursor: "pointer",
                                  }}
                                >
                                  <X size={13} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {showUploadModal && (
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
            if (e.target === e.currentTarget && !uploadingFile) {
              setShowUploadModal(false);
              setUploadFile(null);
            }
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 520,
              background: "#fff",
              borderRadius: 14,
              overflow: "hidden",
              boxShadow: "0 25px 70px rgba(0,0,0,0.25)",
            }}
          >
            {/* ================= HEADER ================= */}
            <div
              style={{
                padding: "18px 20px",
                borderBottom: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: "#eff6ff",
                    color: "#2563eb",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Upload size={20} />
                </div>

                <div>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: 17,
                      fontWeight: 700,
                      color: "#0f172a",
                    }}
                  >
                    Upload Item Request
                  </h2>

                  <p
                    style={{
                      margin: "3px 0 0",
                      fontSize: 12,
                      color: "#64748b",
                    }}
                  >
                    Import item request dari file Excel
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={uploadingFile}
                onClick={() => {
                  setShowUploadModal(false);
                  setUploadFile(null);
                }}
                style={{
                  width: 32,
                  height: 32,
                  border: "none",
                  borderRadius: 7,
                  background: "#f8fafc",
                  color: "#64748b",
                  fontSize: 21,
                  lineHeight: 1,
                  cursor: uploadingFile ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ×
              </button>
            </div>

            {/* ================= BODY ================= */}
            <div style={{ padding: 20 }}>
              {/* TEMPLATE */}
              <div
                style={{
                  border: "1px solid #dbeafe",
                  background: "#f8fbff",
                  borderRadius: 10,
                  padding: 14,
                  marginBottom: 18,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "#1e3a8a",
                        marginBottom: 4,
                      }}
                    >
                      Template Excel
                    </div>

                    <div
                      style={{
                        fontSize: 11.5,
                        lineHeight: 1.5,
                        color: "#64748b",
                      }}
                    >
                      Gunakan template agar format data yang di-upload sesuai.
                    </div>
                  </div>

                  <Download
                    size={18}
                    style={{
                      color: "#2563eb",
                      flexShrink: 0,
                    }}
                  />
                </div>

                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  style={{
                    marginTop: 11,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    border: "1px solid #bfdbfe",
                    background: "#fff",
                    color: "#1d4ed8",
                    borderRadius: 7,
                    padding: "7px 11px",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  <Download size={13} />
                  Download Template
                </button>
              </div>

              {/* FILE UPLOAD */}
              <div>
                <label
                  className="ko-field-label"
                  style={{
                    display: "block",
                    marginBottom: 8,
                  }}
                >
                  File Item Request
                </label>

                <input
                  id="transfer-plan-upload"
                  type="file"
                  accept=".xlsx,.xls"
                  disabled={uploadingFile}
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setUploadFile(file);
                  }}
                  style={{
                    display: "none",
                  }}
                />

                <label
                  htmlFor="transfer-plan-upload"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: 145,
                    border: uploadFile
                      ? "1.5px solid #93c5fd"
                      : "1.5px dashed #cbd5e1",
                    borderRadius: 10,
                    background: uploadFile ? "#f8fbff" : "#fafafa",
                    cursor: uploadingFile ? "not-allowed" : "pointer",
                    transition: "all 0.15s ease",
                    padding: 18,
                    boxSizing: "border-box",
                  }}
                >
                  {uploadFile ? (
                    <>
                      <div
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 10,
                          background: "#eff6ff",
                          color: "#2563eb",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          marginBottom: 9,
                        }}
                      >
                        <Download
                          size={20}
                          style={{
                            transform: "rotate(180deg)",
                          }}
                        />
                      </div>

                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: "#334155",
                          textAlign: "center",
                          wordBreak: "break-word",
                        }}
                      >
                        {uploadFile.name}
                      </div>

                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 11,
                          color: "#64748b",
                        }}
                      >
                        {(uploadFile.size / 1024).toFixed(1)} KB
                      </div>

                      <div
                        style={{
                          marginTop: 8,
                          fontSize: 11,
                          color: "#2563eb",
                          fontWeight: 600,
                        }}
                      >
                        Klik untuk mengganti file
                      </div>
                    </>
                  ) : (
                    <>
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: "50%",
                          background: "#eff6ff",
                          color: "#2563eb",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          marginBottom: 10,
                        }}
                      >
                        <Upload size={20} />
                      </div>

                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#334155",
                        }}
                      >
                        Pilih file Excel
                      </div>

                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 11.5,
                          color: "#94a3b8",
                          textAlign: "center",
                        }}
                      >
                        Klik area ini untuk memilih file
                      </div>

                      <div
                        style={{
                          marginTop: 8,
                          fontSize: 10.5,
                          color: "#94a3b8",
                        }}
                      >
                        Format: .xlsx / .xls
                      </div>
                    </>
                  )}
                </label>
              </div>
            </div>

            {/* ================= FOOTER ================= */}
            <div
              style={{
                padding: "14px 20px",
                borderTop: "1px solid #e2e8f0",
                background: "#fafafa",
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button
                type="button"
                disabled={uploadingFile}
                onClick={() => {
                  setShowUploadModal(false);
                  setUploadFile(null);
                }}
                style={{
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  color: "#475569",
                  borderRadius: 7,
                  padding: "9px 16px",
                  cursor: uploadingFile ? "not-allowed" : "pointer",
                  fontSize: 12.5,
                  fontWeight: 600,
                }}
              >
                Batal
              </button>

              <button
                type="button"
                className="ko-btn-primary"
                disabled={!uploadFile || uploadingFile}
                onClick={handleUploadFile}
                style={{
                  width: "auto",
                  padding: "9px 18px",
                  opacity: !uploadFile || uploadingFile ? 0.5 : 1,
                  cursor:
                    !uploadFile || uploadingFile ? "not-allowed" : "pointer",
                }}
              >
                <Upload size={15} />

                {uploadingFile ? "Mengupload..." : "Upload"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: FILTER RIWAYAT TRIP PLAN ================= */}
      {showHistoryModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 16,
          }}
          onClick={() => setShowHistoryModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 14,
              width: "100%",
              maxWidth: 900,
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 20px 50px rgba(15,23,42,0.25)",
            }}
          >
            {/* HEADER */}
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <History size={18} style={{ color: "#2563eb" }} />
                <span style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>
                  Riwayat Trip Plan
                </span>
              </div>

              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  color: "#64748b",
                  padding: 4,
                  display: "flex",
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* FILTER BAR */}
            <div
              style={{
                padding: "14px 20px",
                borderBottom: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "flex-end",
                gap: 10,
                flexWrap: "wrap",
                background: "#f8fafc",
              }}
            >
              <div>
                <label
                  className="ko-field-label"
                  style={{ display: "block", marginBottom: 6 }}
                >
                  Dari Tanggal
                </label>
                <input
                  type="date"
                  className="ko-input"
                  value={historyDateFrom}
                  onChange={(e) => setHistoryDateFrom(e.target.value)}
                />
              </div>

              <div>
                <label
                  className="ko-field-label"
                  style={{ display: "block", marginBottom: 6 }}
                >
                  Sampai Tanggal
                </label>
                <input
                  type="date"
                  className="ko-input"
                  value={historyDateTo}
                  onChange={(e) => setHistoryDateTo(e.target.value)}
                />
              </div>

              <button
                type="button"
                className="ko-btn-primary"
                onClick={loadTripPlanHistory}
                disabled={loadingHistory}
                style={{ width: "auto", padding: "9px 16px" }}
              >
                {loadingHistory ? (
                  <Loader2 size={15} className="ko-spin" />
                ) : (
                  <Filter size={15} />
                )}
                Cari
              </button>

              {historyData.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    exportTripsToExcel(
                      historyData.map((h) => ({
                        do_number: h.no_trip,
                        items: h.items,
                      })),
                      "Riwayat_Trip_Plan",
                    )
                  }
                  style={{
                    height: 34,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "0 12px",
                    border: "1px solid #bbf7d0",
                    background: "#fff",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#15803d",
                    marginLeft: "auto",
                  }}
                >
                  <Download size={15} />
                  Export Excel
                </button>
              )}
            </div>

            {/* LIST */}
            <div
              style={{
                padding: 20,
                overflowY: "auto",
                flex: 1,
              }}
            >
              {loadingHistory && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "40px 0",
                    color: "#64748b",
                    fontSize: 13,
                    gap: 8,
                  }}
                >
                  <Loader2 size={16} className="ko-spin" />
                  Memuat histori...
                </div>
              )}

              {!loadingHistory && historySearched && historyData.length === 0 && (
                <div
                  style={{
                    textAlign: "center",
                    padding: "40px 0",
                    color: "#94a3b8",
                    fontSize: 13,
                  }}
                >
                  Tidak ada Trip Plan yang tersimpan pada rentang tanggal ini.
                </div>
              )}

              {!loadingHistory && historyData.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  {historyData.map((trip) => {
                    const isExpanded = expandedHistoryId === trip.id;

                    return (
                      <div
                        key={trip.id}
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: 10,
                          overflow: "hidden",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedHistoryId(isExpanded ? null : trip.id)
                          }
                          style={{
                            width: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                            padding: "12px 14px",
                            background: "#f8fafc",
                            border: "none",
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                        >
                          <div>
                            <strong style={{ fontSize: 13.5, color: "#0f172a" }}>
                              {trip.no_trip}
                            </strong>
                            <div
                              style={{
                                fontSize: 11,
                                color: "#94a3b8",
                                marginTop: 3,
                              }}
                            >
                              {trip.tanggal
                                ? String(trip.tanggal).slice(0, 10)
                                : "-"}{" "}
                              · {Number(trip.jumlah_item || 0)} item ·{" "}
                              {Number(trip.total_qty || 0).toLocaleString(
                                "id-ID",
                              )}{" "}
                              Qty
                            </div>
                          </div>

                          <div style={{ textAlign: "right" }}>
                            <div
                              style={{
                                fontSize: 14,
                                fontWeight: 800,
                                color: "#16a34a",
                              }}
                            >
                              {Number(trip.total_volume || 0).toLocaleString(
                                "id-ID",
                                {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                },
                              )}{" "}
                              m³
                            </div>
                            <div style={{ fontSize: 10, color: "#64748b" }}>
                              {Number(trip.utilization || 0)}% terisi
                            </div>
                          </div>
                        </button>

                        {isExpanded && (
                          <div style={{ padding: "10px 14px" }}>
                            <table
                              style={{
                                width: "100%",
                                borderCollapse: "collapse",
                                fontSize: 12,
                              }}
                            >
                              <thead>
                                <tr>
                                  {["Item", "Deskripsi", "Qty", "Volume (m³)"].map(
                                    (h) => (
                                      <th
                                        key={h}
                                        style={{
                                          textAlign:
                                            h === "Item" || h === "Deskripsi"
                                              ? "left"
                                              : "right",
                                          padding: "6px 8px",
                                          color: "#64748b",
                                          fontWeight: 700,
                                          borderBottom: "1px solid #e2e8f0",
                                        }}
                                      >
                                        {h}
                                      </th>
                                    ),
                                  )}
                                </tr>
                              </thead>
                              <tbody>
                                {(trip.items || []).map((item) => (
                                  <tr key={item.id}>
                                    <td style={{ padding: "6px 8px" }}>
                                      {item.item}
                                    </td>
                                    <td style={{ padding: "6px 8px" }}>
                                      {item.deskripsi || "-"}
                                    </td>
                                    <td
                                      style={{
                                        padding: "6px 8px",
                                        textAlign: "right",
                                      }}
                                    >
                                      {Number(item.qty || 0).toLocaleString(
                                        "id-ID",
                                      )}
                                    </td>
                                    <td
                                      style={{
                                        padding: "6px 8px",
                                        textAlign: "right",
                                      }}
                                    >
                                      {Number(
                                        item.total_volume || 0,
                                      ).toLocaleString("id-ID", {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      })}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
