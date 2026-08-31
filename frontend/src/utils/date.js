// src/utils/date.js
// Helper tanggal yang SELALU pakai zona waktu Asia/Jakarta (WIB, UTC+7),
// gak peduli timezone perangkat/browser user-nya di-set apa. Dipakai
// buat ganti pola lama `new Date().toISOString().split("T")[0]` yang
// sebenarnya UTC, bukan WIB.

const TZ = "Asia/Jakarta";

/**
 * Format sebuah Date/string/angka jadi "YYYY-MM-DD" menurut jam Jakarta.
 * Kalau argumen kosong, pakai waktu sekarang.
 */
export function toJakartaDateString(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) {
    console.warn("[date.js] toJakartaDateString: invalid date input ->", date);
    return "";
  }
  // NOTE: sebelumnya pakai Intl.DateTimeFormat("en-CA", ...) dan berharap
  // hasilnya otomatis format ISO "YYYY-MM-DD". Ternyata di sebagian PC
  // (locale/ICU data beda), locale "en-CA" fallback ke format US
  // "M/D/YYYY" tanpa error apapun -> bikin string tanggal salah format,
  // lalu meledak (RangeError: Invalid time value) begitu dipakai lagi di
  // addDaysJakarta. Makanya di sini kita susun manual dari formatToParts
  // biar hasilnya PASTI "YYYY-MM-DD" di browser/PC manapun.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.year}-${map.month}-${map.day}`;
}

/** Tanggal hari ini (WIB) dalam format "YYYY-MM-DD". */
export function todayJakarta() {
  return toJakartaDateString(new Date());
}

/** Tambah/kurang N hari dari sebuah tanggal "YYYY-MM-DD", hasil tetap dalam WIB. */
export function addDaysJakarta(dateStr, days) {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return toJakartaDateString(d);
}

/** Format tanggal ke label Indonesia (mis. "22 Jul 2026"), timezone WIB. */
export function formatDateID(date, options = {}) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString("id-ID", { timeZone: TZ, ...options });
}
