// src/pages/tube-barcode/tubeShared.jsx
// Komponen & style bersama modul Barcode Tube. Sengaja dibikin SEDERHANA
// buat HP/PDT jadul (WebView Android lama): gak pake CSS grid, `gap`,
// CSS variable, ataupun library UI — cuma block/inline-block + font gede.
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import api from "../../api/axiosInstance";

export const tubeStyles = `
  .tb-page, .tb-page * { box-sizing:border-box; }
  .tb-page { background:#eef2f6; min-height:100vh; max-width:100%; overflow-x:hidden; padding:0 0 24px; font-family:Arial,Helvetica,sans-serif; color:#0f172a; word-wrap:break-word; overflow-wrap:break-word; }
  .tb-top { background:#0021b3; color:#fff; padding:7px 8px; overflow:hidden; }
  .tb-top a { color:#fff; text-decoration:none; font-size:11px; font-weight:bold; float:right; padding:2px 0; }
  .tb-title { font-size:13px; font-weight:bold; letter-spacing:.5px; }
  .tb-nav { background:#fff; border-bottom:1px solid #cbd5e1; overflow:hidden; }
  .tb-nav a { display:block; float:left; width:25%; text-align:center; padding:7px 0; font-size:10px; font-weight:bold; color:#475569; text-decoration:none; border-bottom:3px solid transparent; }
  .tb-nav a.on { color:#0021b3; border-bottom-color:#0021b3; background:#eff4ff; }
  .tb-body { padding:6px; }
  .tb-card { background:#fff; border:1px solid #cbd5e1; border-radius:8px; padding:8px; margin-bottom:6px; }
  .tb-label { display:block; font-size:10px; font-weight:bold; color:#475569; margin:6px 0 2px; text-transform:uppercase; }
  .tb-label:first-child { margin-top:0; }
  .tb-input, .tb-select { display:block; width:100%; font-size:14px; padding:7px 8px; border:1.5px solid #94a3b8; border-radius:6px; background:#fff; color:#0f172a; }
  .tb-input:focus, .tb-select:focus { border-color:#0021b3; outline:none; background:#f8faff; }
  .tb-input[readonly] { background:#e2e8f0; }
  .tb-btn { display:block; width:100%; font-size:13px; font-weight:bold; padding:9px 8px; margin-top:6px; border:0; border-radius:6px; background:#0021b3; color:#fff; text-align:center; text-decoration:none; }
  .tb-btn.green { background:#15803d; }
  .tb-btn.red { background:#b91c1c; }
  .tb-btn.gray { background:#64748b; }
  .tb-btn.amber { background:#b45309; }
  .tb-btn:disabled { opacity:.5; }
  .tb-msg { padding:6px 8px; border-radius:6px; font-size:12px; font-weight:bold; margin-bottom:6px; border:1px solid; }
  .tb-msg.ok { background:#dcfce7; color:#166534; border-color:#86efac; }
  .tb-msg.err { background:#fee2e2; color:#991b1b; border-color:#fca5a5; }
  .tb-msg.warn { background:#fef3c7; color:#92400e; border-color:#fcd34d; }
  .tb-row { border-top:1px solid #e2e8f0; padding:5px 0; font-size:12px; line-height:1.4; }
  .tb-row:first-child { border-top:0; }
  .tb-k { color:#64748b; font-size:10px; }
  .tb-big { font-size:15px; font-weight:bold; }
  .tb-badge { display:inline-block; font-size:9px; font-weight:bold; padding:1px 6px; border-radius:10px; color:#fff; background:#64748b; }
  .tb-badge.ok { background:#15803d; } .tb-badge.pend { background:#b45309; } .tb-badge.bad { background:#b91c1c; }
  .tb-menu a { display:block; background:#fff; border:1.5px solid #0021b3; border-radius:8px; padding:11px 10px; margin-bottom:6px; text-decoration:none; color:#0021b3; }
  .tb-menu .t { font-size:14px; font-weight:bold; }
  .tb-menu .d { font-size:10px; color:#64748b; margin-top:2px; }
  .tb-tabs { overflow:hidden; margin-bottom:6px; }
  .tb-tabs button { float:left; width:50%; font-size:12px; font-weight:bold; padding:8px 0; border:1.5px solid #0021b3; background:#fff; color:#0021b3; }
  .tb-tabs button.on { background:#0021b3; color:#fff; }
  .tb-pick { display:block; width:100%; text-align:left; font-size:12px; padding:6px 8px; margin-bottom:4px; border:1.5px solid #94a3b8; border-radius:6px; background:#fff; color:#0f172a; }
  .tb-pick.on { border-color:#0021b3; background:#eff4ff; }
  .tb-combo { position:relative; }
  .tb-opts { position:absolute; left:0; right:0; top:100%; margin-top:2px; background:#fff; border:1.5px solid #0021b3; border-radius:6px; max-height:180px; overflow-y:auto; z-index:50; box-shadow:0 6px 16px rgba(0,0,0,.25); }
  .tb-opt { padding:7px 8px; font-size:13px; border-bottom:1px solid #e2e8f0; }
  .tb-opt:last-child { border-bottom:0; }
  .tb-opt small { color:#64748b; font-size:11px; }
  .tb-opt-empty { color:#64748b; font-size:12px; }
`;

const NAV = [
  { to: "/tube-barcode/scan", label: "Scan Collie" },
  { to: "/tube-barcode/receive", label: "Receive" },
  { to: "/tube-barcode/transfer", label: "Transfer" },
  { to: "/tube-barcode/monitoring", label: "Monitoring" },
];

export function TubeShell({ title, children, showNav = true }) {
  const { pathname } = useLocation();
  return (
    <div className="tb-page">
      <style>{tubeStyles}</style>
      <div className="tb-top">
        <Link to={showNav ? "/tube-barcode" : "/"}>{showNav ? "MENU" : "HOME"}</Link>
        <div className="tb-title">{title}</div>
      </div>
      {showNav && (
        <div className="tb-nav">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className={pathname === n.to ? "on" : ""}>
              {n.label}
            </Link>
          ))}
        </div>
      )}
      <div className="tb-body">{children}</div>
    </div>
  );
}

export function Msg({ msg }) {
  if (!msg || !msg.text) return null;
  return <div className={"tb-msg " + (msg.type || "ok")}>{msg.text}</div>;
}

export const errText = (err) =>
  (err && err.response && err.response.data && err.response.data.message) ||
  (err && err.message) ||
  "Terjadi kesalahan";

// Enter di scanner = keyCode 13. Dipakai biar Enter pindah field.
export const onEnter = (fn) => (e) => {
  if (e.key === "Enter" || e.keyCode === 13) {
    e.preventDefault();
    fn(e);
  }
};

export const up = (v) => String(v || "").toUpperCase();

// Operator / PIC dari database (tabel employees): dropdown "Nama - ID".
const OP_KEY = "tube_operator";
export function useEmployees() {
  const [list, setList] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api
      .get("/tube-barcode/employees")
      .then((res) => setList(res.data.data || []))
      .catch((err) => setError(errText(err)));
  }, []);
  return { list, error };
}

export function usePersistedOperator() {
  const [id, setId] = useState(() => {
    try {
      return sessionStorage.getItem(OP_KEY) || "";
    } catch {
      return "";
    }
  });
  const set = (v) => {
    setId(v);
    try {
      sessionStorage.setItem(OP_KEY, v);
    } catch {
      /* abaikan */
    }
  };
  return [id, set];
}

// Satu kolom aja: ketik nama ATAU no peneng (ID card), langsung pilih dari
// daftar. Enter milih kalau ID-nya persis sama / hasil tinggal satu (enak
// buat scan barcode peneng).
export function OperatorSelect({ label, value, onChange, list, onPick }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  const picked = list.filter((e) => String(e.employee_id) === String(value))[0];
  const shown = editing
    ? text
    : picked
      ? picked.name + " - " + picked.employee_id
      : text;

  const q = text.trim().toLowerCase();
  const matches = !q
    ? list.slice(0, 8)
    : list
        .filter(
          (e) =>
            String(e.name || "").toLowerCase().indexOf(q) !== -1 ||
            String(e.employee_id || "").toLowerCase().indexOf(q) !== -1,
        )
        .slice(0, 8);

  const choose = (e) => {
    onChange(String(e.employee_id));
    setText("");
    setEditing(false);
    setOpen(false);
    if (onPick) onPick(e);
  };

  const onKey = (ev) => {
    if (ev.key !== "Enter" && ev.keyCode !== 13) return;
    ev.preventDefault();
    const exact = list.filter(
      (e) => String(e.employee_id).toLowerCase() === q,
    )[0];
    if (exact) return choose(exact);
    if (matches.length === 1) return choose(matches[0]);
  };

  return (
    <div className="tb-combo">
      <label className="tb-label">{label}</label>
      <input
        className="tb-input"
        autoComplete="off"
        value={shown}
        placeholder="ketik nama / no peneng"
        onFocus={(ev) => {
          setEditing(true);
          setText("");
          setOpen(true);
          ev.target.select();
        }}
        onChange={(ev) => {
          setText(ev.target.value);
          setEditing(true);
          setOpen(true);
          if (value) onChange("");
        }}
        onKeyDown={onKey}
        onBlur={() =>
          setTimeout(() => {
            setOpen(false);
            setEditing(false);
          }, 200)
        }
      />
      {open && (
        <div className="tb-opts">
          {matches.length === 0 && (
            <div className="tb-opt tb-opt-empty">Tidak ditemukan</div>
          )}
          {matches.map((e) => (
            <div
              key={e.employee_id}
              className="tb-opt"
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => choose(e)}
            >
              {e.name} <small>{e.employee_id}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
