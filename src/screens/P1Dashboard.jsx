import { useState, useEffect } from "react";
import Icon from "../components/Icon";
import SectionLabel from "../components/SectionLabel";
import ThemeToggle from "../components/ThemeToggle";
import { useTheme } from "../context/ThemeContext";
import { supabase } from "../lib/supabase";
import { useBackableView, goBack } from "../hooks/useBackableView";

// Lebar tampilan dikunci seukuran HP — akun P1 memang cuma dipakai di ponsel
const FRAME_WIDTH = 430;

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

// ── List kendaraan (sub-view dari stat card) ────────────────────────────────
// Tombol "Kembali" versi UI sekarang lewat goBack() (dibungkus oleh pemanggil)
// supaya konsisten dengan tombol kembali fisik HP — sama seperti pola di
// HSEDashboard.jsx / DashboardScreen.jsx.
const KendaraanList = ({ title, items, onBack, theme }) => (
  <div style={{ minHeight: "100vh", background: theme.bg }}>
    <div style={{ maxWidth: FRAME_WIDTH, margin: "0 auto" }}>
      <div style={{ background: theme.surface, padding: "48px 16px 16px", borderBottom: `1px solid ${theme.border}` }}>
        <div onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14, cursor: "pointer", color: theme.textMuted, fontSize: 13 }}>
          <Icon name="arrow" size={16} color={theme.textMuted} /> Kembali
        </div>
        <div style={{ fontWeight: 800, fontSize: 18, color: theme.text }}>{title}</div>
        <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 2 }}>{items.length} kendaraan</div>
      </div>
      <div style={{ padding: "20px 16px 40px" }}>
        {items.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", background: theme.surface, borderRadius: 14, border: `1px solid ${theme.border}` }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 14, color: theme.textMuted }}>Belum ada data</div>
          </div>
        ) : items.map((i) => (
          <div key={i.id} style={{ marginBottom: 12, padding: "14px 16px", background: theme.surface, borderRadius: 14, border: `1px solid ${theme.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: theme.primaryLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon name="car" size={20} color={theme.primary} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: theme.text }}>{i.nomor_polisi}</div>
                <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>{i.transportir}</div>
                <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 1 }}>
                  {i.kapasitas_mt} · {i.jumlah_kompartemen} kompartemen · {i.kategori_mt === "merah_putih" ? "MT Merah Putih" : "MT Industri"}
                </div>
                <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 1 }}>
                  {new Date(i.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                </div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20,
                background: i.status === "selesai" ? theme.successLight : theme.dangerLight,
                color: i.status === "selesai" ? theme.success : theme.danger }}>
                {i.status === "selesai" ? "Selesai" : "Perlu Tindak Lanjut"}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ── Nav khusus P1 (selalu tab bawah, dikunci lebar HP) ──────────────────────
// Item "Riwayat" dihapus sesuai permintaan.
const NAV_ITEMS = [
  { id: "dashboard",     label: "Beranda",       icon: "home"    },
  { id: "form",          label: "Pengecekan",    icon: "plus"    },
  { id: "tindak-lanjut", label: "Tindak Lanjut", icon: "wrench"  },
];

const P1Nav = ({ active, onNav, theme }) => (
  <div style={{
    position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
    width: "100%", maxWidth: FRAME_WIDTH, background: theme.surface, borderTop: `1px solid ${theme.border}`,
    display: "flex", zIndex: 100,
  }}>
    {NAV_ITEMS.map((n) => {
      const isActive = active === n.id;
      return (
        <div key={n.id} onClick={() => onNav(n.id)} style={{
          flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
          padding: "10px 4px 14px", cursor: "pointer",
          color: isActive ? theme.primary : theme.textMuted,
        }}>
          <Icon name={n.icon} size={20} color={isActive ? theme.primary : theme.textMuted} />
          <div style={{ fontSize: 10, marginTop: 4, fontWeight: isActive ? 700 : 400 }}>{n.label}</div>
        </div>
      );
    })}
  </div>
);

// ── P1Dashboard ──────────────────────────────────────────────────────────────
const P1Dashboard = ({ role, onNav, onLogout }) => {
  const { theme } = useTheme();
  const [currentUser, setCurrentUser] = useState(null);
  const [inspeksiAll, setInspeksiAll] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [view,        setView]        = useState("dashboard");

  // Peringatan masa berlaku Head Truck / Tangki
  const [expiryItems,     setExpiryItems]     = useState([]);
  const [showExpiryModal, setShowExpiryModal] = useState(false);

  // Fix tombol kembali HP: setiap kali "view" pindah dari dashboard ke sub-view
  // (all/perlu/selesai), daftarkan satu langkah history yang bisa "ditangkap"
  // tombol kembali fisik — supaya kembali cuma menutup sub-view ini dulu,
  // bukan langsung lompat ke luar dashboard. Pola sama persis dengan
  // PhotoLightbox di HSEFormScreen.jsx.
  useBackableView(view !== "dashboard", () => setView("dashboard"));

  // Modal peringatan masa berlaku juga perlu ditandai — supaya back HP tidak
  // tembus ke luar aplikasi saat modal terbuka.
  useBackableView(showExpiryModal, () => setShowExpiryModal(false));

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data: profile } = await supabase.from("profiles").select("nama").eq("id", user.id).single();
      setCurrentUser(profile);

      // Ikut ambil relasi inspeksi_p1_temuan(id) — HANYA untuk menghitung
      // jumlah temuan tiap kendaraan (bukan detail lengkap seperti di
      // P1TindakLanjut.jsx). Ini dipakai supaya kartu "Perlu tindak" di
      // Beranda sinkron dengan daftar sebenarnya di layar Tindak Lanjut:
      // kendaraan yang statusnya belum "selesai" TAPI nol temuan (cek
      // random tanpa temuan apa pun) memang tidak butuh tindak lanjut,
      // jadi tidak boleh ikut kehitung di sini.
      const { data } = await supabase
        .from("inspeksi_p1")
        .select("*, inspeksi_p1_temuan(id)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setInspeksiAll(data || []);

      // Cek masa berlaku Head Truck & Tangki dari data master kendaraan
      // (tabel sama dengan yang dipakai HSE/Teknisi).
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
    load();
  }, []);

  // Akun P1 fokus pengecekan lapangan — filter periode & pencarian nomor
  // polisi sengaja tidak ada di sini (fitur semacam itu ditangani penuh di
  // akun Depot). Beranda P1 selalu menampilkan seluruh data milik user ini.

  // "Perlu tindak" = status belum selesai DAN punya minimal 1 temuan — sama
  // persis syaratnya dengan filter di P1TindakLanjut.jsx
  // (i.inspeksi_p1_temuan?.length > 0), supaya angka di kartu Beranda dan
  // isi daftar di layar Tindak Lanjut selalu cocok.
  const perluTindak = inspeksiAll.filter(i => i.status !== "selesai" && (i.inspeksi_p1_temuan?.length > 0));
  const sudahTindak = inspeksiAll.filter(i => i.status === "selesai");
  const displayName = currentUser?.nama || "P1 Officer";

  // onBack dari tiap sub-view dibungkus goBack() supaya tombol "Kembali" di layar
  // dan tombol kembali fisik HP sama-sama lewat window.history.back() — history
  // stack jadi konsisten, tidak ada state "nyangkut" dari pushState di useBackableView.
  if (view === "all")     return <KendaraanList title="Total Diperiksa"       items={inspeksiAll} onBack={() => goBack(() => setView("dashboard"))} theme={theme} />;
  if (view === "perlu")   return <KendaraanList title="Perlu Ditindaklanjuti" items={perluTindak} onBack={() => goBack(() => setView("dashboard"))} theme={theme} />;
  if (view === "selesai") return <KendaraanList title="Sudah Ditindaklanjuti" items={sudahTindak} onBack={() => goBack(() => setView("dashboard"))} theme={theme} />;

  const STATS = [
    { val: inspeksiAll.length, label: "Total",        view: "all",     bg: theme.primaryLight, text: theme.primary },
    { val: perluTindak.length, label: "Perlu tindak", view: "perlu",   bg: theme.dangerLight,   text: theme.danger  },
    { val: sudahTindak.length, label: "Selesai",      view: "selesai", bg: theme.successLight,  text: theme.success },
  ];

  return (
    <div style={{ minHeight: "100vh", background: theme.bg }}>
    <div style={{
      maxWidth: FRAME_WIDTH, margin: "0 auto",
      minHeight: "100vh", display: "flex", flexDirection: "column",
      paddingBottom: 80,
    }}>
      {/* Header */}
      <div style={{ padding: "48px 20px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 13, color: theme.textMuted }}>Selamat datang,</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: theme.text, marginTop: 2 }}>{displayName}</div>
            <div style={{ display: "inline-block", marginTop: 8, fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 20, background: theme.primaryLight, color: theme.primary }}>
              P1 · Cek Random
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ThemeToggle />
            <div onClick={onLogout} style={{ cursor: "pointer", padding: 10, borderRadius: 12, background: theme.surfaceAlt, border: `1px solid ${theme.border}` }}>
              <Icon name="logout" size={18} color={theme.textMuted} />
            </div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, padding: "0 20px 32px" }}>
        {!loading && (
          <>
            {/* Peringatan masa berlaku */}
            <ExpiryBanner theme={theme} items={expiryItems} onClick={() => setShowExpiryModal(true)} />

            {/* Ringkasan angka — klik salah satu card untuk lihat daftar
                lengkap per kategori (Total / Perlu tindak / Selesai) */}
            <SectionLabel>Ringkasan Cek Random</SectionLabel>
            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              {STATS.map((s) => (
                <div key={s.view} onClick={() => setView(s.view)} style={{
                  flex: 1, textAlign: "center", padding: "16px 8px",
                  background: s.bg, borderRadius: 14, cursor: "pointer",
                }}>
                  <div style={{ fontWeight: 800, fontSize: 26, color: s.text }}>{s.val}</div>
                  <div style={{ fontSize: 11, color: s.text, marginTop: 3, fontWeight: 600, opacity: 0.85 }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{
              padding: "14px 16px", borderRadius: 14,
              background: theme.surface, border: `1px solid ${theme.border}`,
              fontSize: 13, color: theme.textMuted, lineHeight: 1.6,
            }}>
              <div style={{ fontWeight: 700, color: theme.text, marginBottom: 4 }}>💡 Panduan</div>
              <div>• Klik angka untuk lihat daftar kendaraan</div>
              <div>• Gunakan <b>Pengecekan</b> untuk cek random baru</div>
              <div>• Gunakan <b>Tindak Lanjut</b> untuk tangani temuan</div>
            </div>
          </>
        )}
      </div>

      <P1Nav active="dashboard" onNav={onNav} theme={theme} />
    </div>

    {showExpiryModal && (
      <ExpiryListModal theme={theme} items={expiryItems} onClose={() => setShowExpiryModal(false)} />
    )}
    </div>
  );
};

export default P1Dashboard;