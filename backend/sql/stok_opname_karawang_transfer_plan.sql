-- Tabel histori "Transfer Plan" (Tangerang -> Karawang) & "Retur"
-- (Karawang -> Tangerang). Langsung tercatat pas diinput, TANPA alur
-- approval — kalau salah input, dihapus aja lewat tombol "Hapus" di UI
-- (DELETE /transfer-plan/:id).
--
-- JALANIN INI SEKALI di database poolUtama (yang sama dipakai tabel
-- stok_opname_karawang_scan dkk).
CREATE TABLE IF NOT EXISTS stok_opname_karawang_transfer_plan (
  id INT AUTO_INCREMENT PRIMARY KEY,
  jenis ENUM('TRANSFER', 'RETUR') NOT NULL,
  item VARCHAR(30) NOT NULL,
  -- Snapshot deskripsi item pas dicatat (dari EDP itemcatalog) — disimpen
  -- di sini juga (bukan cuma di-join tiap nampilin) biar histori lama
  -- tetap kebaca apa adanya walau deskripsi di EDP berubah/dihapus nanti.
  deskripsi VARCHAR(150) NULL,
  qty INT NOT NULL,
  keterangan VARCHAR(255) NULL,
  id_karyawan INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_tp_jenis (jenis),
  KEY idx_tp_item (item),
  KEY idx_tp_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
