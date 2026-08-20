-- Master pasangan Tire (tubetype) <-> Tube, dipakai fitur Transfer Plan DC
-- Karawang: pas tire masuk ke Trip, tube pasangannya otomatis ikut
-- ditambahin ke trip yang sama (qty 1:1).
--
-- Sumber data: file "Panduan Setting Tire Tubetype dengan Tube" (BPW-F-63).
-- Satu TUBE code bisa dipasangin ke banyak TIRE code (beda customer/varian),
-- tapi satu TIRE code cuma boleh punya SATU TUBE pasangan -> makanya
-- tire_code dibuat UNIQUE (upload ulang / import ulang tinggal upsert by
-- tire_code, lihat KarawangTireTubePairingModel.bulkUpsert).
--
-- JALANIN INI SEKALI di database poolUtama (yang sama dipakai tabel
-- stok_opname_karawang_scan dkk).
CREATE TABLE IF NOT EXISTS stok_opname_karawang_tire_tube_pairing (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tire_code VARCHAR(30) NOT NULL,
  tire_description VARCHAR(150) NULL,
  tube_code VARCHAR(30) NOT NULL,
  tube_description VARCHAR(150) NULL,
  customer VARCHAR(60) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_tire_code (tire_code),
  KEY idx_tube_code (tube_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
