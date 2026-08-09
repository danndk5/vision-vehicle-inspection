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
import { useBackableView, goBack, pushHistoryStep } from "../hooks/useBackableView";

// ── Draft persistence per inspeksi — agar data tidak hilang kalau app ke-close ──
const draftKey = (inspeksiId) => `teknisi_tl_draft_${inspeksiId}`;
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

// ── Helpers timestamp & GPS (sama seperti FormScreen/HSETindakLanjut) ─────────
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

// ── applyOverlay — resize maks 1600px + fix EXIF rotasi + overlay timestamp
// server & GPS. Dipakai untuk foto bukti perbaikan supaya konsisten dengan
// foto temuan asli dari FormScreen (sama-sama ada bukti waktu & lokasi). ─────
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
  const fileName = `teknisi-tl-${kategori}-${Date.now()}.jpg`;
  const { data, error } = await supabase.storage
    .from("foto-inspeksi").upload(fileName, blob, { contentType: "image/jpeg" });
  if (error) throw new Error("Foto gagal diupload: " + error.message);
  const { data: pub } = supabase.storage.from("foto-inspeksi").getPublicUrl(data.path);
  return { name: fileName, url: pub.publicUrl, path: data.path };
};

// ── Label display per field abnormal ────────────────────────────────────────
const FIELD_LABELS = {
  status_gps:              "Status GPS",
  segel_gps:               "Segel GPS",
  kabel_gps:               "Kabel GPS",
  status_cctv_dashcam:     "Status CCTV Dashcam",
  segel_bricket_dashcam:   "Segel Bricket CCTV Dashcam",
  segel_kabel_dashcam:     "Segel Sambungan Kabel CCTV Dashcam",
  status_cctv_kanan:       "Status CCTV Kanan",
  segel_bricket_kanan:     "Segel Bricket CCTV Kanan",
  segel_kabel_kanan:       "Segel Sambungan Kabel CCTV Kanan",
  status_cctv_kiri:        "Status CCTV Kiri",
  segel_bricket_kiri:      "Segel Bricket CCTV Kiri",
  segel_kabel_kiri:        "Segel Sambungan Kabel CCTV Kiri",
  segel_kotak_sekring:     "Segel Kotak Sekring",
};

const KET_FIELDS = {
  segel_gps:             "segel_gps_ket",
  kabel_gps:             "kabel_gps_ket",
  segel_bricket_dashcam: "segel_bricket_dashcam_ket",
  segel_kabel_dashcam:   "segel_kabel_dashcam_ket",
  segel_bricket_kanan:   "segel_bricket_kanan_ket",
  segel_kabel_kanan:     "segel_kabel_kanan_ket",
  segel_bricket_kiri:    "segel_bricket_kiri_ket",
  segel_kabel_kiri:      "segel_kabel_kiri_ket",
};

// Pemetaan nama kolom di tabel `inspeksi` → nilai `kategori` foto yang dipakai
// FormScreen.jsx saat upload ke tabel `foto_inspeksi`. Tanpa peta ini, foto
// dokumentasi temuan tidak akan pernah bisa ditemukan/ditampilkan di sini.
const FIELD_TO_KATEGORI = {
  status_gps:             "gps_status",
  segel_gps:              "gps_segel",
  kabel_gps:              "gps_kabel",
  status_cctv_dashcam:    "cctv_dashcam_status",
  segel_bricket_dashcam:  "cctv_dashcam_bricket",
  segel_kabel_dashcam:    "cctv_dashcam_kabel",
  status_cctv_kanan:      "cctv_kanan_status",
  segel_bricket_kanan:    "cctv_kanan_bricket",
  segel_kabel_kanan:      "cctv_kanan_kabel",
  status_cctv_kiri:       "cctv_kiri_status",
  segel_bricket_kiri:     "cctv_kiri_bricket",
  segel_kabel_kiri:       "cctv_kiri_kabel",
  segel_kotak_sekring:    "segel_kotak_sekring",
};

// Ambil semua field yang abnormal/tidak aktif dari satu inspeksi. `fotoMap`
// (kategori → [urls], hasil query foto_inspeksi) opsional — dipakai untuk
// melampirkan SEMUA foto dokumentasi temuan (bisa lebih dari 1 sudut/angle)
// ke tiap item saat di layar Detail.
const getAbnormalItems = (insp, fotoMap = {}) => {
  const items = [];
  const statusFields = [
    "status_gps", "status_cctv_dashcam", "status_cctv_kanan",
    "status_cctv_kiri", "segel_kotak_sekring",
  ];
  const normalAbnormalFields = [
    "segel_gps", "kabel_gps",
    "segel_bricket_dashcam", "segel_kabel_dashcam",
    "segel_bricket_kanan",   "segel_kabel_kanan",
    "segel_bricket_kiri",    "segel_kabel_kiri",
  ];

  statusFields.forEach((f) => {
    if (insp[f] === "Tidak Aktif") {
      items.push({ field: f, label: FIELD_LABELS[f], nilai: insp[f], ket: null, fotoTemuanList: fotoMap[FIELD_TO_KATEGORI[f]] || [] });
    }
  });
  normalAbnormalFields.forEach((f) => {
    if (insp[f]?.toLowerCase() === "abnormal") {
      const ketField = KET_FIELDS[f];
      items.push({ field: f, label: FIELD_LABELS[f], nilai: insp[f], ket: ketField ? insp[ketField] : null, fotoTemuanList: fotoMap[FIELD_TO_KATEGORI[f]] || [] });
    }
  });
  return items;
};

// ── PhotoLightbox — preview full-screen. Hanya tombol back HP (via
// useBackableView) yang bisa menutup ini — tidak ada tombol ❌ atau
// tap-backdrop-untuk-tutup, sama seperti pola FormScreen/HSETindakLanjut. ───
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

// ── RepairPhotoCapture — foto bukti perbaikan, JUMLAH BEBAS/TIDAK DIBATASI
// per item (beberapa angle boleh). Dilengkapi thumbnail + tap-untuk-preview
// (fix bug #2), dan upload lewat uploadFoto() yang sudah resize maks 1600px
// + fix EXIF + overlay GPS/waktu (fix bug #3), bukan upload file mentah
// seperti sebelumnya. Label tombol berubah jadi "Tambah Foto Lagi" begitu
// sudah ada minimal 1 foto, supaya jelas bisa terus ditambah. ───────────────
const RepairPhotoCapture = ({ kategori, photos, onPhotos, onPreview, errorFoto, requestAccess }) => {
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
      const result = await uploadFoto(file, kategori, cachedPosRef.current);
      onPhotos((p) => [...p, result]);
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
    <div style={{ marginTop: 10 }}>
      {permErr && (
        <div style={{ marginBottom: 8, padding: "6px 10px", borderRadius: 8, background: theme.dangerLight, color: theme.danger, fontSize: 12, fontWeight: 600 }}>
          ⛔ {permErr}
        </div>
      )}
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
        onChange={handleFileChange} style={{ display: "none" }} />
      <Btn onClick={handleCaptureClick} variant="outline"
        style={{ fontSize: 12, padding: "7px 12px", width: "100%" }}
        disabled={isWorking}>
        {capState === "checking" ? "🔐 Cek izin..." : capState === "processing" ? "⏳ Memproses..." : photos.length > 0 ? "📷 Tambah Foto Lagi" : "📷 Foto Bukti Perbaikan"}
      </Btn>
      {photos.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {photos.map((p) => (
            <div key={p.path} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "6px 8px", background: theme.primaryLight, borderRadius: 8,
            }}>
              <img
                src={p.url}
                alt={p.name}
                onClick={() => onPreview?.(p.url)}
                style={{ width: 40, height: 40, borderRadius: 6, objectFit: "cover", cursor: "pointer", flexShrink: 0, border: `1px solid ${theme.border}` }}
              />
              <div onClick={() => onPreview?.(p.url)} style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
                <div style={{ fontSize: 11, color: theme.primary, fontWeight: 600 }}>✓ Tersimpan</div>
                <div style={{ fontSize: 10, color: theme.textMuted }}>Ketuk untuk lihat penuh (cek blur)</div>
              </div>
              <div onClick={() => removePhoto(p.path)}
                style={{ cursor: "pointer", fontWeight: 700, color: theme.danger, padding: "4px 8px", flexShrink: 0 }}>✕</div>
            </div>
          ))}
        </div>
      )}
      {errorFoto && (
        <div style={{ marginTop: 6, fontSize: 11, color: theme.danger, fontWeight: 600 }}>⚠️ Minimal 1 foto bukti perbaikan wajib diambil.</div>
      )}
    </div>
  );
};

// ── TindakLanjutDetail — form per inspeksi ───────────────────────────────────
// Alur sekarang 2 step (sama pola dengan HSETindakLanjut): "form" → isi bukti
// perbaikan tiap item, lalu "ringkasan" → tinjau ulang semua sebelum kirim.
const TindakLanjutDetail = ({ inspeksi, fotoTemuanMap, onBack, onSelesai }) => {
  const abnormalItems = getAbnormalItems(inspeksi, fotoTemuanMap);

  const [step,        setStep]        = useState("form"); // "form" | "ringkasan"
  const [catatanMap,  setCatatanMap]  = useState({}); // field → catatan
  const [photosMap,   setPhotosMap]   = useState({}); // field → [{name,url,path}]
  const [errors,      setErrors]      = useState({});
  const [submitting,  setSubmitting]  = useState(false);
  const [ready,       setReady]       = useState(false);
  const [previewUrl,  setPreviewUrl]  = useState(null);

  const submittedRef = useRef(false);
  const photosMapRef = useRef(photosMap);
  useEffect(() => { photosMapRef.current = photosMap; }, [photosMap]);

  // GPS/kamera di-"hangat"-kan sejak layar tindak lanjut ini dibuka — supaya
  // foto bukti perbaikan tiap item terasa instan (posisi sudah di tangan).
  const { warmUp, coolDown, requestAccess } = useCameraGPS();
  useEffect(() => {
    warmUp();
    return () => coolDown();
  }, [warmUp, coolDown]);

  // Pulihkan draft (catatan + foto per item) kalau app sempat ke-close
  useEffect(() => {
    const draft = loadDraft(inspeksi.id);
    if (draft) {
      if (draft.catatanMap) setCatatanMap(draft.catatanMap);
      if (draft.photosMap) setPhotosMap(draft.photosMap);
    }
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspeksi.id]);

  // Auto-save draft setiap ada perubahan
  useEffect(() => {
    if (!ready) return;
    saveDraft(inspeksi.id, { catatanMap, photosMap });
  }, [ready, catatanMap, photosMap, inspeksi.id]);

  // Cleanup: layar ditinggalkan tanpa submit → foto bukti perbaikan yang
  // sudah keburu diupload dihapus lagi dari storage supaya tidak nyangkut
  // jadi orphan. Draft TIDAK dihapus di sini — biar tetap bisa dipulihkan
  // kalau user balik lagi (sama seperti pola FormScreen).
  useEffect(() => {
    return () => {
      if (!submittedRef.current) {
        const paths = Object.values(photosMapRef.current).flat().map((p) => p.path).filter(Boolean);
        if (paths.length) supabase.storage.from("foto-inspeksi").remove(paths).catch(console.error);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setFieldPhotos = (field) => (updater) =>
    setPhotosMap((p) => ({ ...p, [field]: typeof updater === "function" ? updater(p[field] || []) : updater }));

  // Validasi lalu masuk ke layar Ringkasan — belum benar-benar kirim di sini.
  const handleTinjau = () => {
    const e = {};
    abnormalItems.forEach(({ field }) => {
      if (!catatanMap[field]?.trim()) e[`catatan_${field}`] = true;
      if (!(photosMap[field] && photosMap[field].length > 0)) e[`foto_${field}`] = true;
    });
    setErrors(e);
    if (Object.keys(e).length > 0) {
      alert("Semua item wajib diisi keterangan tindak lanjut dan minimal 1 foto bukti perbaikan.");
      return;
    }
    pushHistoryStep(() => setStep("form"));
    setStep("ringkasan");
  };

  // Submit sesungguhnya — dipanggil dari layar Ringkasan.
  // Rollback manual: kalau insert foto_perbaikan gagal SETELAH baris
  // laporan_perbaikan (dan/atau tugas_perbaikan baru) terlanjur terbuat,
  // baris-baris itu langsung dihapus lagi supaya tidak ada data setengah
  // jadi yang nyangkut — sama seperti pola FormScreen/HSEFormScreen.
  // tugas_perbaikan HANYA dihapus kalau memang baru dibuat di percobaan
  // submit ini (bukan yang sudah ada sebelumnya dan dipakai ulang).
  const handleSubmit = async () => {
    setSubmitting(true);
    let tugasId = inspeksi._tugasId;
    let tugasCreatedNow = false;
    let laporanData = null;
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!tugasId) {
        const { data: tugasData, error: tugasErr } = await supabase
          .from("tugas_perbaikan")
          .insert([{
            inspeksi_id:      inspeksi.id,
            mekanik_id:       user.id,
            ditugaskan_oleh:  user.id,
            catatan_tugas:    "Tindak lanjut mandiri oleh teknisi",
            status:           "dikerjakan",
          }])
          .select().single();
        if (tugasErr) throw tugasErr;
        tugasId = tugasData.id;
        tugasCreatedNow = true;
      }

      const catatanGabungan = abnormalItems
        .map(({ field, label }) => `${label}: ${catatanMap[field] || "-"}`)
        .join("\n");

      const { data: lapData, error: laporanErr } = await supabase
        .from("laporan_perbaikan")
        .insert([{ tugas_id: tugasId, catatan_perbaikan: catatanGabungan }])
        .select().single();
      if (laporanErr) throw laporanErr;
      laporanData = lapData;

      const allPhotos = Object.values(photosMap).flat();
      if (allPhotos.length > 0) {
        const { error: fotoErr } = await supabase.from("foto_perbaikan").insert(
          allPhotos.map((p) => ({ laporan_id: laporanData.id, url: p.url }))
        );
        if (fotoErr) throw fotoErr;
      }

      await supabase.from("tugas_perbaikan").update({ status: "selesai" }).eq("id", tugasId);
      await supabase.from("inspeksi").update({ status: "selesai" }).eq("id", inspeksi.id);

      // Semua insert berhasil — baru sekarang dianggap benar-benar tersimpan.
      submittedRef.current = true;
      clearDraft(inspeksi.id);
      alert("✅ Tindak lanjut berhasil disimpan!");
      onSelesai();
    } catch (err) {
      // Rollback manual — hanya buang yang dibuat DI PERCOBAAN INI.
      if (laporanData?.id) {
        await supabase.from("laporan_perbaikan").delete().eq("id", laporanData.id).catch(() => {});
      }
      if (tugasCreatedNow && tugasId) {
        await supabase.from("tugas_perbaikan").delete().eq("id", tugasId).catch(() => {});
      }
      alert("Gagal menyimpan: " + err.message + "\n\nData belum tersimpan. Silakan coba kirim ulang.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── STEP RINGKASAN — tinjau ulang semua sebelum benar-benar dikirim ───────
  if (step === "ringkasan") {
    return (
      <div style={{ minHeight: "100vh", background: theme.bg, display: "flex", flexDirection: "column" }}>
        <div style={{ background: theme.surface, padding: "48px 16px 16px", borderBottom: `1px solid ${theme.border}`, boxShadow: theme.shadow }}>
          <div onClick={() => window.history.back()} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14, cursor: "pointer", color: theme.textSub, fontSize: 13 }}>
            <Icon name="arrow" size={16} color={theme.textSub} /> Kembali & Edit
          </div>
          <div style={{ fontWeight: 800, fontSize: 18, color: theme.text }}>Ringkasan Sebelum Kirim</div>
          <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 2 }}>
            {inspeksi.nomor_polisi} · {inspeksi.perusahaan_transportir}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px", paddingBottom: 100 }}>
          <div style={{
            marginBottom: 16, padding: "14px 16px", borderRadius: 14, textAlign: "center",
            background: "#D1FAE5", color: theme.success, fontWeight: 800, fontSize: 15,
          }}>
            ✅ SEMUA TEMUAN SUDAH DITINDAKLANJUTI ({abnormalItems.length}/{abnormalItems.length})
          </div>

          <SectionLabel>Detail Perbaikan</SectionLabel>
          {abnormalItems.map(({ field, label, nilai, ket, fotoTemuanList }) => (
            <div key={field} style={{
              marginBottom: 14, padding: 12, borderRadius: 12,
              background: theme.surface, border: `1px solid ${theme.border}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: theme.text, flex: 1 }}>{label}</div>
                <div style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: theme.dangerLight, color: theme.danger, flexShrink: 0, marginLeft: 8 }}>
                  {nilai}
                </div>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: theme.danger, marginBottom: 4, fontWeight: 700 }}>SEBELUM (Temuan)</div>
                  {fotoTemuanList.length > 0 ? (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {fotoTemuanList.map((url) => (
                        <img
                          key={url} src={url} alt="temuan" onClick={() => setPreviewUrl(url)}
                          style={{ width: 42, height: 42, objectFit: "cover", borderRadius: 6, cursor: "pointer" }}
                        />
                      ))}
                    </div>
                  ) : (
                    <div style={{ width: "100%", height: 90, borderRadius: 8, background: theme.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: theme.textMuted }}>
                      Tidak ada foto
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: theme.success, marginBottom: 4, fontWeight: 700 }}>
                    SESUDAH ({(photosMap[field] || []).length} foto)
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {(photosMap[field] || []).map((p) => (
                      <img
                        key={p.path} src={p.url} alt="perbaikan" onClick={() => setPreviewUrl(p.url)}
                        style={{ width: 42, height: 42, objectFit: "cover", borderRadius: 6, cursor: "pointer" }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {ket && (
                <div style={{ fontSize: 11, color: theme.textSub, background: theme.surfaceAlt, padding: "7px 9px", borderRadius: 8, marginTop: 8, fontStyle: "italic" }}>
                  Temuan: "{ket}"
                </div>
              )}
              <div style={{ fontSize: 12, color: theme.textSub, background: theme.surfaceAlt, padding: "8px 10px", borderRadius: 8, marginTop: 6 }}>
                {catatanMap[field]}
              </div>
            </div>
          ))}

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

  // ── STEP FORM — isi bukti perbaikan tiap temuan ────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: theme.bg, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ background: theme.surface, padding: "48px 16px 16px", borderBottom: `1px solid ${theme.border}`, boxShadow: theme.shadow }}>
        <div onClick={() => goBack(onBack)} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14, cursor: "pointer", color: theme.textSub, fontSize: 13 }}>
          <Icon name="arrow" size={16} color={theme.textSub} /> Kembali
        </div>
        <div style={{ fontWeight: 800, fontSize: 18, color: theme.text }}>Tindak Lanjut</div>
        <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 2 }}>
          {inspeksi.nomor_polisi} · {inspeksi.perusahaan_transportir}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px", paddingBottom: 100 }}>
        {/* Info tanggal pengecekan */}
        <div style={{ padding: "10px 14px", borderRadius: 10, background: theme.primaryLight, marginBottom: 20, fontSize: 12, color: theme.primary, fontWeight: 600 }}>
          📋 Pengecekan: {new Date(inspeksi.created_at).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </div>

        <SectionLabel>Item yang Perlu Ditindaklanjuti ({abnormalItems.length})</SectionLabel>

        {abnormalItems.length === 0 ? (
          <Card style={{ padding: 20, textAlign: "center" }}>
            <div style={{ fontSize: 13, color: theme.textMuted }}>Semua item normal ✅</div>
          </Card>
        ) : (
          abnormalItems.map(({ field, label, nilai, ket, fotoTemuanList }) => (
            <div key={field} style={{
              marginBottom: 16, padding: 14, borderRadius: 14,
              background: theme.surface, border: `1.5px solid ${theme.danger}`,
            }}>
              {/* Label & status */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: theme.text, flex: 1 }}>{label}</div>
                <div style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 20, background: theme.dangerLight, color: theme.danger, flexShrink: 0, marginLeft: 8 }}>
                  {nilai}
                </div>
              </div>

              {/* Foto dokumentasi temuan dari FormScreen — bisa lebih dari 1
                  angle per item, ditarik dari tabel foto_inspeksi. */}
              {fotoTemuanList.length > 0 ? (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  {fotoTemuanList.map((url) => (
                    <img
                      key={url}
                      src={url}
                      alt="Foto temuan"
                      onClick={() => setPreviewUrl(url)}
                      style={{ width: 90, height: 90, objectFit: "cover", borderRadius: 8, cursor: "pointer" }}
                    />
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 8, fontStyle: "italic" }}>
                  (Tidak ada foto dokumentasi untuk item ini)
                </div>
              )}

              {/* Keterangan dari form pengecekan */}
              {ket && (
                <div style={{ fontSize: 12, color: theme.textSub, background: theme.surfaceAlt, padding: "8px 10px", borderRadius: 8, marginBottom: 10, fontStyle: "italic" }}>
                  Temuan: "{ket}"
                </div>
              )}

              {/* Input tindak lanjut */}
              <div style={{ fontSize: 12, fontWeight: 600, color: theme.text, marginBottom: 6 }}>
                Tindak Lanjut yang Dilakukan:
              </div>
              <textarea
                placeholder="Jelaskan tindakan yang sudah dilakukan..."
                value={catatanMap[field] || ""}
                onChange={(e) => setCatatanMap((p) => ({ ...p, [field]: e.target.value }))}
                style={{
                  width: "100%", padding: "10px 12px", borderRadius: 10,
                  border: `1.5px solid ${errors[`catatan_${field}`] ? theme.danger : theme.border}`,
                  background: errors[`catatan_${field}`] ? theme.dangerLight : theme.surfaceAlt,
                  color: theme.text, fontSize: 13,
                  fontFamily: "'DM Sans', sans-serif",
                  resize: "none", minHeight: 80, boxSizing: "border-box", outline: "none",
                }}
              />
              {errors[`catatan_${field}`] && (
                <div style={{ fontSize: 12, color: theme.danger, fontWeight: 600, marginTop: 4 }}>
                  ⚠️ Keterangan tindak lanjut wajib diisi.
                </div>
              )}

              {/* Foto bukti perbaikan — jumlah bebas per item */}
              <RepairPhotoCapture
                kategori={`tl_${field}`}
                photos={photosMap[field] || []}
                onPhotos={setFieldPhotos(field)}
                onPreview={setPreviewUrl}
                errorFoto={!!errors[`foto_${field}`]}
                requestAccess={requestAccess}
              />
            </div>
          ))
        )}
      </div>

      {/* Bottom Action */}
      <div style={{
        position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: 430, padding: "12px 16px",
        background: theme.surface, borderTop: `1px solid ${theme.border}`,
      }}>
        <Btn onClick={handleTinjau} variant="primary" icon="check" disabled={submitting || abnormalItems.length === 0}>
          Tinjau & Kirim →
        </Btn>
      </div>

      <PhotoLightbox url={previewUrl} onClose={() => setPreviewUrl(null)} />
    </div>
  );
};

// ── TeknisiTindakLanjut — list inspeksi yang perlu ditindaklanjuti ────────────
const TeknisiTindakLanjut = ({ onBack, onNav }) => {
  const isDesktop = useBreakpoint();
  const [view,          setView]          = useState("list"); // "list" | "detail"
  const [selected,      setSelected]      = useState(null);
  const [fotoTemuanMap, setFotoTemuanMap] = useState({});
  const [list,          setList]          = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [role,          setRole]          = useState(null);

  // Tombol back HP di layar "detail" mundur ke "list" dulu (bukan langsung
  // keluar ke Beranda). Tombol "Kembali" versi UI di TindakLanjutDetail sudah
  // dibuat memanggil goBack(onBack) supaya lewat jalur history yang sama —
  // sama seperti pola di HSETindakLanjut.jsx.
  useBackableView(view === "detail", () => setView("list"));

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      // Ambil role
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      setRole(profile?.role);

      // Ambil inspeksi milik user yang:
      // 1. Sudah di-submit (is_submitted = true)
      // 2. Status bukan "selesai"
      const { data: inspeksiData, error } = await supabase
        .from("inspeksi")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_submitted", true)
        .neq("status", "selesai")
        .order("created_at", { ascending: false });

      if (error) console.error("Error load inspeksi:", error);

      // Filter hanya yang punya item abnormal
      const withAbnormal = (inspeksiData || []).map((insp) => {
        const items = getAbnormalItems(insp);
        return { ...insp, _abnormalCount: items.length };
      }).filter((insp) => insp._abnormalCount > 0);

      // Cek apakah sudah ada tugas_perbaikan untuk masing-masing
      const inspIds = withAbnormal.map((i) => i.id);
      let tugasMap = {};
      if (inspIds.length > 0) {
        const { data: tugasData } = await supabase
          .from("tugas_perbaikan")
          .select("id, inspeksi_id, status")
          .in("inspeksi_id", inspIds)
          .eq("mekanik_id", user.id);
        (tugasData || []).forEach((t) => { tugasMap[t.inspeksi_id] = t; });
      }

      const enriched = withAbnormal.map((insp) => ({
        ...insp,
        _tugasId:     tugasMap[insp.id]?.id     || null,
        _tugasStatus: tugasMap[insp.id]?.status || null,
      }));

      setList(enriched);
      setLoading(false);
    };

    loadData();
  }, []);

  // Sebelum masuk ke Detail, tarik dulu SEMUA foto dokumentasi temuan dari
  // foto_inspeksi (fix bug #1) — kategori-nya dipetakan lewat FIELD_TO_KATEGORI.
  // Satu kategori bisa punya lebih dari 1 foto (beberapa angle), makanya
  // dikumpulkan jadi array per kategori, bukan ditimpa jadi 1 URL saja.
  const handlePilih = async (insp) => {
    const kategoriList = Object.values(FIELD_TO_KATEGORI);
    const { data: fotoData } = await supabase
      .from("foto_inspeksi")
      .select("kategori, url")
      .eq("inspeksi_id", insp.id)
      .in("kategori", kategoriList);

    const fotoMap = {};
    (fotoData || []).forEach((f) => {
      if (!fotoMap[f.kategori]) fotoMap[f.kategori] = [];
      fotoMap[f.kategori].push(f.url);
    });

    setSelected(insp);
    setFotoTemuanMap(fotoMap);
    setView("detail");
  };

  const handleSelesai = () => {
    // Refresh list setelah selesai
    setView("list");
    setList((p) => p.filter((i) => i.id !== selected.id));
    setSelected(null);
    setFotoTemuanMap({});
  };

  if (view === "detail" && selected) {
    return (
      <TindakLanjutDetail
        inspeksi={selected}
        fotoTemuanMap={fotoTemuanMap}
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
        <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 2 }}>
          Inspeksi yang perlu ditindaklanjuti
        </div>
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
              Tidak ada item abnormal yang menunggu tindak lanjut
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
                      width: 44, height: 44, borderRadius: 12,
                      background: theme.dangerLight,
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                      <Icon name="wrench" size={20} color={theme.danger} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: theme.text }}>
                        {insp.nomor_polisi}
                      </div>
                      <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
                        {insp.perusahaan_transportir}
                      </div>
                      <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 1 }}>
                        {new Date(insp.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    <div style={{
                      fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20,
                      background: theme.dangerLight, color: theme.danger,
                    }}>
                      {insp._abnormalCount} item
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

export default TeknisiTindakLanjut;