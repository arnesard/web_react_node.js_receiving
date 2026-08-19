// src/pages/stok-opname-karawang/karawangStyles.js
// Style bersama semua halaman modul Stok Opname DC Karawang.
// Dibikin fullscreen mobile (sama seperti modul Monitoring Transfer),
// prefix class "ko-" biar gak tabrakan sama modul lain.
export const karawangStyles = `
  .ko-page { max-width: 720px; margin: 0 auto; padding: 16px 14px 40px; color: #1e293b; }
  .ko-page-wide { max-width: 1180px; }
  /* Versi desktop full layar (dipakai dashboard DC Karawang) — gak dibatasi
     720px kayak mobile, tapi tetep dikasih cap gede biar baris teks/kartu
     gak melar konyol di layar ultrawide. */
  .ko-page-full { max-width: 1900px; }

  /* Dashboard: navbar s/d 3 card ringkasan "freeze" (gak ikut discroll),
     cuma grid item di bawahnya yang punya scroll sendiri. Tinggi dihitung
     dari viewport dikurangin padding vertikal #main-content (lihat
     AppLayout.jsx: 1.75rem atas+bawah desktop, 1.25rem di mobile). */
  .ko-dashboard-shell { display: flex; flex-direction: column;
    height: calc(100vh - 3.5rem); padding-bottom: 0; }
  .ko-dashboard-fixed { flex: 0 0 auto; }
  .ko-dashboard-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 2px 2px 16px; }
  @media (max-width: 992px) {
    .ko-dashboard-shell { height: calc(100vh - 2.5rem); }
  }

  .ko-subnav { display: flex; gap: 6px; margin-bottom: 16px;
    background: #fff; border-radius: 12px; padding: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
  .ko-home-btn { display: flex; align-items: center; justify-content: center;
    width: 40px; border-radius: 8px; background: #f1f5f9; color: #475569; text-decoration: none; }
  .ko-home-btn:hover { background: #e2e8f0; color: #1e293b; }
  .ko-subnav-link { flex: 1; display: flex; align-items: center; justify-content: center;
    gap: 6px; padding: 9px 4px; border-radius: 8px; font-size: 12px; font-weight: 700;
    color: #64748b; text-decoration: none; }
  .ko-subnav-link:hover { background: #f1f5f9; }
  .ko-subnav-link.active { background: #0021b3; color: #fff; }
  @media (max-width: 560px) {
    .ko-subnav { gap: 4px; padding: 5px; }
    .ko-home-btn { width: 34px; }
    .ko-subnav-link { flex-direction: column; gap: 2px; padding: 7px 2px; font-size: 9px; }
  }

  .ko-header { margin-bottom: 14px; }
  .ko-header h1 { font-size: 19px; font-weight: 800; color: #0f172a; margin: 0 0 4px; }
  .ko-header p { font-size: 12.5px; color: #64748b; margin: 0; }

  /* Row judul dashboard sejajar sama tombol Refresh Data Cross Docking. */
  .ko-dashboard-title-row { display: flex; align-items: flex-start; justify-content: space-between;
    gap: 10px; flex-wrap: wrap; }
  .ko-dashboard-title-row .ko-header { margin-bottom: 14px; flex: 1 1 260px; }

  .ko-batch-badge { display: inline-flex; align-items: center; gap: 6px; background: #eef2ff;
    color: #4338ca; font-weight: 700; font-size: 12px; padding: 6px 12px; border-radius: 999px;
    margin-bottom: 14px; }

  .ko-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 16px;
    margin-bottom: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }

  .ko-chart-header { display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 10px 16px; margin-bottom: 16px; }
  .ko-chart-title { font-size: 13px; font-weight: 700; color: #334155; margin: 0; }
  .ko-chart-wrap { height: 260px; }

  .ko-date-filter { display: flex; align-items: flex-end; gap: 8px; flex-wrap: nowrap; }
  .ko-date-field { display: flex; flex-direction: column; gap: 3px; }
  .ko-date-field-label { font-size: 10px; font-weight: 700; color: #94a3b8;
    text-transform: uppercase; letter-spacing: 0.04em; }
  .ko-date-input { border: 1px solid #cbd5e1; border-radius: 8px; padding: 6px 8px;
    font-size: 12px; color: #334155; background: #fff; line-height: 1.2; }
  .ko-date-input:focus { outline: none; border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59,130,246,0.15); }
  .ko-date-sep { font-size: 12px; color: #94a3b8; font-weight: 600; align-self: center;
    padding-bottom: 7px; }
  .ko-date-reset { align-self: flex-end; border: 1px solid #e2e8f0; background: #f8fafc;
    color: #64748b; font-size: 12px; font-weight: 600; padding: 6px 10px; border-radius: 8px;
    cursor: pointer; white-space: nowrap; }
  .ko-date-reset:hover { background: #f1f5f9; color: #334155; }

  @media (max-width: 640px) {
    .ko-date-filter { flex-wrap: wrap; }
  }

  .ko-scan-label { font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase;
    letter-spacing: 0.04em; margin-bottom: 8px; }
  .ko-scan-input { width: 100%; padding: 14px; border-radius: 12px; border: 2px solid #3b82f6;
    font-size: 16px; font-weight: 600; outline: none; background: rgba(59,130,246,0.06);
    box-sizing: border-box; }
  .ko-scan-input:focus { background: rgba(59,130,246,0.12); }
  .ko-scan-input::placeholder { color: #64748b; font-weight: 500; }
  .ko-scan-input-collie { border-color: #16a34a; background: rgba(22,163,74,0.06); }
  .ko-scan-input-collie:focus { background: rgba(22,163,74,0.12); }
  .ko-scan-input:disabled { opacity: 0.6; background: #f1f5f9; border-color: #cbd5e1; }

  .ko-rak-info { display: flex; justify-content: space-between; align-items: center;
    flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
  .ko-rak-code { font-family: 'Consolas','SFMono-Regular',monospace; font-weight: 800;
    font-size: 15px; color: #0021b3; }
  .ko-rak-progress { font-size: 12px; font-weight: 700; color: #16a34a; }
  .ko-btn-ganti { background: #f1f5f9; border: none; color: #475569; font-size: 12px;
    font-weight: 700; padding: 8px 14px; border-radius: 10px; cursor: pointer; }
  .ko-btn-ganti:hover { background: #e2e8f0; }

  .ko-scan-list { display: flex; flex-direction: column; gap: 6px; margin-top: 12px;
    max-height: 320px; overflow-y: auto; }
  .ko-scan-item { display: flex; justify-content: space-between; align-items: flex-start;
    background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 9px 12px; font-size: 12.5px; }
  .ko-scan-item-code { font-family: 'Consolas','SFMono-Regular',monospace; font-weight: 700; color: #166534; }
  .ko-scan-item-meta { color: #15803d; font-weight: 600; margin-top: 2px; }
  .ko-scan-batal { background: none; border: none; color: #dc2626; font-weight: 700;
    font-size: 11px; cursor: pointer; padding: 4px 6px; }

  .ko-empty { text-align: center; padding: 2.5rem 1rem; color: #94a3b8; font-size: 13.5px; }

  .ko-upload-box { border: 2px dashed #cbd5e1; border-radius: 14px; padding: 24px 16px;
    text-align: center; color: #64748b; font-size: 13px; }
  .ko-upload-input { display: block; margin: 12px auto 0; }
  .ko-btn-primary { background: #0021b3; color: #fff; border: none; border-radius: 12px;
    padding: 12px 20px; font-weight: 700; font-size: 14px; cursor: pointer; width: 100%; margin-top: 12px; }
  .ko-btn-primary:disabled { opacity: 0.6; }
  .ko-btn-primary { display: flex; align-items: center; justify-content: center; gap: 8px; }
  .ko-btn-secondary { background: #f8fafc; color: #0f172a; border: 1px solid #cbd5e1; border-radius: 10px;
    padding: 10px 14px; font-weight: 800; font-size: 12.5px; cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center; gap: 7px; }
  .ko-btn-secondary:hover { background: #f1f5f9; }
  .ko-btn-secondary:disabled { opacity: 0.55; cursor: not-allowed; }
  .ko-input { border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px; font-size: 13px;
    font-family: inherit; color: #0f172a; background: #fff; }
  .ko-input:focus { outline: none; border-color: #0021b3; box-shadow: 0 0 0 2px rgba(0,33,179,0.15); }
  .ko-btn-download { background: #16a34a; border-color: #16a34a; color: #fff; white-space: nowrap; }
  .ko-btn-download:hover { background: #15803d; border-color: #15803d; }
  .ko-spin { animation: ko-spin 0.8s linear infinite; }
  @keyframes ko-spin { to { transform: rotate(360deg); } }
  .ko-field-label { font-size: 12px; font-weight: 700; color: #475569; margin-bottom: 6px; display: block; }
  .ko-text-input { width: 100%; padding: 10px 12px; border-radius: 10px; border: 1px solid #cbd5e1;
    font-size: 14px; box-sizing: border-box; margin-bottom: 12px; }

  .ko-summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin-bottom: 14px; }
  .ko-summary-box { background: linear-gradient(135deg, #0021b3, #0038f0); border-radius: 14px;
    padding: 12px; color: #fff; text-align: center; }
  .ko-summary-box strong { display: block; font-size: 17px; font-weight: 800; }
  .ko-summary-box span { display: block; font-size: 10px; opacity: 0.85; margin-top: 2px; }
  .ko-progress-bar-outer { background: #f1f5f9; border-radius: 999px; height: 8px; overflow: hidden; margin-top: 6px; }
  .ko-progress-bar-inner { background: #16a34a; height: 100%; border-radius: 999px; }

  .ko-item-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 6px 8px;
    display: flex; align-items: center; gap: 6px; min-width: 0; cursor: pointer;
    transition: border-color 0.15s, box-shadow 0.15s; text-align: left; width: 100%;
    font: inherit; color: inherit; appearance: none; }
  .ko-item-card:hover { border-color: #94a3b8; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
  .ko-item-card .ko-item-code { font-size: 11.5px; }
  .ko-item-card .ko-item-descr { font-size: 10px; }
  .ko-item-card .ko-item-qty { font-size: 10.5px; }
  .ko-item-card .ko-radial { width: 26px; height: 26px; }
  .ko-item-card .ko-radial-label { font-size: 7.5px; }

  /* 3 status warna: putih = belum discan sama sekali, kuning = lagi proses
     (sebagian kescan), hijau = selesai/qty udah sesuai target. */
  .ko-item-card-empty { background: #fff; border-color: #e2e8f0; }
  .ko-item-card-progress { background: #fefce8; border-color: #fbbf24; }
  .ko-item-card-progress .ko-item-code { color: #92400e; }
  .ko-item-card-done { background: #f0fdf4; border-color: #4ade80; }
  .ko-item-card-done .ko-item-code { color: #166534; }
  .ko-item-card-over { background: #fef2f2; border-color: #fca5a5; }
  .ko-item-card-over .ko-item-code { color: #b91c1c; }
  .ko-item-card-over .ko-item-qty { color: #b91c1c; font-weight: 700; }

  /* Summary box variance dibikin bisa diklik buat liat rincian item yang
     belum kescan lengkap. */
  .ko-summary-box-clickable { cursor: pointer; border: none; font: inherit; text-align: center;
    color: inherit; appearance: none; }
  .ko-summary-box-clickable:hover { filter: brightness(1.08); }

  .ko-modal-detail-row { display: flex; justify-content: space-between; gap: 10px;
    font-size: 12.5px; color: #334155; padding: 4px 0; }
  .ko-modal-detail-row strong { color: #0f172a; }
  .ko-modal-section-title { font-size: 11px; font-weight: 800; color: #94a3b8;
    text-transform: uppercase; letter-spacing: 0.04em; margin: 14px 0 8px; }
  .ko-item-card-top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .ko-allstock-meta { font-size: 11.5px; color: #94a3b8; }
  .ko-allstock-meta strong { color: #334155; font-weight: 800; }
  .ko-allstock-time { color: #38bdf8; font-weight: 600; }
  .ko-item-code { font-weight: 800; font-size: 13px; color: #0021b3; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; }
  .ko-item-descr { font-size: 11px; color: #64748b; margin-top: 1px; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; }
  .ko-item-qty { font-size: 11.5px; font-weight: 700; color: #0f172a; white-space: nowrap; }
  .ko-item-qty .ko-muted { color: #94a3b8; font-weight: 500; }
  .ko-item-info { min-width: 0; flex: 1; }
  .ko-item-pic-hint { font-size: 10.5px; color: #94a3b8; margin-top: 1px; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; cursor: default; }

  /* Grid biar item2 kesusun rapet & muat banyak dalam 1 layar tanpa scroll
     panjang — sebanyak mungkin kolom yang muat (minimal 210px per kartu,
     kartu dibikin kecil biar makin banyak muat sekali pandang). */
  .ko-items-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    gap: 6px; align-items: stretch; }

  /* Progress berbentuk cincin (radial), kayak icon brightness/battery —
     lebih compact daripada bar horizontal & enak dipindai cepat sekilas. */
  .ko-radial { --pct: 0; --ring-color: #16a34a; width: 40px; height: 40px; border-radius: 50%;
    flex: none; position: relative;
    background: conic-gradient(var(--ring-color) calc(var(--pct) * 1%), #e2e8f0 0); }
  .ko-radial::after { content: ""; position: absolute; inset: 4px; border-radius: 50%; background: #fff; }
  .ko-radial-label { position: absolute; inset: 0; display: flex; align-items: center;
    justify-content: center; font-size: 9.5px; font-weight: 800; color: #0f172a; }

  .ko-dropdown { position: absolute; left: 16px; right: 16px; margin-top: -6px; background: #fff;
    border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 8px 20px rgba(0,0,0,0.1);
    max-height: 260px; overflow-y: auto; z-index: 20; }
  .ko-dropdown-item { display: flex; justify-content: space-between; gap: 8px; padding: 10px 12px;
    font-size: 13px; cursor: pointer; border-bottom: 1px solid #f1f5f9; }
  .ko-dropdown-item:hover { background: #f8fafc; }
  .ko-dropdown-item:last-child { border-bottom: none; }
  .ko-dropdown-id { font-family: 'Consolas','SFMono-Regular',monospace; font-weight: 700; color: #0021b3; }
  .ko-dropdown-name { color: #334155; }
  .ko-dropdown-empty { padding: 12px; text-align: center; font-size: 12.5px; color: #94a3b8; }

  .ko-table-toolbar { display: flex; align-items: center; gap: 12px 10px; flex-wrap: wrap; }
  .ko-search-wrap { flex: 1 1 220px; min-width: 200px; display: flex; align-items: center; gap: 8px;
    border: 1px solid #cbd5e1; border-radius: 10px; padding: 0 10px; color: #64748b; background: #fff; }
  .ko-search-wrap input { width: 100%; border: none; outline: none; padding: 11px 0;
    font-size: 13.5px; color: #0f172a; min-width: 0; }
  .ko-table-info { font-size: 12px; color: #64748b; font-weight: 700; margin-top: 10px; }
  .ko-table-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px;
    overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
  .ko-table-scroll { width: 100%; overflow-x: auto; }
  .ko-data-table { width: 100%; min-width: 940px; border-collapse: collapse; font-size: 12.5px; }
  .ko-data-table th { background: #f8fafc; color: #475569; text-align: left; font-size: 11px;
    text-transform: uppercase; letter-spacing: 0.04em; padding: 11px 12px; border-bottom: 1px solid #e2e8f0;
    white-space: nowrap; }
  /* Tabel Preview Item Request & Stok — header freeze pas discroll */
  .ko-preview-scroll { max-height: 480px; overflow-y: auto; }
  .ko-preview-scroll thead th { position: sticky; top: 0; z-index: 2;
    box-shadow: 0 1px 0 #e2e8f0; }
  .ko-data-table td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155;
    vertical-align: top; }
  .ko-data-table tr:last-child td { border-bottom: none; }
  .ko-data-table tbody tr:hover { background: #f8fafc; }
  .ko-variance-row-ok td { background: #f0fdf4; color: #15803d; }
  .ko-variance-row-diff td { background: #fef2f2; }
  .ko-variance-row-diff .ko-mono:last-child { color: #b91c1c; font-weight: 700; }
  .ko-mono { font-family: 'Consolas','SFMono-Regular',monospace; color: #0f172a; white-space: nowrap; }
  .ko-strong { font-weight: 800; color: #0021b3; white-space: nowrap; }
  .ko-table-empty { text-align: center; color: #94a3b8; padding: 24px 12px !important; }
  .ko-pagination { display: flex; align-items: center; justify-content: space-between; gap: 10px;
    padding: 12px; border-top: 1px solid #e2e8f0; background: #fff; }
  .ko-page-btn { display: inline-flex; align-items: center; justify-content: center; gap: 5px;
    min-width: 88px; border: 1px solid #cbd5e1; background: #f8fafc; color: #334155;
    border-radius: 9px; padding: 8px 11px; font-size: 12px; font-weight: 800; cursor: pointer; }
  .ko-page-btn:hover { background: #f1f5f9; }
  .ko-page-btn:disabled { opacity: 0.45; cursor: not-allowed; }
  .ko-page-status { color: #64748b; font-size: 12px; font-weight: 800; text-align: center; }
  @media (max-width: 560px) {
    .ko-table-toolbar { align-items: stretch; flex-direction: column; }
    .ko-date-filter { flex-wrap: wrap; }
    .ko-btn-download { width: 100%; }
    .ko-pagination { flex-wrap: wrap; }
    .ko-page-status { order: -1; width: 100%; }
    .ko-page-btn { flex: 1; }
  }

  .ko-cd-title-row { display: flex; align-items: flex-start; justify-content: space-between;
    gap: 10px; flex-wrap: wrap; }
  .ko-cd-title-row .ko-header { flex: 1 1 280px; margin-bottom: 14px; }
  .ko-cd-fifo-btn { width: auto; margin-top: 0; padding: 10px 18px; white-space: nowrap;
    background: #b91c1c; }
  .ko-cd-fifo-btn:hover { background: #991b1b; }
  @media (max-width: 560px) {
    .ko-cd-fifo-btn { width: 100%; }
  }

  .ko-cd-filter-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 0 12px; }
  .ko-cd-field .ko-text-input { margin-bottom: 4px; }

  .ko-cd-options-row { display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 12px; margin-top: 8px; padding-top: 12px; border-top: 1px solid #f1f5f9; }
  .ko-radio-group { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  .ko-radio-option { display: flex; align-items: center; gap: 6px; font-size: 12.5px;
    font-weight: 700; color: #334155; cursor: pointer; user-select: none; }
  .ko-radio-option input { accent-color: #0021b3; cursor: pointer; }
  .ko-cd-refresh-btn { width: auto; margin-top: 0; padding: 10px 20px; }

  .ko-cd-error { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c;
    font-size: 12.5px; font-weight: 700; padding: 12px 14px; border-radius: 12px; margin-bottom: 14px; }

  .ko-cd-stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;
    margin-bottom: 14px; }
  .ko-cd-stat-card { border-radius: 14px; padding: 14px; color: #fff; }
  .ko-cd-stat-label { display: block; font-size: 10px; font-weight: 800; text-transform: uppercase;
    letter-spacing: 0.04em; opacity: 0.85; }
  .ko-cd-stat-value { display: block; font-size: 20px; font-weight: 800; margin-top: 4px; }
  .ko-cd-stat-blue { background: linear-gradient(135deg, #0021b3, #3b5bfd); }
  .ko-cd-stat-amber { background: linear-gradient(135deg, #b45309, #f59e0b); }
  .ko-cd-stat-orange { background: linear-gradient(135deg, #c2410c, #f97316); }
  .ko-cd-stat-red { background: linear-gradient(135deg, #b91c1c, #ef4444); }

  .ko-cd-detail-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .ko-cd-detail-check { margin-left: -2px; }

  .ko-cd-actions-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    margin-top: 8px; padding-top: 12px; border-top: 1px solid #f1f5f9; }
  .ko-cd-actions-row .ko-btn-secondary { width: auto; margin-top: 0; padding: 9px 16px; }

  .ko-cd-row-count { font-size: 12.5px; font-weight: 600; color: #64748b; }
  .ko-cd-truncate-notice { background: #fffbeb; border: 1px solid #fde68a; color: #92400e;
    font-size: 12px; font-weight: 600; padding: 10px 12px; border-radius: 10px; margin-bottom: 10px; }

  /* Modal Detail All — mirip web sumber: overlay gelap, header biru tua,
     tabel dengan header sticky & scroll internal sendiri. */
  .ko-cd-modal-backdrop { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.55);
    display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 24px; }
  .ko-cd-modal { background: #fff; border-radius: 14px; width: min(1000px, 100%);
    max-height: min(720px, 90vh); display: flex; flex-direction: column; overflow: hidden;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35); }
  .ko-cd-modal-header { background: #0021b3; color: #fff; padding: 14px 20px;
    display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
  .ko-cd-modal-header h2 { margin: 0; font-size: 15px; font-weight: 800; }
  .ko-cd-modal-close { background: transparent; border: none; color: #fff; cursor: pointer;
    padding: 4px; border-radius: 6px; display: flex; align-items: center; justify-content: center; }
  .ko-cd-modal-close:hover { background: rgba(255, 255, 255, 0.15); }
  .ko-cd-modal-body { padding: 16px 20px 20px; overflow: hidden; display: flex;
    flex-direction: column; min-height: 0; }
  .ko-cd-modal-toolbar { display: flex; justify-content: flex-end; margin-bottom: 12px;
    flex-shrink: 0; }
  .ko-cd-modal-table-scroll { overflow: auto; border: 1px solid #e2e8f0; border-radius: 10px;
    min-height: 0; }
  .ko-cd-modal-table-scroll table { width: 100%; }
  .ko-cd-modal-table-scroll thead th { position: sticky; top: 0; background: #f8fafc;
    z-index: 1; box-shadow: 0 1px 0 #e2e8f0; }

  @media (max-width: 640px) {
    .ko-cd-stats-grid { grid-template-columns: repeat(2, 1fr); }
    .ko-cd-options-row { flex-direction: column; align-items: stretch; }
    .ko-cd-refresh-btn { width: 100%; }
    .ko-cd-actions-row { flex-direction: column; align-items: stretch; }
    .ko-cd-modal-backdrop { padding: 0; }
    .ko-cd-modal { max-height: 100vh; height: 100vh; border-radius: 0; }
  }
`;
