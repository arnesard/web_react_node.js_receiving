// src/controllers/stok-opname-karawang/TransferPlanController.js
// Upload Item Request (Excel) + Tire Trip Planner. Trip planner
// menggabungkan item request jenis TIRE hari ini dengan data Schedule OEM
// dari bpw_dept_db.sch_oem (lihat KarawangItemRequestModel.getTireTripItems).
const KarawangItemRequestModel = require("../../models/stok-opname-karawang/KarawangItemRequestModel");
const KarawangTripPlanModel = require("../../models/stok-opname-karawang/KarawangTripPlanModel");
const KarawangTripPlanDraftModel = require("../../models/stok-opname-karawang/KarawangTripPlanDraftModel");
const ControlStockModel = require("../../models/control-stock/ControlStockModel");
const KarawangFifoModel = require("../../models/stok-opname-karawang/KarawangFifoModel");
const { mapWithConcurrency } = require("../../utils/concurrency");

const ExcelJS = require("exceljs");
const response = require("../../utils/response");

// Kode item di master_item / Item Request pakai suffix "-<angka>" di
// belakang (mis. "IBD1002-0"), tapi kode item ASLI di database EDP
// (fgloc/rack, dipakai Control Stock) dan Cross Docking (dipakai Control
// FIFO) gak pakai suffix itu ("IBD1002" polos) — makanya query stok harus
// pakai kode yang udah di-strip, biar ketemu. Kode aslinya (dengan suffix)
// tetap dipakai buat ditampilkan & disimpan ke trip.
function stripItemSuffix(itemCode) {
  return String(itemCode || "")
    .trim()
    .replace(/-\d+$/, "");
}

// Ubah nilai tanggal dari cell Excel (bisa Date object atau string) jadi
// string polos "YYYY-MM-DD" apa adanya -- SENGAJA gak lewat new Date()+
// getDate()/getMonth() atau logic timezone apapun, karena itu yang bikin
// beberapa baris kegeser 1 hari pas di-INSERT (koneksi DB di-config
// timezone +07:00, yang nambahin jam ke Date object dari ExcelJS dan
// bisa numbrung ke hari berikutnya kalau ada sisa waktu tersembunyi).
// ExcelJS selalu encode cell Date pakai UTC, jadi kita baca pakai
// getUTCFullYear/getUTCMonth/getUTCDate -- BUKAN getFullYear/getMonth
// versi lokal.
function excelDateToYmd(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const yyyy = value.getUTCFullYear();
    const mm = String(value.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(value.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  const str = String(value || "").trim();
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = str.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return null;
}

class TransferPlanController {
  async uploadItemRequest(req, res) {
    try {
      if (!req.file) {
        return response.error(res, "File Excel wajib dipilih.", 422);
      }

      const workbook = new ExcelJS.Workbook();

      await workbook.xlsx.load(req.file.buffer);

      const worksheet = workbook.worksheets[0];

      if (!worksheet) {
        return response.error(res, "Sheet Excel tidak ditemukan.", 422);
      }

      const rows = [];

      // Baris 1 = header
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;

        const dateRaw = row.getCell(1).value;
        const date = excelDateToYmd(dateRaw);
        const jenis = String(row.getCell(2).value || "").trim();
        const item = String(row.getCell(3).value || "").trim();
        const qty = row.getCell(4).value;
        const ket = String(row.getCell(5).value || "").trim();

        // Skip baris kosong
        if (!item && !qty && !ket) {
          return;
        }

        if (!date) {
          throw new Error(
            `Tanggal pada baris ${rowNumber} tidak valid atau kosong.`,
          );
        }

        if (!item) {
          throw new Error(`Item pada baris ${rowNumber} belum diisi.`);
        }

        const qtyNum = Number(qty);

        if (!Number.isInteger(qtyNum) || qtyNum <= 0) {
          throw new Error(
            `Qty pada baris ${rowNumber} harus berupa angka lebih dari 0.`,
          );
        }

        rows.push({
          date,
          jenis,
          item,
          qty: String(qtyNum),
          ket,
        });
      });

      if (rows.length === 0) {
        return response.error(
          res,
          "Tidak ada data yang bisa dimasukkan dari file Excel.",
          422,
        );
      }

      const result = await KarawangItemRequestModel.bulkCreate(rows);

      return response.success(res, {
        total: result.inserted,
        message: `${result.inserted} data berhasil dimasukkan.`,
      });
    } catch (err) {
      console.error("TransferPlanController.uploadItemRequest gagal:", err);

      return response.error(
        res,
        err.message || "Gagal memproses file Excel.",
        422,
      );
    }
  }

  async itemRequestSummary(req, res) {
    try {
      const summary = await KarawangItemRequestModel.getSummary();

      return response.success(res, summary);
    } catch (err) {
      console.error("TransferPlanController.itemRequestSummary gagal:", err);

      return response.error(res, "Gagal mengambil summary item request.");
    }
  }

  // Preview manual: item request SEMUA jenis hari ini (TIRE, OE TUBE, OE
  // VALVE, dst — qty request), di-enrich stok Tangerang (Control Stock,
  // db pandu/EDP) & stok Karawang (Control FIFO, Cross Docking) per item —
  // dipakai user buat MANUAL milih No Trip + item mana yang mau dimasukkan
  // ke tiap trip (bukan auto bin-packing lagi). Concurrency dibatasi (3)
  // biar gak nembak EDP & Cross Docking sekaligus buat semua item.
  async previewItemRequest(req, res) {
    try {
      const items =
        await KarawangItemRequestModel.getTireTripItemsFromRequestOnly();

      if (items.length === 0) {
        return response.success(res, []);
      }

      const enriched = await mapWithConcurrency(items, 3, async (item) => {
        const lookupCode = stripItemSuffix(item.item);

        let stokTangerang = 0;
        let stokKarawang = 0;
        let lokasiTangerang = [];

        try {
          // Stok Tangerang cuma dihitung kategori OE (bukan OK+OE gabungan)
          const dataTangerang = await ControlStockModel.findLocationsByItem(
            lookupCode,
            "OE",
          );
          stokTangerang = dataTangerang?.summary?.total_qty || 0;
          lokasiTangerang = dataTangerang?.lokasi || [];
        } catch (err) {
          console.error(
            `previewItemRequest: gagal ambil stok Tangerang untuk ${item.item} (lookup ${lookupCode}):`,
            err.message,
          );
        }

        try {
          const dataKarawang = await KarawangFifoModel.locationsByItem(
            lookupCode,
            "all",
          );
          stokKarawang = dataKarawang?.summary?.total_qty || 0;
        } catch (err) {
          console.error(
            `previewItemRequest: gagal ambil stok Karawang untuk ${item.item} (lookup ${lookupCode}):`,
            err.message,
          );
        }

        // OE TUBE dipatok "BPW1" (sesuai lokasi rak fisiknya di lapangan).
        // Item lain: gedung diturunin dari `lokasi` yang UDAH ke-fetch di
        // atas buat stok Tangerang (findLocationsByItem) — TIDAK query
        // EDP lagi terpisah, biar gak nembak rack/fgloc dua kali buat data
        // yang sama (itu yang bikin preview lemot sebelumnya).
        const isTube = /^OE\s*TUBE/i.test(item.jenis || "");
        const gedung = isTube
          ? "BPW1"
          : ControlStockModel.deriveGedungFromLokasi(lokasiTangerang);

        return {
          ...item,
          stok_tangerang: stokTangerang,
          stok_karawang: stokKarawang,
          gedung,
        };
      });

      return response.success(res, enriched);
    } catch (err) {
      console.error("TransferPlanController.previewItemRequest gagal:", err);

      return response.error(
        res,
        "Gagal mengambil preview item request beserta stok.",
      );
    }
  }

  // GET /item-req/search-outside?keyword=...
  // Search item DI LUAR Item Request (dari master item) buat modal
  // "Pilih Item Buat Ditambahin" di Transfer Plan Karawang -- dipakai
  // pas user mau nambah item yang gak keupload di Excel Item Request.
  // Enrich stok Tangerang/Karawang + gedung sama kayak previewItemRequest
  // biar tampilan & kalkulasi kapasitas truk konsisten sama item dari
  // request. NOTE: gedung OE TUBE gak bisa dipatok "BPW1" di sini (jenis
  // item gak ada di master_item), jadi selalu ikut hasil deriveGedung dari
  // lokasi Tangerang -- kalau item TUBE dicari lewat sini & lokasinya gak
  // ketemu, gedung bisa kebaca "?" dan perlu dicek manual.
  async searchOutsideItem(req, res) {
    try {
      const keyword = (req.query.keyword || req.query.q || "").trim();
      if (!keyword) return response.success(res, []);

      const items = await KarawangItemRequestModel.searchMasterItemByKeyword(
        keyword,
        20,
      );
      if (items.length === 0) return response.success(res, []);

      const enriched = await mapWithConcurrency(items, 3, async (item) => {
        const lookupCode = stripItemSuffix(item.item);

        let stokTangerang = 0;
        let stokKarawang = 0;
        let lokasiTangerang = [];

        try {
          const dataTangerang = await ControlStockModel.findLocationsByItem(
            lookupCode,
            "OE",
          );
          stokTangerang = dataTangerang?.summary?.total_qty || 0;
          lokasiTangerang = dataTangerang?.lokasi || [];
        } catch (err) {
          console.error(
            `searchOutsideItem: gagal ambil stok Tangerang untuk ${item.item} (lookup ${lookupCode}):`,
            err.message,
          );
        }

        try {
          const dataKarawang = await KarawangFifoModel.locationsByItem(
            lookupCode,
            "all",
          );
          stokKarawang = dataKarawang?.summary?.total_qty || 0;
        } catch (err) {
          console.error(
            `searchOutsideItem: gagal ambil stok Karawang untuk ${item.item} (lookup ${lookupCode}):`,
            err.message,
          );
        }

        const gedung = ControlStockModel.deriveGedungFromLokasi(lokasiTangerang);

        return {
          ...item,
          qty: 0,
          stok_tangerang: stokTangerang,
          stok_karawang: stokKarawang,
          gedung,
          tanggal_request: null,
          fromRequest: false,
        };
      });

      return response.success(res, enriched);
    } catch (err) {
      console.error("TransferPlanController.searchOutsideItem gagal:", err);
      return response.error(res, "Gagal mencari item di luar request.");
    }
  }

  async tireTripPlan(req, res) {
    try {
      const kapasitas = Number(req.query.kapasitas || 52);

      if (!kapasitas || kapasitas <= 0) {
        return response.error(res, "Kapasitas trip harus lebih besar dari 0.");
      }

      const items =
        await KarawangItemRequestModel.getTireTripItemsFromRequestOnly();

      const trips = KarawangItemRequestModel.buildTireTrips(items, kapasitas);

      // No Trip HARUS ngikutin tanggal Item Request yang di-upload (kolom
      // `date`), bukan tanggal hari ini server -- ambil dari item pertama
      // yang punya tanggal_request (semua item dari batch upload yang sama
      // seharusnya punya tanggal yang sama).
      const uploadTanggal =
        items.find((it) => it.tanggal_request)?.tanggal_request || null;

      // No Trip / do_number di-generate on-the-fly, urutan 1..N ngikutin
      // urutan trip hasil bin-packing (bukan disimpan ke DB).
      trips.forEach((trip, idx) => {
        trip.trip = idx + 1;
        trip.do_number = KarawangItemRequestModel.generateDoNumber(
          idx + 1,
          uploadTanggal,
        );
      });

      const totalRequest = items.reduce(
        (sum, item) => sum + Number(item.qty || 0),
        0,
      );

      const totalVolume = items.reduce(
        (sum, item) => sum + Number(item.total_volume || 0),
        0,
      );

      return response.success(res, {
        kapasitas,
        total_item: items.length,
        total_request: totalRequest,
        total_qty: totalRequest,
        total_volume: Number(totalVolume.toFixed(3)),
        jumlah_trip: trips.length,
        trips,
      });
    } catch (err) {
      console.error("TransferPlanController.tireTripPlan gagal:", err);

      return response.error(res, "Gagal membuat Tire Trip Plan.");
    }
  }

  // Simpan hasil Trip Plan (yang lagi ditampilkan di halaman) ke histori —
  // 1 baris per trip (No Trip), beserta item + qty request + total volume.
  // Dipanggil tombol "Simpan Trip Plan" di frontend, BUKAN otomatis tiap
  // kali kapasitas di-utak-atik, biar histori gak numpuk data percobaan.
  async saveTripPlan(req, res) {
    try {
      const { trips, kapasitas } = req.body || {};

      if (!Array.isArray(trips) || trips.length === 0) {
        return response.error(
          res,
          "Tidak ada data Trip Plan untuk disimpan.",
          422,
        );
      }

      const payload = trips.map((trip, idx) => ({
        no_trip:
          trip.do_number ||
          KarawangItemRequestModel.generateDoNumber(trip.trip || idx + 1),
        kapasitas: kapasitas || trip.kapasitas,
        truck: trip.truck || null,
        items: Array.isArray(trip.items)
          ? trip.items.map((item) => ({
              item: item.item,
              deskripsi: item.deskripsi,
              qty: item.qty,
              volume: item.volume,
              total_volume: item.total_volume,
            }))
          : [],
      }));

      const totalRows = await KarawangTripPlanModel.bulkCreate(payload);

      // Trip udah final masuk histori -- draft kerja hari ini gak
      // relevan lagi, kosongin biar refresh berikutnya mulai dari nol.
      try {
        await KarawangTripPlanDraftModel.clearToday();
      } catch (err) {
        console.error(
          "TransferPlanController.saveTripPlan: gagal ngosongin draft:",
          err,
        );
      }

      return response.success(res, {
        total: totalRows,
        message: `Trip Plan berhasil disimpan (${trips.length} trip, ${totalRows} baris item).`,
      });
    } catch (err) {
      console.error("TransferPlanController.saveTripPlan gagal:", err);

      return response.error(res, err.message || "Gagal menyimpan Trip Plan.");
    }
  }

  // Ambil draft Trip Plan hari ini (kerjaan yang lagi disusun, BELUM
  // "Simpan Trip Plan") -- dipanggil pas halaman Transfer Plan dibuka /
  // di-refresh, dari PC manapun, biar manualTrips gak balik kosong.
  async getTripPlanDraft(req, res) {
    try {
      const draft = await KarawangTripPlanDraftModel.getToday();

      return response.success(res, draft || null);
    } catch (err) {
      console.error("TransferPlanController.getTripPlanDraft gagal:", err);

      return response.error(res, "Gagal mengambil draft Trip Plan.");
    }
  }

  // Simpan (upsert) draft Trip Plan hari ini -- dipanggil otomatis
  // (debounced) dari frontend tiap kali manualTrips/kapasitas berubah.
  // BUKAN "Simpan Trip Plan" final -- itu tetep lewat saveTripPlan di
  // atas, yang abis sukses juga bakal ngosongin draft ini.
  async saveTripPlanDraft(req, res) {
    try {
      const { trips, truckCapacity, catatanByTrip } = req.body || {};

      await KarawangTripPlanDraftModel.saveToday({
        trips: Array.isArray(trips) ? trips : [],
        truckCapacity: truckCapacity ?? null,
        catatanByTrip: catatanByTrip || {},
      });

      return response.success(res, { saved: true });
    } catch (err) {
      console.error("TransferPlanController.saveTripPlanDraft gagal:", err);

      return response.error(res, "Gagal menyimpan draft Trip Plan.");
    }
  }

  // Kosongin draft Trip Plan hari ini secara manual (mis. user mau mulai
  // ulang dari nol tanpa nunggu "Simpan Trip Plan").
  async clearTripPlanDraft(req, res) {
    try {
      await KarawangTripPlanDraftModel.clearToday();

      return response.success(res, { cleared: true });
    } catch (err) {
      console.error("TransferPlanController.clearTripPlanDraft gagal:", err);

      return response.error(res, "Gagal menghapus draft Trip Plan.");
    }
  }

  // Histori Trip Plan — filter tanggal (dateFrom/dateTo) buat tombol
  // "Filter Riwayat" di halaman Transfer Plan.
  async tripPlanHistory(req, res) {
    try {
      const { dateFrom, dateTo, noTrip } = req.query;

      const rows = await KarawangTripPlanModel.list({
        dateFrom,
        dateTo,
        noTrip,
      });

      return response.success(res, rows);
    } catch (err) {
      console.error("TransferPlanController.tripPlanHistory gagal:", err);

      return response.error(res, "Gagal mengambil histori Trip Plan.");
    }
  }
}

module.exports = new TransferPlanController();
