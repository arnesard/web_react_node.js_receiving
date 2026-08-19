-- Histori "Tire Trip Plan" (Transfer Plan DC Karawang).
-- Setiap kali user klik "Simpan Trip Plan" di halaman Transfer Plan, tiap
-- item di tiap trip dicatat sebagai 1 baris di sini (no_trip yang sama
-- diulang tiap baris item-nya — sengaja didenormalisasi, cuma buat nyimpen
-- histori, bukan transaksi kompleks).
--
-- JALANIN INI SEKALI di database poolUtama (yang sama dipakai tabel
-- stok_opname_karawang_scan dkk).
--
-- NOTE kalau sebelumnya sempet jalanin versi lama yang ada kolom
-- id_karyawan / tabel _trip_plan_item, bersihin dulu:
--   DROP TABLE IF EXISTS stok_opname_karawang_trip_plan_item;
--   DROP TABLE IF EXISTS stok_opname_karawang_trip_plan;

CREATE TABLE IF NOT EXISTS stok_opname_karawang_trip_plan (
  id INT AUTO_INCREMENT PRIMARY KEY,
  no_trip VARCHAR(30) NOT NULL,
  tanggal DATE NOT NULL,
  kapasitas DECIMAL(10,2) NOT NULL DEFAULT 0,
  item VARCHAR(30) NOT NULL,
  deskripsi VARCHAR(150) NULL,
  qty INT NOT NULL DEFAULT 0,
  volume DECIMAL(10,3) NOT NULL DEFAULT 0,
  total_volume DECIMAL(15,3) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ttp_tanggal (tanggal),
  KEY idx_ttp_no_trip (no_trip)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
