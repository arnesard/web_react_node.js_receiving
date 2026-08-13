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
} from "lucide-react";
import api from "../../api/axiosInstance";
import KarawangSubNav from "./KarawangSubNav";
import { karawangStyles } from "./karawangStyles";

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
      Swal.fire("Gagal hapus", err.response?.data?.message || err.message, "error");
    }
  };

  return (
    <div className="ko-page ko-page-wide">
      <style>{karawangStyles}</style>
      <KarawangSubNav />

      <div className="ko-header">
        <h1>Transfer Plan</h1>
        <p>
          Catat transaksi <strong>Transfer</strong> (Tangerang → Karawang)
          dan <strong>Retur</strong> (Karawang → Tangerang) antar gudang.
        </p>
      </div>

      {/* Karyawan yang lagi input */}
      {!karyawan ? (
        <div className="ko-card" style={{ position: "relative" }}>
          <label className="ko-field-label">
            <User size={12} style={{ verticalAlign: -2 }} /> Input ID
            Karyawan
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
                      active
                        ? { fontWeight: 700, color: "#0021b3" }
                        : undefined
                    }
                  >
                    <input
                      type="radio"
                      name="jenis"
                      checked={active}
                      onChange={() => setJenis(opt.value)}
                    />
                    <Icon size={14} style={{ verticalAlign: -2 }} />{" "}
                    {opt.label}{" "}
                    <span style={{ color: "#94a3b8", fontWeight: 400 }}>
                      ({opt.sub})
                    </span>
                  </label>
                );
              })}
            </div>

            <div ref={itemBoxRef} style={{ position: "relative", marginBottom: 14 }}>
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
                <div className="ko-dropdown" style={{ top: "100%", marginTop: 2 }}>
                  {searchingItem && (
                    <div className="ko-dropdown-empty">
                      <Loader2 size={14} className="ko-spin" /> Mencari...
                    </div>
                  )}
                  {!searchingItem && itemSuggestions.length === 0 && (
                    <div className="ko-dropdown-empty">Item tidak ditemukan.</div>
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
                          color: row.jenis === "TRANSFER" ? "#0021b3" : "#b45309",
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
    </div>
  );
}
