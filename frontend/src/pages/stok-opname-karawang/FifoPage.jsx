// src/pages/stok-opname-karawang/FifoPage.jsx
// Modul "Control FIFO" (khusus DC Karawang / Cross Docking) — kebalikan
// dari Monitoring Stock Cross Docking biasa: input-nya ITEM (dicari dari
// KODE atau DESKRIPSI), hasilnya semua LOT tempat item itu berada,
// lengkap qty & jumlah rak per lot, diurut dari week paling tua ke
// paling muda (biar kebaca lot mana yang harus keluar duluan / FIFO).
//
// Satu komponen dipakai buat mobile & desktop sekaligus (pola yang sama
// kayak halaman lain di modul ini) — tabel di layar lebar, otomatis
// jadi list kartu di layar sempit (CSS-only, lihat fifoStyles di bawah).
import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import Swal from "sweetalert2";
import {
  Search,
  Loader2,
  MapPin,
  Boxes,
  Layers,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Barcode,
  X,
} from "lucide-react";
import api from "../../api/axiosInstance";
import { karawangStyles } from "./karawangStyles";

const FILTER_MODES = [
  { value: "all", label: "Semua" },
  { value: "hold", label: "Holds" },
  { value: "oe", label: "OE" },
];

// whsweek/curweek format "YYWW" — ditampilkan apa adanya (kode mentah),
// biar konsisten sama tampilan Cur Week di halaman Monitoring Cross
// Docking & modul Control Stock gudang utama.
function formatWeek(week) {
  if (!week || String(week).trim() === "") return "-";
  return String(week).trim();
}

export default function FifoPage() {
  const [keyword, setKeyword] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [activeItem, setActiveItem] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [filterMode, setFilterMode] = useState("all");
  const [error, setError] = useState("");
  // Baris lot yang lagi expanded (nampilin detail rak: kode, week, qty).
  // Isinya loccode, di-reset tiap kali hasil pencarian ganti.
  const [expandedLots, setExpandedLots] = useState(() => new Set());
  const debounceRef = useRef(null);
  const boxRef = useRef(null);

  // Panel "Search Barcode" — terpisah dari pencarian item di atas, dibuka
  // lewat tombol di header. Satu barcode fisik = 1 unit/pcs, hasilnya
  // dipakai buat nunjukin barcode itu ada di lot/rak mana + collie apa.
  const [showBarcodeSearch, setShowBarcodeSearch] = useState(false);
  const [barcodeKeyword, setBarcodeKeyword] = useState("");
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeResult, setBarcodeResult] = useState(null);
  const [barcodeError, setBarcodeError] = useState("");

  const toggleExpand = (loccode) => {
    setExpandedLots((prev) => {
      const next = new Set(prev);
      if (next.has(loccode)) next.delete(loccode);
      else next.add(loccode);
      return next;
    });
  };

  // Autocomplete kotak pencarian (kode ATAU deskripsi), debounce 350ms.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const kw = keyword.trim();
    if (!kw) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      api
        .get("/stok-opname-karawang/fifo/search-item", {
          params: { keyword: kw },
        })
        .then((res) => setSuggestions(res.data.data || []))
        .catch(() => setSuggestions([]))
        .finally(() => setSearching(false));
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [keyword]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) {
        setShowSuggest(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const cariLokasi = useCallback(async (itemCode, mode) => {
    const kode = (itemCode || "").trim();
    if (!kode) return;
    setLoading(true);
    setShowSuggest(false);
    setActiveItem(kode);
    setError("");
    try {
      const res = await api.get("/stok-opname-karawang/fifo/locations", {
        params: { item: kode, filterMode: mode || "all" },
      });
      setResult(res.data.data);
      setExpandedLots(new Set());
    } catch (err) {
      setResult(null);
      const msg = err.response?.data?.message || err.message;
      setError(msg);
      Swal.fire("Gagal", msg, "error");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleFilterChange = (val) => {
    setFilterMode(val);
    if (activeItem) cariLokasi(activeItem, val);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    cariLokasi(keyword, filterMode);
  };

  const pickSuggestion = (item) => {
    setKeyword(`${item.item} — ${item.deskripsi}`);
    cariLokasi(item.item, filterMode);
  };

  const cariBarcode = async (e) => {
    e.preventDefault();
    const kode = barcodeKeyword.trim();
    if (!kode) return;
    setBarcodeLoading(true);
    setBarcodeError("");
    setBarcodeResult(null);
    try {
      const res = await api.get("/stok-opname-karawang/fifo/search-barcode", {
        params: { barcode: kode },
      });
      setBarcodeResult(res.data.data || []);
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      setBarcodeError(msg);
    } finally {
      setBarcodeLoading(false);
    }
  };

  const toggleBarcodeSearch = () => {
    setShowBarcodeSearch((v) => !v);
    setBarcodeKeyword("");
    setBarcodeResult(null);
    setBarcodeError("");
  };

  return (
    <div className="ko-page ko-page-wide">
      <style>{karawangStyles}</style>
      <style>{fifoStyles}</style>

      <div className="fifo-header-row">
        <div className="ko-header">
          <h1>Control FIFO — Cross Docking</h1>
          <p>
            Cari item (kode atau deskripsi), lihat semua lot & week-nya di
            Cross Docking DC Karawang — diurut dari yang paling tua.
          </p>
        </div>
        <div className="fifo-header-actions">
          <button
            type="button"
            className="ko-btn-secondary fifo-barcode-btn"
            onClick={toggleBarcodeSearch}
          >
            <Barcode size={15} /> Search Barcode
          </button>
          <Link
            to="/karawang/cross-docking"
            className="ko-btn-secondary fifo-back-btn"
          >
            <ArrowLeft size={15} /> Monitoring Cross Docking
          </Link>
        </div>
      </div>

      {showBarcodeSearch && (
        <div className="ko-card fifo-barcode-card">
          <div className="fifo-barcode-card-head">
            <strong>
              <Barcode size={15} /> Search Barcode
            </strong>
            <button
              type="button"
              className="fifo-barcode-close"
              onClick={toggleBarcodeSearch}
              title="Tutup"
            >
              <X size={16} />
            </button>
          </div>

          <form className="fifo-search-field" onSubmit={cariBarcode}>
            <Search size={18} />
            <input
              type="text"
              className="fifo-search-input"
              placeholder="Scan atau ketik barcode..."
              value={barcodeKeyword}
              onChange={(e) => setBarcodeKeyword(e.target.value)}
              autoFocus
            />
            <button
              type="submit"
              className="ko-btn-primary fifo-search-btn"
              disabled={barcodeLoading}
            >
              {barcodeLoading ? (
                <Loader2 size={16} className="ko-spin" />
              ) : (
                "Cari"
              )}
            </button>
          </form>
          <p className="fifo-barcode-hint">
            {barcodeLoading
              ? "Mencari... kalau gak ketemu di jalur cepat, otomatis nyoba tarik semua data Cross Docking (bisa agak lama)."
              : "Tips: pastikan barcode discan/diketik persis, tanpa spasi di depan/belakang."}
          </p>

          {barcodeError && (
            <div className="fifo-barcode-error">{barcodeError}</div>
          )}

          {barcodeResult && barcodeResult.length > 0 && (
            <div className="fifo-barcode-result-list">
              {barcodeResult.map((r, i) => (
                <div key={r.barcode + i} className="fifo-barcode-result">
                  <div className="fifo-barcode-result-row">
                    <span className="fifo-barcode-result-label">Barcode</span>
                    <span className="fifo-barcode-result-code">
                      {r.barcode}
                    </span>
                  </div>
                  <div className="fifo-barcode-result-row">
                    <span className="fifo-barcode-result-label">Collie</span>
                    <span className="ko-dropdown-id fifo-barcode-collie">
                      {r.collie}
                    </span>
                  </div>
                  <div className="fifo-barcode-result-row">
                    <span className="fifo-barcode-result-label">Item</span>
                    <span>
                      {r.item}
                      {r.deskripsi && r.deskripsi !== "-" ? (
                        <span className="ko-muted"> — {r.deskripsi}</span>
                      ) : null}
                    </span>
                  </div>
                  <div className="fifo-barcode-result-row">
                    <span className="fifo-barcode-result-label">Rackcode</span>
                    <span>{r.rackcode}</span>
                  </div>
                  <div className="fifo-barcode-result-row">
                    <span className="fifo-barcode-result-label">Lot</span>
                    <span>{r.loccode}</span>
                  </div>
                  <div className="fifo-barcode-result-row">
                    <span className="fifo-barcode-result-label">Week</span>
                    <span>{formatWeek(r.curweek)}</span>
                  </div>
                  <div className="fifo-barcode-result-row">
                    <span className="fifo-barcode-result-label">
                      Kategori
                    </span>
                    <span>{r.kategori}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <form className="ko-card fifo-search-card" onSubmit={handleSubmit} ref={boxRef}>
        <div className="fifo-search-field">
          <Search size={18} />
          <input
            type="text"
            className="fifo-search-input"
            placeholder="Ketik kode item atau deskripsi (mis. ban, IRC, IBD1301)..."
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              setShowSuggest(true);
            }}
            onFocus={() => setShowSuggest(true)}
            autoFocus
          />
          <button type="submit" className="ko-btn-primary fifo-search-btn" disabled={loading}>
            {loading ? <Loader2 size={16} className="ko-spin" /> : "Cari"}
          </button>
        </div>

        {showSuggest && keyword.trim() && (
          <div className="ko-dropdown fifo-dropdown">
            {searching && (
              <div className="ko-dropdown-empty">
                <Loader2 size={14} className="ko-spin" /> Mencari...
              </div>
            )}
            {!searching && suggestions.length === 0 && (
              <div className="ko-dropdown-empty">Item tidak ditemukan.</div>
            )}
            {!searching &&
              suggestions.map((s) => (
                <div
                  key={s.item}
                  className="ko-dropdown-item"
                  onClick={() => pickSuggestion(s)}
                >
                  <span className="ko-dropdown-id">{s.item}</span>
                  <span className="ko-dropdown-name">{s.deskripsi}</span>
                </div>
              ))}
          </div>
        )}
      </form>

      {loading && (
        <div className="ko-empty">
          <Loader2 size={20} className="ko-spin" /> Mengambil data dari Cross
          Docking...
        </div>
      )}

      {!loading && error && (
        <div className="ko-cd-error">{error}</div>
      )}

      {!loading && !error && result && (
        <>
          <div className="fifo-item-card">
            <div>
              <div className="fifo-item-code">{result.item}</div>
              <div className="fifo-item-descr">{result.deskripsi}</div>
            </div>
            <div className="ko-summary-grid fifo-summary-grid">
              <div className="ko-summary-box">
                <strong>{result.summary.total_lot}</strong>
                <span>Total Lot</span>
              </div>
              <div className="ko-summary-box">
                <strong>{result.summary.total_rak}</strong>
                <span>Total Rak</span>
              </div>
              <div className="ko-summary-box">
                <strong>{result.summary.total_qty}</strong>
                <span>Total Qty</span>
              </div>
            </div>
          </div>

          <div className="ko-radio-group fifo-filter-row">
            {FILTER_MODES.map((opt) => (
              <label key={opt.value} className="ko-radio-option">
                <input
                  type="radio"
                  name="fifoFilterMode"
                  checked={filterMode === opt.value}
                  onChange={() => handleFilterChange(opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>

          {result.lokasi.length === 0 ? (
            <div className="ko-empty">
              Item ini tidak ditemukan di lokasi manapun pada Cross Docking
              (dengan filter yang dipilih).
            </div>
          ) : (
            <div className="fifo-lot-list">
              {result.lokasi.map((loc, idx) => {
                const isExpanded = expandedLots.has(loc.loccode);
                return (
                  <div
                    key={loc.loccode + idx}
                    className={
                      "fifo-lot-row-wrap" +
                      (idx === 0 ? " fifo-lot-row-oldest" : "")
                    }
                  >
                    <button
                      type="button"
                      className="fifo-lot-row"
                      onClick={() => toggleExpand(loc.loccode)}
                    >
                      <div className="fifo-lot-cell fifo-lot-cell-rank">
                        <span className="fifo-rank-badge">{idx + 1}</span>
                      </div>
                      <div className="fifo-lot-cell fifo-lot-cell-loc">
                        <span className="fifo-loc-label">
                          <MapPin size={13} /> Lot
                        </span>
                        <span
                          className={
                            "fifo-loc-badge fifo-loc-badge-" +
                            loc.dominant_kategori.toLowerCase()
                          }
                        >
                          {loc.loccode}
                        </span>
                      </div>
                      <div className="fifo-lot-cell fifo-lot-cell-week">
                        <span className="fifo-loc-label">Week</span>
                        <span className="fifo-week-badge">
                          {formatWeek(loc.week)}
                        </span>
                        {loc.week_termuda && (
                          <span className="fifo-week-mixed">
                            s/d {formatWeek(loc.week_termuda)}
                          </span>
                        )}
                      </div>
                      <div className="fifo-lot-cell fifo-lot-cell-rak">
                        <span className="fifo-loc-label">
                          <Layers size={13} /> Rak
                        </span>
                        <span className="fifo-rak-toggle">
                          {isExpanded ? (
                            <ChevronDown size={14} />
                          ) : (
                            <ChevronRight size={14} />
                          )}
                          {loc.jumlah_rak}
                        </span>
                      </div>
                      <div className="fifo-lot-cell fifo-lot-cell-qty">
                        <span className="fifo-loc-label">
                          <Boxes size={13} /> Qty
                        </span>
                        <span className="fifo-qty-value">{loc.qty}</span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="fifo-rack-detail-list">
                        {loc.racks.map((r) => (
                          <div key={r.rackcode} className="fifo-rack-detail-row">
                            <span className="fifo-rack-detail-code">
                              {r.rackcode}
                            </span>
                            <span className="fifo-rack-detail-week">
                              {formatWeek(r.curweek)}
                              {r.curweek_termuda
                                ? ` s/d ${formatWeek(r.curweek_termuda)}`
                                : ""}
                            </span>
                            <span className="fifo-rack-detail-kat">
                              {r.kategori}
                            </span>
                            <span className="fifo-rack-detail-qty">
                              qty {r.qty}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {!loading && !error && !result && !activeItem && (
        <div className="ko-empty">
          Ketik kode item atau deskripsi di atas untuk mulai pencarian FIFO.
        </div>
      )}
    </div>
  );
}

const fifoStyles = `
.fifo-header-row { display: flex; align-items: flex-start; justify-content: space-between;
  gap: 10px; flex-wrap: wrap; }
.fifo-header-row .ko-header { flex: 1 1 280px; margin-bottom: 14px; }
.fifo-header-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.fifo-back-btn, .fifo-barcode-btn { white-space: nowrap; }

.fifo-barcode-card { margin-bottom: 14px; }
.fifo-barcode-card-head { display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 12px; }
.fifo-barcode-card-head strong { display: flex; align-items: center; gap: 6px; font-size: 14px;
  color: #0f172a; }
.fifo-barcode-close { display: flex; align-items: center; justify-content: center; width: 28px;
  height: 28px; border-radius: 8px; border: none; background: #f1f5f9; color: #64748b; cursor: pointer; }
.fifo-barcode-close:hover { background: #e2e8f0; color: #1e293b; }
.fifo-barcode-hint { margin: 8px 0 0; font-size: 11.5px; color: #94a3b8; }
.fifo-barcode-error { margin-top: 10px; background: #fef2f2; border: 1px solid #fecaca;
  color: #b91c1c; font-size: 13px; padding: 10px 12px; border-radius: 10px; }
.fifo-barcode-result-list { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.fifo-barcode-result { border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px 14px; }
.fifo-barcode-result-row { display: flex; align-items: center; justify-content: space-between;
  gap: 10px; padding: 4px 0; border-bottom: 1px dashed #f1f5f9; font-size: 13px; }
.fifo-barcode-result-row:last-child { border-bottom: none; }
.fifo-barcode-result-label { font-size: 11px; font-weight: 700; color: #94a3b8;
  text-transform: uppercase; letter-spacing: 0.03em; }
.fifo-barcode-result-code { font-family: 'Consolas', 'SFMono-Regular', monospace; font-weight: 700;
  color: #0f172a; }
.fifo-barcode-collie { background: #eef2ff; padding: 3px 10px; border-radius: 999px; }

.fifo-search-card { position: relative; }
.fifo-search-field { display: flex; align-items: center; gap: 10px; color: #64748b; }
.fifo-search-input { flex: 1; border: none; outline: none; font-size: 15px; color: #0f172a;
  padding: 8px 0; background: transparent; }
.fifo-search-btn { width: auto; margin-top: 0; padding: 10px 20px; }
.fifo-dropdown { top: calc(100% - 2px); left: 16px; right: 16px; }

.fifo-item-card { background: linear-gradient(135deg, #0021b3, #0038f0); border-radius: 16px;
  padding: 16px 18px; color: #fff; display: flex; flex-wrap: wrap; align-items: center;
  justify-content: space-between; gap: 14px; margin-bottom: 14px; }
.fifo-item-code { font-size: 18px; font-weight: 800; letter-spacing: 0.02em; }
.fifo-item-descr { font-size: 12.5px; opacity: 0.85; margin-top: 2px; }
.fifo-summary-grid { margin-bottom: 0; flex: 0 0 auto; grid-auto-flow: column;
  grid-template-columns: none; }
.fifo-summary-grid .ko-summary-box { background: rgba(255,255,255,0.14); min-width: 76px; }

.fifo-filter-row { margin-bottom: 12px; }

.fifo-lot-list { display: flex; flex-direction: column; gap: 8px; }
.fifo-lot-row-wrap { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px;
  overflow: hidden; }
.fifo-lot-row-oldest { border-color: #fca5a5; background: #fef2f2; }
.fifo-lot-row { display: grid; grid-template-columns: 34px 1.4fr 1fr 0.7fr 0.9fr;
  align-items: center; gap: 10px; width: 100%; border: none; background: transparent;
  padding: 10px 14px; cursor: pointer; font: inherit; color: inherit; text-align: left;
  appearance: none; }
.fifo-rank-badge { display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; border-radius: 50%; background: #eef2ff; color: #4338ca;
  font-weight: 800; font-size: 11px; }
.fifo-lot-row-oldest .fifo-rank-badge { background: #dc2626; color: #fff; }
.fifo-lot-cell { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.fifo-loc-label { display: none; }
.fifo-loc-badge { display: inline-block; font-family: 'Consolas','SFMono-Regular',monospace;
  font-weight: 700; font-size: 13px; padding: 4px 10px; border-radius: 8px; border: 1.5px solid;
  width: fit-content; }
.fifo-loc-badge-ok { background: #dcfce7; color: #15803d; border-color: #86efac; }
.fifo-loc-badge-oe { background: #fef3c7; color: #92400e; border-color: #fcd34d; }
.fifo-loc-badge-mixed { background: #f3e8ff; color: #7e22ce; border-color: #d8b4fe; }
.fifo-week-badge { display: inline-block; background: #eef2ff; color: #4338ca; font-weight: 700;
  font-size: 12.5px; padding: 3px 10px; border-radius: 999px; width: fit-content; }
.fifo-lot-row-oldest .fifo-week-badge { background: #fee2e2; color: #b91c1c; }
.fifo-week-mixed { font-size: 10px; color: #94a3b8; margin-top: 1px; }
.fifo-lot-cell-rak span:last-child { font-weight: 700; color: #334155; font-size: 13px; }
.fifo-qty-value { font-weight: 800; color: #0f172a; font-size: 15px; }
.fifo-rak-toggle { display: inline-flex; align-items: center; gap: 4px; }

/* Detail rak per lot (muncul pas expand) — mirip pola cs-rack-detail-*
   di modul Control Stock, biar konsisten look-nya. */
.fifo-rack-detail-list { display: flex; flex-direction: column; gap: 5px;
  padding: 0 14px 12px 58px; }
.fifo-rack-detail-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
  background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 5px 10px;
  font-size: 11.5px; }
.fifo-rack-detail-code { font-family: 'Consolas','SFMono-Regular',monospace; font-weight: 700;
  color: #166534; }
.fifo-rack-detail-week { color: #4338ca; font-weight: 700; }
.fifo-rack-detail-kat { color: #475569; font-weight: 600; }
.fifo-rack-detail-qty { color: #0f172a; font-weight: 700; margin-left: auto; }

/* < 720px (HP): tabel-ish grid berubah jadi kartu bertumpuk, tiap sel
   dikasih label kecil biar tetap jelas dibaca satu kolom. */
@media (max-width: 720px) {
  .fifo-summary-grid { width: 100%; grid-auto-flow: row; grid-template-columns: repeat(3, 1fr); }
  .fifo-lot-row { grid-template-columns: 1fr; gap: 8px; position: relative; padding: 12px 14px 12px 40px; }
  .fifo-lot-cell-rank { position: absolute; top: 12px; left: 10px; }
  .fifo-lot-cell { flex-direction: row; align-items: center; justify-content: space-between;
    border-bottom: 1px dashed #f1f5f9; padding-bottom: 6px; }
  .fifo-lot-cell:last-child { border-bottom: none; padding-bottom: 0; }
  .fifo-loc-label { display: flex; align-items: center; gap: 4px; font-size: 11px;
    font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.03em; }
  .fifo-rack-detail-list { padding: 0 14px 12px 14px; }
  .fifo-header-actions { width: 100%; }
  .fifo-header-actions .fifo-barcode-btn, .fifo-header-actions .fifo-back-btn { flex: 1; justify-content: center; }
}
`;
