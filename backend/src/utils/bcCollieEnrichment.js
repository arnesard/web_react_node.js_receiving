// src/utils/bcCollieEnrichment.js
// Dipindah dari CrossDockingController (dulu cuma dipake buat export CSV
// Cross Docking) biar bisa dipake bareng sama Halaman Barcode Karawang
// juga — logikanya sama persis, cuma sekarang jadi util bersama.
//
// Detail All resmi (/stock-cd/detail-all) gak mengandung field bc_collie —
// field itu cuma ada di endpoint detail per rackcode+item (/stock-cd/detail,
// yang di web aslinya dibuka lewat popup "Detail: RACKCODE / ITEM"). Fungsi
// ini "nempelin" bc_collie ke tiap baris Detail All dengan cara: (1)
// kumpulin semua pasangan rackcode+item yang unik, (2) query detail buat
// tiap pasangan itu (dibatasi concurrency biar gak nembak semua sekaligus
// ke server sumber), (3) cocokin balik ke tiap baris lewat barcode.
//
// `maxPairs`: batas jumlah kombinasi rackcode+item sebelum nyerah (biar
// gak overload server sumber) — null/Infinity = gak ada batas. Dipake beda
// antara tampilan web (dibatasi, harus cepat) dan aksi yang user sengaja
// tunggu seperti export CSV (gak dibatasi, karena user emang udah sengaja
// nunggu & butuh datanya lengkap).
const CrossDockingClient = require("../services/crossDockingClient");
const { getField } = require("./apiField");
const { mapWithConcurrency } = require("./concurrency");

async function enrichWithBcCollie(
  rows,
  { maxPairs = 150, concurrency = 8 } = {},
) {
  const pairs = new Map(); // "rackcode||item" -> { rackcode, item }
  rows.forEach((row) => {
    const rackcode = getField(row, "rackcode");
    const item = getField(row, "item");
    if (rackcode && item) {
      pairs.set(`${rackcode}||${item}`, { rackcode, item });
    }
  });
  const uniquePairs = Array.from(pairs.values());

  if (uniquePairs.length === 0) {
    return { rows, bcCollieEnriched: true, bcCollieSkippedReason: undefined };
  }

  if (
    maxPairs != null &&
    Number.isFinite(maxPairs) &&
    uniquePairs.length > maxPairs
  ) {
    return {
      rows,
      bcCollieEnriched: false,
      bcCollieSkippedReason: `Ada ${uniquePairs.length} kombinasi rackcode+item pada hasil ini (batas ${maxPairs}), jadi Bc Collie dilewati biar gak membebani server Cross Docking. Persempit filter (mis. isi Rackcode/Item lebih spesifik) untuk melihat Bc Collie.`,
    };
  }

  const barcodeToBcCollie = new Map();
  const barcodeToLastUpdate = new Map();
  let anyPairFailed = false;
  let loggedSampleKeys = false; // debug: cetak sekali aja biar log gak banjir

  await mapWithConcurrency(uniquePairs, concurrency, async (pair) => {
    try {
      const detailRows = await CrossDockingClient.fetchDetail(
        pair.rackcode,
        pair.item,
      );
      (detailRows || []).forEach((detailRow) => {
        // barcode di-String()-in biar konsisten dipake sebagai key Map,
        // soalnya detail-all vs detail bisa aja balikin barcode dengan
        // tipe beda (angka vs string) walau nilainya sama.
        const barcodeRaw = getField(detailRow, "barcode");
        const bcCollie = getField(detailRow, "bc_collie");
        const lastUpdate = getField(detailRow, "lastupdated");
        if (barcodeRaw !== undefined) {
          barcodeToBcCollie.set(String(barcodeRaw), bcCollie);
          barcodeToLastUpdate.set(String(barcodeRaw), lastUpdate);
        }
        if (!loggedSampleKeys) {
          loggedSampleKeys = true;
          console.log(
            "[CrossDocking] Contoh key dari /stock-cd/detail:",
            Object.keys(detailRow || {}),
            "-> bc_collie kebaca:",
            bcCollie,
            "-> lastupdated kebaca:",
            lastUpdate,
          );
        }
      });
    } catch (err) {
      anyPairFailed = true;
      console.error(
        `Gagal ambil detail Bc Collie untuk ${pair.rackcode}/${pair.item}:`,
        err,
      );
    }
  });

  const enrichedRows = rows.map((row) => {
    const barcodeRaw = getField(row, "barcode");
    const barcode = barcodeRaw !== undefined ? String(barcodeRaw) : undefined;
    const bcCollie =
      barcode !== undefined && barcodeToBcCollie.has(barcode)
        ? barcodeToBcCollie.get(barcode)
        : undefined;
    const lastUpdate =
      barcode !== undefined && barcodeToLastUpdate.has(barcode)
        ? barcodeToLastUpdate.get(barcode)
        : undefined;
    return { ...row, bc_collie: bcCollie, last_update: lastUpdate };
  });

  return {
    rows: enrichedRows,
    bcCollieEnriched: !anyPairFailed,
    bcCollieSkippedReason: anyPairFailed
      ? 'Sebagian data Bc Collie gagal diambil (koneksi ke server Cross Docking sempat gagal untuk sebagian rack/item). Baris yang gagal akan tampil "-" di kolom Bc Collie.'
      : undefined,
  };
}

module.exports = { enrichWithBcCollie };
