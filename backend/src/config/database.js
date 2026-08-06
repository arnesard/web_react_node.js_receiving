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

module.exports = { poolUtama, poolKarantina, poolEdp };
