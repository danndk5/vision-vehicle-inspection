// ── SuccessCheck ─────────────────────────────────────────────────────────
// Ikon centang yang "digambar" (bukan langsung muncul polos) — cocok
// dipasang sesaat setelah submit berhasil (Pengecekan/Tindak Lanjut), atau
// di card "Semua sudah ditindaklanjuti". Butuh keyframe `drawCheck` +
// `scaleIn` dari animations.css.
//
// Contoh pemakaian:
//   <SuccessCheck size={64} color={theme.success} />
const SuccessCheck = ({ size = 56, color = "#10B981", bg = "#D1FAE5" }) => (
  <div
    style={{
      width: size, height: size, borderRadius: "50%",
      background: bg, display: "flex", alignItems: "center", justifyContent: "center",
      animation: "scaleIn 360ms cubic-bezier(0.16, 1, 0.3, 1) both",
    }}
  >
    <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none">
      <path
        d="M4 12.5L9.5 18L20 6.5"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="24"
        strokeDashoffset="24"
        style={{ animation: "drawCheck 420ms 200ms ease forwards" }}
      />
    </svg>
  </div>
);

export default SuccessCheck;