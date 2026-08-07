// src/utils/apiField.js
// Ambil field dari row API luar (yang gak kita kontrol bentuknya) biarpun
// gak yakin persis casing/pemisahnya (rackcode / RACKCODE / rackCode,
// bc_collie / bcCollie / BcCollie / bccollie). Dipake bareng oleh fitur
// Cross Docking Monitoring dan verifikasi scan Karawang, biar konsisten.
function getField(row, key) {
  if (!row) return undefined;
  const camel = key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
  const pascal = camel.charAt(0).toUpperCase() + camel.slice(1);
  const candidates = [key, key.toUpperCase(), key.toLowerCase(), camel, pascal];
  for (const candidate of candidates) {
    if (row[candidate] !== undefined) return row[candidate];
  }
  const normalizedTarget = key.replace(/_/g, "").toLowerCase();
  const foundKey = Object.keys(row).find(
    (k) => k.replace(/_/g, "").toLowerCase() === normalizedTarget,
  );
  return foundKey !== undefined ? row[foundKey] : undefined;
}

module.exports = { getField };
