import { useState, useEffect, useRef, useCallback } from "react";
import Btn from "../components/Btn";
import Icon from "../components/Icon";
import Input from "../components/Input";
import SectionLabel from "../components/SectionLabel";
import theme from "../styles/theme";
import { supabase } from "../lib/supabase";
import { useCameraGPS } from "../hooks/useCameraGPS";
import { useBackableView, pushHistoryStep, discardHistorySteps } from "../hooks/useBackableView";

// ── Draft persistence (agar data tidak hilang kalau app ke-close / tombol home) ──
const DRAFT_KEY = "draft_form_p1";
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

// fotos sekarang array (bukan foto tunggal) — satu temuan boleh punya banyak
// foto dokumentasi (banyak angle).
const emptyTemuan = () => ({ judul: "", keterangan: "", fotos: [], errorJudul: false, errorKet: false, errorFoto: false });

// Draft lama (sebelum fitur multi-foto ini ada) masih menyimpan field
// tunggal `foto`, bukan array `fotos`. Normalizer ini bikin draft lama tetap
// bisa dipulihkan dengan benar alih-alih hilang/rusak.
const normalizeTemuan = (arr) => (Array.isArray(arr) ? arr : []).map((t) => ({
  ...emptyTemuan(),
  ...t,
  fotos: Array.isArray(t.fotos) ? t.fotos : (t.foto ? [t.foto] : []),
}));

// ── Format otomatis Nomor Polisi sambil mengetik: [huruf depan 1-2][spasi]
// [angka 1-4][spasi][huruf belakang 0-3] — mis. "b1234bbb" → "B 1234 BBB".
// User cukup ketik huruf & angka berurutan, spasi disisipkan otomatis
// tanpa perlu menekan tombol spasi. Dihitung ulang dari karakter alfanumerik
// polos setiap perubahan, jadi aman dipakai walau user edit/hapus di
// tengah teks (tidak akan menyisakan spasi menggantung).
const formatNopol = (raw) => {
  const clean = (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  let huruf1 = "", angka = "", huruf2 = "";
  let i = 0;
  while (i < clean.length && /[A-Z]/.test(clean[i]) && huruf1.length < 2) { huruf1 += clean[i]; i++; }
  while (i < clean.length && /[0-9]/.test(clean[i]) && angka.length < 4)  { angka  += clean[i]; i++; }
  while (i < clean.length && /[A-Z]/.test(clean[i]) && huruf2.length < 3) { huruf2 += clean[i]; i++; }
  return [huruf1, angka, huruf2].filter(Boolean).join(" ");
};

// ── Overlay helper — resize dulu ke maks 1600px sebelum overlay, supaya
// upload lebih ringan & cepat (sama seperti pola HSEFormScreen) ─────────────
const decimalToDMS = (d, p, n) => {
  const dir = d >= 0 ? p : n, abs = Math.abs(d);
  const deg = Math.floor(abs), mf = (abs - deg) * 60, min = Math.floor(mf);
  return `${deg}\u00b0${min}'${Math.round((mf - min) * 60)}"${dir}`;
};
const formatDMS = (lat, lng) => `${decimalToDMS(lat,"N","S")} ${decimalToDMS(lng,"E","W")}`;
const formatServerTime = (date) => {
  const H = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"][date.getDay()];
  const B = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"][date.getMonth()];
  return `${H}, ${date.getDate()} ${B} ${date.getFullYear()} ${String(date.getHours()).padStart(2,"0")}:${String(date.getMinutes()).padStart(2,"0")}:${String(date.getSeconds()).padStart(2,"0")}`;
};
const formatTanggal = (dateStr) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
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

const applyOverlay = async (file, pos) => {
  let serverTime = new Date();
  try { const { data } = await supabase.rpc("get_server_time"); if (data) serverTime = new Date(data); } catch {}

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
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  if (bitmap.close) bitmap.close();

  const fontSize = Math.max(20, Math.round(targetW * 0.028));
  const pad = fontSize * 0.7;
  const lineH = fontSize * 1.6;
  ctx.font = `bold ${fontSize}px Arial, sans-serif`;
  const boxW = Math.max(ctx.measureText(timeStr).width, ctx.measureText(dmsStr).width) + pad * 2.5;
  const boxH = lineH * 2 + pad * 1.5;
  const x = pad;
  const y = canvas.height - boxH - pad;
  ctx.fillStyle = "rgba(0,0,0,0.60)";
  ctx.fillRect(x, y, boxW, boxH);
  ctx.font = `bold ${fontSize}px Arial, sans-serif`;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(timeStr, x + pad, y + pad + fontSize);
  ctx.fillText(dmsStr, x + pad, y + pad + fontSize + lineH);

  return new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.9));
};

const uploadFoto = async (file, pos) => {
  const blob = await applyOverlay(file, pos);
  const fileName = `p1-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
  const { data, error } = await supabase.storage.from("foto-inspeksi").upload(fileName, blob, { contentType: "image/jpeg" });
  if (error) throw new Error("Foto gagal diupload: " + error.message);
  const { data: pub } = supabase.storage.from("foto-inspeksi").getPublicUrl(data.path);
  return { name: fileName, url: pub.publicUrl, path: data.path };
};

// ── InfoRow — tampilan data kendaraan readonly ───────────────────────────────
const InfoRow = ({ label, value, highlight }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${theme.border}` }}>
    <div style={{ fontSize: 12, color: theme.textMuted }}>{label}</div>
    <div style={{ fontSize: 13, fontWeight: 600, color: highlight ? theme.danger : theme.text, textAlign: "right", maxWidth: "60%" }}>
      {value || "-"}{highlight ? " ⚠️" : ""}
    </div>
  </div>
);

// ── PhotoLightbox — preview full-screen. Satu-satunya cara menutup adalah
// tombol back HP (useBackableView) — konsisten dengan HSEFormScreen. ────────
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

// ── MultiPhotoCapture — banyak foto per temuan ───────────────────────────────
// Beda dari CameraCapture versi lama (1 foto per temuan): sekarang tombol
// "Ambil Foto" bisa diklik berkali-kali, tiap hasil jepretan ditambahkan ke
// grid (bukan menimpa foto sebelumnya). Berguna kalau satu temuan perlu
// didokumentasikan dari banyak angle. `multiple` di <input type=file> juga
// memungkinkan pilih beberapa foto sekaligus dari galeri dalam satu aksi.
const MultiPhotoCapture = ({ fotos, onAddFoto, onRemoveFoto, errorFoto, onPreview, requestAccess }) => {
  const [capState, setCapState] = useState("idle");
  const [permErr,  setPermErr]  = useState(null);
  const fileRef = useRef(null);
  const cachedPosRef = useRef(null);

  const handleClick = async () => {
    setPermErr(null);
    setCapState("checking");
    try {
      cachedPosRef.current = await requestAccess();
      setCapState("idle");
      fileRef.current?.click();
    } catch {
      setCapState("idle");
      setPermErr("Izin kamera/lokasi diperlukan. Aktifkan di pengaturan browser.");
    }
  };

  const handleChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setCapState("processing");
    try {
      // Upload berurutan (bukan Promise.all) — urutan foto jadi sesuai urutan
      // diambil, dan lebih stabil di koneksi lapangan yang kadang lambat.
      for (const file of files) {
        const result = await uploadFoto(file, cachedPosRef.current);
        onAddFoto(result);
      }
    } catch (err) {
      alert("⚠️ " + err.message);
    } finally {
      setCapState("idle");
      cachedPosRef.current = null;
      e.target.value = "";
    }
  };

  const isWorking = capState !== "idle";

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{
        border: `2px dashed ${errorFoto ? theme.danger : theme.border}`,
        borderRadius: 10, padding: "12px",
        background: errorFoto ? theme.dangerLight : "transparent",
      }}>
        {permErr && <div style={{ fontSize: 11, color: theme.danger, fontWeight: 600, marginBottom: 8, textAlign: "center" }}>⛔ {permErr}</div>}

        {fotos.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))", gap: 8, marginBottom: 10 }}>
            {fotos.map((f, i) => (
              <div key={f.path || i} style={{ position: "relative" }}>
                <img
                  src={f.url}
                  alt={`Foto ${i + 1}`}
                  onClick={() => onPreview?.(f.url)}
                  style={{ width: "100%", aspectRatio: "1", borderRadius: 8, objectFit: "cover", cursor: "pointer", border: `1px solid ${theme.primary}`, display: "block" }}
                />
                <div
                  onClick={() => onRemoveFoto(i)}
                  style={{
                    position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%",
                    background: theme.danger, color: "#fff", fontSize: 11, fontWeight: 700, lineHeight: 1,
                    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                  }}
                >✕</div>
              </div>
            ))}
          </div>
        )}

        <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple onChange={handleChange} style={{ display: "none" }} />
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 8 }}>
            📷 Kamera belakang · ⏱ Timestamp · 📍 GPS{fotos.length > 0 ? ` · ${fotos.length} foto tersimpan` : ""}
          </div>
          <Btn onClick={handleClick} variant="outline" style={{ padding: "7px 16px", fontSize: 12 }} disabled={isWorking}>
            {capState === "checking" ? "🔐 Cek izin..." : capState === "processing" ? "⏳ Memproses..." : fotos.length > 0 ? "📷 Tambah Foto Lagi" : "📷 Ambil Foto"}
          </Btn>
        </div>
      </div>
      {errorFoto && <div style={{ fontSize: 11, color: theme.danger, fontWeight: 600, marginTop: 4 }}>⚠️ Minimal 1 foto wajib diambil.</div>}
    </div>
  );
};

// ── Satu item temuan ──────────────────────────────────────────────────────────
const TemuanItem = ({ idx, item, onChange, onRemove, showRemove, onPreview, requestAccess }) => {
  const set = (k) => (v) => onChange(idx, k, v);

  const handleAddFoto = (fd) => {
    onChange(idx, "fotos", [...(item.fotos || []), fd]);
  };
  const handleRemoveFoto = async (fotoIdx) => {
    const target = (item.fotos || [])[fotoIdx];
    if (target?.path) await supabase.storage.from("foto-inspeksi").remove([target.path]).catch(() => {});
    onChange(idx, "fotos", (item.fotos || []).filter((_, i) => i !== fotoIdx));
  };

  return (
    <div style={{ background: theme.surface, border: `1.5px solid ${theme.border}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "#EDE9FE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "#7C3AED" }}>
            {idx + 1}
          </div>
          <div style={{ fontWeight: 700, fontSize: 14, color: theme.text }}>Temuan</div>
        </div>
        {showRemove && (
          <div onClick={() => onRemove(idx)} style={{ fontSize: 12, color: theme.danger, fontWeight: 600, cursor: "pointer", padding: "4px 10px", borderRadius: 8, background: theme.dangerLight }}>
            Hapus
          </div>
        )}
      </div>

      <Input
        label="Judul / Objek yang Diperiksa"
        placeholder="Contoh: Ban, Lampu, Kopling, Angin..."
        value={item.judul}
        onChange={set("judul")}
      />

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: theme.textSub, marginBottom: 6 }}>Keterangan Temuan</div>
        <textarea
          placeholder="Tuliskan detail temuan yang ditemukan..."
          value={item.keterangan}
          onChange={(e) => set("keterangan")(e.target.value)}
          style={{
            width: "100%", padding: "10px 12px", borderRadius: 10,
            border: `1.5px solid ${item.errorKet ? theme.danger : theme.border}`,
            background: item.errorKet ? theme.dangerLight : theme.surfaceAlt,
            color: theme.text, fontSize: 13, fontFamily: "'DM Sans',sans-serif",
            resize: "none", minHeight: 80, boxSizing: "border-box", outline: "none",
          }}
        />
        {item.errorKet && <div style={{ fontSize: 11, color: theme.danger, fontWeight: 600, marginTop: 4 }}>⚠️ Keterangan wajib diisi.</div>}
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: theme.textSub, marginBottom: 6 }}>
        Foto Dokumentasi <span style={{ fontWeight: 400, color: theme.textMuted }}>(boleh lebih dari 1, mis. beda angle)</span>
      </div>
      <MultiPhotoCapture
        fotos={item.fotos || []}
        onAddFoto={handleAddFoto}
        onRemoveFoto={handleRemoveFoto}
        errorFoto={item.errorFoto || false}
        onPreview={onPreview}
        requestAccess={requestAccess}
      />
    </div>
  );
};

// ── P1FormScreen ──────────────────────────────────────────────────────────────
const P1FormScreen = ({ onBack, onNav }) => {
  const [step,        setStep]        = useState(1); // 1=Kendaraan, 2=Temuan, 3=Ringkasan
  const [currentUser, setCurrentUser] = useState(null);
  const [submitting,  setSubmitting]  = useState(false);
  const [previewUrl,  setPreviewUrl]  = useState(null);

  // ── Navigasi step tersinkron dengan riwayat browser, lewat pushHistoryStep
  // dari hooks/useBackableView (stack yang sama dipakai PhotoLightbox) —
  // pola identik dengan HSEFormScreen. Setiap MAJU satu step: pushHistoryStep
  // + catat cara baliknya (closeFn). Setiap MUNDUR: window.history.back()
  // (satu step) atau discardHistorySteps (lompat banyak step sekaligus,
  // dipakai HANYA oleh "Mulai Baru") — BUKAN ubah state langsung atau
  // window.history.go(-n) mentah, supaya jalur tombol UI & tombol HP selalu
  // konsisten dengan stack di internalViewFlag.js.
  const stepDepthRef = useRef(0);

  const goForward = (nextStep) => {
    const prevStep = step;
    pushHistoryStep(() => {
      stepDepthRef.current = Math.max(0, stepDepthRef.current - 1);
      setStep(prevStep);
    });
    stepDepthRef.current += 1;
    setStep(nextStep);
  };

  // Lompat balik ke step 1 dari step manapun — dipakai KHUSUS oleh
  // "Mulai Baru" (reset total pengisian). Tombol "Kembali" di header TIDAK
  // lagi memakai ini (lihat onClick di header di bawah) — sebelumnya header
  // selalu lompat ke step 1 walau posisi sedang di step 3, sementara tombol
  // "Kembali" di bawah cuma mundur 1 langkah. Sekarang keduanya konsisten:
  // sama-sama mundur 1 langkah lewat window.history.back().
  const jumpToStep1 = () => {
    if (stepDepthRef.current > 0) {
      discardHistorySteps(stepDepthRef.current);
      stepDepthRef.current = 0;
    }
    setStep(1);
  };

  // Kamera/GPS di-"hangat"-kan sejak layar ini dibuka — sama seperti HSEFormScreen
  const { warmUp, coolDown, requestAccess } = useCameraGPS();
  useEffect(() => {
    warmUp();
    return () => coolDown();
  }, [warmUp, coolDown]);

  const [nopol,         setNopol]         = useState("");
  const [kendaraanData, setKendaraanData] = useState(null);
  const [lookupStatus,  setLookupStatus]  = useState("idle");
  const lookupTimer = useRef(null);

  // Riwayat pengecekan P1 sebelumnya untuk kendaraan yang sedang dicari (3 terakhir)
  const [riwayatSebelumnya, setRiwayatSebelumnya] = useState([]);

  const [temuan, setTemuan] = useState([emptyTemuan()]);

  const [ready, setReady] = useState(false);
  const [showRestoreBanner, setShowRestoreBanner] = useState(false);
  const [draftExpiredNotice, setDraftExpiredNotice] = useState(false);
  const draftCreatedAtRef = useRef(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { if (user) setCurrentUser(user.id); });
  }, []);

  // Cleanup: layar ditinggalkan tanpa submit → foto yang sudah keburu
  // diupload dihapus lagi dari storage (semua foto di semua temuan, bukan
  // cuma 1 per temuan). Draft TIDAK dihapus di sini (sama seperti
  // HSEFormScreen) — biar tetap bisa dipulihkan kalau user balik lagi.
  const temuanRef = useRef(temuan);
  useEffect(() => { temuanRef.current = temuan; }, [temuan]);
  useEffect(() => {
    return () => {
      if (!submittedRef.current) {
        const paths = temuanRef.current.flatMap((t) => (t.fotos || []).map((f) => f.path)).filter(Boolean);
        if (paths.length) supabase.storage.from("foto-inspeksi").remove(paths).catch(console.error);
      }
    };
  }, []);

  // ── Restore draft di awal (sekali) ─────────────────────────────────────
  // Catatan: kalau draft me-restore langsung ke step pertengahan (mis. step
  // 2/3), tombol back HP dari situ akan langsung keluar form alih-alih
  // mundur satu step dulu — riwayat browser yang sesungguhnya di sesi baru
  // ini memang belum ada rekamnya sejauh itu, jadi ini batasan wajar (sama
  // seperti di HSEFormScreen), bukan bug.
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      const age = Date.now() - (draft.createdAt || 0);
      if (draft.createdAt && age > DRAFT_EXPIRE_MS) {
        clearDraft();
        setDraftExpiredNotice(true);
      } else {
        setStep(draft.step || 1);
        setNopol(draft.nopol || "");
        setKendaraanData(draft.kendaraanData || null);
        setLookupStatus(draft.kendaraanData ? "found" : "idle");
        setTemuan(draft.temuan && draft.temuan.length ? normalizeTemuan(draft.temuan) : [emptyTemuan()]);
        setRiwayatSebelumnya(draft.riwayatSebelumnya || []);
        draftCreatedAtRef.current = draft.createdAt || Date.now();
        setShowRestoreBanner(true);
      }
    }
    setReady(true);
  }, []);

  // ── Simpan draft — hanya kalau ada progress beneran ─────────────────────
  useEffect(() => {
    if (!ready) return;
    const hasProgress =
      step > 1 || nopol.trim() || temuan.some((t) => t.judul.trim() || t.keterangan.trim() || (t.fotos && t.fotos.length > 0));
    if (!hasProgress) { clearDraft(); draftCreatedAtRef.current = null; return; }
    if (!draftCreatedAtRef.current) draftCreatedAtRef.current = Date.now();
    saveDraft({ createdAt: draftCreatedAtRef.current, step, nopol, kendaraanData, temuan, riwayatSebelumnya });
  }, [ready, step, nopol, kendaraanData, temuan, riwayatSebelumnya]);

  const resetSemua = () => {
    clearDraft();
    draftCreatedAtRef.current = null;
    jumpToStep1();
    setNopol("");
    setKendaraanData(null);
    setLookupStatus("idle");
    setTemuan([emptyTemuan()]);
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

  const handleNopolChange = useCallback((val) => {
    // Auto-format: user cukup ketik huruf+angka berurutan, spasi disisipkan
    // otomatis ("b1234bbb" → "B 1234 BBB") — tidak perlu menekan spasi.
    const formatted = formatNopol(val);
    setNopol(formatted);
    setKendaraanData(null);
    setLookupStatus("idle");
    setRiwayatSebelumnya([]);
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    if (!formatted.trim()) return;
    lookupTimer.current = setTimeout(async () => {
      setLookupStatus("loading");
      try {
        const { data } = await supabase.from("kendaraan")
          .select("nomor_polisi, transportir, kapasitas_mt, jumlah_kompartemen, kategori_mt, masa_berlaku_head_truck, masa_berlaku_tangki")
          .eq("nomor_polisi", formatted.trim().toUpperCase()).maybeSingle();
        if (data) {
          setKendaraanData(data);
          setLookupStatus("found");

          // Riwayat pengecekan P1 sebelumnya — 3 terakhir untuk kendaraan ini,
          // dilengkapi jumlah temuan masing-masing (bukan status lulus/tidak lulus,
          // karena P1 adalah cek random, bukan uji kedap pass/fail).
          const { data: riwayatData } = await supabase
            .from("inspeksi_p1")
            .select("id, created_at")
            .eq("nomor_polisi", formatted.trim().toUpperCase())
            .order("created_at", { ascending: false })
            .limit(3);

          if (riwayatData && riwayatData.length > 0) {
            const withCounts = await Promise.all(riwayatData.map(async (r) => {
              const { count } = await supabase
                .from("inspeksi_p1_temuan")
                .select("id", { count: "exact", head: true })
                .eq("inspeksi_p1_id", r.id);
              return { ...r, temuanCount: count || 0 };
            }));
            setRiwayatSebelumnya(withCounts);
          } else {
            setRiwayatSebelumnya([]);
          }
        } else {
          setLookupStatus("notfound");
        }
      } catch { setLookupStatus("notfound"); }
    }, 600);
  }, []);

  const updateTemuan = (idx, key, val) =>
    setTemuan(prev => prev.map((t, i) => i === idx ? { ...t, [key]: val } : t));

  const addTemuan = () =>
    setTemuan(prev => [...prev, emptyTemuan()]);

  const removeTemuan = async (idx) => {
    const paths = (temuan[idx].fotos || []).map((f) => f.path).filter(Boolean);
    if (paths.length) await supabase.storage.from("foto-inspeksi").remove(paths).catch(() => {});
    setTemuan(prev => prev.filter((_, i) => i !== idx));
  };

  const handleNextStep1 = () => {
    if (!nopol.trim()) { alert("Nomor Polisi wajib diisi!"); return; }
    if (lookupStatus === "loading") { alert("Sedang mencari data kendaraan, tunggu sebentar..."); return; }
    if (lookupStatus === "notfound" || !kendaraanData) {
      alert("Nomor Polisi tidak ditemukan di database. Hubungi admin Depot untuk mendaftarkan kendaraan ini.");
      return;
    }
    if (isExpired(kendaraanData.masa_berlaku_head_truck) || isExpired(kendaraanData.masa_berlaku_tangki)) {
      alert("Masa berlaku Head Truck/Tangki kendaraan ini sudah kedaluwarsa. Pengecekan tidak dapat dilanjutkan — hubungi admin untuk perpanjangan/registrasi ulang.");
      return;
    }
    goForward(2);
  };

  const validateTemuan = () => {
    let valid = true;
    const updated = temuan.map(t => {
      const eJ = !t.judul.trim();
      const eK = !t.keterangan.trim();
      const eF = !t.fotos || t.fotos.length === 0;
      if (eJ || eK || eF) valid = false;
      return { ...t, errorJudul: eJ, errorKet: eK, errorFoto: eF };
    });
    setTemuan(updated);
    if (!valid) alert("Lengkapi semua temuan — judul, keterangan, dan minimal 1 foto wajib diisi!");
    return valid;
  };

  // Tombol di step Temuan sekarang menuju layar RINGKASAN dulu, belum langsung kirim
  const handleTinjau = () => {
    if (!validateTemuan()) return;
    goForward(3);
  };

  // Submit sesungguhnya — dipanggil dari layar Ringkasan.
  // Catatan atomicity: tidak pakai transaksi database asli (butuh RPC baru di sisi Supabase).
  // Sebagai gantinya, kalau ada temuan yang gagal disimpan SETELAH baris inspeksi_p1 dan
  // sebagian temuan lain terlanjur terbuat, semuanya dihapus lagi (rollback manual) supaya
  // tidak ada record "setengah jadi" yang nyangkut. submittedRef juga baru diset true setelah
  // SEMUA insert berhasil, supaya cleanup foto orphan (efek unmount) tetap jalan kalau gagal.
  const handleSubmit = async () => {
    if (!validateTemuan()) { window.history.back(); return; }
    setSubmitting(true);
    let inspId = null;
    const createdTemuanIds = [];
    try {
      const { data: insp, error: inspErr } = await supabase.from("inspeksi_p1").insert([{
        user_id: currentUser,
        nomor_polisi: nopol.trim().toUpperCase(),
        kapasitas_mt: kendaraanData.kapasitas_mt,
        jumlah_kompartemen: kendaraanData.jumlah_kompartemen,
        transportir: kendaraanData.transportir,
        kategori_mt: kendaraanData.kategori_mt,
        is_submitted: true,
        submitted_at: new Date().toISOString(),
        status: "baru",
      }]).select().single();
      if (inspErr) throw inspErr;
      inspId = insp.id;

      for (const t of temuan) {
        const { data: tv, error: tvErr } = await supabase.from("inspeksi_p1_temuan").insert([{
          inspeksi_p1_id: inspId,
          judul: t.judul,
          keterangan: t.keterangan,
        }]).select().single();
        if (tvErr) throw tvErr;
        createdTemuanIds.push(tv.id);

        if (t.fotos && t.fotos.length > 0) {
          const { error: fotoErr } = await supabase.from("foto_inspeksi_p1").insert(
            t.fotos.map((f) => ({ temuan_id: tv.id, url: f.url }))
          );
          if (fotoErr) throw fotoErr;
        }
      }

      // Semua insert berhasil — baru sekarang dianggap benar-benar tersimpan.
      submittedRef.current = true;
      clearDraft();

      alert("✓ Laporan cek random berhasil dikirim!");
      onNav("dashboard");
    } catch (err) {
      // Rollback manual: hapus dulu temuan (+foto turunannya) yang sempat
      // terbuat, baru hapus baris inspeksi_p1-nya, supaya tidak ada record
      // setengah jadi yang nyangkut di database.
      if (createdTemuanIds.length > 0) {
        await supabase.from("foto_inspeksi_p1").delete().in("temuan_id", createdTemuanIds).catch(() => {});
        await supabase.from("inspeksi_p1_temuan").delete().in("id", createdTemuanIds).catch(() => {});
      }
      if (inspId) {
        await supabase.from("inspeksi_p1").delete().eq("id", inspId).catch(() => {});
      }
      alert("Gagal menyimpan: " + err.message + "\n\nData belum tersimpan. Silakan coba kirim ulang.");
    } finally {
      setSubmitting(false);
    }
  };

  const STEPS = ["Kendaraan", "Temuan", "Ringkasan"];
  const masaBerlakuBermasalah = kendaraanData
    && (isExpired(kendaraanData.masa_berlaku_head_truck) || isExpired(kendaraanData.masa_berlaku_tangki));

  return (
    <div style={{ minHeight: "100vh", background: theme.bg, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ background: theme.surface, padding: "48px 16px 16px", borderBottom: `1px solid ${theme.border}`, boxShadow: theme.shadow }}>
        <div
          onClick={() => { if (step > 1) window.history.back(); else onBack(); }}
          style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14, cursor: "pointer", color: theme.textSub, fontSize: 13 }}
        >
          <Icon name="arrow" size={16} color={theme.textSub} /> Kembali
        </div>
        <div style={{ fontWeight: 800, fontSize: 18, color: theme.text, marginBottom: 16 }}>Pengecekan / Temuan</div>
        <div style={{ display: "flex", alignItems: "center" }}>
          {STEPS.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : 0 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: step > i + 1 ? theme.success : step === i + 1 ? "#7C3AED" : theme.surfaceAlt, fontSize: 12, fontWeight: 700, color: step >= i + 1 ? "#fff" : theme.textMuted }}>
                  {step > i + 1 ? <Icon name="check" size={13} color="#fff" /> : i + 1}
                </div>
                <div style={{ fontSize: 10, marginTop: 4, color: step === i + 1 ? "#7C3AED" : theme.textMuted, fontWeight: step === i + 1 ? 700 : 400 }}>{s}</div>
              </div>
              {i < STEPS.length - 1 && <div style={{ flex: 1, height: 2, background: step > i + 1 ? theme.success : theme.border, margin: "0 6px", marginBottom: 14 }} />}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px", paddingBottom: 90 }}>
        {restoreBanner}
        {expiredNotice}

        {step === 1 && (
          <>
            <SectionLabel>Data Kendaraan</SectionLabel>
            <div style={{ background: theme.surface, borderRadius: 14, padding: 16, border: `1px solid ${theme.border}` }}>
              <Input label="Nomor Polisi" placeholder="B 1234 XY" value={nopol} onChange={handleNopolChange} />

              {lookupStatus === "loading" && (
                <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 10 }}>🔍 Mencari data kendaraan...</div>
              )}
              {lookupStatus === "notfound" && (
                <div style={{ fontSize: 12, color: theme.danger, fontWeight: 600, marginBottom: 12, padding: "8px 12px", background: theme.dangerLight, borderRadius: 8 }}>
                  ⚠️ Nomor Polisi tidak ditemukan. Hubungi admin Depot untuk mendaftarkan kendaraan ini.
                </div>
              )}

              {lookupStatus === "found" && kendaraanData && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: theme.success, fontWeight: 700, marginBottom: 10 }}>
                    ✅ Data kendaraan ditemukan
                  </div>
                  <InfoRow label="Transportir" value={kendaraanData.transportir} />
                  <InfoRow label="Kapasitas MT" value={kendaraanData.kapasitas_mt} />
                  <InfoRow label="Jumlah Kompartemen" value={kendaraanData.jumlah_kompartemen ? `${kendaraanData.jumlah_kompartemen} kompartemen` : null} />
                  <InfoRow label="Kategori MT" value={kendaraanData.kategori_mt === "merah_putih" ? "MT Merah Putih" : kendaraanData.kategori_mt === "industri" ? "MT Industri" : kendaraanData.kategori_mt} />
                  <InfoRow label="Masa Berlaku Head Truck" value={formatTanggal(kendaraanData.masa_berlaku_head_truck)} highlight={isExpired(kendaraanData.masa_berlaku_head_truck)} />
                  <InfoRow label="Masa Berlaku Tangki" value={formatTanggal(kendaraanData.masa_berlaku_tangki)} highlight={isExpired(kendaraanData.masa_berlaku_tangki)} />
                </div>
              )}
            </div>

            {/* Peringatan & blokir kalau masa berlaku Head Truck/Tangki sudah lewat */}
            {lookupStatus === "found" && masaBerlakuBermasalah && (
              <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 10, background: theme.dangerLight, color: theme.danger, fontSize: 12, fontWeight: 700 }}>
                ⛔ {isExpired(kendaraanData.masa_berlaku_head_truck) && isExpired(kendaraanData.masa_berlaku_tangki)
                  ? "Masa berlaku Head Truck dan Tangki kendaraan ini sudah kedaluwarsa."
                  : isExpired(kendaraanData.masa_berlaku_head_truck)
                    ? "Masa berlaku Head Truck kendaraan ini sudah kedaluwarsa."
                    : "Masa berlaku Tangki kendaraan ini sudah kedaluwarsa."}
                {" "}Pengecekan tidak dapat dilanjutkan sampai diperbarui — hubungi admin untuk perpanjangan/registrasi ulang.
              </div>
            )}

            {/* Riwayat pengecekan P1 sebelumnya — konteks sebelum cek ulang */}
            {lookupStatus === "found" && riwayatSebelumnya.length > 0 && (
              <div style={{ marginTop: 16, background: theme.surface, borderRadius: 14, padding: 16, border: `1px solid ${theme.border}` }}>
                <SectionLabel>Riwayat Pengecekan Sebelumnya</SectionLabel>
                {riwayatSebelumnya.map((r, i) => (
                  <div key={r.id} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "8px 0", borderBottom: i < riwayatSebelumnya.length - 1 ? `1px solid ${theme.border}` : "none",
                  }}>
                    <div style={{ fontSize: 12, color: theme.textMuted }}>
                      {new Date(r.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                    </div>
                    <div style={{
                      fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                      background: r.temuanCount > 0 ? theme.dangerLight : theme.successLight,
                      color: r.temuanCount > 0 ? theme.danger : theme.success,
                    }}>
                      {r.temuanCount > 0 ? `${r.temuanCount} temuan` : "Tidak ada temuan"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <SectionLabel>Form Temuan</SectionLabel>
            <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 16 }}>
              Isi setiap temuan yang ditemukan. Tiap temuan wajib ada <b>judul</b>, <b>keterangan</b>, dan minimal <b>1 foto</b> (boleh lebih dari satu foto per temuan untuk angle berbeda).
            </div>

            {temuan.map((t, i) => (
              <TemuanItem
                key={i} idx={i} item={t}
                onChange={updateTemuan}
                onRemove={removeTemuan}
                showRemove={temuan.length > 1}
                onPreview={setPreviewUrl}
                requestAccess={requestAccess}
              />
            ))}

            <div onClick={addTemuan} style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              padding: "14px", borderRadius: 12, border: `2px dashed #7C3AED`,
              color: "#7C3AED", fontWeight: 700, fontSize: 13, cursor: "pointer",
              background: "#EDE9FE", marginBottom: 8,
            }}>
              <Icon name="plus" size={16} color="#7C3AED" /> Tambah Pengecekan
            </div>
            <div style={{ fontSize: 11, color: theme.textMuted, textAlign: "center", marginBottom: 16 }}>
              Gunakan tombol ini kalau ada temuan LAIN (objek berbeda). Untuk foto tambahan dari temuan
              yang sama (angle lain), pakai tombol <b>"Tambah Foto Lagi"</b> di dalam kartu temuannya.
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <SectionLabel>Ringkasan Sebelum Kirim</SectionLabel>
            <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 16 }}>
              Periksa kembali semua data sebelum diunggah. Data tidak dapat diedit setelah dikirim.
            </div>

            <div style={{ marginBottom: 16, background: theme.surface, borderRadius: 14, padding: 16, border: `1px solid ${theme.border}` }}>
              <SectionLabel>Data Kendaraan</SectionLabel>
              <InfoRow label="Nomor Polisi" value={nopol} />
              <InfoRow label="Transportir" value={kendaraanData?.transportir} />
              <InfoRow label="Kapasitas MT" value={kendaraanData?.kapasitas_mt} />
              <InfoRow label="Jumlah Kompartemen" value={kendaraanData?.jumlah_kompartemen} />
              <InfoRow label="Kategori MT" value={kendaraanData?.kategori_mt === "merah_putih" ? "MT Merah Putih" : kendaraanData?.kategori_mt === "industri" ? "MT Industri" : kendaraanData?.kategori_mt} />
            </div>

            <div style={{ marginBottom: 16, background: theme.surface, borderRadius: 14, padding: 16, border: `1px solid ${theme.border}` }}>
              <SectionLabel>Temuan ({temuan.length})</SectionLabel>
              {temuan.map((t, i) => (
                <div key={i} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: i < temuan.length - 1 ? `1px solid ${theme.border}` : "none" }}>
                  {t.fotos && t.fotos.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      {t.fotos.slice(0, 3).map((f, fi) => (
                        <img
                          key={f.path || fi}
                          src={f.url}
                          alt="temuan"
                          onClick={() => setPreviewUrl(f.url)}
                          style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover", cursor: "pointer" }}
                        />
                      ))}
                      {t.fotos.length > 3 && (
                        <div style={{
                          width: 48, height: 48, borderRadius: 8, background: theme.surfaceAlt,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, fontWeight: 700, color: theme.textMuted, flexShrink: 0,
                        }}>
                          +{t.fotos.length - 3}
                        </div>
                      )}
                    </div>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>{t.judul}</div>
                    <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>{t.keterangan}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Bottom Action */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, padding: "12px 16px", background: theme.surface, borderTop: `1px solid ${theme.border}`, display: "flex", gap: 10 }}>
        {step > 1 && (
          <Btn onClick={() => window.history.back()} variant="ghost" style={{ flex: 0.5, padding: "12px", fontSize: 13 }} disabled={submitting}>
            ← Kembali
          </Btn>
        )}
        {step === 1 && (
          <Btn onClick={handleNextStep1} variant="primary" disabled={submitting || lookupStatus === "loading" || masaBerlakuBermasalah}>
            Lanjut →
          </Btn>
        )}
        {step === 2 && (
          <Btn onClick={handleTinjau} variant="primary" icon="check" disabled={submitting}>
            Tinjau & Kirim →
          </Btn>
        )}
        {step === 3 && (
          <Btn onClick={handleSubmit} variant="primary" icon="check" disabled={submitting}>
            {submitting ? "Mengirim..." : "✅ Kirim Sekarang"}
          </Btn>
        )}
      </div>

      <PhotoLightbox url={previewUrl} onClose={() => setPreviewUrl(null)} />
    </div>
  );
};

export default P1FormScreen;