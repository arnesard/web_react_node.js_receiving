// src/components/Layout/AppLayout.jsx
import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import {
  Home,
  LayoutDashboard,
  Package,
  FileText,
  Settings,
  Menu,
  X,
} from "lucide-react";

// Halaman yang TIDAK menampilkan navbar menu (Dashboard/Input/Laporan)
const HIDE_NAV_ON = ["/overtime", "/employees", "/transfer", "/karawang", "/control-stock"];

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: <LayoutDashboard size={16} /> },
  { to: "/production", label: "Input", icon: <Package size={16} /> },
  { to: "/reports", label: "Laporan", icon: <FileText size={16} /> },
  { to: "/settings", label: "Pengaturan", icon: <Settings size={16} /> },
];
export default function AppLayout({ children, user }) {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const showNav = !HIDE_NAV_ON.some((path) =>
    location.pathname.startsWith(path),
  );
  // Modul Transfer Rak & Control Stock dipakai fullscreen di lapangan —
  // header bar dibuang total, tombol Home dipindah ke bar sendiri punya
  // modul itu (lihat KarawangSubNav / cs-home-bar).
  const hideHeader =
    location.pathname.startsWith("/transfer") ||
    location.pathname.startsWith("/karawang") ||
    location.pathname.startsWith("/control-stock");

  return (
    <>
      <style>{`
        :root { --header-height: ${hideHeader ? "0px" : "64px"}; --primary: #0021b3; }
        * { box-sizing: border-box; }
        body { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
               background: ${hideHeader ? "#eef2f6" : "#f8fafc"};
               margin: 0; padding-top: var(--header-height); }

        /* ── HEADER ── */
        .header-bar {
          position: fixed; top: 0; left: 0; right: 0;
          height: var(--header-height);
          background: rgba(255,255,255,0.95);
          backdrop-filter: blur(8px);
          z-index: 1000;
          display: flex; align-items: center; padding: 0 1.5rem;
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
          border-bottom: 1px solid #f1f5f9;
        }
        .header-brand {
          display: flex; align-items: center; gap: 12px;
          text-decoration: none; margin-right: 2.5rem; flex-shrink: 0;
        }
        .header-brand img { height: 32px; width: auto; }
        .header-brand-text h1 {
          font-size: 11px; font-weight: 700; color: #0021b3;
          margin: 0; letter-spacing: -0.01em; text-transform: uppercase;
        }
        .header-brand-text p {
          font-size: 1rem; color: #0021b3; margin: 0;
          font-weight: 900; text-transform: uppercase;
          line-height: 1.1; letter-spacing: -0.02em;
        }

        /* ── NAV MENU ── */
        .header-nav { display: flex; align-items: center; gap: 4px; }
        .header-nav-link {
          display: flex; align-items: center; gap: 6px;
          padding: 8px 14px; border-radius: 10px;
          font-size: 13px; font-weight: 600; color: #64748b;
          text-decoration: none; transition: all 0.2s;
        }
        .header-nav-link:hover { background: #f1f5f9; color: #0021b3; }
        .header-nav-link.active { background: rgba(0,33,179,0.1); color: #0021b3; }
        .mobile-menu-btn{
    display:none;
    border:none;
    background:transparent;
    cursor:pointer;
    color:#0021b3;
    padding:8px;
}

.mobile-overlay{
    position:fixed;
    top:0;
    right:0;
    bottom:0;
    left:0;
    background:rgba(0,0,0,.35);
    z-index:999;
}

.mobile-menu{
    position:absolute;
    left:0;
    top:0;
    width:260px;
    height:100vh;
    background:white;
    box-shadow:2px 0 15px rgba(0,0,0,.2);
    display:flex;
    flex-direction:column;
    padding:20px;
    animation:slideMenu .25s ease;
}

.mobile-link{
    display:flex;
    align-items:center;
    gap:10px;
    padding:14px;
    border-radius:10px;
    color:#334155;
    text-decoration:none;
    font-weight:600;
}

.mobile-link:hover{
    background:#f1f5f9;
}

.mobile-link.active{
    background:#e8f0ff;
    color:#0021b3;
}

@keyframes slideMenu{
    from{
        transform:translateX(-100%);
    }
    to{
        transform:translateX(0);
    }
}
      @media (max-width:768px){

    .header-brand-text{
        display:none;
    }

    .header-nav{
        display:none;
    }

    .mobile-menu-btn{
        display:flex;
        align-items:center;
        justify-content:center;
    }

    .header-bar{
        justify-content:space-between;
    }

    .header-user-info{
        display:none;
    }

    .header-avatar{
        display:none;
    }
}
        /* ── USER AREA ── */
        .header-user { display: flex; align-items: center; gap: 14px; margin-left: auto; }
        .header-user-name { font-size: 13px; font-weight: 700; color: #0f172a; }
        .header-avatar {
          width: 38px; height: 38px; border-radius: 12px;
          background: #f1f5f9; display: flex; align-items: center;
          justify-content: center; color: #0d6efd;
          font-weight: 800; font-size: 15px;
        }
        .btn-header-action {
          display: flex; align-items: center; justify-content: center;
          width: 38px; height: 38px; background: transparent;
          border: 1px solid #e2e8f0; border-radius: 12px;
          color: #64748b; cursor: pointer; transition: all 0.2s;
          text-decoration: none;
        }
        .btn-header-action:hover { background: #f1f5f9; }

        /* ── MAIN ── */
        #main-content {
          max-width: 1900px; margin: 0 auto;
          padding: 1.75rem 1.5rem;
          min-height: calc(100vh - var(--header-height));
        }

        /* ── RESPONSIVE ── */
        @media (max-width: 992px) {
          .header-user-info { display: none; }
          .header-avatar { display: none; }
          #main-content { padding: 1.25rem 1rem; }
        }
        @media print {
          .header-bar { display: none !important; }
          body { padding-top: 0; }
          #main-content { padding: 0 !important; margin: 0 !important; max-width: 100%; }
        }
      `}</style>

      {/* ── HEADER BAR (dibuang total di modul Transfer Rak — fullscreen) ── */}
      {!hideHeader && (
        <header className="header-bar">
          <Link to="/" className="header-brand">
            <img src="/images/logo-gt.png" alt="GT" />

            <div className="header-brand-text">
              <p>PT Gajah Tunggal Tbk</p>
              <h1>Gudang BPW</h1>
            </div>
          </Link>

          {showNav && (
            <nav className="header-nav">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={
                    "header-nav-link" +
                    (location.pathname.startsWith(item.to) ? " active" : "")
                  }
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>
          )}

          <div className="header-user">
            <div className="header-user-info">
              <div className="header-user-name">{user?.name || "Admin"}</div>
            </div>

            <div className="header-avatar">
              {(user?.name || "A").charAt(0).toUpperCase()}
            </div>

            <Link to="/" className="btn-header-action">
              <Home size={18} />
            </Link>

            {showNav && (
              <button
                className="mobile-menu-btn"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X size={26} /> : <Menu size={26} />}
              </button>
            )}
          </div>
        </header>
      )}

      {mobileMenuOpen && (
        <div
          className="mobile-overlay"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div className="mobile-menu" onClick={(e) => e.stopPropagation()}>
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={
                  "mobile-link" +
                  (location.pathname.startsWith(item.to) ? " active" : "")
                }
                onClick={() => setMobileMenuOpen(false)}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── MAIN CONTENT ── */}
      <main id="main-content">{children}</main>
    </>
  );
}
