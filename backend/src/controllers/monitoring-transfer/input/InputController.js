// src/controllers/monitoring-transfer/input/InputController.js
// Equivalen App\Http\Controllers\MonitoringTransferRak\TransferRakController (Laravel)
// Alur input: kirim rak isi/kosong, scan, terima. Dashboard ada di ../dashboard/DashboardController.js
const TransferRakModel = require("../../../models/monitoring-transfer/TransferRakModel");
const TransferRakDetailModel = require("../../../models/monitoring-transfer/TransferRakDetailModel");
const DriverModel = require("../../../models/monitoring-transfer/DriverModel");
const VehicleModel = require("../../../models/monitoring-transfer/VehicleModel");
const LocationModel = require("../../../models/monitoring-transfer/LocationModel");
const RackVerificationModel = require("../../../models/monitoring-transfer/RackVerificationModel");
const EmployeeModel = require("../../../models/karyawan/EmployeeModel");
const response = require("../../../utils/response");
const { poolUtama } = require("../../../config/database");
const { toJakartaDateString, addDaysJakarta } = require("../../../utils/date");
const { toTimeString, formatDateTime } = require("../shared/formatters");

// Project ini belum punya sistem login/JWT (lihat catatan yang sama di
// report.routes.js), jadi belum ada Auth::id() versi Node. Sementara pakai
// user_id dari body kalau dikirim, atau default 1 (akun admin seed).
// TODO: ganti ke req.user.id begitu auth/JWT sudah ada.
function currentUserId(req) {
  return req.body?.user_id || 1;
}

class InputController {
  // GET /api/transfer-rak  → data awal buat halaman input (dropdown karyawan)
  async index(req, res) {
    try {
      // Cuma karyawan bagian TRANSFER yang muncul di dropdown Operator/Penerima
      const karyawan = await EmployeeModel.getByBagian("TRANSFER");
      return response.success(res, { karyawan });
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  // GET /api/transfer-rak/drivers?q=...  → autocomplete supir
  async getDrivers(req, res) {
    try {
      const q = req.query.q || "";
      const drivers = await DriverModel.search(q, 20);
      return response.success(res, drivers);
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  // GET /api/transfer-rak/vehicles?q=...  → autocomplete kendaraan
  async getVehicles(req, res) {
    try {
      const q = req.query.q || "";
      const vehicles = await VehicleModel.search(q, 20);
      return response.success(res, vehicles);
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  // GET /api/transfer-rak/lokasi?q=...  → autocomplete lokasi
  async getLokasi(req, res) {
    try {
      const q = req.query.q || "";
      const lokasi = await LocationModel.search(q, 20);
      return response.success(res, lokasi);
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  // POST /api/transfer-rak/start
  async start(req, res) {
    try {
      const { id_karyawan, id_supir, id_mobil, id_lokasi_asal, catatan } =
        req.body;

      if (!id_karyawan || !id_supir || !id_mobil || !id_lokasi_asal) {
        return response.error(
          res,
          "id_karyawan, id_supir, id_mobil, id_lokasi_asal wajib diisi",
          422,
        );
      }

      const [driver, vehicle, lokasi] = await Promise.all([
        DriverModel.findById(id_supir),
        VehicleModel.findById(id_mobil),
        LocationModel.findById(id_lokasi_asal),
      ]);
      if (!driver)
        return response.error(
          res,
          "Supir tidak ditemukan. Tambahkan dulu di menu Pengaturan.",
          404,
        );
      if (!vehicle)
        return response.error(
          res,
          "Kendaraan tidak ditemukan. Tambahkan dulu di menu Pengaturan.",
          404,
        );
      if (!lokasi)
        return response.error(
          res,
          "Lokasi tidak ditemukan. Tambahkan dulu di menu Pengaturan.",
          404,
        );

      // Cek apakah mobil ini sudah ada transfer yang sedang proses
      // (multi-operator join scan bareng)
      const existingActive = await TransferRakModel.findProsesByVehicle(
        vehicle.id,
      );
      if (existingActive) {
        const totalScanned = await TransferRakDetailModel.countByTransfer(
          existingActive.id,
        );
        if (catatan) {
          await TransferRakModel.appendCatatan(existingActive.id, catatan);
        }
        return response.success(res, {
          success: true,
          transfer_id: existingActive.id,
          joined: true,
          total_sudah: totalScanned,
          message: "Bergabung ke transfer yang sedang berjalan",
        });
      }

      // Cek apakah mobil ini masih punya kiriman yang belum diterima semua
      const activeTransfer = await TransferRakModel.findNotReceivedByVehicle(
        vehicle.id,
        ["selesai", "diterima", "sebagian"],
      );

      if (activeTransfer) {
        if (
          activeTransfer.status === "selesai" &&
          activeTransfer.tipe === "transfer"
        ) {
          // KASUS: Salah klik selesai / mau nambah rak → buka lagi
          await TransferRakModel.updateStatus(activeTransfer.id, "proses");
          if (catatan) {
            await TransferRakModel.appendCatatan(activeTransfer.id, catatan);
          }
          const totalScanned = await TransferRakDetailModel.countByTransfer(
            activeTransfer.id,
          );
          return response.success(res, {
            success: true,
            transfer_id: activeTransfer.id,
            joined: true,
            reopened: true,
            total_sudah: totalScanned,
            message: "Membuka kembali transfer LB1 untuk ditambah rak.",
          });
        }

        // Statusnya 'sebagian' → mobil sudah jalan & lagi dibongkar di gudang 1
        const totalRak = await TransferRakDetailModel.countByTransfer(
          activeTransfer.id,
        );
        const sudahDiterima =
          await TransferRakDetailModel.countReceivedByTransfer(
            activeTransfer.id,
          );
        return response.error(
          res,
          `Kendaraan "${vehicle.nama_kendaraan}" sedang dalam proses bongkar (${sudahDiterima}/${totalRak} rak diterima). Selesaikan penerimaan dulu.`,
          422,
        );
      }

      // Buat record transfer baru
      const transfer = await TransferRakModel.create({
        tipe: "transfer",
        user_id: currentUserId(req),
        id_karyawan,
        id_supir: driver.id,
        id_mobil: vehicle.id,
        lokasi_asal: lokasi.nama_lokasi,
        status: "proses",
        catatan: catatan || null,
        waktu_mulai_now: true,
      });

      return response.success(res, {
        success: true,
        transfer_id: transfer.id,
        joined: false,
        message: "Transfer dimulai",
      });
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  // POST /api/transfer-rak/scan
  async scan(req, res) {
    try {
      const { transfer_rak_id, kode_rak, id_karyawan, id_lokasi_asal } =
        req.body;
      if (!transfer_rak_id || !kode_rak || !id_karyawan || !id_lokasi_asal) {
        return response.error(
          res,
          "transfer_rak_id, kode_rak, id_karyawan, id_lokasi_asal wajib diisi",
          422,
        );
      }

      const transfer = await TransferRakModel.findById(transfer_rak_id);
      if (!transfer || transfer.status !== "proses") {
        return response.error(
          res,
          "Transfer tidak aktif atau tidak ditemukan",
          404,
        );
      }

      // Lokasi asal dicek PER RAK (bukan dikunci di level sesi), biar 1 mobil
      // bisa ngangkut rak dari lebih dari 1 plan dalam 1 sesi kirim yang sama.
      const lokasiAsalRak = await LocationModel.findById(id_lokasi_asal);
      if (!lokasiAsalRak) {
        return response.error(
          res,
          "Lokasi asal tidak ditemukan. Tambahkan dulu di menu Pengaturan.",
          404,
        );
      }

      const exists = await TransferRakDetailModel.existsKodeRak(
        transfer_rak_id,
        kode_rak,
      );
      if (exists) {
        return res.status(400).json({
          status: "error",
          message: "❌ Rak sudah discan sebelumnya!",
          data: null,
          duplicate: true,
        });
      }

      // Verifikasi ke DB tim EDP (fginvc.rack) — wajib ketemu, biar operator
      // tau isi rak ini item apa & qty berapa sebelum discan masuk transfer.
      let verifikasi;
      try {
        verifikasi = await RackVerificationModel.verify(kode_rak);
      } catch (edpErr) {
        console.error("RackVerificationModel.verify gagal:", edpErr);
        return res.status(502).json({
          status: "error",
          message:
            "Gagal terhubung ke database EDP buat verifikasi rak. Coba lagi, atau hubungi IT kalau terus gagal.",
          data: null,
          edp_unreachable: true,
        });
      }
      if (!verifikasi) {
        return res.status(422).json({
          status: "error",
          message: `❌ Kode rak "${kode_rak}" tidak ditemukan di database EDP. Pastikan kode rak benar.`,
          data: null,
          not_verified: true,
        });
      }

      const detail = await TransferRakDetailModel.create({
        transfer_rak_id,
        kode_rak,
        id_karyawan_pengirim: id_karyawan,
        id_lokasi_asal: lokasiAsalRak.id,
        lokasi_asal: lokasiAsalRak.nama_lokasi,
        item: verifikasi.item,
        qty: verifikasi.qty,
        kategori: verifikasi.kategori,
        deskripsi: verifikasi.deskripsi,
      });

      await TransferRakModel.incrementTotalRak(transfer_rak_id);
      const updated = await TransferRakModel.findById(transfer_rak_id);

      return response.success(res, {
        success: true,
        kode_rak: detail.kode_rak,
        item: detail.item,
        qty: detail.qty,
        kategori: detail.kategori,
        deskripsi: detail.deskripsi,
        lokasi_asal: detail.lokasi_asal,
        waktu_scan: toTimeString(detail.waktu_scan),
        total: updated.total_rak,
      });
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  // POST /api/transfer-rak/scan/cancel  (BATAL 1 rak yang salah scan pas kirim)
  async cancelScan(req, res) {
    try {
      const { transfer_rak_id, kode_rak } = req.body;
      if (!transfer_rak_id || !kode_rak) {
        return response.error(
          res,
          "transfer_rak_id, kode_rak wajib diisi",
          422,
        );
      }

      const transfer = await TransferRakModel.findById(transfer_rak_id);
      if (!transfer || transfer.status !== "proses") {
        return response.error(
          res,
          "Transfer tidak aktif atau tidak ditemukan",
          404,
        );
      }

      const deleted = await TransferRakDetailModel.deleteUnreceived(
        transfer_rak_id,
        kode_rak,
      );
      if (!deleted) {
        return response.error(
          res,
          `Rak "${kode_rak}" tidak ditemukan di sesi ini (mungkin sudah diterima atau sudah dihapus)`,
          404,
        );
      }

      await TransferRakModel.decrementTotalRak(transfer_rak_id);
      const updated = await TransferRakModel.findById(transfer_rak_id);

      return response.success(res, {
        success: true,
        kode_rak,
        total: updated.total_rak,
      });
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  // POST /api/transfer-rak/finish
  async finish(req, res) {
    try {
      const { transfer_rak_id } = req.body;
      if (!transfer_rak_id) {
        return response.error(res, "transfer_rak_id wajib diisi", 422);
      }

      const transfer = await TransferRakModel.findById(transfer_rak_id);
      if (!transfer) {
        return response.error(res, "Transfer tidak ditemukan", 404);
      }

      const totalScanned =
        await TransferRakDetailModel.countByTransfer(transfer_rak_id);
      await TransferRakModel.markSelesai(transfer_rak_id, totalScanned);

      return response.success(res, {
        success: true,
        message: "Transfer selesai",
        total: totalScanned,
      });
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  // POST /api/transfer-rak/scan-mobil-penerima
  async scanMobilPenerima(req, res) {
    try {
      const { nama_kendaraan } = req.body;
      if (!nama_kendaraan) {
        return response.error(res, "nama_kendaraan wajib diisi", 422);
      }

      const vehicle = await VehicleModel.findByName(nama_kendaraan.trim());
      if (!vehicle) {
        return response.error(res, "Kendaraan tidak ditemukan di sistem", 404);
      }

      const transfer = await TransferRakModel.findLatestWaitingReceiptByVehicle(
        vehicle.id,
      );
      if (!transfer) {
        return response.error(
          res,
          "Tidak ada pengiriman aktif (belum diterima) untuk kendaraan ini",
          404,
        );
      }

      // Nama-nama pengirim: dari detail rak (bisa multi-operator), fallback ke karyawan utama
      let namaPengirim = await TransferRakDetailModel.distinctPengirimNames(
        transfer.id,
      );
      if (!namaPengirim.length) {
        namaPengirim = [transfer.nama_karyawan || "-"];
      }

      const totalRak = await TransferRakDetailModel.countByTransfer(
        transfer.id,
      );
      const sudahDiterima =
        await TransferRakDetailModel.countReceivedByTransfer(transfer.id);
      const sisaRak = totalRak - sudahDiterima;
      const belumDiterima = await TransferRakDetailModel.unreceivedList(
        transfer.id,
      );
      // Breakdown per lokasi asal — 1 sesi kirim bisa punya lebih dari 1 plan/
      // lokasi asal, jadi jangan cuma nampilin transfer.lokasi_asal tunggal.
      const asalBreakdown = await TransferRakDetailModel.originBreakdown(
        transfer.id,
      );

      return response.success(res, {
        success: true,
        transfer: {
          id: transfer.id,
          tipe: transfer.tipe || "transfer",
          pengirim: namaPengirim.join(", "),
          supir: transfer.nama_supir || "-",
          lokasi_asal: transfer.lokasi_asal || "-",
          asal_breakdown: asalBreakdown,
          waktu_mulai: formatDateTime(transfer.waktu_mulai),
          total_rak: totalRak,
          sudah_diterima: sudahDiterima,
          sisa_rak: sisaRak,
          catatan: transfer.catatan || "-",
          jumlah_rak_kosong: transfer.jumlah_rak_kosong,
          jumlah_palet_kosong: transfer.jumlah_palet_kosong,
          belum_diterima: belumDiterima.map((d) => ({
            id: d.id,
            kode_rak: d.kode_rak,
            item: d.item || "-",
            qty: d.qty,
            kategori: d.kategori || "-",
            deskripsi: d.deskripsi || "-",
            lokasi_asal: d.lokasi_asal || "-",
            waktu_scan: d.waktu_scan ? toTimeString(d.waktu_scan) : "-",
          })),
        },
      });
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  // POST /api/transfer-rak/scan-terima  (validasi 1 kode rak saat penerimaan)
  async scanTerima(req, res) {
    try {
      const { transfer_rak_id, kode_rak } = req.body;
      if (!transfer_rak_id || !kode_rak) {
        return response.error(
          res,
          "transfer_rak_id, kode_rak wajib diisi",
          422,
        );
      }

      const detail = await TransferRakDetailModel.findByTransferAndKode(
        transfer_rak_id,
        kode_rak,
      );
      if (!detail) {
        return response.error(
          res,
          `Rak "${kode_rak}" tidak ditemukan dalam pengiriman ini`,
          404,
        );
      }

      if (detail.waktu_diterima) {
        return res.status(400).json({
          status: "error",
          message: `Rak "${kode_rak}" sudah diterima sebelumnya di ${detail.lokasi_diterima}`,
          data: null,
          duplicate: true,
        });
      }

      const totalRak =
        await TransferRakDetailModel.countByTransfer(transfer_rak_id);
      const sudahDiterima =
        await TransferRakDetailModel.countReceivedByTransfer(transfer_rak_id);

      return response.success(res, {
        success: true,
        detail_id: detail.id,
        kode_rak: detail.kode_rak,
        item: detail.item || "-",
        qty: detail.qty,
        kategori: detail.kategori || "-",
        deskripsi: detail.deskripsi || "-",
        lokasi_asal: detail.lokasi_asal || "-",
        total_rak: totalRak,
        sudah_diterima: sudahDiterima,
        sisa: totalRak - sudahDiterima,
      });
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  // POST /api/transfer-rak/terima  (commit penerimaan — partial atau full)
  async terima(req, res) {
    try {
      const {
        transfer_rak_id,
        id_lokasi_tujuan,
        id_karyawan_penerima,
        kode_rak_list,
      } = req.body;

      if (!transfer_rak_id || !id_lokasi_tujuan || !id_karyawan_penerima) {
        return response.error(
          res,
          "transfer_rak_id, id_lokasi_tujuan, id_karyawan_penerima wajib diisi",
          422,
        );
      }

      const lokasi = await LocationModel.findById(id_lokasi_tujuan);
      if (!lokasi) {
        return response.error(
          res,
          "Lokasi tujuan tidak ditemukan. Tambahkan dulu di menu Pengaturan.",
          404,
        );
      }
      const lokasiTujuan = lokasi.nama_lokasi;

      const transfer = await TransferRakModel.findById(transfer_rak_id);
      if (!transfer || !["selesai", "sebagian"].includes(transfer.status)) {
        return response.error(res, "Data transfer tidak valid", 400);
      }

      if (transfer.tipe === "rak_kosong") {
        // Flow Rak Kosong: langsung selesaikan semua
        await TransferRakModel.markDiterima(
          transfer_rak_id,
          lokasiTujuan,
          id_karyawan_penerima,
        );
        return response.success(res, {
          success: true,
          message: "Penerimaan rak/palet kosong berhasil diselesaikan!",
          fully_received: true,
        });
      }

      // Flow Rak Isi (partial)
      const kodeList = Array.isArray(kode_rak_list) ? kode_rak_list : [];
      if (!kodeList.length) {
        return response.error(res, "Silakan scan rak terlebih dahulu", 422);
      }

      let countUpdated = 0;
      for (const kodeRak of kodeList) {
        const updated = await TransferRakDetailModel.markReceived(
          transfer_rak_id,
          kodeRak,
          lokasiTujuan,
          id_karyawan_penerima,
        );
        countUpdated += updated;
      }

      const totalRak =
        await TransferRakDetailModel.countByTransfer(transfer_rak_id);
      const totalDiterima =
        await TransferRakDetailModel.countReceivedByTransfer(transfer_rak_id);

      let message;
      if (totalDiterima >= totalRak) {
        await TransferRakModel.markDiterima(
          transfer_rak_id,
          lokasiTujuan,
          id_karyawan_penerima,
        );
        message = "Semua rak sudah diterima! Transfer selesai.";
      } else {
        await TransferRakModel.markSebagian(transfer_rak_id);
        const sisa = totalRak - totalDiterima;
        message = `${countUpdated} rak diterima di ${lokasiTujuan}. Sisa ${sisa} rak belum diterima.`;
      }

      return response.success(res, {
        success: true,
        message,
        diterima: countUpdated,
        total_diterima: totalDiterima,
        total_rak: totalRak,
        sisa: totalRak - totalDiterima,
        fully_received: totalDiterima >= totalRak,
      });
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  // POST /api/transfer-rak/start-kosong
  async startKosong(req, res) {
    try {
      const {
        id_karyawan,
        id_supir,
        id_mobil,
        id_lokasi_asal,
        jumlah_rak_kosong,
        jumlah_palet_kosong,
        catatan,
      } = req.body;

      if (!id_karyawan || !id_supir || !id_mobil || !id_lokasi_asal) {
        return response.error(
          res,
          "id_karyawan, id_supir, id_mobil, id_lokasi_asal wajib diisi",
          422,
        );
      }

      const jmlRak = Number(jumlah_rak_kosong) || 0;
      const jmlPalet = Number(jumlah_palet_kosong) || 0;

      if (jmlRak <= 0 && jmlPalet <= 0) {
        return response.error(
          res,
          "Minimal isi salah satu: jumlah rak atau palet kosong",
          422,
        );
      }

      const [driver, vehicle, lokasi] = await Promise.all([
        DriverModel.findById(id_supir),
        VehicleModel.findById(id_mobil),
        LocationModel.findById(id_lokasi_asal),
      ]);
      if (!driver)
        return response.error(
          res,
          "Supir tidak ditemukan. Tambahkan dulu di menu Pengaturan.",
          404,
        );
      if (!vehicle)
        return response.error(
          res,
          "Kendaraan tidak ditemukan. Tambahkan dulu di menu Pengaturan.",
          404,
        );
      if (!lokasi)
        return response.error(
          res,
          "Lokasi tidak ditemukan. Tambahkan dulu di menu Pengaturan.",
          404,
        );

      // Mobil sedang scan rak isi (proses)? Gak boleh input rak kosong dulu.
      const existingProses = await TransferRakModel.findProsesByVehicle(
        vehicle.id,
      );
      if (existingProses) {
        return response.error(
          res,
          "Mobil ini sedang melakukan scan RAK ISI (proses). Selesaikan dulu scan rak isi baru bisa input rak kosong.",
          422,
        );
      }

      // Mobil sudah ada kiriman rak kosong yang belum diterima? Gabungkan (join)
      const existingKosong = await TransferRakModel.findActiveKosongByVehicle(
        vehicle.id,
      );
      if (existingKosong) {
        await TransferRakModel.incrementRakKosong(
          existingKosong.id,
          jmlRak,
          jmlPalet,
        );
        if (catatan) {
          await TransferRakModel.appendCatatan(existingKosong.id, catatan);
        }
        return response.success(res, {
          success: true,
          transfer_id: existingKosong.id,
          joined: true,
          message:
            "Kuantitas ditambahkan ke kiriman rak kosong yang sudah ada di mobil ini.",
        });
      }

      // Mobil masih bawa RAK ISI yang belum diterima semua? Tolak.
      const activeIsi = await TransferRakModel.findActiveIsiByVehicle(
        vehicle.id,
      );
      if (activeIsi) {
        return response.error(
          res,
          "Mobil ini masih membawa RAK ISI yang belum diterima semua. Selesaikan penerimaan rak isi dulu.",
          422,
        );
      }

      const transfer = await TransferRakModel.create({
        tipe: "rak_kosong",
        user_id: currentUserId(req),
        id_karyawan,
        id_supir: driver.id,
        id_mobil: vehicle.id,
        lokasi_asal: lokasi.nama_lokasi,
        jumlah_rak_kosong: jmlRak,
        jumlah_palet_kosong: jmlPalet,
        status: "selesai",
        catatan: catatan || null,
        waktu_mulai_now: true,
        waktu_selesai_now: true,
      });

      return response.success(res, {
        success: true,
        transfer_id: transfer.id,
        joined: false,
        message: "Transfer rak/palet kosong berhasil dikirim",
      });
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  // POST /api/transfer-rak/cancel
  async cancel(req, res) {
    try {
      const { transfer_rak_id } = req.body;
      if (!transfer_rak_id) {
        return response.error(res, "transfer_rak_id wajib diisi", 422);
      }
      const transfer = await TransferRakModel.findById(transfer_rak_id);
      if (transfer) {
        await TransferRakModel.cancel(transfer_rak_id);
      }
      return response.success(res, { success: true });
    } catch (err) {
      return response.error(res, err.message);
    }
  }
}

module.exports = new InputController();
