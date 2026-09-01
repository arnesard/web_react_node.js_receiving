// src/pages/stok-opname-karawang/TransferPlanPage.jsx
// Halaman ini isinya 2 bagian:
// 1. Upload Item Request (Excel) — data disimpan di tabel lokal
//    stok_opname_karawang_item_req, ditampilkan di card ringkasan
//    "Jumlah Item" & "Total Request".
// 2. Tire Trip Planner — bikin rencana trip truk (bin-packing by m³)
//    dari item request jenis TIRE hari ini, digabung juga dengan data
//    Schedule OEM dari bpw_dept_db.sch_oem (lihat KarawangItemRequestModel
//    getTireTripItems di backend).
import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";
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
  Printer,
  Wand2,
  Link2,
  Boxes,
  PieChart,
  Truck,
} from "lucide-react";

// Aksen warna per jenis item, dipakai di chip breakdown Jumlah Item & Total Request
const JENIS_ACCENT = {
  TIRE: { bg: "#dbeafe", border: "#93c5fd", text: "#1d4ed8", dot: "#2563eb" },
  "TIRE OE": {
    bg: "#dbeafe",
    border: "#93c5fd",
    text: "#1d4ed8",
    dot: "#2563eb",
  },
  "TUBE OE": {
    bg: "#fef3c7",
    border: "#fcd34d",
    text: "#b45309",
    dot: "#d97706",
  },
  VALVE: { bg: "#d1fae5", border: "#6ee7b7", text: "#047857", dot: "#059669" },
};
const getJenisAccent = (jenis) =>
  JENIS_ACCENT[jenis] || {
    bg: "#e2e8f0",
    border: "#cbd5e1",
    text: "#334155",
    dot: "#64748b",
  };
import api from "../../api/axiosInstance";
import KarawangSubNav from "./KarawangSubNav";
import TireTubePairingModal from "./TireTubePairingModal";
import TripPerTrukModal from "./TripPerTrukModal";
import { karawangStyles } from "./karawangStyles";
import * as XLSX from "xlsx-js-style";
import { toJakartaDateString } from "../../utils/date";

export default function TransferPlanPage() {
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  const [savingTripPlan, setSavingTripPlan] = useState(false);
  // Modal "Kelola Master Tire-Tube" — CRUD + import Excel master pasangan
  // Tire<->Tube, dibuka dari tombol di header Transfer Plan (menu/halaman
  // terpisah "Master Tire-Tube" sudah dihapus).
  const [showTireTubeModal, setShowTireTubeModal] = useState(false);
  // Modal "Trip per Truk" — rekap jumlah trip tiap truk (nopol) hari ini
  // dari data live Monitoring Transfer (Cross Docking), lihat
  // TripPerTrukModal.jsx.
  const [showTripPerTrukModal, setShowTripPerTrukModal] = useState(false);
  // Tabel "Preview Item Request & Stok" disembunyikan di halaman utama,
  // baru muncul setelah tombol "Rencana Transfer" diklik.
  const [showPreviewTable, setShowPreviewTable] = useState(false);

  const [summaryItemReq, setSummaryItemReq] = useState([]);

  // ============ MASTER PASANGAN TIRE <-> TUBE ============
  // Dipakai buat auto-nambahin tube pasangan tiap kali tire (tubetype)
  // masuk ke trip (manual maupun auto-generate) — qty selalu 1:1.
  const [tireTubePairs, setTireTubePairs] = useState([]);
  const tireTubePairMap = useMemo(() => {
    const map = new Map();
    tireTubePairs.forEach((p) => {
      map.set(String(p.tire_code).trim().toUpperCase(), p);
    });
    return map;
  }, [tireTubePairs]);

  const loadTireTubePairs = async () => {
    try {
      const res = await api.get("/stok-opname-karawang/tire-tube-pairing");
      setTireTubePairs(res.data?.data || []);
    } catch (err) {
      console.error("Gagal mengambil master pasangan Tire-Tube:", err);
    }
  };

  // ============ PREVIEW ITEM REQUEST + STOK TANGERANG/KARAWANG ============
  const [previewItems, setPreviewItems] = useState([]);
  const [draftReady, setDraftReady] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Tanggal Item Request yang di-upload (kolom `date` di tabel
  // stok_opname_karawang_item_req, ikut di-bawa tiap item lewat
  // `tanggal_request` -- lihat KarawangItemRequestModel). No Trip HARUS
  // ngikut tanggal ini, BUKAN tanggal hari ini device user, biar nomor
  // trip tetep konsisten sama tanggal Item Request-nya walau Trip Plan-nya
  // baru disusun/dibuka beberapa hari setelah upload.
  const uploadTanggal = useMemo(() => {
    const found = previewItems.find((it) => it.tanggal_request);
    return found?.tanggal_request || null;
  }, [previewItems]);

  // ============ MANUAL TRIP BUILDER ============
  // manualTrips: [{ id, no_trip, items: [{item, deskripsi, qty, volume, total_volume}] }]
  const [manualTrips, setManualTrips] = useState([]);
  // Jumlah slot "Truk N" yang PERNAH dibuat (cuma naik, gak pernah turun
  // walau ada trip yang "Lepas dari Truk"). Dipakai biar Truk 2 misalnya
  // gak ilang selamanya dari pilihan cuma gara-gara lagi gak dipake.
  const [maxTruckSlot, setMaxTruckSlot] = useState(1);
  // Loading state khusus tombol "Rencana Transfer" (auto-generate trip).
  const [loadingRencanaTransfer, setLoadingRencanaTransfer] = useState(false);
  // Kapasitas 1 truk (m³) — dipakai buat ngecek trip udah "muat" apa belum.
  // Default 52 m³, samain sama default kapasitas di buildTireTrips backend.
  const [truckCapacity, setTruckCapacity] = useState(52);
  // Form "Tambah Item" per kartu trip — { [tripId]: { itemCode, qty } }.
  const [addItemForm, setAddItemForm] = useState({});
  // Modal custom buat "Tambah Item" (bukan dropdown nempel di tombol lagi)
  // -- dipakai biar tiap baris item bisa ditampilin dgn warna (mis. "Sisa"
  // merah), yang gak bisa dilakuin kalau pake <select><option> browser
  // biasa. itemPickerOpenTripId: id trip yang lagi kebuka modal item-nya
  // (cuma 1 yang kebuka dalam satu waktu). itemPickerSearch: teks filter.
  const [itemPickerOpenTripId, setItemPickerOpenTripId] = useState(null);
  const [itemPickerSearch, setItemPickerSearch] = useState("");
  // Hasil search item DI LUAR Item Request (dari master item, lewat
  // endpoint /item-req/search-outside) -- dipakai biar user bisa nambah
  // item yang gak keupload di Excel Item Request. Debounced, cuma jalan
  // pas modal picker lagi kebuka & ketikan >= 2 karakter.
  const [outsideItems, setOutsideItems] = useState([]);
  const [loadingOutsideItems, setLoadingOutsideItems] = useState(false);

  useEffect(() => {
    if (itemPickerOpenTripId === null) return;
    const q = itemPickerSearch.trim();
    if (q.length < 2) {
      setOutsideItems([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoadingOutsideItems(true);
      try {
        const res = await api.get(
          "/stok-opname-karawang/item-req/search-outside",
          { params: { keyword: q } },
        );
        setOutsideItems(res.data?.data || []);
      } catch (err) {
        console.error("Gagal mencari item di luar request:", err);
        setOutsideItems([]);
      } finally {
        setLoadingOutsideItems(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [itemPickerOpenTripId, itemPickerSearch]);

  // Gabungan item dari Item Request + item di luar request hasil search,
  // dedup by kode item (item dari request menang kalau kode-nya sama --
  // udah punya info qty/sisa yang lebih lengkap).
  const pickableItems = useMemo(() => {
    const requestCodes = new Set(previewItems.map((it) => it.item));
    const extra = outsideItems
      .filter((it) => !requestCodes.has(it.item))
      .map((it) => ({ ...it, fromRequest: false }));
    return [
      ...previewItems.map((it) => ({ ...it, fromRequest: true })),
      ...extra,
    ];
  }, [previewItems, outsideItems]);

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

  // Catatan RMB — diisi user pas mau cetak (lewat prompt Swal di
  // handlePrintRmb), disimpan per trip.id biar kalau trip yang sama
  // dicetak ulang, catatan sebelumnya masih keisi (gak perlu ngetik ulang).
  const [catatanByTrip, setCatatanByTrip] = useState({});

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
    loadTireTubePairs();
  }, []);

  // Tambel tanggal_request buat trip DRAFT LAMA (dibikin sebelum fix
  // tanggal RMB ada) yang item-nya belum kebawa field tanggal_request
  // sama sekali -- draft ini disimpan di server & di-load balik pas
  // halaman dibuka (lihat efek draft di bawah), jadi kalau gak ditambel,
  // item lama tetep bakal fallback ke tanggal-hari-ini pas dicetak
  // walaupun kode-nya udah dibenerin. User GAK PERLU upload ulang Excel
  // buat ini -- data tanggal_request-nya udah ada & bener di previewItems
  // (dari DB), cuma perlu ditempel ulang ke item yang udah kadung
  // nempel di trip draft. Nunggu DUA-DUANYA siap (previewItems ke-load
  // DAN draft-nya kelar di-restore) via draftReady -- soalnya urutan
  // selesainya 2 request async ini (loadPreview vs getTripPlanDraft) gak
  // pasti, dan kalau backfill ini jalan duluan sebelum draft ke-restore,
  // gak ada apa2 buat ditambel (manualTrips masih kosong).
  useEffect(() => {
    if (!previewItems.length || !draftReady) return;

    setManualTrips((prev) => {
      let changed = false;
      const next = prev.map((trip) => {
        const items = (trip.items || []).map((it) => {
          if (it.tanggal_request) return it;
          const found = previewItems.find((p) => p.item === it.item);
          if (!found?.tanggal_request) return it;
          changed = true;
          return { ...it, tanggal_request: found.tanggal_request };
        });
        return { ...trip, items };
      });
      return changed ? next : prev;
    });
  }, [previewItems, draftReady]);

  // ============ DRAFT TRIP PLAN (persist across refresh / PC lain) ============
  // Trip yang lagi disusun (manualTrips) disimpan otomatis (debounced) ke
  // backend tiap kali berubah, dan di-load balik pas halaman dibuka --
  // jadi kalau di-refresh (atau dibuka dari komputer lain), trip yang
  // lagi dikerjain TETAP ADA, gak ke-reset ke kosong. Draft ini cuma
  // kekosongin lagi pas user klik "Simpan Trip Plan" (final ke histori) --
  // BUKAN pas auto-generate atau refresh biasa.
  const draftLoadedRef = useRef(false);
  const draftSaveTimerRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("/stok-opname-karawang/trip-plan/draft");
        const draft = res.data?.data;

        if (draft?.payload) {
          if (
            Array.isArray(draft.payload.trips) &&
            draft.payload.trips.length
          ) {
            setManualTrips(draft.payload.trips);
          }
          if (draft.payload.truckCapacity) {
            setTruckCapacity(draft.payload.truckCapacity);
          }
          if (draft.payload.catatanByTrip) {
            setCatatanByTrip(draft.payload.catatanByTrip);
          }
        }
      } catch (err) {
        console.error("Gagal mengambil draft Trip Plan:", err);
      } finally {
        // Ditandain SETELAH load selesai (sukses ataupun gagal) — biar
        // effect autosave di bawah gak nembak nyimpen draft KOSONG duluan
        // sebelum draft lama sempet ke-load.
        draftLoadedRef.current = true;
        setDraftReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!draftLoadedRef.current) return;

    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
    }

    draftSaveTimerRef.current = setTimeout(() => {
      api
        .post("/stok-opname-karawang/trip-plan/draft", {
          trips: manualTrips,
          truckCapacity,
          catatanByTrip,
        })
        .catch((err) => console.error("Gagal menyimpan draft Trip Plan:", err));
    }, 1000);

    return () => clearTimeout(draftSaveTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualTrips, truckCapacity, catatanByTrip]);

  // Semua item yang berpasangan sama TUBE (tube-type tire) kirimnya
  // emang HARUS dari BPW1 di lapangan — baik tire-nya sendiri MAUPUN
  // tube pasangannya, gak ngikut lokasi live Tangerang lagi. Item yang
  // gak punya pasangan (non tube-type) tetep ngikut lokasi live-nya
  // masing-masing (bisa BPW1 / BPW2 / dst).
  const isTubeType = (itemCode) =>
    tireTubePairMap.has(String(itemCode).trim().toUpperCase());
  const effectiveGedung = (itemCode, liveGedung) =>
    isTubeType(itemCode) ? "BPW1" : liveGedung;
  // Tube-type tire (punya pasangan tube) DIHITUNG 2 SLOT dari batas "maks 4
  // item per trip" pas auto-generate -- soalnya nantinya bakal nambahin 1
  // baris tube lagi (lihat buildPairedTubeLine, auto-add SETELAH bin-packing
  // tire selesai). Tire biasa (non tube-type) tetep 1 slot.
  const itemSlotCount = (itemCode) => (isTubeType(itemCode) ? 2 : 1);

  // Item dengan kode AWALAN "TH" (mis. "TH-1234") atau AKHIRAN "SP" (mis.
  // "IBD1001SP-0") -- SESUAI PERMINTAAN, item ini gak boleh nyampur sama
  // item lain di 1 trip yang sama pas auto-generate. Kode item ASLI di
  // master selalu ada suffix "-<angka>" di belakang (mis. "IBD1001SP-0"),
  // makanya suffix itu di-strip DULU sebelum cek prefix/akhiran -- kalau
  // enggak, "IBD1001SP-0" ujungnya "-0" bukan "SP" jadi kelewat kedetect.
  const stripItemCodeSuffix = (itemCode) =>
    String(itemCode || "")
      .trim()
      .toUpperCase()
      .replace(/-\d+$/, "");
  const isThOrSpItem = (itemCode) => {
    const code = stripItemCodeSuffix(itemCode);
    return code.startsWith("TH") || code.endsWith("SP");
  };

  // Bikin 1 baris item "tube pasangan" dari data master pairing, qty
  // ngikutin qty tire-nya (1:1). Ditandain pairedTire biar sinkron pas
  // qty tire diubah / tire dihapus dari trip (lihat updateManualTripItemQty
  // & removeItemFromManualTrip).
  // NOTE volume SENGAJA di-nol-in: tube udah nempel DI DALAM tire, jadi
  // gak nambah kubikasi/kapasitas truk. Beratnya TETEP dihitung normal,
  // biar keitung pas cetak RMB (kolom "KG").
  const buildPairedTubeLine = (tireCode, qty) => {
    const pair = tireTubePairMap.get(String(tireCode).trim().toUpperCase());
    if (!pair) return null;

    const berat = Number(pair.tube_berat || 0);

    return {
      item: pair.tube_code,
      deskripsi: pair.tube_description || "-",
      qty,
      volume: 0,
      total_volume: 0,
      berat,
      total_berat: Number((qty * berat).toFixed(2)),
      pairedTire: String(tireCode).trim().toUpperCase(),
      stok_tangerang: Number(
        previewItems.find((i) => i.item === pair.tube_code)?.stok_tangerang ||
          0,
      ),
      tanggal_request:
        previewItems.find((i) => i.item === pair.tube_code)?.tanggal_request ||
        null,
      // Tube-type: tire + tube pasangannya SELALU BPW1 (lihat
      // effectiveGedung). Field ini masih editable manual lewat tombol
      // Edit Gedung per item di kartu trip kalau ternyata beda.
      gedung: "BPW1",
    };
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

  // Cek apakah volume 1 trip masih muat di 1 truk berdasarkan truckCapacity.
  const getTripCapacityStatus = (volume) => {
    const cap = Number(truckCapacity) || 0;
    const pct = cap > 0 ? (volume / cap) * 100 : 0;
    const selisih = Math.abs(cap - volume).toLocaleString("id-ID", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    return {
      pct: Number(pct.toFixed(1)),
      over: volume > cap,
      label: volume > cap ? `Over ${selisih} m³` : `Sisa ${selisih} m³`,
    };
  };

  // Total truk yang dibutuhkan kalau semua trip manual digabung ke truk
  // sebesar truckCapacity (buat ringkasan atas).
  const trucksNeeded =
    truckCapacity > 0
      ? Math.ceil(manualTripTotals.totalVolume / truckCapacity)
      : 0;

  // "Rencana Transfer" — buka modal yang isinya tabel
  // Preview Item Request & Stok (view only, buat ngecek stok sebelum generate).
  const handleRencanaTransfer = () => {
    setShowPreviewTable(true);
  };

  // ===== AUTO GENERATE TRIP =====
  // Bikin trip otomatis dari Item Request TIRE hari ini, berdasarkan stok
  // Tangerang yang tersedia:
  // - Qty yang diambil per item = min(sisa request, stok tangerang) →
  //   kalau stok gak cukup, diisi PARTIAL sebesar stok yang ada (sisanya
  //   otomatis kebawa lagi kalau di-generate ulang setelah stok nambah,
  //   atau bisa dimasukin manual lewat "Tambah Trip Baru").
  // - Item yang sisa request-nya 0 (udah kebagi full) atau stok
  //   tangerang-nya 0, di-skip (gak digenerate).
  // - Pengelompokan ke trip pake algoritma BEST-FIT DECREASING: item
  //   diurutin dari volume total (qty x vol/qty) TERBESAR dulu, terus tiap
  //   item dicariin trip yang udah ada dengan SISA KAPASITAS PALING PAS
  //   (paling kecil tapi masih muat) — jadi trip yang udah lumayan penuh
  //   diprioritasin ditambahin dulu, baru buka trip baru kalau bener-bener
  //   gak ada yang muat. Ini bikin utilisasi tiap truk jauh lebih rata &
  //   maksimal dibanding sekadar isi berurutan sampai limit ke-4 item.
  // - Batasan per trip tetep 2: MAX 4 ITEM & volume gak boleh lebih dari
  //   Kapasitas Truk (m³). Tire tube-type (punya pasangan tube) DIHITUNG
  //   2 ITEM dari batas ini -- soalnya ban luar & ban dalemnya jalan
  //   bareng jadi 2 baris (lihat itemSlotCount & buildPairedTubeLine).
  const handleAutoGenerateTrip = () => {
    if (!previewItems.length) {
      Swal.fire(
        "Belum Ada Data",
        "Belum ada Item Request TIRE hari ini buat di-generate.",
        "info",
      );
      return;
    }

    setLoadingRencanaTransfer(true);

    try {
      // Item kandidat: masih ada sisa request DAN stok tangerang > 0.
      const candidates = previewItems
        .map((item) => {
          const allocated = Number(allocatedQtyMap[item.item] || 0);
          const sisa = Number(item.qty || 0) - allocated;
          const stokTangerang = Number(item.stok_tangerang || 0);
          const allocQty = Math.max(0, Math.min(sisa, stokTangerang));
          const volume = Number(item.volume || 0);
          const lineVolume = Number((allocQty * volume).toFixed(3));

          // Tire tube-type (punya pasangan tube) SELALU dari BPW1, gak
          // ngikut lokasi live Tangerang lagi -- lihat effectiveGedung.
          return {
            ...item,
            sisa,
            allocQty,
            volume,
            lineVolume,
            gedung: effectiveGedung(item.item, item.gedung),
          };
        })
        .filter((item) => item.sisa > 0 && item.allocQty > 0);

      if (!candidates.length) {
        Swal.fire(
          "Tidak Ada Item Bisa Digenerate",
          "Semua item sudah masuk trip, atau stok Tangerang-nya kosong untuk sisa request yang ada.",
          "info",
        );
        return;
      }

      // Urutin dari volume total TERBESAR dulu (Decreasing) supaya item
      // besar dapet slot lebih dulu, item kecil belakangan buat "nambal"
      // sisa ruang truk yang lain (Best-Fit).
      const sortedCandidates = [...candidates].sort(
        (a, b) => b.lineVolume - a.lineVolume,
      );

      const cap = Number(truckCapacity) || 0;

      // PECAH item yang qty PENUHNYA SENDIRIAN udah lebih besar dari 1
      // truk (mis. 6.315 qty × 0,033 m³ = 208,4 m³ vs kapasitas 52 m³)
      // jadi beberapa "chunk" yang masing² MUAT 1 truk. Tanpa ini, bin-
      // packing di bawah gak akan pernah nemu trip yang muat (baik trip
      // lama maupun baru — volumenya udah kegedean dari sononya), jadi
      // dia kepaksa dorong semua qty ke 1 trip aja walau overflow parah.
      // Sisa qty terakhir tiap item boleh < 1 truk penuh (itu wajar,
      // nanti ditambal bareng item lain lewat best-fit di bawah).
      const chunks = [];
      sortedCandidates.forEach((item) => {
        const volume = item.volume;
        const rawQtyPerChunk =
          cap > 0 && volume > 0
            ? Math.max(1, Math.floor(cap / volume))
            : item.allocQty;
        // Chunk "penuh" (bukan sisa terakhir) dibulatkan KE BAWAH ke
        // kelipatan 5 terdekat (5, 10, 15, 20, ...) biar qty per trip
        // rapi, gak angka ganjil random kayak 1.575. Kalau kapasitas
        // truk aja gak cukup buat 5 unit (item gede banget per pcs-nya),
        // fallback ke qty asli biar tetep kepacking (gak dipaksa 0).
        const qtyPerChunk =
          rawQtyPerChunk >= 5
            ? Math.floor(rawQtyPerChunk / 5) * 5
            : rawQtyPerChunk;

        let sisaQty = item.allocQty;
        while (sisaQty > 0) {
          // Chunk terakhir (sisa yang gak pas abis dibagi kelipatan 5)
          // dibiarin apa adanya — gak dipaksa genap/kelipatan 5.
          const chunkQty = Math.min(sisaQty, qtyPerChunk);
          chunks.push({
            ...item,
            allocQty: chunkQty,
            lineVolume: Number((chunkQty * volume).toFixed(3)),
          });
          sisaQty -= chunkQty;
        }
      });

      // Re-sort chunk (bukan item mentah lagi) dari volume terbesar buat
      // best-fit yang sebenarnya dijalanin di bawah.
      chunks.sort((a, b) => b.lineVolume - a.lineVolume);

      // ===== GROUPING PER GEDUNG (loccode Tangerang) =====
      // Best-fit bin-packing dijalanin TERPISAH per gedung (BPW1, BPW2,
      // dst -- lihat item.gedung dari previewItems/ControlStockModel),
      // jadi 1 trip GAK PERNAH nyampur item dari gedung yang beda (truk
      // cuma ambil dari 1 gedung sekali jalan). TUBE OE ngikutin gedung
      // tire pasangannya (lihat buildPairedTubeLine), item lain ngikutin
      // lokasi live Tangerang-nya.
      // Item yang gedung-nya gak ketemu (lokasi live-nya kosong) masuk
      // grup "TANPA GEDUNG" tersendiri, ditaruh paling belakang.
      //
      // Di DALAM tiap gedung, item kode AWALAN "TH" / AKHIRAN "SP" masih
      // dipisah lagi jadi sub-grup TERSENDIRI (lihat isThOrSpItem) --
      // bin-packing-nya jalan sendiri-sendiri, jadi 1 trip GAK PERNAH
      // nyampur item TH/SP sama item biasa, walau gedung-nya sama.
      const groupKeyOf = (item) =>
        `${item.gedung || "TANPA GEDUNG"}||${isThOrSpItem(item.item) ? "THSP" : "NORMAL"}`;

      const chunksByGroup = new Map();
      chunks.forEach((item) => {
        const key = groupKeyOf(item);
        if (!chunksByGroup.has(key)) chunksByGroup.set(key, []);
        chunksByGroup.get(key).push(item);
      });
      const groupOrder = [...chunksByGroup.keys()].sort((a, b) => {
        const [gedungA, subA] = a.split("||");
        const [gedungB, subB] = b.split("||");
        if (gedungA === "TANPA GEDUNG" && gedungB !== "TANPA GEDUNG") return 1;
        if (gedungB === "TANPA GEDUNG" && gedungA !== "TANPA GEDUNG") return -1;
        if (gedungA !== gedungB) return gedungA.localeCompare(gedungB);
        // Gedung sama -- grup NORMAL duluan, baru THSP nyusul di belakangnya.
        return subA.localeCompare(subB);
      });

      const trips = [];
      let seq = manualTrips.length;
      let partialCount = 0;
      const partialItemSeen = new Set();

      groupOrder.forEach((groupKey) => {
        const gedung = groupKey.split("||")[0];
        // Trip existing yang dicari best-fit-nya cuma trip DALAM GRUP
        // YANG SAMA (gedung + TH/SP vs biasa -- groupTrips lokal) --
        // bukan `trips` global -- biar item BPW1 gak pernah ke-nyelip ke
        // trip yang isinya BPW2, dan item TH/SP gak pernah ke-nyelip ke
        // trip item biasa (atau sebaliknya).
        const groupTrips = [];

        chunksByGroup.get(groupKey).forEach((item) => {
          const berat = Number(item.berat || 0);
          const qty = item.allocQty;
          const itemVolume = item.lineVolume;

          if (item.qty < item.sisa && !partialItemSeen.has(item.item)) {
            partialItemSeen.add(item.item);
            partialCount += 1;
          }

          // Cari trip existing (di gedung yang sama) yang masih muat
          // dengan sisa ruang PALING KECIL (best fit) supaya truk yang
          // udah lumayan penuh ditambalin dulu, bukan malah buka trip
          // baru. Batas "4 item per trip" tetep berlaku buat BARIS ITEM
          // BEDA -- tapi kalau item ini emang udah ada di trip itu (chunk
          // lanjutan dari item yang sama), tetep boleh gabung walau trip
          // udah kepenuhan slotnya (gak nambah baris baru, cuma nambah
          // qty di baris yang sama). Tire tube-type makan 2 slot sekaligus
          // (lihat itemSlotCount) karena bakal nambahin 1 baris tube lagi.
          let bestTrip = null;
          let bestLeftover = Infinity;
          const neededSlots = itemSlotCount(item.item);

          groupTrips.forEach((t) => {
            const sudahAdaItemIni = t.items.some((i) => i.item === item.item);
            const slotsUsed = t._slots || 0;
            if (slotsUsed + neededSlots > 4 && !sudahAdaItemIni) return;

            const newVolume = Number((t._volume + itemVolume).toFixed(3));
            if (cap > 0 && newVolume > cap) return;

            const leftover = cap > 0 ? cap - newVolume : Infinity;

            if (leftover < bestLeftover) {
              bestLeftover = leftover;
              bestTrip = t;
            }
          });

          if (!bestTrip) {
            seq += 1;
            bestTrip = {
              id: `trip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${seq}`,
              no_trip: generateManualDoNumber(seq),
              gedung,
              items: [],
              _volume: 0,
              _slots: 0,
            };
            groupTrips.push(bestTrip);
          }

          const idx = bestTrip.items.findIndex((i) => i.item === item.item);
          if (idx >= 0) {
            const mergedQty = Number(bestTrip.items[idx].qty) + qty;
            bestTrip.items[idx] = {
              ...bestTrip.items[idx],
              qty: mergedQty,
              total_volume: Number((mergedQty * item.volume).toFixed(3)),
              total_berat: Number((mergedQty * berat).toFixed(2)),
            };
          } else {
            bestTrip.items.push({
              item: item.item,
              deskripsi: item.deskripsi,
              qty,
              volume: item.volume,
              total_volume: itemVolume,
              berat,
              total_berat: Number((qty * berat).toFixed(2)),
              stok_tangerang: Number(item.stok_tangerang || 0),
              tanggal_request: item.tanggal_request || null,
              gedung: item.gedung || null,
            });
            // Baris baru (bukan chunk lanjutan) -- baru makan slot.
            bestTrip._slots = (bestTrip._slots || 0) + neededSlots;
          }
          bestTrip._volume = Number((bestTrip._volume + itemVolume).toFixed(3));
        });

        trips.push(...groupTrips);
      });

      // Auto-add tube pasangan tiap tire yang barusan masuk trip (qty 1:1,
      // liat master di halaman "Master Tire-Tube"). Ditambahin SETELAH
      // bin-packing tire selesai, jadi gak ngaruh ke keputusan best-fit
      // tire-nya, tapi tetep keitung di total_volume trip yang ditampilin.
      trips.forEach((t) => {
        const tireLines = [...t.items];
        tireLines.forEach((tireLine) => {
          const tubeLine = buildPairedTubeLine(tireLine.item, tireLine.qty);
          if (!tubeLine) return;

          const idx = t.items.findIndex((i) => i.item === tubeLine.item);
          if (idx >= 0) {
            const mergedQty = Number(t.items[idx].qty) + tubeLine.qty;
            t.items[idx] = {
              ...t.items[idx],
              qty: mergedQty,
              total_volume: Number((mergedQty * tubeLine.volume).toFixed(3)),
              total_berat: Number((mergedQty * tubeLine.berat).toFixed(2)),
            };
          } else {
            t.items.push(tubeLine);
          }
          t._volume = Number((t._volume + tubeLine.total_volume).toFixed(3));
        });
      });
      const newTrips = trips.map(({ _volume, _slots, ...t }) => t);

      // Auto-assign truk (Truk 1, Truk 2, dst) ke tiap trip baru yang
      // BELUM punya truk, lanjut dari slot yang udah kepake -- tetep bisa
      // diganti manual kapan aja lewat tombol "Pilih Truk" (handleSetTripTruck).
      const usedTruckNumbers = manualTrips
        .map((t) => (t.truck || "").trim())
        .filter(Boolean)
        .map((label) => {
          const m = label.match(/^Truk\s+(\d+)$/i);
          return m ? Number(m[1]) : null;
        })
        .filter((n) => n !== null);
      let nextSlot =
        Math.max(
          maxTruckSlot,
          usedTruckNumbers.length ? Math.max(...usedTruckNumbers) : 0,
        ) + 1;

      const newTripsWithTruck = newTrips.map((t) => {
        if (t.truck) return t;
        const truck = `Truk ${nextSlot}`;
        nextSlot += 1;
        return { ...t, truck };
      });

      setMaxTruckSlot(nextSlot - 1);
      setManualTrips((prev) => [...prev, ...newTripsWithTruck]);
      setShowPreviewTable(false);
      const partialNote =
        partialCount > 0
          ? ` (${partialCount} item cuma kebagi sebagian karena stok Tangerang terbatas)`
          : "";

      Swal.fire({
        icon: "success",
        title: "Trip Otomatis Dibuat",
        text: `${newTrips.length} trip berhasil dibuat dari ${candidates.length} item.${partialNote}`,
        timer: 6000,
        showConfirmButton: false,
      });
    } finally {
      setLoadingRencanaTransfer(false);
    }
  };

  // Ubah qty 1 baris item di dalam trip manual (bisa nambah/ngurangin),
  // total_volume & total_berat ikut dihitung ulang otomatis.
  const updateManualTripItemQty = (tripId, itemCode, rawQty) => {
    const qty = Math.max(0, Number(rawQty) || 0);
    const normalizedTireCode = String(itemCode).trim().toUpperCase();

    setManualTrips((prev) =>
      prev.map((t) => {
        if (t.id !== tripId) return t;

        const items = t.items.map((i) => {
          const volume = Number(i.volume || 0);
          const berat = Number(i.berat || 0);

          if (i.item === itemCode) {
            return {
              ...i,
              qty,
              total_volume: Number((qty * volume).toFixed(3)),
              total_berat: Number((qty * berat).toFixed(2)),
            };
          }

          // Tube pasangan yang auto-nempel ke tire ini ikut disamain
          // qty-nya (rasio selalu 1:1).
          if (i.pairedTire === normalizedTireCode) {
            return {
              ...i,
              qty,
              total_volume: Number((qty * volume).toFixed(3)),
              total_berat: Number((qty * berat).toFixed(2)),
            };
          }

          return i;
        });

        return { ...t, items };
      }),
    );
  };

  const updateAddItemForm = (tripId, field, value) => {
    setAddItemForm((prev) => ({
      ...prev,
      [tripId]: { ...prev[tripId], [field]: value },
    }));
  };

  // Tambah 1 item manual ke trip TERTENTU (dipilih dari daftar Item
  // Request). Kalau item itu udah ada di trip yang sama, qty-nya digabung
  // (bukan bikin baris dobel). Batas 4 item/trip tetep berlaku KECUALI
  // item yang dipilih emang udah ada di trip itu (cuma nambah qty, gak
  // nambah baris baru).
  const addManualItemToTrip = (tripId) => {
    const form = addItemForm[tripId] || {};
    const itemCode = form.itemCode;
    const qty = Number(form.qty);

    if (!itemCode) {
      Swal.fire(
        "Pilih Item Dulu",
        "Pilih item yang mau ditambahin.",
        "warning",
      );
      return;
    }

    if (!qty || qty <= 0) {
      Swal.fire("Qty Belum Diisi", "Isi qty lebih dari 0.", "warning");
      return;
    }

    const trip = manualTrips.find((t) => t.id === tripId);
    const alreadyInTrip = trip?.items.some((i) => i.item === itemCode);

    const meta = pickableItems.find((i) => i.item === itemCode) || {};
    const deskripsi = meta.deskripsi || "";
    const volume = Number(meta.volume || 0);
    const berat = Number(meta.berat || 0);
    // Tire tube-type (punya pasangan tube) SELALU dari BPW1 -- lihat
    // effectiveGedung.
    const itemGedung = effectiveGedung(itemCode, meta.gedung || null);

    // Tube pasangan (kalau ada) bakal ikut nambah baris juga — hitung dulu
    // biar cek "trip penuh" (maks 4 item/trip) akurat buat KEDUANYA.
    const pairedTubeLine = buildPairedTubeLine(itemCode, qty);
    const tubeAlreadyInTrip =
      pairedTubeLine && trip?.items.some((i) => i.item === pairedTubeLine.item);
    const newLinesCount =
      (alreadyInTrip ? 0 : 1) + (pairedTubeLine && !tubeAlreadyInTrip ? 1 : 0);

    if (trip && trip.items.length + newLinesCount > 4) {
      Swal.fire(
        "Trip Udah Penuh",
        "Maksimal 4 item per trip. Hapus salah satu item dulu atau pilih trip lain.",
        "warning",
      );
      return;
    }

    // ===== AUTO-CAP KAPASITAS TRUK =====
    // Volume trip gak boleh lewat truckCapacity. Tube pasangan gak
    // dihitung (volume-nya selalu 0, cek buildPairedTubeLine), jadi yang
    // dicek cuma volume item utama. existingQty = qty item ini yang udah
    // ada di trip (kalau nambahin lagi ke item yang sama), baseVolume =
    // volume trip TANPA item ini (biar gak double-hitung pas dihitung
    // ulang). Sisa kapasitas dipakai buat nentuin qty maksimal yang masih
    // muat — kalau qty yang diminta user kelebihan, otomatis dipotong ke
    // situ dan sisanya harus dibikinin trip baru manual sama user.
    const existingQty = Number(
      trip?.items.find((i) => i.item === itemCode)?.qty || 0,
    );
    const baseVolume = (trip?.items || [])
      .filter((i) => i.item !== itemCode)
      .reduce((sum, i) => sum + Number(i.total_volume || 0), 0);
    const cap = Number(truckCapacity) || 0;
    const remainingCapacity = cap > 0 ? cap - baseVolume : Infinity;
    const maxQtyThatFits =
      volume > 0
        ? Math.max(0, Math.floor((remainingCapacity + Number.EPSILON) / volume))
        : Infinity;

    let qtyToAdd = qty;

    if (maxQtyThatFits <= existingQty) {
      Swal.fire(
        "Kapasitas Truk Udah Penuh",
        `Trip ini sisa kapasitasnya udah gak cukup buat nambahin ${itemCode}. Bikin trip baru buat sisa qty-nya.`,
        "warning",
      );
      return;
    }

    if (existingQty + qty > maxQtyThatFits) {
      qtyToAdd = maxQtyThatFits - existingQty;
    }

    const isCapped = qtyToAdd < qty;
    const finalQty = qtyToAdd;

    setManualTrips((prev) =>
      prev.map((t) => {
        if (t.id !== tripId) return t;

        let items = [...t.items];

        const idx = items.findIndex((i) => i.item === itemCode);
        if (idx >= 0) {
          const mergedQty = Number(items[idx].qty) + finalQty;
          items[idx] = {
            ...items[idx],
            qty: mergedQty,
            total_volume: Number((mergedQty * volume).toFixed(3)),
            total_berat: Number((mergedQty * berat).toFixed(2)),
          };
        } else {
          items.push({
            item: itemCode,
            deskripsi,
            qty: finalQty,
            volume,
            total_volume: Number((finalQty * volume).toFixed(3)),
            berat,
            total_berat: Number((finalQty * berat).toFixed(2)),
            stok_tangerang: Number(meta.stok_tangerang || 0),
            tanggal_request: meta.tanggal_request || null,
            gedung: itemGedung,
          });
        }

        // Auto-add / sync tube pasangan (qty 1:1 sama tire di atas, pake
        // finalQty biar konsisten kalau qty tire-nya kena auto-cap).
        if (pairedTubeLine) {
          const tubeIdx = items.findIndex(
            (i) => i.item === pairedTubeLine.item,
          );
          if (tubeIdx >= 0) {
            const mergedQty = Number(items[tubeIdx].qty) + finalQty;
            items[tubeIdx] = {
              ...items[tubeIdx],
              qty: mergedQty,
              total_volume: Number(
                (mergedQty * pairedTubeLine.volume).toFixed(3),
              ),
              total_berat: Number(
                (mergedQty * pairedTubeLine.berat).toFixed(2),
              ),
            };
          } else {
            items.push({
              ...pairedTubeLine,
              qty: finalQty,
              total_berat: Number((finalQty * pairedTubeLine.berat).toFixed(2)),
            });
          }
        }

        return { ...t, items };
      }),
    );

    setAddItemForm((prev) => ({
      ...prev,
      [tripId]: { itemCode: "", qty: "" },
    }));

    if (isCapped) {
      Swal.fire(
        "Qty Dipotong Otomatis",
        `Sisa kapasitas trip ini cuma muat ${finalQty} dari ${qty} yang diminta. Sisanya (${qty - finalQty}) belum masuk — bikin trip baru buat nampung sisanya.`,
        "info",
      );
    }
  };

  const generateManualDoNumber = (sequence) => {
    const seq = String(sequence).padStart(3, "0");

    if (uploadTanggal && /^\d{4}-\d{2}-\d{2}/.test(String(uploadTanggal))) {
      const [yyyy, mm, dd] = String(uploadTanggal).slice(0, 10).split("-");
      return `T-2${dd}${mm}${yyyy.slice(-2)}${seq}`;
    }

    const jakartaStr = toJakartaDateString(new Date());
    const [yyyy, mm, dd] = jakartaStr.split("-");
    return `T-2${dd}${mm}${yyyy.slice(-2)}${seq}`;
  };

  // Bikin trip manual baru (No Trip auto-generate, tapi bisa diedit user).
  const addManualTrip = () => {
    const id = `trip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const usedTruckNumbers = manualTrips
      .map((t) => (t.truck || "").trim())
      .filter(Boolean)
      .map((label) => {
        const m = label.match(/^Truk\s+(\d+)$/i);
        return m ? Number(m[1]) : null;
      })
      .filter((n) => n !== null);
    const nextSlot =
      Math.max(
        maxTruckSlot,
        usedTruckNumbers.length ? Math.max(...usedTruckNumbers) : 0,
      ) + 1;

    setMaxTruckSlot(nextSlot);

    setManualTrips((prev) => [
      ...prev,
      {
        id,
        no_trip: generateManualDoNumber(prev.length + 1),
        truck: `Truk ${nextSlot}`,
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

  // Edit gedung (BPW1/BPW2) buat SATU NO TRIP -- ikut nyamain gedung
  // SEMUA item di dalam trip itu, biar konsisten (satu trip = satu
  // gedung asal truk). Kalau ada item yang emang beda gedung-nya,
  // benerin lagi manual per item lewat updateManualTripItemGedung.
  const updateManualTripGedung = (tripId, gedung) => {
    setManualTrips((prev) =>
      prev.map((t) =>
        t.id === tripId
          ? {
              ...t,
              gedung,
              items: t.items.map((i) => ({ ...i, gedung })),
            }
          : t,
      ),
    );
  };

  // Edit gedung (BPW1/BPW2) buat SATU ITEM di dalam trip (override
  // manual, gak ngubah gedung trip-nya atau item lain).
  const updateManualTripItemGedung = (tripId, itemCode, gedung) => {
    setManualTrips((prev) =>
      prev.map((t) =>
        t.id === tripId
          ? {
              ...t,
              items: t.items.map((i) =>
                i.item === itemCode ? { ...i, gedung } : i,
              ),
            }
          : t,
      ),
    );
  };

  // Assign truk fisik ke 1 trip -- 1 truk bisa jalan BEBERAPA trip (mis.
  // truk B 1234 CD jalan trip 1, balik lagi, jalan trip 3), jadi ini
  // cuma nge-tag/nandain trip ini dibawa truk apa (bukan batesin 1 truk
  // = 1 trip). Nilai truk-nya bebas diisi sama di beberapa trip berbeda.
  const handleSetTripTruck = async (tripId) => {
    const trip = manualTrips.find((t) => t.id === tripId);

    // "Pilih Truk" itu milih SLOT truk (Truk 1, Truk 2, dst), BUKAN input
    // no. polisi -- karena 1 truk fisik bisa jalan lebih dari 1 trip
    // sekaligus (nanti dikelompokin bareng di modal "Trip per Truk"). No.
    // polisi asli tetap diisi manual di kertas RMB (kolomnya sengaja
    // dikosongin, lihat buildRmbPrintHtml).
    const usedTruckNumbers = Array.from(
      new Set(
        manualTrips
          .map((t) => (t.truck || "").trim())
          .filter(Boolean)
          .map((label) => {
            const m = label.match(/^Truk\s+(\d+)$/i);
            return m ? Number(m[1]) : null;
          })
          .filter((n) => n !== null),
      ),
    ).sort((a, b) => a - b);

    // Slot maksimal PERNAH dibuka sejauh ini (persisten, gak reset walau
    // di-"Lepas dari Truk") -- dipakai biar Truk 2 dkk gak ilang dari
    // pilihan cuma gara-gara lagi gak dipake trip manapun.
    const effectiveMaxSlot = Math.max(
      maxTruckSlot,
      usedTruckNumbers.length ? Math.max(...usedTruckNumbers) : 0,
    );
    const nextTruckNumber = effectiveMaxSlot + 1;

    if (effectiveMaxSlot > maxTruckSlot) {
      setMaxTruckSlot(effectiveMaxSlot);
    }

    // Opsi = semua slot truk yang pernah dibuka (1..effectiveMaxSlot) + 1
    // slot truk baru berikutnya, minimal selalu ada "Truk 1".
    const optionNumbers = Array.from(
      new Set([
        ...Array.from({ length: effectiveMaxSlot }, (_, i) => i + 1),
        nextTruckNumber,
        1,
      ]),
    ).sort((a, b) => a - b);

    const inputOptions = optionNumbers.reduce((acc, n) => {
      const label = `Truk ${n}`;
      const tripsOnThisTruck = manualTrips.filter(
        (t) => (t.truck || "").trim() === label && t.id !== tripId,
      ).length;
      acc[label] = tripsOnThisTruck
        ? `${label} (udah ada ${tripsOnThisTruck} trip lain)`
        : `${label} (kosong)`;
      return acc;
    }, {});

    const {
      value: truckValue,
      isConfirmed,
      isDenied,
    } = await Swal.fire({
      title: "Pilih Truk Buat Trip Ini",
      text: "1 truk boleh dipakai lebih dari 1 trip sekaligus.",
      input: "select",
      inputOptions,
      inputValue: trip?.truck || "",
      inputPlaceholder: "-- pilih truk --",
      showCancelButton: true,
      confirmButtonText: "Simpan",
      cancelButtonText: "Batal",
      showDenyButton: Boolean(trip?.truck),
      denyButtonText: "Lepas dari Truk",
      denyButtonColor: "#64748b",
    });

    if (isDenied) {
      setManualTrips((prev) =>
        prev.map((t) => (t.id === tripId ? { ...t, truck: "" } : t)),
      );
      return;
    }

    if (!isConfirmed || !truckValue) return;

    setManualTrips((prev) =>
      prev.map((t) => (t.id === tripId ? { ...t, truck: truckValue } : t)),
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
    const normalizedTireCode = String(itemCode).trim().toUpperCase();

    setManualTrips((prev) =>
      prev.map((t) =>
        t.id === tripId
          ? {
              ...t,
              // Hapus item-nya sendiri, DAN tube pasangan yang auto-nempel
              // ke item ini (kalau itemCode yang dihapus emang tire yang
              // punya pasangan) — biar gak nyisain tube nyangkut sendirian.
              items: t.items.filter(
                (i) =>
                  i.item !== itemCode && i.pairedTire !== normalizedTireCode,
              ),
            }
          : t,
      ),
    );
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

  // Hitung kode Week berjalan format "YYWW" (2 digit tahun + 2 digit
  // nomor minggu ISO), dipakai buat QR "MAX WEEK" di RMB — otomatis
  // ngikutin minggu berjalan pas dicetak, gak perlu diubah manual.
  const getCurrentWeekCode = () => {
    const now = new Date();
    const d = new Date(
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
    );
    // Geser ke hari Kamis di minggu yang sama (aturan ISO week)
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    const yy = String(d.getUTCFullYear()).slice(-2);
    const ww = String(weekNo).padStart(2, "0");

    return `${yy}${ww}`;
  };

  // MIN WEEK dikunci "2501" (awal tahun), MAX WEEK ngikutin minggu
  // berjalan (getCurrentWeekCode()) — otomatis maju tiap minggu.
  const RMB_MIN_WEEK = "2501";

  // Barcode buat NO KIRIM — pakai QRCodeSVG yang sama kaya kolom
  // SHIPP.INS. (bukan JsBarcode), jadi tinggal renderToStaticMarkup
  // biasa, konsisten sama QR yang udah ada.
  const renderNoKirimBarcodeSvg = (value) => {
    if (!value) return "";
    return renderToStaticMarkup(
      <QRCodeSVG value={String(value)} size={34} level="M" marginSize={0} />,
    );
  };

  // ===== CETAK RMB (Rencana Muat Barang) =====
  // Langsung cetak (window.print) tanpa modal isian — data header yang
  // gak ada di sistem (No SO, PA/EMKL, No Polisi, No Cont, LPN) dibiarin
  // kosong di form-nya, biar bisa diisi manual/dicap di kertas kalau perlu.
  const buildRmbPrintHtml = (trip, catatan = "") => {
    const items = trip.items || [];
    // Escape dulu biar catatan yang ada karakter <, >, & gak ngerusak HTML
    // hasil cetak. Baris baru (Enter) diubah jadi <br/> biar tetep kebaca
    // per baris pas dicetak.
    const catatanHtml = String(catatan || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .split("\n")
      .join("<br/>");
    // TGL KIRIM / DATE di RMB harus ikut tanggal Item Request yang
    // di-upload (bukan tanggal/jam pas user klik cetak) -- ambil dari
    // tanggal_request item pertama di trip yang punya nilai (kalau
    // beberapa item beda tanggal, dianggap gak wajar dan tetep pakai yang
    // pertama ketemu). Fallback ke tanggal hari ini kalau data lama
    // (sebelum fix ini) belum kebawa tanggal_request-nya sama sekali.
    const formatTanggal = (val) => {
      if (val && /^\d{4}-\d{2}-\d{2}/.test(String(val))) {
        const [yyyy, mm, dd] = String(val).slice(0, 10).split("-");
        return `${dd}/${mm}/${yyyy}`;
      }
      const d = new Date();
      return `${String(d.getDate()).padStart(2, "0")}/${String(
        d.getMonth() + 1,
      ).padStart(2, "0")}/${d.getFullYear()}`;
    };
    const requestTanggal = items.find(
      (it) => it.tanggal_request,
    )?.tanggal_request;
    const today = formatTanggal(requestTanggal) || formatTanggal(new Date());
    const maxWeek = getCurrentWeekCode();
    const noKirimBarcodeSvg = renderNoKirimBarcodeSvg(trip.no_trip);

    let totalQty = 0;
    let totalM3 = 0;
    let totalKg = 0;

    const rows = items
      .map((item, idx) => {
        const qty = Number(item.qty || 0);
        const volume = Number(
          item.total_volume ?? qty * Number(item.volume || 0),
        );
        const berat = Number(item.total_berat ?? qty * Number(item.berat || 0));

        totalQty += qty;
        totalM3 += volume;
        totalKg += berat;

        // QR kolom SHIPP.INS isinya (dipisah TAB, diakhiri baris baru):
        // item [TAB] qty [TAB] MIN WEEK (2501 tetap) [TAB] MAX WEEK
        // (minggu berjalan, otomatis maju tiap minggu) [LF]
        const qrValue = `${item.item || ""}\t${qty}\t${RMB_MIN_WEEK}\t${maxWeek}\n`;
        const qrSvg = item.item
          ? renderToStaticMarkup(
              <QRCodeSVG value={qrValue} size={34} level="M" marginSize={0} />,
            )
          : "";

        return `
      <tr>
        <td class="c">${idx + 1}</td>
        <td>${item.item || ""}</td>
        <td>${item.deskripsi || ""}</td>
        <td class="r">${qty.toLocaleString("id-ID")}</td>
        <td class="c"></td>
        <td class="c">${item.gedung || trip.gedung || "BPW1"}</td>
        <td class="c">${Number(item.stok_tangerang || 0).toLocaleString("id-ID")}</td>
        <td class="c"></td>
        <td class="c">PCS</td>
        <td class="r">${volume.toLocaleString("id-ID", {
          minimumFractionDigits: 3,
          maximumFractionDigits: 3,
        })}</td>
        <td class="c qr-cell ${idx % 2 === 0 ? "qr-left" : "qr-right"}">${qrSvg}</td>
        <td></td>
        <td class="c"></td>
      </tr>`;
      })
      .join("");

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>RMB - ${trip.no_trip || ""}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; font-size: 11px; margin: 0; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; }
  .company { font-weight: 700; font-size: 16px; }
  .addr { font-size: 13px; }
  .meta { text-align: right; font-size: 11px; }
  h1 { text-align: center; font-size: 16px; margin: 24px 0 18px; letter-spacing: 1px; }
  .doc-code { text-align: center; font-size: 12px; font-weight: 700; margin: 24px 0 0; letter-spacing: 1px; }
  .info { display: flex; margin-bottom: 16px; }
  .info-col { font-size: 9px; }
  .info-col:first-child { flex: 0 0 51%; }
  .info-col:last-child { flex: 1; }
  .info-row { display: flex; padding: 2px 0; }
  .info-row .label { width: 58px; flex-shrink: 0; font-weight: 200; white-space: nowrap; }
  .info-row .colon { width: 8px; flex-shrink: 0; }
  .info-row .value { flex: 1; }
  .info-row.no-kirim-row { position: relative; }
  .no-kirim-barcode { position: absolute; left: 160px; top: -6px; line-height: 0; }
  .no-kirim-barcode svg { width: 30px; height: 30px; display: block; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 6px; }
  table.items th, table.items td {padding: 4px 6px; font-size: 9px; }
  table.items th { color: #000; font-weight: 700; text-align: center; }
  table.items th .th-line { display: inline-block; border-bottom: 1.5px dashed #000; padding-bottom: 4px; }
  table.items td.c { text-align: center; }
  table.items td.r { text-align: right; }
  table.items td.qr-cell { padding: 2px 4px; line-height: 0; }
  table.items td.qr-cell svg { width: 30px; height: 30px; display: block; }
  table.items td.qr-cell.qr-left svg { margin: 0 auto 0 2px; }
  table.items td.qr-cell.qr-right svg { margin: 0 2px 0 auto; }
  .footer-row { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 10px; }
  .totals-row { display: flex; gap: 30px; font-weight: 700; font-size: 11px; }
  .sign-header { display: flex; justify-content: space-between; margin-top: 30px; text-align: center; font-size: 11px; font-weight: 700; }
  .sign-header > div { width: 30%; }
  .sign-header > div:last-child { width: 60%; }
  .sign { display: flex; justify-content: space-between; margin-top: 24px; text-align: center; font-size: 11px; }
  .sign > div { width: 30%; }
  .sign .line { margin-top: 60px; padding-top: 4px; }
  .catatan { font-size: 11px; margin-bottom: 14px; }
  .catatan .line2 { margin-top: 4px; width: 260px; padding-top: 6px; }
  .bottom { margin-top: auto; margin-bottom: 20mm; }
  @media print {
    .no-print { display: none; }
  }
</style>
</head>
<body style="display: flex; flex-direction: column; min-height: 100vh;">
  <div class="top">
    <div>
      <div class="company">PT. GAJAH TUNGGAL TBK</div>
      <div class="addr">TANGERANG</div>
    </div>
    <div class="meta">
      <div>DATE : ${today}</div>
      <div>PAGE : 1 / 1</div>
    </div>
  </div>

  <div class="doc-code">M</div>
  <h1>RENCANA MUAT BARANG</h1>

  <div class="info">
    <div class="info-col">
      <div class="info-row"><span class="label">NO SO</span><span class="colon">:</span><span class="value"></span></div>
      <div class="info-row"><span class="label">CUSTOMER</span><span class="colon">:</span><span class="value">GT DC Karawang</span></div>
      <div class="info-row"><span class="label">KOTA</span><span class="colon">:</span><span class="value">Jawa Barat</span></div>
      <div class="info-row no-kirim-row"><span class="label">NO KIRIM</span><span class="colon">:</span><span class="value">${trip.no_trip || ""}</span>${noKirimBarcodeSvg ? `<span class="no-kirim-barcode">${noKirimBarcodeSvg}</span>` : ""}</div>
      <div class="info-row"><span class="label">TGL KIRIM</span><span class="colon">:</span><span class="value">${today}</span></div>
      <div class="info-row"><span class="label">NAMA TRIP</span><span class="colon">:</span><span class="value"></span></div>
    </div>
    <div class="info-col">
      <div class="info-row"><span class="label">PA/EMKL</span><span class="colon">:</span><span class="value"></span></div>
      <div class="info-row"><span class="label">JEN. KEND</span><span class="colon">:</span><span class="value"></span></div>
      <div class="info-row"><span class="label">NO POLISI</span><span class="colon">:</span><span class="value"></span></div>
      <div class="info-row"><span class="label">NO CONT</span><span class="colon">:</span><span class="value"></span></div>
      <div class="info-row"><span class="label">LPN</span><span class="colon">:</span><span class="value"></span></div>
    </div>
  </div>

  <table class="items">
    <thead>
      <tr>
        <th style="width: 3%;"><span class="th-line">NO.</span></th>
        <th style="width: 11%;"><span class="th-line">KODE ITEM</span></th>
        <th style="width: 24%;"><span class="th-line">DESKRIPSI</span></th>
        <th style="width: 4%;"><span class="th-line">KIRIM</span></th>
        <th style="width: 4%;"><span class="th-line">EXTRA</span></th>
        <th style="width: 4%;"><span class="th-line">S.INV</span></th>
        <th style="width: 4%;"><span class="th-line">STOK</span></th>
        <th style="width: 4%;"><span class="th-line">AKTUAL</span></th>
        <th style="width: 4%;"><span class="th-line">UOM</span></th>
        <th style="width: 4%;"><span class="th-line">M3</span></th>
        <th style="width: 20%;"><span class="th-line">SHIPP.INS.</span></th>
        <th style="width: 4%;"><span class="th-line">PACK.INS.</span></th>
        <th style="width: 10%;"><span class="th-line">NO SO.</span></th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <div class="bottom">
    <div class="footer-row">
      <div class="catatan">
        <div>Catatan :</div>
        <div class="line2">${catatanHtml || "&nbsp;"}</div>
      </div>
      <div class="totals-row">
        <div>TOTAL PCS : ${totalQty.toLocaleString("id-ID")}</div>
        <div>TOTAL M3 : ${totalM3.toLocaleString("id-ID", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}</div>
        <div>TOTAL KG : ${totalKg.toLocaleString("id-ID", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}</div>
      </div>
    </div>

    <div class="sign-header">
      <div></div>
      <div>PELAKSANAAN MUAT BARANG</div>
    </div>
    <div class="sign">
      <div style="margin-left:95px;">
        <div>MENGETAHUI,</div>
        <div class="line">( SH PERENCANAAN )</div>
      </div>
      <div>
        <div>MENYERAHKAN,</div>
        <div class="line">(&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)</div>
      </div>
      <div>
        <div>MENERIMA,</div>
        <div class="line">(&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)</div>
      </div>
    </div>
  </div>
</body>
</html>`;
  };

  // Sebelum cetak, tanya dulu catatan RMB-nya lewat Swal (textarea) —
  // prefill dari catatan yang udah pernah diisi buat trip ini (kalau ada).
  // Kalau user klik "Batal", gak jadi cetak.
  const handlePrintRmb = async (trip) => {
    if (!trip.items.length) {
      Swal.fire(
        "Belum Ada Item",
        "Trip ini belum ada item, gak bisa dicetak RMB-nya.",
        "warning",
      );
      return;
    }

    const { value: catatan, isConfirmed } = await Swal.fire({
      title: "Catatan RMB",
      html: `<div style="text-align:left; font-size:12px; color:#64748b; margin-bottom:6px;">No Trip: <strong>${
        trip.no_trip || "-"
      }</strong></div>`,
      input: "textarea",
      inputLabel: "Isi catatan yang mau muncul di lembar RMB (opsional)",
      inputValue: catatanByTrip[trip.id] || "",
      inputPlaceholder: "Muat di Gudang BPW1/BPW 2 ",
      inputAttributes: { style: "min-height: 90px;" },
      showCancelButton: true,
      confirmButtonText: "Cetak",
      cancelButtonText: "Batal",
      confirmButtonColor: "#1d4ed8",
    });

    if (!isConfirmed) return;

    // Simpen biar kalau trip yang sama dicetak ulang, catatan sebelumnya
    // masih keisi (gak perlu ngetik ulang dari nol).
    setCatatanByTrip((prev) => ({ ...prev, [trip.id]: catatan || "" }));

    const html = buildRmbPrintHtml(trip, catatan || "");
    const printWindow = window.open("", "_blank", "width=1200,height=800");

    if (!printWindow) {
      Swal.fire(
        "Gagal Membuka Print",
        "Browser memblokir pop-up. Izinkan pop-up buat halaman ini lalu coba lagi.",
        "warning",
      );
      return;
    }

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
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
          truck: t.truck || null,
          items: t.items,
        })),
      });

      await Swal.fire({
        icon: "success",
        title: "Trip Plan Tersimpan",
        text:
          res.data?.data?.message || "Trip Plan berhasil disimpan ke histori.",
        timer: 2200,
        showConfirmButton: false,
      });

      setManualTrips([]);
      setMaxTruckSlot(1);

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
    setMaxTruckSlot(1);

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
              onClick={() => setShowTireTubeModal(true)}
              title="Kelola Master Pasangan Tire-Tube"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                border: "1.5px solid #c7d2fe",
                background: "#eef2ff",
                color: "#4338ca",
                borderRadius: 8,
                padding: "8px 14px",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              <Link2 size={13} />
              Kelola Master Tire-Tube
            </button>

            <button
              type="button"
              onClick={() => setShowTripPerTrukModal(true)}
              title="Trip per Truk (dari data live Monitoring Transfer)"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                border: "1.5px solid #bae6fd",
                background: "#f0f9ff",
                color: "#0369a1",
                borderRadius: 8,
                padding: "8px 14px",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              <Truck size={13} />
              Trip per Truk
            </button>

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
                border: "1.5px solid #fde68a",
                background: "#fffbeb",
                color: "#b45309",
                borderRadius: 8,
                padding: "8px 14px",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              <Filter size={13} />
              Filter Riwayat
            </button>

            <button
              type="button"
              onClick={() => setShowUploadModal(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                border: "1.5px solid #0021b3",
                background: "#0021b3",
                color: "#fff",
                borderRadius: 8,
                padding: "8px 14px",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              <Upload size={13} />
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
            display: "flex",
            gap: 10,
            marginBottom: 14,
          }}
        >
          {/* ================= JUMLAH ITEM ================= */}
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "linear-gradient(135deg, #eff6ff 0%, #ffffff 55%)",
              border: "1px solid #dbeafe",
              borderLeft: "3px solid #3b82f6",
              borderRadius: 8,
              padding: "7px 12px",
              boxShadow: "0 1px 4px rgba(15, 23, 42, 0.05)",
              overflowX: "auto",
            }}
          >
            {(() => {
              const totalItem = summaryItemReq.reduce(
                (total, item) => total + Number(item.jumlah_item || 0),
                0,
              );
              const breakdown = summaryItemReq.filter(
                (item) => item.jenis !== "TIRE",
              );

              return (
                <>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 24,
                      height: 24,
                      borderRadius: 7,
                      background: "#3b82f6",
                      flexShrink: 0,
                    }}
                  >
                    <Boxes size={14} color="#fff" />
                  </div>

                  <div style={{ whiteSpace: "nowrap" }}>
                    <div
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: "#3b82f6",
                        textTransform: "uppercase",
                        letterSpacing: "0.03em",
                      }}
                    >
                      Jumlah Item
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 800,
                        color: "#0f172a",
                        lineHeight: 1.3,
                      }}
                    >
                      {totalItem.toLocaleString("id-ID")}{" "}
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 600,
                          color: "#94a3b8",
                        }}
                      >
                        Item
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      width: 1,
                      height: 22,
                      background: "#dbeafe",
                      flexShrink: 0,
                    }}
                  />

                  <div style={{ display: "flex", gap: 6 }}>
                    {breakdown.map((item) => {
                      const accent = getJenisAccent(item.jenis);
                      return (
                        <div
                          key={item.jenis}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            background: accent.bg,
                            border: `1px solid ${accent.border}`,
                            borderRadius: 6,
                            padding: "3px 9px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: accent.dot,
                              flexShrink: 0,
                            }}
                          />
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              color: accent.text,
                              textTransform: "uppercase",
                            }}
                          >
                            {item.jenis}
                          </span>
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 800,
                              color: "#0f172a",
                            }}
                          >
                            {Number(item.jumlah_item || 0).toLocaleString(
                              "id-ID",
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>

          {/* ================= TOTAL REQUEST ================= */}
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "linear-gradient(135deg, #f5f3ff 0%, #ffffff 55%)",
              border: "1px solid #ede9fe",
              borderLeft: "3px solid #8b5cf6",
              borderRadius: 8,
              padding: "7px 12px",
              boxShadow: "0 1px 4px rgba(15, 23, 42, 0.05)",
              overflowX: "auto",
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
              const breakdown = summaryItemReq.filter(
                (item) => item.jenis !== "TIRE",
              );

              return (
                <>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 24,
                      height: 24,
                      borderRadius: 7,
                      background: "#8b5cf6",
                      flexShrink: 0,
                    }}
                  >
                    <PieChart size={14} color="#fff" />
                  </div>

                  <div style={{ whiteSpace: "nowrap" }}>
                    <div
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: "#8b5cf6",
                        textTransform: "uppercase",
                        letterSpacing: "0.03em",
                      }}
                    >
                      Total Request
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: 5,
                        fontSize: 13,
                        fontWeight: 800,
                        lineHeight: 1.3,
                      }}
                    >
                      <span style={{ color: "#0f172a" }}>
                        {totalQty.toLocaleString("id-ID")}{" "}
                        <span
                          style={{
                            fontSize: 9,
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
                        <span style={{ fontSize: 9, fontWeight: 600 }}>m³</span>
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      width: 1,
                      height: 22,
                      background: "#ede9fe",
                      flexShrink: 0,
                    }}
                  />

                  <div style={{ display: "flex", gap: 6 }}>
                    {breakdown.map((item) => {
                      const accent = getJenisAccent(item.jenis);
                      return (
                        <div
                          key={item.jenis}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            background: accent.bg,
                            border: `1px solid ${accent.border}`,
                            borderRadius: 6,
                            padding: "3px 9px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: accent.dot,
                              flexShrink: 0,
                            }}
                          />
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              color: accent.text,
                              textTransform: "uppercase",
                            }}
                          >
                            {item.jenis}
                          </span>
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 800,
                              color: "#0f172a",
                            }}
                          >
                            {Number(item.total_qty || 0).toLocaleString(
                              "id-ID",
                            )}
                          </span>
                          <span
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
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* ================= PREVIEW ITEM REQUEST + STOK (MODAL) ================= */}
      {/* Disembunyikan dari halaman utama; cuma muncul sebagai modal setelah
          tombol "Rencana Transfer" (di section Trip Manual di bawah) diklik. */}
      {showPreviewTable && (
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
            if (e.target === e.currentTarget) setShowPreviewTable(false);
          }}
        >
          <div
            className="ko-card"
            style={{
              width: "100%",
              maxWidth: 1400,
              maxHeight: "90vh",
              overflowY: "auto",
              padding: 20,
              boxShadow: "0 25px 70px rgba(0,0,0,0.25)",
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
                <h2
                  style={{
                    fontSize: 15,
                    fontWeight: 800,
                    color: "#0f172a",
                    margin: 0,
                  }}
                >
                  Preview Item Request &amp; Stok
                </h2>
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: 11.5,
                    color: "#64748b",
                  }}
                >
                  Klik <strong>Generate Trip Otomatis</strong> buat bikinin trip
                  sendiri (max 4 item &amp; kapasitas truk per trip) berdasarkan
                  stok Tangerang yang tersedia. Kalau stok gak cukup, qty diisi
                  sebagian dulu.
                </p>
              </div>

              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
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
                  }}
                >
                  {loadingPreview ? (
                    <Loader2 size={14} className="ko-spin" />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                  Refresh
                </button>

                <button
                  type="button"
                  onClick={handleAutoGenerateTrip}
                  disabled={loadingRencanaTransfer || previewItems.length === 0}
                  title="Generate trip otomatis berdasarkan stok Tangerang"
                  style={{
                    height: 34,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "0 14px",
                    border: "1px solid #bbf7d0",
                    background: "#f0fdf4",
                    color: "#15803d",
                    borderRadius: 8,
                    cursor:
                      loadingRencanaTransfer || previewItems.length === 0
                        ? "not-allowed"
                        : "pointer",
                    fontSize: 12,
                    fontWeight: 700,
                    opacity:
                      loadingRencanaTransfer || previewItems.length === 0
                        ? 0.6
                        : 1,
                  }}
                >
                  {loadingRencanaTransfer ? (
                    <Loader2 size={14} className="ko-spin" />
                  ) : (
                    <Wand2 size={14} />
                  )}
                  {loadingRencanaTransfer
                    ? "Generate..."
                    : "Generate Trip Otomatis"}
                </button>

                <button
                  type="button"
                  onClick={() => setShowPreviewTable(false)}
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
                  }}
                >
                  <X size={16} />
                </button>
              </div>
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
                Belum ada Item Request TIRE hari ini. Upload Item Request dulu
                di atas.
              </div>
            )}

            {previewItems.length > 0 && (
              <div className="ko-preview-scroll" style={{ overflowX: "auto" }}>
                <table
                  className="ko-data-table"
                  style={{ margin: 0, minWidth: 1150 }}
                >
                  <thead>
                    <tr>
                      <th style={{ whiteSpace: "nowrap" }}>Item</th>
                      <th style={{ whiteSpace: "nowrap" }}>Deskripsi</th>
                      <th style={{ whiteSpace: "nowrap" }}>Qty Request</th>
                      <th style={{ whiteSpace: "nowrap" }}>Sudah Masuk Trip</th>
                      <th style={{ whiteSpace: "nowrap" }}>Sisa</th>
                      <th style={{ whiteSpace: "nowrap" }}>Gedung</th>
                      <th style={{ whiteSpace: "nowrap" }}>Stok Tangerang</th>
                      <th style={{ whiteSpace: "nowrap" }}>Stok Karawang</th>
                    </tr>
                  </thead>

                  <tbody>
                    {previewItems.map((item) => {
                      const allocated = Number(allocatedQtyMap[item.item] || 0);
                      const sisa = Number(item.qty || 0) - allocated;

                      return (
                        <tr key={item.item}>
                          <td
                            className="ko-mono"
                            style={{ whiteSpace: "nowrap" }}
                          >
                            {item.item}
                          </td>

                          <td style={{ whiteSpace: "nowrap" }}>
                            {item.deskripsi || "-"}
                          </td>

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
                            style={{
                              textAlign: "center",
                              fontWeight: 700,
                              color: item.gedung ? "#2563eb" : "#dc2626",
                            }}
                          >
                            {item.gedung || "?"}
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
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

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
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: "#0f172a",
                margin: 0,
              }}
            >
              Trip Manual
            </h2>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
                color: "#64748b",
                fontWeight: 600,
              }}
            >
              Kapasitas Truk
              <input
                type="number"
                min={0}
                step={0.1}
                value={truckCapacity}
                onChange={(e) => setTruckCapacity(Number(e.target.value) || 0)}
                style={{
                  width: 64,
                  height: 26,
                  border: "1px solid #cbd5e1",
                  borderRadius: 6,
                  padding: "0 6px",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              />
              m³
            </label>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={handleRencanaTransfer}
              title="Lihat Preview Item Request & Stok"
              style={{
                height: 34,
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "0 14px",
                border: "1px solid #bbf7d0",
                background: "#f0fdf4",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 700,
                color: "#15803d",
              }}
            >
              <Wand2 size={14} />
              Rencana Transfer
            </button>

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
              gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
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
              ["Truk Dibutuhkan", `${trucksNeeded} truk`],
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
            Belum ada trip. Klik <strong>Tambah Trip Baru</strong>, atau
            langsung pilih trip dari tabel preview di atas.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
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
                  borderRadius: 8,
                  overflow: "hidden",
                }}
              >
                {/* TRIP HEADER */}
                <div
                  style={{
                    padding: "4px 8px",
                    background: "#f8fafc",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 6,
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 5 }}
                  >
                    <input
                      type="text"
                      value={trip.no_trip}
                      onChange={(e) =>
                        updateManualTripNo(trip.id, e.target.value)
                      }
                      style={{
                        fontSize: 10.5,
                        fontWeight: 800,
                        color: "#0f172a",
                        border: "1px solid #cbd5e1",
                        borderRadius: 4,
                        padding: "2px 5px",
                        width: 108,
                      }}
                    />

                    <span style={{ fontSize: 9, color: "#94a3b8" }}>
                      {tripQty.toLocaleString("id-ID")} Qty
                    </span>

                    {trip.gedung && (
                      <select
                        value={trip.gedung}
                        onChange={(e) =>
                          updateManualTripGedung(trip.id, e.target.value)
                        }
                        title="Edit gedung asal truk (ikut nyamain semua item di trip ini)"
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: "#2563eb",
                          background: "#eff6ff",
                          border: "1px solid #bfdbfe",
                          borderRadius: 4,
                          padding: "1px 4px",
                          cursor: "pointer",
                        }}
                      >
                        <option value="BPW1">BPW1</option>
                        <option value="BPW2">BPW2</option>
                        {trip.gedung !== "BPW1" && trip.gedung !== "BPW2" && (
                          <option value={trip.gedung}>{trip.gedung}</option>
                        )}
                      </select>
                    )}

                    <button
                      type="button"
                      onClick={() => handleSetTripTruck(trip.id)}
                      title="Truk fisik yang bawa trip ini -- 1 truk bisa jalan beberapa trip"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 3,
                        fontSize: 9,
                        fontWeight: 700,
                        color: trip.truck ? "#7c3aed" : "#94a3b8",
                        background: trip.truck ? "#f5f3ff" : "#f8fafc",
                        border: `1px solid ${
                          trip.truck ? "#ddd6fe" : "#e2e8f0"
                        }`,
                        borderRadius: 4,
                        padding: "1px 6px",
                        cursor: "pointer",
                      }}
                    >
                      <Truck size={10} />
                      {trip.truck ? trip.truck : "Pilih Truk"}
                    </button>
                  </div>

                  {(() => {
                    const capStatus = getTripCapacityStatus(tripVolume);
                    const badgeColor = capStatus.over ? "#dc2626" : "#16a34a";

                    return (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <div style={{ textAlign: "right" }}>
                          <div
                            style={{
                              fontSize: 10.5,
                              fontWeight: 800,
                              color: badgeColor,
                              lineHeight: 1.15,
                            }}
                          >
                            {tripVolume.toLocaleString("id-ID", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{" "}
                            / {truckCapacity} m³
                          </div>

                          <div
                            style={{
                              fontSize: 8,
                              fontWeight: 700,
                              color: badgeColor,
                              marginTop: 0,
                              lineHeight: 1.15,
                            }}
                          >
                            {capStatus.over ? "TIDAK MUAT — " : "MUAT — "}
                            {capStatus.pct}% ({capStatus.label})
                          </div>

                          <div
                            style={{
                              marginTop: 2,
                              width: 72,
                              height: 3,
                              borderRadius: 2,
                              background: "#e2e8f0",
                              overflow: "hidden",
                              marginLeft: "auto",
                            }}
                          >
                            <div
                              style={{
                                width: `${Math.min(capStatus.pct, 100)}%`,
                                height: "100%",
                                background: badgeColor,
                              }}
                            />
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handlePrintRmb(trip)}
                          title="Cetak RMB"
                          style={{
                            height: 21,
                            display: "flex",
                            alignItems: "center",
                            gap: 3,
                            padding: "0 6px",
                            border: "1px solid #bfdbfe",
                            background: "#eff6ff",
                            color: "#1d4ed8",
                            borderRadius: 4,
                            cursor: "pointer",
                            fontSize: 9,
                            fontWeight: 700,
                          }}
                        >
                          <Printer size={10} />
                          Cetak RMB
                        </button>

                        <button
                          type="button"
                          onClick={() => removeManualTrip(trip.id)}
                          title="Hapus trip"
                          style={{
                            height: 21,
                            width: 21,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            border: "1px solid #fecaca",
                            background: "#fff",
                            color: "#dc2626",
                            borderRadius: 4,
                            cursor: "pointer",
                          }}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    );
                  })()}
                </div>

                {/* ITEMS */}
                <div style={{ padding: 6 }}>
                  {trip.items.length === 0 ? (
                    <div
                      style={{
                        padding: "6px 2px 8px",
                        color: "#94a3b8",
                        fontSize: 11,
                      }}
                    >
                      Belum ada item di trip ini. Tambahin item manual di bawah.
                    </div>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table
                        className="ko-data-table ko-trip-table"
                        style={{ margin: 0 }}
                      >
                        <thead>
                          <tr>
                            <th>Item</th>
                            <th>Deskripsi</th>
                            <th>Qty</th>
                            <th>Vol/Qty</th>
                            <th>Total Volume</th>
                            <th>Gedung</th>
                            <th></th>
                          </tr>
                        </thead>

                        <tbody>
                          {trip.items.map((item) => (
                            <tr key={`${trip.id}-${item.item}`}>
                              <td className="ko-mono">{item.item}</td>
                              <td>{item.deskripsi || "-"}</td>
                              <td>
                                <input
                                  type="number"
                                  min={0}
                                  value={item.qty ?? 0}
                                  onChange={(e) =>
                                    updateManualTripItemQty(
                                      trip.id,
                                      item.item,
                                      e.target.value,
                                    )
                                  }
                                  style={{
                                    width: 58,
                                    padding: "3px 5px",
                                    border: "1px solid #cbd5e1",
                                    borderRadius: 5,
                                    fontSize: 10.5,
                                    fontWeight: 700,
                                    textAlign: "center",
                                  }}
                                />
                              </td>
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
                              <td style={{ fontWeight: 700 }}>
                                {Number(item.total_volume || 0).toLocaleString(
                                  "id-ID",
                                  {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  },
                                )}{" "}
                                m³
                              </td>
                              <td>
                                <select
                                  value={item.gedung || ""}
                                  onChange={(e) =>
                                    updateManualTripItemGedung(
                                      trip.id,
                                      item.item,
                                      e.target.value,
                                    )
                                  }
                                  title="Edit gedung item ini"
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    color: item.gedung ? "#2563eb" : "#dc2626",
                                    border: "1px solid #cbd5e1",
                                    borderRadius: 4,
                                    padding: "2px 4px",
                                    cursor: "pointer",
                                  }}
                                >
                                  {!item.gedung && <option value="">?</option>}
                                  <option value="BPW1">BPW1</option>
                                  <option value="BPW2">BPW2</option>
                                  {item.gedung !== "BPW1" &&
                                    item.gedung !== "BPW2" &&
                                    item.gedung && (
                                      <option value={item.gedung}>
                                        {item.gedung}
                                      </option>
                                    )}
                                </select>
                              </td>
                              <td>
                                <button
                                  type="button"
                                  onClick={() =>
                                    removeItemFromManualTrip(trip.id, item.item)
                                  }
                                  title="Hapus item dari trip"
                                  style={{
                                    height: 19,
                                    width: 19,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    border: "1px solid #fecaca",
                                    background: "#fff",
                                    color: "#dc2626",
                                    borderRadius: 4,
                                    cursor: "pointer",
                                  }}
                                >
                                  <X size={10} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* TAMBAH ITEM MANUAL */}
                  {trip.items.length >= 4 ? (
                    <div
                      style={{
                        marginTop: 5,
                        fontSize: 9,
                        color: "#94a3b8",
                        fontStyle: "italic",
                      }}
                    >
                      Trip ini udah penuh (maksimal 4 item). Hapus salah satu
                      item dulu kalau mau nambah item lain.
                    </div>
                  ) : (
                    (() => {
                      const selectedItemCode =
                        addItemForm[trip.id]?.itemCode || "";
                      const selectedMeta = selectedItemCode
                        ? pickableItems.find(
                            (it) => it.item === selectedItemCode,
                          )
                        : null;
                      const isPickerOpen = itemPickerOpenTripId === trip.id;

                      const filteredItems = pickableItems.filter((it) => {
                        if (!itemPickerSearch.trim()) return true;
                        const q = itemPickerSearch.trim().toLowerCase();
                        return (
                          it.item.toLowerCase().includes(q) ||
                          (it.deskripsi || "").toLowerCase().includes(q)
                        );
                      });

                      const openPicker = () => {
                        setItemPickerSearch("");
                        setOutsideItems([]);
                        setItemPickerOpenTripId(trip.id);
                      };
                      const closePicker = () => {
                        setItemPickerOpenTripId(null);
                        setItemPickerSearch("");
                        setOutsideItems([]);
                      };
                      const pickItem = (itemCode) => {
                        updateAddItemForm(trip.id, "itemCode", itemCode);
                        closePicker();
                      };

                      return (
                        <div
                          style={{
                            marginTop: 5,
                            display: "flex",
                            gap: 5,
                            alignItems: "center",
                            flexWrap: "wrap",
                            paddingTop: 5,
                            borderTop:
                              trip.items.length > 0
                                ? "1px dashed #e2e8f0"
                                : "none",
                          }}
                        >
                          {/* ===== TOMBOL PEMBUKA MODAL (bukan <select> native) =====
                              Dipakai biar tiap baris item bisa ditampilin
                              dgn warna (Sisa merah kalau abis/minus, dll),
                              yang gak mungkin dilakuin pake <option> biasa. */}
                          <div
                            style={{
                              position: "relative",
                              flex: "1 1 220px",
                              minWidth: 160,
                            }}
                          >
                            <button
                              type="button"
                              onClick={openPicker}
                              style={{
                                width: "100%",
                                textAlign: "left",
                                padding: "3px 5px",
                                border: "1px solid #cbd5e1",
                                borderRadius: 4,
                                fontSize: 9.5,
                                fontWeight: 600,
                                color: selectedMeta ? "#334155" : "#94a3b8",
                                background: "#fff",
                                cursor: "pointer",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {selectedMeta
                                ? `${selectedMeta.item} — ${selectedMeta.deskripsi || "-"}`
                                : "+ Pilih item buat ditambahin..."}
                            </button>

                            {isPickerOpen &&
                              createPortal(
                                <div
                                  onMouseDown={closePicker}
                                  style={{
                                    position: "fixed",
                                    inset: 0,
                                    background: "rgba(15, 23, 42, 0.55)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    zIndex: 9999,
                                    padding: 16,
                                  }}
                                >
                                  {/* Kotak modal-nya, di tengah layar. */}
                                  <div
                                    onMouseDown={(e) => e.stopPropagation()}
                                    style={{
                                      width: "100%",
                                      maxWidth: 640,
                                      maxHeight: "85vh",
                                      display: "flex",
                                      flexDirection: "column",
                                      background: "#fff",
                                      border: "1px solid #cbd5e1",
                                      borderRadius: 10,
                                      boxShadow:
                                        "0 12px 32px rgba(15,23,42,0.28)",
                                      overflow: "hidden",
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        padding: "14px 16px",
                                        borderBottom: "1px solid #e2e8f0",
                                        flexShrink: 0,
                                      }}
                                    >
                                      <div
                                        style={{
                                          fontSize: 16,
                                          fontWeight: 700,
                                          color: "#0f172a",
                                        }}
                                      >
                                        Pilih Item Buat Ditambahin
                                      </div>
                                      <button
                                        type="button"
                                        onClick={closePicker}
                                        style={{
                                          border: "none",
                                          background: "transparent",
                                          cursor: "pointer",
                                          color: "#64748b",
                                          display: "flex",
                                          alignItems: "center",
                                          padding: 4,
                                        }}
                                      >
                                        <X size={20} />
                                      </button>
                                    </div>

                                    <input
                                      autoFocus
                                      type="text"
                                      value={itemPickerSearch}
                                      onChange={(e) =>
                                        setItemPickerSearch(e.target.value)
                                      }
                                      placeholder="Cari kode / deskripsi item... (ketik 2+ huruf buat cari item di luar request juga)"
                                      style={{
                                        width: "100%",
                                        boxSizing: "border-box",
                                        padding: "12px 16px",
                                        border: "none",
                                        borderBottom: "1px solid #e2e8f0",
                                        fontSize: 14,
                                        outline: "none",
                                        flexShrink: 0,
                                      }}
                                    />

                                    <div
                                      style={{
                                        overflowY: "auto",
                                        flex: 1,
                                      }}
                                    >
                                      {filteredItems.length === 0 &&
                                        !loadingOutsideItems && (
                                          <div
                                            style={{
                                              padding: "16px",
                                              fontSize: 13,
                                              color: "#94a3b8",
                                              fontStyle: "italic",
                                            }}
                                          >
                                            {itemPickerSearch.trim().length >= 2
                                              ? "Gak ada item yang cocok, baik dari request maupun master item."
                                              : "Gak ada item yang cocok. Ketik 2+ huruf buat sekalian cari item di luar request."}
                                          </div>
                                        )}

                                      {loadingOutsideItems && (
                                        <div
                                          style={{
                                            padding: "10px 16px",
                                            fontSize: 12,
                                            color: "#94a3b8",
                                            fontStyle: "italic",
                                          }}
                                        >
                                          Nyari item di luar request...
                                        </div>
                                      )}

                                      {filteredItems.map((it) => {
                                        const allocated = Number(
                                          allocatedQtyMap[it.item] || 0,
                                        );
                                        const sisa =
                                          Number(it.qty || 0) - allocated;
                                        const sisaColor =
                                          sisa <= 0 ? "#dc2626" : "#0f172a";

                                        return (
                                          <div
                                            key={it.item}
                                            onClick={() => pickItem(it.item)}
                                            style={{
                                              padding: "12px 16px",
                                              cursor: "pointer",
                                              borderBottom: "1px solid #f1f5f9",
                                              background:
                                                it.item === selectedItemCode
                                                  ? "#eff6ff"
                                                  : "#fff",
                                            }}
                                            onMouseEnter={(e) => {
                                              e.currentTarget.style.background =
                                                "#f8fafc";
                                            }}
                                            onMouseLeave={(e) => {
                                              e.currentTarget.style.background =
                                                it.item === selectedItemCode
                                                  ? "#eff6ff"
                                                  : "#fff";
                                            }}
                                          >
                                            <div
                                              style={{
                                                fontSize: 14,
                                                fontWeight: 700,
                                                color: "#334155",
                                                whiteSpace: "nowrap",
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 6,
                                              }}
                                            >
                                              {it.item} — {it.deskripsi || "-"}
                                              {it.fromRequest === false && (
                                                <span
                                                  style={{
                                                    flexShrink: 0,
                                                    fontSize: 10,
                                                    fontWeight: 700,
                                                    color: "#7c3aed",
                                                    background: "#ede9fe",
                                                    borderRadius: 4,
                                                    padding: "1px 6px",
                                                  }}
                                                >
                                                  Di luar request
                                                </span>
                                              )}
                                            </div>
                                            <div
                                              className="ko-mono"
                                              style={{
                                                marginTop: 4,
                                                display: "flex",
                                                flexWrap: "wrap",
                                                gap: 10,
                                                fontSize: 12,
                                              }}
                                            >
                                              {it.fromRequest === false ? (
                                                <span
                                                  style={{ color: "#64748b" }}
                                                >
                                                  Masuk Trip:{" "}
                                                  <b
                                                    style={{
                                                      color:
                                                        allocated > 0
                                                          ? "#2563eb"
                                                          : "#94a3b8",
                                                    }}
                                                  >
                                                    {allocated.toLocaleString(
                                                      "id-ID",
                                                    )}
                                                  </b>
                                                </span>
                                              ) : (
                                                <>
                                                  <span
                                                    style={{ color: "#64748b" }}
                                                  >
                                                    Req:{" "}
                                                    <b
                                                      style={{
                                                        color: "#334155",
                                                      }}
                                                    >
                                                      {Number(
                                                        it.qty || 0,
                                                      ).toLocaleString("id-ID")}
                                                    </b>
                                                  </span>
                                                  <span
                                                    style={{ color: "#64748b" }}
                                                  >
                                                    Masuk Trip:{" "}
                                                    <b
                                                      style={{
                                                        color:
                                                          allocated > 0
                                                            ? "#2563eb"
                                                            : "#94a3b8",
                                                      }}
                                                    >
                                                      {allocated.toLocaleString(
                                                        "id-ID",
                                                      )}
                                                    </b>
                                                  </span>
                                                  <span
                                                    style={{ color: "#64748b" }}
                                                  >
                                                    Sisa:{" "}
                                                    <b
                                                      style={{
                                                        color: sisaColor,
                                                      }}
                                                    >
                                                      {sisa.toLocaleString(
                                                        "id-ID",
                                                      )}
                                                    </b>
                                                  </span>
                                                </>
                                              )}
                                              <span
                                                style={{ color: "#64748b" }}
                                              >
                                                Gedung:{" "}
                                                <b
                                                  style={{
                                                    color: it.gedung
                                                      ? "#2563eb"
                                                      : "#dc2626",
                                                  }}
                                                >
                                                  {it.gedung || "?"}
                                                </b>
                                              </span>
                                              <span
                                                style={{ color: "#64748b" }}
                                              >
                                                Stok TGR:{" "}
                                                <b style={{ color: "#475569" }}>
                                                  {Number(
                                                    it.stok_tangerang || 0,
                                                  ).toLocaleString("id-ID")}
                                                </b>
                                              </span>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>,
                                document.body,
                              )}
                          </div>

                          <input
                            type="number"
                            min={0}
                            placeholder="Qty"
                            value={addItemForm[trip.id]?.qty ?? ""}
                            onChange={(e) =>
                              updateAddItemForm(trip.id, "qty", e.target.value)
                            }
                            style={{
                              width: 58,
                              padding: "3px 5px",
                              border: "1px solid #cbd5e1",
                              borderRadius: 4,
                              fontSize: 9.5,
                              fontWeight: 700,
                              textAlign: "center",
                            }}
                          />

                          <button
                            type="button"
                            onClick={() => addManualItemToTrip(trip.id)}
                            style={{
                              height: 22,
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              padding: "0 8px",
                              border: "1px solid #bfdbfe",
                              background: "#eff6ff",
                              color: "#1d4ed8",
                              borderRadius: 4,
                              cursor: "pointer",
                              fontSize: 9.5,
                              fontWeight: 700,
                              flexShrink: 0,
                            }}
                          >
                            <Plus size={10} />
                            Tambah Item
                          </button>
                        </div>
                      );
                    })()
                  )}
                </div>
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
                <span
                  style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}
                >
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

              {!loadingHistory &&
                historySearched &&
                historyData.length === 0 && (
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
                            <strong
                              style={{ fontSize: 13.5, color: "#0f172a" }}
                            >
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
                              {trip.truck && (
                                <>
                                  {" "}
                                  ·{" "}
                                  <span
                                    style={{
                                      color: "#7c3aed",
                                      fontWeight: 700,
                                    }}
                                  >
                                    🚚 {trip.truck}
                                  </span>
                                </>
                              )}
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
                                  {[
                                    "Item",
                                    "Deskripsi",
                                    "Qty",
                                    "Volume (m³)",
                                  ].map((h) => (
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
                                  ))}
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

      {showTireTubeModal && (
        <TireTubePairingModal
          onClose={() => setShowTireTubeModal(false)}
          onChanged={loadTireTubePairs}
        />
      )}

      {showTripPerTrukModal && (
        <TripPerTrukModal
          trips={manualTrips}
          onClose={() => setShowTripPerTrukModal(false)}
        />
      )}
    </div>
  );
}
