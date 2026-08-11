import { useState, useEffect, useRef, useCallback } from "react";
import Btn from "../components/Btn";
import Icon from "../components/Icon";
import Input from "../components/Input";
import SectionLabel from "../components/SectionLabel";
import theme from "../styles/theme";
import { supabase } from "../lib/supabase";
import { useCameraGPS } from "../hooks/useCameraGPS";
import { useBackableView } from "../hooks/useBackableView";
import sop1 from "../assets/acuan/01.png";
import sop2 from "../assets/acuan/02.png";
import sop3 from "../assets/acuan/03.png";
import sop4 from "../assets/acuan/04.png";
import sop5 from "../assets/acuan/05.png";
import sop6 from "../assets/acuan/06.png";
import sop7 from "../assets/acuan/07.png";
import sop8 from "../assets/acuan/08.png";
import sop9 from "../assets/acuan/09.png";
import sop10 from "../assets/acuan/10.png";
import sop11 from "../assets/acuan/11.png";
import sop12 from "../assets/acuan/12.png";
import sop13 from "../assets/acuan/13.png";
import sop14 from "../assets/acuan/14.png";
import sop15 from "../assets/acuan/15.png";
import sop16 from "../assets/acuan/16.png";

const SOP_IMAGES = [sop1, sop2, sop3, sop4, sop5, sop6, sop7, sop8, sop9, sop10, sop11, sop12, sop13, sop14, sop15, sop16];

const CHECKPOINTS = [
  { menit: 0,  label: "Menit Awal (0 Menit)" },
  { menit: 5,  label: "5 Menit Pertama" },
  { menit: 10, label: "5 Menit Kedua (10 Menit)" },
  { menit: 15, label: "5 Menit Ketiga (15 Menit)" },
  { menit: 20, label: "5 Menit Keempat (20 Menit)" },
  { menit: 25, label: "5 Menit Kelima (25 Menit)" },
  { menit: 30, label: "5 Menit Keenam (30 Menit)" },
];

// Urutan step form — dipakai untuk sinkronisasi dengan history browser
// (lihat navigateToStep di dalam komponen HSEFormScreen).
const STEP_ORDER = ["sop", "kendaraan", "kategori", "ujikedap", "ringkasan"];

// ── Draft persistence (agar data tidak hilang kalau app ke-close / ke tombol home) ──
const DRAFT_KEY = "hse_form_draft_v1";

const saveDraft = (data) => {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); } catch {}
};
const loadDraft = () => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};
const clearDraft = () => {
  try { localStorage.removeItem(DRAFT_KEY); } catch {}
};

// ── Helpers timestamp & GPS ───────────────────────────────────────────────────
const decimalToDMS = (decimal, posDir, negDir) => {
  const dir = decimal >= 0 ? posDir : negDir;
  const abs = Math.abs(decimal);
  const deg = Math.floor(abs);
  const minFull = (abs - deg) * 60;
  const min = Math.floor(minFull);
  const sec = Math.round((minFull - min) * 60);
  return `${deg}\u00b0${min}'${sec}"${dir}`;
};
const formatDMS = (lat, lng) =>
  `${decimalToDMS(lat, "N", "S")} ${decimalToDMS(lng, "E", "W")}`;
const formatServerTime = (date) => {
  const hari  = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"][date.getDay()];
  const bulan = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"][date.getMonth()];
  const hh = String(date.getHours()).padStart(2,"0");
  const mm = String(date.getMinutes()).padStart(2,"0");
  const ss = String(date.getSeconds()).padStart(2,"0");
  return `${hari}, ${date.getDate()} ${bulan} ${date.getFullYear()} ${hh}:${mm}:${ss}`;
};
const formatTanggal = (val) => {
  if (!val) return "-";
  try {
    return new Date(val).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  } catch { return val; }
};
// Cek apakah tanggal masa berlaku (Head Truck / Tangki) sudah lewat hari ini.
// Kalau kosong/tidak valid, dianggap TIDAK kedaluwarsa (biar tidak memblokir kalau datanya memang belum diisi admin).
const isExpired = (val) => {
  if (!val) return false;
  const d = new Date(val);
  if (isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
};

// ── Umur MT & sisa waktu masa berlaku — dihitung ULANG setiap render ────────
// supaya otomatis update setiap hari begitu halaman dibuka, tidak disimpan statis.
// Logika sama persis dengan AdminKendaraanScreen.jsx supaya angka yang tampil
// konsisten di semua tempat.
const diffYMD = (start, end) => {
  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  let days = end.getDate() - start.getDate();
  if (days < 0) {
    months -= 1;
    const prevMonthLastDay = new Date(end.getFullYear(), end.getMonth(), 0).getDate();
    days += prevMonthLastDay;
  }
  if (months < 0) { years -= 1; months += 12; }
  return { years, months, days };
};

const calcUmurMT = (tanggalStnk) => {
  if (!tanggalStnk) return null;
  const start = new Date(tanggalStnk);
  if (isNaN(start.getTime())) return null;
  const { years, months, days } = diffYMD(start, new Date());
  return `${years} Tahun, ${months} Bulan, ${days} Hari`;
};

// null kalau tanggal sudah lewat (dianggap kadaluarsa, ditangani terpisah oleh isExpired)
const calcSisaWaktu = (tanggalTarget) => {
  if (!tanggalTarget) return null;
  const target = new Date(tanggalTarget);
  const now = new Date();
  if (isNaN(target.getTime()) || target <= now) return null;
  const { years, months, days } = diffYMD(now, target);
  return `${years} Tahun, ${months} Bulan, ${days} Hari`;
};

const formatNopol = (raw) => {
  const clean = (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return clean
    .replace(/([A-Z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Z])/g, "$1 $2");
};

// ── applyOverlay (shared) ─────────────────────────────────────────────────────
const applyOverlay = async (file, pos) => {
  let serverTime = new Date();
  try {
    const { data } = await supabase.rpc("get_server_time");
    if (data) serverTime = new Date(data);
  } catch {}

  const { latitude, longitude } = pos.coords;
  const dmsStr  = formatDMS(latitude, longitude);
  const timeStr = formatServerTime(serverTime);

  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    bitmap = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = URL.createObjectURL(file);
    });
  }

  const MAX_DIM = 1600;
  let targetW = bitmap.width, targetH = bitmap.height;
  if (Math.max(targetW, targetH) > MAX_DIM) {
    const scale = MAX_DIM / Math.max(targetW, targetH);
    targetW = Math.round(targetW * scale);
    targetH = Math.round(targetH * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width  = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  if (bitmap.close) bitmap.close();

  const fontSize = Math.max(20, Math.round(targetW * 0.028));
  const pad      = fontSize * 0.7;
  const lineH    = fontSize * 1.6;
  ctx.font = `bold ${fontSize}px Arial, sans-serif`;
  const boxW = Math.max(ctx.measureText(timeStr).width, ctx.measureText(dmsStr).width) + pad * 2.5;
  const boxH = lineH * 2 + pad * 1.5;
  const x    = pad;
  const y    = canvas.height - boxH - pad;
  ctx.fillStyle = "rgba(0,0,0,0.60)";
  ctx.fillRect(x, y, boxW, boxH);
  ctx.font = `bold ${fontSize}px Arial, sans-serif`;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(timeStr, x + pad, y + pad + fontSize);
  ctx.fillText(dmsStr,  x + pad, y + pad + fontSize + lineH);

  return new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.9));
};

// ── uploadFoto (shared) ───────────────────────────────────────────────────────
const uploadFoto = async (file, kategori, pos) => {
  const blob = await applyOverlay(file, pos);
  const fileName = `hse-${kategori}-${Date.now()}.jpg`;
  const { data, error } = await supabase.storage
    .from("foto-inspeksi").upload(fileName, blob, { contentType: "image/jpeg" });
  if (error) throw new Error("Foto gagal diupload: " + error.message);
  const { data: pub } = supabase.storage.from("foto-inspeksi").getPublicUrl(data.path);
  return { name: fileName, url: pub.publicUrl, path: data.path };
};

// ── PhotoLightbox — preview foto full-screen sebelum dikirim ──────────────────
const PhotoLightbox = ({ url, onClose }) => {
  useBackableView(!!url, onClose);
  if (!url) return null;
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <img
        src={url}
        alt="Preview foto"
        style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 10, objectFit: "contain" }}
      />
    </div>
  );
};

// ── CameraCapture — 1 foto, wajib ────────────────────────────────────────────
// requestAccess() dari useCameraGPS (di-warm-up sejak layar ini mount) —
// kalau kamera & GPS sudah "hangat", ini langsung buka file input tanpa nunggu.
const CameraCaptureSingle = ({ label, onFoto, foto, errorFoto, onPreview, requestAccess }) => {
  const [capState, setCapState] = useState("idle");
  const [permErr,  setPermErr]  = useState(null);
  const fileInputRef = useRef(null);
  const cachedPosRef  = useRef(null);

  const handleCaptureClick = async () => {
    setPermErr(null);
    setCapState("checking");
    try {
      cachedPosRef.current = await requestAccess();
      setCapState("idle");
      fileInputRef.current?.click();
    } catch {
      setCapState("idle");
      setPermErr("Izin kamera/lokasi diperlukan. Aktifkan di pengaturan browser.");
    }
  };

  const handleFileChange = async (e) => {
    const file = (e.target.files || [])[0];
    if (!file) return;
    setCapState("processing");
    try {
      const result = await uploadFoto(file, label.replace(/\s+/g, "_").toLowerCase(), cachedPosRef.current);
      onFoto(result);
    } catch (err) {
      alert("⚠️ " + err.message);
    } finally {
      setCapState("idle");
      cachedPosRef.current = null;
      e.target.value = "";
    }
  };

  const removeFoto = async () => {
    if (foto?.path) await supabase.storage.from("foto-inspeksi").remove([foto.path]).catch(() => {});
    onFoto(null);
  };

  const isWorking = capState !== "idle";

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{
        border: `2px dashed ${errorFoto ? theme.danger : theme.border}`, borderRadius: 10, padding: "12px 14px",
        background: errorFoto ? theme.dangerLight : "transparent",
      }}>
        <div style={{ fontSize: 11, color: errorFoto ? theme.danger : theme.textMuted, marginBottom: 8, textAlign: "center" }}>
          {label}
          <div style={{ marginTop: 2 }}>📷 Kamera belakang · ⏱ Timestamp · 📍 GPS</div>
        </div>
        {permErr && (
          <div style={{ marginBottom: 8, padding: "6px 10px", borderRadius: 8, background: theme.dangerLight, color: theme.danger, fontSize: 12, fontWeight: 600 }}>
            ⛔ {permErr}
          </div>
        )}
        <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
          onChange={handleFileChange} style={{ display: "none" }} />
        {foto ? (
          <div style={{ padding: "8px 10px", background: theme.primaryLight, borderRadius: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <img
                src={foto.url}
                alt={foto.name}
                onClick={() => onPreview?.(foto.url)}
                style={{ width: 46, height: 46, borderRadius: 6, objectFit: "cover", cursor: "pointer", border: `1px solid ${theme.primary}`, flexShrink: 0 }}
              />
              <div style={{ flex: 1, fontSize: 12, color: theme.primary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                ✓ {foto.name}
              </div>
              <div onClick={() => onPreview?.(foto.url)} style={{ cursor: "pointer", fontSize: 12, color: theme.primary, fontWeight: 700, flexShrink: 0 }}>
                🔍 Lihat
              </div>
              <div onClick={removeFoto} style={{ cursor: "pointer", fontWeight: 700, color: theme.danger, flexShrink: 0 }}>✕</div>
            </div>
          </div>
        ) : (
          <Btn onClick={handleCaptureClick} variant="outline"
            style={{ padding: "9px", fontSize: 13, width: "100%" }} disabled={isWorking}>
            {capState === "checking" ? "🔐 Cek izin..." : capState === "processing" ? "⏳ Memproses..." : "📷 Ambil Foto"}
          </Btn>
        )}
      </div>
      {errorFoto && (
        <div style={{ marginTop: 4, fontSize: 12, color: theme.danger, fontWeight: 600 }}>⚠️ Foto wajib diambil.</div>
      )}
    </div>
  );
};

// ── TemuanFotoGroup — satu "sesi temuan": 1 keterangan + banyak foto (angle) ──
// Dipakai saat status "Tidak Kedap". Setiap temuan boleh punya beberapa foto
// (sudut pandang berbeda dari kondisi/kebocoran yang sama) di bawah satu
// keterangan. Untuk menambah temuan baru (kondisi/lokasi berbeda), gunakan
// tombol "Temuan Lainnya" di TemuanList.
const TemuanFotoGroup = ({ index, temuan, onUpdate, onRemove, onPreview, requestAccess, canRemove }) => {
  const [capState, setCapState] = useState("idle");
  const [permErr,  setPermErr]  = useState(null);
  const fileInputRef = useRef(null);
  const cachedPosRef  = useRef(null);

  const handleCaptureClick = async () => {
    setPermErr(null);
    setCapState("checking");
    try {
      cachedPosRef.current = await requestAccess();
      setCapState("idle");
      fileInputRef.current?.click();
    } catch {
      setCapState("idle");
      setPermErr("Izin kamera/lokasi diperlukan. Aktifkan di pengaturan browser.");
    }
  };

  const handleFileChange = async (e) => {
    const file = (e.target.files || [])[0];
    if (!file) return;
    setCapState("processing");
    try {
      const result = await uploadFoto(file, `temuan-${index}-${Date.now()}`, cachedPosRef.current);
      onUpdate({ ...temuan, fotos: [...temuan.fotos, result] });
    } catch (err) {
      alert("⚠️ " + err.message);
    } finally {
      setCapState("idle");
      cachedPosRef.current = null;
      e.target.value = "";
    }
  };

  const removeFoto = async (fIdx) => {
    const foto = temuan.fotos[fIdx];
    if (foto?.path) await supabase.storage.from("foto-inspeksi").remove([foto.path]).catch(() => {});
    onUpdate({ ...temuan, fotos: temuan.fotos.filter((_, i) => i !== fIdx) });
  };

  const setKeterangan = (val) => onUpdate({ ...temuan, keterangan: val });

  const isWorking = capState !== "idle";

  return (
    <div style={{ marginBottom: 14, padding: 14, borderRadius: 12, background: theme.surfaceAlt, border: `1px solid ${theme.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: theme.text }}>📌 Temuan {index + 1}</div>
        {canRemove && (
          <div onClick={onRemove} style={{ cursor: "pointer", fontWeight: 700, color: theme.danger, fontSize: 12 }}>✕ Hapus Temuan</div>
        )}
      </div>

      <textarea
        placeholder="Keterangan temuan ini (wajib)..."
        value={temuan.keterangan}
        onChange={(e) => setKeterangan(e.target.value)}
        style={{
          width: "100%", padding: "8px 10px", borderRadius: 8,
          border: `1.5px solid ${!temuan.keterangan.trim() ? theme.danger : theme.border}`,
          background: !temuan.keterangan.trim() ? theme.dangerLight : theme.surface,
          color: theme.text, fontSize: 13, fontFamily: "'DM Sans', sans-serif",
          resize: "none", minHeight: 60, boxSizing: "border-box", outline: "none", marginBottom: 8,
        }}
      />
      {!temuan.keterangan.trim() && (
        <div style={{ fontSize: 11, color: theme.danger, fontWeight: 600, marginBottom: 10 }}>⚠️ Keterangan wajib diisi.</div>
      )}

      {temuan.fotos.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {temuan.fotos.map((foto, fIdx) => (
            <div key={foto.path || fIdx} style={{ position: "relative" }}>
              <img
                src={foto.url}
                alt={foto.name}
                onClick={() => onPreview?.(foto.url)}
                style={{ width: 60, height: 60, borderRadius: 8, objectFit: "cover", cursor: "pointer", border: `1px solid ${theme.primary}` }}
              />
              <div
                onClick={() => removeFoto(fIdx)}
                style={{
                  position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%",
                  background: theme.danger, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 700, cursor: "pointer", lineHeight: 1,
                }}
              >✕</div>
            </div>
          ))}
        </div>
      )}

      {temuan.fotos.length === 0 && (
        <div style={{ fontSize: 11, color: theme.danger, fontWeight: 600, marginBottom: 10 }}>⚠️ Minimal 1 foto wajib diupload untuk temuan ini.</div>
      )}

      {permErr && (
        <div style={{ marginBottom: 8, padding: "6px 10px", borderRadius: 8, background: theme.dangerLight, color: theme.danger, fontSize: 12, fontWeight: 600 }}>
          ⛔ {permErr}
        </div>
      )}
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
        onChange={handleFileChange} style={{ display: "none" }} />
      <Btn onClick={handleCaptureClick} variant="outline"
        style={{ padding: "8px", fontSize: 12, width: "100%" }} disabled={isWorking}>
        {capState === "checking" ? "🔐 Cek izin..." : capState === "processing" ? "⏳ Memproses..." : "📷 Tambah Foto"}
      </Btn>
    </div>
  );
};

// ── TemuanList — daftar sesi temuan, bisa ditambah dengan "Temuan Lainnya" ────
const TemuanList = ({ temuanList, onTemuanList, onPreview, requestAccess }) => {
  const addTemuan = () => {
    onTemuanList((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, keterangan: "", fotos: [] }]);
  };

  const updateTemuan = (idx, updated) => {
    onTemuanList((prev) => prev.map((t, i) => (i === idx ? updated : t)));
  };

  const removeTemuan = async (idx) => {
    const t = temuanList[idx];
    if (t?.fotos?.length) {
      const paths = t.fotos.map((f) => f.path).filter(Boolean);
      if (paths.length) await supabase.storage.from("foto-inspeksi").remove(paths).catch(() => {});
    }
    onTemuanList((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div>
      {temuanList.map((t, idx) => (
        <TemuanFotoGroup
          key={t.id}
          index={idx}
          temuan={t}
          onUpdate={(updated) => updateTemuan(idx, updated)}
          onRemove={() => removeTemuan(idx)}
          onPreview={onPreview}
          requestAccess={requestAccess}
          canRemove={temuanList.length > 1}
        />
      ))}
      <Btn onClick={addTemuan} variant="outline" style={{ padding: "9px", fontSize: 13, width: "100%" }}>
        ➕ Temuan Lainnya
      </Btn>
    </div>
  );
};

// ── InfoRow — baris info kendaraan read-only dari database ────────────────────
const InfoRow = ({ label, value, danger }) => (
  <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: `1px solid ${theme.border}` }}>
    <div style={{ fontSize: 12, color: theme.textMuted }}>{label}</div>
    <div style={{ fontSize: 13, fontWeight: 700, color: danger ? theme.danger : theme.text, textAlign: "right" }}>
      {value || "-"}{danger ? " ⚠️" : ""}
    </div>
  </div>
);

// ── HSEFormScreen ─────────────────────────────────────────────────────────────
const HSEFormScreen = ({ onBack, onNav }) => {
  const [step,        setStep]        = useState("sop");
  const [sopPage,     setSopPage]     = useState(0);
  const [currentUser, setCurrentUser] = useState(null);
  const [submitting,  setSubmitting]  = useState(false);

  // ── Navigasi step tersinkron dengan riwayat browser ─────────────────────
  const stepIndexRef = useRef(0);

  const tagInitialHistory = (initialStep) => {
    const idx = Math.max(0, STEP_ORDER.indexOf(initialStep));
    stepIndexRef.current = idx;
    try { window.history.replaceState({ hseStep: initialStep, stepIndex: idx }, ""); } catch {}
  };

  const navigateToStep = (targetStep) => {
    const targetIndex = STEP_ORDER.indexOf(targetStep);
    if (targetIndex === -1) { setStep(targetStep); return; }
    const delta = targetIndex - stepIndexRef.current;

    setStep(targetStep);
    stepIndexRef.current = targetIndex;

    if (delta > 0) {
      try { window.history.pushState({ hseStep: targetStep, stepIndex: targetIndex }, ""); } catch {}
    } else if (delta < 0) {
      try { window.history.go(delta); } catch {}
    }
  };

  useEffect(() => {
    const handlePopState = (e) => {
      const s = e.state?.hseStep;
      if (s && STEP_ORDER.includes(s)) {
        setStep(s);
        stepIndexRef.current = STEP_ORDER.indexOf(s);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const { warmUp, coolDown, requestAccess } = useCameraGPS();
  useEffect(() => {
    warmUp();
    return () => coolDown();
  }, [warmUp, coolDown]);

  const [lookupStatus, setLookupStatus] = useState("idle");
  const lookupTimer = useRef(null);

  const [riwayatSebelumnya, setRiwayatSebelumnya] = useState([]);

  const [kendaraan, setKendaraan] = useState({
    polisi: "", kapasitas: "", kompartemen: "", transportir: "",
    masaBerlakuHeadTruck: "", masaBerlakuTangki: "", tanggalStnk: "",
  });

  const [kategoriMT, setKategoriMT] = useState("");

  const initCheckpoints = () =>
    CHECKPOINTS.map((cp) => ({ menit: cp.menit, status: "", foto: null }));

  // fotoTemuan: array of { id, keterangan, fotos: [{name,url,path}, ...] }
  // — satu "temuan" = satu keterangan + boleh banyak foto (angle berbeda).
  const initTemuan = () => [{ id: `${Date.now()}-init`, keterangan: "", fotos: [] }];

  const [checkpoints,  setCheckpoints]  = useState(initCheckpoints);
  const [fotoTemuan,   setFotoTemuan]   = useState([]);

  const [previewUrl, setPreviewUrl] = useState(null);

  const [ready, setReady] = useState(false);
  const [showRestoreBanner, setShowRestoreBanner] = useState(false);

  const [errors, setErrors] = useState({});

  const allFotoPaths = useRef([]);
  const submittedRef = useRef(false);

  useEffect(() => {
    const cpPaths     = checkpoints.map((cp) => cp.foto?.path).filter(Boolean);
    const temuanPaths = fotoTemuan.flatMap((t) => (t.fotos || []).map((f) => f.path)).filter(Boolean);
    allFotoPaths.current = [...cpPaths, ...temuanPaths];
  }, [checkpoints, fotoTemuan]);

  useEffect(() => {
    return () => {
      if (!submittedRef.current && allFotoPaths.current.length > 0) {
        supabase.storage.from("foto-inspeksi").remove(allFotoPaths.current).catch(console.error);
      }
    };
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUser(user.id);
    });
  }, []);

  const DRAFT_EXPIRE_MS = 6 * 60 * 60 * 1000;
  const draftCreatedAtRef = useRef(null);
  const [draftExpiredNotice, setDraftExpiredNotice] = useState(false);

  useEffect(() => {
    const draft = loadDraft();
    let initialStep = "sop";
    if (draft) {
      const age = Date.now() - (draft.createdAt || 0);
      if (draft.createdAt && age > DRAFT_EXPIRE_MS) {
        clearDraft();
        setDraftExpiredNotice(true);
      } else {
        initialStep = draft.step || "sop";
        setSopPage(draft.sopPage || 0);
        setKendaraan(draft.kendaraan || { polisi: "", kapasitas: "", kompartemen: "", transportir: "", masaBerlakuHeadTruck: "", masaBerlakuTangki: "", tanggalStnk: "" });
        setKategoriMT(draft.kategoriMT || "");
        setLookupStatus(draft.lookupStatus || "idle");
        setCheckpoints(draft.checkpoints && draft.checkpoints.length ? draft.checkpoints : initCheckpoints());
        // Kompatibilitas draft lama (format flat {url,path,keterangan}) —
        // dikonversi jadi satu temuan per foto supaya tidak error/hilang.
        if (draft.fotoTemuan && draft.fotoTemuan.length) {
          const looksGrouped = draft.fotoTemuan[0] && Array.isArray(draft.fotoTemuan[0].fotos);
          if (looksGrouped) {
            setFotoTemuan(draft.fotoTemuan);
          } else {
            setFotoTemuan(draft.fotoTemuan.map((f, i) => ({
              id: `legacy-${i}`, keterangan: f.keterangan || "", fotos: f.url ? [f] : [],
            })));
          }
        } else {
          setFotoTemuan([]);
        }
        setRiwayatSebelumnya(draft.riwayatSebelumnya || []);
        draftCreatedAtRef.current = draft.createdAt || Date.now();
        setShowRestoreBanner(true);
      }
    }
    setStep(initialStep);
    tagInitialHistory(initialStep);
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready) return;
    const hasProgress =
      step !== "sop" || sopPage > 0 || kendaraan.polisi.trim() || kategoriMT || fotoTemuan.some((t) => t.fotos.length > 0 || t.keterangan.trim());
    if (!hasProgress) { clearDraft(); draftCreatedAtRef.current = null; return; }
    if (!draftCreatedAtRef.current) draftCreatedAtRef.current = Date.now();
    saveDraft({ createdAt: draftCreatedAtRef.current, step, sopPage, kendaraan, kategoriMT, lookupStatus, checkpoints, fotoTemuan, riwayatSebelumnya });
  }, [ready, step, sopPage, kendaraan, kategoriMT, lookupStatus, checkpoints, fotoTemuan, riwayatSebelumnya]);

  const resetSemua = () => {
    clearDraft();
    draftCreatedAtRef.current = null;
    navigateToStep("sop");
    setSopPage(0);
    setKendaraan({ polisi: "", kapasitas: "", kompartemen: "", transportir: "", masaBerlakuHeadTruck: "", masaBerlakuTangki: "", tanggalStnk: "" });
    setKategoriMT("");
    setLookupStatus("idle");
    setCheckpoints(initCheckpoints());
    setFotoTemuan([]);
    setRiwayatSebelumnya([]);
    setShowRestoreBanner(false);
  };

  const restoreBanner = showRestoreBanner && (
    <div style={{
      margin: "0 16px 12px", padding: "10px 14px", borderRadius: 10,
      background: "#FEF3C7", color: "#92400E", fontSize: 12, fontWeight: 600,
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
    }}>
      <span>♻️ Data pengisian sebelumnya berhasil dipulihkan.</span>
      <div style={{ display: "flex", gap: 12, flexShrink: 0 }}>
        <span
          onClick={() => {
            if (window.confirm("Hapus semua data yang sudah diisi dan mulai formulir baru?")) {
              resetSemua();
            }
          }}
          style={{ cursor: "pointer", textDecoration: "underline" }}
        >
          Mulai Baru
        </span>
        <span onClick={() => setShowRestoreBanner(false)} style={{ cursor: "pointer" }}>✕</span>
      </div>
    </div>
  );

  const expiredNotice = draftExpiredNotice && (
    <div style={{
      margin: "0 16px 12px", padding: "10px 14px", borderRadius: 10,
      background: theme.surfaceAlt, color: theme.textMuted, fontSize: 12, fontWeight: 600,
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
    }}>
      <span>🗑️ Draft pengisian sebelumnya (lebih dari 6 jam) sudah dihapus otomatis.</span>
      <span onClick={() => setDraftExpiredNotice(false)} style={{ cursor: "pointer" }}>✕</span>
    </div>
  );

  const handlePolisiChange = useCallback((val) => {
    const formatted = formatNopol(val);
    setKendaraan((p) => ({
      ...p, polisi: formatted, kapasitas: "", kompartemen: "", transportir: "",
      masaBerlakuHeadTruck: "", masaBerlakuTangki: "", tanggalStnk: "",
    }));
    setLookupStatus("idle");
    setRiwayatSebelumnya([]);
    setCheckpoints(initCheckpoints());
    setFotoTemuan([]);
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    if (!formatted.trim()) return;

    lookupTimer.current = setTimeout(async () => {
      setLookupStatus("loading");
      try {
        const { data } = await supabase
          .from("kendaraan")
          .select("transportir, kapasitas_mt, jumlah_kompartemen, kategori_mt, masa_berlaku_head_truck, masa_berlaku_tangki, tanggal_stnk")
          .eq("nomor_polisi", formatted.trim()).maybeSingle();
        if (data) {
          setKendaraan((p) => ({
            ...p,
            transportir:           data.transportir            || "",
            kapasitas:             data.kapasitas_mt            || "",
            kompartemen:           data.jumlah_kompartemen?.toString() || "",
            masaBerlakuHeadTruck:  data.masa_berlaku_head_truck || "",
            masaBerlakuTangki:     data.masa_berlaku_tangki     || "",
            tanggalStnk:           data.tanggal_stnk            || "",
          }));
          if (data.kategori_mt) setKategoriMT(data.kategori_mt);
          setLookupStatus("found");

          const { data: riwayatData } = await supabase
            .from("inspeksi_hse")
            .select("status, created_at")
            .eq("nomor_polisi", formatted.trim())
            .order("created_at", { ascending: false })
            .limit(3);
          setRiwayatSebelumnya(riwayatData || []);
        } else {
          setLookupStatus("notfound");
        }
      } catch { setLookupStatus("notfound"); }
    }, 600);
  }, []);

  const idxTidakKedap = checkpoints.findIndex((cp) => cp.status === "tidak_kedap");
  const statusAkhir   = idxTidakKedap >= 0 ? "tidak_kedap"
    : checkpoints.every((cp) => cp.status === "kedap") ? "kedap" : "";

  const setCheckpointStatus = (idx, status) => {
    setCheckpoints((prev) => {
      const next = prev.map((cp, i) => {
        if (i === idx) return { ...cp, status };
        if (status === "tidak_kedap" && i > idx) return { ...cp, status: "", foto: null };
        return cp;
      });
      return next;
    });
    if (status === "kedap") setFotoTemuan([]);
    if (status === "tidak_kedap") {
      // Siapkan minimal satu grup temuan kosong begitu status tidak kedap
      // dipilih, supaya form temuan langsung terlihat siap diisi.
      setFotoTemuan((prev) => (prev.length > 0 ? prev : initTemuan()));
    }
  };

  const setCheckpointFoto = (idx, foto) => {
    setCheckpoints((prev) => prev.map((cp, i) => i === idx ? { ...cp, foto } : cp));
  };

  const handleLanjutSOP = () => {
    if (sopPage < SOP_IMAGES.length - 1) { setSopPage((p) => p + 1); return; }
    navigateToStep("kendaraan");
  };
  const handleSkipSOP = () => navigateToStep("kendaraan");

  const handleLanjutKendaraan = () => {
    if (lookupStatus !== "found") {
      alert("Nomor Polisi tidak terdaftar. Uji kedap tidak dapat dilanjutkan.");
      return;
    }
    if (isExpired(kendaraan.masaBerlakuHeadTruck) || isExpired(kendaraan.masaBerlakuTangki)) {
      alert("Masa berlaku Head Truck/Tangki kendaraan ini sudah kedaluwarsa. Uji kedap tidak dapat dilanjutkan.");
      return;
    }
    navigateToStep("kategori");
  };

  const handleLanjutKategori = () => {
    if (!kategoriMT) { alert("Pilih kategori MT terlebih dahulu!"); return; }
    navigateToStep("ujikedap");
  };

  const validateUjiKedap = () => {
    const e = {};
    if (!statusAkhir) { e.uji_incomplete = true; }
    else if (statusAkhir === "kedap") {
      checkpoints.forEach((cp, i) => {
        if (!cp.foto) e[`cp_${i}_foto`] = true;
      });
    } else {
      if (fotoTemuan.length === 0) e.temuan_foto = true;
      fotoTemuan.forEach((t, i) => {
        if (!t.keterangan.trim()) e[`temuan_${i}_ket`] = true;
        if (!t.fotos || t.fotos.length === 0) e[`temuan_${i}_foto`] = true;
      });
    }
    return e;
  };

  const handleTinjau = () => {
    const e = validateUjiKedap();
    setErrors(e);
    if (Object.keys(e).length > 0) { alert("Lengkapi semua data uji kedap!"); return; }
    navigateToStep("ringkasan");
  };

  const handleSubmit = async () => {
    const e = validateUjiKedap();
    setErrors(e);
    if (Object.keys(e).length > 0) { alert("Lengkapi semua data uji kedap!"); navigateToStep("ujikedap"); return; }

    setSubmitting(true);
    let inspData = null;
    try {
      const { data, error: inspErr } = await supabase
        .from("inspeksi_hse").insert([{
          user_id:            currentUser,
          nomor_polisi:       kendaraan.polisi.trim().toUpperCase(),
          kapasitas_mt:       kendaraan.kapasitas,
          jumlah_kompartemen: parseInt(kendaraan.kompartemen),
          transportir:        kendaraan.transportir,
          kategori_mt:        kategoriMT,
          is_submitted:       true,
          submitted_at:       new Date().toISOString(),
          status:             statusAkhir === "kedap" ? "lulus" : "tidak_lulus",
        }]).select().single();
      if (inspErr) throw inspErr;
      inspData = data;

      const { error: cpErr } = await supabase.from("inspeksi_hse_checkpoint").insert(
        checkpoints
          .filter((cp) => cp.status !== "")
          .map((cp) => ({
            inspeksi_hse_id: inspData.id,
            menit:           cp.menit,
            status:          cp.status,
            foto_url:        cp.foto?.url || null,
          }))
      );
      if (cpErr) throw cpErr;

      if (fotoTemuan.length > 0) {
        // Setiap temuan bisa punya beberapa foto (angle berbeda) — diratakan
        // jadi satu baris per foto, dengan keterangan yang sama untuk semua
        // foto dalam temuan yang sama, agar tetap kompatibel dengan skema
        // tabel foto_inspeksi_hse yang sudah ada (url + keterangan).
        const rows = fotoTemuan.flatMap((t) =>
          t.fotos.map((f) => ({
            inspeksi_hse_id: inspData.id,
            url:             f.url,
            keterangan:      t.keterangan,
          }))
        );
        const { error: temuanErr } = await supabase.from("foto_inspeksi_hse").insert(rows);
        if (temuanErr) throw temuanErr;
      }

      submittedRef.current = true;
      clearDraft();

      alert(statusAkhir === "kedap"
        ? "Kendaraan LULUS Uji Kedap! Data berhasil di Unggah."
        : "Kendaraan TIDAK LULUS Uji Kedap. Data temuan berhasil di Unggah.");
      onNav("dashboard");
    } catch (err) {
      if (inspData?.id) {
        await supabase.from("inspeksi_hse").delete().eq("id", inspData.id).catch(() => {});
      }
      alert("Gagal menyimpan: " + err.message + "\n\nData belum tersimpan. Silakan coba kirim ulang.");
    } finally {
      setSubmitting(false);
    }
  };

  if (step === "sop") {
    return (
      <div style={{ minHeight: "100vh", background: "#000", display: "flex", flexDirection: "column" }}>
        <div style={{ background: theme.surface, padding: "48px 16px 16px", borderBottom: `1px solid ${theme.border}` }}>
          <div onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, cursor: "pointer", color: theme.textSub, fontSize: 13 }}>
            <Icon name="arrow" size={16} color={theme.textSub} /> Kembali
          </div>
          <div style={{ fontWeight: 800, fontSize: 18, color: theme.text }}>Acuan SOP Uji Kedap</div>
          <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 2 }}>
            Halaman {sopPage + 1} dari {SOP_IMAGES.length} — baca sebelum melanjutkan
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
            {SOP_IMAGES.map((_, i) => (
              <div key={i} style={{
                flex: 1, height: 4, borderRadius: 4,
                background: i <= sopPage ? theme.primary : theme.border,
                transition: "background 0.2s",
              }} />
            ))}
          </div>
        </div>

        {expiredNotice}

        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: theme.bg, padding: 16 }}>
          <img src={SOP_IMAGES[sopPage]} alt={`SOP halaman ${sopPage + 1}`}
            style={{ width: "100%", maxWidth: 500, borderRadius: 12, boxShadow: "0 4px 20px rgba(0,0,0,0.15)", objectFit: "contain" }} />
        </div>

        <div style={{ background: theme.surface, padding: "16px", borderTop: `1px solid ${theme.border}` }}>
          <div style={{ display: "flex", gap: 10 }}>
            {sopPage > 0 && (
              <Btn onClick={() => setSopPage((p) => p - 1)} variant="ghost" style={{ flex: 1 }}>
                ← Sebelumnya
              </Btn>
            )}
            <Btn onClick={handleLanjutSOP} variant="primary" style={{ flex: 2 }}>
              {sopPage < SOP_IMAGES.length - 1 ? "Halaman Berikutnya →" : "✅ Lanjutkan Pengecekan"}
            </Btn>
            {sopPage < SOP_IMAGES.length - 1 && (
              <Btn onClick={handleSkipSOP} variant="ghost" style={{ flex: 1 }}>
                Lewati ⏭
              </Btn>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (step === "kendaraan") {
    return (
      <div style={{ minHeight: "100vh", background: theme.bg, display: "flex", flexDirection: "column" }}>
        <div style={{ background: theme.surface, padding: "48px 16px 16px", borderBottom: `1px solid ${theme.border}`, boxShadow: theme.shadow }}>
          <div onClick={() => navigateToStep("sop")} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14, cursor: "pointer", color: theme.textSub, fontSize: 13 }}>
            <Icon name="arrow" size={16} color={theme.textSub} /> Kembali
          </div>
          <div style={{ fontWeight: 800, fontSize: 18, color: theme.text }}>Data Kendaraan</div>
          <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 2 }}>Cari nomor polisi yang terdaftar </div>
        </div>

        {restoreBanner}

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px", paddingBottom: 100 }}>
          <div style={{ background: theme.surface, borderRadius: 14, padding: 16, border: `1px solid ${theme.border}` }}>
            <Input label="Nomor Polisi" placeholder="Contoh: B 1234 XY"
              value={kendaraan.polisi} onChange={handlePolisiChange} />
            {lookupStatus === "loading" && (
              <div style={{ fontSize: 12, color: theme.textMuted }}>🔍 Mencari data kendaraan...</div>
            )}
            {lookupStatus === "found" && (
              <div style={{ fontSize: 12, color: theme.success, fontWeight: 600 }}>✅ Data kendaraan ditemukan</div>
            )}
            {lookupStatus === "notfound" && (
              <div style={{ fontSize: 12, color: theme.danger, fontWeight: 600 }}>
                ⛔ Nomor Polisi tidak terdaftar.
              </div>
            )}
          </div>

          {lookupStatus === "found" && (
            <div style={{ marginTop: 16, background: theme.surface, borderRadius: 14, padding: 16, border: `1px solid ${theme.border}` }}>
              <SectionLabel>Data Kendaraan (dari database)</SectionLabel>
              <InfoRow label="Kapasitas MT" value={kendaraan.kapasitas} />
              <InfoRow label="Jumlah Kompartemen" value={kendaraan.kompartemen} />
              <InfoRow label="Transportir" value={kendaraan.transportir} />
              {calcUmurMT(kendaraan.tanggalStnk) && (
                <InfoRow label="Umur MT" value={`${calcUmurMT(kendaraan.tanggalStnk)} (STNK: ${formatTanggal(kendaraan.tanggalStnk)})`} />
              )}
              <InfoRow
                label="Masa Berlaku Head Truck"
                value={
                  isExpired(kendaraan.masaBerlakuHeadTruck)
                    ? `${formatTanggal(kendaraan.masaBerlakuHeadTruck)} (Kadaluarsa)`
                    : calcSisaWaktu(kendaraan.masaBerlakuHeadTruck)
                      ? `${formatTanggal(kendaraan.masaBerlakuHeadTruck)} (${calcSisaWaktu(kendaraan.masaBerlakuHeadTruck)})`
                      : formatTanggal(kendaraan.masaBerlakuHeadTruck)
                }
                danger={isExpired(kendaraan.masaBerlakuHeadTruck)}
              />
              <InfoRow
                label="Masa Berlaku Tangki"
                value={
                  isExpired(kendaraan.masaBerlakuTangki)
                    ? `${formatTanggal(kendaraan.masaBerlakuTangki)} (Kadaluarsa)`
                    : calcSisaWaktu(kendaraan.masaBerlakuTangki)
                      ? `${formatTanggal(kendaraan.masaBerlakuTangki)} (${calcSisaWaktu(kendaraan.masaBerlakuTangki)})`
                      : formatTanggal(kendaraan.masaBerlakuTangki)
                }
                danger={isExpired(kendaraan.masaBerlakuTangki)}
              />
            </div>
          )}

          {lookupStatus === "found" && (isExpired(kendaraan.masaBerlakuHeadTruck) || isExpired(kendaraan.masaBerlakuTangki)) && (
            <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: 10, background: theme.dangerLight, color: theme.danger, fontSize: 12, fontWeight: 700 }}>
              ⛔ {isExpired(kendaraan.masaBerlakuHeadTruck) && isExpired(kendaraan.masaBerlakuTangki)
                ? "Masa berlaku Head Truck dan Tangki kendaraan ini sudah kedaluwarsa."
                : isExpired(kendaraan.masaBerlakuHeadTruck)
                  ? "Masa berlaku Head Truck kendaraan ini sudah kedaluwarsa."
                  : "Masa berlaku Tangki kendaraan ini sudah kedaluwarsa."}
              {" "}Uji kedap tidak dapat dilanjutkan sampai diperbarui — hubungi admin untuk perpanjangan/registrasi ulang.
            </div>
          )}

          {lookupStatus === "found" && riwayatSebelumnya.length > 0 && (
            <div style={{ marginTop: 16, background: theme.surface, borderRadius: 14, padding: 16, border: `1px solid ${theme.border}` }}>
              <SectionLabel>Riwayat Uji Kedap Sebelumnya</SectionLabel>
              {riwayatSebelumnya.map((r, i) => {
                const lulus = r.status === "lulus" || r.status === "selesai";
                return (
                  <div key={i} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "8px 0", borderBottom: i < riwayatSebelumnya.length - 1 ? `1px solid ${theme.border}` : "none",
                  }}>
                    <div style={{ fontSize: 12, color: theme.textMuted }}>
                      {new Date(r.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                    </div>
                    <div style={{
                      fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                      background: lulus ? theme.successLight : theme.dangerLight,
                      color: lulus ? theme.success : theme.danger,
                    }}>
                      {lulus ? "✅ Lulus" : "❌ Tidak Lulus"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, padding: "12px 16px", background: theme.surface, borderTop: `1px solid ${theme.border}` }}>
          <Btn
            onClick={handleLanjutKendaraan}
            variant="primary"
            disabled={lookupStatus !== "found" || isExpired(kendaraan.masaBerlakuHeadTruck) || isExpired(kendaraan.masaBerlakuTangki)}
          >
            Lanjut →
          </Btn>
        </div>
      </div>
    );
  }

  if (step === "kategori") {
    return (
      <div style={{ minHeight: "100vh", background: theme.bg, display: "flex", flexDirection: "column" }}>
        <div style={{ background: theme.surface, padding: "48px 16px 16px", borderBottom: `1px solid ${theme.border}`, boxShadow: theme.shadow }}>
          <div onClick={() => navigateToStep("kendaraan")} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14, cursor: "pointer", color: theme.textSub, fontSize: 13 }}>
            <Icon name="arrow" size={16} color={theme.textSub} /> Kembali
          </div>
          <div style={{ fontWeight: 800, fontSize: 18, color: theme.text }}>Kategori MT</div>
          <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 2 }}>Pilih jenis kendaraan MT</div>
        </div>

        {restoreBanner}

        <div style={{ flex: 1, padding: "24px 16px" }}>
          {[
            { value: "merah_putih", label: "MT Merah Putih", desc: "Untuk SPBU / distribusi BBM retail", icon: "🔴" },
            { value: "industri",    label: "MT Industri",    desc: "Untuk pabrik, tambang, industri", icon: "🏭" },
          ].map((opt) => (
            <div key={opt.value} onClick={() => setKategoriMT(opt.value)} style={{
              marginBottom: 14, padding: 20, borderRadius: 14, cursor: "pointer",
              border: `2px solid ${kategoriMT === opt.value ? theme.primary : theme.border}`,
              background: kategoriMT === opt.value ? theme.primaryLight : theme.surface,
              transition: "all 0.15s",
            }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{opt.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: theme.text }}>{opt.label}</div>
              <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 4 }}>{opt.desc}</div>
              {kategoriMT === opt.value && (
                <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: theme.primary }}>✓ Dipilih</div>
              )}
            </div>
          ))}
        </div>

        <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, padding: "12px 16px", background: theme.surface, borderTop: `1px solid ${theme.border}` }}>
          <Btn onClick={handleLanjutKategori} variant="primary" disabled={!kategoriMT}>Lanjut →</Btn>
        </div>
      </div>
    );
  }

  if (step === "ringkasan") {
    const totalFotoTemuan = fotoTemuan.reduce((sum, t) => sum + t.fotos.length, 0);
    return (
      <div style={{ minHeight: "100vh", background: theme.bg, display: "flex", flexDirection: "column" }}>
        <div style={{ background: theme.surface, padding: "48px 16px 16px", borderBottom: `1px solid ${theme.border}`, boxShadow: theme.shadow }}>
          <div onClick={() => navigateToStep("ujikedap")} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14, cursor: "pointer", color: theme.textSub, fontSize: 13 }}>
            <Icon name="arrow" size={16} color={theme.textSub} /> Kembali & Edit
          </div>
          <div style={{ fontWeight: 800, fontSize: 18, color: theme.text }}>Ringkasan Sebelum Kirim</div>
          <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 2 }}>Periksa kembali semua data sebelum diunggah</div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px", paddingBottom: 100 }}>
          <div style={{
            marginBottom: 16, padding: "14px 16px", borderRadius: 14, textAlign: "center",
            background: statusAkhir === "kedap" ? "#D1FAE5" : theme.dangerLight,
            color: statusAkhir === "kedap" ? theme.success : theme.danger,
            fontWeight: 800, fontSize: 15,
          }}>
            {statusAkhir === "kedap" ? "✅ LULUS UJI KEDAP" : "❌ TIDAK LULUS UJI KEDAP"}
          </div>

          <div style={{ marginBottom: 16, background: theme.surface, borderRadius: 14, padding: 16, border: `1px solid ${theme.border}` }}>
            <SectionLabel>Data Kendaraan</SectionLabel>
            <InfoRow label="Nomor Polisi" value={kendaraan.polisi} />
            <InfoRow label="Kapasitas MT" value={kendaraan.kapasitas} />
            <InfoRow label="Jumlah Kompartemen" value={kendaraan.kompartemen} />
            <InfoRow label="Transportir" value={kendaraan.transportir} />
            <InfoRow label="Kategori MT" value={kategoriMT === "merah_putih" ? "MT Merah Putih" : "MT Industri"} />
            {calcUmurMT(kendaraan.tanggalStnk) && (
              <InfoRow label="Umur MT" value={calcUmurMT(kendaraan.tanggalStnk)} />
            )}
          </div>

          <div style={{ marginBottom: 16, background: theme.surface, borderRadius: 14, padding: 16, border: `1px solid ${theme.border}` }}>
            <SectionLabel>Checkpoint Uji Kedap (6 kPa)</SectionLabel>
            {checkpoints.filter((cp) => cp.status).map((cp, idx) => (
              <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${theme.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {cp.foto && (
                    <img src={cp.foto.url} alt="checkpoint" onClick={() => setPreviewUrl(cp.foto.url)}
                      style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover", cursor: "pointer" }} />
                  )}
                  <div style={{ fontSize: 12, color: theme.text }}>{CHECKPOINTS.find((c) => c.menit === cp.menit)?.label}</div>
                </div>
                <div style={{
                  fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                  background: cp.status === "kedap" ? theme.successLight : theme.dangerLight,
                  color: cp.status === "kedap" ? theme.success : theme.danger,
                }}>
                  {cp.status === "kedap" ? "Kedap" : "Tidak Kedap"}
                </div>
              </div>
            ))}
          </div>

          {statusAkhir === "tidak_kedap" && (
            <div style={{ marginBottom: 16, background: theme.surface, borderRadius: 14, padding: 16, border: `1px solid ${theme.border}` }}>
              <SectionLabel>Foto Temuan ({fotoTemuan.length} temuan · {totalFotoTemuan} foto)</SectionLabel>
              {fotoTemuan.map((t, idx) => (
                <div key={t.id} style={{ padding: "10px 0", borderBottom: idx < fotoTemuan.length - 1 ? `1px solid ${theme.border}` : "none" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: theme.text, marginBottom: 6 }}>
                    Temuan {idx + 1}: <span style={{ fontWeight: 400, color: theme.textMuted }}>{t.keterangan}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {t.fotos.map((f, fIdx) => (
                      <img key={f.path || fIdx} src={f.url} alt="temuan" onClick={() => setPreviewUrl(f.url)}
                        style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", cursor: "pointer", flexShrink: 0 }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: 12, color: theme.textMuted, textAlign: "center", marginTop: 4 }}>
            Pastikan semua data sudah benar. Data tidak dapat diedit setelah dikirim.
          </div>
        </div>

        <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, padding: "12px 16px", background: theme.surface, borderTop: `1px solid ${theme.border}`, display: "flex", gap: 10 }}>
          <Btn onClick={() => navigateToStep("ujikedap")} variant="ghost" style={{ flex: 1 }} disabled={submitting}>
            ← Edit
          </Btn>
          <Btn onClick={handleSubmit} variant="primary" icon="check" style={{ flex: 2 }} disabled={submitting}>
            {submitting ? "Mengirim..." : "✅ Kirim Sekarang"}
          </Btn>
        </div>

        <PhotoLightbox url={previewUrl} onClose={() => setPreviewUrl(null)} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: theme.bg, display: "flex", flexDirection: "column" }}>
      <div style={{ background: theme.surface, padding: "48px 16px 16px", borderBottom: `1px solid ${theme.border}`, boxShadow: theme.shadow }}>
        <div onClick={() => navigateToStep("kategori")} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14, cursor: "pointer", color: theme.textSub, fontSize: 13 }}>
          <Icon name="arrow" size={16} color={theme.textSub} /> Kembali
        </div>
        <div style={{ fontWeight: 800, fontSize: 18, color: theme.text }}>Uji Kedap — 6 kPa</div>
        <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 2 }}>
          {kendaraan.polisi} · {kendaraan.kapasitas} · {kendaraan.kompartemen} kompartemen
        </div>
        {statusAkhir === "kedap" && (
          <div style={{ marginTop: 10, padding: "6px 14px", borderRadius: 20, background: "#D1FAE5", color: theme.success, fontWeight: 700, fontSize: 13, display: "inline-block" }}>
            ✅ LULUS — Semua checkpoint kedap
          </div>
        )}
        {statusAkhir === "tidak_kedap" && (
          <div style={{ marginTop: 10, padding: "6px 14px", borderRadius: 20, background: theme.dangerLight, color: theme.danger, fontWeight: 700, fontSize: 13, display: "inline-block" }}>
            ❌ TIDAK LULUS — Ditemukan kebocoran
          </div>
        )}
      </div>

      {restoreBanner}

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px", paddingBottom: 100 }}>
        {errors.uji_incomplete && (
          <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 10, background: theme.dangerLight, color: theme.danger, fontSize: 13, fontWeight: 600 }}>
            ⚠️ Selesaikan semua checkpoint terlebih dahulu.
          </div>
        )}

        {CHECKPOINTS.map((cpDef, idx) => {
          const cp      = checkpoints[idx];
          const prevCp  = checkpoints[idx - 1];

          const visible = idx === 0 || (prevCp?.status === "kedap" && prevCp?.foto);
          const blocked = checkpoints.slice(0, idx).some((c) => c.status === "tidak_kedap");

          if (!visible || blocked) return null;

          const isTidakKedap = cp.status === "tidak_kedap";
          const isKedap      = cp.status === "kedap";

          return (
            <div key={idx} style={{
              marginBottom: 14, padding: 14, borderRadius: 12, background: theme.surface,
              border: `1.5px solid ${isKedap ? theme.success : isTidakKedap ? theme.danger : theme.border}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: theme.text }}>▶ {cpDef.label}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: theme.primary, background: theme.primaryLight, padding: "3px 10px", borderRadius: 20 }}>
                  6 kPa
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                {["kedap", "tidak_kedap"].map((opt) => (
                  <div key={opt} onClick={() => setCheckpointStatus(idx, opt)} style={{
                    flex: 1, textAlign: "center", padding: "9px 0", borderRadius: 8,
                    fontSize: 13, fontWeight: 600, cursor: "pointer",
                    background: cp.status === opt
                      ? (opt === "kedap" ? theme.success : theme.danger)
                      : theme.surfaceAlt,
                    color: cp.status === opt ? "#fff" : theme.textMuted,
                    border: `1.5px solid ${cp.status === opt
                      ? (opt === "kedap" ? theme.success : theme.danger)
                      : theme.border}`,
                  }}>
                    {opt === "kedap" ? "✅ Kedap" : "❌ Tidak Kedap"}
                  </div>
                ))}
              </div>

              {isKedap && (
                <CameraCaptureSingle
                  label={`Foto alat ukur ${cpDef.label}`}
                  onFoto={(foto) => setCheckpointFoto(idx, foto)}
                  foto={cp.foto}
                  errorFoto={!!errors[`cp_${idx}_foto`]}
                  onPreview={setPreviewUrl}
                  requestAccess={requestAccess}
                />
              )}

              {isTidakKedap && (
                <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: theme.dangerLight, fontSize: 12, color: theme.danger, fontWeight: 600 }}>
                  🛑 Uji dihentikan — lanjut ke pencatatan temuan di bawah
                </div>
              )}
            </div>
          );
        })}

        {idxTidakKedap >= 0 && (
          <div style={{ marginTop: 8, padding: 16, borderRadius: 14, background: theme.surface, border: `2px solid ${theme.danger}` }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: theme.danger, marginBottom: 4 }}>Inspeksi Temuan</div>
            <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 14 }}>
              Catat setiap temuan dengan keterangannya.
            </div>
            {errors.temuan_foto && (
              <div style={{ fontSize: 12, color: theme.danger, fontWeight: 600, marginBottom: 10 }}></div>
            )}
            <TemuanList
              temuanList={fotoTemuan}
              onTemuanList={setFotoTemuan}
              onPreview={setPreviewUrl}
              requestAccess={requestAccess}
            />
          </div>
        )}
      </div>

      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, padding: "12px 16px", background: theme.surface, borderTop: `1px solid ${theme.border}` }}>
        <Btn onClick={handleTinjau} variant="primary" icon="check" disabled={!statusAkhir}>
          Tinjau & Kirim →
        </Btn>
      </div>

      <PhotoLightbox url={previewUrl} onClose={() => setPreviewUrl(null)} />
    </div>
  );
};

export default HSEFormScreen;