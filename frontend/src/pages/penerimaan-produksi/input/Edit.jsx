// src/pages/Production/Edit.jsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../../api/axiosInstance";
import { fileUrl } from "../../../api/fileUrl";
import Swal from "sweetalert2";
import {
  todayJakarta,
  toJakartaDateString,
} from "../../../utils/date";

export default function ProductionEdit() {
  const { plant, id } = useParams();
  const navigate = useNavigate();

  const [employees, setEmployees] = useState([]);
  const [reception, setReception] = useState(null);
  const [loading, setLoading] = useState(true);

  // Form state
  const [employeeId, setEmployeeId] = useState("");
  const [selectedJobs, setSelectedJobs] = useState([]);
  const [showJobPanel, setShowJobPanel] = useState(false);
  const [shift, setShift] = useState("");
  const [date, setDate] = useState("");
  const [productionCount, setProductionCount] = useState("");
  const [ritaseResult, setRitaseResult] = useState("");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [existingPhoto, setExistingPhoto] = useState("");
  const [removePhoto, setRemovePhoto] = useState(false);
  const [photoInputKey, setPhotoInputKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Daftar pilihan pekerjaan sekarang diambil dari API (menu Pengaturan),
  // bukan hardcoded lagi.
  const [jobList, setJobList] = useState([]);

  // Tanggal "hari ini" versi server — sumber kebenaran buat batas max
  // tanggal & auto-set shift 3, karena jam device suka salah setting.
  const [serverToday, setServerToday] = useState(todayJakarta());

  useEffect(() => {
    api
      .get("/production-options")
      .then((res) => {
        const jobs = res.data?.data?.job || [];
        setJobList(jobs.map((o) => o.value));
      })
      .catch((err) => {
        console.warn("Gagal ambil daftar pekerjaan:", err.message);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/system/server-time")
      .then((res) => {
        if (cancelled) return;
        const serverDate = res.data?.data?.date;
        if (serverDate && /^\d{4}-\d{2}-\d{2}$/.test(serverDate)) {
          setServerToday(serverDate);
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

  // Load data edit
  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get(`/production/input/${plant}/${id}`);
        const { reception: r, employees: e } = res.data.data;

        setReception(r);
        setEmployees(e);

        // Isi form dari data yang ada — equivalen value="{{ $data->xxx }}" di blade
        setEmployeeId(r.employee_id);
        setShift(String(r.shift));
        setDate(r.date ? toJakartaDateString(r.date) : "");
        setProductionCount(String(r.production_count));
        setRitaseResult(String(r.ritase_result || ""));
        setNotes(r.notes || "");
        setExistingPhoto(r.photo || "");

        // Parse job_today — bisa comma separated
        const jobs = (r.job_today || "")
          .split(",")
          .map((j) => j.trim())
          .filter(Boolean);
        setSelectedJobs(jobs);
      } catch (err) {
        Swal.fire("Error", "Gagal load data: " + err.message, "error");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [plant, id]);

  // Ganti shift doang — tanggal TIDAK di-auto-recalculate di sini,
  // karena ini form Edit buat data yang SUDAH ada. Auto H-1 (berdasarkan
  // "hari ini") cuma relevan pas input baru, bukan pas ngedit data lama —
  // kalau dipaksa recalculate pake serverToday saat ini, tanggal aslinya
  // bisa ketiban salah kalau di-edit di hari lain dari hari data itu dibuat.
  const onShiftChange = (val) => {
    setShift(val);
  };

  const toggleJob = (job) => {
    setSelectedJobs((prev) =>
      prev.includes(job) ? prev.filter((j) => j !== job) : [...prev, job],
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedJobs.length === 0) {
      Swal.fire("Peringatan", "Pilih minimal satu pekerjaan!", "warning");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("employee_id", employeeId);
      formData.append("shift", shift);
      formData.append("date", date);
      formData.append("production_count", productionCount);
      formData.append("ritase_result", ritaseResult);
      formData.append("notes", notes);
      selectedJobs.forEach((job) => formData.append("job_today[]", job));
      if (photo) {
        formData.append("photo", photo);
      } else if (removePhoto) {
        formData.append("remove_photo", "true");
      }

      await api.put(`/production/input/${plant}/${id}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      await Swal.fire({
        title: "Berhasil!",
        text: "Data berhasil diupdate",
        icon: "success",
        timer: 1500,
        showConfirmButton: false,
      });

      navigate(`/production?plant=${plant}`);
    } catch (err) {
      Swal.fire("Error", err.response?.data?.message || err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading)
    return <div className="text-center py-5 text-muted">Loading...</div>;

  return (
    <div className="container-fluid py-4">
      <div className="row justify-content-center">
        <div className="col-lg-7">
          <div className="card shadow-sm border-0 p-4">
            {/* Header */}
            <div className="d-flex align-items-center mb-4">
              <button
                className="btn btn-light border rounded-pill px-3 me-3"
                onClick={() => navigate(`/production?plant=${plant}`)}
              >
                ← Kembali
              </button>
              <div>
                <h4 className="mb-1 fw-bold">Edit Data Produksi</h4>
                <p className="text-muted mb-0 small">
                  Perbarui data produksi yang sudah diinput
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="row g-4">
                {/* Nama Operator */}
                <div className="col-12">
                  <label className="form-label small fw-bold text-uppercase text-muted">
                    Nama Operator
                  </label>
                  <select
                    className="form-select"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    required
                  >
                    <option value="">-- Pilih Operator --</option>
                    {employees.map((emp) => (
                      <option key={emp.employee_id} value={emp.employee_id}>
                        {emp.name} ({emp.employee_id})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Job Dropdown */}
                <div className="col-12 col-md-6">
                  <label className="form-label small fw-bold text-uppercase text-muted">
                    Pekerjaan Hari Ini <span className="text-danger">*</span>
                  </label>
                  <div className="position-relative">
                    <div
                      className="form-control d-flex justify-content-between align-items-center"
                      style={{ cursor: "pointer", minHeight: 42 }}
                      onClick={() => setShowJobPanel(!showJobPanel)}
                    >
                      <span
                        className={
                          selectedJobs.length ? "text-dark" : "text-muted"
                        }
                        style={{ fontSize: "0.875rem" }}
                      >
                        {selectedJobs.length
                          ? selectedJobs.join(", ")
                          : "Pilih pekerjaan..."}
                      </span>
                      <span>▾</span>
                    </div>
                    {showJobPanel && (
                      <div
                        className="position-absolute w-100 bg-white border border-primary rounded-3 shadow p-2"
                        style={{
                          zIndex: 200,
                          maxHeight: 260,
                          overflowY: "auto",
                        }}
                      >
                        {jobList.length === 0 ? (
                          <div className="text-muted small px-2 py-1">
                            Belum ada pilihan pekerjaan. Tambahkan lewat menu
                            Pengaturan.
                          </div>
                        ) : (
                          <div className="d-flex flex-wrap gap-2">
                            {jobList.map((job) => {
                              const active = selectedJobs.includes(job);
                              return (
                                <div
                                  key={job}
                                  onClick={() => toggleJob(job)}
                                  className="d-flex align-items-center gap-2"
                                  style={{
                                    cursor: "pointer",
                                    userSelect: "none",
                                    fontSize: "0.8125rem",
                                    fontWeight: 600,
                                    padding: "8px 12px",
                                    borderRadius: 999,
                                    border: `1.5px solid ${active ? "#0d6efd" : "#e2e8f0"}`,
                                    background: active ? "#0d6efd" : "#f8fafc",
                                    color: active ? "#fff" : "#64748b",
                                    transition: "all 0.15s",
                                  }}
                                >
                                  <span
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      width: 15,
                                      height: 15,
                                      borderRadius: "50%",
                                      border: "1.5px solid currentColor",
                                      fontSize: 10,
                                      lineHeight: 1,
                                      flexShrink: 0,
                                    }}
                                  >
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
                </div>

                {/* Shift */}
                <div className="col-12 col-md-6">
                  <label className="form-label small fw-bold text-uppercase text-muted">
                    Shift
                  </label>
                  <select
                    className="form-select"
                    value={shift}
                    onChange={(e) => onShiftChange(e.target.value)}
                    required
                  >
                    <option value="">-- Pilih Shift --</option>
                    <option value="1">Shift 1 (Pagi)</option>
                    <option value="2">Shift 2 (Sore)</option>
                    <option value="3">Shift 3 (Malam)</option>
                  </select>
                  <div className="form-text">
                    Ganti shift di sini tidak otomatis mengubah tanggal —
                    sesuaikan manual di field Tanggal kalau perlu.
                  </div>
                </div>

                {/* Tanggal */}
                <div className="col-md-6">
                  <label className="form-label small fw-bold text-uppercase text-muted">
                    Tanggal
                  </label>
                  <input
                    type="date"
                    className="form-control"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    max={serverToday}
                    required
                  />
                </div>

                {/* Jumlah Produksi */}
                <div className="col-md-6">
                  <label className="form-label small fw-bold text-uppercase text-muted">
                    Jumlah Produksi
                  </label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="Total unit"
                    value={productionCount}
                    onChange={(e) => setProductionCount(e.target.value)}
                    required
                  />
                </div>

                {/* Catatan */}
                <div className="col-12">
                  <label className="form-label small fw-bold text-uppercase text-muted">
                    Catatan (Opsional)
                  </label>
                  <textarea
                    className="form-control"
                    rows={2}
                    placeholder="Kendala cuaca, mesin, dll..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>

                {/* Foto */}
                <div className="col-12">
                  <label className="form-label small fw-bold text-uppercase text-muted">
                    Foto (Opsional)
                  </label>
                  <div className="d-flex align-items-center gap-3">
                    <input
                      key={photoInputKey}
                      type="file"
                      className="form-control"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files[0];
                        setPhoto(file);
                        setRemovePhoto(false);
                        if (file) setPhotoPreview(URL.createObjectURL(file));
                      }}
                    />
                    {/* Foto existing */}
                    {existingPhoto && !photoPreview && (
                      <div style={{ position: "relative", flexShrink: 0 }}>
                        <img
                          src={fileUrl(existingPhoto)}
                          alt="Foto saat ini"
                          style={{
                            width: 64,
                            height: 64,
                            objectFit: "cover",
                            borderRadius: 10,
                            border: "2px solid #198754",
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setExistingPhoto("");
                            setRemovePhoto(true);
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
                    {/* Preview foto baru */}
                    {photoPreview && (
                      <div style={{ position: "relative", flexShrink: 0 }}>
                        <img
                          src={photoPreview}
                          alt="Preview"
                          style={{
                            width: 64,
                            height: 64,
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
                  {existingPhoto && (
                    <small className="text-muted mt-1 d-block">
                      Foto saat ini sudah ada. Upload baru untuk mengganti.
                    </small>
                  )}
                  {removePhoto && (
                    <small className="text-danger mt-1 d-block">
                      Foto akan dihapus setelah disimpan.
                    </small>
                  )}
                </div>

                {/* Submit */}
                <div className="col-12 mt-2">
                  <button
                    type="submit"
                    className="btn btn-primary w-100 py-3 fw-bold"
                    disabled={submitting}
                  >
                    {submitting ? "⏳ Menyimpan..." : "💾 UPDATE DATA PRODUKSI"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Tutup job panel klik luar */}
      {showJobPanel && (
        <div
          style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }}
          onClick={() => setShowJobPanel(false)}
        />
      )}
    </div>
  );
}
