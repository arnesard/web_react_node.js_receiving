// src/pages/stok-opname-karawang/KarawangSubNav.jsx
import { Link, useLocation } from "react-router-dom";
import { ScanLine, LayoutDashboard, Upload, Home, Barcode, Boxes } from "lucide-react";

export default function KarawangSubNav() {
  const location = useLocation();
  const items = [
    { to: "/karawang", label: "Scan", icon: <ScanLine size={15} /> },
    {
      to: "/karawang/dashboard",
      label: "Dashboard",
      icon: <LayoutDashboard size={15} />,
    },
    { to: "/karawang/upload", label: "Upload Data", icon: <Upload size={15} /> },
    { to: "/karawang/barcode", label: "Barcode", icon: <Barcode size={15} /> },
    {
      to: "/karawang/cross-docking",
      label: "Cross Docking",
      icon: <Boxes size={15} />,
    },
  ];
  return (
    <div className="ko-subnav">
      <Link to="/" className="ko-home-btn" title="Kembali ke Pilih Menu">
        <Home size={17} />
      </Link>
      {items.map((it) => (
        <Link
          key={it.to}
          to={it.to}
          className={
            "ko-subnav-link" + (location.pathname === it.to ? " active" : "")
          }
          title={it.label}
        >
          {it.icon}
          <span>{it.label}</span>
        </Link>
      ))}
    </div>
  );
}
