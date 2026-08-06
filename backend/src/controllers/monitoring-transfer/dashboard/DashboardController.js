// src/controllers/monitoring-transfer/dashboard/DashboardController.js
// Dashboard monitoring transfer rak (per-shift). Dipisah dari
// TransferRakController.js lama biar gak nyampur sama logic input/scan.
const response = require("../../../utils/response");
const { poolUtama } = require("../../../config/database");
const { toJakartaDateString, addDaysJakarta } = require("../../../utils/date");
const { toTimeShort, formatDateShort } = require("../shared/formatters");
const TransferRakDetailModel = require("../../../models/monitoring-transfer/TransferRakDetailModel");

class DashboardController {
  async dashboardData(req, res) {
    try {
      const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || "");
      const date = dateOk ? req.query.date : toJakartaDateString();
      const nextDate = addDaysJakarta(date, 1);

      const rangeStart = `${date} 07:00:00`;
      const b1 = `${date} 15:00:00`; // batas shift 1/2
      const b2 = `${date} 23:00:00`; // batas shift 2/3
      const rangeEnd = `${nextDate} 07:00:00`;

      // CASE WHEN buat ngelompokin timestamp ke shift 1/2/3
      const shiftCase = (col) =>
        `CASE WHEN ${col} < ? THEN 1 WHEN ${col} < ? THEN 2 ELSE 3 END`;

      // Timestamp "aktual" tiap sesi buat sorting & shift — dipakai bareng
      // buat activity feed maupun tag shift-nya (biar konsisten).
      const activityTimestampExpr = `GREATEST(
             COALESCE(t.waktu_diterima, t.created_at),
             COALESCE(t.waktu_selesai, t.created_at),
             COALESCE(t.waktu_mulai, t.created_at),
             t.created_at
           )`;
      // Shift dihitung dari JAM-nya aja (bukan dibandingin ke tanggal yang
      // dipilih di filter), soalnya activity feed nampilin 15 aktivitas
      // terakhir yang bisa aja beda tanggal sama filter date-nya.
      const shiftCaseByTime = (expr) =>
        `CASE WHEN TIME(${expr}) >= '07:00:00' AND TIME(${expr}) < '15:00:00' THEN 1
              WHEN TIME(${expr}) >= '15:00:00' AND TIME(${expr}) < '23:00:00' THEN 2
              ELSE 3 END`;

      const [
        [isiKirimRows],
        [isiTerimaRows],
        [kosongKirimRows],
        [kosongTerimaRows],
        [selesaiRows],
        [prosesRows],
        [activityRows],
        [isiKirimLokasiRows],
        [isiTerimaLokasiRows],
        [tripPerKendaraanRows],
      ] = await Promise.all([
        // Rak isi DIKIRIM per shift — dari waktu tiap rak discan pas kirim.
        // Sesi yang udah 'batal' gak dihitung (batal = gak jadi dikirim).
        poolUtama.query(
          `SELECT ${shiftCase("d.waktu_scan")} as shift, COUNT(*) as jumlah
           FROM transfer_rak_details d
           JOIN transfer_raks t ON d.transfer_rak_id = t.id
           WHERE t.tipe = 'transfer' AND t.status != 'batal'
             AND d.waktu_scan >= ? AND d.waktu_scan < ?
           GROUP BY shift`,
          [b1, b2, rangeStart, rangeEnd],
        ),
        // Rak isi DITERIMA per shift — dari waktu tiap rak discan pas terima
        poolUtama.query(
          `SELECT ${shiftCase("d.waktu_diterima")} as shift, COUNT(*) as jumlah
           FROM transfer_rak_details d
           JOIN transfer_raks t ON d.transfer_rak_id = t.id
           WHERE t.tipe = 'transfer' AND t.status != 'batal'
             AND d.waktu_diterima >= ? AND d.waktu_diterima < ?
           GROUP BY shift`,
          [b1, b2, rangeStart, rangeEnd],
        ),
        // Rak/palet kosong DIKIRIM per shift (rak & palet dihitung terpisah)
        poolUtama.query(
          `SELECT ${shiftCase("t.waktu_mulai")} as shift,
                  COALESCE(SUM(t.jumlah_rak_kosong),0) as jumlah_rak,
                  COALESCE(SUM(t.jumlah_palet_kosong),0) as jumlah_palet
           FROM transfer_raks t
           WHERE t.tipe = 'rak_kosong' AND t.status != 'batal'
             AND t.waktu_mulai >= ? AND t.waktu_mulai < ?
           GROUP BY shift`,
          [b1, b2, rangeStart, rangeEnd],
        ),
        // Rak/palet kosong DITERIMA per shift (rak & palet dihitung terpisah)
        poolUtama.query(
          `SELECT ${shiftCase("t.waktu_diterima")} as shift,
                  COALESCE(SUM(t.jumlah_rak_kosong),0) as jumlah_rak,
                  COALESCE(SUM(t.jumlah_palet_kosong),0) as jumlah_palet
           FROM transfer_raks t
           WHERE t.tipe = 'rak_kosong' AND t.status != 'batal'
             AND t.waktu_diterima >= ? AND t.waktu_diterima < ?
           GROUP BY shift`,
          [b1, b2, rangeStart, rangeEnd],
        ),
        // Transfer Selesai per shift = 1 sesi (kirim+terima) dihitung SEKALI,
        // pas trip itu beneran kelar (waktu_diterima), bukan didobelin kirim & terima.
        poolUtama.query(
          `SELECT ${shiftCase("t.waktu_diterima")} as shift, COUNT(*) as jumlah
           FROM transfer_raks t
           WHERE t.status = 'diterima' AND t.waktu_diterima >= ? AND t.waktu_diterima < ?
           GROUP BY shift`,
          [b1, b2, rangeStart, rangeEnd],
        ),
        // Sedang PROSES/DIKIRIM — live, per kendaraan, gak terikat tanggal
        // filter (mobil yang lagi jalan ya lagi jalan, gak peduli lagi liat
        // dashboard tanggal berapa). 'selesai' ikut dihitung karena artinya
        // proses kirim (loading) udah kelar tapi mobilnya masih di jalan,
        // belum discan diterima di tujuan.
        poolUtama.query(
          `SELECT t.id_mobil, COALESCE(v.nama_kendaraan, '-') as mobil, t.status,
                  d.nama_karyawan as supir,
                  t.tipe,
                  CASE WHEN t.tipe = 'rak_kosong' THEN t.jumlah_rak_kosong ELSE t.total_rak END as total_rak,
                  COALESCE(t.jumlah_palet_kosong, 0) as total_palet,
                  t.waktu_mulai
           FROM transfer_raks t
           LEFT JOIN vehicles v ON t.id_mobil = v.id
           LEFT JOIN drivers d ON t.id_supir = d.id
           WHERE t.status IN ('proses', 'selesai')
           ORDER BY t.waktu_mulai ASC`,
        ),
        // Aktivitas terbaru — diurutin dari timestamp AKTUAL terbaru (bukan
        // cuma updated_at, yang gak selalu ke-update tiap ada scan rak baru).
        // Sesi 'batal' gak ditampilin karena bukan aktivitas beneran (batal kirim).
        // Ikut ambil nomor shift-nya biar bisa dikelompokin per shift di FE.
        poolUtama.query(
          `SELECT t.*, ek.name as nama_karyawan, ep.name as nama_penerima,
                  d.nama_karyawan as nama_supir, v.nama_kendaraan as nama_kendaraan,
                  ${shiftCaseByTime(activityTimestampExpr)} as shift_num
           FROM transfer_raks t
           LEFT JOIN employees ek ON t.id_karyawan = ek.id
           LEFT JOIN employees ep ON t.id_karyawan_penerima = ep.id
           LEFT JOIN drivers d ON t.id_supir = d.id
           LEFT JOIN vehicles v ON t.id_mobil = v.id
           WHERE t.status != 'batal'
           ORDER BY (CASE WHEN t.status IN ('diterima','sebagian') THEN 1 ELSE 0 END),
                    ${activityTimestampExpr} DESC
           LIMIT 15`,
        ),
        // Rak isi DIKIRIM per shift, dipecah per lokasi asal (Plan I/B/H/dst)
        poolUtama.query(
          `SELECT ${shiftCase("d.waktu_scan")} as shift,
                  COALESCE(d.lokasi_asal, t.lokasi_asal, '-') as lokasi,
                  COUNT(*) as jumlah
           FROM transfer_rak_details d
           JOIN transfer_raks t ON d.transfer_rak_id = t.id
           WHERE t.tipe = 'transfer' AND t.status != 'batal'
             AND d.waktu_scan >= ? AND d.waktu_scan < ?
           GROUP BY shift, lokasi`,
          [b1, b2, rangeStart, rangeEnd],
        ),
        // Rak isi DITERIMA per shift, dipecah per lokasi tujuan (BPW1/2/3/dst)
        poolUtama.query(
          `SELECT ${shiftCase("d.waktu_diterima")} as shift,
                  COALESCE(t.lokasi_tujuan, '-') as lokasi,
                  COUNT(*) as jumlah
           FROM transfer_rak_details d
           JOIN transfer_raks t ON d.transfer_rak_id = t.id
           WHERE t.tipe = 'transfer' AND t.status != 'batal'
             AND d.waktu_diterima >= ? AND d.waktu_diterima < ?
           GROUP BY shift, lokasi`,
          [b1, b2, rangeStart, rangeEnd],
        ),
        // Transfer SELESAI (diterima) per kendaraan & per shift buat tanggal
        // yang dipilih — biar keliatan "mobil ini udah berapa trip di shift mana".
        poolUtama.query(
          `SELECT t.id_mobil, COALESCE(v.nama_kendaraan, '-') as mobil,
                  ${shiftCase("t.waktu_diterima")} as shift,
                  COUNT(*) as jumlah
           FROM transfer_raks t
           LEFT JOIN vehicles v ON t.id_mobil = v.id
           WHERE t.status = 'diterima' AND t.waktu_diterima >= ? AND t.waktu_diterima < ?
           GROUP BY t.id_mobil, mobil, shift
           ORDER BY mobil ASC`,
          [b1, b2, rangeStart, rangeEnd],
        ),
      ]);

      const toShiftMap = (rows) => {
        const map = { 1: 0, 2: 0, 3: 0 };
        for (const r of rows) map[Number(r.shift)] = Number(r.jumlah) || 0;
        return map;
      };
      // Kosong (rak_kosong) punya 2 kolom terpisah: jumlah_rak & jumlah_palet
      const toShiftMapKosong = (rows) => {
        const rak = { 1: 0, 2: 0, 3: 0 };
        const palet = { 1: 0, 2: 0, 3: 0 };
        for (const r of rows) {
          rak[Number(r.shift)] = Number(r.jumlah_rak) || 0;
          palet[Number(r.shift)] = Number(r.jumlah_palet) || 0;
        }
        return { rak, palet };
      };

      const isiKirimMap = toShiftMap(isiKirimRows);
      const isiTerimaMap = toShiftMap(isiTerimaRows);
      const kosongKirim = toShiftMapKosong(kosongKirimRows);
      const kosongTerima = toShiftMapKosong(kosongTerimaRows);
      const selesaiMap = toShiftMap(selesaiRows);

      // Breakdown per lokasi (mis. "Plan I: 5, Plan B: 3, Plan H: 2" buat
      // dikirim, "Gudang BPW 1: 4, Gudang BPW 2: 3" buat diterima), dikelompokin
      // per shift dulu biar gampang di-lookup pas nyusun array `shifts`.
      const toShiftLokasiMap = (rows) => {
        const map = { 1: [], 2: [], 3: [] };
        for (const r of rows) {
          const shift = Number(r.shift);
          map[shift].push({ lokasi: r.lokasi, jumlah: Number(r.jumlah) || 0 });
        }
        for (const s of [1, 2, 3]) {
          map[s].sort((a, b) => b.jumlah - a.jumlah);
        }
        return map;
      };

      const isiKirimLokasiMap = toShiftLokasiMap(isiKirimLokasiRows);
      const isiTerimaLokasiMap = toShiftLokasiMap(isiTerimaLokasiRows);

      const SHIFT_LABEL = {
        1: "Shift 1 (07:00–15:00)",
        2: "Shift 2 (15:00–23:00)",
        3: "Shift 3 (23:00–07:00)",
      };

      const shifts = [1, 2, 3].map((s) => ({
        shift: s,
        label: SHIFT_LABEL[s],
        rak_isi_dikirim: isiKirimMap[s],
        rak_isi_diterima: isiTerimaMap[s],
        rak_kosong_dikirim: kosongKirim.rak[s],
        rak_kosong_diterima: kosongTerima.rak[s],
        palet_kosong_dikirim: kosongKirim.palet[s],
        palet_kosong_diterima: kosongTerima.palet[s],
        transfer_selesai: selesaiMap[s],
        breakdown_kirim: isiKirimLokasiMap[s],
        breakdown_terima: isiTerimaLokasiMap[s],
      }));

      const totalHariIni = shifts.reduce(
        (acc, s) => ({
          rak_isi_dikirim: acc.rak_isi_dikirim + s.rak_isi_dikirim,
          rak_isi_diterima: acc.rak_isi_diterima + s.rak_isi_diterima,
          rak_kosong_dikirim: acc.rak_kosong_dikirim + s.rak_kosong_dikirim,
          rak_kosong_diterima: acc.rak_kosong_diterima + s.rak_kosong_diterima,
          palet_kosong_dikirim:
            acc.palet_kosong_dikirim + s.palet_kosong_dikirim,
          palet_kosong_diterima:
            acc.palet_kosong_diterima + s.palet_kosong_diterima,
          transfer_selesai: acc.transfer_selesai + s.transfer_selesai,
        }),
        {
          rak_isi_dikirim: 0,
          rak_isi_diterima: 0,
          rak_kosong_dikirim: 0,
          rak_kosong_diterima: 0,
          palet_kosong_dikirim: 0,
          palet_kosong_diterima: 0,
          transfer_selesai: 0,
        },
      );

      const sedangProsesDetail = prosesRows.map((r) => ({
        mobil: r.mobil,
        supir: r.supir || "-",
        tipe: r.tipe,
        status: r.status,
        total_rak: Number(r.total_rak) || 0,
        total_palet: Number(r.total_palet) || 0,
        sejak: r.waktu_mulai ? toTimeShort(r.waktu_mulai) : "-",
      }));
      const sedangProses = sedangProsesDetail.length;

      // Activity feed: perlu detail per-transfer buat pengirim/penerima multi-operator
      const activity = [];
      for (const t of activityRows) {
        let senders = await TransferRakDetailModel.distinctPengirimNames(t.id);
        if (!senders.length) senders = t.nama_karyawan ? [t.nama_karyawan] : [];
        let receivers = await TransferRakDetailModel.distinctPenerimaNames(
          t.id,
        );
        if (!receivers.length)
          receivers = t.nama_penerima ? [t.nama_penerima] : [];

        activity.push({
          tipe: t.tipe,
          operator_kirim: senders.length ? senders.join(", ") : "-",
          operator_terima: receivers.length ? receivers.join(", ") : "-",
          supir: t.nama_supir || "-",
          mobil: t.nama_kendaraan || "-",
          total_rak:
            t.tipe === "rak_kosong" ? t.jumlah_rak_kosong : t.total_rak,
          total_palet: t.jumlah_palet_kosong,
          status: t.status,
          shift: Number(t.shift_num),
          jam_kirim: t.waktu_mulai ? toTimeShort(t.waktu_mulai) : "-",
          jam_terima: t.waktu_diterima ? toTimeShort(t.waktu_diterima) : "-",
          tgl: formatDateShort(t.created_at),
        });
      }

      const tripMap = {};
      for (const r of tripPerKendaraanRows) {
        if (!tripMap[r.id_mobil]) {
          tripMap[r.id_mobil] = {
            mobil: r.mobil,
            total: 0,
            per_shift: { 1: 0, 2: 0, 3: 0 },
          };
        }
        const jml = Number(r.jumlah) || 0;
        tripMap[r.id_mobil].total += jml;
        tripMap[r.id_mobil].per_shift[Number(r.shift)] = jml;
      }
      const tripPerKendaraan = Object.values(tripMap).sort(
        (a, b) => b.total - a.total,
      );

      return response.success(res, {
        date,
        shifts,
        total_hari_ini: totalHariIni,
        sedang_proses: sedangProses,
        sedang_proses_detail: sedangProsesDetail,
        trip_per_kendaraan: tripPerKendaraan,
        activity,
      });
    } catch (err) {
      return response.error(res, err.message);
    }
  }
}

module.exports = new DashboardController();
