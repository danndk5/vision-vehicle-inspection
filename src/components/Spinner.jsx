// ── Spinner ──────────────────────────────────────────────────────────────
// Pengganti teks polos "Mengirim...", "Memuat...", dll. Butuh keyframe
// `spin` dari animations.css.
//
// Dua mode pemakaian:
//
// 1) Di dalam tombol (kecil, sejajar teks):
//    <Btn disabled={submitting}>
//      {submitting ? <><Spinner size={14} /> Mengirim...</> : "Kirim"}
//    </Btn>
//
// 2) Full-page loading (menggantikan "Memuat data..."):
//    <FullPageSpinner theme={theme} label="Memuat data..." />

export const Spinner = ({ size = 16, color = "currentColor", thickness = 2.5 }) => (
  <span
    style={{
      display: "inline-block",
      width: size, height: size,
      border: `${thickness}px solid transparent`,
      borderTopColor: color,
      borderRightColor: color,
      borderRadius: "50%",
      animation: "spin 0.7s linear infinite",
      verticalAlign: "middle",
      marginRight: 6,
    }}
  />
);

export const FullPageSpinner = ({ theme, label = "Memuat..." }) => (
  <div style={{
    minHeight: "60vh", display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", gap: 10,
  }}>
    <Spinner size={28} color={theme.primary} thickness={3} />
    <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 2 }}>{label}</div>
  </div>
);

export default Spinner;