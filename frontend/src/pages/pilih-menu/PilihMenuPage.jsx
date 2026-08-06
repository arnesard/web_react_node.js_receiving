// src/pages/PilihMenu/Index.jsx
import { Link } from "react-router-dom";
import {
  Package,
  Repeat,
  Clock,
  ShieldAlert,
  FileText,
  Users,
  LogOut,
  Search,
  Warehouse,
} from "lucide-react";

const menuItems = [
  {
    to: "/production",
    icon: <Package size={20} />,
    label: "Penerimaan Produksi",
  },
  {
    to: "/transfer",
    icon: <Repeat size={20} />,
    label: "Monitoring Transfer Rak",
  },
  { to: "/overtime", icon: <Clock size={20} />, label: "Input Lembur" },
  { to: "/employees", icon: <Users size={20} />, label: "Karyawan" },
  {
    to: "/control-stock",
    icon: <Search size={20} />,
    label: "Control Stock",
  },
  {
    to: "/karawang",
    icon: <Warehouse size={20} />,
    label: "DC Karawang",
  },
];

export default function PilihMenu() {
  const handleLogout = () => {
    // nanti diisi logic logout (hapus token, redirect ke login)
    console.log("Logout clicked");
  };

  return (
    <div
      style={{
        margin: 0,
        minHeight: "100vh",
        fontFamily: "'Segoe UI', sans-serif",
        background: "radial-gradient(circle at top, #1e293b, #020617)",
        color: "#e2e8f0",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <style>{`
        .pm-card-menu {
          display: flex; align-items: center; gap: 16px;
          padding: 18px; border-radius: 18px;
          background: rgba(255,255,255,0.04);
          backdrop-filter: blur(10px);
          text-decoration: none; color: #e2e8f0;
          transition: 0.25s ease;
          border: 1px solid rgba(255,255,255,0.06);
        }
        .pm-card-menu:hover {
          transform: translateY(-5px);
          border-color: #3b82f6;
          background: rgba(59,130,246,0.15);
          box-shadow: 0 10px 25px rgba(59,130,246,0.25);
          color: #e2e8f0;
        }
        .pm-icon-box {
          width: 45px; height: 45px; border-radius: 14px;
          background: rgba(59,130,246,0.2);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .pm-logout-btn {
          width: 100%; display: flex; align-items: center;
          justify-content: center; gap: 10px;
          padding: 14px; margin-top: 10px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(239,68,68,0.08);
          color: #fca5a5; font-weight: 600; font-size: 14px;
          cursor: pointer; transition: 0.25s ease;
        }
        .pm-logout-btn:hover {
          background: rgba(239,68,68,0.18);
          border-color: rgba(239,68,68,0.4);
          transform: translateY(-3px);
          box-shadow: 0 10px 25px rgba(239,68,68,0.2);
        }
      `}</style>

      <div style={{ maxWidth: 420, width: "100%" }}>
        <div
          style={{
            textAlign: "center",
            fontSize: 22,
            fontWeight: 800,
            marginBottom: 30,
            letterSpacing: 1,
          }}
        >
          PILIH MENU
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {menuItems.map((item) => (
            <Link key={item.to} to={item.to} className="pm-card-menu">
              <div className="pm-icon-box">{item.icon}</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{item.label}</div>
            </Link>
          ))}

          <button className="pm-logout-btn" onClick={handleLogout}>
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </div>
  );
}
