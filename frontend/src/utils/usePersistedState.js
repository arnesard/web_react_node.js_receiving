// src/utils/usePersistedState.js
// React Router unmount total komponen tiap pindah route (Monitoring <->
// Dashboard <-> Laporan <-> Pengaturan), jadi semua useState biasa otomatis
// balik ke nilai awal tiap operator pindah tab terus balik lagi ke Monitoring.
// Hook ini nyimpen state ke sessionStorage tiap berubah, dan baca balik pas
// komponen mount ulang — jadi form/sesi kirim/terima yang lagi jalan tetap
// "stay" walaupun sempet ninggalin halaman.
//
// sessionStorage dipilih (bukan localStorage) biar otomatis kebersihin kalau
// tab/browser beneran ditutup — gak numpuk data lama selamanya.
import { useState, useEffect } from "react";

const PREFIX = "tr_monitoring:";

export function usePersistedState(key, initialValue) {
  const storageKey = PREFIX + key;

  const [value, setValue] = useState(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      return raw !== null ? JSON.parse(raw) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // storage penuh/disabled — abaikan, form tetap jalan normal cuma gak persist
    }
  }, [storageKey, value]);

  return [value, setValue];
}
