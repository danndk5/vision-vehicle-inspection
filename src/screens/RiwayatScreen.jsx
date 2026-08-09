import { useState, useEffect, useCallback } from "react";
import Badge from "../components/Badge";
import BottomNav from "../components/BottomNav";
import Btn from "../components/Btn";
import Card from "../components/Card";
import Icon from "../components/Icon";
import theme from "../styles/theme";
import { supabase } from "../lib/supabase";
import { formatDate, formatTime } from "../lib/dateHelper";
import { getStatusFromInspeksi } from "../lib/inspeksiHelper";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { DESKTOP_GRID_GAP, SIDEBAR_WIDTH } from "../styles/layout";
import { isDepot, isHSE, isP1, isTeknisi } from "../components/BottomNav";

// Judul header sesuai kategori data yang sedang ditampilkan
const SCREEN_TITLE = {
  gps: "Riwayat GPS & CCTV",
  hse: "Riwayat Uji Kedap MT",
  p1:  "Riwayat Cek Random P1",
};

const RiwayatScreen = ({ role, onNav, onOpenDetail, onOpenDetailHSE, onOpenDetailP1, category }) => {
  const isDesktop = useBreakpoint();

  const [filterDate, setFilterDate] = useState("");
  const [filterPlat, setFilterPlat] = useState("");
  const [data, setData] = useState([]);
  const [dataCategory, setDataCategory] = useState("gps");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!user) {
        setError("Sesi tidak ditemukan. Silakan login ulang.");
        return;
      }

      // ── Tentukan tabel & kategori data sesuai role (dan tab aktif untuk depot) ──
      let query;
      let cat = "gps";

      if (isHSE(role)) {
        query = supabase.from("inspeksi_hse").select("*").eq("user_id", user.id);
        cat = "hse";
      } else if (isP1(role)) {
        query = supabase.from("inspeksi_p1").select("*, inspeksi_p1_temuan(id)").eq("user_id", user.id);
        cat = "p1";
      } else if (isTeknisi(role)) {
        query = supabase.from("inspeksi").select("*").eq("user_id", user.id);
        cat = "gps";
      } else if (isDepot(role) && category === "hse") {
        query = supabase.from("inspeksi_hse").select("*");
        cat = "hse";
      } else if (isDepot(role) && category === "p1") {
        query = supabase.from("inspeksi_p1").select("*, inspeksi_p1_temuan(id)");
        cat = "p1";
      } else {
        // Depot + tab GPS & CCTV (atau fallback default)
        query = supabase.from("inspeksi").select("*");
        cat = "gps";
      }

      const { data: inspeksiData, error: fetchError } = await query.order(
        "created_at",
        { ascending: false }
      );

      if (fetchError) throw fetchError;

      const mapped = (inspeksiData ?? []).map((item) => {
        if (cat === "hse") {
          // Sama dengan DetailHSEScreen.jsx: tabel inspeksi_hse menyimpan
          // status sebagai "lulus" / "tidak_lulus", bukan "selesai".
          const kategoriLabel = item.kategori_mt === "merah_putih" ? "MT Merah Putih" : "MT Industri";
          return {
            id: item.id,
            plat: item.nomor_polisi,
            subtitle: `${item.kapasitas_mt ?? "-"} · ${item.jumlah_kompartemen ?? "-"} kompartemen · ${kategoriLabel}`,
            perusahaan: item.transportir,
            tanggal: item.created_at,
            statusOk: item.status === "lulus",
            temuanCount: undefined,
          };
        }
        if (cat === "p1") {
          // Sama dengan DetailP1Screen.jsx: sumber kebenaran adalah data
          // temuan, bukan kolom status (nilainya tidak konsisten).
          // Tidak ada temuan = selesai / tidak ada yang perlu ditindaklanjuti.
          const kategoriLabel = item.kategori_mt === "merah_putih" ? "MT Merah Putih" : "MT Industri";
          const temuanCount = item.inspeksi_p1_temuan?.length || 0;
          return {
            id: item.id,
            plat: item.nomor_polisi,
            subtitle: `${item.kapasitas_mt ?? "-"} · ${item.jumlah_kompartemen ?? "-"} kompartemen · ${kategoriLabel}`,
            perusahaan: item.transportir,
            tanggal: item.created_at,
            statusOk: temuanCount === 0 || item.status === "selesai",
            temuanCount,
          };
        }
        // kategori GPS & CCTV
        return {
          id: item.id,
          plat: item.nomor_polisi,
          armada: item.nama_armada,
          pemeriksa: item.nama_pemeriksa,
          perusahaan: item.perusahaan_transportir,
          tanggal: item.created_at,
          status: getStatusFromInspeksi(item),
        };
      });

      setDataCategory(cat);
      setData(mapped);
    } catch (err) {
      setError("Gagal memuat data. Silakan coba lagi.");
      console.error("Error loading riwayat:", err);
    } finally {
      setLoading(false);
    }
  }, [role, category]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredData = data.filter((d) => {
    const matchDate = filterDate
      ? formatDateLocal(d.tanggal) === filterDate
      : true;
    const matchPlat = filterPlat
      ? d.plat?.toLowerCase().includes(filterPlat.toLowerCase())
      : true;
    return matchDate && matchPlat;
  });

  const handleOpenDetail = (id) => {
    if (dataCategory === "hse") return onOpenDetailHSE?.(id);
    if (dataCategory === "p1") return onOpenDetailP1?.(id);
    return onOpenDetail?.(id);
  };

  return (
    <div style={{
      minHeight: "100vh", background: theme.bg,
      paddingBottom: isDesktop ? 0 : 80,
      marginLeft: isDesktop ? SIDEBAR_WIDTH : 0,
    }}>
      {/* Header */}
      <div
        style={{
          background: theme.surface,
          padding: "48px 16px 16px",
          borderBottom: `1px solid ${theme.border}`,
          boxShadow: theme.shadow,
        }}
      >
        {/* ⚠️ FIX (Agustus 2026) — tombol back button jump bug:
            Sebelumnya tombol ini memanggil onNav("dashboard"), yang lewat
            enterDashboard() di App.jsx melakukan replaceState + pushState
            TAMBAHAN (bukan cuma mundur 1 langkah). Efeknya: history stack
            browser jadi tidak sinkron dengan layar yang sedang dibuka user
            — begitu user tekan tombol kembali fisik HP sekali lagi setelah
            ini, langsung muncul dialog "Keluar dari aplikasi?" walau user
            masih di tengah-tengah pemakaian app.
            Sekarang disamakan dengan SEMUA tombol "Kembali" lain di app
            (DetailScreen, DetailHSEScreen, DetailP1Screen, dst.): cukup
            window.history.back() — mundur 1 langkah sesuai history yang
            sesungguhnya sudah di-push saat layar Riwayat ini dibuka. */}
        <div onClick={() => window.history.back()} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14, cursor: "pointer", color: theme.textSub, fontSize: 13 }}>
         <Icon name="arrow" size={16} color={theme.textSub} /> Kembali
        </div>
        <div
          style={{ fontWeight: 800, fontSize: 20, color: theme.text, marginBottom: 14 }}
        >
          {SCREEN_TITLE[dataCategory] ?? "Riwayat"}
        </div>
        <div style={{
          display: "flex",
          gap: 8,
          flexWrap: isDesktop ? "nowrap" : "nowrap",
        }}>
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            style={{
              flex: isDesktop ? "0 0 auto" : 1,
              width: isDesktop ? 180 : undefined,
              padding: "9px 12px",
              borderRadius: 10,
              border: `1.5px solid ${theme.border}`,
              background: theme.surface,
              color: theme.text,
              fontSize: 12,
              fontFamily: "'DM Sans', sans-serif",
              outline: "none",
            }}
          />
          <input
            placeholder="Cari plat..."
            value={filterPlat}
            onChange={(e) => setFilterPlat(e.target.value)}
            style={{
              flex: isDesktop ? "0 0 auto" : 1,
              width: isDesktop ? 200 : undefined,
              padding: "9px 12px",
              borderRadius: 10,
              border: `1.5px solid ${theme.border}`,
              background: theme.surface,
              color: theme.text,
              fontSize: 12,
              fontFamily: "'DM Sans', sans-serif",
              outline: "none",
            }}
          />
        </div>
        {(filterDate || filterPlat) && (
          <div
            onClick={() => {
              setFilterDate("");
              setFilterPlat("");
            }}
            style={{
              marginTop: 10,
              fontSize: 12,
              color: theme.primary,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            ✕ Hapus filter
          </div>
        )}
      </div>

      {/* List */}
      <div style={{ padding: isDesktop ? "20px 32px" : "16px" }}>
        {loading ? (
          <Card style={{ padding: "20px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 13, color: theme.textMuted }}>Memuat data...</div>
          </Card>
        ) : error ? (
          <Card style={{ padding: "20px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 13, color: theme.danger ?? "#e53e3e", marginBottom: 12 }}>
              ⚠️ {error}
            </div>
            <Btn onClick={loadData} variant="ghost" style={{ fontSize: 12 }}>
              Coba Lagi
            </Btn>
          </Card>
        ) : filteredData.length > 0 ? (
          <div style={{
            display: "grid",
            gridTemplateColumns: isDesktop ? "repeat(3, 1fr)" : "1fr",
            gap: isDesktop ? DESKTOP_GRID_GAP : 0,
          }}>
            {filteredData.map((d) => (
              <Card key={d.id} style={{ marginBottom: isDesktop ? 0 : 10 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 10,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: theme.text }}>
                      {d.plat}
                    </div>
                    <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
                      {dataCategory === "gps" ? d.armada : d.subtitle}
                    </div>
                    {dataCategory === "gps" ? (
                      <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 3 }}>
                        👤 {d.pemeriksa} · {d.perusahaan}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 3 }}>
                        {d.perusahaan}
                        {dataCategory === "p1" && d.temuanCount > 0 && ` · ${d.temuanCount} temuan`}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
                      {formatDate(d.tanggal)} · {formatTime(d.tanggal)}
                    </div>
                  </div>
                  {dataCategory === "gps" ? (
                    <Badge status={d.status} />
                  ) : (
                    <div style={{
                      fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20,
                      background: d.statusOk ? theme.successLight : theme.dangerLight,
                      color: d.statusOk ? theme.success : theme.danger,
                      whiteSpace: "nowrap",
                    }}>
                      {d.statusOk
                        ? (dataCategory === "hse" ? "✓ Kedap / Lulus" : "✓ Tidak Ada Temuan")
                        : "⚠️ Perlu Tindak Lanjut"}
                    </div>
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    borderTop: `1px solid ${theme.border}`,
                    paddingTop: 10,
                  }}
                >
                  <Btn
                    onClick={() => handleOpenDetail(d.id)}
                    variant="ghost"
                    icon="eye"
                    style={{ fontSize: 12, padding: "8px", flex: 1 }}
                  >
                    Lihat Detail
                  </Btn>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card style={{ padding: "20px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 13, color: theme.textMuted }}>
              {filterDate || filterPlat
                ? "Tidak ada data sesuai filter"
                : "Belum ada riwayat inspeksi"}
            </div>
          </Card>
        )}
      </div>

      <BottomNav active="history" onNav={onNav} role={role} />
    </div>
  );
};

/**
 * FIX timezone bug: ambil bagian tanggal (YYYY-MM-DD) sesuai zona lokal browser,
 * bukan UTC. Dengan toISOString() tanggal bisa "mundur" 1 hari untuk WIB (UTC+7).
 *
 * Contoh: "2025-01-15T00:30:00+07:00" → toISOString() → "2025-01-14T17:30:00Z"
 * → slice(0,10) → "2025-01-14" (SALAH), padahal lokal → "2025-01-15" (BENAR)
 */
const formatDateLocal = (isoString) => {
  const d = new Date(isoString);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default RiwayatScreen;