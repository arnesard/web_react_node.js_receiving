// frontend/src/pages/tube-barcode/Transfer.jsx
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

export default function Transfer() {
  const { list: employees, error: empErr } = useEmployees();
  const [pic, setPic] = usePersistedOperator();

  const [step, setStep] = useState(1); // 1 = Kurang (Ambil stok asal), 2 = Tambah & Pairing
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  // Form Step 1: Ambil Stok (Kurang)
  const [srcRack, setSrcRack] = useState("");
  const [srcCollie, setSrcCollie] = useState("");
  const [stocks, setStocks] = useState([]);
  const [selectedStock, setSelectedStock] = useState(null);
  const [transferQty, setTransferQty] = useState("");

  // Hasil Step 1
  const [reducedInfo, setReducedInfo] = useState(null);

  // Form Step 2: Masukkan ke Rak/Lorry Baru & Pairing
  const [targetRack, setTargetRack] = useState("");
  const [targetCollie, setTargetCollie] = useState("");
  const [tireCollie, setTireCollie] = useState("");

  const srcRackRef = useRef(null);
  const srcCollieRef = useRef(null);
  const qtyRef = useRef(null);
  const targetRackRef = useRef(null);
  const targetCollieRef = useRef(null);
  const tireCollieRef = useRef(null);

  useEffect(() => {
    if (step === 1 && srcRackRef.current) srcRackRef.current.focus();
    if (step === 2 && targetRackRef.current) targetRackRef.current.focus();
  }, [step]);

  // Lookup stok di rak/collie asal
  const handleLookupStock = () => {
    if (!pic)
      return setMsg({ type: "err", text: "Pilih PIC terlebih dahulu." });
    const r = up(srcRack).trim();
    if (!r) return setMsg({ type: "err", text: "Scan Rak Asal dulu." });

    setLoading(true);
    setMsg(null);
    setStocks([]);
    setSelectedStock(null);

    api
      .get("/tube-barcode/transfer/lookup", {
        params: { rack: r, collie: up(srcCollie).trim() },
      })
      .then((res) => {
        const rows = res.data.data || [];
        setStocks(rows);
        if (rows.length === 1) {
          setSelectedStock(rows[0]);
          setTimeout(() => qtyRef.current && qtyRef.current.focus(), 50);
        }
      })
      .catch((err) => {
        setMsg({ type: "err", text: errText(err) });
      })
      .finally(() => setLoading(false));
  };

  // Eksekusi Proses 1: Kurang stok
  const handleKurang = () => {
    if (!selectedStock)
      return setMsg({ type: "err", text: "Pilih tube yang mau ditransfer." });
    const q = Number(transferQty);
    if (!q || q <= 0)
      return setMsg({ type: "err", text: "Qty transfer tidak valid." });
    if (q > Number(selectedStock.qty)) {
      return setMsg({
        type: "err",
        text: `Qty melebihi kapasitas stok saat ini (${selectedStock.qty}).`,
      });
    }

    setLoading(true);
    setMsg(null);

    api
      .post("/tube-barcode/transfer/kurang", {
        pic_id: pic,
        rack_code: selectedStock.rack_code,
        collie: selectedStock.collie,
        item: selectedStock.item,
        sn: selectedStock.sn,
        qty: q,
      })
      .then((res) => {
        setReducedInfo({
          ref_id: res.data.data.ref_id,
          qty: q,
          item: selectedStock.item,
          sn: selectedStock.sn,
          fromRack: selectedStock.rack_code,
          fromCollie: selectedStock.collie,
          sisa: res.data.data.sisa,
        });
        setMsg({
          type: "ok",
          text: `Stok rak asal berhasil dikurangi ${q}. Sisa: ${res.data.data.sisa}.`,
        });
        setStep(2);
      })
      .catch((err) => {
        setMsg({ type: "err", text: errText(err) });
      })
      .finally(() => setLoading(false));
  };

  // Eksekusi Proses 2: Tambah ke rak baru & validasi pairing
  const handleTambah = () => {
    const tRack = up(targetRack).trim();
    const tCollie = up(targetCollie).trim();
    if (!tRack) return setMsg({ type: "err", text: "Scan Rak/Lorry Tujuan." });
    if (!tCollie) return setMsg({ type: "err", text: "Scan Collie Tujuan." });

    setLoading(true);
    setMsg(null);

    const payload = {
      pic_id: pic,
      rack_code: tRack,
      collie: tCollie,
      item: reducedInfo.item,
      sn: reducedInfo.sn,
      qty: reducedInfo.qty,
      ref_id: reducedInfo.ref_id,
      tire_collie: up(tireCollie).trim() || undefined,
    };

    api
      .post("/tube-barcode/transfer/tambah", payload)
      .then((res) => {
        const tire = res.data.data.tire;
        let successMsg = `Berhasil transfer ${reducedInfo.qty} tube ke ${tRack} / ${tCollie}.`;
        if (tire) {
          successMsg += ` (Terpasang ke Tire ${tire.tire_item} di Rak ${tire.tire_rack})`;
        }
        setMsg({ type: "ok", text: successMsg });

        // Reset kembali ke step 1
        setStep(1);
        setReducedInfo(null);
        setStocks([]);
        setSelectedStock(null);
        setTransferQty("");
        setSrcRack("");
        setSrcCollie("");
        setTargetRack("");
        setTargetCollie("");
        setTireCollie("");

        setTimeout(() => srcRackRef.current && srcRackRef.current.focus(), 50);
      })
      .catch((err) => {
        setMsg({ type: "err", text: errText(err) });
      })
      .finally(() => setLoading(false));
  };

  return (
    <TubeShell title="TRANSFER & PAIRING">
      <Msg msg={empErr ? { type: "err", text: empErr } : msg} />

      <div className="tb-card">
        <OperatorSelect
          label="PIC"
          value={pic}
          onChange={setPic}
          list={employees}
        />
      </div>

      {/* ─── STEP 1: AMBIL STOK RAK ASAL ─── */}
      {step === 1 && (
        <div className="tb-card">
          <div className="tb-k" style={{ fontSize: 13, marginBottom: 6 }}>
            PROSES 1: AMBIL DARI RAK ASAL
          </div>

          <label className="tb-label">Scan Rak Asal</label>
          <input
            ref={srcRackRef}
            className="tb-input"
            autoComplete="off"
            value={srcRack}
            onChange={(e) => setSrcRack(up(e.target.value))}
            onKeyDown={onEnter(
              () => srcCollieRef.current && srcCollieRef.current.focus(),
            )}
            placeholder="Scan rak asal lalu Enter"
          />

          <label className="tb-label">Scan Collie Asal (Opsional)</label>
          <input
            ref={srcCollieRef}
            className="tb-input"
            autoComplete="off"
            value={srcCollie}
            onChange={(e) => setSrcCollie(up(e.target.value))}
            onKeyDown={onEnter(handleLookupStock)}
            placeholder="Scan collie lalu Enter"
          />

          <button
            className="tb-btn"
            disabled={loading}
            onClick={handleLookupStock}
          >
            {loading ? "MENCARI..." : "CARI STOK"}
          </button>

          {stocks.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <label className="tb-label">Pilih Item Tube:</label>
              {stocks.map((s) => (
                <div
                  key={s.id}
                  onClick={() => {
                    setSelectedStock(s);
                    setTimeout(
                      () => qtyRef.current && qtyRef.current.focus(),
                      50,
                    );
                  }}
                  className="tb-row"
                  style={{
                    cursor: "pointer",
                    background:
                      selectedStock?.id === s.id ? "#eff6ff" : "inherit",
                    border:
                      selectedStock?.id === s.id
                        ? "1px solid #3b82f6"
                        : "1px solid #e5e7eb",
                  }}
                >
                  <span className="tb-k">Collie:</span> <b>{s.collie}</b> |{" "}
                  <span className="tb-k">Item:</span> {s.item} |{" "}
                  <span className="tb-k">SN:</span> {s.sn} |{" "}
                  <span className="tb-k">Stok:</span> <b>{s.qty}</b>
                </div>
              ))}

              {selectedStock && (
                <div style={{ marginTop: 8 }}>
                  <label className="tb-label">Qty yang Dipindahkan</label>
                  <input
                    ref={qtyRef}
                    type="number"
                    className="tb-input"
                    value={transferQty}
                    onChange={(e) => setTransferQty(e.target.value)}
                    onKeyDown={onEnter(handleKurang)}
                    placeholder={`Maks ${selectedStock.qty}`}
                  />

                  <button
                    className="tb-btn green"
                    disabled={loading}
                    onClick={handleKurang}
                  >
                    AMBIL DARI RAK INI
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── STEP 2: MASUKKAN KE RAK TUJUAN & PAIRING BAN ─── */}
      {step === 2 && reducedInfo && (
        <div className="tb-card">
          <div className="tb-k" style={{ fontSize: 13, marginBottom: 6 }}>
            PROSES 2: TEMPATKAN KE RAK / LORRY BARU
          </div>

          <div
            className="tb-row"
            style={{
              background: "#ecfdf5",
              border: "1px solid #86efac",
              marginBottom: 10,
            }}
          >
            <div>
              Muatan: <b>{reducedInfo.qty} pcs</b> ({reducedInfo.item} - SN:{" "}
              {reducedInfo.sn})
            </div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>
              Dari: {reducedInfo.fromRack} / {reducedInfo.fromCollie}
            </div>
          </div>

          <label className="tb-label">Scan Rak / Lorry Tujuan</label>
          <input
            ref={targetRackRef}
            className="tb-input"
            autoComplete="off"
            value={targetRack}
            onChange={(e) => setTargetRack(up(e.target.value))}
            onKeyDown={onEnter(
              () => targetCollieRef.current && targetCollieRef.current.focus(),
            )}
            placeholder="Scan rak/lorry tujuan lalu Enter"
          />

          <label className="tb-label">Scan Collie Baru</label>
          <input
            ref={targetCollieRef}
            className="tb-input"
            autoComplete="off"
            value={targetCollie}
            onChange={(e) => setTargetCollie(up(e.target.value))}
            onKeyDown={onEnter(
              () => tireCollieRef.current && tireCollieRef.current.focus(),
            )}
            placeholder="Scan collie tujuan lalu Enter"
          />

          <label className="tb-label">
            Collie Ban / Tire Pairing (Opsional)
          </label>
          <input
            ref={tireCollieRef}
            className="tb-input"
            autoComplete="off"
            value={tireCollie}
            onChange={(e) => setTireCollie(up(e.target.value))}
            onKeyDown={onEnter(handleTambah)}
            placeholder="Scan bc_entried_prod tire (jika digabung)"
          />
          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 8 }}>
            *Jika diisi, sistem akan mencocokkan pasangan tube dan tire ke
            master pairing.
          </div>

          <button
            className="tb-btn green"
            disabled={loading}
            onClick={handleTambah}
          >
            {loading ? "MEMVALIDASI & MENYIMPAN..." : "SELESAIKAN TRANSFER"}
          </button>
        </div>
      )}
    </TubeShell>
  );
}
