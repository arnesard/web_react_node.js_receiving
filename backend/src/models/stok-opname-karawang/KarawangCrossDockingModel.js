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
  // verifikasi collie (hindari nebak-nebak item).
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
    return { rackcode: kode, items };
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

    return { item, qty, kategori };
  }
}

module.exports = KarawangCrossDockingModel;
