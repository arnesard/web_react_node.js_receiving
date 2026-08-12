// src/config/database.js
const mysql = require("mysql2/promise");

// Offset waktu Jakarta (WIB = UTC+7), dipakai buat konsistensi
// antara Node.js dan session MySQL.
const JAKARTA_OFFSET = "+07:00";

// Koneksi utama — kayak connection 'mysql' di Laravel
const poolUtama = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  waitForConnections: true,
  connectionLimit: 10,
  // Biar kolom DATE/DATETIME di-convert mysql2 pakai acuan WIB,
  // bukan UTC atau timezone lokal server.
  timezone: JAKARTA_OFFSET,
});

// Koneksi kedua — kayak connection 'so_karantina' di Laravel
const poolKarantina = mysql.createPool({
  host: process.env.DB_KARANTINA_HOST,
  database: process.env.DB_KARANTINA_NAME,
  user: process.env.DB_KARANTINA_USER,
  password: process.env.DB_KARANTINA_PASS,
  connectionLimit: 5,
  timezone: JAKARTA_OFFSET,
});

// Koneksi ketiga — DB tim EDP (session "DB-PANDU", database `fginvc`),
// dipakai modul Transfer Rak buat verifikasi kode rak → item & qty pas
// operator scan. Server ini kemungkinan pakai charset latin1 (lihat
// collation `latin1_swedish_ci` di tabel `rack`), jadi charset di-set
// eksplisit biar nama item gak mojibake.
const poolEdp = mysql.createPool({
  host: process.env.DB_EDP_HOST,
  port: process.env.DB_EDP_PORT,
  database: process.env.DB_EDP_NAME,
  user: process.env.DB_EDP_USER,
  password: process.env.DB_EDP_PASS,
  waitForConnections: true,
  connectionLimit: 5,
  charset: "latin1",
});

// Koneksi keempat — DB "Monitoring Stock Cross Docking" (server EDP juga,
// tapi instance/db terpisah: `fginvc_cd`), dipakai modul Control FIFO buat
// Search Barcode. Sebelumnya cuma bisa lewat REST API (login + HTTP round
// trip ke tiap request, lihat services/crossDockingClient.js) — connect
// LANGSUNG ke DB-nya jauh lebih cepat buat query 1 barcode kayak gini.
const poolCrossDocking = mysql.createPool({
  host: process.env.DB_CD_HOST,
  port: process.env.DB_CD_PORT,
  database: process.env.DB_CD_NAME,
  user: process.env.DB_CD_USER,
  password: process.env.DB_CD_PASS,
  waitForConnections: true,
  connectionLimit: 5,
});

// Set session time_zone di setiap koneksi baru yang dibuka pool,
// supaya fungsi MySQL seperti CURDATE(), NOW(), CURTIME() juga
// menghitung "sekarang" versi WIB — bukan timezone default server MySQL.
function applySessionTimezone(pool) {
  pool.on("connection", (connection) => {
    connection.query(`SET time_zone = '${JAKARTA_OFFSET}'`);
  });
}
applySessionTimezone(poolUtama);
applySessionTimezone(poolKarantina);
applySessionTimezone(poolCrossDocking);

module.exports = { poolUtama, poolKarantina, poolEdp, poolCrossDocking };
