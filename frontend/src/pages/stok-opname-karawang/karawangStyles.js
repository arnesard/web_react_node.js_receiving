// src/pages/stok-opname-karawang/karawangStyles.js
// Style bersama semua halaman modul Stok Opname DC Karawang.
// Dibikin fullscreen mobile (sama seperti modul Monitoring Transfer),
// prefix class "ko-" biar gak tabrakan sama modul lain.
export const karawangStyles = `
  .ko-page { max-width: 720px; margin: 0 auto; padding: 16px 14px 40px; color: #1e293b; }
  .ko-page-wide { max-width: 1180px; }

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
  .ko-btn-download { background: #16a34a; border-color: #16a34a; color: #fff; white-space: nowrap; }
  .ko-btn-download:hover { background: #15803d; border-color: #15803d; }
  .ko-spin { animation: ko-spin 0.8s linear infinite; }
  @keyframes ko-spin { to { transform: rotate(360deg); } }
  .ko-field-label { font-size: 12px; font-weight: 700; color: #475569; margin-bottom: 6px; display: block; }
  .ko-text-input { width: 100%; padding: 10px 12px; border-radius: 10px; border: 1px solid #cbd5e1;
    font-size: 14px; box-sizing: border-box; margin-bottom: 12px; }

  .ko-summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 14px; }
  .ko-summary-box { background: linear-gradient(135deg, #0021b3, #0038f0); border-radius: 14px;
    padding: 12px; color: #fff; text-align: center; }
  .ko-summary-box strong { display: block; font-size: 17px; font-weight: 800; }
  .ko-summary-box span { display: block; font-size: 10px; opacity: 0.85; margin-top: 2px; }
  .ko-progress-bar-outer { background: #f1f5f9; border-radius: 999px; height: 8px; overflow: hidden; margin-top: 6px; }
  .ko-progress-bar-inner { background: #16a34a; height: 100%; border-radius: 999px; }

  .ko-item-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 12px 14px;
    margin-bottom: 8px; }
  .ko-item-card-top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .ko-item-code { font-weight: 800; font-size: 13.5px; color: #0021b3; }
  .ko-item-descr { font-size: 11.5px; color: #64748b; margin-top: 2px; }
  .ko-item-qty { font-size: 12px; font-weight: 700; color: #0f172a; white-space: nowrap; }
  .ko-item-qty .ko-muted { color: #94a3b8; font-weight: 500; }

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
  .ko-data-table td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155;
    vertical-align: top; }
  .ko-data-table tr:last-child td { border-bottom: none; }
  .ko-data-table tbody tr:hover { background: #f8fafc; }
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
`;
