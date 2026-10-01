// src/pages/tube-barcode/TubeBarcodeHome.jsx
import { Link } from "react-router-dom";
import { TubeShell } from "./tubeShared";

const MENUS = [
  { to: "/tube-barcode/scan", t: "SCAN COLLIE", d: "Penerimaan produksi: scan rak, collie, item, qty, SN" },
  { to: "/tube-barcode/receive", t: "RECEIVE", d: "Cek data per rak & approve" },
  { to: "/tube-barcode/transfer", t: "TRANSFER", d: "Pindah rak / collie (kurangi & tambah tube)" },
  { to: "/tube-barcode/monitoring", t: "MONITORING", d: "Siapa scan, siapa approve, nempel di tire mana" },
];

export default function TubeBarcodeHome() {
  return (
    <TubeShell title="BARCODE TUBE" showNav={false}>
      <div className="tb-menu">
        {MENUS.map((m) => (
          <Link key={m.to} to={m.to}>
            <div className="t">{m.t}</div>
            <div className="d">{m.d}</div>
          </Link>
        ))}
      </div>
    </TubeShell>
  );
}
