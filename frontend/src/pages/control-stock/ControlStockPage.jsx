// src/pages/ControlStock/Index.jsx
// Modul "Control Stock" — kebalikan dari Monitoring Transfer Rak: input-nya
// KODE ITEM, hasilnya semua LOKASI (lot) tempat item itu berada, lengkap
// jumlah rak & qty per lokasi, diurut dari whsweek paling tua.
import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import Swal from "sweetalert2";
import {
  Search,
  MapPin,
  Boxes,
  Layers,
  Loader2,
  ChevronDown,
  ChevronRight,
  Home,
} from "lucide-react";
import api from "../../api/axiosInstance";

// Format whsweek: "YYWW" — 2 digit tahun DULU, baru 2 digit minggu,
// mis. "2630" = tahun 2026 minggu ke-30. Ditampilkan APA ADANYA (raw
// code), mis. "2630" — bukan lagi "2026 / Wk 30".
function formatWhsWeek(whsweek) {
  if (!whsweek || whsweek.trim() === "") return "-";
  return whsweek.trim();
}

export default function ControlStock() {
  const [keyword, setKeyword] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [activeItem, setActiveItem] = useState(null); // kode item yg lagi ditampilin
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [kategoriFilter, setKategoriFilter] = useState("ALL"); // ALL | OK | OE
  // Baris lokasi yang lagi expanded (nampilin detail rackcode+week+qty).
  // Isinya rowKey (loccol + idx), di-reset tiap kali hasil pencarian ganti.
  const [expandedRows, setExpandedRows] = useState(() => new Set());
  // Toggle detail breakdown section "Belum Masuk Lot" (rackcode "~").
  const [showBelumMasukLot, setShowBelumMasukLot] = useState(false);
  // Toggle detail breakdown section "Rak Belum Masuk Lot" (rackcode
  // fisik, udah ke-scan, tapi belum ke-assign ke fgloc/loccode manapun).
  const [showRakBelumMasukLot, setShowRakBelumMasukLot] = useState(false);
  const debounceRef = useRef(null);
  const boxRef = useRef(null);

  const toggleExpand = (rowKey) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  };

  // Autocomplete kotak pencarian, debounce 350ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const kw = keyword.trim();
    if (!kw) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      api
        .get("/control-stock/search-item", { params: { q: kw } })
        .then((res) => setSuggestions(res.data.data || []))
        .catch(() => setSuggestions([]));
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [keyword]);

  // Tutup dropdown suggestion kalau klik di luar kotak
  useEffect(() => {
    function handleClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) {
        setShowSuggest(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const cariLokasi = useCallback(async (itemCode, kategori) => {
    const kode = (itemCode || "").trim();
    if (!kode) return;
    setLoading(true);
    setShowSuggest(false);
    setActiveItem(kode);
    try {
      const res = await api.get("/control-stock/locations", {
        params: {
          item: kode,
          kategori: kategori && kategori !== "ALL" ? kategori : undefined,
        },
      });
      setResult(res.data.data);
      setExpandedRows(new Set());
      setShowBelumMasukLot(false);
      setShowRakBelumMasukLot(false);
    } catch (err) {
      setResult(null);
      Swal.fire("Gagal", err.response?.data?.message || err.message, "error");
    } finally {
      setLoading(false);
    }
  }, []);

  // Ganti filter OK/OE/Semua → re-fetch otomatis pake item yang lagi aktif
  const handleFilterChange = (val) => {
    setKategoriFilter(val);
    if (activeItem) cariLokasi(activeItem, val);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    cariLokasi(keyword, kategoriFilter);
  };

  const pickSuggestion = (item) => {
    setKeyword(item.item);
    cariLokasi(item.item, kategoriFilter);
  };

  return (
    <div className="cs-page">
      <style>{csStyles}</style>

      <div className="cs-home-bar">
        <Link to="/" className="cs-home-btn" title="Kembali ke Pilih Menu">
          <Home size={17} />
        </Link>
      </div>

      <div className="cs-header">
        <h1>Cek Lokasi Stock per Item</h1>
      </div>

      <form className="cs-search-card" onSubmit={handleSubmit} ref={boxRef}>
        <div className="cs-search-field">
          <Search size={18} />
          <input
            type="text"
            placeholder="Ketik Deskripsi misal (MB 86) atau Kode Item (IBD1001)...."
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              setShowSuggest(true);
            }}
            onFocus={() => setShowSuggest(true)}
            autoFocus
          />
          <button type="submit" className="cs-btn-cari" disabled={loading}>
            {loading ? <Loader2 size={16} className="cs-spin" /> : "Cari"}
          </button>
        </div>

        {showSuggest && suggestions.length > 0 && (
          <div className="cs-suggest-list">
            {suggestions.map((s) => (
              <div
                key={s.item}
                className="cs-suggest-item"
                onClick={() => pickSuggestion(s)}
              >
                <strong>{s.item}</strong>
                <span>{s.deskripsi}</span>
              </div>
            ))}
          </div>
        )}
      </form>

      {loading && (
        <div className="cs-empty-state">
          <Loader2 size={22} className="cs-spin" /> Mencari data ke database
          EDP...
        </div>
      )}

      {!loading && result && (
        <>
          <div className="cs-filter-bar">
            <span className="cs-filter-label">Kategori:</span>
            <div className="cs-filter-group">
              {[
                { val: "ALL", label: "Semua" },
                { val: "OK", label: "OK" },
                { val: "OE", label: "OE" },
              ].map((f) => (
                <button
                  key={f.val}
                  type="button"
                  className={
                    "cs-filter-btn" +
                    (kategoriFilter === f.val ? " cs-filter-btn-active" : "") +
                    (f.val !== "ALL"
                      ? ` cs-filter-btn-${f.val.toLowerCase()}`
                      : "")
                  }
                  onClick={() => handleFilterChange(f.val)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="cs-item-card">
            <div>
              <div className="cs-item-code">{result.item}</div>
              <div className="cs-item-descr">{result.deskripsi}</div>
            </div>
            <div className="cs-summary-grid">
              <div className="cs-summary-box">
                <strong>{result.summary.total_lokasi}</strong>
                <span>Lokasi</span>
              </div>
              <div className="cs-summary-box">
                <strong>{result.summary.total_rak}</strong>
                <span>Rak</span>
              </div>
              <div className="cs-summary-box">
                <strong>{result.summary.total_qty}</strong>
                <span>Qty</span>
              </div>
            </div>
          </div>

          {result.belum_masuk_lot?.ada && (
            <div className="cs-bml-card">
              <div
                className="cs-bml-head"
                onClick={() => setShowBelumMasukLot((v) => !v)}
              >
                {showBelumMasukLot ? (
                  <ChevronDown size={16} />
                ) : (
                  <ChevronRight size={16} />
                )}
                <div className="cs-bml-title">
                  <strong>Belum Masuk rak </strong>
                  <span>
                    Unit udah tercatat sistem, tapi belum ditempatin ke rak
                    ("~")
                  </span>
                </div>
                <div className="cs-bml-qty">
                  {result.belum_masuk_lot.qty_total}
                  <span>qty</span>
                </div>
              </div>

              <div className="cs-bml-chips">
                {result.belum_masuk_lot.kategori_breakdown.map((k) => (
                  <span
                    key={k.kategori}
                    className={
                      "cs-loc-badge cs-loc-badge-" + k.kategori.toLowerCase()
                    }
                  >
                    {k.kategori}: {k.qty}
                  </span>
                ))}
              </div>

              {showBelumMasukLot && (
                <div className="cs-rack-detail-list cs-bml-detail-list">
                  {result.belum_masuk_lot.detail.map((d, i) => (
                    <div
                      key={i}
                      className="cs-rack-detail-row cs-rack-chip-warn"
                    >
                      <span className="cs-week-badge">
                        {formatWhsWeek(d.curweek)}
                      </span>
                      <span className="cs-rack-detail-kat">{d.kategori}</span>
                      <span className="cs-rack-detail-qty">qty {d.qty}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {result.rak_belum_masuk_lot?.ada && (
            <div className="cs-bml-card cs-bml-card-blue">
              <div
                className="cs-bml-head"
                onClick={() => setShowRakBelumMasukLot((v) => !v)}
              >
                {showRakBelumMasukLot ? (
                  <ChevronDown size={16} />
                ) : (
                  <ChevronRight size={16} />
                )}
                <div className="cs-bml-title">
                  <strong>Rak Belum Masuk Lot</strong>
                  <span>
                    Udah ke-scan ke rak fisik, tapi rackcode-nya belum di-assign
                    ke lot/loccode manapun
                  </span>
                </div>
                <div className="cs-bml-qty">
                  {result.rak_belum_masuk_lot.qty_total}
                  <span>qty · {result.rak_belum_masuk_lot.jumlah_rak} rak</span>
                </div>
              </div>

              <div className="cs-bml-chips">
                {result.rak_belum_masuk_lot.kategori_breakdown.map((k) => (
                  <span
                    key={k.kategori}
                    className={
                      "cs-loc-badge cs-loc-badge-" + k.kategori.toLowerCase()
                    }
                  >
                    {k.kategori}: {k.qty}
                  </span>
                ))}
              </div>

              {showRakBelumMasukLot && (
                <div className="cs-rack-detail-list cs-bml-detail-list">
                  {result.rak_belum_masuk_lot.racks.map((r) => (
                    <div
                      key={r.rackcode}
                      className="cs-rack-detail-row cs-rack-chip-blue"
                    >
                      <span className="cs-rack-detail-code">{r.rackcode}</span>
                      <span className="cs-week-badge">
                        {formatWhsWeek(r.curweek)}
                      </span>
                      <span className="cs-rack-detail-kat">{r.kategori}</span>
                      <span className="cs-rack-detail-qty">qty {r.qty}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {result.lokasi.length === 0 ? (
            <div className="cs-empty-state">
              Item <strong>{result.item}</strong> tidak ditemukan di lokasi
              manapun (fginvc.fgloc).
            </div>
          ) : (
            <div className="cs-lokasi-list">
              {result.lokasi.map((loc, idx) => {
                const rowKey = loc.loccol + idx;
                const isExpanded = expandedRows.has(rowKey);
                // Urut detail rak paling tua duluan (curweek terkecil).
                // Rak yang belum ketemu curweek-nya (kosong) ditaruh
                // paling belakang.
                const sortedRacks = [...loc.racks].sort((a, b) => {
                  if (!a.curweek && !b.curweek) return 0;
                  if (!a.curweek) return 1;
                  if (!b.curweek) return -1;
                  return a.curweek.localeCompare(b.curweek);
                });

                return (
                  <div key={rowKey} className="cs-lokasi-row-wrap">
                    {loc.racks.length > 0 ? (
                      <button
                        type="button"
                        className="cs-lokasi-row"
                        onClick={() => toggleExpand(rowKey)}
                      >
                        <div className="cs-lokasi-cell cs-lokasi-cell-no">
                          <span className="cs-lokasi-rank-badge">
                            {idx + 1}
                          </span>
                        </div>

                        <div className="cs-lokasi-cell cs-lokasi-cell-loc">
                          <span className="cs-lokasi-cell-label">
                            <MapPin size={13} /> Lokasi (Lot)
                          </span>
                          <span
                            className={
                              "cs-loc-badge cs-loc-badge-" +
                              loc.dominant_kategori.toLowerCase()
                            }
                          >
                            {loc.loccol}
                          </span>
                        </div>

                        <div className="cs-lokasi-cell cs-lokasi-cell-rak">
                          <span className="cs-lokasi-cell-label">
                            <Layers size={13} /> Rak
                          </span>
                          <span className="cs-rack-toggle">
                            {isExpanded ? (
                              <ChevronDown size={14} />
                            ) : (
                              <ChevronRight size={14} />
                            )}
                            {loc.jumlah_rak}
                          </span>
                        </div>

                        <div className="cs-lokasi-cell cs-lokasi-cell-qty">
                          <span className="cs-lokasi-cell-label">
                            <Boxes size={13} /> Qty
                          </span>
                          <span className="cs-qty">{loc.qty_lokasi}</span>
                        </div>
                      </button>
                    ) : (
                      <div className="cs-lokasi-row cs-lokasi-row-static">
                        <div className="cs-lokasi-cell cs-lokasi-cell-no">
                          <span className="cs-lokasi-rank-badge">
                            {idx + 1}
                          </span>
                        </div>

                        <div className="cs-lokasi-cell cs-lokasi-cell-loc">
                          <span className="cs-lokasi-cell-label">
                            <MapPin size={13} /> Lokasi (Lot)
                          </span>
                          <span
                            className={
                              "cs-loc-badge cs-loc-badge-" +
                              loc.dominant_kategori.toLowerCase()
                            }
                          >
                            {loc.loccol}
                          </span>
                        </div>

                        <div className="cs-lokasi-cell cs-lokasi-cell-rak">
                          <span className="cs-lokasi-cell-label">
                            <Layers size={13} /> Rak
                          </span>
                          <span className="cs-muted">—</span>
                        </div>

                        <div className="cs-lokasi-cell cs-lokasi-cell-qty">
                          <span className="cs-lokasi-cell-label">
                            <Boxes size={13} /> Qty
                          </span>
                          <span className="cs-qty">{loc.qty_lokasi}</span>
                        </div>
                      </div>
                    )}

                    {isExpanded && loc.racks.length > 0 && (
                      <div className="cs-rack-detail-list">
                        {sortedRacks.map((r) => (
                          <div
                            key={r.rackcode}
                            className={
                              "cs-rack-detail-row" +
                              (r.terverifikasi ? "" : " cs-rack-chip-warn") +
                              (!r.sesuai ? " cs-rack-chip-mismatch" : "")
                            }
                            title={
                              r.terverifikasi
                                ? r.sesuai
                                  ? `${r.rackcode} • ${r.kategori} • qty ${r.qty}`
                                  : `${r.rackcode} • isi rak berbeda dari item yang dicari (qty tercatat ${r.qty})`
                                : `${r.rackcode} • belum terverifikasi di tabel rack`
                            }
                          >
                            <span className="cs-rack-detail-code">
                              {r.rackcode}
                            </span>
                            <span className="cs-week-badge">
                              {formatWhsWeek(r.curweek)}
                            </span>
                            <span className="cs-rack-detail-kat">
                              {r.kategori}
                            </span>
                            <span className="cs-rack-detail-qty">
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

      {!loading && !result && !activeItem && (
        <div className="cs-empty-state">
          Ketik kode item di atas untuk mulai pencarian lokasi stock.
        </div>
      )}
    </div>
  );
}

const csStyles = `
.cs-home-bar { display: flex; gap: 6px; margin-bottom: 16px;
  background: #fff; border-radius: 12px; padding: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
.cs-home-btn { display: flex; align-items: center; justify-content: center;
  width: 40px; height: 40px; border-radius: 8px; background: #f1f5f9; color: #475569; text-decoration: none; }
.cs-home-btn:hover { background: #e2e8f0; color: #1e293b; }
@media (max-width: 560px) {
  .cs-home-bar { gap: 4px; padding: 5px; }
  .cs-home-btn { width: 34px; height: 34px; }
}

.cs-page { max-width: 1100px; margin: 0 auto; }
.cs-header { margin-bottom: 1.5rem; }
.cs-eyebrow { font-size: 12px; font-weight: 700; color: #0021b3; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
.cs-header h1 { font-size: 22px; font-weight: 800; color: #0f172a; margin: 0 0 6px; }
.cs-header p { font-size: 13px; color: #64748b; margin: 0; max-width: 640px; }

.cs-search-card { position: relative; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 14px; margin-bottom: 1.25rem; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
.cs-search-field { display: flex; align-items: center; gap: 10px; color: #64748b; }
.cs-search-field input { flex: 1; border: none; outline: none; font-size: 15px; color: #0f172a; padding: 8px 0; }
.cs-btn-cari { background: #0021b3; color: #fff; border: none; border-radius: 10px; padding: 10px 20px; font-weight: 700; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 6px; }
.cs-btn-cari:hover { background: #001a8f; }
.cs-btn-cari:disabled { opacity: 0.7; cursor: default; }
.cs-spin { animation: cs-spin 0.8s linear infinite; }
@keyframes cs-spin { to { transform: rotate(360deg); } }

.cs-suggest-list { position: absolute; left: 14px; right: 14px; top: 100%; margin-top: 6px; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.08); z-index: 20; max-height: 280px; overflow-y: auto; }
.cs-suggest-item { padding: 10px 14px; cursor: pointer; display: flex; flex-direction: column; gap: 2px; border-bottom: 1px solid #f1f5f9; }
.cs-suggest-item:last-child { border-bottom: none; }
.cs-suggest-item:hover { background: #f8fafc; }
.cs-suggest-item strong { font-size: 13px; color: #0021b3; }
.cs-suggest-item span { font-size: 12px; color: #64748b; }

.cs-empty-state { text-align: center; padding: 3rem 1rem; color: #94a3b8; font-size: 14px; display: flex; flex-direction: column; align-items: center; gap: 8px; }

.cs-item-card { background: linear-gradient(135deg, #0021b3, #0038f0); border-radius: 16px; padding: 16px 18px; color: #fff; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 14px; }
.cs-item-code { font-size: 18px; font-weight: 800; letter-spacing: 0.02em; }
.cs-item-descr { font-size: 12.5px; opacity: 0.85; margin-top: 2px; }
.cs-summary-grid { display: grid; grid-auto-flow: column; grid-template-columns: none; gap: 8px; margin-bottom: 0; flex: 0 0 auto; }
.cs-summary-box { background: rgba(255,255,255,0.14); border-radius: 14px; padding: 12px; color: #fff; text-align: center; min-width: 76px; }
.cs-summary-box strong { display: block; font-size: 17px; font-weight: 800; }
.cs-summary-box span { display: block; font-size: 10px; opacity: 0.85; margin-top: 2px; }

.cs-lokasi-list { display: flex; flex-direction: column; gap: 8px; }
.cs-lokasi-row-wrap { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
.cs-lokasi-row { display: grid; grid-template-columns: 34px 1.5fr 0.9fr 0.9fr; align-items: center; gap: 10px; width: 100%; border: none; background: transparent; padding: 10px 14px; cursor: pointer; font: inherit; color: inherit; text-align: left; appearance: none; }
.cs-lokasi-row-static { cursor: default; }
.cs-lokasi-cell { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cs-lokasi-cell-label { display: none; }
.cs-lokasi-rank-badge { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; background: #eef2ff; color: #4338ca; font-weight: 800; font-size: 11px; }
.cs-center { text-align: center; }
.cs-qty { font-weight: 800; color: #0f172a; font-size: 15px; }
.cs-muted { color: #94a3b8; }

.cs-loc-badge { display: inline-block; font-family: 'Consolas', 'SFMono-Regular', monospace; font-weight: 700; font-size: 13px; padding: 4px 10px; border-radius: 8px; border: 1.5px solid; letter-spacing: 0.01em; width: fit-content; }
.cs-loc-badge-ok { background: #dcfce7; color: #15803d; border-color: #86efac; }
.cs-loc-badge-oe { background: #fef3c7; color: #92400e; border-color: #fcd34d; }
.cs-loc-badge-mixed { background: #f3e8ff; color: #7e22ce; border-color: #d8b4fe; }
.cs-loc-badge-kosong { background: #fff; color: #64748b; border-color: #cbd5e1; border-style: dashed; }

.cs-filter-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 1rem; }
.cs-filter-label { font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; }
.cs-filter-group { display: flex; gap: 6px; background: #f1f5f9; padding: 4px; border-radius: 12px; }
.cs-filter-btn { border: none; background: transparent; padding: 7px 16px; border-radius: 9px; font-size: 13px; font-weight: 700; color: #64748b; cursor: pointer; transition: all 0.15s; }
.cs-filter-btn:hover { color: #0f172a; }
.cs-filter-btn-active { background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.1); color: #0021b3; }
.cs-filter-btn-active.cs-filter-btn-ok { color: #15803d; }
.cs-filter-btn-active.cs-filter-btn-oe { color: #92400e; }

.cs-week-badge { display: inline-block; background: #eef2ff; color: #4338ca; font-weight: 700; font-size: 12px; padding: 3px 10px; border-radius: 999px; }

.cs-lokasi-cell-rak span:last-child { font-weight: 700; color: #334155; font-size: 13px; }
.cs-rack-toggle { display: inline-flex; align-items: center; gap: 4px; }

.cs-rack-detail-list { display: flex; flex-direction: column; gap: 5px; margin-top: 8px; }
.cs-lokasi-row-wrap .cs-rack-detail-list { margin-top: 0; padding: 0 14px 12px 58px; }
.cs-rack-detail-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 5px 10px; font-size: 11px; }
.cs-rack-detail-row.cs-rack-chip-warn { background: #fefce8; border-color: #fde68a; }
.cs-rack-detail-row.cs-rack-chip-mismatch { background: #fef2f2; border-color: #fecaca; }
.cs-rack-detail-code { font-family: 'Consolas', 'SFMono-Regular', monospace; font-weight: 700; color: #166534; }
.cs-rack-chip-warn .cs-rack-detail-code { color: #854d0e; }
.cs-rack-chip-mismatch .cs-rack-detail-code { color: #b91c1c; }
.cs-rack-detail-kat { color: #475569; font-weight: 600; }
.cs-rack-detail-qty { color: #0f172a; font-weight: 700; margin-left: auto; }

.cs-bml-card { background: #fffbeb; border: 1.5px dashed #fcd34d; border-radius: 16px; padding: 14px 16px; margin-bottom: 1.25rem; }
.cs-bml-head { display: flex; align-items: center; gap: 10px; cursor: pointer; color: #92400e; }
.cs-bml-title { flex: 1; display: flex; flex-direction: column; }
.cs-bml-title strong { font-size: 14px; font-weight: 800; color: #78350f; }
.cs-bml-title span { font-size: 12px; color: #92400e; opacity: 0.85; }
.cs-bml-qty { font-size: 18px; font-weight: 800; color: #78350f; text-align: right; line-height: 1.1; }
.cs-bml-qty span { display: block; font-size: 10px; font-weight: 700; opacity: 0.7; text-transform: uppercase; }
.cs-bml-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; margin-left: 26px; }
.cs-bml-detail-list { margin-left: 26px; margin-top: 10px; }

.cs-bml-card-blue { background: #eff6ff; border-color: #93c5fd; }
.cs-bml-card-blue .cs-bml-head { color: #1e40af; }
.cs-bml-card-blue .cs-bml-title strong { color: #1e3a8a; }
.cs-bml-card-blue .cs-bml-title span { color: #1e40af; }
.cs-bml-card-blue .cs-bml-qty { color: #1e3a8a; }
.cs-rack-detail-row.cs-rack-chip-blue { background: #eff6ff; border-color: #bfdbfe; }
.cs-rack-chip-blue .cs-rack-detail-code { color: #1e40af; }

/* ===== Mobile (<= 640px) ===== */
@media (max-width: 640px) {
  .cs-page { max-width: 100%; padding: 0 4px; }
  .cs-header h1 { font-size: 18px; }
  .cs-header p { max-width: 100%; }

  .cs-search-card { padding: 10px; }
  .cs-search-field input { font-size: 14px; min-width: 0; }
  .cs-btn-cari { padding: 9px 14px; font-size: 12px; }
  .cs-suggest-list { left: 8px; right: 8px; }

  .cs-filter-bar { flex-wrap: wrap; gap: 6px; }
  .cs-filter-group { flex: 1; }
  .cs-filter-btn { flex: 1; padding: 8px 6px; text-align: center; }

  .cs-item-card { flex-direction: column; align-items: flex-start; padding: 16px; gap: 12px; }
  .cs-item-code { font-size: 17px; word-break: break-all; }
  .cs-summary-grid { width: 100%; grid-auto-flow: row; grid-template-columns: repeat(3, 1fr); }
  .cs-summary-box { min-width: 0; }
  .cs-summary-box strong { font-size: 15px; }

  .cs-bml-head { flex-wrap: wrap; }
  .cs-bml-qty { text-align: left; margin-left: 26px; }
  .cs-bml-chips, .cs-bml-detail-list { margin-left: 0; }

  .cs-rack-detail-row { font-size: 11px; padding: 6px 8px; }
  .cs-rack-detail-qty { margin-left: 0; }

  /* List lokasi (grid row) → di HP kolomnya ditumpuk 1 per baris,
     nomor urut jadi badge bulat pojok kiri, dan tiap sel dikasih label
     kecil di atasnya — pola yang sama kayak Control FIFO Cross Docking. */
  .cs-lokasi-row {
    grid-template-columns: 1fr;
    gap: 8px;
    position: relative;
    padding: 12px 14px 12px 40px;
  }
  .cs-lokasi-cell-no { position: absolute; top: 12px; left: 10px; }
  .cs-lokasi-cell {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px dashed #f1f5f9;
    padding-bottom: 6px;
  }
  .cs-lokasi-cell:last-child { border-bottom: none; padding-bottom: 0; }
  .cs-lokasi-cell-label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 700;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .cs-lokasi-row-wrap .cs-rack-detail-list { padding: 0 14px 12px 14px; }
}
`;
