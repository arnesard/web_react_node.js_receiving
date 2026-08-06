-- Migration buat modul Stok Opname DC Karawang.
-- File stok_opname_karawang.sql yang lama ketinggalan zaman (gak ada tabel
-- batch, gak ada kolom batch_id) padahal kode controller/model udah makai
-- itu semua. Jalanin file ini SEKALI di database poolUtama lo (HeidiSQL /
-- phpMyAdmin / dbeaver, dsb).
--
-- Kalau ada baris yang error "duplicate column" atau "table already
-- exists", berarti bagian itu memang udah ada di database lo — aman,
-- lanjut ke baris berikutnya aja.

-- 1) Tabel batch (1 batch = 1 sesi upload excel "Data Detail All Karawang")
CREATE TABLE IF NOT EXISTS stok_opname_karawang_batch (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama_batch VARCHAR(100) NOT NULL,
  nama_file VARCHAR(150) NULL,
  id_karyawan_upload INT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'aktif',
  total_item INT NOT NULL DEFAULT 0,
  total_collie INT NOT NULL DEFAULT 0,
  total_qty INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2) Kolom batch_id di tabel target & scan (biar data kepisah per batch)
ALTER TABLE stok_opname_karawang_target
  ADD COLUMN batch_id INT NOT NULL AFTER id,
  ADD KEY idx_batch_target (batch_id);

ALTER TABLE stok_opname_karawang_scan
  ADD COLUMN batch_id INT NOT NULL AFTER id,
  ADD KEY idx_batch_scan (batch_id);

-- 3) Kolom loccol di tabel scan — nyatet operator scan collie ini pas lagi
-- di lokasi mana (buat jejak/laporan).
ALTER TABLE stok_opname_karawang_scan
  ADD COLUMN loccol VARCHAR(30) NULL AFTER id_karyawan;

-- 4) Tabel lokasi (loccol -> rackcode), dari sheet "lokasi" di excel.
-- Dipakai validasi input lokasi operator + validasi rak yang discan
-- beneran bagian dari lokasi tsb.
CREATE TABLE IF NOT EXISTS stok_opname_karawang_lokasi (
  id INT AUTO_INCREMENT PRIMARY KEY,
  batch_id INT NOT NULL,
  loccol VARCHAR(30) NOT NULL,
  rackcode VARCHAR(30) NOT NULL,
  KEY idx_loccol (batch_id, loccol),
  KEY idx_rackcode_lokasi (batch_id, rackcode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Catatan: FK ke stok_opname_karawang_batch sengaja gak dipasang formal
-- (ON DELETE CASCADE) di migration ini karena UNIQUE KEY di collie
-- (uq_collie / uq_collie_scan) sifatnya global, bukan per-batch — kalau
-- mau di-cascade beneran, perlu ubah juga unique key-nya jadi
-- (batch_id, collie). Untuk sekarang KarawangBatchModel.deleteAll() yang
-- jalanin pembersihan manual tiap upload baru (lihat komentar di
-- KarawangController.uploadExcel).
