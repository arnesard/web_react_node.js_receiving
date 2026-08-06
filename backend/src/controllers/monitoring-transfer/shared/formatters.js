// src/controllers/monitoring-transfer/shared/formatters.js
// Helper format tanggal/jam (equivalen Carbon ->format()) — dipakai bareng
// oleh InputController dan DashboardController modul monitoring-transfer,
// jadi ditaruh di sini biar gak duplikat.

function toTimeString(value) {
  if (!value) return "-";
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  });
}

function toTimeShort(value) {
  if (!value) return "-";
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  });
}

function formatDateTime(value) {
  if (!value) return "-";
  const d = value instanceof Date ? value : new Date(value);
  const tgl = d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
  return `${tgl} ${toTimeShort(d)}`;
}

function formatDateShort(value) {
  if (!value) return "-";
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

function diffMinutes(start, end) {
  if (!start || !end) return null;
  const s = start instanceof Date ? start : new Date(start);
  const e = end instanceof Date ? end : new Date(end);
  return Math.round((e.getTime() - s.getTime()) / 60000);
}

module.exports = {
  toTimeString,
  toTimeShort,
  formatDateTime,
  formatDateShort,
  diffMinutes,
};
