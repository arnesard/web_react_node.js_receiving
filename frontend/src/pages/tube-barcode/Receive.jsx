// src/pages/tube-barcode/Receive.jsx
// Pilih PIC (nama + ID card dari DB) -> scan rak -> muncul data PENDING
// (PIC, rak, collie, item + deskripsi, qty, SN, waktu) -> tombol Approve.
import { useState, useRef, useEffect } from "react";
import api from "../../api/axiosInstance";
import {
  TubeShell,
  Msg,
  errText,
  onEnter,
  up,
  useEmployees,
  usePersistedOperator,
  OperatorSelect,
} from "./tubeShared";

export default function Receive() {
  const { list, error } = useEmployees();
  const [pic, setPic] = usePersistedOperator();
  const [rackInput, setRackInput] = useState("");
  const [rack, setRack] = useState("");
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const rackRef = useRef(null);

  useEffect(() => {
    if (rackRef.current) rackRef.current.focus();
  }, []);

  const load = (r, keepMsg) => {
    setLoading(true);
    if (!keepMsg) setMsg(null);
    api
      .get("/tube-barcode/receive", { params: { rack: r } })
      .then((res) => {
        setRack(r);
        setRows(res.data.data || []);
      })
      .catch((err) => {
        setRows(null);
        setMsg({ type: "err", text: errText(err) });
      })
      .then(() => setLoading(false));
  };

  const scanRack = () => {
    if (!pic) return setMsg({ type: "err", text: "Pilih PIC dulu." });
    const r = up(rackInput).trim();
    if (!r) return setMsg({ type: "err", text: "Scan rak dulu." });
    load(r);
  };

  const approve = () => {
    if (!rows || !rows.length) return;
    const total = rows.reduce((a, r) => a + Number(r.qty), 0);
    if (
      !window.confirm(
        "Approve " +
          rows.length +
          " collie (total qty " +
          total +
          ") di rak " +
          rack +
          "?",
      )
    )
      return;
    setLoading(true);
    api
      .post("/tube-barcode/receive/approve", { pic_id: pic, rack_code: rack })
      .then((res) => {
        setMsg({
          type: "ok",
          text:
            "Approved " +
            res.data.data.approved +
            " collie, total qty " +
            res.data.data.total_qty,
        });
        setRackInput("");
        load(rack, true);
        setTimeout(() => rackRef.current && rackRef.current.focus(), 50);
      })
      .catch((err) => {
        setMsg({ type: "err", text: errText(err) });
        setLoading(false);
      });
  };

  return (
    <TubeShell title="RECEIVE">
      <Msg msg={error ? { type: "err", text: error } : msg} />
      <div className="tb-card">
        <OperatorSelect
          label="PIC"
          value={pic}
          onChange={setPic}
          list={list}
          onPick={() =>
            setTimeout(() => rackRef.current && rackRef.current.focus(), 50)
          }
        />
        <label className="tb-label">Scan Rak</label>
        <input
          ref={rackRef}
          className="tb-input"
          autoComplete="off"
          value={rackInput}
          onChange={(e) => setRackInput(up(e.target.value))}
          onKeyDown={onEnter(scanRack)}
          placeholder="scan rak lalu Enter"
        />
        <button className="tb-btn" disabled={loading} onClick={scanRack}>
          {loading ? "MEMUAT..." : "CARI"}
        </button>
      </div>

      {rows && (
        <div className="tb-card">
          <div className="tb-k">RAK</div>
          <div className="tb-big">{rack}</div>
          {rows.length === 0 && (
            <div className="tb-row">
              Tidak ada data yang menunggu approve di rak ini.
            </div>
          )}
          {rows.map((r) => (
            <div className="tb-row" key={r.id}>
              <span className="tb-k">PIC</span> {r.pic_name} ({r.pic_id})
              <br />
              <span className="tb-k">Rak</span> {r.rack_code} &nbsp;
              <span className="tb-k">Collie</span> <b>{r.collie}</b>
              <br />
              <span className="tb-k">Item</span> <b>{r.item}</b>
              <br />
              <span className="tb-k">Descr</span>{" "}
              <span style={{ fontSize: 12 }}>{r.descr || "-"}</span>
              <br />
              <span className="tb-k">Qty</span> <b>{r.qty}</b> &nbsp;
              <span className="tb-k">SN</span> {r.sn}
              <br />
              <span className="tb-k">Time</span> {r.time}
            </div>
          ))}
          {rows.length > 0 && (
            <button
              className="tb-btn green"
              disabled={loading}
              onClick={approve}
            >
              APPROVE
            </button>
          )}
        </div>
      )}
    </TubeShell>
  );
}
