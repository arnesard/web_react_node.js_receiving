// src/api/fileUrl.js
// Bikin URL buat file yang di-upload (foto production, dll).
// Production (build): relatif ke origin yang sama, ikut server manapun.
// Dev (npm run dev): backend beda port, jadi perlu host eksplisit.
const FILE_BASE = import.meta.env.DEV ? "http://10.129.48.179:8098" : "";

export function fileUrl(path) {
  if (!path) return "";
  return `${FILE_BASE}/${path}`.replace(/([^:]\/)\/+/g, "$1");
}
