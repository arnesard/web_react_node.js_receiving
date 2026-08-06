// src/pages/stok-opname-karawang/ScanPage.jsx
// Alur: (1) input ID karyawan sekali di awal sesi (kesimpen di
// sessionStorage, gak perlu diulang tiap ganti lokasi) → (2) input lokasi
// (loccol), divalidasi ke data lokasi hasil import excel → (3) scan RAK
// (Enter), divalidasi rak ini beneran bagian dari lokasi yg diinput → (4)
// scan COLLIE berkali-kali (Enter tiap collie), masing-masing divalidasi
// ke db pandu + data target sebelum langsung tersimpan. Tombol "Selesai"
// nutup sesi rak & lokasi ini, balik ke step input lokasi (karyawan tetap).
import { useState, useEffect, useRef } from "react";
import Swal from "sweetalert2";
import { Boxes, Package, User, MapPin, CheckCircle2 } from "lucide-react";
import api from "../../api/axiosInstance";
import KarawangSubNav from "./KarawangSubNav";
import { karawangStyles } from "./karawangStyles";

const KARYAWAN_SESSION_KEY = "karawang_karyawan";

const toastSuccess = (message) =>
  Swal.fire({
    icon: "success",
    title: message,
    timer: 1600,
    showConfirmButton: false,
  });

export default function KarawangScanPage() {
  const [batch, setBatch] = useState(null);
  const [loadingBatch, setLoadingBatch] = useState(true);

  // Step 1: karyawan
  const [karyawan, setKaryawan] = useState(() => {
    const saved = sessionStorage.getItem(KARYAWAN_SESSION_KEY);
    return saved ? JSON.parse(saved) : null;
  });
  const [employees, setEmployees] = useState([]);
  const [karyawanSearch, setKaryawanSearch] = useState("");
  const [showKaryawanDropdown, setShowKaryawanDropdown] = useState(false);
  const karyawanInputRef = useRef(null);

  // Step 2: lokasi
  const [loccol, setLoccol] = useState(null);
  const [loccolInput, setLoccolInput] = useState("");
  const loccolInputRef = useRef(null);

  // Step 3: rak & collie
  const [rakValue, setRakValue] = useState("");
  const [collieValue, setCollieValue] = useState("");
  const [currentRak, setCurrentRak] = useState(null); // { rackcode, item_di_rak, total_qty_target, total_qty_scanned, total_collie_scanned, scan_list }

  const rakInputRef = useRef(null);
  const collieInputRef = useRef(null);

  useEffect(() => {
    api
      .get("/stok-opname-karawang/batches/active")
      .then((res) => setBatch(res.data.data))
      .catch(() => setBatch(null))
      .finally(() => setLoadingBatch(false));
  }, []);

  useEffect(() => {
    if (!karyawan) {
      api
        .get("/employees")
        .then((res) => setEmployees(res.data.data || []))
        .catch(() => setEmployees([]));
    }
  }, [karyawan]);

  useEffect(() => {
    if (!karyawan) karyawanInputRef.current?.focus();
    else if (!loccol) loccolInputRef.current?.focus();
    else if (currentRak) collieInputRef.current?.focus();
    else rakInputRef.current?.focus();
  }, [karyawan, loccol, currentRak]);

  const filteredEmployees = employees.filter((emp) => {
    const q = karyawanSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      (emp.name || "").toLowerCase().includes(q) ||
      (emp.employee_id || "").toLowerCase().includes(q)
    );
  });

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
    setLoccol(null);
    setCurrentRak(null);
  };

  const handleValidasiLokasi = async (e) => {
    if (e.key !== "Enter") return;
    const kode = loccolInput.trim();
    if (!kode) return;
    try {
      await api.post("/stok-opname-karawang/validasi-lokasi", {
        batch_id: batch.id,
        loccol: kode,
      });
      setLoccol(kode);
      setLoccolInput("");
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: err.response?.data?.message || err.message,
        timer: 2400,
        showConfirmButton: false,
      });
    }
  };

  const handleGantiLokasi = () => {
    setLoccol(null);
    setCurrentRak(null);
  };

  const handleScanRak = async (e) => {
    if (e.key !== "Enter") return;
    const kode = rakValue.trim();
    if (!kode) return;
    setRakValue("");
    try {
      const res = await api.post("/stok-opname-karawang/scan-rak", {
        batch_id: batch.id,
        rackcode: kode,
        loccol,
      });
      setCurrentRak(res.data.data);
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: err.response?.data?.message || err.message,
        timer: 2200,
        showConfirmButton: false,
      });
    }
  };

  const handleScanCollie = async (e) => {
    if (e.key !== "Enter") return;
    const kode = collieValue.trim();
    if (!kode) return;
    setCollieValue("");
    try {
      const res = await api.post("/stok-opname-karawang/scan-collie", {
        batch_id: batch.id,
        rackcode: currentRak.rackcode,
        collie: kode,
        id_karyawan: karyawan.id,
        loccol,
      });
      const data = res.data.data;
      setCurrentRak((prev) => ({
        ...prev,
        total_qty_scanned: data.total_qty_scanned_di_rak,
        total_collie_scanned: data.total_collie_scanned_di_rak,
        scan_list: [data, ...prev.scan_list],
      }));
      // Ketemu di db pandu (fginvc.rack, bc_entried_prod) DAN di data
      // "Detail All Karawang" — dua-duanya udah dicek di backend sebelum
      // sampe sini, jadi popup ini nandain kalau collie-nya sah.
      Swal.fire({
        icon: "success",
        title: "Barcode ditemukan!",
        html:
          `Item <b>${data.item}</b> (${data.deskripsi})<br/>` +
          `Qty: <b>${data.qty}</b> — Kategori: ${data.kategori}<br/>` +
          `<span style="font-size:12px;color:#15803d">✓ Cocok di database EDP (Pandu) &amp; Detail All Karawang</span>`,
        timer: 1800,
        showConfirmButton: false,
      });
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: err.response?.data?.message || err.message,
        timer: 2400,
        showConfirmButton: false,
      });
    }
  };

  const handleBatal = async (collie) => {
    try {
      await api.post("/stok-opname-karawang/scan-collie/cancel", {
        batch_id: batch.id,
        collie,
      });
      setCurrentRak((prev) => {
        const batal = prev.scan_list.find((s) => s.collie === collie);
        return {
          ...prev,
          total_collie_scanned: prev.total_collie_scanned - 1,
          total_qty_scanned: prev.total_qty_scanned - (batal?.qty || 0),
          scan_list: prev.scan_list.filter((s) => s.collie !== collie),
        };
      });
    } catch (err) {
      Swal.fire("Gagal", err.response?.data?.message || err.message, "error");
    }
  };

  const handleGantiRak = () => {
    setCurrentRak(null);
  };

  // Tombol "Selesai" — collie sudah tersimpan real-time tiap scan, jadi
  // tombol ini murni navigasi: nutup rak & lokasi ini, balik ke step input
  // lokasi (karyawan tetap, gak perlu input ulang).
  const handleSelesai = () => {
    toastSuccess("Sesi rak selesai, data tersimpan.");
    setCurrentRak(null);
    setLoccol(null);
    setLoccolInput("");
  };

  return (
    <div className="ko-page">
      <style>{karawangStyles}</style>
      <KarawangSubNav />

      <div className="ko-header">
        <h1>Scan Stok Opname DC Karawang</h1>
        <p>Input karyawan &amp; lokasi dulu, baru scan rak lalu collie.</p>
      </div>

      {loadingBatch && <div className="ko-empty">Memuat data batch...</div>}

      {!loadingBatch && !batch && (
        <div className="ko-empty">
          Belum ada data Detail All Karawang. Upload dulu di menu "Upload Data".
        </div>
      )}

      {!loadingBatch && batch && (
        <>
          {/* Step 1: Karyawan */}
          {!karyawan && (
            <div className="ko-card" style={{ position: "relative" }}>
              <div className="ko-scan-label">
                <User size={12} style={{ verticalAlign: -2 }} /> Input ID
                Karyawan
              </div>
              <input
                ref={karyawanInputRef}
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
                <div className="ko-dropdown">
                  {filteredEmployees.length === 0 ? (
                    <div className="ko-dropdown-empty">Tidak ditemukan</div>
                  ) : (
                    filteredEmployees.slice(0, 30).map((emp) => (
                      <div
                        key={emp.id}
                        className="ko-dropdown-item"
                        onMouseDown={() => selectKaryawan(emp)}
                      >
                        <span className="ko-dropdown-id">
                          {emp.employee_id}
                        </span>
                        <span className="ko-dropdown-name">{emp.name}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Lokasi */}
          {karyawan && !loccol && (
            <div className="ko-card">
              <div className="ko-batch-badge" style={{ marginBottom: 12 }}>
                <User size={13} /> {karyawan.name} ({karyawan.employee_id})
                <button
                  className="ko-btn-ganti"
                  style={{ marginLeft: 8 }}
                  onClick={handleGantiKaryawan}
                >
                  Ganti
                </button>
              </div>
              <div className="ko-scan-label">
                <MapPin size={12} style={{ verticalAlign: -2 }} /> Scan / Input
                Lokasi
              </div>
              <input
                ref={loccolInputRef}
                type="text"
                className="ko-scan-input"
                placeholder="Scan / ketik kode lokasi lalu Enter..."
                value={loccolInput}
                onChange={(e) => setLoccolInput(e.target.value)}
                onKeyDown={handleValidasiLokasi}
                autoFocus
              />
            </div>
          )}

          {/* Step 3: Rak & Collie */}
          {karyawan && loccol && (
            <>
              <div className="ko-batch-badge" style={{ marginRight: 8 }}>
                <User size={13} /> {karyawan.name}
              </div>
              <div className="ko-batch-badge">
                <MapPin size={13} /> {loccol}
                <button
                  className="ko-btn-ganti"
                  style={{ marginLeft: 8 }}
                  onClick={handleGantiLokasi}
                >
                  Ganti Lokasi
                </button>
              </div>

              {!currentRak && (
                <div className="ko-card">
                  <div className="ko-scan-label">Scan Kode Rak</div>
                  <input
                    ref={rakInputRef}
                    type="text"
                    className="ko-scan-input"
                    placeholder="Scan / ketik kode rak lalu Enter..."
                    value={rakValue}
                    onChange={(e) => setRakValue(e.target.value)}
                    onKeyDown={handleScanRak}
                    autoFocus
                  />
                </div>
              )}

              {currentRak && (
                <div className="ko-card">
                  <div className="ko-rak-info">
                    <div>
                      <div className="ko-rak-code">{currentRak.rackcode}</div>
                      <div
                        style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}
                      >
                        Item: {currentRak.item_di_rak.join(", ")}
                      </div>
                    </div>
                    <div className="ko-rak-progress">
                      {currentRak.total_qty_scanned} /{" "}
                      {currentRak.total_qty_target} pcs
                      <div
                        style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}
                      >
                        {currentRak.total_collie_scanned} collie discan
                      </div>
                    </div>
                    <button className="ko-btn-ganti" onClick={handleGantiRak}>
                      Ganti Rak
                    </button>
                  </div>

                  <div className="ko-scan-label">Scan Kode Collie</div>
                  <input
                    ref={collieInputRef}
                    type="text"
                    className="ko-scan-input ko-scan-input-collie"
                    placeholder="Scan / ketik kode collie lalu Enter..."
                    value={collieValue}
                    onChange={(e) => setCollieValue(e.target.value)}
                    onKeyDown={handleScanCollie}
                  />

                  <div className="ko-scan-list">
                    {currentRak.scan_list.length === 0 && (
                      <div className="ko-empty" style={{ padding: "1.2rem" }}>
                        Belum ada collie yang discan di rak ini.
                      </div>
                    )}
                    {currentRak.scan_list.map((s) => (
                      <div key={s.collie} className="ko-scan-item">
                        <div>
                          <div className="ko-scan-item-code">{s.collie}</div>
                          <div className="ko-scan-item-meta">
                            <Package size={11} style={{ verticalAlign: -1 }} />{" "}
                            {s.item} · qty {s.qty} · {s.kategori}
                          </div>
                          {s.deskripsi && s.deskripsi !== "-" && (
                            <div
                              style={{
                                fontSize: 11,
                                color: "#94a3b8",
                                marginTop: 1,
                              }}
                            >
                              {s.deskripsi}
                            </div>
                          )}
                        </div>
                        <button
                          className="ko-scan-batal"
                          onClick={() => handleBatal(s.collie)}
                        >
                          Batal
                        </button>
                      </div>
                    ))}
                  </div>

                  {currentRak.scan_list.length > 0 && (
                    <button
                      className="ko-btn-primary"
                      style={{ marginTop: 14 }}
                      onClick={handleSelesai}
                    >
                      <CheckCircle2 size={16} /> Selesai
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
