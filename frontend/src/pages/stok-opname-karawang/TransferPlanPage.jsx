// src/pages/stok-opname-karawang/TransferPlanPage.jsx
// "Transfer Plan" = barang pindah Tangerang -> Karawang.
// "Retur"         = barang pindah Karawang -> Tangerang.
// Langsung tercatat pas disubmit (TANPA alur approval) — kalau salah
// input, dihapus aja lewat tombol "Hapus" di baris histori.
//
// Cross Docking di halaman ini CUMA dipakai read-only: pas item dipilih
// dari autocomplete, ditarik info "stok saat ini di Karawang" (qty +
// jumlah lot) sekadar referensi buat operator — TIDAK pernah nulis/update
// apapun ke Cross Docking. Kalau gagal ditarik (mis. API lagi down), form
// tetap bisa disubmit seperti biasa, cuma info referensinya yang gak ada.
import { useState, useEffect, useRef } from "react";
import Swal from "sweetalert2";
import {
  Search,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Trash2,
  User,
  Boxes,
  Upload,
  Download,
  RotateCcw,
  Package,
} from "lucide-react";
import api from "../../api/axiosInstance";
import KarawangSubNav from "./KarawangSubNav";
import { karawangStyles } from "./karawangStyles";
import * as XLSX from "xlsx-js-style";

const KARYAWAN_SESSION_KEY = "karawang_karyawan";

const JENIS_OPTIONS = [
  {
    value: "TRANSFER",
    label: "Transfer",
    sub: "Tangerang → Karawang",
    icon: ArrowRight,
  },
  {
    value: "RETUR",
    label: "Retur",
    sub: "Karawang → Tangerang",
    icon: ArrowLeft,
  },
];

const FILTER_JENIS = [
  { value: "", label: "Semua" },
  { value: "TRANSFER", label: "Transfer" },
  { value: "RETUR", label: "Retur" },
];

function formatWaktu(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TransferPlanPage() {
  // Karyawan yang lagi input — sharing sessionStorage key yang sama kayak
  // halaman Scan, biar kalau udah pernah pilih nama di sana, di sini juga
  // otomatis kepilih, gak perlu input ulang.
  const [karyawan, setKaryawan] = useState(() => {
    const saved = sessionStorage.getItem(KARYAWAN_SESSION_KEY);
    return saved ? JSON.parse(saved) : null;
  });
  const [employees, setEmployees] = useState([]);
  const [karyawanSearch, setKaryawanSearch] = useState("");
  const [showKaryawanDropdown, setShowKaryawanDropdown] = useState(false);

  // Form
  const [jenis, setJenis] = useState("TRANSFER");
  const [itemKeyword, setItemKeyword] = useState("");
  const [itemSuggestions, setItemSuggestions] = useState([]);
  const [showItemSuggest, setShowItemSuggest] = useState(false);
  const [searchingItem, setSearchingItem] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null); // {item, deskripsi}
  const [stockInfo, setStockInfo] = useState(null); // {total_qty, total_lot} | null
  const [loadingStockInfo, setLoadingStockInfo] = useState(false);
  const [qty, setQty] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const itemDebounceRef = useRef(null);
  const itemBoxRef = useRef(null);

  // Histori
  const [filterJenis, setFilterJenis] = useState("");
  const [rows, setRows] = useState([]);
  const [loadingRows, setLoadingRows] = useState(true);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  const [tripCapacity, setTripCapacity] = useState(52);
  const [tireTripPlan, setTireTripPlan] = useState(null);
  const [loadingTripPlan, setLoadingTripPlan] = useState(false);

  const loadHistori = async (jenisFilter) => {
    setLoadingRows(true);
    try {
      const res = await api.get("/stok-opname-karawang/transfer-plan", {
        params: jenisFilter ? { jenis: jenisFilter } : {},
      });
      setRows(res.data?.data || []);
    } catch (err) {
      Swal.fire(
        "Gagal memuat histori",
        err.response?.data?.message || err.message,
        "error",
      );
    } finally {
      setLoadingRows(false);
    }
  };

  const [summaryItemReq, setSummaryItemReq] = useState([]);

  const loadSummaryItemReq = async () => {
    try {
      const res = await api.get("/stok-opname-karawang/item-req/summary");

      setSummaryItemReq(res.data?.data || []);
    } catch (err) {
      console.error("Gagal mengambil summary item request:", err);
    }
  };

  useEffect(() => {
    loadHistori(filterJenis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterJenis]);

  useEffect(() => {
    if (!karyawan) {
      api
        .get("/employees")
        .then((res) => setEmployees(res.data.data || []))
        .catch(() => setEmployees([]));
    }
  }, [karyawan]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (itemBoxRef.current && !itemBoxRef.current.contains(e.target)) {
        setShowItemSuggest(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    loadSummaryItemReq();
  }, []);

  // Autocomplete item (debounce 350ms) — direset tiap kali item yang
  // udah dipilih dibatalkan/diganti (ketik ulang setelah pilih).
  useEffect(() => {
    if (itemDebounceRef.current) clearTimeout(itemDebounceRef.current);
    const kw = itemKeyword.trim();
    if (!kw || selectedItem) {
      setItemSuggestions([]);
      return;
    }
    setSearchingItem(true);
    itemDebounceRef.current = setTimeout(() => {
      api
        .get("/stok-opname-karawang/transfer-plan/search-item", {
          params: { keyword: kw },
        })
        .then((res) => setItemSuggestions(res.data?.data || []))
        .catch(() => setItemSuggestions([]))
        .finally(() => setSearchingItem(false));
    }, 350);
    return () => clearTimeout(itemDebounceRef.current);
  }, [itemKeyword, selectedItem]);

  const pickItem = (it) => {
    setSelectedItem(it);
    setItemKeyword(`${it.item} — ${it.deskripsi}`);
    setShowItemSuggest(false);
    setStockInfo(null);
    setLoadingStockInfo(true);
    api
      .get("/stok-opname-karawang/transfer-plan/stock-info", {
        params: { item: it.item },
      })
      .then((res) => setStockInfo(res.data?.data || null))
      .catch(() => setStockInfo(null)) // gagal ambil info stok bukan blocker, form tetap jalan
      .finally(() => setLoadingStockInfo(false));
  };

  const resetItemSelection = () => {
    setSelectedItem(null);
    setItemKeyword("");
    setStockInfo(null);
  };

  const selectKaryawan = (emp) => {
    const data = { id: emp.id, employee_id: emp.employee_id, name: emp.name };
    sessionStorage.setItem(KARYAWAN_SESSION_KEY, JSON.stringify(data));
    setKaryawan(data);
    setKaryawanSearch("");
    setShowKaryawanDropdown(false);
  };

  const handleGantiKaryawan = () => {
    sessionStorage.removeItem(KARYAWAN_SESSION_KEY);
    setKaryawan(null);
  };

  const filteredEmployees = employees.filter((emp) => {
    const q = karyawanSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      (emp.name || "").toLowerCase().includes(q) ||
      (emp.employee_id || "").toLowerCase().includes(q)
    );
  });

  const resetForm = () => {
    resetItemSelection();
    setQty("");
    setKeterangan("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedItem) {
      Swal.fire("Belum lengkap", "Pilih item dari daftar dulu.", "warning");
      return;
    }
    const qtyNum = Number(qty);
    if (!qtyNum || qtyNum <= 0) {
      Swal.fire("Belum lengkap", "Qty harus diisi angka > 0.", "warning");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/stok-opname-karawang/transfer-plan", {
        jenis,
        item: selectedItem.item,
        qty: qtyNum,
        keterangan: keterangan.trim() || undefined,
        id_karyawan: karyawan?.id,
      });
      Swal.fire({
        icon: "success",
        title:
          jenis === "TRANSFER"
            ? "Transfer berhasil dicatat"
            : "Retur berhasil dicatat",
        timer: 1500,
        showConfirmButton: false,
      });
      resetForm();
      loadHistori(filterJenis);
    } catch (err) {
      Swal.fire(
        "Gagal menyimpan",
        err.response?.data?.message || err.message,
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleHapus = async (row) => {
    const confirm = await Swal.fire({
      icon: "warning",
      title: "Hapus data ini?",
      html: `${row.jenis === "TRANSFER" ? "Transfer" : "Retur"} <b>${row.item}</b> qty ${row.qty} akan dihapus dari histori.`,
      showCancelButton: true,
      confirmButtonText: "Ya, hapus",
      cancelButtonText: "Batal",
      confirmButtonColor: "#dc2626",
    });
    if (!confirm.isConfirmed) return;

    try {
      await api.delete(`/stok-opname-karawang/transfer-plan/${row.id}`);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (err) {
      Swal.fire(
        "Gagal hapus",
        err.response?.data?.message || err.message,
        "error",
      );
    }
  };

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

      await loadSummaryItemReq();

      // Refresh histori
      await loadHistori(filterJenis);
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

  const loadTireTripPlan = async (kapasitas = tripCapacity) => {
    setLoadingTripPlan(true);

    try {
      const res = await api.get(
        "/stok-opname-karawang/item-req/tire-trip-plan",
        {
          params: {
            kapasitas,
          },
        },
      );

      setTireTripPlan(res.data?.data || null);
    } catch (err) {
      Swal.fire(
        "Gagal membuat Trip Plan",
        err.response?.data?.message || err.message,
        "error",
      );
    } finally {
      setLoadingTripPlan(false);
    }
  };

  const updateTripItemQty = (tripNumber, itemCode, change) => {
    setTireTripPlan((prev) => {
      if (!prev) return prev;

      const trips = prev.trips.map((trip) => {
        if (trip.trip !== tripNumber) return trip;

        const items = trip.items.map((item) => {
          if (item.item !== itemCode) return item;

          const currentQty = Number(item.qty || 0);

          let newQty;

          if (change > 0) {
            // +1 → naik ke kelipatan 5 berikutnya
            newQty = Math.ceil((currentQty + 1) / 5) * 5;
          } else {
            // -1 → turun ke kelipatan 5 sebelumnya
            newQty = Math.floor((currentQty - 1) / 5) * 5;
          }

          newQty = Math.max(0, newQty);

          return {
            ...item,
            request_qty: Number(item.request_qty || 0),
            qty: newQty,
            total_volume: newQty * Number(item.volume || 0),
          };
        });

        const totalQty = items.reduce(
          (total, item) => total + Number(item.qty || 0),
          0,
        );

        const totalVolume = items.reduce(
          (total, item) => total + Number(item.total_volume || 0),
          0,
        );

        const utilization =
          tripCapacity > 0
            ? Number(((totalVolume / tripCapacity) * 100).toFixed(1))
            : 0;

        return {
          ...trip,
          items,
          total_qty: totalQty,
          total_volume: totalVolume,
          utilization,
        };
      });

      return {
        ...prev,
        trips,
        total_qty: trips.reduce(
          (total, trip) => total + Number(trip.total_qty || 0),
          0,
        ),
        total_volume: trips.reduce(
          (total, trip) => total + Number(trip.total_volume || 0),
          0,
        ),
      };
    });
  };

  const handleExportTireTripPlan = () => {
    if (!tireTripPlan?.trips?.length) {
      alert("Belum ada hasil planning untuk di-export.");
      return;
    }

    const rows = [];

    // HEADER
    rows.push(["Item", "Description", "Qty", "Kubikasi"]);

    // DATA
    tireTripPlan.trips.forEach((trip) => {
      trip.items.forEach((item) => {
        const qty = Number(item.qty || 0);
        const volume = Number(item.volume || 0);
        const kubikasi = qty * volume;

        rows.push([
          item.item || "",
          item.deskripsi || "",
          qty,
          kubikasi.toFixed(2),
        ]);
      });
    });

    // Convert ke CSV
    const csv = rows
      .map((row) =>
        row
          .map((value) => {
            const text = String(value ?? "");
            return `"${text.replace(/"/g, '""')}"`;
          })
          .join(","),
      )
      .join("\r\n");

    // BOM supaya Excel baca UTF-8 dengan benar
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `Trip_Plan_${new Date().toISOString().slice(0, 10)}.csv`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };
  const resetTireTripPlan = async () => {
    const result = await Swal.fire({
      title: "Reset Semua Trip?",
      text: "Semua trip yang sudah dibuat akan dihapus. Data Item Request tetap aman.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Ya, Reset Semua",
      cancelButtonText: "Batal",
      confirmButtonColor: "#dc2626",
    });

    if (!result.isConfirmed) return;

    // Hapus semua trip dari tampilan
    setTireTripPlan(null);

    Swal.fire({
      title: "Trip Berhasil Direset",
      text: "Semua trip sudah dihapus. Item Request tetap tersimpan.",
      icon: "success",
      timer: 1500,
      showConfirmButton: false,
    });
  };

  const changeTripCapacity = async (next) => {
    const value = Math.max(1, Number(next.toFixed(2)));

    setTripCapacity(value);

    await loadTireTripPlan(value);
  };

  const decreaseTripCapacity = () => {
    changeTripCapacity(tripCapacity - 0.5);
  };

  const increaseTripCapacity = () => {
    changeTripCapacity(tripCapacity + 0.5);
  };

  return (
    <div className="ko-page ko-page-wide">
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
              Catat transaksi <strong>Transfer</strong> (Tangerang → Karawang)
              dan <strong>Retur</strong> (Karawang → Tangerang) antar gudang.
            </p>
          </div>

          <button
            type="button"
            className="ko-btn-primary"
            onClick={() => setShowUploadModal(true)}
            style={{
              width: "auto",
              padding: "9px 16px",
              flexShrink: 0,
            }}
          >
            <Upload size={15} />
            Upload Item Request
          </button>
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

      {/* ================= TIRE TRIP PLANNER ================= */}
      <div
        className="ko-card"
        style={{
          marginTop: 20,
          padding: 20,
        }}
      >
        {/* HEADER */}
        {/* KAPASITAS + RESET */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
          }}
        >
          {/* KURANGI KAPASITAS */}
          <button
            type="button"
            onClick={decreaseTripCapacity}
            style={{
              width: 34,
              height: 34,
              border: "1px solid #cbd5e1",
              background: "#fff",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 20,
              fontWeight: 700,
              color: "#475569",
            }}
          >
            −
          </button>

          {/* KAPASITAS */}
          <div
            style={{
              minWidth: 100,
              textAlign: "center",
              padding: "7px 12px",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
            }}
          >
            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: "#0f172a",
              }}
            >
              {tripCapacity.toFixed(1)}
            </div>

            <div
              style={{
                fontSize: 9,
                color: "#94a3b8",
                fontWeight: 600,
              }}
            >
              m³ / TRIP
            </div>
          </div>

          {/* TAMBAH KAPASITAS */}
          <button
            type="button"
            onClick={increaseTripCapacity}
            style={{
              width: 34,
              height: 34,
              border: "1px solid #cbd5e1",
              background: "#fff",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 20,
              fontWeight: 700,
              color: "#475569",
            }}
          >
            +
          </button>

          {/* RESET TRIP */}
          <button
            type="button"
            onClick={resetTireTripPlan}
            disabled={loadingTripPlan}
            title="Reset Trip Plan"
            style={{
              height: 34,
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "0 12px",
              marginLeft: 4,
              border: "1px solid #fecaca",
              background: "#fff",
              borderRadius: 8,
              cursor: loadingTripPlan ? "not-allowed" : "pointer",
              fontSize: 12,
              fontWeight: 700,
              color: "#dc2626",
              opacity: loadingTripPlan ? 0.6 : 1,
            }}
          >
            <RotateCcw size={15} />
            Reset
          </button>
          {tireTripPlan && (
            <button
              type="button"
              onClick={handleExportTireTripPlan}
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
              }}
              title="Export hasil Trip Plan"
            >
              <Download size={15} />
              Export Hasil
            </button>
          )}
        </div>

        {/* LOAD BUTTON */}
        {!tireTripPlan && (
          <button
            type="button"
            className="ko-btn-primary"
            onClick={() => loadTireTripPlan()}
            disabled={loadingTripPlan}
            style={{
              width: "auto",
            }}
          >
            {loadingTripPlan ? (
              <Loader2 size={15} className="ko-spin" />
            ) : (
              <Package size={15} />
            )}
            Buat Trip Plan
          </button>
        )}

        {/* SUMMARY */}
        {tireTripPlan && (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: 10,
                marginBottom: 18,
              }}
            >
              {[
                ["Item", tireTripPlan.total_item],
                ["Qty", Number(tireTripPlan.total_qty).toLocaleString("id-ID")],
                [
                  "Volume",
                  `${Number(tireTripPlan.total_volume).toLocaleString("id-ID", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })} m³`,
                ],
                ["Trip", tireTripPlan.jumlah_trip],
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

            {/* TRIPS */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              {tireTripPlan.trips.map((trip) => (
                <div
                  key={trip.trip}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 12,
                    overflow: "hidden",
                  }}
                >
                  {/* TRIP HEADER */}
                  <div
                    style={{
                      padding: "12px 14px",
                      background: "#f8fafc",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div>
                      <strong
                        style={{
                          fontSize: 14,
                          color: "#0f172a",
                        }}
                      >
                        Trip {trip.trip}
                      </strong>

                      <div
                        style={{
                          fontSize: 11,
                          color: "#94a3b8",
                          marginTop: 3,
                        }}
                      >
                        {trip.total_qty.toLocaleString("id-ID")} Qty
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div
                        style={{
                          fontSize: 16,
                          fontWeight: 800,
                          color: "#16a34a",
                        }}
                      >
                        {trip.total_volume.toLocaleString("id-ID", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{" "}
                        m³
                      </div>

                      <div
                        style={{
                          fontSize: 10,
                          color: "#64748b",
                        }}
                      >
                        {trip.utilization}% terisi
                      </div>
                    </div>
                  </div>

                  {/* PROGRESS */}
                  <div
                    style={{
                      height: 6,
                      background: "#e2e8f0",
                      margin: "0 14px",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.min(trip.utilization, 100)}%`,
                        background: "#16a34a",
                        transition: "width 0.2s ease",
                      }}
                    />
                  </div>

                  {/* ITEMS */}
                  <div
                    style={{
                      padding: 12,
                    }}
                  >
                    <div
                      style={{
                        overflowX: "auto",
                      }}
                    >
                      <table
                        className="ko-data-table"
                        style={{
                          margin: 0,
                        }}
                      >
                        <thead>
                          <tr>
                            <th>Item</th>
                            <th>Deskripsi</th>
                            <th>Request</th>
                            <th>Actual</th>
                            <th>Selisih</th>
                            <th>Vol/Qty</th>
                            <th>Total Volume</th>
                          </tr>
                        </thead>

                        <tbody>
                          {trip.items.map((item, index) => {
                            const requestQty = Number(item.request_qty || 0);
                            const actualQty = Number(item.qty || 0);
                            const selisih = actualQty - requestQty;

                            return (
                              <tr key={`${trip.trip}-${item.item}-${index}`}>
                                {/* ITEM */}
                                <td className="ko-mono">{item.item}</td>

                                {/* DESKRIPSI */}
                                <td>{item.deskripsi || "-"}</td>

                                {/* REQUEST */}
                                <td
                                  className="ko-mono"
                                  style={{
                                    textAlign: "center",
                                    fontWeight: 700,
                                    color: "#475569",
                                  }}
                                >
                                  {requestQty.toLocaleString("id-ID")}
                                </td>

                                {/* ACTUAL */}
                                <td className="ko-mono">
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      gap: 5,
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {/* MINUS */}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateTripItemQty(
                                          trip.trip,
                                          item.item,
                                          -5,
                                        )
                                      }
                                      disabled={actualQty <= 0}
                                      title="Kurangi 5"
                                      style={{
                                        width: 28,
                                        height: 28,
                                        border: "1px solid #cbd5e1",
                                        background: "#fff",
                                        borderRadius: 6,
                                        cursor:
                                          actualQty <= 0
                                            ? "not-allowed"
                                            : "pointer",
                                        fontSize: 17,
                                        fontWeight: 700,
                                        color:
                                          actualQty <= 0
                                            ? "#cbd5e1"
                                            : "#475569",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                      }}
                                    >
                                      −
                                    </button>

                                    {/* ACTUAL QTY */}
                                    <span
                                      style={{
                                        minWidth: 50,
                                        textAlign: "center",
                                        fontWeight: 800,
                                        color: "#0f172a",
                                      }}
                                    >
                                      {actualQty.toLocaleString("id-ID")}
                                    </span>

                                    {/* PLUS */}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateTripItemQty(
                                          trip.trip,
                                          item.item,
                                          5,
                                        )
                                      }
                                      title="Tambah 5"
                                      style={{
                                        width: 28,
                                        height: 28,
                                        border: "1px solid #cbd5e1",
                                        background: "#fff",
                                        borderRadius: 6,
                                        cursor: "pointer",
                                        fontSize: 17,
                                        fontWeight: 700,
                                        color: "#475569",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                      }}
                                    >
                                      +
                                    </button>
                                  </div>
                                </td>

                                {/* SELISIH */}
                                <td
                                  className="ko-mono"
                                  style={{
                                    textAlign: "center",
                                    fontWeight: 800,
                                    color:
                                      selisih === 0
                                        ? "#16a34a"
                                        : selisih > 0
                                          ? "#2563eb"
                                          : "#dc2626",
                                  }}
                                >
                                  {selisih > 0 ? "+" : ""}
                                  {selisih.toLocaleString("id-ID")}
                                </td>

                                {/* VOLUME / QTY */}
                                <td>
                                  {Number(item.volume || 0).toLocaleString(
                                    "id-ID",
                                    {
                                      minimumFractionDigits: 3,
                                      maximumFractionDigits: 3,
                                    },
                                  )}{" "}
                                  m³
                                </td>

                                {/* TOTAL VOLUME */}
                                <td
                                  style={{
                                    fontWeight: 700,
                                  }}
                                >
                                  {Number(
                                    item.total_volume || 0,
                                  ).toLocaleString("id-ID", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}{" "}
                                  m³
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Karyawan yang lagi input */}
      {!karyawan ? (
        <div className="ko-card" style={{ position: "relative" }}>
          <label className="ko-field-label">
            <User size={12} style={{ verticalAlign: -2 }} /> Input ID Karyawan
          </label>
          <input
            type="text"
            className="ko-text-input"
            placeholder="Ketik nama atau ID karyawan..."
            autoComplete="off"
            value={karyawanSearch}
            onChange={(e) => {
              setKaryawanSearch(e.target.value);
              setShowKaryawanDropdown(true);
            }}
            onFocus={() => setShowKaryawanDropdown(true)}
          />
          {showKaryawanDropdown && (
            <div className="ko-dropdown" style={{ top: "auto" }}>
              {filteredEmployees.length === 0 ? (
                <div className="ko-dropdown-empty">Tidak ditemukan</div>
              ) : (
                filteredEmployees.slice(0, 30).map((emp) => (
                  <div
                    key={emp.id}
                    className="ko-dropdown-item"
                    onMouseDown={() => selectKaryawan(emp)}
                  >
                    <span className="ko-dropdown-id">{emp.employee_id}</span>
                    <span className="ko-dropdown-name">{emp.name}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      ) : (
        <>
          <div
            className="ko-batch-badge"
            style={{ marginBottom: 12, display: "inline-flex" }}
          >
            <User size={13} /> {karyawan.name} ({karyawan.employee_id})
            <button
              type="button"
              className="ko-btn-ganti"
              style={{ marginLeft: 8 }}
              onClick={handleGantiKaryawan}
            >
              Ganti
            </button>
          </div>

          {/* Form input transaksi */}
          <form className="ko-card" onSubmit={handleSubmit}>
            <div className="ko-radio-group" style={{ marginBottom: 16 }}>
              {JENIS_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = jenis === opt.value;
                return (
                  <label
                    key={opt.value}
                    className="ko-radio-option"
                    style={
                      active ? { fontWeight: 700, color: "#0021b3" } : undefined
                    }
                  >
                    <input
                      type="radio"
                      name="jenis"
                      checked={active}
                      onChange={() => setJenis(opt.value)}
                    />
                    <Icon size={14} style={{ verticalAlign: -2 }} /> {opt.label}{" "}
                    <span style={{ color: "#94a3b8", fontWeight: 400 }}>
                      ({opt.sub})
                    </span>
                  </label>
                );
              })}
            </div>

            <div
              ref={itemBoxRef}
              style={{ position: "relative", marginBottom: 14 }}
            >
              <label className="ko-field-label">Item</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Search size={16} style={{ color: "#94a3b8", flexShrink: 0 }} />
                <input
                  type="text"
                  className="ko-text-input"
                  placeholder="Ketik kode item atau deskripsi..."
                  value={itemKeyword}
                  onChange={(e) => {
                    setItemKeyword(e.target.value);
                    setSelectedItem(null);
                    setStockInfo(null);
                    setShowItemSuggest(true);
                  }}
                  onFocus={() => setShowItemSuggest(true)}
                />
              </div>

              {showItemSuggest && itemKeyword.trim() && !selectedItem && (
                <div
                  className="ko-dropdown"
                  style={{ top: "100%", marginTop: 2 }}
                >
                  {searchingItem && (
                    <div className="ko-dropdown-empty">
                      <Loader2 size={14} className="ko-spin" /> Mencari...
                    </div>
                  )}
                  {!searchingItem && itemSuggestions.length === 0 && (
                    <div className="ko-dropdown-empty">
                      Item tidak ditemukan.
                    </div>
                  )}
                  {!searchingItem &&
                    itemSuggestions.map((s) => (
                      <div
                        key={s.item}
                        className="ko-dropdown-item"
                        onMouseDown={() => pickItem(s)}
                      >
                        <span className="ko-dropdown-id">{s.item}</span>
                        <span className="ko-dropdown-name">{s.deskripsi}</span>
                      </div>
                    ))}
                </div>
              )}

              {selectedItem && (
                <div
                  style={{
                    marginTop: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    fontSize: 12.5,
                  }}
                >
                  <span style={{ color: "#64748b" }}>
                    {loadingStockInfo ? (
                      <>
                        <Loader2
                          size={12}
                          className="ko-spin"
                          style={{ verticalAlign: -1 }}
                        />{" "}
                        Mengecek stok Karawang di Cross Docking...
                      </>
                    ) : stockInfo ? (
                      <>
                        <Boxes
                          size={12}
                          style={{ verticalAlign: -1, marginRight: 3 }}
                        />
                        Stok Karawang saat ini (Cross Docking):{" "}
                        <strong>{stockInfo.total_qty}</strong> qty di{" "}
                        {stockInfo.total_lot} lot
                      </>
                    ) : (
                      "Info stok Cross Docking gak tersedia — form tetap bisa disubmit."
                    )}
                  </span>
                  <button
                    type="button"
                    className="ko-btn-ganti"
                    onClick={resetItemSelection}
                  >
                    Ganti Item
                  </button>
                </div>
              )}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "160px 1fr",
                gap: 14,
                marginBottom: 14,
              }}
            >
              <div>
                <label className="ko-field-label">Qty</label>
                <input
                  type="number"
                  min="1"
                  className="ko-text-input"
                  placeholder="0"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
              </div>
              <div>
                <label className="ko-field-label">Keterangan (opsional)</label>
                <input
                  type="text"
                  className="ko-text-input"
                  placeholder="Catatan tambahan..."
                  value={keterangan}
                  onChange={(e) => setKeterangan(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              className="ko-btn-primary"
              disabled={submitting}
              style={{ width: "auto", padding: "10px 24px" }}
            >
              {submitting ? (
                <Loader2 size={16} className="ko-spin" />
              ) : jenis === "TRANSFER" ? (
                <ArrowRight size={16} />
              ) : (
                <ArrowLeft size={16} />
              )}
              Catat {jenis === "TRANSFER" ? "Transfer" : "Retur"}
            </button>
          </form>
        </>
      )}

      {/* Histori */}
      <div className="ko-cd-title-row" style={{ marginTop: 22 }}>
        <div className="ko-header" style={{ marginBottom: 0 }}>
          <h1 style={{ fontSize: 16 }}>Histori Transfer &amp; Retur</h1>
        </div>
        <div className="ko-radio-group">
          {FILTER_JENIS.map((opt) => (
            <label key={opt.value || "all"} className="ko-radio-option">
              <input
                type="radio"
                name="filterJenis"
                checked={filterJenis === opt.value}
                onChange={() => setFilterJenis(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      <div className="ko-card">
        {loadingRows && (
          <div className="ko-empty">
            <Loader2 size={18} className="ko-spin" /> Memuat histori...
          </div>
        )}

        {!loadingRows && rows.length === 0 && (
          <div className="ko-empty">Belum ada transaksi tercatat.</div>
        )}

        {!loadingRows && rows.length > 0 && (
          <div className="ko-table-scroll">
            <table className="ko-data-table">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Jenis</th>
                  <th>Item</th>
                  <th>Deskripsi</th>
                  <th>Qty</th>
                  <th>Keterangan</th>
                  <th>PIC</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{formatWaktu(row.created_at)}</td>
                    <td>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontWeight: 700,
                          color:
                            row.jenis === "TRANSFER" ? "#0021b3" : "#b45309",
                        }}
                      >
                        {row.jenis === "TRANSFER" ? (
                          <ArrowRight size={13} />
                        ) : (
                          <ArrowLeft size={13} />
                        )}
                        {row.jenis === "TRANSFER" ? "Transfer" : "Retur"}
                      </span>
                    </td>
                    <td className="ko-mono">{row.item}</td>
                    <td>{row.deskripsi || "-"}</td>
                    <td className="ko-mono">{row.qty}</td>
                    <td>{row.keterangan || "-"}</td>
                    <td>{row.nama_karyawan || "-"}</td>
                    <td>
                      <button
                        type="button"
                        className="ko-scan-batal"
                        onClick={() => handleHapus(row)}
                        title="Hapus"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
    </div>
  );
}
