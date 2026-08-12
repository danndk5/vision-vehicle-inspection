// ── Skeleton ─────────────────────────────────────────────────────────────
// Placeholder shimmer untuk state loading — pengganti teks polos seperti
// "Memuat data...". Butuh keyframe `shimmer` dari animations.css.
//
// Contoh pemakaian di layar Beranda/Dashboard:
//   if (loading) {
//     return (
//       <div style={{ padding: "20px 16px" }}>
//         <SkeletonCard /><SkeletonCard /><SkeletonCard />
//       </div>
//     );
//   }
//
// Contoh untuk stat card (3 kotak Ringkasan Kendaraan):
//   <div style={{ display: "flex", gap: 10 }}>
//     <SkeletonBlock height={90} /><SkeletonBlock height={90} /><SkeletonBlock height={90} />
//   </div>

const shimmerBg = (theme) =>
  `linear-gradient(90deg, ${theme.surfaceAlt} 25%, ${theme.surface} 50%, ${theme.surfaceAlt} 75%)`;

// Baris teks placeholder (untuk judul/subjudul)
export const SkeletonLine = ({ theme, width = "60%", height = 12, style }) => (
  <div
    style={{
      width, height, borderRadius: 6,
      background: shimmerBg(theme), backgroundSize: "900px 100%",
      animation: "shimmer 1.4s infinite linear",
      ...style,
    }}
  />
);

// Lingkaran placeholder (untuk avatar/ikon)
export const SkeletonCircle = ({ theme, size = 44, style }) => (
  <div
    style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: shimmerBg(theme), backgroundSize: "900px 100%",
      animation: "shimmer 1.4s infinite linear",
      ...style,
    }}
  />
);

// Blok generik (untuk stat card, foto, dll)
export const SkeletonBlock = ({ theme, height = 78, style }) => (
  <div
    style={{
      flex: 1, height, borderRadius: 14,
      background: shimmerBg(theme), backgroundSize: "900px 100%",
      animation: "shimmer 1.4s infinite linear",
      ...style,
    }}
  />
);

// Kartu list lengkap (ikon + 2 baris teks) — mirip bentuk kartu kendaraan
export const SkeletonCard = ({ theme, style }) => (
  <div style={{
    display: "flex", alignItems: "center", gap: 12,
    padding: "14px 16px", marginBottom: 12, borderRadius: 14,
    background: theme.surface, border: `1px solid ${theme.border}`,
    ...style,
  }}>
    <SkeletonCircle theme={theme} size={44} />
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
      <SkeletonLine theme={theme} width="55%" height={13} />
      <SkeletonLine theme={theme} width="35%" height={11} />
    </div>
  </div>
);

// Rangkaian beberapa SkeletonCard sekaligus — dipakai langsung saat loading
const Skeleton = ({ theme, count = 3 }) => (
  <>
    {Array.from({ length: count }).map((_, i) => (
      <SkeletonCard key={i} theme={theme} />
    ))}
  </>
);

export default Skeleton;