// src/pages/Transfer/Index.jsx
// Equivalen resources/views/MonitoringTransferRak/monitoring.blade.php (Laravel)
import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import Swal from "sweetalert2";
import {
  LayoutDashboard,
  FileText,
  Repeat,
  Send,
  PackageCheck,
  Home,
  Settings,
} from "lucide-react";
import api from "../../../api/axiosInstance";
import { usePersistedState } from "../../../utils/usePersistedState";

// ── Sub-nav kecil khusus modul Transfer Rak (Monitoring / Dashboard / Laporan / Pengaturan)
// + tombol Home, karena header bar utama sengaja dihilangkan di modul ini
// biar fullscreen buat dipakai di lapangan (3 shift). ──
function TransferSubNav() {
  const location = useLocation();
  const items = [
    { to: "/transfer", label: "Monitoring", icon: <Repeat size={15} /> },
    {
      to: "/transfer/dashboard",
      label: "Dashboard",
      icon: <LayoutDashboard size={15} />,
    },
    { to: "/transfer/laporan", label: "Laporan", icon: <FileText size={15} /> },
    {
      to: "/transfer/pengaturan",
      label: "Pengaturan",
      icon: <Settings size={15} />,
    },
  ];
  return (
    <div className="tr-subnav">
      <Link to="/" className="tr-home-btn" title="Kembali ke Pilih Menu">
        <Home size={17} />
      </Link>
      {items.map((it) => (
        <Link
          key={it.to}
          to={it.to}
          className={
            "tr-subnav-link" + (location.pathname === it.to ? " active" : "")
          }
          title={it.label}
        >
          {it.icon}
          <span>{it.label}</span>
        </Link>
      ))}
    </div>
  );
}

const toastSuccess = (message) =>
  Swal.fire({
    icon: "success",
    title: message,
    timer: 1500,
    showConfirmButton: false,
  });

const showError = (err) =>
  Swal.fire("Gagal", err.response?.data?.message || err.message, "error");

export default function TransferMonitoring() {
  const [karyawan, setKaryawan] = useState([]);
  const [idKaryawan, setIdKaryawan] = usePersistedState("idKaryawan", "");
  const [tab, setTab] = usePersistedState("tab", "kirim"); // 'kirim' | 'terima'

  useEffect(() => {
    api
      .get("/transfer-rak")
      .then((res) => setKaryawan(res.data.data.karyawan || []))
      .catch((err) => console.warn("Gagal ambil karyawan:", err.message));
  }, []);

  return (
    <div className="tr-page">
      <style>{trStyles}</style>

      <TransferSubNav />

      <div className="tr-card tr-operator-card">
        <label className="tr-label">👷 Operator yang Bertugas</label>
        <select
          className="tr-input"
          value={idKaryawan}
          onChange={(e) => setIdKaryawan(e.target.value)}
        >
          <option value="">— Pilih Operator —</option>
          {karyawan.map((k) => (
            <option key={k.id} value={k.id}>
              {k.employee_id ? `${k.employee_id} - ${k.name}` : k.name}
            </option>
          ))}
        </select>
      </div>

      <div className="tr-tabs">
        <button
          className={"tr-tab-btn" + (tab === "kirim" ? " active" : "")}
          onClick={() => setTab("kirim")}
        >
          <Send size={16} /> Kirim
        </button>
        <button
          className={"tr-tab-btn" + (tab === "terima" ? " active" : "")}
          onClick={() => setTab("terima")}
        >
          <PackageCheck size={16} /> Terima
        </button>
      </div>

      {tab === "kirim" ? (
        <KirimPanel idKaryawan={idKaryawan} />
      ) : (
        <TerimaPanel karyawan={karyawan} idKaryawan={idKaryawan} />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// PANEL KIRIM
// ══════════════════════════════════════════════════════════════
// ── Dropdown generik buat pilih dari master data (Supir/Kendaraan/Lokasi).
// Wajib pilih dari list — kalau ngetik manual tapi gak pilih, id-nya gak keisi
// dan gak akan lolos validasi submit. Kalau belum ada di data, arahkan ke
// menu Pengaturan buat nambah dulu. ──
function MasterPicker({
  label,
  value,
  onChangeText,
  onPick,
  endpoint,
  placeholder,
}) {
  const [options, setOptions] = useState([]);
  const [show, setShow] = useState(false);
  const searchTimer = useRef(null);

  const search = (q) => {
    api
      .get(endpoint, { params: { q } })
      .then((res) => setOptions(res.data.data || []))
      .catch(() => {});
  };

  const handleChange = (v) => {
    onChangeText(v);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => search(v), 250);
  };

  const optionLabel = (opt) => {
    if (opt.nama_karyawan) {
      return opt.employee_id
        ? `${opt.employee_id} - ${opt.nama_karyawan}`
        : opt.nama_karyawan;
    }
    return opt.nama_kendaraan || opt.nama_lokasi || "";
  };

  return (
    <div style={{ position: "relative" }}>
      <label className="tr-label">{label}</label>
      <input
        className="tr-input"
        value={value}
        autoComplete="off"
        placeholder={placeholder}
        onFocus={() => {
          search(value);
          setShow(true);
        }}
        onChange={(e) => {
          handleChange(e.target.value);
          setShow(true);
        }}
      />
      {show && (
        <>
          <div className="tr-op-dropdown">
            {options.length === 0 ? (
              <div className="tr-op-option tr-op-empty">
                Tidak ditemukan. Tambahkan dulu di menu Pengaturan.
              </div>
            ) : (
              options.map((opt) => (
                <div
                  key={opt.id}
                  className="tr-op-option"
                  onMouseDown={() => {
                    onPick(opt);
                    setShow(false);
                  }}
                >
                  {optionLabel(opt)}
                </div>
              ))
            )}
          </div>
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 99,
            }}
            onClick={() => setShow(false)}
          />
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// PANEL KIRIM
// ══════════════════════════════════════════════════════════════
function KirimPanel({ idKaryawan }) {
  const [jenis, setJenis] = usePersistedState("kirim.jenis", "isi"); // 'isi' | 'kosong'

  // Setup form — semua dropdown pilih dari master data (Pengaturan)
  const [namaSupir, setNamaSupir] = usePersistedState("kirim.namaSupir", "");
  const [idSupir, setIdSupir] = usePersistedState("kirim.idSupir", null);
  const [namaKendaraan, setNamaKendaraan] = usePersistedState(
    "kirim.namaKendaraan",
    "",
  );
  const [idMobil, setIdMobil] = usePersistedState("kirim.idMobil", null);
  const [namaLokasiAsal, setNamaLokasiAsal] = usePersistedState(
    "kirim.namaLokasiAsal",
    "",
  );
  const [idLokasiAsal, setIdLokasiAsal] = usePersistedState(
    "kirim.idLokasiAsal",
    null,
  );
  const [catatan, setCatatan] = usePersistedState("kirim.catatan", "");
  const [jumlahRakKosong, setJumlahRakKosong] = usePersistedState(
    "kirim.jumlahRakKosong",
    "",
  );
  const [jumlahPaletKosong, setJumlahPaletKosong] = usePersistedState(
    "kirim.jumlahPaletKosong",
    "",
  );
  const [starting, setStarting] = useState(false);

  // Sesi kirim aktif (rak isi) — di-persist juga biar kalau operator gak
  // sengaja pindah ke tab Dashboard/Laporan pas lagi scan, balik ke Monitoring
  // sesi & rak yang udah discan tetep ada (gak perlu mulai ulang dari nol).
  const [transferId, setTransferId] = usePersistedState(
    "kirim.transferId",
    null,
  );
  const [scanList, setScanList] = usePersistedState("kirim.scanList", []);
  const [totalRak, setTotalRak] = usePersistedState("kirim.totalRak", 0);
  const scanInputRef = useRef(null);
  const [scanValue, setScanValue] = useState("");

  useEffect(() => {
    if (transferId && scanInputRef.current) scanInputRef.current.focus();
  }, [transferId]);

  const resetSetup = () => {
    setNamaSupir("");
    setIdSupir(null);
    setNamaKendaraan("");
    setIdMobil(null);
    // Lokasi Asal SENGAJA gak direset — biar operator gak perlu pilih ulang
    // tiap mulai sesi kirim baru kalau masih ambil dari plan yang sama.
    setCatatan("");
    setJumlahRakKosong("");
    setJumlahPaletKosong("");
  };

  const validateSetup = () => {
    if (!idKaryawan) {
      Swal.fire("Eits", "Pilih operator dulu di atas ya.", "warning");
      return false;
    }
    if (!idSupir || !idMobil || !idLokasiAsal) {
      Swal.fire(
        "Eits",
        "Supir, kendaraan, dan lokasi asal wajib dipilih dari daftar (bukan cuma diketik). Kalau belum ada datanya, tambahkan dulu di menu Pengaturan.",
        "warning",
      );
      return false;
    }
    return true;
  };

  const handleStart = async () => {
    if (!validateSetup()) return;
    setStarting(true);
    try {
      const res = await api.post("/transfer-rak/start", {
        id_karyawan: idKaryawan,
        id_supir: idSupir,
        id_mobil: idMobil,
        id_lokasi_asal: idLokasiAsal,
        catatan,
      });
      const data = res.data.data;
      setTransferId(data.transfer_id);
      setTotalRak(data.total_sudah || 0);
      setScanList([]);
      toastSuccess(data.message);
    } catch (err) {
      showError(err);
    } finally {
      setStarting(false);
    }
  };

  const handleStartKosong = async () => {
    if (!validateSetup()) return;
    setStarting(true);
    try {
      const res = await api.post("/transfer-rak/start-kosong", {
        id_karyawan: idKaryawan,
        id_supir: idSupir,
        id_mobil: idMobil,
        id_lokasi_asal: idLokasiAsal,
        jumlah_rak_kosong: jumlahRakKosong || 0,
        jumlah_palet_kosong: jumlahPaletKosong || 0,
        catatan,
      });
      await toastSuccess(res.data.data.message);
      resetSetup();
    } catch (err) {
      showError(err);
    } finally {
      setStarting(false);
    }
  };

  const handleScan = async (e) => {
    if (e.key !== "Enter") return;
    const kode = scanValue.trim();
    if (!kode) return;
    setScanValue("");
    try {
      const res = await api.post("/transfer-rak/scan", {
        transfer_rak_id: transferId,
        kode_rak: kode,
        id_karyawan: idKaryawan,
        id_lokasi_asal: idLokasiAsal,
      });
      const data = res.data.data;
      setTotalRak(data.total);
      setScanList((prev) => [
        {
          kode_rak: data.kode_rak,
          item: data.item,
          qty: data.qty,
          kategori: data.kategori,
          deskripsi: data.deskripsi,
          lokasi_asal: data.lokasi_asal,
          waktu_scan: data.waktu_scan,
        },
        ...prev,
      ]);
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: err.response?.data?.message || err.message,
        timer: 1800,
        showConfirmButton: false,
      });
    }
  };

  // BATAL 1 rak yang salah scan (mirror tombol BATAL di sisi Terima)
  const handleBatalScanKirim = async (kodeRak) => {
    try {
      const res = await api.post("/transfer-rak/scan/cancel", {
        transfer_rak_id: transferId,
        kode_rak: kodeRak,
      });
      setTotalRak(res.data.data.total);
      setScanList((prev) => prev.filter((s) => s.kode_rak !== kodeRak));
    } catch (err) {
      showError(err);
    }
  };

  const handleFinish = async () => {
    try {
      const res = await api.post("/transfer-rak/finish", {
        transfer_rak_id: transferId,
      });
      await toastSuccess(
        `${res.data.data.message} (${res.data.data.total} rak)`,
      );
      setTransferId(null);
      setScanList([]);
      setTotalRak(0);
      resetSetup();
    } catch (err) {
      showError(err);
    }
  };

  const handleCancel = async () => {
    const result = await Swal.fire({
      title: "Batalkan transfer ini?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Ya, batalkan",
      cancelButtonText: "Kembali",
      confirmButtonColor: "#dc3545",
    });
    if (!result.isConfirmed) return;
    try {
      await api.post("/transfer-rak/cancel", { transfer_rak_id: transferId });
      setTransferId(null);
      setScanList([]);
      setTotalRak(0);
      resetSetup();
    } catch (err) {
      showError(err);
    }
  };

  // Ringkasan jumlah rak per lokasi asal dalam sesi yang lagi jalan — biar
  // kelihatan "Plan I: 3 rak · Plan H: 3 rak" pas 1 mobil ngangkut dari
  // lebih dari 1 plan dalam 1 sesi kirim yang sama.
  const asalBreakdownKirim = scanList.reduce((acc, s) => {
    const key = s.lokasi_asal || "-";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="tr-card">
      <div className="tr-jenis-switch">
        <button
          className={"tr-jenis-btn" + (jenis === "isi" ? " active" : "")}
          onClick={() => setJenis("isi")}
          disabled={!!transferId}
        >
          📦 Rak Isi
        </button>
        <button
          className={"tr-jenis-btn" + (jenis === "kosong" ? " active" : "")}
          onClick={() => setJenis("kosong")}
          disabled={!!transferId}
        >
          🗑️ Rak / Palet Kosong
        </button>
      </div>

      {/* Setup: hanya tampil kalau belum ada sesi scan rak isi berjalan */}
      {(jenis === "kosong" || !transferId) && (
        <div className="tr-setup-grid">
          <MasterPicker
            label="🚚 Nama Supir"
            value={namaSupir}
            endpoint="/transfer-rak/drivers"
            placeholder="Cari nama supir..."
            onChangeText={(v) => {
              setNamaSupir(v);
              setIdSupir(null);
            }}
            onPick={(opt) => {
              setNamaSupir(opt.nama_karyawan);
              setIdSupir(opt.id);
            }}
          />

          <MasterPicker
            label="🚙 Nama Kendaraan"
            value={namaKendaraan}
            endpoint="/transfer-rak/vehicles"
            placeholder="Cari nama/plat kendaraan..."
            onChangeText={(v) => {
              setNamaKendaraan(v);
              setIdMobil(null);
            }}
            onPick={(opt) => {
              setNamaKendaraan(opt.nama_kendaraan);
              setIdMobil(opt.id);
            }}
          />

          <MasterPicker
            label="📍 Lokasi Asal"
            value={namaLokasiAsal}
            endpoint="/transfer-rak/lokasi"
            placeholder="Cari lokasi asal..."
            onChangeText={(v) => {
              setNamaLokasiAsal(v);
              setIdLokasiAsal(null);
            }}
            onPick={(opt) => {
              setNamaLokasiAsal(opt.nama_lokasi);
              setIdLokasiAsal(opt.id);
            }}
          />

          {jenis === "kosong" && (
            <>
              <div>
                <label className="tr-label">Jumlah Rak Kosong</label>
                <input
                  type="number"
                  min="0"
                  className="tr-input"
                  value={jumlahRakKosong}
                  onChange={(e) => setJumlahRakKosong(e.target.value)}
                />
              </div>
              <div>
                <label className="tr-label">Jumlah Palet Kosong</label>
                <input
                  type="number"
                  min="0"
                  className="tr-input"
                  value={jumlahPaletKosong}
                  onChange={(e) => setJumlahPaletKosong(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="tr-span-2">
            <label className="tr-label">Catatan (opsional)</label>
            <textarea
              className="tr-input"
              rows={2}
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
            />
          </div>

          <div className="tr-span-2">
            {jenis === "isi" ? (
              <button
                className="tr-btn-primary"
                disabled={starting}
                onClick={handleStart}
              >
                {starting ? "Memulai..." : "▶️ Mulai Scan Rak"}
              </button>
            ) : (
              <button
                className="tr-btn-primary"
                disabled={starting}
                onClick={handleStartKosong}
              >
                {starting ? "Mengirim..." : "✅ Kirim Rak/Palet Kosong"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Area scan (rak isi, sesi aktif) */}
      {jenis === "isi" && transferId && (
        <div className="tr-scan-area">
          {Object.keys(asalBreakdownKirim).length > 0 && (
            <div className="tr-origin-badges">
              {Object.entries(asalBreakdownKirim).map(([lokasi, jml]) => (
                <span key={lokasi} className="tr-origin-badge">
                  {lokasi}: {jml} rak
                </span>
              ))}
            </div>
          )}

          <div className="tr-scan-header" style={{ marginTop: 12 }}>
            <label className="tr-label">🔍 Scan Barcode Rak</label>
            <div className="tr-counter">{totalRak} rak</div>
          </div>
          <input
            ref={scanInputRef}
            className="tr-scan-input"
            autoComplete="off"
            placeholder="Arahkan scanner ke barcode rak..."
            value={scanValue}
            onChange={(e) => setScanValue(e.target.value)}
            onKeyDown={handleScan}
          />
          <div className="tr-scan-list">
            {scanList.map((s, i) => (
              <div key={i} className="tr-scan-item">
                <div>
                  <span>{s.kode_rak}</span>
                  <div className="tr-scan-item-meta">
                    {s.item || "-"}
                    {s.deskripsi ? ` — ${s.deskripsi}` : ""}
                    {s.qty != null ? ` · ${s.qty} pcs` : ""}
                    {s.kategori ? ` · ${s.kategori}` : ""}
                    {s.lokasi_asal ? ` · dari ${s.lokasi_asal}` : ""}
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: 4,
                  }}
                >
                  <span className="tr-scan-time">{s.waktu_scan}</span>
                  <button
                    className="tr-btn-batal-scan"
                    onClick={() => handleBatalScanKirim(s.kode_rak)}
                  >
                    BATAL
                  </button>
                </div>
              </div>
            ))}
            {scanList.length === 0 && (
              <div className="tr-empty">Belum ada rak yang discan.</div>
            )}
          </div>
          <div className="tr-scan-actions">
            <button className="tr-btn-primary" onClick={handleFinish}>
              ✅ Selesai Kirim
            </button>
            <button className="tr-btn-outline-danger" onClick={handleCancel}>
              ✖ Batalkan
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// PANEL TERIMA
// ══════════════════════════════════════════════════════════════
function TerimaPanel({ karyawan, idKaryawan }) {
  const [namaKendaraan, setNamaKendaraan] = usePersistedState(
    "terima.namaKendaraan",
    "",
  );
  const [transfer, setTransfer] = usePersistedState("terima.transfer", null); // hasil scan-mobil-penerima
  const [lokasiTujuan, setLokasiTujuan] = usePersistedState(
    "terima.lokasiTujuan",
    "",
  );
  const [idLokasiTujuan, setIdLokasiTujuan] = usePersistedState(
    "terima.idLokasiTujuan",
    null,
  );
  // Default penerima = operator yang lagi bertugas (dipilih di atas), biar
  // gak perlu milih manual lagi tiap terima. Tetap bisa diganti kalau yang
  // fisik nerima beda orang sama yang mindai barcode kendaraan.
  const [idPenerima, setIdPenerima] = usePersistedState(
    "terima.idPenerima",
    idKaryawan || "",
  );
  const [scanValue, setScanValue] = useState("");
  const [terimaList, setTerimaList] = usePersistedState(
    "terima.terimaList",
    [],
  ); // kode_rak yang siap diterima
  const scanTerimaRef = useRef(null);

  useEffect(() => {
    if (transfer?.tipe === "transfer" && scanTerimaRef.current) {
      scanTerimaRef.current.focus();
    }
  }, [transfer]);

  // Operator bertugas diganti di dropdown atas → ikut update penerima default
  useEffect(() => {
    setIdPenerima(idKaryawan || "");
  }, [idKaryawan]);

  const handleScanMobil = async (e) => {
    if (e.key !== "Enter") return;
    const nama = namaKendaraan.trim();
    if (!nama) return;
    try {
      const res = await api.post("/transfer-rak/scan-mobil-penerima", {
        nama_kendaraan: nama,
      });
      setTransfer(res.data.data.transfer);
      setTerimaList([]);
      // Lokasi Diterima SENGAJA gak direset — biar operator gak perlu pilih
      // ulang tiap kali scan mobil baru kalau masih di lokasi yang sama.
      // Tetap default-in ke operator bertugas, bukan dikosongin
      setIdPenerima(idKaryawan || "");
    } catch (err) {
      setTransfer(null);
      Swal.fire({
        icon: "error",
        title: err.response?.data?.message || err.message,
        timer: 2000,
        showConfirmButton: false,
      });
    }
  };

  const handleScanTerima = async (e) => {
    if (e.key !== "Enter") return;
    const kode = scanValue.trim();
    if (!kode) return;
    setScanValue("");
    if (terimaList.some((t) => t.kode_rak === kode)) {
      return Swal.fire({
        icon: "warning",
        title: "Rak ini sudah masuk daftar scan.",
        timer: 1500,
        showConfirmButton: false,
      });
    }
    try {
      const res = await api.post("/transfer-rak/scan-terima", {
        transfer_rak_id: transfer.id,
        kode_rak: kode,
      });
      const data = res.data.data;
      setTerimaList((prev) => [
        ...prev,
        {
          kode_rak: data.kode_rak,
          item: data.item,
          qty: data.qty,
          kategori: data.kategori,
          deskripsi: data.deskripsi,
          lokasi_asal: data.lokasi_asal,
        },
      ]);
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: err.response?.data?.message || err.message,
        timer: 2000,
        showConfirmButton: false,
      });
    }
  };

  const handleBatalScan = (kode) => {
    setTerimaList((prev) => prev.filter((t) => t.kode_rak !== kode));
  };

  const handleTerimaSemuaSisa = () => {
    const kodeSudah = terimaList.map((t) => t.kode_rak);
    const sisaDiMobil = (transfer.belum_diterima || [])
      .filter((d) => !kodeSudah.includes(d.kode_rak))
      .map((d) => ({
        kode_rak: d.kode_rak,
        item: d.item,
        qty: d.qty,
        kategori: d.kategori,
        deskripsi: d.deskripsi,
        lokasi_asal: d.lokasi_asal,
      }));
    setTerimaList((prev) => [...prev, ...sisaDiMobil]);
  };

  const handleSelesaikan = async () => {
    if (!idPenerima) {
      return Swal.fire(
        "Eits",
        "Pilih dulu Operator yang Bertugas di bagian atas halaman.",
        "warning",
      );
    }
    if (!idLokasiTujuan) {
      return Swal.fire(
        "Eits",
        "Lokasi diterima wajib dipilih dari daftar.",
        "warning",
      );
    }
    if (transfer.tipe !== "rak_kosong" && terimaList.length === 0) {
      return Swal.fire("Eits", "Silakan scan rak terlebih dahulu.", "warning");
    }
    try {
      const res = await api.post("/transfer-rak/terima", {
        transfer_rak_id: transfer.id,
        id_lokasi_tujuan: idLokasiTujuan,
        id_karyawan_penerima: idPenerima,
        kode_rak_list: terimaList.map((t) => t.kode_rak),
      });
      await toastSuccess(res.data.data.message);
      setTransfer(null);
      setNamaKendaraan("");
      setTerimaList([]);
    } catch (err) {
      showError(err);
    }
  };

  const sisaDiMobilCount = (transfer?.belum_diterima || []).filter(
    (d) => !terimaList.some((t) => t.kode_rak === d.kode_rak),
  ).length;

  return (
    <div className="tr-card">
      <label className="tr-label">🚙 Scan Barcode Kendaraan Datang</label>
      <input
        className="tr-scan-input"
        placeholder="Scan kendaraan..."
        autoComplete="off"
        value={namaKendaraan}
        onChange={(e) => setNamaKendaraan(e.target.value)}
        onKeyDown={handleScanMobil}
      />

      {transfer && (
        <div className="tr-terima-detail">
          <div className="tr-info-grid">
            <div>
              <span className="tr-info-label">Pengirim</span>
              <span className="tr-info-value">{transfer.pengirim}</span>
            </div>
            <div>
              <span className="tr-info-label">Supir</span>
              <span className="tr-info-value">{transfer.supir}</span>
            </div>
            <div>
              <span className="tr-info-label">Waktu Mulai</span>
              <span className="tr-info-value">{transfer.waktu_mulai}</span>
            </div>
            {transfer.tipe === "rak_kosong" ? (
              <div>
                <span className="tr-info-label">Jumlah</span>
                <span className="tr-info-value">
                  {transfer.jumlah_rak_kosong} Rak,{" "}
                  {transfer.jumlah_palet_kosong} Palet (KOSONG)
                </span>
              </div>
            ) : (
              <div>
                <span className="tr-info-label">Progress</span>
                <span className="tr-info-value">
                  {transfer.sudah_diterima}/{transfer.total_rak} rak diterima
                </span>
              </div>
            )}
            {transfer.catatan && transfer.catatan !== "-" && (
              <div className="tr-span-2">
                <span className="tr-info-label">Catatan</span>
                <span className="tr-info-value">{transfer.catatan}</span>
              </div>
            )}
          </div>

          {transfer.asal_breakdown && transfer.asal_breakdown.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <span className="tr-info-label">Lokasi Asal</span>
              <div className="tr-origin-badges" style={{ marginTop: 6 }}>
                {transfer.asal_breakdown.map((a) => (
                  <span key={a.lokasi_asal} className="tr-origin-badge">
                    {a.lokasi_asal}: {a.sudah_diterima}/{a.total} rak
                  </span>
                ))}
              </div>
            </div>
          )}

          {transfer.tipe !== "rak_kosong" && (
            <>
              <div className="tr-scan-header" style={{ marginTop: 16 }}>
                <label className="tr-label">🔍 Scan Rak yang Diturunkan</label>
                <div className="tr-counter">{terimaList.length} discan</div>
              </div>
              <input
                ref={scanTerimaRef}
                className="tr-scan-input"
                placeholder="Scan barcode rak..."
                autoComplete="off"
                value={scanValue}
                onChange={(e) => setScanValue(e.target.value)}
                onKeyDown={handleScanTerima}
              />
              <button
                className="tr-btn-link"
                onClick={handleTerimaSemuaSisa}
                disabled={sisaDiMobilCount === 0}
              >
                ⚡ Terima Semua Sisa ({sisaDiMobilCount})
              </button>
              <div className="tr-scan-list">
                {terimaList.map((t) => (
                  <div key={t.kode_rak} className="tr-scan-item">
                    <div>
                      <span>{t.kode_rak}</span>
                      <div className="tr-scan-item-meta">
                        {t.item || "-"}
                        {t.deskripsi ? ` — ${t.deskripsi}` : ""}
                        {t.qty != null ? ` · ${t.qty} pcs` : ""}
                        {t.kategori ? ` · ${t.kategori}` : ""}
                        {t.lokasi_asal ? ` · dari ${t.lokasi_asal}` : ""}
                      </div>
                    </div>
                    <button
                      className="tr-btn-batal-scan"
                      onClick={() => handleBatalScan(t.kode_rak)}
                    >
                      BATAL
                    </button>
                  </div>
                ))}
                {terimaList.length === 0 && (
                  <div className="tr-empty">
                    Belum ada rak yang discan buat diterima.
                  </div>
                )}
              </div>
            </>
          )}

          <div className="tr-setup-grid" style={{ marginTop: 16 }}>
            <MasterPicker
              label="📍 Lokasi Diterima"
              value={lokasiTujuan}
              endpoint="/transfer-rak/lokasi"
              placeholder="Cari lokasi diterima..."
              onChangeText={(v) => {
                setLokasiTujuan(v);
                setIdLokasiTujuan(null);
              }}
              onPick={(opt) => {
                setLokasiTujuan(opt.nama_lokasi);
                setIdLokasiTujuan(opt.id);
              }}
            />
            <div className="tr-span-2">
              <button className="tr-btn-primary" onClick={handleSelesaikan}>
                ✅ Selesaikan Penerimaan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const trStyles = `
  /* ── Tema gelap khusus modul Transfer Rak — dipakai operator lapangan
     3 shift, background terang bikin silau & capek mata kalau kerja malam ── */
  .tr-page { max-width: 720px; margin: 0 auto; padding: 20px 16px 40px; color: #1e293b; }
  .tr-subnav { display: flex; gap: 6px; margin-bottom: 16px;
    background: #ffffff; box-shadow: 0 1px 3px rgba(15,23,42,0.06);
    padding: 6px; border-radius: 14px; border: 1px solid #e2e8f0; }
  .tr-home-btn { display: flex; align-items: center; justify-content: center;
    width: 38px; flex-shrink: 0; border-radius: 10px; color: #475569;
    text-decoration: none; transition: 0.2s; }
  .tr-home-btn:hover { background: #e2e8f0; color: #1e293b; }
  .tr-subnav-link { flex: 1; display: flex; align-items: center; justify-content: center;
    gap: 6px; padding: 9px; border-radius: 10px; text-decoration: none;
    color: #475569; font-weight: 600; font-size: 13px; transition: 0.2s; }
  .tr-subnav-link:hover { background: #f1f5f9; }
  .tr-subnav-link.active { background: #3b82f6; color: #fff; }
  /* Mobile: navbar sub-menu jangan meluber — sembunyiin label teks,
     sisain icon doang biar 4 menu + tombol home tetep muat sebaris */
  @media (max-width: 560px) {
    .tr-subnav { gap: 4px; padding: 5px; }
    .tr-home-btn { width: 34px; }
    .tr-subnav-link { flex-direction: column; gap: 2px; padding: 7px 2px; font-size: 9px; }
    .tr-subnav-link span { display: none; }
  }
  .tr-card { background: #ffffff; box-shadow: 0 1px 3px rgba(15,23,42,0.06);
    border-radius: 18px; border: 1px solid #e2e8f0;
    padding: 20px; margin-bottom: 16px; }
  .tr-operator-card { display: flex; flex-direction: column; gap: 6px; }
  .tr-label { display: block; font-size: 12px; font-weight: 700; color: #475569;
    margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.02em; }
  .tr-input { width: 100%; padding: 10px 12px; border-radius: 10px;
    border: 1.5px solid #cbd5e1; background: #f1f5f9;
    color: #1e293b; font-size: 14px; outline: none; transition: border-color 0.15s; }
  .tr-input::placeholder { color: #64748b; }
  .tr-input:focus { border-color: #3b82f6; background: #e2e8f0; }
  select.tr-input option { background: #ffffff; color: #1e293b; }
  .tr-op-dropdown { position: absolute; top: calc(100% + 4px); left: 0; right: 0;
    background: #ffffff; border: 1.5px solid #cbd5e1; border-radius: 12px;
    box-shadow: 0 12px 28px rgba(0,0,0,0.45); z-index: 200;
    max-height: 220px; overflow-y: auto; }
  .tr-op-option { padding: 10px 14px; font-size: 13px; cursor: pointer; color: #1e293b;
    border-bottom: 1px solid #f1f5f9; }
  .tr-op-option:hover { background: rgba(59,130,246,0.15); }
  .tr-op-option:last-child { border-bottom: none; }
  .tr-op-empty { color: #64748b; cursor: default; }
  .tr-op-empty:hover { background: none; }
  .tr-driver-new-hint { margin-top: 8px; padding: 10px; background: rgba(245,158,11,0.08);
    border: 1px dashed #f59e0b; border-radius: 10px; }
  .tr-tabs { display: flex; gap: 8px; margin-bottom: 16px; }
  .tr-tab-btn { flex: 1; display: flex; align-items: center; justify-content: center;
    gap: 8px; padding: 12px; border-radius: 14px; border: 1.5px solid #cbd5e1;
    background: #f8fafc; color: #475569; font-weight: 700; cursor: pointer; }
  .tr-tab-btn.active { background: #3b82f6; border-color: #3b82f6; color: #fff; }
  .tr-jenis-switch { display: flex; gap: 8px; margin-bottom: 16px; }
  .tr-jenis-btn { flex: 1; padding: 10px; border-radius: 10px; border: 1.5px solid #cbd5e1;
    background: #f8fafc; color: #475569; font-weight: 600; cursor: pointer; font-size: 13px; }
  .tr-jenis-btn.active { background: #dbeafe; border-color: #3b82f6; color: #1d4ed8; }
  .tr-jenis-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .tr-setup-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .tr-span-2 { grid-column: span 2; }
  .tr-btn-primary { width: 100%; padding: 12px; border-radius: 12px; border: none;
    background: linear-gradient(135deg,#3b82f6,#2563eb); color: #fff; font-weight: 700;
    font-size: 14px; cursor: pointer; box-shadow: 0 6px 16px rgba(59,130,246,0.3); }
  .tr-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; box-shadow: none; }
  .tr-btn-outline-danger { width: 100%; padding: 12px; border-radius: 12px;
    border: 1.5px solid rgba(239,68,68,0.4); background: rgba(239,68,68,0.08); color: #b91c1c;
    font-weight: 700; cursor: pointer; margin-top: 8px; }
  .tr-scan-area { margin-top: 4px; }
  .tr-scan-header { display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 6px; }
  .tr-counter { background: #dbeafe; color: #1d4ed8; font-weight: 800;
    font-size: 13px; padding: 4px 12px; border-radius: 999px; }
  .tr-scan-input { width: 100%; padding: 14px; border-radius: 12px; border: 2px solid #3b82f6;
    background: rgba(59,130,246,0.07); color: #1e293b; font-size: 15px; outline: none;
    text-align: center; font-weight: 700; letter-spacing: 0.5px; }
  .tr-scan-input::placeholder { color: #64748b; font-weight: 500; }
  .tr-scan-input:focus { background: rgba(59,130,246,0.12); }
  .tr-scan-list { max-height: 260px; overflow-y: auto; margin-top: 10px; display: flex;
    flex-direction: column; gap: 6px; }
  .tr-scan-item { display: flex; justify-content: space-between; align-items: flex-start;
    background: #ffffff; border: 1px solid #e2e8f0;
    border-radius: 10px; padding: 8px 12px; font-size: 13px; font-weight: 600; color: #1e293b; }
  .tr-scan-item-meta { font-size: 11px; color: #2563eb; font-weight: 600; margin-top: 2px; }
  .tr-scan-time { color: #64748b; font-size: 11px; font-weight: 500; }
  .tr-btn-batal-scan { background: rgba(239,68,68,0.12); color: #b91c1c;
    border: 1px solid rgba(239,68,68,0.25); padding: 3px 10px; border-radius: 6px;
    font-size: 10px; font-weight: 700; cursor: pointer; }
  .tr-empty { text-align: center; color: #64748b; font-size: 13px; padding: 16px 0; }
  .tr-scan-actions { display: flex; gap: 8px; margin-top: 14px; }
  .tr-scan-actions .tr-btn-primary { margin: 0; }
  .tr-terima-detail { margin-top: 16px; padding-top: 16px; border-top: 1px dashed #cbd5e1; }
  .tr-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 6px; }
  .tr-info-label { display: block; font-size: 11px; color: #64748b; font-weight: 700;
    text-transform: uppercase; }
  .tr-info-value { display: block; font-size: 14px; color: #1e293b; font-weight: 600; }
  .tr-btn-link { background: none; border: none; color: #2563eb; font-weight: 700;
    font-size: 12px; cursor: pointer; padding: 6px 0; }
  .tr-btn-link:disabled { color: #64748b; cursor: not-allowed; }
  .tr-hint-note { font-size: 11px; color: #64748b; margin-top: -2px; margin-bottom: 10px; }
  .tr-origin-badges { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 4px; }
  .tr-origin-badge { background: rgba(245,158,11,0.14); color: #b45309;
    border: 1px solid rgba(245,158,11,0.3); font-size: 11px; font-weight: 700;
    padding: 4px 10px; border-radius: 999px; }
  @media (max-width: 640px) {
    .tr-setup-grid, .tr-info-grid { grid-template-columns: 1fr; }
    .tr-span-2 { grid-column: span 1; }
  }
`;
