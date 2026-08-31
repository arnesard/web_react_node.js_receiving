// src/utils/date.js
// Helper tanggal yang SELALU pakai zona waktu Asia/Jakarta (WIB, UTC+7),
// gak peduli timezone OS server-nya apa. Dipakai buat ganti pola lama
// `new Date().toISOString().split("T")[0]` yang sebenarnya UTC, bukan WIB.

const TZ = "Asia/Jakarta";

/**
 * Format sebuah Date/string/angka jadi "YYYY-MM-DD" menurut jam Jakarta.
 * Kalau argumen kosong, pakai waktu sekarang.
 */
function toJakartaDateString(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  // en-CA locale formatnya persis YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Tanggal hari ini (WIB) dalam format "YYYY-MM-DD". */
function todayJakarta() {
  return toJakartaDateString(new Date());
}

/** Tambah/kurang N hari dari sebuah tanggal "YYYY-MM-DD", hasil tetap dalam WIB. */
function addDaysJakarta(dateStr, days) {
  // Dibuat sebagai UTC-noon dulu supaya pergeseran hari gak kena masalah
  // DST/offset saat setDate() dipanggil.
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return toJakartaDateString(d);
}

/** Jam sekarang (0-23) menurut WIB — dipakai buat penentuan shift, dll. */
function currentHourJakarta() {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ,
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );
}

/**
 * Titik cutoff "hari ini jam 12:00 WIB" sebagai Date (instant absolut,
 * gak peduli timezone OS server) — dipakai buat nentuin barang yang
 * last_update-nya sesudah jam segini hari ini dianggap "Barang Karantina"
 * (belum resmi masuk stok gudang), bukan bagian dari target stok yang wajib
 * discan operator. Cutoff-nya SELALU jam 12:00 di HARI INI (WIB), bukan
 * rolling 24 jam — jadi tiap ganti hari, cutoff-nya otomatis ikut geser ke
 * tanggal baru jam 12:00 WIB juga.
 */
function quarantineCutoffToday() {
  return new Date(`${todayJakarta()}T12:00:00+07:00`);
}

/**
 * Umur dalam HARI dari sebuah timestamp (mis. field `lastupdated` dari
 * Cross Docking) sampai SEKARANG — dipakai buat kolom "Age KRW" (berapa
 * lama item itu udah ada di Karawang menurut lastupdate-nya). Dihitung
 * dari selisih instant absolut (bukan selisih tanggal kalender WIB),
 * dibulatkan ke bawah: lastupdate 29/08 19:00:59 vs sekarang 31/08
 * 19:00:59 = 2 hari persis. Balikin null kalau tanggalnya gak valid/kosong.
 */
function daysSinceJakarta(dateInput) {
  if (!dateInput) return null;
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;
  const diffMs = Date.now() - d.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

module.exports = {
  toJakartaDateString,
  todayJakarta,
  addDaysJakarta,
  currentHourJakarta,
  quarantineCutoffToday,
  daysSinceJakarta,
};
