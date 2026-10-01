-- Modul "Barcode Tube" (Scan Collie / Receive / Transfer / Monitoring).
-- JALANIN SEKALI di database poolUtama (sama dengan tabel stok_opname_karawang_*).

-- 1) Log Scan Collie dari penerimaan produksi. Status PENDING sampai di-approve
--    lewat menu Receive; begitu APPROVED, qty-nya masuk ke tube_barcode_stock.
CREATE TABLE IF NOT EXISTS tube_barcode_scan (
  id INT AUTO_INCREMENT PRIMARY KEY,
  operator_id VARCHAR(30) NOT NULL,
  operator_name VARCHAR(100) NOT NULL,
  rack_code VARCHAR(40) NOT NULL,
  collie VARCHAR(60) NOT NULL,
  item VARCHAR(30) NOT NULL,
  qty INT NOT NULL,
  sn CHAR(4) NOT NULL COMMENT 'YYWW, mis. 2639 = tahun 26 minggu 39',
  status ENUM('PENDING','APPROVED') NOT NULL DEFAULT 'PENDING',
  scanned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_by_id VARCHAR(30) NULL,
  approved_by_name VARCHAR(100) NULL,
  approved_at DATETIME NULL,
  KEY idx_rack_status (rack_code, status),
  KEY idx_collie (collie)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2) Stok berjalan per rak + collie + item + SN (qty bisa nambah/kurang
--    lewat Receive-approve dan Transfer).
CREATE TABLE IF NOT EXISTS tube_barcode_stock (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rack_code VARCHAR(40) NOT NULL,
  collie VARCHAR(60) NOT NULL,
  item VARCHAR(30) NOT NULL,
  sn CHAR(4) NOT NULL,
  qty INT NOT NULL DEFAULT 0,
  source ENUM('SCAN','TRANSFER') NOT NULL DEFAULT 'SCAN',
  scan_by_id VARCHAR(30) NULL,
  scan_by_name VARCHAR(100) NULL,
  scan_at DATETIME NULL,
  approve_by_id VARCHAR(30) NULL,
  approve_by_name VARCHAR(100) NULL,
  approve_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_rack_collie_item_sn (rack_code, collie, item, sn),
  KEY idx_collie (collie),
  KEY idx_item (item)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3) Log transfer. Proses 1 = KURANG dari rak asal, proses 2 = TAMBAH ke
--    rak/collie baru (ref_id nunjuk ke baris KURANG-nya). tire_collie/
--    tire_item diisi kalau tube digabung ke tire (divalidasi ke master
--    stok_opname_karawang_tire_tube_pairing).
CREATE TABLE IF NOT EXISTS tube_barcode_transfer (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ref_id INT NULL,
  type ENUM('KURANG','TAMBAH') NOT NULL,
  pic_id VARCHAR(30) NOT NULL,
  pic_name VARCHAR(100) NOT NULL,
  rack_code VARCHAR(40) NOT NULL,
  collie VARCHAR(60) NOT NULL,
  item VARCHAR(30) NOT NULL,
  sn CHAR(4) NOT NULL,
  qty INT NOT NULL,
  tire_collie VARCHAR(60) NULL,
  tire_item VARCHAR(30) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ref (ref_id),
  KEY idx_rack (rack_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
