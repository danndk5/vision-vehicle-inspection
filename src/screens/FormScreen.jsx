import { useState, useEffect, useRef, useCallback } from "react";
import Btn from "../components/Btn";
import Icon from "../components/Icon";
import Input from "../components/Input";
import SectionLabel from "../components/SectionLabel";
import ToggleStatus from "../components/ToggleStatus";
import theme from "../styles/theme";
import { supabase } from "../lib/supabase";
import { useCameraGPS } from "../hooks/useCameraGPS";
import { useBackableView, goBack, pushHistoryStep, discardHistorySteps } from "../hooks/useBackableView";

// ── Draft persistence (agar data tidak hilang kalau app ke-close / tombol home) ──
const DRAFT_KEY = "draft_form_teknisi";
const DRAFT_EXPIRE_MS = 6 * 60 * 60 * 1000;

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

const initCctv = () => ({ status: "", segel_bricket: "", segel_kabel: "", ket_bricket: "", ket_kabel: "" });
const initGps  = () => ({ status: "", segel: { status: "", ket: "" }, kabel: { status: "", ket: "" } });

// Urutan step untuk perbandingan index — dipakai untuk membangun ulang
// kedalaman history saat draft dipulihkan langsung ke step tengah, dan untuk
// menghitung berapa banyak history-step yang perlu dibuang saat "Mulai Baru".
// "ringkasan" adalah step tambahan setelah step 3 (CCTV) — bukan bagian
// dari stepper bernomor 1/2/3 di header, sama seperti pola HSEFormScreen.
const STEP_ORDER = [1, 2, 3, "ringkasan"];
const stepIndex = (s) => STEP_ORDER.indexOf(s);

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
const formatTanggal = (dateStr) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
};

const formatNopol = (raw) => {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const groups = clean.match(/[A-Z]+|\d+/g) || [];
  return groups.join(" ");
};

// ── Umur MT & sisa waktu masa berlaku — dihitung ULANG setiap render, sama
// persis dengan pola di HSEFormScreen.jsx supaya angka konsisten di semua
// tempat (Teknisi, HSE, admin) ────────────────────────────────────────────
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

// null kalau tanggal sudah lewat (kadaluarsa ditangani terpisah oleh cekMasaBerlaku)
const calcSisaWaktu = (tanggalTarget) => {
  if (!tanggalTarget) return null;
  const target = new Date(tanggalTarget);
  const now = new Date();
  if (isNaN(target.getTime()) || target <= now) return null;
  const { years, months, days } = diffYMD(now, target);
  return `${years} Tahun, ${months} Bulan, ${days} Hari`;
};

// ── applyOverlay — resize dulu ke maks 1600px sebelum overlay,
// supaya upload lebih ringan & cepat (sama seperti pola HSEFormScreen) ───────
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

const uploadFoto = async (file, kategori, pos) => {
  const blob = await applyOverlay(file, pos);
  const fileName = `${kategori}-${Date.now()}.jpg`;
  const { data, error } = await supabase.storage
    .from("foto-inspeksi").upload(fileName, blob, { contentType: "image/jpeg" });
  if (error) throw new Error("Foto gagal diupload: " + error.message);
  const { data: pub } = supabase.storage.from("foto-inspeksi").getPublicUrl(data.path);
  return { name: fileName, url: pub.publicUrl, path: data.path };
};

const InfoRow = ({ label, value, highlight }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${theme.border}` }}>
    <div style={{ fontSize: 12, color: theme.textMuted }}>{label}</div>
    <div style={{ fontSize: 13, fontWeight: 600, color: highlight ? theme.danger : theme.text, textAlign: "right", maxWidth: "60%" }}>{value || "-"}</div>
  </div>
);

const ToggleAktif = ({ value, onChange }) => (
  <div style={{ display: "flex", gap: 8, marginTop: 10, marginBottom: 4 }}>
    {["Aktif", "Tidak Aktif"].map((opt) => (
      <div key={opt} onClick={() => onChange(opt)} style={{
        flex: 1, textAlign: "center", padding: "9px 0", borderRadius: 10,
        fontSize: 13, fontWeight: 600, cursor: "pointer",
        background: value === opt ? (opt === "Aktif" ? theme.success : theme.danger) : theme.surfaceAlt,
        color: value === opt ? "#fff" : theme.textMuted,
        border: `1.5px solid ${value === opt ? (opt === "Aktif" ? theme.success : theme.danger) : theme.border}`,
        transition: "all 0.15s",
      }}>
        {opt === "Aktif" ? "✅ Aktif" : "❌ Tidak Aktif"}
      </div>
    ))}
  </div>
);

// ── PhotoLightbox — preview full-screen. Tidak ada tombol ❌ dan tidak ada
// "ketuk di mana saja untuk menutup" — murni jalur HP: hanya tombol kembali
// bawaan HP (via useBackableView) yang bisa menutup lightbox ini. ──────────
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

// ── CameraCapture ────────────────────────────────────────────────────────────
// requestAccess() dari useCameraGPS (di-warm-up sejak layar ini mount) supaya
// kamera & GPS sudah "hangat" — foto langsung terasa instan. Sumber daftar
// foto murni dari `allPhotos` (state induk) difilter per kategori.
const CameraCapture = ({ label, kategori, onPhotos, allPhotos, errorFoto, onPreview, requestAccess, maxPhotos }) => {
  const photos = allPhotos.filter((p) => p.kategori === kategori);
  const [capState, setCapState] = useState("idle");
  const [permErr, setPermErr] = useState(null);
  const fileInputRef = useRef(null);
  const cachedPosRef = useRef(null);
  const reachedLimit = maxPhotos != null && photos.length >= maxPhotos;

  const handleCaptureClick = async () => {
    if (reachedLimit) return;
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
      const result = await uploadFoto(file, kategori, cachedPosRef.current);
      onPhotos((p) => [...p, { ...result, kategori, timestamp: new Date() }]);
    } catch (err) {
      alert("⚠️ " + err.message);
    } finally {
      setCapState("idle");
      cachedPosRef.current = null;
      e.target.value = "";
    }
  };

  const removePhoto = async (path) => {
    await supabase.storage.from("foto-inspeksi").remove([path]).catch(() => {});
    onPhotos((p) => p.filter((x) => x.path !== path));
  };

  const isWorking = capState !== "idle";

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ border: `2px dashed ${errorFoto ? theme.danger : theme.border}`, borderRadius: 12, padding: "14px 16px", background: errorFoto ? theme.dangerLight : "transparent" }}>
        <div style={{ fontSize: 12, color: errorFoto ? theme.danger : theme.textMuted, marginBottom: 10, textAlign: "center" }}>
          {label}
          <div style={{ fontSize: 11, marginTop: 2 }}>📷 Kamera belakang · ⏱ Timestamp server · 📍 GPS</div>
        </div>
        {permErr && <div style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 8, background: theme.dangerLight, color: theme.danger, fontSize: 12, fontWeight: 600 }}>⛔ {permErr}</div>}
        <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} style={{ display: "none" }} />
        {!reachedLimit ? (
          <Btn onClick={handleCaptureClick} variant="outline" style={{ padding: "9px", fontSize: 13, width: "100%" }} disabled={isWorking}>
            {capState === "checking" ? "🔐 Cek izin..." : capState === "processing" ? "⏳ Memproses..." : photos.length > 0 ? "📷 Tambah Foto Lagi" : "📷 Ambil Foto"}
          </Btn>
        ) : (
          <div style={{ textAlign: "center", fontSize: 12, color: theme.textMuted, padding: "6px 0", fontWeight: 600 }}>
            ✓ {photos.length} foto sudah cukup
          </div>
        )}
        {photos.length > 0 && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            {photos.map((p) => (
              <div key={p.path} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", background: theme.primaryLight, borderRadius: 8 }}>
                <img
                  src={p.url}
                  alt={p.name}
                  onClick={() => onPreview?.(p.url)}
                  style={{ width: 44, height: 44, borderRadius: 6, objectFit: "cover", cursor: "pointer", flexShrink: 0, border: `1px solid ${theme.border}` }}
                />
                <div onClick={() => onPreview?.(p.url)} style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
                  <div style={{ fontSize: 12, color: theme.primary, fontWeight: 600 }}>✓ Tersimpan</div>
                  <div style={{ fontSize: 10.5, color: theme.textMuted }}>Ketuk untuk lihat penuh (cek blur)</div>
                </div>
                <div onClick={() => removePhoto(p.path)} style={{ cursor: "pointer", fontWeight: 700, color: theme.danger, padding: "4px 8px", flexShrink: 0 }}>✕</div>
              </div>
            ))}
          </div>
        )}
      </div>
      {errorFoto && <div style={{ marginTop: 6, fontSize: 12, color: theme.danger, fontWeight: 600 }}>⚠️ Foto dokumentasi wajib diambil.</div>}
    </div>
  );
};

const CheckItemWithFoto = ({ label, status, onStatus, ket, onKet, errorKet, kategori, onPhotos, allPhotos, errorFoto, onPreview, requestAccess }) => (
  <div style={{ marginBottom: 14, padding: 14, borderRadius: 12, background: theme.surfaceAlt, border: `1px solid ${theme.border}` }}>
    <div style={{ fontWeight: 600, fontSize: 14, color: theme.text, marginBottom: 6 }}>{label}</div>
    <ToggleStatus value={status} onChange={onStatus} />
    {status === "Abnormal" && (
      <>
        <textarea placeholder="Tuliskan keterangan temuan..." value={ket} onChange={(e) => onKet(e.target.value)} style={{ marginTop: 10, width: "100%", padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${errorKet ? theme.danger : theme.border}`, background: errorKet ? theme.dangerLight : theme.surface, color: theme.text, fontSize: 13, fontFamily: "'DM Sans', sans-serif", resize: "none", minHeight: 70, boxSizing: "border-box", outline: "none" }} />
        {errorKet && <div style={{ marginTop: 5, fontSize: 12, color: theme.danger, fontWeight: 600 }}>⚠️ Keterangan wajib diisi saat kondisi Abnormal.</div>}
      </>
    )}
    <div style={{ marginTop: 10 }}>
      <CameraCapture label="Foto dokumentasi" kategori={kategori} onPhotos={onPhotos} allPhotos={allPhotos} errorFoto={errorFoto} onPreview={onPreview} requestAccess={requestAccess} maxPhotos={status === "Abnormal" ? null : 1} />
    </div>
  </div>
);

const StatusAktifWithFoto = ({ label, status, onStatus, kategori, onPhotos, allPhotos, errorFoto, onPreview, requestAccess }) => (
  <div style={{ marginBottom: 14, padding: 14, borderRadius: 12, background: theme.surfaceAlt, border: `1px solid ${theme.border}` }}>
    <div style={{ fontWeight: 600, fontSize: 14, color: theme.text, marginBottom: 2 }}>{label}</div>
    <ToggleAktif value={status} onChange={onStatus} />
    <div style={{ marginTop: 10 }}>
      <CameraCapture label="Foto dokumentasi" kategori={kategori} onPhotos={onPhotos} allPhotos={allPhotos} errorFoto={errorFoto} onPreview={onPreview} requestAccess={requestAccess} maxPhotos={status === "Tidak Aktif" ? null : 1} />
    </div>
  </div>
);

// ── Baris ringkasan untuk 1 item cek
const RingkasanItemRow = ({ label, status, ket, kategori, allPhotos, onPreview, isAktifToggle }) => {
  const fotos = allPhotos.filter((p) => p.kategori === kategori);
  const isNormalLike = isAktifToggle ? status === "Aktif" : status === "Normal";
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${theme.border}`, gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
        {fotos.length > 0 && (
          <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
            {fotos.map((foto) => (
              <img key={foto.path} src={foto.url} alt={label} onClick={() => onPreview?.(foto.url)}
                style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover", cursor: "pointer" }} />
            ))}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: theme.text, fontWeight: 600 }}>{label}</div>
          {ket && <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 1 }}>{ket}</div>}
        </div>
      </div>
      <div style={{
        fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, flexShrink: 0,
        background: isNormalLike ? theme.successLight : theme.dangerLight,
        color: isNormalLike ? theme.success : theme.danger,
      }}>
        {status || "-"}
      </div>
    </div>
  );
};

const FormScreen = ({ onBack, onNav }) => {
  const [step, setStep] = useState(1);
  const [currentUser, setCurrentUser] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [lookupStatus, setLookupStatus] = useState("idle");
  const [kendaraanData, setKendaraanData] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const lookupTimer = useRef(null);
  const submittedRef = useRef(false);

  // Riwayat pengecekan GPS/CCTV sebelumnya untuk kendaraan yang dicari (3 terakhir)
  const [riwayatSebelumnya, setRiwayatSebelumnya] = useState([]);

  // Kamera/GPS di-"hangat"-kan sejak layar ini dibuka — sama seperti HSEFormScreen
  const { warmUp, coolDown, requestAccess } = useCameraGPS();
  useEffect(() => {
    warmUp();
    return () => coolDown();
  }, [warmUp, coolDown]);

  const [polisi, setPolisi] = useState("");
  const [pemeriksa, setPemeriksa] = useState("");
  const [gps, setGps] = useState(initGps());
  const [cctv, setCctv] = useState({ dashcam: initCctv(), kanan: initCctv(), kiri: initCctv() });
  const [segelKotakSekring, setSegelKotakSekring] = useState("");
  const [errors, setErrors] = useState({});

  const [ready, setReady] = useState(false);
  const [showRestoreBanner, setShowRestoreBanner] = useState(false);
  const [draftExpiredNotice, setDraftExpiredNotice] = useState(false);
  const draftCreatedAtRef = useRef(null);

  const photosRef = useRef(photos);
  useEffect(() => { photosRef.current = photos; }, [photos]);

  // Cleanup: layar ditinggalkan tanpa submit → foto yang sudah keburu
  // diupload dihapus lagi dari storage. Draft TIDAK dihapus di sini (sama
  // seperti HSEFormScreen) — biar tetap bisa dipulihkan kalau user balik lagi.
  useEffect(() => {
    return () => {
      if (!submittedRef.current && photosRef.current.length > 0) {
        const paths = photosRef.current.map((p) => p.path).filter(Boolean);
        if (paths.length) supabase.storage.from("foto-inspeksi").remove(paths).catch(console.error);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setCurrentUser(user.id);
      supabase.from("profiles").select("nama").eq("id", user.id).single()
        .then(({ data: profile }) => { if (profile?.nama) setPemeriksa(profile.nama); });
    });
  }, []);

  // ── Restore draft di awal (sekali) ─────────────────────────────────────
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      const age = Date.now() - (draft.createdAt || 0);
      if (draft.createdAt && age > DRAFT_EXPIRE_MS) {
        clearDraft();
        setDraftExpiredNotice(true);
      } else {
        const restoredStep = draft.step || 1;
        setStep(restoredStep);
        setPolisi(draft.polisi || "");
        setKendaraanData(draft.kendaraanData || null);
        setLookupStatus(draft.kendaraanData ? "found" : "idle");
        setGps(draft.gps || initGps());
        setCctv(draft.cctv || { dashcam: initCctv(), kanan: initCctv(), kiri: initCctv() });
        setSegelKotakSekring(draft.segelKotakSekring || "");
        setPhotos(draft.photos || []);
        setRiwayatSebelumnya(draft.riwayatSebelumnya || []);
        draftCreatedAtRef.current = draft.createdAt || Date.now();
        setShowRestoreBanner(true);

        // Bangun ulang kedalaman history sesuai step yang dipulihkan, supaya
        // tombol kembali HP berperilaku SAMA seperti alur normal klik "Lanjut"
        // satu-satu (step demi step) — bukan cuma 1x back langsung tembus
        // keluar aplikasi melewati step & beranda.
        const restoredIdx = stepIndex(restoredStep);
        for (let i = 0; i < restoredIdx; i++) {
          pushHistoryStep(() => setStep(STEP_ORDER[i]));
        }
      }
    }
    setReady(true);
  }, []);

  // ── Simpan draft — hanya kalau ada progress beneran, dan expire timestamp
  // hanya di-set sekali di awal progress (sama seperti HSEFormScreen). Riwayat
  // sebelumnya ikut disimpan supaya tidak perlu ketik ulang nomor polisi untuk
  // memicu lookup lagi kalau app ke-close di tengah isi form. ────────────────
  useEffect(() => {
    if (!ready) return;
    const hasProgress = step !== 1 || polisi.trim() || photos.length > 0;
    if (!hasProgress) { clearDraft(); draftCreatedAtRef.current = null; return; }
    if (!draftCreatedAtRef.current) draftCreatedAtRef.current = Date.now();
    saveDraft({ createdAt: draftCreatedAtRef.current, step, polisi, kendaraanData, gps, cctv, segelKotakSekring, photos, riwayatSebelumnya });
  }, [ready, step, polisi, kendaraanData, gps, cctv, segelKotakSekring, photos, riwayatSebelumnya]);

  // ── Jaring pengaman tambahan: paksa flush draft segera saat app
  // di-background/ditutup (tombol Home, pindah app, tutup tab) — tidak
  // sepenuhnya bergantung pada timing effect React di atas, karena OS bisa
  // mem-suspend JS mendadak sebelum effect sempat jalan. ─────────────────
  useEffect(() => {
    const flushDraft = () => {
      if (!ready || !document.hidden) return;
      const hasProgress = step !== 1 || polisi.trim() || photosRef.current.length > 0;
      if (!hasProgress) return;
      if (!draftCreatedAtRef.current) draftCreatedAtRef.current = Date.now();
      saveDraft({
        createdAt: draftCreatedAtRef.current, step, polisi, kendaraanData,
        gps, cctv, segelKotakSekring, photos: photosRef.current, riwayatSebelumnya,
      });
    };
    document.addEventListener("visibilitychange", flushDraft);
    window.addEventListener("pagehide", flushDraft);
    return () => {
      document.removeEventListener("visibilitychange", flushDraft);
      window.removeEventListener("pagehide", flushDraft);
    };
  }, [ready, step, polisi, kendaraanData, gps, cctv, segelKotakSekring, riwayatSebelumnya]);

  const resetSemua = () => {
    // Buang juga history-step yang sudah menumpuk (kalau user pencet "Mulai
    // Baru" saat sedang di step 2/3/ringkasan), supaya tombol back HP
    // berikutnya tidak nyasar ke langkah lama yang sudah tidak relevan.
    const n = stepIndex(step);
    if (n > 0) discardHistorySteps(n);
    clearDraft();
    draftCreatedAtRef.current = null;
    setStep(1);
    setPolisi("");
    setKendaraanData(null);
    setLookupStatus("idle");
    setGps(initGps());
    setCctv({ dashcam: initCctv(), kanan: initCctv(), kiri: initCctv() });
    setSegelKotakSekring("");
    setPhotos([]);
    setRiwayatSebelumnya([]);
    setShowRestoreBanner(false);
  };

  const restoreBanner = showRestoreBanner && (
    <div style={{
      margin: "0 0 16px", padding: "10px 14px", borderRadius: 10,
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
      margin: "0 0 16px", padding: "10px 14px", borderRadius: 10,
      background: theme.surfaceAlt, color: theme.textMuted, fontSize: 12, fontWeight: 600,
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
    }}>
      <span>🗑️ Draft pengisian sebelumnya (lebih dari 6 jam) sudah dihapus otomatis.</span>
      <span onClick={() => setDraftExpiredNotice(false)} style={{ cursor: "pointer" }}>✕</span>
    </div>
  );

  // Cek ringan apakah satu baris riwayat inspeksi GPS/CCTV "Normal" secara keseluruhan
  const isRiwayatNormal = (item) => {
    const gpsNormal =
      item.segel_gps?.toLowerCase() === "normal" &&
      item.kabel_gps?.toLowerCase() === "normal";
    const cctvNormal =
      item.segel_bricket_dashcam?.toLowerCase() === "normal" &&
      item.segel_kabel_dashcam?.toLowerCase() === "normal" &&
      item.segel_bricket_kanan?.toLowerCase() === "normal" &&
      item.segel_kabel_kanan?.toLowerCase() === "normal" &&
      item.segel_bricket_kiri?.toLowerCase() === "normal" &&
      item.segel_kabel_kiri?.toLowerCase() === "normal";
    return gpsNormal && cctvNormal;
  };

  const handlePolisiChange = useCallback((val) => {
    const formatted = formatNopol(val);
    setPolisi(formatted);
    setKendaraanData(null);
    setLookupStatus("idle");
    setRiwayatSebelumnya([]);
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    if (!val.trim()) return;
    lookupTimer.current = setTimeout(async () => {
      setLookupStatus("loading");
      try {
        const { data } = await supabase
          .from("kendaraan")
          .select("nomor_polisi, transportir, kapasitas_mt, jumlah_kompartemen, kategori_mt, masa_berlaku_head_truck, masa_berlaku_tangki, tanggal_stnk")
          .eq("nomor_polisi", formatted.trim())
          .maybeSingle();
        if (data) {
          setKendaraanData(data);
          setLookupStatus("found");

          // Riwayat pengecekan GPS/CCTV sebelumnya — 3 terakhir untuk kendaraan ini
          const { data: riwayatData } = await supabase
            .from("inspeksi")
            .select("segel_gps, kabel_gps, segel_bricket_dashcam, segel_kabel_dashcam, segel_bricket_kanan, segel_kabel_kanan, segel_bricket_kiri, segel_kabel_kiri, status, created_at")
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

  const cekMasaBerlaku = (dateStr) => {
    if (!dateStr) return null;
    const hari = Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24));
    if (hari < 0) return "expired";
    if (hari <= 30) return "warning";
    return "ok";
  };
  const statusHeadTruck = cekMasaBerlaku(kendaraanData?.masa_berlaku_head_truck);
  const statusTangki    = cekMasaBerlaku(kendaraanData?.masa_berlaku_tangki);
  const isKendaraanExpired = statusHeadTruck === "expired" || statusTangki === "expired";
  const umurMT = calcUmurMT(kendaraanData?.tanggal_stnk);

  const formatMasaBerlaku = (dateStr, status) => {
    if (!dateStr) return "-";
    const tgl = formatTanggal(dateStr);
    if (status === "expired") return `❌ KADALUARSA — ${tgl}`;
    const sisa = calcSisaWaktu(dateStr);
    if (status === "warning") return `⚠️ Segera habis — ${tgl}${sisa ? ` (${sisa})` : ""}`;
    return sisa ? `${tgl} (${sisa})` : tgl;
  };

  const setGpsField = (field, key) => (val) => setGps((p) => ({ ...p, [field]: { ...p[field], [key]: val } }));
  const setCctvField = (cam, field) => (val) => setCctv((p) => ({ ...p, [cam]: { ...p[cam], [field]: val } }));
  const hasPhoto = (kat) => photos.some((p) => p.kategori === kat);

  const validateStep2 = () => {
    const e = {};
    if (!gps.status) e.gps_status = true;
    if (!hasPhoto("gps_status")) e.gps_status_foto = true;
    if (!gps.segel.status) e.gps_segel = true;
    if (gps.segel.status === "Abnormal" && !gps.segel.ket.trim()) e.gps_segel_ket = true;
    if (!hasPhoto("gps_segel")) e.gps_segel_foto = true;
    if (!gps.kabel.status) e.gps_kabel = true;
    if (gps.kabel.status === "Abnormal" && !gps.kabel.ket.trim()) e.gps_kabel_ket = true;
    if (!hasPhoto("gps_kabel")) e.gps_kabel_foto = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep3 = () => {
    const e = {};
    ["dashcam", "kanan", "kiri"].forEach((cam) => {
      if (!cctv[cam].status) e[`${cam}_status`] = true;
      if (!hasPhoto(`cctv_${cam}_status`)) e[`${cam}_status_foto`] = true;
      if (!cctv[cam].segel_bricket) e[`${cam}_bricket`] = true;
      if (cctv[cam].segel_bricket === "Abnormal" && !cctv[cam].ket_bricket.trim()) e[`${cam}_bricket_ket`] = true;
      if (!hasPhoto(`cctv_${cam}_bricket`)) e[`${cam}_bricket_foto`] = true;
      if (!cctv[cam].segel_kabel) e[`${cam}_kabel`] = true;
      if (cctv[cam].segel_kabel === "Abnormal" && !cctv[cam].ket_kabel.trim()) e[`${cam}_kabel_ket`] = true;
      if (!hasPhoto(`cctv_${cam}_kabel`)) e[`${cam}_kabel_foto`] = true;
    });
    if (!segelKotakSekring) e.segel_kotak = true;
    if (!hasPhoto("segel_kotak_sekring")) e.segel_kotak_foto = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNextStep1 = () => {
    if (!polisi.trim()) { alert("Nomor Polisi wajib diisi!"); return; }
    if (lookupStatus === "loading") { alert("Sedang mencari data kendaraan, tunggu sebentar..."); return; }
    if (lookupStatus === "notfound" || !kendaraanData) { alert("Nomor Polisi tidak ditemukan di database. Hubungi admin Depot untuk mendaftarkan kendaraan ini."); return; }
    // Defense-in-depth: pengecekan cadangan kalau-kalau ada state aneh yang
    // lolos dari disabled state tombol (sama seperti pola HSEFormScreen).
    if (isKendaraanExpired) {
      alert("Masa berlaku Head Truck/Tangki kendaraan ini sudah kedaluwarsa. Pengecekan tidak dapat dilanjutkan — hubungi admin untuk perpanjangan/registrasi ulang.");
      return;
    }
    // Push satu langkah history: kalau tombol kembali HP ditekan di step 2,
    // ini yang akan mengembalikan tampilan ke step 1.
    pushHistoryStep(() => setStep(1));
    setStep(2);
  };

  // Tombol di step 3 sekarang menuju layar RINGKASAN dulu, belum langsung kirim
  const handleTinjau = () => {
    if (!validateStep3()) { alert("Lengkapi semua data CCTV dan foto dokumentasi!"); return; }
    pushHistoryStep(() => setStep(3));
    setStep("ringkasan");
  };

  // Submit sesungguhnya — dipanggil dari layar Ringkasan.
  // Rollback manual: kalau insert foto_inspeksi gagal SETELAH baris inspeksi
  // terlanjur terbuat, baris itu langsung dihapus lagi supaya tidak ada
  // record "setengah jadi" yang nyangkut di database — sama seperti pola
  // HSEFormScreen. submittedRef juga baru diset true setelah SEMUA insert
  // berhasil, supaya cleanup foto orphan (efek unmount) tetap jalan kalau
  // submit gagal dan user keluar dari layar ini.
  const handleSubmit = async () => {
    if (!validateStep3()) {
      alert("Lengkapi semua data CCTV dan foto dokumentasi!");
      // Mundur lewat history (bukan langsung setStep) supaya jalur back tetap
      // konsisten dengan tombol "← Edit"/tombol kembali HP dari Ringkasan.
      window.history.back();
      return;
    }
    setSubmitting(true);
    let inspData = null;
    try {
      const { data, error: inspErr } = await supabase.from("inspeksi").insert([{
        user_id: currentUser,
        nomor_polisi: polisi.trim(),
        nama_pemeriksa: pemeriksa,
        perusahaan_transportir: kendaraanData?.transportir || "",
        status_gps: gps.status,
        segel_gps: gps.segel.status, segel_gps_ket: gps.segel.ket,
        kabel_gps: gps.kabel.status, kabel_gps_ket: gps.kabel.ket,
        status_cctv_dashcam: cctv.dashcam.status,
        segel_bricket_dashcam: cctv.dashcam.segel_bricket, segel_bricket_dashcam_ket: cctv.dashcam.ket_bricket,
        segel_kabel_dashcam: cctv.dashcam.segel_kabel, segel_kabel_dashcam_ket: cctv.dashcam.ket_kabel,
        status_cctv_kanan: cctv.kanan.status,
        segel_bricket_kanan: cctv.kanan.segel_bricket, segel_bricket_kanan_ket: cctv.kanan.ket_bricket,
        segel_kabel_kanan: cctv.kanan.segel_kabel, segel_kabel_kanan_ket: cctv.kanan.ket_kabel,
        status_cctv_kiri: cctv.kiri.status,
        segel_bricket_kiri: cctv.kiri.segel_bricket, segel_bricket_kiri_ket: cctv.kiri.ket_bricket,
        segel_kabel_kiri: cctv.kiri.segel_kabel, segel_kabel_kiri_ket: cctv.kiri.ket_kabel,
        segel_kotak_sekring: segelKotakSekring,
        is_submitted: true, submitted_at: new Date().toISOString(), status: "baru",
      }]).select().single();
      if (inspErr) throw inspErr;
      inspData = data;

      if (photos.length > 0) {
        const { error: fotoErr } = await supabase.from("foto_inspeksi").insert(
          photos.map((p) => ({ inspeksi_id: inspData.id, url: p.url, kategori: p.kategori, timestamp_foto: p.timestamp }))
        );
        if (fotoErr) throw fotoErr;
      }

      // Semua insert berhasil — baru sekarang dianggap benar-benar tersimpan.
      submittedRef.current = true;
      clearDraft();
      alert("✅ Data berhasil disimpan & dikirim ke Depot!");
      onNav("dashboard");
    } catch (err) {
      // Rollback manual: kalau baris inspeksi sempat terbuat tapi foto gagal
      // diinsert, hapus lagi baris itu supaya tidak ada data setengah jadi.
      if (inspData?.id) {
        await supabase.from("inspeksi").delete().eq("id", inspData.id).catch(() => {});
      }
      const paths = photos.map((p) => p.path).filter(Boolean);
      if (paths.length) await supabase.storage.from("foto-inspeksi").remove(paths).catch(console.error);
      alert("Gagal menyimpan: " + err.message + "\n\nData belum tersimpan. Silakan coba kirim ulang.");
    } finally {
      setSubmitting(false);
    }
  };

  const steps = ["Kendaraan", "GPS", "CCTV"];
  const stepNum = typeof step === "number" ? step : 4; // ringkasan dianggap "setelah" step 3 untuk keperluan progress

  // Status keseluruhan (Normal/Abnormal) — dihitung dari state saat ini untuk
  // ditampilkan di layar Ringkasan, sama seperti banner status di HSEFormScreen.
  const overallNormal =
    gps.segel.status === "Normal" && gps.kabel.status === "Normal" &&
    cctv.dashcam.segel_bricket === "Normal" && cctv.dashcam.segel_kabel === "Normal" &&
    cctv.kanan.segel_bricket === "Normal" && cctv.kanan.segel_kabel === "Normal" &&
    cctv.kiri.segel_bricket === "Normal" && cctv.kiri.segel_kabel === "Normal";

  // ── STEP RINGKASAN — tinjau ulang semua data sebelum benar-benar dikirim ───
  if (step === "ringkasan") {
    return (
      <div style={{ minHeight: "100vh", background: theme.bg, display: "flex", flexDirection: "column" }}>
        <div style={{ background: theme.surface, padding: "48px 16px 16px", borderBottom: `1px solid ${theme.border}`, boxShadow: theme.shadow }}>
          <div onClick={() => window.history.back()} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14, cursor: "pointer", color: theme.textSub, fontSize: 13 }}>
            <Icon name="arrow" size={16} color={theme.textSub} /> Kembali & Edit
          </div>
          <div style={{ fontWeight: 800, fontSize: 18, color: theme.text }}>Ringkasan Sebelum Kirim</div>
          <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 2 }}>Periksa kembali semua data sebelum diunggah</div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px", paddingBottom: 100 }}>
          {/* Status akhir */}
          <div style={{
            marginBottom: 16, padding: "14px 16px", borderRadius: 14, textAlign: "center",
            background: overallNormal ? "#D1FAE5" : theme.dangerLight,
            color: overallNormal ? theme.success : theme.danger,
            fontWeight: 800, fontSize: 15,
          }}>
            {overallNormal ? "✅ SEMUA KONDISI NORMAL" : "⚠️ ADA KONDISI ABNORMAL"}
          </div>

          {/* Data kendaraan */}
          <div style={{ marginBottom: 16, background: theme.surface, borderRadius: 14, padding: 16, border: `1px solid ${theme.border}` }}>
            <SectionLabel>Data Kendaraan</SectionLabel>
            <InfoRow label="Nomor Polisi" value={polisi} />
            <InfoRow label="Transportir" value={kendaraanData?.transportir} />
            <InfoRow label="Kapasitas MT" value={kendaraanData?.kapasitas_mt} />
            <InfoRow label="Jumlah Kompartemen" value={kendaraanData?.jumlah_kompartemen ? `${kendaraanData.jumlah_kompartemen} kompartemen` : null} />
            <InfoRow label="Pemeriksa" value={pemeriksa} />
            {umurMT && <InfoRow label="Umur MT" value={umurMT} />}
          </div>

          {/* Ringkasan GPS */}
          <div style={{ marginBottom: 16, background: theme.surface, borderRadius: 14, padding: 16, border: `1px solid ${theme.border}` }}>
            <SectionLabel>Kondisi GPS</SectionLabel>
            <RingkasanItemRow label="Status GPS" status={gps.status} kategori="gps_status" allPhotos={photos} onPreview={setPreviewUrl} isAktifToggle />
            <RingkasanItemRow label="Segel GPS" status={gps.segel.status} ket={gps.segel.ket} kategori="gps_segel" allPhotos={photos} onPreview={setPreviewUrl} />
            <RingkasanItemRow label="Kabel GPS" status={gps.kabel.status} ket={gps.kabel.ket} kategori="gps_kabel" allPhotos={photos} onPreview={setPreviewUrl} />
          </div>

          {/* Ringkasan CCTV */}
          <div style={{ marginBottom: 16, background: theme.surface, borderRadius: 14, padding: 16, border: `1px solid ${theme.border}` }}>
            <SectionLabel>CCTV Dashcam</SectionLabel>
            <RingkasanItemRow label="Status CCTV Dashcam" status={cctv.dashcam.status} kategori="cctv_dashcam_status" allPhotos={photos} onPreview={setPreviewUrl} isAktifToggle />
            <RingkasanItemRow label="Segel Bricket" status={cctv.dashcam.segel_bricket} ket={cctv.dashcam.ket_bricket} kategori="cctv_dashcam_bricket" allPhotos={photos} onPreview={setPreviewUrl} />
            <RingkasanItemRow label="Segel Sambungan Kabel" status={cctv.dashcam.segel_kabel} ket={cctv.dashcam.ket_kabel} kategori="cctv_dashcam_kabel" allPhotos={photos} onPreview={setPreviewUrl} />
          </div>

          <div style={{ marginBottom: 16, background: theme.surface, borderRadius: 14, padding: 16, border: `1px solid ${theme.border}` }}>
            <SectionLabel>CCTV Kanan</SectionLabel>
            <RingkasanItemRow label="Status CCTV Kanan" status={cctv.kanan.status} kategori="cctv_kanan_status" allPhotos={photos} onPreview={setPreviewUrl} isAktifToggle />
            <RingkasanItemRow label="Segel Bricket" status={cctv.kanan.segel_bricket} ket={cctv.kanan.ket_bricket} kategori="cctv_kanan_bricket" allPhotos={photos} onPreview={setPreviewUrl} />
            <RingkasanItemRow label="Segel Sambungan Kabel" status={cctv.kanan.segel_kabel} ket={cctv.kanan.ket_kabel} kategori="cctv_kanan_kabel" allPhotos={photos} onPreview={setPreviewUrl} />
          </div>

          <div style={{ marginBottom: 16, background: theme.surface, borderRadius: 14, padding: 16, border: `1px solid ${theme.border}` }}>
            <SectionLabel>CCTV Kiri</SectionLabel>
            <RingkasanItemRow label="Status CCTV Kiri" status={cctv.kiri.status} kategori="cctv_kiri_status" allPhotos={photos} onPreview={setPreviewUrl} isAktifToggle />
            <RingkasanItemRow label="Segel Bricket" status={cctv.kiri.segel_bricket} ket={cctv.kiri.ket_bricket} kategori="cctv_kiri_bricket" allPhotos={photos} onPreview={setPreviewUrl} />
            <RingkasanItemRow label="Segel Sambungan Kabel" status={cctv.kiri.segel_kabel} ket={cctv.kiri.ket_kabel} kategori="cctv_kiri_kabel" allPhotos={photos} onPreview={setPreviewUrl} />
          </div>

          <div style={{ marginBottom: 16, background: theme.surface, borderRadius: 14, padding: 16, border: `1px solid ${theme.border}` }}>
            <SectionLabel>Segel Kotak Sekring</SectionLabel>
            <RingkasanItemRow label="Status Segel Kotak Sekring" status={segelKotakSekring} kategori="segel_kotak_sekring" allPhotos={photos} onPreview={setPreviewUrl} isAktifToggle />
          </div>

          <div style={{ fontSize: 12, color: theme.textMuted, textAlign: "center", marginTop: 4 }}>
            Pastikan semua data sudah benar. Data tidak dapat diedit setelah dikirim.
          </div>
        </div>

        <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, padding: "12px 16px", background: theme.surface, borderTop: `1px solid ${theme.border}`, display: "flex", gap: 10 }}>
          <Btn onClick={() => window.history.back()} variant="ghost" style={{ flex: 1 }} disabled={submitting}>
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
        <div onClick={() => { if (stepNum > 1) window.history.back(); else onBack(); }} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14, cursor: "pointer", color: theme.textSub, fontSize: 13 }}>
          <Icon name="arrow" size={16} color={theme.textSub} /> Kembali
        </div>
        <div style={{ fontWeight: 800, fontSize: 18, color: theme.text, marginBottom: 16 }}>Form Pengecekan</div>
        <div style={{ display: "flex", alignItems: "center" }}>
          {steps.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : 0 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: stepNum > i+1 ? theme.success : stepNum === i+1 ? theme.primary : theme.surfaceAlt, fontSize: 12, fontWeight: 700, color: stepNum >= i+1 ? "#fff" : theme.textMuted }}>
                  {stepNum > i+1 ? <Icon name="check" size={13} color="#fff" /> : i+1}
                </div>
                <div style={{ fontSize: 10, marginTop: 4, color: stepNum === i+1 ? theme.primary : theme.textMuted, fontWeight: stepNum === i+1 ? 700 : 400 }}>{s}</div>
              </div>
              {i < steps.length - 1 && <div style={{ flex: 1, height: 2, background: stepNum > i+1 ? theme.success : theme.border, margin: "0 6px", marginBottom: 14 }} />}
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px", paddingBottom: 100 }}>
        {restoreBanner}
        {expiredNotice}

        {step === 1 && (
          <>
            <SectionLabel>Data Kendaraan</SectionLabel>
            <div style={{ background: theme.surface, borderRadius: 14, padding: 16, border: `1px solid ${theme.border}` }}>
              <Input label="Nomor Polisi" placeholder="Contoh: B 1234 XY" value={polisi} onChange={handlePolisiChange} />
              {lookupStatus === "loading" && <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 12 }}>🔍 Mencari data kendaraan...</div>}
              {lookupStatus === "notfound" && (
                <div style={{ fontSize: 12, color: theme.danger, fontWeight: 600, marginBottom: 12, padding: "8px 12px", background: theme.dangerLight, borderRadius: 8 }}>
                  ⚠️ Nomor Polisi tidak ditemukan. Hubungi admin Depot untuk mendaftarkan kendaraan ini.
                </div>
              )}
              {lookupStatus === "found" && kendaraanData && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: theme.success, fontWeight: 700, marginBottom: 10 }}>✅ Data kendaraan ditemukan</div>
                  <InfoRow label="Transportir" value={kendaraanData.transportir} />
                  <InfoRow label="Kapasitas MT" value={kendaraanData.kapasitas_mt} />
                  <InfoRow label="Jumlah Kompartemen" value={kendaraanData.jumlah_kompartemen ? `${kendaraanData.jumlah_kompartemen} kompartemen` : null} />
                  <InfoRow label="Kategori MT" value={kendaraanData.kategori_mt === "merah_putih" ? "MT Merah Putih" : kendaraanData.kategori_mt === "industri" ? "MT Industri" : kendaraanData.kategori_mt} />
                  {umurMT && (
                    <InfoRow label="Umur MT" value={`${umurMT} (STNK: ${formatTanggal(kendaraanData.tanggal_stnk)})`} />
                  )}
                  <InfoRow
                    label="Masa Berlaku Head Truck"
                    value={formatMasaBerlaku(kendaraanData.masa_berlaku_head_truck, statusHeadTruck)}
                    highlight={statusHeadTruck === "expired" || statusHeadTruck === "warning"}
                  />
                  <InfoRow
                    label="Masa Berlaku Tangki"
                    value={formatMasaBerlaku(kendaraanData.masa_berlaku_tangki, statusTangki)}
                    highlight={statusTangki === "expired" || statusTangki === "warning"}
                  />
                </div>
              )}

              {/* Peringatan & blokir kalau masa berlaku Head Truck/Tangki sudah lewat */}
              {lookupStatus === "found" && isKendaraanExpired && (
                <div style={{ marginBottom: 12, padding: "12px 14px", borderRadius: 10, background: theme.dangerLight, color: theme.danger, fontSize: 12, fontWeight: 700 }}>
                  ⛔ {statusHeadTruck === "expired" && statusTangki === "expired"
                    ? "Masa berlaku Head Truck dan Tangki kendaraan ini sudah kedaluwarsa."
                    : statusHeadTruck === "expired"
                      ? "Masa berlaku Head Truck kendaraan ini sudah kedaluwarsa."
                      : "Masa berlaku Tangki kendaraan ini sudah kedaluwarsa."}
                  {" "}Pengecekan tidak dapat dilanjutkan sampai diperbarui — hubungi admin untuk perpanjangan/registrasi ulang.
                </div>
              )}

              <div style={{ padding: "10px 12px", borderRadius: 10, background: theme.surfaceAlt, border: `1px solid ${theme.border}`, marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 2 }}>Nama Pemeriksa</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>{pemeriksa || "Memuat..."}</div>
                <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>Otomatis dari akun login</div>
              </div>
              <div style={{ fontSize: 12, color: theme.textMuted }}>
                📅 {new Date().toLocaleDateString("id-ID")} · 🕐 {new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>

            {/* Riwayat pengecekan sebelumnya — konteks untuk Teknisi sebelum cek ulang */}
            {lookupStatus === "found" && riwayatSebelumnya.length > 0 && (
              <div style={{ marginTop: 16, background: theme.surface, borderRadius: 14, padding: 16, border: `1px solid ${theme.border}` }}>
                <SectionLabel>Riwayat Pengecekan Sebelumnya</SectionLabel>
                {riwayatSebelumnya.map((r, i) => {
                  const normal = isRiwayatNormal(r);
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
                        background: normal ? theme.successLight : theme.dangerLight,
                        color: normal ? theme.success : theme.danger,
                      }}>
                        {normal ? "✅ Normal" : "⚠️ Abnormal"}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <SectionLabel>Kondisi GPS</SectionLabel>
            <StatusAktifWithFoto label="Status GPS" status={gps.status} onStatus={(v) => setGps((p) => ({ ...p, status: v }))} kategori="gps_status" onPhotos={setPhotos} allPhotos={photos} errorFoto={errors.gps_status_foto} onPreview={setPreviewUrl} requestAccess={requestAccess} />
            {errors.gps_status && <div style={{ fontSize: 12, color: theme.danger, fontWeight: 600, marginTop: -8, marginBottom: 10 }}>⚠️ Status GPS wajib dipilih.</div>}
            <CheckItemWithFoto label="Segel GPS" status={gps.segel.status} onStatus={setGpsField("segel", "status")} ket={gps.segel.ket} onKet={setGpsField("segel", "ket")} errorKet={errors.gps_segel_ket} kategori="gps_segel" onPhotos={setPhotos} allPhotos={photos} errorFoto={errors.gps_segel_foto} onPreview={setPreviewUrl} requestAccess={requestAccess} />
            <CheckItemWithFoto label="Kabel GPS" status={gps.kabel.status} onStatus={setGpsField("kabel", "status")} ket={gps.kabel.ket} onKet={setGpsField("kabel", "ket")} errorKet={errors.gps_kabel_ket} kategori="gps_kabel" onPhotos={setPhotos} allPhotos={photos} errorFoto={errors.gps_kabel_foto} onPreview={setPreviewUrl} requestAccess={requestAccess} />
          </>
        )}

        {step === 3 && (
          <>
            <SectionLabel>CCTV Dashcam</SectionLabel>
            <StatusAktifWithFoto label="Status CCTV Dashcam" status={cctv.dashcam.status} onStatus={setCctvField("dashcam", "status")} kategori="cctv_dashcam_status" onPhotos={setPhotos} allPhotos={photos} errorFoto={errors.dashcam_status_foto} onPreview={setPreviewUrl} requestAccess={requestAccess} />
            <CheckItemWithFoto label="Segel Bricket" status={cctv.dashcam.segel_bricket} onStatus={setCctvField("dashcam", "segel_bricket")} ket={cctv.dashcam.ket_bricket} onKet={setCctvField("dashcam", "ket_bricket")} errorKet={errors.dashcam_bricket_ket} kategori="cctv_dashcam_bricket" onPhotos={setPhotos} allPhotos={photos} errorFoto={errors.dashcam_bricket_foto} onPreview={setPreviewUrl} requestAccess={requestAccess} />
            <CheckItemWithFoto label="Segel Sambungan Kabel" status={cctv.dashcam.segel_kabel} onStatus={setCctvField("dashcam", "segel_kabel")} ket={cctv.dashcam.ket_kabel} onKet={setCctvField("dashcam", "ket_kabel")} errorKet={errors.dashcam_kabel_ket} kategori="cctv_dashcam_kabel" onPhotos={setPhotos} allPhotos={photos} errorFoto={errors.dashcam_kabel_foto} onPreview={setPreviewUrl} requestAccess={requestAccess} />
            <SectionLabel style={{ marginTop: 8 }}>CCTV Kanan</SectionLabel>
            <StatusAktifWithFoto label="Status CCTV Kanan" status={cctv.kanan.status} onStatus={setCctvField("kanan", "status")} kategori="cctv_kanan_status" onPhotos={setPhotos} allPhotos={photos} errorFoto={errors.kanan_status_foto} onPreview={setPreviewUrl} requestAccess={requestAccess} />
            <CheckItemWithFoto label="Segel Bricket" status={cctv.kanan.segel_bricket} onStatus={setCctvField("kanan", "segel_bricket")} ket={cctv.kanan.ket_bricket} onKet={setCctvField("kanan", "ket_bricket")} errorKet={errors.kanan_bricket_ket} kategori="cctv_kanan_bricket" onPhotos={setPhotos} allPhotos={photos} errorFoto={errors.kanan_bricket_foto} onPreview={setPreviewUrl} requestAccess={requestAccess} />
            <CheckItemWithFoto label="Segel Sambungan Kabel" status={cctv.kanan.segel_kabel} onStatus={setCctvField("kanan", "segel_kabel")} ket={cctv.kanan.ket_kabel} onKet={setCctvField("kanan", "ket_kabel")} errorKet={errors.kanan_kabel_ket} kategori="cctv_kanan_kabel" onPhotos={setPhotos} allPhotos={photos} errorFoto={errors.kanan_kabel_foto} onPreview={setPreviewUrl} requestAccess={requestAccess} />
            <SectionLabel style={{ marginTop: 8 }}>CCTV Kiri</SectionLabel>
            <StatusAktifWithFoto label="Status CCTV Kiri" status={cctv.kiri.status} onStatus={setCctvField("kiri", "status")} kategori="cctv_kiri_status" onPhotos={setPhotos} allPhotos={photos} errorFoto={errors.kiri_status_foto} onPreview={setPreviewUrl} requestAccess={requestAccess} />
            <CheckItemWithFoto label="Segel Bricket" status={cctv.kiri.segel_bricket} onStatus={setCctvField("kiri", "segel_bricket")} ket={cctv.kiri.ket_bricket} onKet={setCctvField("kiri", "ket_bricket")} errorKet={errors.kiri_bricket_ket} kategori="cctv_kiri_bricket" onPhotos={setPhotos} allPhotos={photos} errorFoto={errors.kiri_bricket_foto} onPreview={setPreviewUrl} requestAccess={requestAccess} />
            <CheckItemWithFoto label="Segel Sambungan Kabel" status={cctv.kiri.segel_kabel} onStatus={setCctvField("kiri", "segel_kabel")} ket={cctv.kiri.ket_kabel} onKet={setCctvField("kiri", "ket_kabel")} errorKet={errors.kiri_kabel_ket} kategori="cctv_kiri_kabel" onPhotos={setPhotos} allPhotos={photos} errorFoto={errors.kiri_kabel_foto} onPreview={setPreviewUrl} requestAccess={requestAccess} />
            <SectionLabel style={{ marginTop: 8 }}>Segel Kotak Sekring</SectionLabel>
            <StatusAktifWithFoto label="Status Segel Kotak Sekring" status={segelKotakSekring} onStatus={setSegelKotakSekring} kategori="segel_kotak_sekring" onPhotos={setPhotos} allPhotos={photos} errorFoto={errors.segel_kotak_foto} onPreview={setPreviewUrl} requestAccess={requestAccess} />
            {errors.segel_kotak && <div style={{ fontSize: 12, color: theme.danger, fontWeight: 600, marginTop: -8, marginBottom: 10 }}>⚠️ Status Segel Kotak Sekring wajib dipilih.</div>}
          </>
        )}
      </div>

      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, padding: "12px 16px", background: theme.surface, borderTop: `1px solid ${theme.border}`, display: "flex", gap: 10 }}>
        {stepNum > 1 && <Btn onClick={() => window.history.back()} variant="ghost" style={{ flex: 0.5, padding: "12px", fontSize: 13 }} disabled={submitting}>← Kembali</Btn>}
        {step === 1 && <Btn onClick={handleNextStep1} variant="primary" disabled={submitting || lookupStatus === "loading" || isKendaraanExpired}>Lanjut →</Btn>}
        {step === 2 && <Btn onClick={() => { if (!validateStep2()) { alert("Lengkapi semua data GPS dan foto dokumentasi!"); return; } pushHistoryStep(() => setStep(2)); setStep(3); }} variant="primary" disabled={submitting}>Lanjut →</Btn>}
        {step === 3 && <Btn onClick={handleTinjau} variant="primary" icon="check" disabled={submitting}>Tinjau & Kirim →</Btn>}
      </div>

      <PhotoLightbox url={previewUrl} onClose={() => setPreviewUrl(null)} />
    </div>
  );
};

export default FormScreen;