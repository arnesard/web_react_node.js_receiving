// frontend/src/pages/tube-barcode/ScanCollie.jsx
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

export default function ScanCollie() {
  const { list: employees, error: empErr } = useEmployees();
  const [operatorId, setOperatorId] = usePersistedOperator();

  // State Step (1: Rak, 2: Detail Collie)
  const [step, setStep] = useState(1);
  const [rack, setRack] = useState("");
  const [rackInput, setRackInput] = useState("");

  // Field Detail
  const [collie, setCollie] = useState("");
  const [custbarInput, setCustbarInput] = useState("");
  const [itemInfo, setItemInfo] = useState(null);
  const [qty, setQty] = useState("");
  const [sn, setSn] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  const rackRef = useRef(null);
  const collieRef = useRef(null);
  const custbarRef = useRef(null);
  const qtyRef = useRef(null);
  const snRef = useRef(null);

  useEffect(() => {
    if (step === 1 && rackRef.current) rackRef.current.focus();
    if (step === 2 && collieRef.current) collieRef.current.focus();
  }, [step]);

  const handleNextToDetail = () => {
    if (!operatorId)
      return setMsg({ type: "err", text: "Pilih Operator terlebih dahulu." });
    const r = up(rackInput).trim();
    if (!r)
      return setMsg({ type: "err", text: "Scan barcode Rak terlebih dahulu." });

    setRack(r);
    setMsg(null);
    setStep(2);
  };

  const handleLookupCustbar = () => {
    const val = up(custbarInput).trim();
    if (!val) return;

    setLoading(true);
    setMsg(null);
    api
      .get("/tube-barcode/item-lookup", { params: { q: val } })
      .then((res) => {
        setItemInfo(res.data.data);
        setTimeout(() => qtyRef.current && qtyRef.current.focus(), 50);
      })
      .catch((err) => {
        setItemInfo(null);
        setMsg({ type: "err", text: errText(err) });
        if (custbarRef.current) custbarRef.current.select();
      })
      .finally(() => setLoading(false));
  };

  const handleSave = () => {
    if (!collie.trim())
      return setMsg({ type: "err", text: "Collie wajib diisi." });
    if (!itemInfo)
      return setMsg({
        type: "err",
        text: "Scan custbar / item yang valid dulu.",
      });
    if (!qty || Number(qty) <= 0)
      return setMsg({ type: "err", text: "Qty harus lebih dari 0." });
    if (!/^\d{4}$/.test(sn.trim())) {
      return setMsg({
        type: "err",
        text: "SN harus 4 digit YYWW (contoh: 2639).",
      });
    }

    setLoading(true);
    setMsg(null);

    const payload = {
      operator_id: operatorId,
      rack_code: rack,
      collie: up(collie).trim(),
      item: itemInfo.item,
      qty: Number(qty),
      sn: sn.trim(),
    };

    api
      .post("/tube-barcode/scan", payload)
      .then((res) => {
        setMsg({
          type: "ok",
          text: res.data.message || "Data scan berhasil disimpan!",
        });

        // Reset data detail
        setCollie("");
        setCustbarInput("");
        setItemInfo(null);
        setQty("");
        setSn("");

        setTimeout(() => collieRef.current && collieRef.current.focus(), 50);
      })
      .catch((err) => {
        setMsg({ type: "err", text: errText(err) });
      })
      .finally(() => setLoading(false));
  };

  return (
    <TubeShell title="SCAN COLLIE">
      <Msg msg={empErr ? { type: "err", text: empErr } : msg} />

      {step === 1 && (
        <div className="tb-card">
          <OperatorSelect
            label="Operator"
            value={operatorId}
            onChange={setOperatorId}
            list={employees}
            onPick={() =>
              setTimeout(() => rackRef.current && rackRef.current.focus(), 50)
            }
          />

          <label className="tb-label">Scan Barcode Rak</label>
          <input
            ref={rackRef}
            className="tb-input"
            autoComplete="off"
            value={rackInput}
            onChange={(e) => setRackInput(up(e.target.value))}
            onKeyDown={onEnter(handleNextToDetail)}
            placeholder="Scan rak lalu Enter"
          />

          <button className="tb-btn" onClick={handleNextToDetail}>
            LANJUT KE DETAIL
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="tb-card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <div>
              <span className="tb-k">RAK:</span> <b>{rack}</b>
            </div>
            <button
              className="tb-btn"
              style={{ width: "auto", padding: "4px 8px", fontSize: 11 }}
              onClick={() => {
                setStep(1);
                setRackInput("");
              }}
            >
              Ganti Rak
            </button>
          </div>

          <label className="tb-label">Scan Collie</label>
          <input
            ref={collieRef}
            className="tb-input"
            autoComplete="off"
            value={collie}
            onChange={(e) => setCollie(up(e.target.value))}
            onKeyDown={onEnter(
              () => custbarRef.current && custbarRef.current.focus(),
            )}
            placeholder="Scan Collie lalu Enter"
          />

          <label className="tb-label">Scan Custbar / Item</label>
          <input
            ref={custbarRef}
            className="tb-input"
            autoComplete="off"
            value={custbarInput}
            onChange={(e) => setCustbarInput(up(e.target.value))}
            onKeyDown={onEnter(handleLookupCustbar)}
            placeholder="Scan Custbar lalu Enter"
          />

          {itemInfo && (
            <div
              className="tb-row"
              style={{
                background: "#ecfdf5",
                border: "1px solid #a7f3d0",
                padding: "6px 8px",
                margin: "6px 0",
              }}
            >
              <div>
                <span className="tb-k">Item:</span> <b>{itemInfo.item}</b>
              </div>
              <div>
                <span className="tb-k">Descr:</span>{" "}
                <span style={{ fontSize: 12 }}>{itemInfo.descr}</span>
              </div>
            </div>
          )}

          <label className="tb-label">Qty</label>
          <input
            ref={qtyRef}
            type="number"
            className="tb-input"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onKeyDown={onEnter(() => snRef.current && snRef.current.focus())}
            placeholder="Masukkan Qty"
          />

          <label className="tb-label">SN (YYWW)</label>
          <input
            ref={snRef}
            maxLength={4}
            className="tb-input"
            value={sn}
            onChange={(e) => setSn(e.target.value.replace(/\D/g, ""))}
            onKeyDown={onEnter(handleSave)}
            placeholder="Contoh: 2639"
          />

          <button
            className="tb-btn green"
            disabled={loading}
            onClick={handleSave}
          >
            {loading ? "MENYIMPAN..." : "SIMPAN"}
          </button>
        </div>
      )}
    </TubeShell>
  );
}
