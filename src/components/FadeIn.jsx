// ── FadeIn ────────────────────────────────────────────────────────────────
// Wrapper generik untuk animasi "muncul" pada elemen apa pun. Dipakai untuk
// step form, item list, kartu ringkasan, banner, dan lain-lain.
//
// Contoh pemakaian:
//   <FadeIn><Card>...</Card></FadeIn>
//   <FadeIn variant="scaleIn" delay={i * 45}><StatCard .../></FadeIn>
//
// PENTING soal re-trigger: React hanya menjalankan ulang animasi kalau
// elemennya benar-benar remount. Kalau FadeIn dipakai untuk transisi step
// (mis. step 1 -> step 2 di form), kasih `key` yang berubah tiap step
// (misalnya `key={step}`) di elemen FadeIn itu sendiri, supaya animasinya
// terpicu ulang tiap kali step berganti — bukan cuma sekali di awal.
//
// Prop:
//   variant  — "fadeSlideUp" (default) | "fadeSlideDown" | "fadeIn" |
//              "scaleIn" | "slideInRight" | "slideInLeft"
//   delay    — ms, untuk efek stagger pada list (delay = index * 40-60ms)
//   duration — ms, default 320
//   as       — tag pembungkus, default "div"
const FadeIn = ({
  children,
  variant = "fadeSlideUp",
  delay = 0,
  duration = 320,
  as: Tag = "div",
  style,
  ...rest
}) => (
  <Tag
    style={{
      animation: `${variant} ${duration}ms cubic-bezier(0.16, 1, 0.3, 1) both`,
      animationDelay: `${delay}ms`,
      ...style,
    }}
    {...rest}
  >
    {children}
  </Tag>
);

export default FadeIn;