// src/models/stok-opname-karawang/KarawangTripPerTrukModel.js
// Report "Trip per Truk" — dalam 1 truk (nopol) hari itu ada berapa trip
// (loadId), tiap trip isi item apa aja beserta ukuran ban & qty.
//
// Sumber data: API "Monitoring Transfer" punya server Cross Docking
// (CrossDockingClient.fetchTransferOrders, endpoint /orders — BEDA dari
// /stock-cd/* yang udah dipake modul Cross Docking lain, tapi 1 server
// yang sama). 1 baris di /orders = 1 item dalam 1 trip:
//   { loadId, nopol, doDate, item, customer, requested, actual, nonScan,
//     status, scanStart, scanEnd, noLpn, sopir, ... }
//
// "Ukuran ban" gak ada di response /orders sama sekali (cuma kode item),
// jadi di-enrich sendiri dari stok_opname_karawang_master_item (tabel
// lokal yang sama yang dipake Tire Trip Plan buat deskripsi/volume, lihat
// KarawangItemRequestModel.getTireTripItems). deskripsi item ini yang
// isinya ukuran ban (mis. "130/70-13 SCT-001").
const { poolUtama } = require("../../config/database");
const CrossDockingClient = require("../../services/crossDockingClient");

class KarawangTripPerTrukModel {
  // date: "YYYY-MM-DD". Return: array per nopol (truk), masing-masing
  // bawa trips[] (per loadId), masing-masing trip bawa items[].
  static async getTripPerTruk(date) {
    const orders = await CrossDockingClient.fetchTransferOrders(date);
    const rows = Array.isArray(orders) ? orders : orders?.data || [];

    if (rows.length === 0) {
      return [];
    }

    // Enrich ukuran ban (deskripsi) dari master_item lokal -- 1 query
    // buat semua kode item yang muncul hari itu, biar gak query per baris.
    const itemCodes = [
      ...new Set(rows.map((r) => String(r.item || "").trim().toUpperCase())),
    ].filter(Boolean);

    let masterMap = new Map();
    if (itemCodes.length > 0) {
      const [masterRows] = await poolUtama.query(
        `SELECT TRIM(UPPER(code_no)) AS code_no, description
         FROM stok_opname_karawang_master_item
         WHERE TRIM(UPPER(code_no)) IN (?)`,
        [itemCodes],
      );
      masterMap = new Map(masterRows.map((m) => [m.code_no, m.description]));
    }

    // Grouping: nopol -> loadId -> items[]
    const trukMap = new Map();

    rows.forEach((row) => {
      const nopol = String(row.nopol || "TANPA NOPOL").trim() || "TANPA NOPOL";
      const loadId = row.loadId || row.noLpn || "-";
      const itemCode = String(row.item || "").trim().toUpperCase();
      const requested = Number(row.requested || 0);
      const actual = Number(row.actual || 0);

      if (!trukMap.has(nopol)) {
        trukMap.set(nopol, { nopol, tripMap: new Map() });
      }
      const truk = trukMap.get(nopol);

      if (!truk.tripMap.has(loadId)) {
        truk.tripMap.set(loadId, {
          loadId,
          noLpn: row.noLpn || loadId,
          doDate: row.doDate || date,
          status: row.status || "-",
          sopir: row.sopir || "-",
          customer: row.customer || "-",
          scanStart: row.scanStart || null,
          scanEnd: row.scanEnd || null,
          items: [],
          total_requested: 0,
          total_actual: 0,
        });
      }
      const trip = truk.tripMap.get(loadId);

      trip.items.push({
        item: row.item,
        ukuran: masterMap.get(itemCode) || "-",
        requested,
        actual,
        nonScan: Number(row.nonScan || 0),
      });
      trip.total_requested += requested;
      trip.total_actual += actual;
    });

    // Flatten Map -> array, sort trip per truk berdasarkan loadId, truk
    // berdasarkan jumlah trip terbanyak dulu (yang paling "sering jalan").
    const result = [...trukMap.values()].map((truk) => {
      const trips = [...truk.tripMap.values()].sort((a, b) =>
        String(a.loadId).localeCompare(String(b.loadId)),
      );
      return {
        nopol: truk.nopol,
        jumlah_trip: trips.length,
        total_requested: trips.reduce((s, t) => s + t.total_requested, 0),
        total_actual: trips.reduce((s, t) => s + t.total_actual, 0),
        trips,
      };
    });

    result.sort((a, b) => b.jumlah_trip - a.jumlah_trip);

    return result;
  }
}

module.exports = KarawangTripPerTrukModel;
