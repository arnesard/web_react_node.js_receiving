// src/pages/PilihMenu/Index.jsx
import { Link } from "react-router-dom";
import {
  Package,
  Repeat,
  Clock,
  Users,
  Search,
  Warehouse,
  Barcode,
  Activity,
  ArrowUpRight,
  Radio,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";

const menuItems = [
  {
    to: "/production",
    icon: Package,
    label: "Penerimaan Produksi",
    desc: "Monitoring & input penerimaan",
    tag: "INBOUND",
  },
  {
    to: "/transfer",
    icon: Repeat,
    label: "Monitoring Transfer Rak",
    desc: "Monitoring perpindahan rack",
    tag: "TRANSFER",
  },
  {
    to: "/overtime",
    icon: Clock,
    label: "Input Lembur",
    desc: "Pengelolaan data lembur",
    tag: "OVERTIME",
  },
  {
    to: "/employees",
    icon: Users,
    label: "Karyawan",
    desc: "Data & informasi karyawan",
    tag: "MASTER",
  },
  {
    to: "/control-stock",
    icon: Search,
    label: "Control Stock",
    desc: "Kontrol dan validasi stock",
    tag: "STOCK",
  },
  {
    to: "/karawang",
    icon: Warehouse,
    label: "DC Karawang",
    desc: "Warehouse monitoring center",
    tag: "DC-KRW",
  },
  {
    to: "/barcode",
    icon: Barcode,
    label: "Barcode Tracer",
    desc: "Tracking barcode & history",
    tag: "TRACE",
  },
];

export default function PilihMenu() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formattedTime = time.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const formattedDate = time.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="pm-page">
      <style>{`
        * {
          box-sizing: border-box;
        }

        .pm-page {
          min-height: 100vh;
          width: 100%;
          overflow-x: hidden;
          position: relative;
          color: #e8eefc;
          font-family:
            Inter,
            "Segoe UI",
            Arial,
            sans-serif;

          background:
            radial-gradient(
              circle at 15% 10%,
              rgba(37, 99, 235, 0.18),
              transparent 28%
            ),
            radial-gradient(
              circle at 90% 20%,
              rgba(6, 182, 212, 0.12),
              transparent 25%
            ),
            radial-gradient(
              circle at 50% 100%,
              rgba(59, 130, 246, 0.10),
              transparent 35%
            ),
            #050b18;
        }

        /* =========================
           FUTURISTIC GRID
        ========================= */

        .pm-grid-bg {
          position: fixed;
          inset: 0;
          pointer-events: none;
          opacity: 0.22;

          background-image:
            linear-gradient(
              rgba(96, 165, 250, 0.07) 1px,
              transparent 1px
            ),
            linear-gradient(
              90deg,
              rgba(96, 165, 250, 0.07) 1px,
              transparent 1px
            );

          background-size: 42px 42px;

          mask-image: linear-gradient(
            to bottom,
            black,
            transparent 90%
          );
        }

        .pm-glow {
          position: fixed;
          width: 500px;
          height: 500px;
          border-radius: 50%;
          pointer-events: none;
          filter: blur(100px);
          opacity: 0.10;
          background: #2563eb;
          top: -220px;
          left: 50%;
          transform: translateX(-50%);
        }

        /* =========================
           MAIN CONTAINER
        ========================= */

        .pm-container {
          position: relative;
          z-index: 2;
          width: min(1100px, calc(100% - 36px));
          margin: 0 auto;
          padding: 32px 0 40px;
        }

        /* =========================
           TOP BAR
        ========================= */

        .pm-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 34px;
        }

        .pm-brand {
          display: flex;
          align-items: center;
          gap: 13px;
        }

        .pm-brand-logo {
          width: 46px;
          height: 46px;
          border-radius: 14px;

          display: flex;
          align-items: center;
          justify-content: center;

          background:
            linear-gradient(
              145deg,
              rgba(59, 130, 246, 0.32),
              rgba(14, 165, 233, 0.08)
            );

          border: 1px solid rgba(96, 165, 250, 0.28);

          box-shadow:
            0 0 25px rgba(37, 99, 235, 0.16),
            inset 0 0 20px rgba(59, 130, 246, 0.08);

          color: #60a5fa;
        }

        .pm-brand-title {
          font-size: 14px;
          font-weight: 800;
          letter-spacing: 1.5px;
          color: #f1f5ff;
        }

        .pm-brand-sub {
          margin-top: 3px;
          font-size: 10px;
          color: #64748b;
          letter-spacing: 1.2px;
        }

        .pm-status {
          display: flex;
          align-items: center;
          gap: 9px;

          padding: 8px 13px;
          border-radius: 30px;

          background: rgba(16, 185, 129, 0.06);
          border: 1px solid rgba(16, 185, 129, 0.16);

          font-size: 10px;
          font-weight: 800;
          letter-spacing: 1px;
          color: #6ee7b7;
        }

        .pm-status-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #22c55e;

          box-shadow:
            0 0 0 4px rgba(34, 197, 94, 0.08),
            0 0 14px rgba(34, 197, 94, 0.8);

          animation: pmPulse 1.8s infinite;
        }

        @keyframes pmPulse {
          0%, 100% {
            opacity: 1;
          }

          50% {
            opacity: 0.4;
          }
        }

        /* =========================
           HERO
        ========================= */

        .pm-hero {
          margin-bottom: 28px;
        }

        .pm-eyebrow {
          display: flex;
          align-items: center;
          gap: 8px;

          color: #60a5fa;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 2px;
          margin-bottom: 10px;
        }

        .pm-eyebrow-line {
          width: 30px;
          height: 1px;
          background: #3b82f6;
          box-shadow: 0 0 8px #3b82f6;
        }

        .pm-title {
          margin: 0;

          font-size: clamp(30px, 5vw, 48px);
          line-height: 1;
          font-weight: 900;
          letter-spacing: -1.8px;

          background:
            linear-gradient(
              100deg,
              #ffffff 15%,
              #bfdbfe 48%,
              #60a5fa 100%
            );

          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .pm-description {
          margin-top: 12px;
          max-width: 650px;

          color: #71829f;
          font-size: 13px;
          line-height: 1.6;
        }

        /* =========================
           INFO STRIP
        ========================= */

        .pm-info-strip {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 10px;
          margin-bottom: 24px;
        }

        .pm-info {
          padding: 13px 15px;
          border-radius: 12px;

          background: rgba(15, 23, 42, 0.58);
          border: 1px solid rgba(148, 163, 184, 0.09);

          display: flex;
          align-items: center;
          gap: 11px;
        }

        .pm-info-icon {
          width: 30px;
          height: 30px;
          border-radius: 9px;

          display: flex;
          align-items: center;
          justify-content: center;

          background: rgba(59, 130, 246, 0.10);
          color: #60a5fa;
        }

        .pm-info-label {
          color: #52617a;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 1px;
        }

        .pm-info-value {
          margin-top: 2px;
          color: #dbeafe;
          font-size: 12px;
          font-weight: 700;
        }

        /* =========================
           MENU HEADER
        ========================= */

        .pm-menu-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }

        .pm-menu-title {
          font-size: 11px;
          font-weight: 800;
          color: #64748b;
          letter-spacing: 1.5px;
        }

        .pm-menu-count {
          font-size: 10px;
          color: #334155;
          font-weight: 700;
        }

        /* =========================
           MENU GRID
        ========================= */

        .pm-menu-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .pm-card-menu {
          position: relative;
          min-height: 128px;
          padding: 19px;

          display: flex;
          align-items: center;
          gap: 16px;

          text-decoration: none;
          color: #e2e8f0;

          overflow: hidden;

          background:
            linear-gradient(
              145deg,
              rgba(30, 41, 59, 0.76),
              rgba(15, 23, 42, 0.70)
            );

          border: 1px solid rgba(148, 163, 184, 0.09);
          border-radius: 18px;

          box-shadow:
            0 15px 35px rgba(0, 0, 0, 0.18),
            inset 0 1px rgba(255, 255, 255, 0.025);

          transition:
            transform 0.25s ease,
            border-color 0.25s ease,
            background 0.25s ease,
            box-shadow 0.25s ease;
        }

        /* top futuristic line */

        .pm-card-menu::before {
          content: "";
          position: absolute;
          top: 0;
          left: 22px;
          right: 22px;
          height: 1px;

          background:
            linear-gradient(
              90deg,
              transparent,
              rgba(96, 165, 250, 0.55),
              transparent
            );

          opacity: 0.25;
          transition: 0.25s;
        }

        /* hover glow */

        .pm-card-menu::after {
          content: "";
          position: absolute;
          width: 180px;
          height: 180px;
          border-radius: 50%;

          right: -110px;
          bottom: -120px;

          background: rgba(37, 99, 235, 0.18);
          filter: blur(30px);

          transition: 0.35s;
        }

        .pm-card-menu:hover {
          transform: translateY(-4px);

          border-color: rgba(59, 130, 246, 0.42);

          background:
            linear-gradient(
              145deg,
              rgba(30, 64, 175, 0.18),
              rgba(15, 23, 42, 0.88)
            );

          box-shadow:
            0 18px 40px rgba(0, 0, 0, 0.30),
            0 0 28px rgba(37, 99, 235, 0.10);
        }

        .pm-card-menu:hover::before {
          opacity: 1;
        }

        .pm-card-menu:hover::after {
          right: -40px;
          bottom: -60px;
        }

        /* =========================
           NUMBER
        ========================= */

        .pm-number {
          position: absolute;
          top: 12px;
          right: 15px;

          color: rgba(148, 163, 184, 0.18);
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 1px;
        }

        /* =========================
           ICON
        ========================= */

        .pm-icon-box {
          position: relative;
          z-index: 2;

          width: 52px;
          height: 52px;
          min-width: 52px;

          border-radius: 15px;

          display: flex;
          align-items: center;
          justify-content: center;

          color: #93c5fd;

          background:
            linear-gradient(
              145deg,
              rgba(59, 130, 246, 0.20),
              rgba(37, 99, 235, 0.06)
            );

          border: 1px solid rgba(96, 165, 250, 0.15);

          box-shadow:
            inset 0 0 20px rgba(59, 130, 246, 0.06),
            0 0 18px rgba(37, 99, 235, 0.05);

          transition: 0.25s;
        }

        .pm-card-menu:hover .pm-icon-box {
          transform: scale(1.06);
          color: #dbeafe;

          border-color: rgba(96, 165, 250, 0.4);

          box-shadow:
            0 0 25px rgba(59, 130, 246, 0.18),
            inset 0 0 20px rgba(59, 130, 246, 0.10);
        }

        /* =========================
           CONTENT
        ========================= */

        .pm-card-content {
          position: relative;
          z-index: 2;
          min-width: 0;
          flex: 1;
        }

        .pm-card-tag {
          display: inline-block;
          margin-bottom: 7px;

          color: #60a5fa;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 1.2px;
        }

        .pm-card-label {
          color: #e5edf9;
          font-size: 14px;
          font-weight: 800;
          line-height: 1.25;
        }

        .pm-card-desc {
          margin-top: 5px;

          color: #64748b;
          font-size: 10px;
          line-height: 1.4;
        }

        .pm-arrow {
          position: relative;
          z-index: 2;

          width: 29px;
          height: 29px;
          min-width: 29px;

          border-radius: 50%;

          display: flex;
          align-items: center;
          justify-content: center;

          color: #475569;

          border: 1px solid rgba(148, 163, 184, 0.08);

          transition: 0.25s;
        }

        .pm-card-menu:hover .pm-arrow {
          color: #93c5fd;
          border-color: rgba(96, 165, 250, 0.25);
          transform: translate(2px, -2px);
        }

        /* =========================
           FOOTER
        ========================= */

        .pm-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;

          margin-top: 24px;
          padding-top: 15px;

          border-top: 1px solid rgba(148, 163, 184, 0.07);

          color: #334155;
          font-size: 9px;
          letter-spacing: 0.7px;
        }

        .pm-footer-system {
          display: flex;
          align-items: center;
          gap: 7px;
        }

        .pm-footer-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #22c55e;
          box-shadow: 0 0 8px #22c55e;
        }

        /* =========================
           RESPONSIVE
        ========================= */

        @media (max-width: 700px) {
          .pm-container {
            width: calc(100% - 24px);
            padding-top: 20px;
          }

          .pm-topbar {
            margin-bottom: 25px;
          }

          .pm-status {
            display: none;
          }

          .pm-brand-title {
            font-size: 12px;
          }

          .pm-title {
            font-size: 34px;
          }

          .pm-description {
            font-size: 11px;
          }

          .pm-info-strip {
            grid-template-columns: 1fr;
            gap: 7px;
          }

          .pm-info {
            padding: 10px 12px;
          }

          .pm-menu-grid {
            grid-template-columns: 1fr;
          }

          .pm-card-menu {
            min-height: 100px;
            padding: 16px;
          }

          .pm-icon-box {
            width: 46px;
            height: 46px;
            min-width: 46px;
          }

          .pm-card-label {
            font-size: 13px;
          }

          .pm-footer {
            flex-direction: column;
            align-items: flex-start;
            gap: 7px;
          }
        }

        /* =========================
           SMALL PDT SCREEN
        ========================= */

        @media (max-width: 420px) {
          .pm-container {
            width: calc(100% - 18px);
            padding-top: 14px;
          }

          .pm-brand-logo {
            width: 40px;
            height: 40px;
          }

          .pm-brand-title {
            font-size: 11px;
          }

          .pm-title {
            font-size: 29px;
          }

          .pm-description {
            font-size: 10px;
          }

          .pm-card-menu {
            min-height: 88px;
            border-radius: 15px;
          }

          .pm-icon-box {
            width: 42px;
            height: 42px;
            min-width: 42px;
            border-radius: 12px;
          }

          .pm-card-desc {
            font-size: 9px;
          }
        }
      `}</style>

      {/* FUTURISTIC BACKGROUND */}
      <div className="pm-grid-bg" />
      <div className="pm-glow" />

      <main className="pm-container">
        {/* =========================
            TOP BAR
        ========================= */}

        <header className="pm-topbar">
          <div className="pm-brand">
            <div className="pm-brand-logo">
              <Warehouse size={22} strokeWidth={1.8} />
            </div>

            <div>
              <div className="pm-brand-title">WAREHOUSE CONTROL</div>

              <div className="pm-brand-sub">PRODUCT WAREHOUSE SYSTEM</div>
            </div>
          </div>

          <div className="pm-status">
            <span className="pm-status-dot" />
            SYSTEM ONLINE
          </div>
        </header>

        {/* =========================
            HERO
        ========================= */}

        <section className="pm-hero">
          <div className="pm-eyebrow">
            <span className="pm-eyebrow-line" />
            CONTROL CENTER
          </div>

          <h8 className="pm-title">PILIH MENU</h8>

          <p className="pm-description">
            Centralized warehouse operation platform untuk monitoring, tracking,
            stock control dan aktivitas operasional warehouse.
          </p>
        </section>

        {/* =========================
            SYSTEM INFO
        ========================= */}

        <section className="pm-info-strip">
          <div className="pm-info">
            <div className="pm-info-icon">
              <Activity size={16} />
            </div>

            <div>
              <div className="pm-info-label">SYSTEM STATUS</div>

              <div className="pm-info-value">Operational</div>
            </div>
          </div>

          <div className="pm-info">
            <div className="pm-info-icon">
              <Radio size={16} />
            </div>

            <div>
              <div className="pm-info-label">CURRENT TIME</div>

              <div className="pm-info-value">{formattedTime} WIB</div>
            </div>
          </div>

          <div className="pm-info">
            <div className="pm-info-icon">
              <ShieldCheck size={16} />
            </div>

            <div>
              <div className="pm-info-label">ACCESS LEVEL</div>

              <div className="pm-info-value">Authorized</div>
            </div>
          </div>
        </section>

        {/* =========================
            MENU
        ========================= */}

        <div className="pm-menu-header">
          <div className="pm-menu-title">OPERATION MODULES</div>

          <div className="pm-menu-count">
            {String(menuItems.length).padStart(2, "0")} MODULES
          </div>
        </div>

        <section className="pm-menu-grid">
          {menuItems.map((item, index) => {
            const Icon = item.icon;

            return (
              <Link key={item.to} to={item.to} className="pm-card-menu">
                <span className="pm-number">
                  {String(index + 1).padStart(2, "0")}
                </span>

                <div className="pm-icon-box">
                  <Icon size={23} strokeWidth={1.8} />
                </div>

                <div className="pm-card-content">
                  <div className="pm-card-tag">{item.tag}</div>

                  <div className="pm-card-label">{item.label}</div>

                  <div className="pm-card-desc">{item.desc}</div>
                </div>

                <div className="pm-arrow">
                  <ArrowUpRight size={14} />
                </div>
              </Link>
            );
          })}
        </section>

        {/* =========================
            FOOTER
        ========================= */}

        <footer className="pm-footer">
          <div>{formattedDate}</div>

          <div className="pm-footer-system">
            <span className="pm-footer-dot" />
            WAREHOUSE DIGITAL PLATFORM
          </div>
        </footer>
      </main>
    </div>
  );
}
