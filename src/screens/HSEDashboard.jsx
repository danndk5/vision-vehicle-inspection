import { useState, useEffect, useMemo } from "react";
import BottomNav from "../components/BottomNav";
import Card from "../components/Card";
import Icon from "../components/Icon";
import SectionLabel from "../components/SectionLabel";
import ThemeToggle from "../components/ThemeToggle";
import { useTheme } from "../context/ThemeContext";
import { supabase } from "../lib/supabase";
import { useBackableView, goBack } from "../hooks/useBackableView";

// Lebar tampilan dikunci seukuran HP — role ini cuma dipakai di ponsel
const FRAME_WIDTH = 430;

// ── Helper: label & warna status ──────────────────────────────────────────────
const statusInfo = (status, theme) => {
  if (status === "tidak_lulus") return { label: "Perlu Tindak Lanjut", bg: theme.dangerLight,  color: theme.danger };
  if (status === "selesai")     return { label: "Selesai",             bg: theme.successLight, color: theme.success };
  if (status === "lulus")       return { label: "Lulus",               bg: theme.successLight, color: theme.success };
  return { label: status || "-", bg: theme.surfaceAlt, color: theme.textMuted };
};

// ── Helper: sisa hari sampai tanggal tertentu (negatif = sudah lewat) ─────────
const sisaHari = (tanggal) => {
  if (!tanggal) return null;
  const target = new Date(tanggal);
  target.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target - now) / (1000 * 60 * 60 * 24));
};

const formatTanggalSingkat = (val) => {
  if (!val) return "-";
  try { return new Date(val).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return val; }
};

// ── ExpiryBanner — peringatan masa berlaku Head Truck / Tangki ────────────────
const ExpiryBanner = ({ theme, items, onClick }) => {
  if (items.length === 0) return null;

  return (
    <div
      onClick={onClick}
      style={{
        marginBottom: 20, padding: "14px 16px", borderRadius: 14, cursor: "pointer",
        background: theme.dangerLight, border: `1.5px solid ${theme.danger}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 18 }}>⚠️</span>
        <div style={{ fontWeight: 700, fontSize: 13, color: theme.danger }}>
          {items.length} Kendaraan Perlu Perhatian Masa Berlaku
        </div>
      </div>
      {items.slice(0, 3).map((k) => (
        <div key={k.nomor_polisi + k._jenis} style={{ fontSize: 12, color: theme.danger, marginBottom: 3 }}>
          • {k.nomor_polisi} — {k._jenis} {k._sisaHari < 0 ? `sudah lewat ${Math.abs(k._sisaHari)} hari` : `${k._sisaHari} hari lagi`}
        </div>
      ))}
      {items.length > 3 && (
        <div style={{ fontSize: 11, color: theme.danger, marginTop: 4, fontWeight: 600 }}>
          +{items.length - 3} kendaraan lainnya — ketuk untuk lihat semua
        </div>
      )}
    </div>
  );
};

// ── ExpiryListModal — daftar lengkap kendaraan yang perlu perhatian ───────────
const ExpiryListModal = ({ theme, items, onClose }) => (
  <div
    onClick={() => goBack(onClose)}
    style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 999,
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        width: "100%", maxWidth: FRAME_WIDTH, maxHeight: "80vh", overflowY: "auto",
        background: theme.surface, borderRadius: "20px 20px 0 0", padding: 20,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 16, color: theme.text }}>Masa Berlaku Perlu Perhatian</div>
        <div onClick={() => goBack(onClose)} style={{ cursor: "pointer", fontSize: 18, color: theme.textMuted }}>✕</div>
      </div>
      {items.map((k) => (
        <div key={k.nomor_polisi + k._jenis} style={{
          marginBottom: 10, padding: "10px 12px", borderRadius: 10,
          background: k._sisaHari < 0 ? theme.dangerLight : "#FEF3C7",
        }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: theme.text }}>{k.nomor_polisi}</div>
          <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
            {k._jenis} — berlaku sampai {formatTanggalSingkat(k._tanggal)}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, marginTop: 3, color: k._sisaHari < 0 ? theme.danger : "#D97706" }}>
            {k._sisaHari < 0 ? `⛔ Sudah lewat ${Math.abs(k._sisaHari)} hari` : `⏳ ${k._sisaHari} hari lagi`}
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ── SearchBar — cari cepat nomor polisi dari beranda ──────────────────────────
const SearchBar = ({ theme, value, onChange }) => (
  <div style={{
    display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 12,
    background: theme.surface, border: `1px solid ${theme.border}`, marginBottom: 20,
  }}>
    <Icon name="search" size={16} color={theme.textMuted} />
    <input
      type="text"
      placeholder="Cari nomor polisi..."
      value={value}
      onChange={(e) => onChange(e.target.value.toUpperCase())}
      style={{
        flex: 1, border: "none", outline: "none", background: "transparent",
        color: theme.text, fontSize: 13, fontFamily: "'DM Sans', sans-serif",
      }}
    />
    {value && (
      <div onClick={() => onChange("")} style={{ cursor: "pointer", color: theme.textMuted, fontSize: 14 }}>✕</div>
    )}
  </div>
);


// ── StatCard ─────────────────────────────────────────────────────────────────
const StatCard = ({ value, label, bg, color, onClick }) => (
  <div
    onClick={onClick}
    style={{
      background: bg, borderRadius: 14, padding: "18px 10px",
      textAlign: "center", cursor: "pointer", flex: 1,
      boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
    }}
  >
    <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
    <div style={{ fontSize: 10, color, fontWeight: 600, marginTop: 4, opacity: 0.85, lineHeight: 1.3 }}>
      {label}
    </div>
  </div>
);

// ── InspeksiList ──────────────────────────────────────────────────────────────
const InspeksiList = ({ title, items, onBack, theme }) => (
  <div style={{ minHeight: "100vh", background: theme.bg }}>
    <div style={{ maxWidth: FRAME_WIDTH, margin: "0 auto" }}>
      <div style={{ background: theme.surface, padding: "48px 16px 16px", borderBottom: `1px solid ${theme.border}`, boxShadow: theme.shadow }}>
        <div onClick={() => goBack(onBack)} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14, cursor: "pointer", color: theme.textSub, fontSize: 13 }}>
          <Icon name="arrow" size={16} color={theme.textSub} /> Kembali
        </div>
        <div style={{ fontWeight: 800, fontSize: 18, color: theme.text }}>{title}</div>
        <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 2 }}>{items.length} kendaraan</div>
      </div>
      <div style={{ padding: "20px 16px", paddingBottom: 40 }}>
        {items.length === 0 ? (
          <Card style={{ padding: 32, textAlign: "center", background: theme.surface, borderColor: theme.border }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 14, color: theme.textMuted }}>Belum ada data</div>
          </Card>
        ) : (
          items.map((insp) => {
            const si = statusInfo(insp.status, theme);
            return (
              <Card key={insp.id} style={{ marginBottom: 12, padding: "14px 16px", background: theme.surface, borderColor: theme.border }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12, background: theme.primaryLight,
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    <Icon name="car" size={20} color={theme.primary} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: theme.text }}>{insp.nomor_polisi}</div>
                    <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>{insp.transportir}</div>
                    <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 1 }}>
                      {insp.kapasitas_mt} · {insp.jumlah_kompartemen} kompartemen · {insp.kategori_mt === "merah_putih" ? "MT Merah Putih" : "MT Industri"}
                    </div>
                    <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 1 }}>
                      {new Date(insp.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                    </div>
                  </div>
                  <div style={{
                    fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20,
                    background: si.bg, color: si.color,
                  }}>
                    {si.label}
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  </div>
);

// ── HSEDashboard ──────────────────────────────────────────────────────────────
// Catatan: fitur "pencairan" dan filter periode (minggu/bulan/6 bulan/kustom)
// SENGAJA tidak ada di akun HSE ini — akun ini fokus ke Pengecekan & Tindak
// Lanjut. Filter periode dan pencairan sudah full di-handle di akun Depot.
const HSEDashboard = ({ role, onNav, onLogout }) => {
  const { theme } = useTheme();
  const [view,        setView]        = useState("dashboard");
  const [currentUser, setCurrentUser] = useState(null);
  const [inspeksiAll, setInspeksiAll] = useState([]);
  const [loading,     setLoading]     = useState(true);

  // Cari nomor polisi cepat
  const [searchQuery, setSearchQuery] = useState("");

  // Peringatan masa berlaku Head Truck / Tangki
  const [expiryItems,     setExpiryItems]     = useState([]);
  const [showExpiryModal, setShowExpiryModal] = useState(false);

  // Tombol back HP di daftar kendaraan (Total Diperiksa / Perlu Ditindaklanjuti /
  // Sudah Ditindaklanjuti) mundur ke Beranda dulu — bukan langsung tembus ke luar
  // aplikasi. Tombol "Kembali" versi UI di InspeksiList juga lewat goBack()
  // supaya jalurnya konsisten dengan tombol back HP.
  useBackableView(view !== "dashboard", () => setView("dashboard"));

  // Modal peringatan masa berlaku (ExpiryListModal) juga perlu ditandai —
  // pola bug yang sama kalau tidak: back HP bisa nembus ke luar aplikasi.
  useBackableView(showExpiryModal, () => setShowExpiryModal(false));

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: profile } = await supabase
        .from("profiles").select("nama, perusahaan").eq("id", user.id).single();
      setCurrentUser(profile);

      const { data: inspeksiData } = await supabase
        .from("inspeksi_hse")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      setInspeksiAll(inspeksiData || []);

      // Cek masa berlaku Head Truck & Tangki dari data master kendaraan
      const { data: kendaraanData } = await supabase
        .from("kendaraan")
        .select("nomor_polisi, masa_berlaku_head_truck, masa_berlaku_tangki");

      const warnList = [];
      (kendaraanData || []).forEach((k) => {
        [
          { field: k.masa_berlaku_head_truck, jenis: "Head Truck" },
          { field: k.masa_berlaku_tangki,      jenis: "Tangki"     },
        ].forEach(({ field, jenis }) => {
          if (!field) return;
          const sisa = sisaHari(field);
          if (sisa <= 30) {
            warnList.push({ nomor_polisi: k.nomor_polisi, _jenis: jenis, _tanggal: field, _sisaHari: sisa });
          }
        });
      });
      warnList.sort((a, b) => a._sisaHari - b._sisaHari);
      setExpiryItems(warnList);

      setLoading(false);
    };
    loadData();
  }, []);

  // Terapkan pencarian nomor polisi ke seluruh data (tanpa filter periode —
  // lihat catatan di atas komponen)
  const inspeksiFiltered = useMemo(() => {
    let result = inspeksiAll;
    if (searchQuery.trim()) {
      result = result.filter((i) => i.nomor_polisi?.toUpperCase().includes(searchQuery.trim()));
    }
    return result;
  }, [inspeksiAll, searchQuery]);


  // Status yang tersimpan: "lulus" | "tidak_lulus" | "selesai"
  const perluTindak = inspeksiFiltered.filter((i) => i.status === "tidak_lulus");
  const sudahBeres  = inspeksiFiltered.filter((i) => i.status === "lulus" || i.status === "selesai");

  if (view === "list-all")     return <InspeksiList title="Total Diperiksa"        items={inspeksiFiltered} onBack={() => setView("dashboard")} theme={theme} />;
  if (view === "list-perlu")   return <InspeksiList title="Perlu Ditindaklanjuti"   items={perluTindak}      onBack={() => setView("dashboard")} theme={theme} />;
  if (view === "list-selesai") return <InspeksiList title="Sudah Ditindaklanjuti"   items={sudahBeres}       onBack={() => setView("dashboard")} theme={theme} />;

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: theme.bg, display: "flex", justifyContent: "center", alignItems: "center" }}>
        <div style={{ color: theme.textMuted }}>Memuat data...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: theme.bg }}>
    <div style={{ maxWidth: FRAME_WIDTH, margin: "0 auto", minHeight: "100vh", paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: theme.surface, padding: "48px 20px 20px", borderBottom: `1px solid ${theme.border}`, boxShadow: theme.shadow }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 13, color: theme.textMuted }}>Selamat datang,</div>
            <div style={{ fontSize: 19, fontWeight: 800, color: theme.text }}>{currentUser?.nama || "HSE"}</div>
            <div style={{ display: "inline-block", marginTop: 4, fontSize: 11, fontWeight: 600, padding: "2px 10px", borderRadius: 20, background: "#FEF3C7", color: "#D97706" }}>
              HSE
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ThemeToggle />
            <div onClick={onLogout} style={{ cursor: "pointer", padding: 10, borderRadius: 12, background: theme.surfaceAlt }}>
              <Icon name="logout" size={18} color={theme.textSub} />
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "24px 16px" }}>
        {/* Peringatan masa berlaku */}
        <ExpiryBanner theme={theme} items={expiryItems} onClick={() => setShowExpiryModal(true)} />

        {/* Cari nomor polisi */}
        <SearchBar theme={theme} value={searchQuery} onChange={setSearchQuery} />

        <SectionLabel>Ringkasan Uji Kedap</SectionLabel>
        <div style={{ display: "flex", gap: 10, marginBottom: 28 }}>
          <StatCard value={inspeksiFiltered.length} label={"Total\nDiperiksa"}         bg={theme.primaryLight} color={theme.primary}  onClick={() => setView("list-all")} />
          <StatCard value={perluTindak.length}      label={"Perlu\nDitindaklanjuti"}   bg={theme.dangerLight}  color={theme.danger}   onClick={() => setView("list-perlu")} />
          <StatCard value={sudahBeres.length}       label={"Sudah\nDitindaklanjuti"}   bg={theme.successLight} color={theme.success}  onClick={() => setView("list-selesai")} />
        </div>

        <div style={{ padding: "14px 16px", borderRadius: 14, background: theme.surface, border: `1px solid ${theme.border}`, fontSize: 13, color: theme.textMuted, lineHeight: 1.6 }}>
          <div style={{ fontWeight: 700, color: theme.text, marginBottom: 4 }}>💡 Panduan</div>
          <div>• Klik angka untuk lihat daftar kendaraan</div>
          <div>• Gunakan <b>Pengecekan</b> untuk uji kedap baru</div>
          <div>• Gunakan <b>Tindak Lanjut</b> untuk tangani temuan</div>
        </div>
      </div>

      <BottomNav active="dashboard" onNav={onNav} role={role} themeOverride={theme} forceMobile />
    </div>

    {showExpiryModal && (
      <ExpiryListModal theme={theme} items={expiryItems} onClose={() => setShowExpiryModal(false)} />
    )}
    </div>
  );
};

export default HSEDashboard;