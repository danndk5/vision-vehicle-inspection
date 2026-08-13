import { useState, useEffect, useRef } from "react";
import BottomNav from "../components/BottomNav";
import Card from "../components/Card";
import Icon from "../components/Icon";
import Btn from "../components/Btn";
import SectionLabel from "../components/SectionLabel";
import theme from "../styles/theme";
import { supabase } from "../lib/supabase";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { SIDEBAR_WIDTH } from "../styles/layout";
import { useCameraGPS } from "../hooks/useCameraGPS";
import { useBackableView, goBack } from "../hooks/useBackableView";

// ── Draft persistence per inspeksi — agar data tidak hilang kalau app ke-close ──
const draftKey = (inspeksiId) => `hse_tl_draft_${inspeksiId}`;
const saveDraft = (inspeksiId, data) => {
  try { localStorage.setItem(draftKey(inspeksiId), JSON.stringify(data)); } catch {}
};
const loadDraft = (inspeksiId) => {
  try {
    const raw = localStorage.getItem(draftKey(inspeksiId));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};
const clearDraft = (inspeksiId) => {
  try { localStorage.removeItem(draftKey(inspeksiId)); } catch {}
};

// ── Helpers timestamp & GPS (sama seperti HSEFormScreen) ──────────────────────
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

// ── applyOverlay (sama seperti HSEFormScreen — pos langsung dari cache warm-up) ──
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

// ── uploadFoto (dengan overlay timestamp + GPS) ────────────────────────────────
const uploadFoto = async (file, kategori, pos) => {
  const blob = await applyOverlay(file, pos);
  const fileName = `hse-tl-${kategori}-${Date.now()}.jpg`;
  const { data, error } = await supabase.storage
    .from("foto-inspeksi").upload(fileName, blob, { contentType: "image/jpeg" });
  if (error) throw new Error("Foto gagal diupload: " + error.message);
  const { data: pub } = supabase.storage.from("foto-inspeksi").getPublicUrl(data.path);
  return { name: fileName, url: pub.publicUrl, path: data.path };
};

// ── PhotoLightbox — preview foto full-screen sebelum dikirim ──────────────────
// Tombol back HP menutup lightbox ini (bukan langsung keluar ke halaman
// sebelumnya) — lihat useBackableView di hooks/useBackableView.js.
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

// ── RepairPhotoGroup — foto bukti perbaikan untuk SATU temuan, boleh BANYAK
//    foto (angle berbeda), dipasangkan dengan 1 keterangan perbaikan untuk
//    grup itu. Pola ini sengaja dibuat sama seperti TemuanFotoGroup di
//    HSEFormScreen.jsx (1 keterangan + banyak foto) supaya konsisten dan
//    mudah dikenali developer lain. requestAccess() sudah di-warm-up dari
//    TindakLanjutDetail sejak layar ini dibuka, jadi tiap foto (angle 1, 2,
//    3...) terasa instan. ──────────────────────────────────────────────────
const RepairPhotoGroup = ({ index, fotos, keterangan, onFotos, onKeterangan, onPreview, errorFoto, errorKet, requestAccess, kategoriPrefix }) => {
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
      const result = await uploadFoto(file, `${kategoriPrefix}-${Date.now()}`, cachedPosRef.current);
      onFotos([...fotos, result]);
    } catch (err) {
      alert("⚠️ " + err.message);
    } finally {
      setCapState("idle");
      cachedPosRef.current = null;
      e.target.value = "";
    }
  };

  const removeFoto = async (fIdx) => {
    const foto = fotos[fIdx];
    if (foto?.path) await supabase.storage.from("foto-inspeksi").remove([foto.path]).catch(() => {});
    onFotos(fotos.filter((_, i) => i !== fIdx));
  };

  const isWorking = capState !== "idle";

  return (
    <div style={{
      border: `2px dashed ${errorFoto ? theme.danger : theme.border}`, borderRadius: 10, padding: "10px 12px",
      background: errorFoto ? theme.dangerLight : "transparent", marginTop: 8,
    }}>
      <div style={{ fontSize: 11, color: errorFoto ? theme.danger : theme.textMuted, marginBottom: 8, textAlign: "center" }}>
        Foto Bukti Perbaikan — Temuan {index + 1} (boleh lebih dari 1 angle)
        <div style={{ marginTop: 2 }}>📷 Kamera belakang · ⏱ Timestamp · 📍 GPS</div>
      </div>

      {permErr && (
        <div style={{ marginBottom: 8, padding: "6px 10px", borderRadius: 8, background: theme.dangerLight, color: theme.danger, fontSize: 12, fontWeight: 600 }}>
          ⛔ {permErr}
        </div>
      )}

      {fotos.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {fotos.map((foto, fIdx) => (
            <div key={foto.path || fIdx} style={{ position: "relative" }}>
              <img
                src={foto.url}
                alt={foto.name}
                onClick={() => onPreview?.(foto.url)}
                style={{ width: 64, height: 64, borderRadius: 8, objectFit: "cover", cursor: "pointer", border: `1px solid ${theme.primary}` }}
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

      {fotos.length === 0 && (
        <div style={{ fontSize: 11, color: theme.danger, fontWeight: 600, marginBottom: 10 }}>⚠️ Minimal 1 foto bukti perbaikan wajib diupload.</div>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
        onChange={handleFileChange} style={{ display: "none" }} />
      <Btn onClick={handleCaptureClick} variant="outline"
        style={{ fontSize: 12, padding: "8px 12px", width: "100%", marginBottom: 10 }} disabled={isWorking}>
        {capState === "checking" ? "🔐 Cek izin..." : capState === "processing" ? "⏳ Memproses..." : fotos.length === 0 ? "📷 Foto Bukti Perbaikan" : "📷 Tambah Foto (Angle Lain)"}
      </Btn>

      <textarea
        placeholder="Keterangan perbaikan untuk temuan ini (wajib)..."
        value={keterangan}
        onChange={(e) => onKeterangan(e.target.value)}
        style={{
          width: "100%", padding: "8px 10px", borderRadius: 8,
          border: `1.5px solid ${errorKet ? theme.danger : theme.border}`,
          background: errorKet ? theme.dangerLight : theme.surface,
          color: theme.text, fontSize: 13, fontFamily: "'DM Sans', sans-serif",
          resize: "none", minHeight: 60, boxSizing: "border-box", outline: "none",
        }}
      />
      {errorKet && (
        <div style={{ fontSize: 11, color: theme.danger, fontWeight: 600, marginTop: 3 }}>⚠️ Keterangan perbaikan wajib diisi.</div>
      )}
    </div>
  );
};

// ── TindakLanjutDetail HSE ────────────────────────────────────────────────────
// Tindak lanjut per KENDARAAN. `fotoTemuan` di sini adalah array TERKELOMPOK
// per temuan_index — { temuan_index, keterangan, fotos: [...] } — persis
// seperti pengelompokan aslinya di form Pengecekan (HSEFormScreen.jsx), bukan
// 1 baris = 1 temuan lagi. Setiap grup temuan WAJIB dipasangkan minimal 1
// foto bukti perbaikan (boleh banyak foto/angle) + 1 keterangan perbaikan.
// Alur tetap 2 step: "form" → isi bukti perbaikan, lalu "ringkasan" → tinjau
// ulang semua sebelum benar-benar dikirim.
const TindakLanjutDetail = ({ inspeksi, fotoTemuan, onBack, onSelesai }) => {
  const [step, setStep] = useState("form"); // "form" | "ringkasan"
  // buktiPerbaikan: array of array — buktiPerbaikan[i] = daftar foto (angle
  // berbeda) untuk grup temuan ke-i.
  const [buktiPerbaikan, setBuktiPerbaikan] = useState(() => fotoTemuan.map(() => []));
  const [ketPerbaikan,   setKetPerbaikan]   = useState(() => fotoTemuan.map(() => ""));
  const [previewUrl,     setPreviewUrl]     = useState(null);
  const [errors,         setErrors]         = useState({});
  const [submitting,     setSubmitting]     = useState(false);
  const [ready,          setReady]          = useState(false);

  // Level ke-2: begitu masuk step "ringkasan", pasang history-step TAMBAHAN
  // di atas history-step milik `view === "detail"` (dipasang oleh
  // HSETindakLanjut induknya). Tanpa ini, tombol kembali fisik HP di step
  // ringkasan langsung pop history-step milik "detail" dan lompat ke list,
  // skip step form sama sekali. Dengan nesting ini, back pertama menutup
  // step ringkasan (kembali ke form), back kedua baru menutup detail
  // (kembali ke list) — sama pola dengan nesting PhotoLightbox.
  useBackableView(step === "ringkasan", () => setStep("form"));

  // GPS/kamera di-"hangat"-kan sejak layar tindak lanjut ini dibuka — supaya
  // foto bukti perbaikan ke-1, ke-2, dst terasa instan (posisi sudah di tangan).
  const { warmUp, coolDown, requestAccess } = useCameraGPS();
  useEffect(() => {
    warmUp();
    return () => coolDown();
  }, [warmUp, coolDown]);

  // Pulihkan draft (foto + keterangan per grup temuan) kalau app sempat ke-close
  useEffect(() => {
    const draft = loadDraft(inspeksi.id);
    if (draft) {
      if (Array.isArray(draft.buktiPerbaikan) && draft.buktiPerbaikan.length === fotoTemuan.length) {
        setBuktiPerbaikan(draft.buktiPerbaikan);
      }
      if (Array.isArray(draft.ketPerbaikan) && draft.ketPerbaikan.length === fotoTemuan.length) {
        setKetPerbaikan(draft.ketPerbaikan);
      }
    }
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspeksi.id]);

  // Auto-save draft setiap ada perubahan
  useEffect(() => {
    if (!ready) return;
    saveDraft(inspeksi.id, { buktiPerbaikan, ketPerbaikan });
  }, [ready, buktiPerbaikan, ketPerbaikan, inspeksi.id]);

  const setFotosAt = (idx) => (fotos) => {
    setBuktiPerbaikan((prev) => prev.map((f, i) => i === idx ? fotos : f));
  };
  const setKetAt = (idx) => (val) => {
    setKetPerbaikan((prev) => prev.map((k, i) => i === idx ? val : k));
  };

  const jumlahLengkap = buktiPerbaikan.filter((fotos) => fotos.length > 0).length;
  const semuaLengkap  = fotoTemuan.length > 0
    && jumlahLengkap === fotoTemuan.length
    && ketPerbaikan.every((k) => k.trim());

  // Validasi lalu masuk ke layar Ringkasan — belum benar-benar kirim di sini.
  const handleTinjau = () => {
    const e = {};
    buktiPerbaikan.forEach((fotos, i) => {
      if (!fotos || fotos.length === 0) e[`bukti_${i}`] = true;
      if (!ketPerbaikan[i]?.trim()) e[`ket_${i}`] = true;
    });
    setErrors(e);
    if (Object.keys(e).length > 0) {
      alert(`Semua foto bukti perbaikan beserta keterangannya wajib diisi (${jumlahLengkap}/${fotoTemuan.length}).`);
      return;
    }
    setStep("ringkasan");
  };

  // Submit sesungguhnya — dipanggil dari layar Ringkasan.
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Catatan gabungan (untuk kolom "catatan" di tindaklanjut_hse) dirangkai
      // dari keterangan tiap grup temuan, supaya riwayat tetap tersimpan ringkas.
      const catatanGabungan = ketPerbaikan
        .map((k, i) => `Temuan ${i + 1}: ${k.trim()}`)
        .join("\n");

      const { error: tlErr } = await supabase.from("tindaklanjut_hse").insert([{
        inspeksi_hse_id: inspeksi.id,
        user_id:         user.id,
        catatan:         catatanGabungan,
        status:          "selesai",
      }]);
      if (tlErr) throw tlErr;

      // Setiap grup temuan bisa punya beberapa foto bukti perbaikan (angle
      // berbeda) — diratakan jadi satu baris per foto, dengan `temuan_index`
      // yang sama dengan grup temuan asalnya supaya nanti tetap bisa
      // dikelompokkan lagi kalau riwayat ini dibuka ulang, dan `jenis:
      // "perbaikan"` supaya tidak tercampur dengan foto temuan asli.
      const fotoRows = buktiPerbaikan.flatMap((fotos, idx) =>
        fotos.map((f) => ({
          inspeksi_hse_id: inspeksi.id,
          url:             f.url,
          keterangan:      `Bukti perbaikan temuan ${idx + 1}: ${ketPerbaikan[idx].trim()}`,
          temuan_index:    idx,
          jenis:           "perbaikan",
        }))
      );
      const { error: fotoErr } = await supabase.from("foto_inspeksi_hse").insert(fotoRows);
      if (fotoErr) throw fotoErr;

      await supabase.from("inspeksi_hse").update({ status: "selesai" }).eq("id", inspeksi.id);

      clearDraft(inspeksi.id);

      alert("✅ Tindak lanjut berhasil disimpan!");
      onSelesai();
    } catch (err) {
      alert("Gagal menyimpan: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── STEP RINGKASAN — tinjau ulang semua sebelum benar-benar dikirim ───────
  if (step === "ringkasan") {
    return (
      <div style={{ minHeight: "100vh", background: theme.bg, display: "flex", flexDirection: "column" }}>
        <div style={{ background: theme.surface, padding: "48px 16px 16px", borderBottom: `1px solid ${theme.border}`, boxShadow: theme.shadow }}>
          <div onClick={() => goBack(() => setStep("form"))} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14, cursor: "pointer", color: theme.textSub, fontSize: 13 }}>
            <Icon name="arrow" size={16} color={theme.textSub} /> Kembali & Edit
          </div>
          <div style={{ fontWeight: 800, fontSize: 18, color: theme.text }}>Ringkasan Sebelum Kirim</div>
          <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 2 }}>
            {inspeksi.nomor_polisi} · {inspeksi.transportir}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px", paddingBottom: 100 }}>
          <div style={{
            marginBottom: 16, padding: "14px 16px", borderRadius: 14, textAlign: "center",
            background: "#D1FAE5", color: theme.success, fontWeight: 800, fontSize: 15,
          }}>
            ✅ SEMUA TEMUAN SUDAH DIPERBAIKI ({fotoTemuan.length}/{fotoTemuan.length})
          </div>

          <SectionLabel>Detail Perbaikan</SectionLabel>
          {fotoTemuan.map((t, idx) => (
            <div key={t.temuan_index} style={{
              marginBottom: 14, padding: 12, borderRadius: 12,
              background: theme.surface, border: `1px solid ${theme.border}`,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: theme.text, marginBottom: 8 }}>
                Temuan {idx + 1} <span style={{ fontWeight: 400, color: theme.textMuted }}>({t.fotos.length} foto temuan · {buktiPerbaikan[idx].length} foto perbaikan)</span>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: theme.danger, marginBottom: 4, fontWeight: 700 }}>SEBELUM</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {t.fotos.map((f, fIdx) => (
                      <img
                        key={f.id || fIdx} src={f.url} alt="temuan" onClick={() => setPreviewUrl(f.url)}
                        style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 8, cursor: "pointer" }}
                      />
                    ))}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: theme.success, marginBottom: 4, fontWeight: 700 }}>SESUDAH</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {buktiPerbaikan[idx].map((f, fIdx) => (
                      <img
                        key={f.path || fIdx} src={f.url} alt="perbaikan" onClick={() => setPreviewUrl(f.url)}
                        style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 8, cursor: "pointer" }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 12, color: theme.textSub, background: theme.surfaceAlt, padding: "8px 10px", borderRadius: 8, marginTop: 8 }}>
                {ketPerbaikan[idx]}
              </div>
            </div>
          ))}

          <div style={{ fontSize: 12, color: theme.textMuted, textAlign: "center", marginTop: 4 }}>
            Pastikan semua data sudah benar. Data tidak dapat diedit setelah dikirim.
          </div>
        </div>

        <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, padding: "12px 16px", background: theme.surface, borderTop: `1px solid ${theme.border}`, display: "flex", gap: 10 }}>
          <Btn onClick={() => goBack(() => setStep("form"))} variant="ghost" style={{ flex: 1 }} disabled={submitting}>
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

  // ── STEP FORM — isi bukti perbaikan tiap grup temuan ───────────────────────
  return (
    <div style={{ minHeight: "100vh", background: theme.bg, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ background: theme.surface, padding: "48px 16px 16px", borderBottom: `1px solid ${theme.border}`, boxShadow: theme.shadow }}>
        <div onClick={() => goBack(onBack)} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14, cursor: "pointer", color: theme.textSub, fontSize: 13 }}>
          <Icon name="arrow" size={16} color={theme.textSub} /> Kembali
        </div>
        <div style={{ fontWeight: 800, fontSize: 18, color: theme.text }}>Tindak Lanjut Uji Kedap</div>
        <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 2 }}>
          {inspeksi.nomor_polisi} · {inspeksi.transportir}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px", paddingBottom: 100 }}>
        {/* Info kendaraan */}
        <div style={{ padding: "10px 14px", borderRadius: 10, background: theme.primaryLight, marginBottom: 20, fontSize: 12, color: theme.primary, fontWeight: 600 }}>
          📋 {inspeksi.kapasitas_mt} · {inspeksi.jumlah_kompartemen} kompartemen · {inspeksi.kategori_mt === "merah_putih" ? "MT Merah Putih" : "MT Industri"}
          {" · "}{new Date(inspeksi.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
        </div>

        <SectionLabel>Temuan Uji Kedap ({fotoTemuan.length} temuan) — Bukti Perbaikan ({jumlahLengkap}/{fotoTemuan.length})</SectionLabel>

        {fotoTemuan.length === 0 ? (
          <Card style={{ padding: 20, textAlign: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: theme.textMuted }}>Tidak ada foto temuan tercatat</div>
          </Card>
        ) : (
          <div style={{ marginBottom: 20 }}>
            {fotoTemuan.map((t, idx) => (
              <div key={t.temuan_index} style={{
                marginBottom: 14, padding: 12, borderRadius: 12,
                background: theme.surface, border: `1.5px solid ${theme.danger}`,
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: theme.danger, marginBottom: 8 }}>
                  📌 Temuan {idx + 1} <span style={{ fontWeight: 400 }}>({t.fotos.length} foto dokumentasi)</span>
                </div>

                {/* Semua foto dokumentasi temuan ini (angle-angle dari kondisi
                    yang sama, sesuai yang diambil di form Pengecekan) — bukan
                    dipecah jadi kartu terpisah lagi. */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                  {t.fotos.map((f, fIdx) => (
                    <img
                      key={f.id || fIdx}
                      src={f.url}
                      alt="temuan"
                      onClick={() => setPreviewUrl(f.url)}
                      style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 8, cursor: "pointer" }}
                    />
                  ))}
                </div>

                <div style={{ fontSize: 12, color: theme.textSub, background: theme.surfaceAlt, padding: "8px 10px", borderRadius: 8, fontStyle: "italic", marginBottom: 4 }}>
                  Temuan: "{t.keterangan}"
                </div>

                {/* Foto bukti perbaikan (boleh banyak angle) + keterangan
                    sendiri — wajib, dipasangkan dengan grup temuan ini */}
                <RepairPhotoGroup
                  index={idx}
                  fotos={buktiPerbaikan[idx]}
                  keterangan={ketPerbaikan[idx]}
                  onFotos={setFotosAt(idx)}
                  onKeterangan={setKetAt(idx)}
                  onPreview={setPreviewUrl}
                  errorFoto={!!errors[`bukti_${idx}`]}
                  errorKet={!!errors[`ket_${idx}`]}
                  requestAccess={requestAccess}
                  kategoriPrefix={`${inspeksi.nomor_polisi}_${idx}`}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{
        position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: 430, padding: "12px 16px",
        background: theme.surface, borderTop: `1px solid ${theme.border}`,
      }}>
        <Btn onClick={handleTinjau} variant="primary" icon="check" disabled={submitting || !semuaLengkap}>
          Tinjau & Kirim ({jumlahLengkap}/{fotoTemuan.length} temuan) →
        </Btn>
      </div>

      <PhotoLightbox url={previewUrl} onClose={() => setPreviewUrl(null)} />
    </div>
  );
};

// ── HSETindakLanjut — list inspeksi yang perlu ditindaklanjuti ────────────────
const HSETindakLanjut = ({ onBack, onNav }) => {
  const isDesktop = useBreakpoint();
  const [view,       setView]       = useState("list");
  const [selected,   setSelected]   = useState(null);
  const [fotoTemuan, setFotoTemuan] = useState([]);
  const [list,       setList]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [role,       setRole]       = useState(null);

  // Nomor polisi yang pernah gagal uji kedap lebih dari 1 kali — ditandai "Berulang"
  const [repeatSet, setRepeatSet] = useState(new Set());

  // Tombol back HP di layar "detail" mundur ke "list" dulu (bukan langsung
  // keluar ke Beranda). Tombol "Kembali" versi UI di TindakLanjutDetail sudah
  // dibuat memanggil goBack(onBack) supaya lewat jalur history yang sama.
  useBackableView(view === "detail", () => setView("list"));

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      setRole(profile?.role);

      // Kendaraan yang GAGAL uji kedap dan belum ditindaklanjuti.
      // Setelah tindak lanjut disimpan, status berubah jadi "selesai" sehingga
      // otomatis hilang dari daftar ini (query difilter status === "tidak_lulus").
      const { data: inspeksiData, error } = await supabase
        .from("inspeksi_hse")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_submitted", true)
        .eq("status", "tidak_lulus")
        .order("created_at", { ascending: false });

      if (error) console.error("Error load inspeksi_hse:", error);

      setList(inspeksiData || []);

      // Cek kendaraan yang berulang kali gagal uji kedap (riwayat > 1 kali gagal)
      const plates = [...new Set((inspeksiData || []).map((i) => i.nomor_polisi))];
      if (plates.length > 0) {
        const { data: histData } = await supabase
          .from("inspeksi_hse")
          .select("nomor_polisi, status")
          .eq("user_id", user.id)
          .in("nomor_polisi", plates)
          .in("status", ["tidak_lulus", "selesai"]);

        const counts = {};
        (histData || []).forEach((h) => {
          counts[h.nomor_polisi] = (counts[h.nomor_polisi] || 0) + 1;
        });
        const repeats = new Set(Object.keys(counts).filter((k) => counts[k] > 1));
        setRepeatSet(repeats);
      }

      setLoading(false);
    };

    loadData();
  }, []);

  const handlePilih = async (insp) => {
    // Ambil hanya foto TEMUAN asli (jenis = "temuan") — foto bukti perbaikan
    // (jenis = "perbaikan") tidak ikut, karena itu ditambahkan belakangan di
    // layar ini sendiri.
    const { data: fotoData, error } = await supabase
      .from("foto_inspeksi_hse")
      .select("*")
      .eq("inspeksi_hse_id", insp.id)
      .eq("jenis", "temuan")
      .order("temuan_index", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) console.error("Error load foto_inspeksi_hse:", error);

    // Kelompokkan ulang foto per temuan_index — supaya beberapa foto (angle
    // berbeda) yang diambil untuk SATU temuan yang sama saat Pengecekan tetap
    // tergabung jadi satu kartu "Temuan", persis seperti aslinya di
    // HSEFormScreen.jsx — bukan terpecah jadi satu temuan per foto.
    const groups = [];
    (fotoData || []).forEach((f) => {
      const idx = f.temuan_index ?? 0;
      let group = groups.find((g) => g.temuan_index === idx);
      if (!group) {
        group = { temuan_index: idx, keterangan: f.keterangan, fotos: [] };
        groups.push(group);
      }
      group.fotos.push(f);
    });
    groups.sort((a, b) => a.temuan_index - b.temuan_index);

    setSelected(insp);
    setFotoTemuan(groups);
    setView("detail");
  };

  const handleSelesai = () => {
    setView("list");
    setList((p) => p.filter((i) => i.id !== selected.id));
    setSelected(null);
    setFotoTemuan([]);
  };

  if (view === "detail" && selected) {
    return (
      <TindakLanjutDetail
        inspeksi={selected}
        fotoTemuan={fotoTemuan}
        onBack={() => setView("list")}
        onSelesai={handleSelesai}
      />
    );
  }

  return (
    <div style={{
      minHeight: "100vh", background: theme.bg,
      paddingBottom: isDesktop ? 0 : 80,
      marginLeft: isDesktop ? SIDEBAR_WIDTH : 0,
    }}>
      {/* Header */}
      <div style={{ background: theme.surface, padding: "48px 16px 16px", borderBottom: `1px solid ${theme.border}`, boxShadow: theme.shadow }}>
        <div onClick={() => onNav("dashboard")} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14, cursor: "pointer", color: theme.textSub, fontSize: 13 }}>
          <Icon name="arrow" size={16} color={theme.textSub} /> Kembali
        </div>
        <div style={{ fontWeight: 800, fontSize: 18, color: theme.text }}>Tindak Lanjut</div>
        <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 2 }}>Uji Kedap yang perlu ditindaklanjuti</div>
      </div>

      <div style={{ padding: "20px 16px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: theme.textMuted }}>Memuat data...</div>
        ) : list.length === 0 ? (
          <Card style={{ padding: 32, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: theme.text, marginBottom: 6 }}>
              Semua sudah ditindaklanjuti
            </div>
            <div style={{ fontSize: 13, color: theme.textMuted }}>
              Tidak ada kendaraan tidak lulus yang menunggu tindak lanjut
            </div>
          </Card>
        ) : (
          <>
            <SectionLabel>Perlu Ditindaklanjuti ({list.length})</SectionLabel>
            {list.map((insp) => (
              <Card
                key={insp.id}
                onClick={() => handlePilih(insp)}
                style={{ marginBottom: 12, padding: "14px 16px", cursor: "pointer" }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 12, background: theme.dangerLight,
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                      <Icon name="wrench" size={20} color={theme.danger} />
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: theme.text }}>{insp.nomor_polisi}</div>
                        {repeatSet.has(insp.nomor_polisi) && (
                          <div style={{
                            fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20,
                            background: "#FEF3C7", color: "#D97706",
                          }}>
                            ⚠️ Berulang
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>{insp.transportir}</div>
                      <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 1 }}>
                        {insp.kapasitas_mt} · {insp.kategori_mt === "merah_putih" ? "Merah Putih" : "Industri"}
                      </div>
                      <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 1 }}>
                        {new Date(insp.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20, background: theme.dangerLight, color: theme.danger }}>
                      Tidak Lulus
                    </div>
                    <Icon name="chevron" size={14} color={theme.textMuted} />
                  </div>
                </div>
              </Card>
            ))}
          </>
        )}
      </div>

      <BottomNav active="tindak-lanjut" onNav={onNav} role={role} />
    </div>
  );
};

export default HSETindakLanjut;