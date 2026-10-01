// frontend/src/pages/tube-barcode/Monitoring.jsx
import { useState, useRef, useEffect } from "react";
import api from "../../api/axiosInstance";
import { TubeShell, Msg, errText, onEnter, up } from "./tubeShared";

export default function Monitoring() {
  const [rackInput, setRackInput] = useState("");
  const [rackSearched, setRackSearched] = useState("");
  const [collieInput, setCollieInput] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  const rackRef = useRef(null);

  useEffect(() => {
    if (rackRef.current) rackRef.current.focus();
  }, []);

  const handleSearch = () => {
    const r = up(rackInput).trim();
    const c = up(collieInput).trim();
    if (!r && !c) {
      return setMsg({
        type: "err",
        text: "Scan atau ketik Rak / Collie dulu.",
      });
    }

    setLoading(true);
    setMsg(null);
    setData(null);

    api
      .get("/tube-barcode/monitoring", {
        params: { rack: r, collie: c },
      })
      .then((res) => {
        setData(res.data.data);
        setRackSearched(r);
      })
      .catch((err) => {
        setMsg({ type: "err", text: errText(err) });
      })
      .finally(() => setLoading(false));
  };

  return (
    <TubeShell title="MONITORING TUBE">
      <Msg msg={msg} />

      <div className="tb-card">
        <label className="tb-label">Scan Barcode Rak</label>
        <input
          ref={rackRef}
          className="tb-input"
          autoComplete="off"
          value={rackInput}
          onChange={(e) => setRackInput(up(e.target.value))}
          onKeyDown={onEnter(handleSearch)}
          placeholder="Scan Rak lalu Enter"
        />

        <label className="tb-label">Scan Collie (Opsional)</label>
        <input
          className="tb-input"
          autoComplete="off"
          value={collieInput}
          onChange={(e) => setCollieInput(up(e.target.value))}
          onKeyDown={onEnter(handleSearch)}
          placeholder="Ketik/scan collie"
        />

        <button className="tb-btn" disabled={loading} onClick={handleSearch}>
          {loading ? "MEMUAT..." : "CARI DATA"}
        </button>
      </div>

      {data && (
        <>
          {/* Info Posisi Tangerang & Ban di Rak */}
          {data.rack && (
            <div className="tb-card">
              <div className="tb-k">INFORMASI RAK (TANGERANG)</div>
              <div className="tb-big">{data.rack.rack_code}</div>

              {data.rack.location ? (
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  <span className="tb-k">Lokasi:</span>{" "}
                  <b>{data.rack.location.whscode}</b> / Kol:{" "}
                  <b>{data.rack.location.loccol}</b> / Blok:{" "}
                  <b>{data.rack.location.locblock}</b>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  Lokasi rak belum terdata di fgloc.
                </div>
              )}

              {data.rack.tires && data.rack.tires.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div className="tb-k">TIRE DALAM RAK INI:</div>
                  {data.rack.tires.map((t, idx) => (
                    <div key={idx} className="tb-row" style={{ fontSize: 11 }}>
                      <b>{t.item}</b> ({t.collie}) - {t.qty} pcs
                      <br />
                      <span style={{ color: "#4b5563" }}>{t.deskripsi}</span>
                      {t.tube_pasangan && (
                        <div style={{ color: "#059669" }}>
                          Pasangan Tube Resmi: <b>{t.tube_pasangan}</b>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Daftar Stok Tube & Approval Info */}
          <div className="tb-card">
            <div className="tb-k">
              DATA TUBE ({data.summary.total_baris} baris |{" "}
              {data.summary.total_qty} pcs)
            </div>

            {data.rows.length === 0 && (
              <div className="tb-row">
                Tidak ada stok tube di rak/collie ini.
              </div>
            )}

            {data.rows.map((r) => (
              <div
                className="tb-row"
                key={r.id}
                style={{
                  borderLeft:
                    r.status === "APPROVED"
                      ? "4px solid #10b981"
                      : "4px solid #f59e0b",
                }}
              >
                <div>
                  <span className="tb-k">Rak:</span> <b>{r.rack_code}</b> |{" "}
                  <span className="tb-k">Collie:</span> <b>{r.collie}</b>
                </div>
                <div>
                  <span className="tb-k">Item:</span> <b>{r.item}</b> |{" "}
                  <span className="tb-k">Qty:</span> <b>{r.qty}</b> |{" "}
                  <span className="tb-k">SN:</span> {r.sn}
                </div>
                <div style={{ fontSize: 11, color: "#4b5563", marginTop: 4 }}>
                  Scan: {r.scan_by_name || "-"} ({r.scan_time || "-"})
                  <br />
                  Approve: {r.approve_by_name || "-"} ({r.approve_time || "-"})
                </div>

                {r.tire_menempel && r.tire_menempel.length > 0 && (
                  <div
                    style={{
                      background: "#eff6ff",
                      padding: "4px 6px",
                      borderRadius: 4,
                      marginTop: 6,
                      fontSize: 11,
                    }}
                  >
                    <span className="tb-k">Menempel di Ban:</span>
                    {r.tire_menempel.map((tm, idx) => (
                      <span key={idx}>
                        {" "}
                        <b>{tm.item}</b> (Collie Ban: {tm.collie}){" "}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </TubeShell>
  );
}
