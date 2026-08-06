// src/services/crossDockingClient.js
// Klien HTTP ke API web "Monitoring Stock Cross Docking" (project FGINVC),
// sistem terpisah yang datanya CUMA bisa diakses lewat REST API + login
// (beda dari poolEdp yang konek langsung ke database).
//
// Tokennya di-cache di memory proses backend ini (login sekali, dipake
// ulang buat semua request sampai ditolak/expired), bukan per-user —
// soalnya yang login ke Cross Docking API itu "akun servis" milik
// aplikasi Karawang ini, bukan akun operator yang lagi buka web Karawang.

const BASE_URL =
  process.env.CROSS_DOCKING_API_BASE_URL || "http://10.129.42.85:4000/api";
const USERNAME = process.env.CROSS_DOCKING_USERNAME;
const PASSWORD = process.env.CROSS_DOCKING_PASSWORD;

let cachedToken = null;
// Nampung promise login yang lagi jalan, biar kalau banyak request
// nyampe bersamaan pas token belum ada, cuma 1 kali login yang beneran
// dieksekusi (yang lain numpang nunggu promise yang sama).
let loginPromise = null;

async function login() {
  if (!USERNAME || !PASSWORD) {
    throw new Error(
      "CROSS_DOCKING_USERNAME / CROSS_DOCKING_PASSWORD belum diisi di .env backend",
    );
  }
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(`Login ke Cross Docking API gagal (HTTP ${res.status})`);
  }
  const data = await res.json();
  if (!data?.token) {
    throw new Error(
      "Login ke Cross Docking API gagal: response tidak mengandung token",
    );
  }
  cachedToken = data.token;
  return cachedToken;
}

async function getToken() {
  if (cachedToken) return cachedToken;
  if (!loginPromise) {
    loginPromise = login().finally(() => {
      loginPromise = null;
    });
  }
  return loginPromise;
}

// GET ke path relatif (mis. "/stock-cd/summary") dengan query params dari
// object `params` (key yang undefined/null/"" otomatis dibuang). Login
// otomatis kalau belum ada token, dan re-login sekali kalau token ditolak
// (401 → biasanya artinya token expired di sisi Cross Docking).
async function request(path, params = {}, { retry = true } = {}) {
  const token = await getToken();

  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, value);
    }
  });
  const url = `${BASE_URL}${path}${query.toString() ? `?${query}` : ""}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401 && retry) {
    cachedToken = null;
    return request(path, params, { retry: false });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Cross Docking API ${path} gagal (HTTP ${res.status}): ${text.slice(0, 200)}`,
    );
  }

  return res.json();
}

// Samain bentuk filter dari query controller ke params yang dipahami API
// Cross Docking (lihat stockFilterParams di client.ts project itu).
function buildFilterParams(filters = {}) {
  const {
    item,
    rackcode,
    barcode,
    weekFrom,
    weekTo,
    filterMode,
    detail,
    holdDepts,
  } = filters;
  return {
    item,
    rackcode,
    barcode,
    weekFrom,
    weekTo,
    filterMode: filterMode || "all",
    detail: detail ? "true" : undefined,
    holdDepts:
      Array.isArray(holdDepts) && holdDepts.length
        ? holdDepts.join(",")
        : undefined,
  };
}

class CrossDockingClient {
  // viewMode: "byRack" | "byItem"
  static async fetchSummary(viewMode, filters) {
    return request("/stock-cd/summary", {
      viewMode,
      ...buildFilterParams(filters),
    });
  }

  static async fetchTotals(filters) {
    return request("/stock-cd/totals", buildFilterParams(filters));
  }

  static async fetchDetailAll(filters) {
    return request("/stock-cd/detail-all", buildFilterParams(filters));
  }
}

module.exports = CrossDockingClient;
