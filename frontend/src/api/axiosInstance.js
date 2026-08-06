// src/api/axiosInstance.js
// Equivalen: base URL axios — dipake di semua halaman
import axios from "axios";

// Pas production build (npm run build), frontend & backend disatuin di
// server yang sama → cukup path relatif "/api", otomatis ikut IP/domain
// server manapun tanpa perlu diubah-ubah lagi.
// Pas dev (npm run dev, port 5173), backend-nya kepisah proses/port,
// jadi masih perlu alamat eksplisit.
const api = axios.create({
  baseURL: import.meta.env.DEV ? "http://10.129.48.179:8098/api" : "/api",
});

export default api;
