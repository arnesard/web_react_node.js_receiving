// src/models/stok-opname-karawang/KarawangFifoModel.js
// Fitur "Control FIFO" (khusus DC Karawang / Cross Docking) — kebalikan
// dari alur biasa: input-nya ITEM (dicari dari deskripsi ATAU kode),
// hasilnya SEMUA LOT (lokasi) tempat item itu berada di Cross Docking,
// lengkap qty & jumlah rak per lot (plus detail per-rakcode), diurutkan
// dari week paling tua.
//
// Sumber data: API "Monitoring Stock Cross Docking" (lihat
// services/crossDockingClient.js) — endpoint /stock-cd/detail-all, yang
// balikin 1 baris = 1 unit/pcs, lengkap field rackcode, item, curweek
// (format YYWW), loccode (lot/lokasi), probcode (kategori OK/OE).
//
// BEDA dengan ControlStockModel (modul "Control Stock" gudang utama):
// itu narik langsung dari db pandu (fgloc + rack, join manual). Di sini
// datanya udah "flat" per unit dari API Cross Docking, jadi tinggal
// dikelompokkan per loccode — gak perlu join fgloc lagi.
//
// PENTING soal filter item: API Cross Docking (/stock-cd/detail-all)
// match parameter `item` pakai PREFIX, BUKAN exact — search "IBD1001"
// ikut kebalikin baris item lain yang prefix-nya sama, mis. "IBD1001SP"
// (web Cross Docking aslinya juga begitu, bukan bug di sini). Makanya
// WAJIB difilter ULANG persis (exact match, case-insensitive) di sisi
// kita sebelum dikelompokkan, biar item "IBD1001" gak kecampur sama
// "IBD1001SP".
const CrossDockingClient = require("../../services/crossDockingClient");
const KarawangEdpModel = require("./KarawangEdpModel");
const { getField } = require("../../utils/apiField");

// Urutan bantu: curweek "YYWW" ASC (kosong ditaruh paling belakang).
function compareWeekAsc(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

class KarawangFifoModel {
  // Cari semua lot (loccode) tempat 1 item berada di Cross Docking DC
  // Karawang, dikelompokkan per loccode (+ detail per rackcode di
  // dalamnya), diurutkan week paling tua duluan.
  //
  // `filterMode`: "all" | "hold" | "oe" — diteruskan apa adanya ke API
  // Cross Docking (sama seperti dipakai halaman Monitoring Stock Cross
  // Docking), jadi filter kategori/hold-nya konsisten dengan halaman itu.
  static async locationsByItem(itemCode, filterMode = "all") {
    const kode = (itemCode || "").trim();
    if (!kode) return null;
    const kodeUpper = kode.toUpperCase();

    const rawRows = await CrossDockingClient.fetchDetailAll({
      item: kode,
      filterMode: filterMode || "all",
    });

    const deskripsi = await KarawangEdpModel.descriptionForItem(kode);

    // Filter ulang exact match — lihat catatan panjang di atas.
    const rows = (rawRows || []).filter((row) => {
      const rowItem = (getField(row, "item") || "").toString().trim();
      return rowItem.toUpperCase() === kodeUpper;
    });

    if (!rows.length) {
      return {
        item: kode,
        deskripsi,
        filter_mode: filterMode || "all",
        summary: { total_lot: 0, total_rak: 0, total_qty: 0 },
        lokasi: [],
      };
    }

    // Kelompokkan tiap baris (1 baris = 1 unit/pcs) per loccode (lot),
    // dan di dalam tiap lot dikelompokkan lagi per rackcode (buat detail
    // "lot ini isinya rak apa aja").
    const groupedByLot = new Map();
    rows.forEach((row) => {
      const loccode = (getField(row, "loccode") || "").toString().trim();
      const rackcode = (getField(row, "rackcode") || "").toString().trim();
      const curweek = (getField(row, "curweek") || "").toString().trim();
      const probcodeRaw = (getField(row, "probcode") || "").toString().trim();
      const kategori = probcodeRaw ? probcodeRaw.toUpperCase() : "OK";

      const lotKey = loccode || "__tanpa_lokasi__";
      if (!groupedByLot.has(lotKey)) {
        groupedByLot.set(lotKey, {
          loccode: loccode || "-",
          qty: 0,
          kategoriSet: new Set(),
          weekSet: new Set(),
          rackMap: new Map(),
        });
      }
      const grupLot = groupedByLot.get(lotKey);
      grupLot.qty += 1;
      if (kategori) grupLot.kategoriSet.add(kategori);
      if (curweek) grupLot.weekSet.add(curweek);

      const rackKey = rackcode || "__tanpa_rak__";
      if (!grupLot.rackMap.has(rackKey)) {
        grupLot.rackMap.set(rackKey, {
          rackcode: rackcode || "-",
          qty: 0,
          kategoriSet: new Set(),
          weekSet: new Set(),
        });
      }
      const grupRak = grupLot.rackMap.get(rackKey);
      grupRak.qty += 1;
      if (kategori) grupRak.kategoriSet.add(kategori);
      if (curweek) grupRak.weekSet.add(curweek);
    });

    let totalRakGlobal = 0;
    let totalQtyGlobal = 0;

    const lokasi = [...groupedByLot.values()]
      .map((grupLot) => {
        // week lot ini = week PALING TUA di antara semua unit yang ngisi
        // lot itu (sortir string YYWW ASC — aman karena formatnya udah
        // fixed 2 digit tahun + 2 digit minggu).
        const weeksSorted = [...grupLot.weekSet].sort();
        const week = weeksSorted.length ? weeksSorted[0] : "";
        const weekTermuda =
          weeksSorted.length > 1 ? weeksSorted[weeksSorted.length - 1] : "";

        const dominantKategori =
          grupLot.kategoriSet.size > 1
            ? "MIXED"
            : grupLot.kategoriSet.size === 1
              ? [...grupLot.kategoriSet][0]
              : "OK";

        // Detail per rackcode di dalam lot ini — dipakai buat expand
        // "lot X isinya rak apa aja" di frontend. Diurut week paling tua
        // duluan, sama kayak urutan lot di luar.
        const racks = [...grupLot.rackMap.values()]
          .map((grupRak) => {
            const rakWeeksSorted = [...grupRak.weekSet].sort();
            return {
              rackcode: grupRak.rackcode,
              qty: grupRak.qty,
              kategori: [...grupRak.kategoriSet].join(", ") || "-",
              curweek: rakWeeksSorted.length ? rakWeeksSorted[0] : "",
              curweek_termuda:
                rakWeeksSorted.length > 1
                  ? rakWeeksSorted[rakWeeksSorted.length - 1]
                  : undefined,
            };
          })
          .sort(
            (a, b) =>
              compareWeekAsc(a.curweek, b.curweek) ||
              a.rackcode.localeCompare(b.rackcode),
          );

        totalRakGlobal += racks.length;
        totalQtyGlobal += grupLot.qty;

        return {
          loccode: grupLot.loccode,
          week,
          // Kalau lot ini isinya campur >1 week, kasih tau week
          // termudanya juga (buat UI nampilin "2601 s/d 2609" mis.).
          week_termuda: weekTermuda || undefined,
          jumlah_rak: racks.length,
          qty: grupLot.qty,
          dominant_kategori: dominantKategori,
          racks,
        };
      })
      // Urutan utama: week paling tua duluan. Lot tanpa week (jarang
      // terjadi, data tidak lengkap dari sumbernya) ditaruh paling
      // belakang, bukan dianggap paling tua.
      .sort(
        (a, b) =>
          compareWeekAsc(a.week, b.week) || a.loccode.localeCompare(b.loccode),
      );

    return {
      item: kode,
      deskripsi,
      filter_mode: filterMode || "all",
      summary: {
        total_lot: lokasi.length,
        total_rak: totalRakGlobal,
        total_qty: totalQtyGlobal,
      },
      lokasi,
    };
  }
}

module.exports = KarawangFifoModel;
