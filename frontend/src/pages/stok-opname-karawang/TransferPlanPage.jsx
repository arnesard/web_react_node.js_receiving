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
  Printer,
  Wand2,
  Link2,
} from "lucide-react";
import api from "../../api/axiosInstance";
import KarawangSubNav from "./KarawangSubNav";
import TireTubePairingModal from "./TireTubePairingModal";
import { karawangStyles } from "./karawangStyles";
import * as XLSX from "xlsx-js-style";

export default function TransferPlanPage() {
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  const [savingTripPlan, setSavingTripPlan] = useState(false);
  // Modal "Kelola Master Tire-Tube" — CRUD + import Excel master pasangan
  // Tire<->Tube, dibuka dari tombol di header Transfer Plan (menu/halaman
  // terpisah "Master Tire-Tube" sudah dihapus).
  const [showTireTubeModal, setShowTireTubeModal] = useState(false);
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
  const [loadingPreview, setLoadingPreview] = useState(false);

  // ============ MANUAL TRIP BUILDER ============
  // manualTrips: [{ id, no_trip, items: [{item, deskripsi, qty, volume, total_volume}] }]
  const [manualTrips, setManualTrips] = useState([]);
  // Loading state khusus tombol "Rencana Transfer" (auto-generate trip).
  const [loadingRencanaTransfer, setLoadingRencanaTransfer] = useState(false);
  // Kapasitas 1 truk (m³) — dipakai buat ngecek trip udah "muat" apa belum.
  // Default 52 m³, samain sama default kapasitas di buildTireTrips backend.
  const [truckCapacity, setTruckCapacity] = useState(52);
  // Form "Tambah Item" per kartu trip — { [tripId]: { itemCode, qty } }.
  const [addItemForm, setAddItemForm] = useState({});

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
    loadTireTubePairs();
  }, []);

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
  //   Kapasitas Truk (m³).
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

          return { ...item, sisa, allocQty, volume, lineVolume };
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

      const trips = [];
      let seq = manualTrips.length;
      let partialCount = 0;
      const partialItemSeen = new Set();

      chunks.forEach((item) => {
        const berat = Number(item.berat || 0);
        const qty = item.allocQty;
        const itemVolume = item.lineVolume;

        if (item.qty < item.sisa && !partialItemSeen.has(item.item)) {
          partialItemSeen.add(item.item);
          partialCount += 1;
        }

        // Cari trip existing yang masih muat dengan sisa ruang PALING
        // KECIL (best fit) supaya truk yang udah lumayan penuh ditambalin
        // dulu, bukan malah buka trip baru. Batas "4 item per trip" tetep
        // berlaku buat BARIS ITEM BEDA — tapi kalau item ini emang udah
        // ada di trip itu (chunk lanjutan dari item yang sama), tetep
        // boleh gabung walau trip udah ada 4 baris beda (gak nambah
        // baris baru, cuma nambah qty di baris yang sama).
        let bestTrip = null;
        let bestLeftover = Infinity;

        trips.forEach((t) => {
          const sudahAdaItemIni = t.items.some((i) => i.item === item.item);
          if (t.items.length >= 4 && !sudahAdaItemIni) return;

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
            items: [],
            _volume: 0,
          };
          trips.push(bestTrip);
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
          });
        }
        bestTrip._volume = Number((bestTrip._volume + itemVolume).toFixed(3));
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

      const newTrips = trips.map(({ _volume, ...t }) => t);

      setManualTrips((prev) => [...prev, ...newTrips]);
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

    // Tube pasangan (kalau ada) bakal ikut nambah baris juga — hitung dulu
    // biar cek "trip penuh" (maks 4 item/trip) akurat buat KEDUANYA.
    const pairedTubeLine = buildPairedTubeLine(itemCode, qty);
    const tubeAlreadyInTrip =
      pairedTubeLine &&
      trip?.items.some((i) => i.item === pairedTubeLine.item);
    const newLinesCount =
      (alreadyInTrip ? 0 : 1) +
      (pairedTubeLine && !tubeAlreadyInTrip ? 1 : 0);

    if (trip && trip.items.length + newLinesCount > 4) {
      Swal.fire(
        "Trip Udah Penuh",
        "Maksimal 4 item per trip. Hapus salah satu item dulu atau pilih trip lain.",
        "warning",
      );
      return;
    }

    const meta = previewItems.find((i) => i.item === itemCode) || {};
    const deskripsi = meta.deskripsi || "";
    const volume = Number(meta.volume || 0);
    const berat = Number(meta.berat || 0);

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
              total_berat: Number(
                (finalQty * pairedTubeLine.berat).toFixed(2),
              ),
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
                (i) => i.item !== itemCode && i.pairedTire !== normalizedTireCode,
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

  // ===== CETAK RMB (Rencana Muat Barang) =====
  // Langsung cetak (window.print) tanpa modal isian — data header yang
  // gak ada di sistem (No SO, PA/EMKL, No Polisi, No Cont, LPN) dibiarin
  // kosong di form-nya, biar bisa diisi manual/dicap di kertas kalau perlu.
  const buildRmbPrintHtml = (trip) => {
    const items = trip.items || [];
    const today = new Date().toLocaleDateString("id-ID");

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

        return `
      <tr>
        <td class="c">${idx + 1}</td>
        <td>${item.item || ""}</td>
        <td>${item.deskripsi || ""}</td>
        <td class="r">${qty.toLocaleString("id-ID")}</td>
        <td class="c"></td>
        <td class="c">BPW1</td>
        <td class="c"></td>
        <td class="c"></td>
        <td class="c">PCS</td>
        <td class="r">${volume.toLocaleString("id-ID", {
          minimumFractionDigits: 3,
          maximumFractionDigits: 3,
        })}</td>
        <td></td>
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
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; font-size: 11px; margin: 0; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; }
  .company { font-weight: 700; font-size: 13px; }
  .addr { font-size: 11px; }
  .meta { text-align: right; font-size: 11px; }
  h1 { text-align: center; font-size: 20px; margin: 8px 0 18px; letter-spacing: 1px; }
  .info { display: flex; justify-content: space-between; gap: 40px; margin-bottom: 16px; }
  .info table { border-collapse: collapse; }
  .info td { padding: 2px 6px; font-size: 11px; vertical-align: top; }
  .info td.label { font-weight: 700; white-space: nowrap; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 6px; }
  table.items th, table.items td { border: 1px solid #64748b; padding: 4px 6px; font-size: 10.5px; }
  table.items th { background: #374151; color: #fff; text-align: center; }
  table.items td.c { text-align: center; }
  table.items td.r { text-align: right; }
  .totals { display: flex; justify-content: flex-end; gap: 30px; margin-top: 10px; font-weight: 700; font-size: 11px; }
  .sign { display: flex; justify-content: space-between; margin-top: 60px; text-align: center; font-size: 11px; }
  .sign > div { width: 30%; }
  .sign .line { margin-top: 60px; border-top: 1px solid #000; padding-top: 4px; }
  @media print {
    .no-print { display: none; }
  }
</style>
</head>
<body>
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

  <h1>RENCANA MUAT BARANG</h1>

  <div class="info">
    <table>
      <tr><td class="label">NO SO</td><td>:</td><td></td></tr>
      <tr><td class="label">CUSTOMER</td><td>:</td><td>GT DC Karawang</td></tr>
      <tr><td class="label">KOTA</td><td>:</td><td>Jawa Barat</td></tr>
      <tr><td class="label">NO KIRIM</td><td>:</td><td>${trip.no_trip || ""}</td></tr>
      <tr><td class="label">TGL KIRIM</td><td>:</td><td>${today}</td></tr>
      <tr><td class="label">NAMA TRIP</td><td>:</td><td>${trip.no_trip || ""}</td></tr>
    </table>
    <table>
      <tr><td class="label">PA/EMKL</td><td>:</td><td></td></tr>
      <tr><td class="label">JEN. KEND</td><td>:</td><td></td></tr>
      <tr><td class="label">NO POLISI</td><td>:</td><td></td></tr>
      <tr><td class="label">NO CONT</td><td>:</td><td></td></tr>
      <tr><td class="label">LPN</td><td>:</td><td></td></tr>
    </table>
  </div>

  <table class="items">
    <thead>
      <tr>
        <th>NO.</th>
        <th>KODE ITEM</th>
        <th>DESKRIPSI</th>
        <th>KIRIM</th>
        <th>EXTRA</th>
        <th>S.INV</th>
        <th>STOK</th>
        <th>AKTUAL</th>
        <th>UOM</th>
        <th>M3</th>
        <th>SHIPP.INS.</th>
        <th>PACK.INS.</th>
        <th>NO SO.</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <div class="totals">
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

  <div class="sign">
    <div>
      <div>MENGETAHUI,</div>
      <div class="line">( SH PERENCANAAN )</div>
    </div>
    <div>
      <div>MENYERAHKAN,</div>
      <div class="line">(&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)</div>
    </div>
    <div>
      <div>MENERIMA,</div>
      <div class="line">(&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)</div>
    </div>
  </div>
</body>
</html>`;
  };

  // Langsung buka window print, gak ada modal isian sama sekali.
  const handlePrintRmb = (trip) => {
    if (!trip.items.length) {
      Swal.fire(
        "Belum Ada Item",
        "Trip ini belum ada item, gak bisa dicetak RMB-nya.",
        "warning",
      );
      return;
    }

    const html = buildRmbPrintHtml(trip);
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
              onClick={() => setShowTireTubeModal(true)}
              title="Kelola Master Pasangan Tire-Tube"
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
              <Link2 size={15} />
              Kelola Master Tire-Tube
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
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
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

                  {(() => {
                    const capStatus = getTripCapacityStatus(tripVolume);
                    const badgeColor = capStatus.over ? "#dc2626" : "#16a34a";

                    return (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 14,
                        }}
                      >
                        <div style={{ textAlign: "right" }}>
                          <div
                            style={{
                              fontSize: 15,
                              fontWeight: 800,
                              color: badgeColor,
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
                              fontSize: 10,
                              fontWeight: 700,
                              color: badgeColor,
                              marginTop: 1,
                            }}
                          >
                            {capStatus.over
                              ? "TIDAK MUAT 1 TRUK — "
                              : "MUAT — "}
                            {capStatus.pct}% ({capStatus.label})
                          </div>

                          <div
                            style={{
                              marginTop: 4,
                              width: 130,
                              height: 5,
                              borderRadius: 3,
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
                            height: 30,
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "0 10px",
                            border: "1px solid #bfdbfe",
                            background: "#eff6ff",
                            color: "#1d4ed8",
                            borderRadius: 6,
                            cursor: "pointer",
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          <Printer size={13} />
                          Cetak RMB
                        </button>

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
                    );
                  })()}
                </div>

                {/* ITEMS */}
                <div style={{ padding: 12 }}>
                  {trip.items.length === 0 ? (
                    <div
                      style={{
                        padding: "10px 2px 14px",
                        color: "#94a3b8",
                        fontSize: 12,
                      }}
                    >
                      Belum ada item di trip ini. Tambahin item manual di bawah.
                    </div>
                  ) : (
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
                                    width: 74,
                                    padding: "5px 7px",
                                    border: "1px solid #cbd5e1",
                                    borderRadius: 6,
                                    fontSize: 12,
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
                  )}

                  {/* TAMBAH ITEM MANUAL */}
                  {trip.items.length >= 4 ? (
                    <div
                      style={{
                        marginTop: 10,
                        fontSize: 11,
                        color: "#94a3b8",
                        fontStyle: "italic",
                      }}
                    >
                      Trip ini udah penuh (maksimal 4 item). Hapus salah satu
                      item dulu kalau mau nambah item lain.
                    </div>
                  ) : (
                    <div
                      style={{
                        marginTop: 10,
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        flexWrap: "wrap",
                        paddingTop: 10,
                        borderTop:
                          trip.items.length > 0 ? "1px dashed #e2e8f0" : "none",
                      }}
                    >
                      <select
                        value={addItemForm[trip.id]?.itemCode || ""}
                        onChange={(e) =>
                          updateAddItemForm(trip.id, "itemCode", e.target.value)
                        }
                        style={{
                          flex: "1 1 260px",
                          minWidth: 200,
                          padding: "7px 8px",
                          border: "1px solid #cbd5e1",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#334155",
                        }}
                      >
                        <option value="">
                          + Pilih item buat ditambahin...
                        </option>
                        {previewItems.map((it) => (
                          <option key={it.item} value={it.item}>
                            {it.item} — {it.deskripsi || "-"}
                          </option>
                        ))}
                      </select>

                      <input
                        type="number"
                        min={0}
                        placeholder="Qty"
                        value={addItemForm[trip.id]?.qty ?? ""}
                        onChange={(e) =>
                          updateAddItemForm(trip.id, "qty", e.target.value)
                        }
                        style={{
                          width: 90,
                          padding: "7px 8px",
                          border: "1px solid #cbd5e1",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 700,
                          textAlign: "center",
                        }}
                      />

                      <button
                        type="button"
                        onClick={() => addManualItemToTrip(trip.id)}
                        style={{
                          height: 32,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "0 12px",
                          border: "1px solid #bfdbfe",
                          background: "#eff6ff",
                          color: "#1d4ed8",
                          borderRadius: 6,
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        <Plus size={14} />
                        Tambah Item
                      </button>
                    </div>
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
    </div>
  );
}
