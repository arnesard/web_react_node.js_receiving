// src/models/stok-opname-karawang/KarawangCrossDockingModel.js
// Verifikasi LIVE ke API Cross Docking (project FGINVC, lihat
// services/crossDockingClient.js) pas operator scan rak/collie di
// lapangan. GANTIKAN KarawangEdpModel (db pandu) sepenuhnya untuk step
// scan — bukan dipakai bareng, bukan fallback.
const CrossDockingClient = require("../../services/crossDockingClient");
const { getField } = require("../../utils/apiField");

class KarawangCrossDockingModel {
  // Step scan RAK: pastiin rackcode itu beneran ada/dikenal di Cross
  // Docking (bukan di data target excel batch ini — itu urusan
  // KarawangTargetModel yang tetap jalan terpisah). Balikin daftar item
  // unik yang ada di rak itu menurut Cross Docking, buat dipakai lagi pas
  // verifikasi collie (hindari nebak-nebak item). Sekalian balikin daftar
  // lokasi (loccode) unik dari rak ini menurut Cross Docking LIVE — dipakai
  // KarawangController.scanRak buat validasi lokasi operator TANPA nembak
  // API tambahan (field ini udah ikut kebalikin di /stock-cd/detail-all
  // yang sama, cuma belum dipetain sebelumnya).
  // Balikin null kalau rackcode gak ketemu sama sekali di Cross Docking.
  static async rackExists(rackcode) {
    const kode = (rackcode || "").trim();
    if (!kode) return null;

    const rows = await CrossDockingClient.fetchDetailAll({
      rackcode: kode,
      filterMode: "all",
    });
    if (!rows || !rows.length) return null;

    const items = [
      ...new Set(
        rows
          .map((r) => (getField(r, "item") || "").toString().trim())
          .filter(Boolean),
      ),
    ];
    const locations = [
      ...new Set(
        rows
          .map((r) => (getField(r, "loccode") || "").toString().trim())
          .filter(Boolean),
      ),
    ];
    // qty: total baris (pcs) buat rak ini menurut Cross Docking — dipakai
    // KarawangController.scanRak sebagai target pcs rak ini, TANPA perlu
    // nembak fetchDetailAll lagi terpisah (udah didapat dari query di atas).
    return { rackcode: kode, items, locations, qty: rows.length };
  }

  // Step scan COLLIE: gak ada endpoint Cross Docking yang langsung nerima
  // kode collie, jadi caranya: buat tiap item yang ada di rak ini
  // (`knownItems`, hasil dari rackExists di atas), tarik detail per
  // rackcode+item (endpoint /stock-cd/detail — yang SATU-SATUNYA
  // ngebalikin bc_collie, lihat CrossDockingController buat konteks
  // lengkap), terus cari baris yang bc_collie-nya cocok sama collie yang
  // discan. qty dihitung dari COUNT baris yang share bc_collie yang sama
  // (1 baris = 1 pcs, persis pola yang dulu dipakai di EDP).
  // Balikin null kalau collie gak ketemu di item manapun di rak itu.
  static async verifyCollie(rackcode, collie, knownItems) {
    const kode = (rackcode || "").trim();
    const kodeCollie = (collie || "").trim();
    if (!kode || !kodeCollie) return null;

    let items = knownItems;
    if (!items || !items.length) {
      const rack = await this.rackExists(kode);
      items = rack ? rack.items : [];
    }
    if (!items.length) return null;

    const matches = [];
    for (const item of items) {
      let detailRows;
      try {
        detailRows = await CrossDockingClient.fetchDetail(kode, item);
      } catch (err) {
        console.error(
          `KarawangCrossDockingModel.verifyCollie: gagal ambil detail ${kode}/${item}:`,
          err,
        );
        continue;
      }
      (detailRows || []).forEach((row) => {
        const bcCollie = getField(row, "bc_collie");
        if (bcCollie !== undefined && String(bcCollie).trim() === kodeCollie) {
          matches.push(row);
        }
      });
      if (matches.length) break; // udah ketemu di item ini, gak perlu cek item lain
    }

    if (!matches.length) return null;

    const item = (getField(matches[0], "item") || "").toString().trim();
    const probcodeRaw = (getField(matches[0], "probcode") || "")
      .toString()
      .trim();
    const kategori = probcodeRaw ? probcodeRaw.toUpperCase() : "OK";
    const qty = matches.length;
    // lastupdated dari baris yang cocok — dipakai KarawangController.scanCollie
    // buat nge-tolak scan collie yang barangnya lagi status karantina (lihat
    // cutoff di karantinaCutoffStore). Diambil dari sini (bukan enrichment
    // tambahan) karena matches[0] udah hasil query /stock-cd/detail yang
    // emang ngebalikin field ini.
    const lastupdated = getField(matches[0], "lastupdated");

    return { item, qty, kategori, lastupdated };
  }

  // Validasi OUTBOUND: dipanggil dashboardFull buat item yang overscan
  // (qty_scanned > qty_target) — cek per rak, apakah qty item itu di rak
  // tersebut SEKARANG (live Cross Docking) udah berkurang dibanding pas
  // discan. Berkurang = indikasi kuat udah ada outbound dari rak itu
  // setelah operator scan (bukan berarti pasti salah input/dobel scan).
  // Ringan: 1 rackcode+item = 1 request /stock-cd/detail (endpoint yang
  // sama dipakai verifyCollie), BUKAN query detail-all yang berat.
  // Validasi OUTBOUND: dipanggil dashboardFull buat item yang overscan
  // (qty_scanned > qty_target) — cek per rak, apakah qty item itu di rak
  // tersebut SEKARANG (live Cross Docking) udah berkurang dibanding pas
  // discan. Balikin `diff` MENTAH (qty_scanned - qty_live) — BOLEH MINUS
  // kalau live-nya malah lebih gede dari pas discan (rak itu nampung
  // pindahan dari rak lain). Sengaja gak di-floor 0 di sini; caller
  // (controller) yang jumlahin diff dari SEMUA rak dalam 1 item dulu baru
  // floor 0 di akhir — biar surplus di satu rak (nampung pindahan) bisa
  // nge-offset defisit di rak lain (kasus barang pindah rak, bukan bener2
  // outbound dari gudang). Kalau tiap rak di-floor sendiri2 duluan, kasus
  // pindah-rak keitung dobel jadi "outbound" padahal barangnya masih ada,
  // cuma beda rak.
  static async checkOutbound(rackcode, item, qtyScanned) {
    const kode = (rackcode || "").trim();
    const kodeItem = (item || "").trim();
    if (!kode || !kodeItem) {
      return {
        rackcode: kode,
        qty_scanned: qtyScanned,
        qty_live: 0,
        diff: 0,
        check_failed: true,
      };
    }

    let detailRows = [];
    try {
      detailRows = await CrossDockingClient.fetchDetail(kode, kodeItem);
    } catch (err) {
      console.error(
        `KarawangCrossDockingModel.checkOutbound: gagal ambil detail ${kode}/${kodeItem}:`,
        err,
      );
      // Gagal nembak CD — diff 0 (netral), jangan nge-klaim outbound
      // ataupun surplus tanpa bukti.
      return {
        rackcode: kode,
        qty_scanned: qtyScanned,
        qty_live: null,
        diff: 0,
        check_failed: true,
      };
    }

    const qtyLive = (detailRows || []).length;
    const diff = qtyScanned - qtyLive;

    return {
      rackcode: kode,
      qty_scanned: qtyScanned,
      qty_live: qtyLive,
      diff,
      check_failed: false,
    };
  }
}

module.exports = KarawangCrossDockingModel;
