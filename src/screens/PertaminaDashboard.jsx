import { useState, useEffect } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import Badge from "../components/Badge";
import BottomNav from "../components/BottomNav";
import Card from "../components/Card";
import Icon from "../components/Icon";
import SectionLabel from "../components/SectionLabel";
import ReminderBanner from "../components/ReminderBanner";
import Top3KerusakanCard from "../components/Top3KerusakanCard";
import theme from "../styles/theme";
import { supabase } from "../lib/supabase";
import { calculateHealthScore, getHealthStatus } from "../lib/healthScore";
import { formatDate, formatTime } from "../lib/dateHelper";
import { getArmadaReminderList } from "../lib/reminderHelper";
import { getGroupedKerusakan } from "../lib/kerusakanHelper";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { DESKTOP_GRID_GAP, SIDEBAR_WIDTH } from "../styles/layout";

// ── StatCard ──────────────────────────────────────────────────────────────────
const StatCard = ({ value, label, color, bg, icon, isDesktop, onClick }) => (
  <div onClick={onClick} style={{
    background: bg, borderRadius: 16,
    padding: isDesktop ? "18px 16px" : "16px 12px",
    textAlign: "center", cursor: onClick ? "pointer" : "default",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
    border: `1px solid ${color}22`,
    transition: "transform 0.15s, box-shadow 0.15s",
  }}
  onMouseEnter={(e) => { if (onClick) { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 10px rgba(0,0,0,0.08)"; } }}
  onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,0.04)"; }}
  >
    <div style={{ fontSize: isDesktop ? 26 : 22, fontWeight: 800, color }}>{value}</div>
    <div style={{ fontSize: isDesktop ? 12 : 10, color, fontWeight: 600, marginTop: 2, opacity: 0.85 }}>
      {label}
    </div>
  </div>
);

// ── ErrorState ────────────────────────────────────────────────────────────────
const ErrorState = ({ message = "Gagal memuat data. Periksa koneksi Anda.", onRetry }) => (
  <div style={{
    padding: "28px 16px", textAlign: "center", background: theme.dangerLight,
    borderRadius: 14, border: `1px solid #FECACA`,
  }}>
    <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
    <div style={{ fontSize: 13, fontWeight: 700, color: theme.danger, marginBottom: 4 }}>
      Gagal memuat data
    </div>
    <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 14 }}>
      {message}
    </div>
    <div
      onClick={onRetry}
      style={{
        display: "inline-block", padding: "8px 18px", borderRadius: 10,
        background: theme.danger, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
      }}
    >
      Coba Lagi
    </div>
  </div>
);

// ── Skeleton Loader ───────────────────────────────────────────────────────────
const SkeletonBox = ({ width = "100%", height = 14, radius = 8, style = {} }) => (
  <div
    className="skeleton-pulse"
    style={{ width, height, borderRadius: radius, background: "#E2E8F0", ...style }}
  />
);

const SkeletonStatCard = ({ isDesktop }) => (
  <div style={{ background: "#F1F5F9", borderRadius: 16, padding: isDesktop ? "22px 16px" : "16px 12px" }}>
    <SkeletonBox height={isDesktop ? 26 : 20} width="55%" style={{ margin: "0 auto 8px" }} />
    <SkeletonBox height={9} width="75%" style={{ margin: "0 auto" }} />
  </div>
);

const SkeletonReportCard = () => (
  <Card style={{ marginBottom: 10, padding: "14px 16px" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <SkeletonBox width={42} height={42} radius={12} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <SkeletonBox height={13} width="45%" style={{ marginBottom: 8 }} />
        <SkeletonBox height={10} width="65%" style={{ marginBottom: 6 }} />
        <SkeletonBox height={10} width="35%" />
      </div>
      <SkeletonBox width={64} height={20} radius={20} />
    </div>
  </Card>
);

const SkeletonChartCard = () => (
  <Card style={{ marginBottom: 20, padding: 16 }}>
    <SkeletonBox height={10} width="40%" style={{ marginBottom: 16 }} />
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <SkeletonBox width={120} height={120} radius={60} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <SkeletonBox height={12} width="90%" style={{ marginBottom: 10 }} />
        <SkeletonBox height={12} width="70%" />
      </div>
    </div>
  </Card>
);

const TabSkeleton = ({ isDesktop, statCount = 4 }) => (
  <div style={{ padding: isDesktop ? "24px 32px" : "20px 16px" }}>
    <div style={{
      display: "grid",
      gridTemplateColumns: `repeat(${statCount}, 1fr)`,
      gap: isDesktop ? DESKTOP_GRID_GAP : 8, marginBottom: 20,
    }}>
      {Array.from({ length: statCount }).map((_, i) => <SkeletonStatCard key={i} isDesktop={isDesktop} />)}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "1fr 1fr" : "1fr", gap: isDesktop ? DESKTOP_GRID_GAP : 0 }}>
      <SkeletonChartCard />
      <SkeletonChartCard />
    </div>
    <SkeletonBox height={12} width={160} style={{ marginBottom: 14 }} />
    {Array.from({ length: 3 }).map((_, i) => <SkeletonReportCard key={i} />)}
  </div>
);

// ── Filter pills dengan fade di ujung scroll ────────────────────────────────
const FilterPillsRow = ({ children }) => (
  <div style={{ position: "relative", marginBottom: 16 }}>
    <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingRight: 20 }}>
      {children}
    </div>
    <div style={{
      position: "absolute", top: 0, right: 0, bottom: 0, width: 28,
      background: `linear-gradient(to right, rgba(248,250,252,0), ${theme.bg})`,
      pointerEvents: "none",
    }} />
  </div>
);

// ── Health score mini progress bar ──────────────────────────────────────────
const HealthMiniBar = ({ value, color }) => (
  <div style={{ width: 64 }}>
    <div style={{ height: 5, borderRadius: 4, background: "#E2E8F0", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, value))}%`, background: color, borderRadius: 4, transition: "width 0.4s ease" }} />
    </div>
    <div style={{ fontSize: 10, fontWeight: 700, color, textAlign: "right", marginTop: 3 }}>{value}%</div>
  </div>
);

// ── Tombol "Riwayat" scoped per kategori ─────────────────────────────────────
const RiwayatButton = ({ onClick, isDesktop }) => (
  <div
    onClick={onClick}
    style={{
      display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
      padding: isDesktop ? "9px 16px" : "7px 12px",
      borderRadius: 10,
      border: `1.5px solid ${theme.primary}`,
      fontSize: isDesktop ? 13 : 12,
      fontWeight: 700,
      color: theme.primary,
      cursor: "pointer",
      whiteSpace: "nowrap",
    }}
  >
    <Icon name="history" size={isDesktop ? 16 : 14} color={theme.primary} />
    Riwayat
  </div>
);

// ── Tab Bar ───────────────────────────────────────────────────────────────────
const TAB_LIST = [
  { key: "gps",    label: "GPS & CCTV" },
  { key: "hse",    label: "Uji Kedap MT" },
  { key: "p1",     label: "Cek Random P1" },
];

const TabBar = ({ active, onChange, counts = {} }) => (
  <div style={{
    display: "flex", borderBottom: `2px solid ${theme.border}`,
    background: theme.surface, paddingLeft: 16, paddingRight: 16,
    overflowX: "auto", WebkitOverflowScrolling: "touch",
  }}>
    {TAB_LIST.map((t) => (
      <div key={t.key} onClick={() => onChange(t.key)} style={{
        padding: "12px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer",
        color: active === t.key ? theme.primary : theme.textMuted,
        borderBottom: active === t.key ? `3px solid ${theme.primary}` : "3px solid transparent",
        marginBottom: -2, whiteSpace: "nowrap", flexShrink: 0,
        transition: "color 0.15s, border-color 0.15s",
        letterSpacing: "0.1px",
      }}>
        {t.label}
        {counts[t.key] != null && (
          <span style={{
            marginLeft: 6, fontSize: 10.5, fontWeight: 700, padding: "1px 7px", borderRadius: 10,
            background: active === t.key ? theme.primaryLight : theme.surfaceAlt,
            color: active === t.key ? theme.primary : theme.textMuted,
          }}>
            {counts[t.key]}
          </span>
        )}
      </div>
    ))}
  </div>
);

// ── HEALTH CATEGORY COLORS ────────────────────────────────────────────────────
const HEALTH_CATEGORY_COLORS = {
  Baik: "#10B981",
  "Perlu Perhatian": "#F59E0B",
  Kritis: "#EF4444",
};

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1: GPS & CCTV
// ─────────────────────────────────────────────────────────────────────────────
const TabGPS = ({ onOpenDetail, onOpenKategori, onOpenRiwayat, isDesktop, onCountChange, onOverdueChange }) => {
  const [inspeksiList, setInspeksiList] = useState([]);
  const [stats, setStats] = useState({ total: 0, normal: 0, abnormal: 0, selesai: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("semua");

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("inspeksi").select("*").order("created_at", { ascending: false });

      if (fetchError) throw fetchError;

      const isNormal = (item) => {
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

      const withStatus = (data || []).map((item) => {
        const health = calculateHealthScore(item);
        const healthCategory = getHealthStatus(health.overall).label;
        return { ...item, overallStatus: isNormal(item) ? "Normal" : "Abnormal", health, healthCategory };
      });

      setInspeksiList(withStatus);
      setStats({
        total: withStatus.length,
        normal: withStatus.filter((i) => i.overallStatus === "Normal").length,
        abnormal: withStatus.filter((i) => i.overallStatus === "Abnormal").length,
        selesai: withStatus.filter((i) => i.status === "selesai").length,
      });
      onCountChange?.(withStatus.length);
      const overdueCount = getArmadaReminderList(withStatus).filter((a) => a.status === "overdue").length;
      onOverdueChange?.(overdueCount);
    } catch (err) {
      console.error("Error loading GPS & CCTV data:", err);
      setError(err.message || "Terjadi kesalahan saat memuat data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredList = inspeksiList.filter((item) => {
    if (filter === "semua") return true;
    if (filter === "normal") return item.overallStatus === "Normal";
    // ⚠️ FIX (Agustus 2026): sebelumnya filter "Abnormal" cuma cek
    // overallStatus, jadi kendaraan yang SUDAH selesai diperbaiki
    // (status === "selesai") tetap ikut muncul di sini — padahal card-nya
    // sendiri lalu menampilkan badge "✓ Perbaikan selesai", yang
    // bertentangan dengan makna filter "Abnormal" (harusnya = belum
    // ditangani). Sekarang "Abnormal" secara konsisten berarti: rusak DAN
    // belum diperbaiki. Yang sudah diperbaiki tetap bisa dilihat lewat
    // filter "Selesai Diperbaiki" secara terpisah.
    if (filter === "abnormal") return item.overallStatus === "Abnormal" && item.status !== "selesai";
    if (filter === "selesai") return item.status === "selesai";
    return true;
  });

  const healthCategoryCounts = {
    Baik: inspeksiList.filter((i) => i.healthCategory === "Baik").length,
    "Perlu Perhatian": inspeksiList.filter((i) => i.healthCategory === "Perlu Perhatian").length,
    Kritis: inspeksiList.filter((i) => i.healthCategory === "Kritis").length,
  };
  const pieData = Object.entries(healthCategoryCounts)
    .map(([name, value]) => ({ name, value })).filter((d) => d.value > 0);

  const last7Days = [...Array(7)].map((_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const dateStr = d.toISOString().slice(0, 10);
    return {
      day: d.toLocaleDateString("id-ID", { weekday: "short" }),
      jumlah: inspeksiList.filter((item) => item.created_at?.slice(0, 10) === dateStr).length,
      dateStr,
    };
  });

  if (loading) return <TabSkeleton isDesktop={isDesktop} statCount={4} />;

  if (error) return (
    <div style={{ padding: isDesktop ? "24px 32px" : "20px 16px" }}>
      <ErrorState message={error} onRetry={loadData} />
    </div>
  );

  return (
    <div style={{ padding: isDesktop ? "24px 32px" : "20px 16px" }}>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: isDesktop ? DESKTOP_GRID_GAP : 8, marginBottom: 20 }}>
        <StatCard value={stats.total}    label="Total"    color={theme.primary} bg={theme.primaryLight} isDesktop={isDesktop} onClick={() => onOpenKategori?.("status", "total")} />
        <StatCard value={stats.normal}   label="Normal"   color={theme.success} bg={theme.successLight} isDesktop={isDesktop} onClick={() => onOpenKategori?.("status", "normal")} />
        <StatCard value={stats.abnormal} label="Abnormal" color={theme.danger}  bg={theme.dangerLight}  isDesktop={isDesktop} onClick={() => onOpenKategori?.("status", "abnormal")} />
        <StatCard value={stats.selesai}  label="Selesai"  color="#10B981"       bg="#D1FAE5"            isDesktop={isDesktop} onClick={() => onOpenKategori?.("status", "selesai")} />
      </div>

      <ReminderBanner armadaList={getArmadaReminderList(inspeksiList)} />
      <Top3KerusakanCard groupedKerusakan={getGroupedKerusakan(inspeksiList)} />

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "1fr 1fr" : "1fr", gap: isDesktop ? DESKTOP_GRID_GAP : 0, alignItems: "start" }}>
        {pieData.length > 0 && (
          <Card style={{ marginBottom: 20, padding: 16 }}>
            <SectionLabel style={{ marginBottom: 8 }}>Status Kesehatan Armada</SectionLabel>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 120, height: 120, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={32} outerRadius={56} paddingAngle={2}
                      onClick={(entry) => onOpenKategori?.("health", entry.name)} cursor="pointer">
                      {pieData.map((entry, index) => <Cell key={index} fill={HEALTH_CATEGORY_COLORS[entry.name]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {pieData.map((d) => (
                  <div key={d.name} onClick={() => onOpenKategori?.("health", d.name)}
                    style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: HEALTH_CATEGORY_COLORS[d.name] }} />
                    <div style={{ fontSize: 12, color: theme.text, fontWeight: 600 }}>
                      {d.name === "Baik" && "🟢 "}{d.name === "Perlu Perhatian" && "🟡 "}{d.name === "Kritis" && "🔴 "}{d.name}
                    </div>
                    <div style={{ fontSize: 12, color: theme.textMuted, marginLeft: "auto" }}>
                      {d.value} ({Math.round((d.value / stats.total) * 100)}%)
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        <Card style={{ marginBottom: 20, padding: 16 }}>
          <SectionLabel style={{ marginBottom: 8 }}>Trend Inspeksi (7 Hari Terakhir)</SectionLabel>
          <div style={{ height: 140 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={last7Days} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: theme.textMuted }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: theme.textMuted }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${theme.border}` }} />
                <Bar dataKey="jumlah" fill={theme.primary} radius={[6, 6, 0, 0]} cursor="pointer"
                  onClick={(data) => { if (data?.dateStr) onOpenKategori?.("date", data.dateStr); }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Filter & List */}
      <FilterPillsRow>
        {[
          { key: "semua",    label: "Semua" },
          { key: "normal",   label: "Normal" },
          { key: "abnormal", label: "Abnormal" },
          { key: "selesai",  label: "Selesai Diperbaiki" },
        ].map((f) => (
          <div key={f.key} onClick={() => setFilter(f.key)} style={{
            padding: "8px 16px", borderRadius: 20, fontSize: 12, fontWeight: 600,
            whiteSpace: "nowrap", cursor: "pointer",
            background: filter === f.key ? theme.primary : theme.surfaceAlt,
            color: filter === f.key ? "#fff" : theme.textMuted,
            boxShadow: filter === f.key ? `0 2px 6px ${theme.primary}55` : "none",
            transition: "all 0.15s",
          }}>
            {f.label}
          </div>
        ))}
      </FilterPillsRow>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <SectionLabel style={{ margin: 0 }}>Daftar Laporan GPS & CCTV</SectionLabel>
        <RiwayatButton onClick={onOpenRiwayat} isDesktop={isDesktop} />
      </div>
      {filteredList.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "repeat(auto-fill, minmax(300px, 1fr))" : "1fr", gap: isDesktop ? DESKTOP_GRID_GAP : 0 }}>
          {filteredList.map((item) => (
            <Card key={item.id} style={{ 
              marginBottom: isDesktop ? 0 : 10, padding: "14px 16px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)", borderRadius: 14,
              }}>
              <div onClick={() => onOpenDetail(item.id)}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: 12,
                    background: item.overallStatus === "Abnormal" ? theme.dangerLight : theme.successLight,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Icon name="car" size={18} color={item.overallStatus === "Abnormal" ? theme.danger : theme.success} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: theme.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.nomor_polisi}</div>
                    <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 1 }}>
                      {item.nama_armada} · {item.perusahaan_transportir}
                    </div>
                    <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
                      {formatDate(item.created_at)} · {formatTime(item.created_at)}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                  <Badge status={item.overallStatus} />
                  <HealthMiniBar value={item.health.overall} color={HEALTH_CATEGORY_COLORS[item.healthCategory]} />
                </div>
              </div>
              {item.status === "selesai" && (
                <div style={{ fontSize: 11, fontWeight: 600, color: theme.success, background: theme.successLight, padding: "6px 10px", borderRadius: 8 }}>
                  ✓ Perbaikan selesai
                </div>
              )}
              {item.overallStatus === "Abnormal" && item.status !== "selesai" && (
                <div style={{ fontSize: 11, fontWeight: 600, color: theme.danger, background: theme.dangerLight, padding: "6px 10px", borderRadius: 8 }}>
                  ⚠️ Perlu perbaikan oleh teknisi
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <Card style={{ padding: "28px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
          <div style={{ fontSize: 13, color: theme.textMuted }}>Tidak ada data untuk filter ini</div>
        </Card>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2: Uji Kedap MT (data dari inspeksi_hse, semua akun HSE)
// ─────────────────────────────────────────────────────────────────────────────
const TabHSE = ({ isDesktop, onOpenDetail, onOpenRiwayat, onCountChange }) => {
  const [list, setList]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [filter, setFilter]   = useState("semua");
  const [activeBar, setActiveBar] = useState(null); // dateStr bar yang aktif

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("inspeksi_hse")
        .select("*")
        .order("created_at", { ascending: false });
      if (fetchError) throw fetchError;
      setList(data || []);
      onCountChange?.((data || []).length);
    } catch (err) {
      console.error("Error loading Uji Kedap MT data:", err);
      setError(err.message || "Terjadi kesalahan saat memuat data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const stats = {
    total: list.length,
    kedap: list.filter((i) => i.status === "lulus").length,
    perlu: list.filter((i) => i.status !== "lulus").length,
  };

  // Trend 7 hari
  const last7Days = [...Array(7)].map((_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const dateStr = d.toISOString().slice(0, 10);
    return {
      day: d.toLocaleDateString("id-ID", { weekday: "short" }),
      jumlah: list.filter((item) => item.created_at?.slice(0, 10) === dateStr).length,
      dateStr,
    };
  });

  // Pie: MT Merah Putih vs MT Industri
  const merahPutih = list.filter((i) => i.kategori_mt === "merah_putih").length;
  const industri   = list.filter((i) => i.kategori_mt === "industri").length;
  const pieData = [
    merahPutih > 0 && { name: "MT Merah Putih", value: merahPutih, color: "#6366F1", filterKey: "merah_putih" },
    industri   > 0 && { name: "MT Industri",    value: industri,   color: "#06B6D4", filterKey: "industri" },
  ].filter(Boolean);

  // Handler klik pie — toggle filter
  const handlePieClick = (entry) => {
    const key = entry?.filterKey || entry?.name?.toLowerCase().replace(" ", "_");
    setActiveBar(null);
    setFilter((prev) => prev === key ? "semua" : key);
  };

  // Handler klik bar — filter per tanggal
  const handleBarClick = (data) => {
    if (!data?.dateStr) return;
    setFilter("semua");
    setActiveBar((prev) => prev === data.dateStr ? null : data.dateStr);
  };

  const filteredList = list.filter((item) => {
    if (activeBar) return item.created_at?.slice(0, 10) === activeBar;
    if (filter === "semua")       return true;
    if (filter === "selesai")     return item.status === "lulus";
    if (filter === "perlu")       return item.status !== "lulus";
    if (filter === "merah_putih") return item.kategori_mt === "merah_putih";
    if (filter === "industri")    return item.kategori_mt === "industri";
    return true;
  });

  // Label aktif untuk info di atas list
  const activeFilterLabel = activeBar
    ? `📅 ${new Date(`${activeBar}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}`
    : null;

  if (loading) return <TabSkeleton isDesktop={isDesktop} statCount={3} />;

  if (error) return (
    <div style={{ padding: isDesktop ? "24px 32px" : "20px 16px" }}>
      <ErrorState message={error} onRetry={loadData} />
    </div>
  );

  return (
    <div style={{ padding: isDesktop ? "24px 32px" : "20px 16px" }}>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: isDesktop ? DESKTOP_GRID_GAP : 8, marginBottom: 20 }}>
        <StatCard value={stats.total} label="Total Diperiksa"     color={theme.primary} bg={theme.primaryLight} isDesktop={isDesktop}
          onClick={() => { setFilter("semua"); setActiveBar(null); }} />
        <StatCard value={stats.perlu} label="Perlu Tindak Lanjut" color={theme.danger}  bg={theme.dangerLight}  isDesktop={isDesktop}
          onClick={() => { setFilter("perlu"); setActiveBar(null); }} />
        <StatCard value={stats.kedap} label="Sudah Selesai"       color={theme.success} bg={theme.successLight} isDesktop={isDesktop}
          onClick={() => { setFilter("selesai"); setActiveBar(null); }} />
      </div>

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "1fr 1fr" : "1fr", gap: isDesktop ? DESKTOP_GRID_GAP : 0, alignItems: "start" }}>
        {pieData.length > 0 && (
          <Card style={{ marginBottom: 20, padding: 16 }}>
            <SectionLabel style={{ marginBottom: 8 }}>Kategori MT</SectionLabel>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 120, height: 120, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={32} outerRadius={56} paddingAngle={2}
                      onClick={handlePieClick} cursor="pointer">
                      {pieData.map((entry, index) => (
                        <Cell key={index} fill={entry.color}
                          opacity={filter === entry.filterKey || filter === "semua" ? 1 : 0.35} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {pieData.map((d) => (
                  <div key={d.name} onClick={() => handlePieClick(d)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, marginBottom: 10,
                      cursor: "pointer", opacity: filter === d.filterKey || filter === "semua" ? 1 : 0.4,
                    }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: d.color,
                      outline: filter === d.filterKey ? `2px solid ${d.color}` : "none", outlineOffset: 2 }} />
                    <div style={{ fontSize: 12, color: theme.text, fontWeight: 600 }}>{d.name}</div>
                    <div style={{ fontSize: 12, color: theme.textMuted, marginLeft: "auto" }}>
                      {d.value} ({stats.total > 0 ? Math.round((d.value / stats.total) * 100) : 0}%)
                    </div>
                  </div>
                ))}
                {filter !== "semua" && (
                  <div onClick={() => { setFilter("semua"); setActiveBar(null); }}
                    style={{ fontSize: 11, color: theme.primary, fontWeight: 600, cursor: "pointer", marginTop: 4 }}>
                    ✕ Reset filter
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}

        <Card style={{ marginBottom: 20, padding: 16 }}>
          <SectionLabel style={{ marginBottom: 8 }}>Trend Uji Kedap (7 Hari Terakhir)</SectionLabel>
          <div style={{ height: 140 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={last7Days} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: theme.textMuted }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: theme.textMuted }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${theme.border}` }}
                  formatter={(value) => [`${value} inspeksi`, "Jumlah"]} />
                <Bar dataKey="jumlah" radius={[6, 6, 0, 0]} cursor="pointer" onClick={handleBarClick}>
                  {last7Days.map((entry) => (
                    <Cell key={entry.dateStr}
                      fill={activeBar === entry.dateStr ? "#D97706" : "#F59E0B"}
                      opacity={activeBar && activeBar !== entry.dateStr ? 0.4 : 1} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {activeBar && (
            <div onClick={() => setActiveBar(null)}
              style={{ fontSize: 11, color: theme.primary, fontWeight: 600, cursor: "pointer", marginTop: 8, textAlign: "right" }}>
              ✕ Reset filter tanggal
            </div>
          )}
        </Card>
      </div>

      {/* Filter pills */}
      <FilterPillsRow>
        {[
          { key: "semua",       label: "Semua" },
          { key: "perlu",       label: "Perlu Tindak Lanjut" },
          { key: "selesai",     label: "Selesai" },
          { key: "merah_putih", label: "MT Merah Putih" },
          { key: "industri",    label: "MT Industri" },
        ].map((f) => (
          <div key={f.key} onClick={() => { setFilter(f.key); setActiveBar(null); }} style={{
            padding: "8px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
            whiteSpace: "nowrap", cursor: "pointer",
            background: !activeBar && filter === f.key ? "#F59E0B" : theme.surfaceAlt,
            color: !activeBar && filter === f.key ? "#fff" : theme.textMuted,
          }}>
            {f.label}
          </div>
        ))}
      </FilterPillsRow>

      {/* Label filter aktif + tombol Riwayat */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", rowGap: 4 }}>
        <SectionLabel style={{ margin: 0 }}>
          Daftar Laporan Uji Kedap MT
          {activeFilterLabel && <span style={{ fontSize: 12, fontWeight: 600, color: "#D97706", marginLeft: 8 }}>{activeFilterLabel}</span>}
        </SectionLabel>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontSize: 12, color: theme.textMuted }}>{filteredList.length} laporan</div>
          <RiwayatButton onClick={onOpenRiwayat} isDesktop={isDesktop} />
        </div>
      </div>

      {filteredList.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "repeat(auto-fill, minmax(300px, 1fr))" : "1fr", gap: isDesktop ? DESKTOP_GRID_GAP : 0 }}>
          {filteredList.map((item) => {
            const isLulus = item.status === "lulus";
            return (
              <Card
                key={item.id}
                onClick={() => onOpenDetail?.(item.id)}
                style={{ marginBottom: isDesktop ? 0 : 10, padding: "14px 16px", cursor: "pointer" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: "#FEF3C7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon name="car" size={18} color="#D97706" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: theme.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.nomor_polisi}</div>
                    <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 1 }}>{item.transportir}</div>
                    <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 1 }}>
                      {item.kapasitas_mt} · {item.jumlah_kompartemen} kompartemen · {item.kategori_mt === "merah_putih" ? "MT Merah Putih" : "MT Industri"}
                    </div>
                    <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
                      {formatDate(item.created_at)} · {formatTime(item.created_at)}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                    <div style={{
                      fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20,
                      background: isLulus ? theme.successLight : theme.dangerLight,
                      color: isLulus ? theme.success : theme.danger,
                    }}>
                      {isLulus ? "✓ Kedap / Lulus" : "⚠️ Perlu Tindak Lanjut"}
                    </div>
                    <Icon name="chevron" size={14} color={theme.textMuted} />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card style={{ padding: "28px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
          <div style={{ fontSize: 13, color: theme.textMuted }}>Tidak ada data untuk filter ini</div>
        </Card>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3: Cek Random P1 (data dari inspeksi_p1, semua akun P1)
// ─────────────────────────────────────────────────────────────────────────────
const TabP1 = ({ isDesktop, onOpenDetail, onOpenRiwayat, onCountChange }) => {
  const [list, setList]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [filter, setFilter]   = useState("semua");

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("inspeksi_p1")
        .select("*, inspeksi_p1_temuan(id, judul, keterangan)")
        .order("created_at", { ascending: false });
      if (fetchError) throw fetchError;
      setList(data || []);
      onCountChange?.((data || []).length);
    } catch (err) {
      console.error("Error loading Cek Random P1 data:", err);
      setError(err.message || "Terjadi kesalahan saat memuat data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Sama dengan DetailP1Screen.jsx: sumber kebenaran adalah data temuan,
  // bukan kolom status (nilainya tidak konsisten). Tidak ada temuan = selesai.
  const isP1Selesai = (item) => (item.inspeksi_p1_temuan?.length || 0) === 0 || item.status === "selesai";

  const stats = {
    total:   list.length,
    perlu:   list.filter((i) => !isP1Selesai(i)).length,
    selesai: list.filter((i) => isP1Selesai(i)).length,
  };

  // Trend 7 hari
  const last7Days = [...Array(7)].map((_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const dateStr = d.toISOString().slice(0, 10);
    return {
      day: d.toLocaleDateString("id-ID", { weekday: "short" }),
      jumlah: list.filter((item) => item.created_at?.slice(0, 10) === dateStr).length,
    };
  });

  // Pie: MT Merah Putih vs MT Industri
  const merahPutih = list.filter((i) => i.kategori_mt === "merah_putih").length;
  const industri   = list.filter((i) => i.kategori_mt === "industri").length;
  // ⚠️ FIX (Agustus 2026): sebelumnya slice pie tidak punya filterKey dan
  // StatCard/Pie di tab ini tidak punya onClick sama sekali — beda dari
  // TabGPS/TabHSE yang keduanya interaktif. User yang sudah terbiasa
  // klik statistik/pie di 2 tab lain akan mengklik yang sama di sini dan
  // tidak terjadi apa-apa, terkesan fitur ini "rusak". Disamakan sekarang:
  // klik StatCard & klik pie/legend memfilter list di bawahnya, persis
  // pola di TabHSE.
  const pieData = [
    merahPutih > 0 && { name: "MT Merah Putih", value: merahPutih, color: "#6366F1", filterKey: "merah_putih" },
    industri   > 0 && { name: "MT Industri",    value: industri,   color: "#06B6D4", filterKey: "industri" },
  ].filter(Boolean);

  const handlePieClick = (entry) => {
    const key = entry?.filterKey;
    if (!key) return;
    setFilter((prev) => prev === key ? "semua" : key);
  };

  const filteredList = list.filter((item) => {
    if (filter === "semua")   return true;
    if (filter === "perlu")   return !isP1Selesai(item);
    if (filter === "selesai") return isP1Selesai(item);
    if (filter === "merah_putih") return item.kategori_mt === "merah_putih";
    if (filter === "industri")    return item.kategori_mt === "industri";
    return true;
  });

  if (loading) return <TabSkeleton isDesktop={isDesktop} statCount={3} />;

  if (error) return (
    <div style={{ padding: isDesktop ? "24px 32px" : "20px 16px" }}>
      <ErrorState message={error} onRetry={loadData} />
    </div>
  );

  return (
    <div style={{ padding: isDesktop ? "24px 32px" : "20px 16px" }}>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: isDesktop ? DESKTOP_GRID_GAP : 8, marginBottom: 20 }}>
        <StatCard value={stats.total}   label="Total Diperiksa"      color={theme.primary} bg={theme.primaryLight} isDesktop={isDesktop}
          onClick={() => setFilter("semua")} />
        <StatCard value={stats.perlu}   label="Perlu Tindak Lanjut"  color={theme.danger}  bg={theme.dangerLight}  isDesktop={isDesktop}
          onClick={() => setFilter("perlu")} />
        <StatCard value={stats.selesai} label="Sudah Selesai"        color={theme.success} bg={theme.successLight} isDesktop={isDesktop}
          onClick={() => setFilter("selesai")} />
      </div>

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "1fr 1fr" : "1fr", gap: isDesktop ? DESKTOP_GRID_GAP : 0, alignItems: "start" }}>
        {pieData.length > 0 && (
          <Card style={{ marginBottom: 20, padding: 16 }}>
            <SectionLabel style={{ marginBottom: 8 }}>Kategori MT</SectionLabel>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 120, height: 120, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={32} outerRadius={56} paddingAngle={2}
                      onClick={handlePieClick} cursor="pointer">
                      {pieData.map((entry, index) => (
                        <Cell key={index} fill={entry.color}
                          opacity={filter === entry.filterKey || filter === "semua" ? 1 : 0.35} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {pieData.map((d) => (
                  <div key={d.name} onClick={() => handlePieClick(d)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, marginBottom: 10,
                      cursor: "pointer", opacity: filter === d.filterKey || filter === "semua" ? 1 : 0.4,
                    }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: d.color,
                      outline: filter === d.filterKey ? `2px solid ${d.color}` : "none", outlineOffset: 2 }} />
                    <div style={{ fontSize: 12, color: theme.text, fontWeight: 600 }}>{d.name}</div>
                    <div style={{ fontSize: 12, color: theme.textMuted, marginLeft: "auto" }}>
                      {d.value} ({stats.total > 0 ? Math.round((d.value / stats.total) * 100) : 0}%)
                    </div>
                  </div>
                ))}
                {filter !== "semua" && (
                  <div onClick={() => setFilter("semua")}
                    style={{ fontSize: 11, color: theme.primary, fontWeight: 600, cursor: "pointer", marginTop: 4 }}>
                    ✕ Reset filter
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}

        <Card style={{ marginBottom: 20, padding: 16 }}>
          <SectionLabel style={{ marginBottom: 8 }}>Trend Cek Random (7 Hari Terakhir)</SectionLabel>
          <div style={{ height: 140 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={last7Days} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: theme.textMuted }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: theme.textMuted }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${theme.border}` }} />
                <Bar dataKey="jumlah" fill="#8B5CF6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Filter */}
      <FilterPillsRow>
        {[
          { key: "semua",       label: "Semua" },
          { key: "perlu",       label: "Perlu Tindak Lanjut" },
          { key: "selesai",     label: "Selesai" },
          { key: "merah_putih", label: "MT Merah Putih" },
          { key: "industri",    label: "MT Industri" },
        ].map((f) => (
          <div key={f.key} onClick={() => setFilter(f.key)} style={{
            padding: "8px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
            whiteSpace: "nowrap", cursor: "pointer",
            background: filter === f.key ? "#8B5CF6" : theme.surfaceAlt,
            color: filter === f.key ? "#fff" : theme.textMuted,
          }}>
            {f.label}
          </div>
        ))}
      </FilterPillsRow>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <SectionLabel style={{ margin: 0 }}>Daftar Laporan Cek Random P1</SectionLabel>
        <RiwayatButton onClick={onOpenRiwayat} isDesktop={isDesktop} />
      </div>
      {filteredList.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "repeat(auto-fill, minmax(300px, 1fr))" : "1fr", gap: isDesktop ? DESKTOP_GRID_GAP : 0 }}>
          {filteredList.map((item) => {
            const temuanCount = item.inspeksi_p1_temuan?.length || 0;
            const selesai = isP1Selesai(item);
            return (
              <Card
                key={item.id}
                onClick={() => onOpenDetail?.(item.id)}
                style={{ marginBottom: isDesktop ? 0 : 10, padding: "14px 16px", cursor: "pointer" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: "#EDE9FE", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon name="car" size={18} color="#7C3AED" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: theme.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.nomor_polisi}</div>
                    <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 1 }}>
                      {item.transportir}
                    </div>
                    <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 1 }}>
                      {item.kapasitas_mt} · {item.jumlah_kompartemen} kompartemen · {item.kategori_mt === "merah_putih" ? "MT Merah Putih" : "MT Industri"}
                    </div>
                    <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 1 }}>
                      {temuanCount} temuan · {formatDate(item.created_at)}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                    <div style={{
                      fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20,
                      background: selesai ? theme.successLight : theme.dangerLight,
                      color: selesai ? theme.success : theme.danger,
                    }}>
                      {selesai ? "✓ Tidak Ada Temuan" : "⚠️ Perlu Tindak Lanjut"}
                    </div>
                    <Icon name="chevron" size={14} color={theme.textMuted} />
                  </div>
                </div>

                {/* Preview temuan */}
                {temuanCount > 0 && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${theme.border}` }}>
                    {item.inspeksi_p1_temuan.slice(0, 2).map((t) => (
                      <div key={t.id} style={{ fontSize: 11, color: theme.textSub, marginBottom: 3 }}>
                        • {t.judul}
                      </div>
                    ))}
                    {temuanCount > 2 && (
                      <div style={{ fontSize: 11, color: theme.textMuted }}>+{temuanCount - 2} temuan lainnya</div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <Card style={{ padding: "28px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
          <div style={{ fontSize: 13, color: theme.textMuted }}>Tidak ada data</div>
        </Card>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN: PertaminaDashboard
// ─────────────────────────────────────────────────────────────────────────────
const PertaminaDashboard = ({ onNav, onLogout, onOpenDetail, onOpenKategori, onOpenDetailHSE, onOpenDetailP1, activeTab, onChangeTab }) => {
  const [tabCounts, setTabCounts] = useState({ gps: null, hse: null, p1: null });
  const [overdueCount, setOverdueCount] = useState(0);
  const isDesktop = useBreakpoint();

  return (
    <div style={{
      minHeight: "100vh", background: theme.bg,
      paddingBottom: isDesktop ? 0 : 80,
      marginLeft: isDesktop ? SIDEBAR_WIDTH : 0,
    }}>
      <style>{`
        @keyframes skeletonPulse { 0% { opacity: 0.55; } 50% { opacity: 1; } 100% { opacity: 0.55; } }
        .skeleton-pulse { animation: skeletonPulse 1.4s ease-in-out infinite; }
      `}</style>
      {/* Header */}
      <div style={{
        background: theme.surface, padding: isDesktop ? "24px 32px 0" : "48px 20px 0",
        borderBottom: `1px solid ${theme.border}`, boxShadow: theme.shadow,
        position: "sticky", top: 0, zIndex: 20,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", rowGap: 10 }}>
          <div>
            <div style={{ fontSize: 13, color: theme.textMuted }}>Selamat datang,</div>
            <div style={{ fontSize: 19, fontWeight: 800, color: theme.text }}>Pertamina</div>
            <div style={{ display: "inline-block", marginTop: 4, fontSize: 11, fontWeight: 600, padding: "2px 10px", borderRadius: 20, background: theme.primaryLight, color: theme.primary }}>
              Depot · Monitor & Audit
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: isDesktop ? 10 : 8, flexWrap: "wrap" }}>
            {/* ⚠️ FIX (Agustus 2026): tombol ini terlihat sama persis (cursor
                pointer, styling identik) dengan tombol Export/Kendaraan di
                sampingnya yang BERFUNGSI — padahal ini belum diimplementasikan
                sama sekali. User yang klik akan bingung karena tidak terjadi
                apa-apa, dan di mobile tooltip "title" tidak pernah muncul
                sama sekali (title tidak tampil di touch device), jadi tidak
                ada penjelasan sama sekali kenapa tombol ini tidak merespons.
                Sekarang ditandai jelas sebagai belum aktif: opacity diturunkan,
                cursor default (bukan pointer), dan label "Filter" diganti jadi
                "Filter (segera hadir)" di desktop supaya jelas dari teks-nya,
                bukan cuma tooltip yang tidak semua orang akan lihat. */}
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: isDesktop ? "9px 14px" : "9px 10px", borderRadius: 10,
              border: `1px solid ${theme.border}`, background: theme.surfaceAlt, color: theme.textMuted,
              fontSize: 12.5, fontWeight: 600, cursor: "default", opacity: 0.55,
            }}>
              <Icon name="search" size={14} color={theme.textMuted} />
              {isDesktop && "Filter (segera hadir)"}
            </div>
            <div
              onClick={() => onNav("export")}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: isDesktop ? "9px 14px" : "9px 10px", borderRadius: 10,
                border: `1px solid ${theme.border}`, background: theme.surface, color: theme.textMuted,
                fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              }}
            >
              <Icon name="download" size={14} color={theme.textMuted} />
              {isDesktop && "Export"}
            </div>
            <div
              onClick={() => onNav("admin-kendaraan")}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: isDesktop ? "9px 14px" : "9px 12px", borderRadius: 10,
                background: theme.primary, color: "#fff",
                fontSize: 12.5, fontWeight: 700, cursor: "pointer",
              }}
            >
              <Icon name="car" size={14} color="#fff" />
              {isDesktop ? "Kelola Data Kendaraan" : "Kendaraan"}
            </div>
            <div onClick={onLogout} style={{ cursor: "pointer", padding: 10, borderRadius: 12, background: theme.surfaceAlt }}>
              <Icon name="logout" size={18} color={theme.textSub} />
            </div>
          </div>
        </div>

        <TabBar active={activeTab} onChange={onChangeTab} counts={tabCounts} />
      </div>

      {/* ⚠️ FIX (Agustus 2026) — tab state hilang setiap ganti tab:
          Sebelumnya tiap tab dirender kondisional (`{activeTab === "gps" &&
          <TabGPS/>}`), jadi komponen tab yang tidak aktif benar-benar
          UNMOUNT. Akibatnya: filter yang sudah dipilih user hilang tiap
          pindah tab lalu balik lagi, data di-fetch ulang dari nol (skeleton
          loading muncul lagi walau datanya sama persis), badge jumlah di
          TabBar untuk HSE/P1 kosong sampai user pernah buka tab itu minimal
          sekali, dan badge overdue di BottomNav cuma pernah dihitung kalau
          tab GPS sempat aktif.
          Sekarang ketiga tab di-mount SEKALIGUS sejak dashboard dibuka, dan
          hanya disembunyikan lewat display:none saat tidak aktif. Semua
          fetch data cukup sekali, filter & scroll tetap tersimpan per tab,
          dan badge count/overdue langsung akurat sejak awal buka dashboard —
          tidak menunggu user membuka tab tersebut dulu. */}
      <div style={{ display: activeTab === "gps" ? "block" : "none" }}>
        <TabGPS
          onOpenDetail={onOpenDetail}
          onOpenKategori={onOpenKategori}
          onOpenRiwayat={() => onNav("history")}
          isDesktop={isDesktop}
          onCountChange={(n) => setTabCounts((p) => ({ ...p, gps: n }))}
          onOverdueChange={setOverdueCount}
        />
      </div>
      <div style={{ display: activeTab === "hse" ? "block" : "none" }}>
        <TabHSE
          isDesktop={isDesktop}
          onOpenDetail={onOpenDetailHSE}
          onOpenRiwayat={() => onNav("history")}
          onCountChange={(n) => setTabCounts((p) => ({ ...p, hse: n }))}
        />
      </div>
      <div style={{ display: activeTab === "p1" ? "block" : "none" }}>
        <TabP1
          isDesktop={isDesktop}
          onOpenDetail={onOpenDetailP1}
          onOpenRiwayat={() => onNav("history")}
          onCountChange={(n) => setTabCounts((p) => ({ ...p, p1: n }))}
        />
      </div>

      <BottomNav active="home" onNav={onNav} role="pertamina" userName="Pertamina" badges={{ maintenance: overdueCount }} />
    </div>
  );
};

export default PertaminaDashboard;