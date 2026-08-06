// src/pages/Production/Index.jsx
import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import api from "../../../api/axiosInstance";
import { fileUrl } from "../../../api/fileUrl";
import Swal from "sweetalert2";
import { todayJakarta, addDaysJakarta } from "../../../utils/date";

export default function ProductionInput() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const plant = searchParams.get("plant") || "";
  const group = searchParams.get("group") || "";
  const bagian = searchParams.get("bagian") || "";

  const [employees, setEmployees] = useState([]);
  const [liveData, setLiveData] = useState([]);
  const [inputtedIds, setInputtedIds] = useState([]);
  const [loading, setLoading] = useState(false);

  // Opsi Plant/Grup/Pekerjaan sekarang diambil dari API (menu Pengaturan),
  // bukan hardcoded lagi — biar bisa ditambah/dihapus tanpa ubah kode.
  const [plants, setPlants] = useState([]);
  const [groups, setGroups] = useState([]);
  const [bagianList, setBagianList] = useState([]);
  const [jobList, setJobList] = useState([]);

  // Form state
  const [employeeId, setEmployeeId] = useState("");
  const [operatorSearch, setOperatorSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedJobs, setSelectedJobs] = useState([]);
  const [showJobPanel, setShowJobPanel] = useState(false);
  const [shift, setShift] = useState("");
  const [date, setDate] = useState(todayJakarta());
  const [productionCount, setProductionCount] = useState("");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [photoInputKey, setPhotoInputKey] = useState(0);
  const [photoViewerUrl, setPhotoViewerUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [monitorSearch, setMonitorSearch] = useState("");

  // Tanggal "hari ini" versi server — dipakai sebagai sumber kebenaran,
  // karena jam device (scanner PDT dll) suka salah setting. Awalnya pakai
  // jam device dulu biar form langsung kepakai, lalu di-overwrite begitu
  // response server-time datang.
  const [serverToday, setServerToday] = useState(todayJakarta());

  useEffect(() => {
    let cancelled = false;
    api
      .get("/system/server-time")
      .then((res) => {
        if (cancelled) return;
        const serverDate = res.data?.data?.date;
        if (serverDate && /^\d{4}-\d{2}-\d{2}$/.test(serverDate)) {
          setServerToday(serverDate);
          // Kalau field tanggal masih default (belum diubah manual), betulin
          // ke tanggal server. Untuk shift 3 (malam), tanggalnya H-1 dari
          // "hari ini" — jadi cek juga kemungkinan itu sebelum nimpa.
          setDate((prev) => {
            const deviceToday = todayJakarta();
            const deviceYesterday = addDaysJakarta(deviceToday, -1);
            if (prev === deviceToday) return serverDate;
            if (prev === deviceYesterday) return addDaysJakarta(serverDate, -1);
            return prev;
          });
        }
      })
      .catch(() => {
        console.warn(
          "Gagal ambil server-time, pakai jam device sebagai fallback.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    loadData();
  }, [plant, group, bagian]);

  useEffect(() => {
    api
      .get("/production-options")
      .then((res) => {
        const opts = res.data?.data || {};
        setPlants((opts.plant || []).map((o) => o.value));
        setGroups((opts.group || []).map((o) => o.value));
        setJobList((opts.job || []).map((o) => o.value));
        setBagianList((opts.bagian || []).map((o) => o.value));
      })
      .catch((err) => {
        console.warn("Gagal ambil opsi plant/grup/pekerjaan:", err.message);
      });
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.get("/production/input", {
        params: { plant, group, bagian },
      });
      setEmployees(res.data.data.employees);
      setLiveData(res.data.data.liveData);
      setInputtedIds(res.data.data.inputtedIds);
    } catch (err) {
      Swal.fire("Error", "Gagal load data: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const onShiftChange = (val) => {
    setShift(val);
    if (val === "3") {
      setDate(addDaysJakarta(serverToday, -1));
    } else {
      setDate(serverToday);
    }
  };

  const toggleJob = (job) => {
    setSelectedJobs((prev) =>
      prev.includes(job) ? prev.filter((j) => j !== job) : [...prev, job],
    );
  };

  const resetForm = () => {
    setEmployeeId("");
    setOperatorSearch("");
    setSelectedJobs([]);
    setShift("");
    setDate(serverToday);
    setProductionCount("");
    setNotes("");
    setPhoto(null);
    setPhotoPreview("");
    setPhotoInputKey((k) => k + 1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!employeeId) {
      Swal.fire("Peringatan", "Pilih Nama Operator!", "warning");
      return;
    }
    if (!selectedJobs.length) {
      Swal.fire("Peringatan", "Pilih minimal satu pekerjaan!", "warning");
      return;
    }
    if (!productionCount) {
      Swal.fire("Peringatan", "Isi Jumlah Produksi!", "warning");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("employee_id", employeeId);
      formData.append("shift", shift);
      formData.append("date", date);
      formData.append("production_count", productionCount);
      formData.append("notes", notes);
      selectedJobs.forEach((job) => formData.append("job_today[]", job));
      if (photo) formData.append("photo", photo);

      await api.post(`/production/input/${plant || "B"}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      await Swal.fire({
        title: "Berhasil!",
        text: "Data produksi tersimpan",
        icon: "success",
        timer: 1500,
        showConfirmButton: false,
      });
      resetForm();
      loadData();
    } catch (err) {
      Swal.fire("Error", err.response?.data?.message || err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id, name) => {
    const result = await Swal.fire({
      title: "Hapus data?",
      html: `Yakin hapus data <b>${name}</b>?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Hapus",
      cancelButtonText: "Batal",
      confirmButtonColor: "#dc3545",
    });
    if (!result.isConfirmed) return;
    try {
      await api.delete(`/production/${plant || "B"}/${id}`);
      loadData();
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    }
  };

  const filteredEmployees = employees.filter(
    (e) =>
      e.name.toLowerCase().includes(operatorSearch.toLowerCase()) ||
      e.employee_id.toLowerCase().includes(operatorSearch.toLowerCase()),
  );

  const filteredLive = liveData.filter((d) =>
    d.operator_name?.toLowerCase().includes(monitorSearch.toLowerCase()),
  );

  return (
    <div>
      <style>{`
        /* ════════ FILTER PLANT/GROUP ════════ */
        .plant-filter-card {
          background: #fff; border-radius: 16px; padding: 14px;
          margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }
        .plant-filter-label {
          font-size: 10px; font-weight: 700; text-transform: uppercase;
          color: #94a3b8; margin-bottom: 6px;
        }
        .plant-btn-group { display: flex; gap: 6px; flex-wrap: wrap; }
        .plant-btn {
          padding: 7px 14px; border-radius: 999px; font-size: 13px;
          font-weight: 700; border: 1.5px solid #e2e8f0;
          background: #f8fafc; color: #64748b; cursor: pointer;
          transition: all 0.15s;
        }
        .plant-btn.active {
          background: #0d6efd; color: white; border-color: #0d6efd;
        }

        /* ════════ FORM CARD ════════ */
        .form-card {
          background: #fff; border-radius: 16px; padding: 20px;
          margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }
        .form-card h5 { font-weight: 800; font-size: 16px; margin: 0 0 4px; color: #0f172a; }
        .form-card p  { font-size: 12px; color: #94a3b8; margin: 0 0 16px; }

        .field-label {
          font-size: 11px; font-weight: 700; text-transform: uppercase;
          color: #64748b; margin-bottom: 5px; display: block;
        }
        .field-input {
          width: 100%; font-size: 16px !important; min-height: 46px;
          border-radius: 12px; border: 1.5px solid #e2e8f0;
          padding: 10px 14px; background: #f8fafc; color: #1e293b;
          outline: none; transition: border-color 0.2s; box-sizing: border-box;
        }
        .field-input:focus { border-color: #0d6efd; background: #fff; }
        .field-group { margin-bottom: 12px; }
        .field-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

        /* Operator dropdown */
        .op-dropdown {
          position: absolute; top: calc(100% + 4px); left: 0; right: 0;
          background: #fff; border: 1.5px solid #e2e8f0; border-radius: 12px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.12); z-index: 200;
          max-height: 200px; overflow-y: auto;
        }
        .op-option {
          padding: 10px 14px; font-size: 13px; cursor: pointer;
          border-bottom: 1px solid #f8fafc; transition: background 0.1s;
        }
        .op-option:hover { background: #f0f9ff; }
        .op-option:last-child { border-bottom: none; }

        /* Job dropdown */
        .job-trigger {
          width: 100%; min-height: 46px; border-radius: 12px;
          border: 1.5px solid #e2e8f0; padding: 10px 14px;
          background: #f8fafc; cursor: pointer; font-size: 14px;
          display: flex; justify-content: space-between; align-items: center;
          transition: border-color 0.2s;
        }
        .job-trigger:hover { border-color: #0d6efd; }
        .job-panel {
          position: absolute; top: calc(100% + 4px); left: 0; right: 0;
          background: #fff; border: 1.5px solid #0d6efd; border-radius: 12px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.12); z-index: 200;
          max-height: 260px; overflow-y: auto; padding: 10px;
        }
        .job-chip-grid {
          display: flex; flex-wrap: wrap; gap: 8px;
        }
        .job-chip {
          display: flex; align-items: center; gap: 6px;
          padding: 8px 12px; border-radius: 999px; cursor: pointer;
          font-size: 13px; font-weight: 600; user-select: none;
          border: 1.5px solid #e2e8f0; background: #f8fafc; color: #64748b;
          transition: all 0.15s;
        }
        .job-chip:hover { border-color: #0d6efd; }
        .job-chip.active {
          background: #0d6efd; border-color: #0d6efd; color: #fff;
        }
        .job-chip-check {
          display: flex; align-items: center; justify-content: center;
          width: 15px; height: 15px; border-radius: 50%; flex-shrink: 0;
          border: 1.5px solid currentColor; font-size: 10px; line-height: 1;
        }

        /* Submit btn */
        .btn-submit-form {
          width: 100%; min-height: 52px; border-radius: 14px; border: none;
          background: linear-gradient(135deg,#0d6efd,#0284c7);
          color: white; font-size: 16px; font-weight: 700;
          margin-top: 8px; cursor: pointer;
        }
        .btn-submit-form:disabled { opacity: 0.6; }

        /* ════════ MONITORING CARD ════════ */
        .monitor-card {
          background: #fff; border-radius: 16px; padding: 20px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }
        .monitor-header {
          display: flex; justify-content: space-between;
          align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 8px;
        }
        .monitor-search {
          font-size: 14px; min-height: 38px; border-radius: 10px;
          border: 1.5px solid #e2e8f0; padding: 6px 12px;
          background: #f8fafc; outline: none; width: 200px;
        }

        /* Mobile live card */
        .live-card {
          background: #f8fafc; border-radius: 12px; padding: 12px;
          margin-bottom: 10px; border: 1px solid #f1f5f9;
        }
        .live-card-top {
          display: flex; justify-content: space-between;
          align-items: flex-start; margin-bottom: 8px;
        }
        .live-name  { font-weight: 700; font-size: 14px; color: #0f172a; }
        .live-id    { font-size: 11px; color: #94a3b8; font-family: monospace; }
        .live-count { font-size: 20px; font-weight: 900; color: #0d6efd; }
        .live-unit  { font-size: 10px; color: #94a3b8; }
        .live-jobs  { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
        .live-job-badge {
          font-size: 10px; font-weight: 700; padding: 2px 8px;
          border-radius: 999px; background: #e0f2fe; color: #0284c7;
        }
        .live-meta  { font-size: 11px; color: #94a3b8; margin-bottom: 8px; }
        .live-actions { display: flex; gap: 8px; }
        .live-btn {
          flex: 1; min-height: 36px; border-radius: 8px; border: none;
          font-size: 12px; font-weight: 600; cursor: pointer;
        }

        /* Desktop monitoring view */
        .desktop-monitor { display: none; }
        .mobile-monitor  { display: block; }

        .monitor-table {
          width: 100%; border-collapse: collapse;
        }
        .monitor-table th {
          padding: 10px 14px; font-size: 11px; font-weight: 700;
          text-transform: uppercase; color: #94a3b8;
          border-bottom: 2px solid #f1f5f9; text-align: left;
        }
        .monitor-table td {
          padding: 12px 14px; border-bottom: 1px solid #f8fafc;
          font-size: 13px; vertical-align: middle;
        }
        .monitor-table tbody tr:hover { background: #fafbff; }

        /* ════════ DESKTOP OVERRIDE ════════ */
        @media (min-width: 768px) {
          .plant-filter-row {
            display: flex; gap: 32px; align-items: center;
          }
          .form-grid-desktop {
            display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
          }
          .mobile-monitor  { display: none; }
          .desktop-monitor { display: block; }
          .monitor-search  { width: 240px; }
        }
      `}</style>

      {/* ── PAGE TITLE ── */}
      <div style={{ marginBottom: 16 }}>
        <h4 style={{ fontWeight: 800, margin: 0, color: "#0f172a" }}>
          Input Hasil Kerja
        </h4>
        <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>
          PT Gajah Tunggal Tbk — Gudang BPW
        </p>
      </div>

      {/* ── FILTER PLANT & GROUP ── */}
      <div className="plant-filter-card">
        <div className="plant-filter-row">
          <div style={{ marginBottom: 10 }}>
            <div className="plant-filter-label">Plant</div>
            <div className="plant-btn-group">
              {plants.map((p) => (
                <button
                  key={p}
                  className={`plant-btn ${plant === p ? "active" : ""}`}
                  onClick={() => setSearchParams({ plant: p, group })}
                >
                  {p}
                </button>
              ))}
              <button
                className={`plant-btn ${!plant ? "active" : ""}`}
                onClick={() => setSearchParams({})}
              >
                ↺
              </button>
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <div className="plant-filter-label">Grup</div>
            <div className="plant-btn-group">
              {groups.map((g) => (
                <button
                  key={g}
                  className={`plant-btn ${group === g ? "active" : ""}`}
                  onClick={() => setSearchParams({ plant, group: g, bagian })}
                >
                  {g}
                </button>
              ))}
              <button
                className={`plant-btn ${!group ? "active" : ""}`}
                onClick={() => setSearchParams({ plant, bagian })}
              >
                ↺
              </button>
            </div>
          </div>
          {bagianList.length > 0 && (
            <div>
              <div className="plant-filter-label">Bagian</div>
              <div className="plant-btn-group">
                {bagianList.map((b) => (
                  <button
                    key={b}
                    className={`plant-btn ${bagian === b ? "active" : ""}`}
                    onClick={() => setSearchParams({ plant, group, bagian: b })}
                  >
                    {b}
                  </button>
                ))}
                <button
                  className={`plant-btn ${!bagian ? "active" : ""}`}
                  onClick={() => setSearchParams({ plant, group })}
                >
                  ↺
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── FORM INPUT ── */}
      <div className="form-card">
        <h5>Entry Data</h5>
        <p>
          Plant: <b>{plant || "Semua"}</b> | Grup: <b>{group || "Semua"}</b>
          {bagian && (
            <>
              {" "}
              | Bagian: <b>{bagian}</b>
            </>
          )}
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-grid-desktop">
            {/* Operator Search */}
            <div className="field-group" style={{ position: "relative" }}>
              <label className="field-label">Nama Operator *</label>
              <input
                className="field-input"
                placeholder="Ketik nama operator..."
                value={operatorSearch}
                autoComplete="off"
                onChange={(e) => {
                  setOperatorSearch(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
              />
              {employeeId && (
                <button
                  type="button"
                  onClick={() => {
                    setEmployeeId("");
                    setOperatorSearch("");
                  }}
                  style={{
                    position: "absolute",
                    right: 12,
                    top: 34,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#94a3b8",
                    fontSize: 16,
                  }}
                >
                  ✕
                </button>
              )}
              {showDropdown && (
                <div className="op-dropdown">
                  {filteredEmployees.length === 0 ? (
                    <div className="op-option text-muted">Tidak ditemukan</div>
                  ) : (
                    filteredEmployees.map((emp) => {
                      const sudah = inputtedIds.includes(emp.employee_id);
                      return (
                        <div
                          key={emp.employee_id}
                          className="op-option"
                          style={{
                            opacity: sudah ? 0.5 : 1,
                            cursor: sudah ? "not-allowed" : "pointer",
                          }}
                          onMouseDown={() => {
                            if (sudah) {
                              alert("Operator ini sudah input hari ini!");
                              return;
                            }
                            setEmployeeId(emp.employee_id);
                            setOperatorSearch(emp.name);
                            setShowDropdown(false);
                          }}
                        >
                          <b style={{ fontFamily: "monospace", fontSize: 11 }}>
                            {emp.employee_id}
                          </b>
                          {" — "}
                          {emp.name}
                          {sudah && (
                            <span
                              style={{
                                marginLeft: 6,
                                fontSize: 10,
                                background: "#dcfce7",
                                color: "#16a34a",
                                padding: "2px 6px",
                                borderRadius: 999,
                              }}
                            >
                              ✓ Sudah
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Job Dropdown */}
            <div className="field-group" style={{ position: "relative" }}>
              <label className="field-label">Pekerjaan Hari Ini *</label>
              <div
                className="job-trigger"
                onClick={() => setShowJobPanel(!showJobPanel)}
              >
                <span
                  style={{
                    fontSize: 13,
                    color: selectedJobs.length ? "#1e293b" : "#94a3b8",
                  }}
                >
                  {selectedJobs.length
                    ? selectedJobs.join(", ")
                    : "Pilih pekerjaan..."}
                </span>
                <span>▾</span>
              </div>
              {showJobPanel && (
                <div className="job-panel">
                  {jobList.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#94a3b8", padding: 6 }}>
                      Belum ada pilihan pekerjaan. Tambahkan lewat menu
                      Pengaturan.
                    </div>
                  ) : (
                    <div className="job-chip-grid">
                      {jobList.map((job) => {
                        const active = selectedJobs.includes(job);
                        return (
                          <div
                            key={job}
                            className={`job-chip ${active ? "active" : ""}`}
                            onClick={() => toggleJob(job)}
                          >
                            <span className="job-chip-check">
                              {active ? "✓" : ""}
                            </span>
                            {job}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Shift + Date */}
            <div className="field-row-2">
              <div className="field-group">
                <label className="field-label">Shift *</label>
                <select
                  className="field-input"
                  value={shift}
                  onChange={(e) => onShiftChange(e.target.value)}
                  required
                >
                  <option value="">-- Pilih --</option>
                  <option value="1">1 (Pagi)</option>
                  <option value="2">2 (Sore)</option>
                  <option value="3">3 (Malam)</option>
                </select>
              </div>
              <div className="field-group">
                <label className="field-label">Tanggal *</label>
                <input
                  type="date"
                  className="field-input"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  max={serverToday}
                  required
                />
              </div>
            </div>

            {/* Jumlah Produksi */}
            <div className="field-group">
              <label className="field-label">Jumlah Produksi</label>
              <input
                type="number"
                className="field-input"
                placeholder="Total unit"
                value={productionCount}
                onChange={(e) => setProductionCount(e.target.value)}
              />
            </div>

            {/* Catatan */}
            <div className="field-group">
              <label className="field-label">Catatan</label>
              <textarea
                className="field-input"
                rows={2}
                placeholder="Kendala cuaca, mesin, dll..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{ minHeight: "unset", resize: "none" }}
              />
            </div>

            {/* Foto */}
            <div className="field-group">
              <label className="field-label">Foto (Opsional)</label>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <input
                  key={photoInputKey}
                  type="file"
                  className="field-input"
                  accept="image/*"
                  style={{ minHeight: "unset", padding: "8px 12px" }}
                  onChange={(e) => {
                    const file = e.target.files[0];
                    setPhoto(file);
                    if (file) setPhotoPreview(URL.createObjectURL(file));
                  }}
                />
                {photoPreview && (
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <img
                      src={photoPreview}
                      alt="preview"
                      style={{
                        width: 56,
                        height: 56,
                        objectFit: "cover",
                        borderRadius: 10,
                        border: "2px solid #0d6efd",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setPhoto(null);
                        setPhotoPreview("");
                        setPhotoInputKey((k) => k + 1);
                      }}
                      title="Hapus foto"
                      style={{
                        position: "absolute",
                        top: -8,
                        right: -8,
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        background: "#dc2626",
                        color: "#fff",
                        border: "2px solid #fff",
                        fontSize: 12,
                        fontWeight: 700,
                        lineHeight: "18px",
                        padding: 0,
                        cursor: "pointer",
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="btn-submit-form"
            disabled={submitting}
          >
            {submitting ? "⏳ Menyimpan..." : "💾 SIMPAN DATA"}
          </button>
        </form>
      </div>

      {/* ── MONITORING ── */}
      <div className="monitor-card">
        <div className="monitor-header">
          <div>
            <h5 style={{ fontWeight: 800, margin: 0, fontSize: 16 }}>
              Monitoring Input
            </h5>
            <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>
              {filteredLive.length} operator sudah input hari ini
            </p>
          </div>
          <input
            className="monitor-search"
            placeholder="🔍 Cari operator..."
            value={monitorSearch}
            onChange={(e) => setMonitorSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="text-center py-4 text-muted">
            <div className="spinner-border spinner-border-sm mb-2" />
            <div style={{ fontSize: 13 }}>Loading...</div>
          </div>
        ) : filteredLive.length === 0 ? (
          <div className="text-center py-4 text-muted" style={{ fontSize: 13 }}>
            Belum ada data input hari ini
          </div>
        ) : (
          <>
            {/* ── MOBILE: live cards ── */}
            <div className="mobile-monitor">
              {filteredLive.map((d, i) => (
                <div className="live-card" key={d.id}>
                  <div className="live-card-top">
                    <div>
                      <div className="live-name">{d.operator_name}</div>
                      <div className="live-id">{d.operator_id}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="live-count">
                        {Number(d.production_count).toLocaleString("id-ID")}
                      </div>
                      <div className="live-unit">unit</div>
                    </div>
                  </div>
                  <div className="live-jobs">
                    {(d.job_today || "")
                      .split(",")
                      .map((j) => j.trim())
                      .filter(Boolean)
                      .map((j) => (
                        <span key={j} className="live-job-badge">
                          {j}
                        </span>
                      ))}
                  </div>
                  <div className="live-meta">
                    Shift {d.shift} &nbsp;·&nbsp;
                    {d.notes && <span>📝 {d.notes}</span>}
                  </div>
                  {d.photo && (
                    <div style={{ margin: "8px 0" }}>
                      <img
                        src={fileUrl(d.photo)}
                        alt="Foto hasil kerja"
                        style={{
                          width: 48,
                          height: 48,
                          objectFit: "cover",
                          borderRadius: 8,
                          cursor: "zoom-in",
                          border: "1px solid #e2e8f0",
                        }}
                        onClick={() => setPhotoViewerUrl(fileUrl(d.photo))}
                      />
                    </div>
                  )}
                  <div className="live-actions">
                    <button
                      className="live-btn"
                      style={{ background: "#fef3c7", color: "#d97706" }}
                      onClick={() =>
                        navigate(
                          `/production/edit/${plant || d.emp_plant}/${d.id}`,
                        )
                      }
                    >
                      ✏️ Edit
                    </button>
                    <button
                      className="live-btn"
                      style={{ background: "#fee2e2", color: "#dc2626" }}
                      onClick={() => handleDelete(d.id, d.operator_name)}
                    >
                      🗑️ Hapus
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* ── DESKTOP: tabel ── */}
            <div className="desktop-monitor">
              <table className="monitor-table">
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Nama Operator</th>
                    <th>Pekerjaan</th>
                    <th>Shift</th>
                    <th style={{ textAlign: "right" }}>Hasil</th>
                    <th>Catatan</th>
                    <th>Foto</th>
                    <th style={{ textAlign: "center" }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLive.map((d, i) => (
                    <tr key={d.id}>
                      <td style={{ color: "#94a3b8", fontSize: 12 }}>
                        {i + 1}
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>
                          {d.operator_name}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "#94a3b8",
                            fontFamily: "monospace",
                          }}
                        >
                          {d.operator_id}
                        </div>
                      </td>
                      <td>
                        {(d.job_today || "")
                          .split(",")
                          .map((j) => j.trim())
                          .filter(Boolean)
                          .map((j) => (
                            <span
                              key={j}
                              className="live-job-badge"
                              style={{ marginRight: 4 }}
                            >
                              {j}
                            </span>
                          ))}
                      </td>
                      <td>Shift {d.shift}</td>
                      <td
                        style={{
                          textAlign: "right",
                          fontWeight: 700,
                          color: "#0d6efd",
                        }}
                      >
                        {Number(d.production_count).toLocaleString("id-ID")}
                      </td>
                      <td style={{ fontSize: 12, color: "#64748b" }}>
                        {d.notes || "-"}
                      </td>
                      <td>
                        {d.photo ? (
                          <img
                            src={fileUrl(d.photo)}
                            style={{
                              width: 40,
                              height: 40,
                              objectFit: "cover",
                              borderRadius: 8,
                              cursor: "zoom-in",
                            }}
                            onClick={() => setPhotoViewerUrl(fileUrl(d.photo))}
                          />
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: 12 }}>
                            -
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <button
                          style={{
                            background: "#fef3c7",
                            color: "#d97706",
                            border: "none",
                            borderRadius: 8,
                            padding: "5px 12px",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                            marginRight: 4,
                          }}
                          onClick={() =>
                            navigate(
                              `/production/edit/${plant || d.emp_plant}/${d.id}`,
                            )
                          }
                        >
                          ✏️ Edit
                        </button>
                        <button
                          style={{
                            background: "#fee2e2",
                            color: "#dc2626",
                            border: "none",
                            borderRadius: 8,
                            padding: "5px 12px",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                          onClick={() => handleDelete(d.id, d.operator_name)}
                        >
                          🗑️ Hapus
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Tutup dropdown klik luar */}
      {(showDropdown || showJobPanel) && (
        <div
          style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }}
          onClick={() => {
            setShowDropdown(false);
            setShowJobPanel(false);
          }}
        />
      )}

      {/* Modal lihat foto - dipakai dari monitoring table */}
      {photoViewerUrl && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.75)",
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={() => setPhotoViewerUrl("")}
        >
          <div
            style={{ position: "relative", maxWidth: "92vw", maxHeight: "92vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={photoViewerUrl}
              alt="Foto hasil kerja"
              style={{
                maxWidth: "92vw",
                maxHeight: "92vh",
                display: "block",
                borderRadius: 8,
              }}
            />
            <button
              type="button"
              onClick={() => setPhotoViewerUrl("")}
              title="Tutup"
              style={{
                position: "absolute",
                top: -14,
                right: -14,
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "#dc2626",
                color: "#fff",
                border: "2px solid #fff",
                fontSize: 16,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
