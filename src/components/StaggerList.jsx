import FadeIn from "./FadeIn";

// ── StaggerList ───────────────────────────────────────────────────────────
// Bungkus daftar item (kartu kendaraan, item temuan, dll) supaya muncul
// satu-satu berurutan alih-alih langsung serentak/polos. Menghindari perlu
// menulis `delay={i * 45}` manual di tiap tempat.
//
// Contoh pemakaian (mengganti items.map(...) biasa):
//   <StaggerList items={items} getKey={(insp) => insp.id}>
//     {(insp, i) => (
//       <Card>...</Card>
//     )}
//   </StaggerList>
//
// Prop:
//   items      — array data
//   children   — render-prop: (item, index) => ReactNode
//   getKey     — (item, index) => key unik, default pakai index
//   step       — jeda antar item dalam ms, default 45
//   maxDelay   — batas delay maksimum (ms) supaya list panjang tidak lama
//                muncul semua — default 400
//   variant    — diteruskan ke FadeIn, default "fadeSlideUp"
const StaggerList = ({
  items,
  children,
  getKey = (_, i) => i,
  step = 45,
  maxDelay = 400,
  variant = "fadeSlideUp",
}) => (
  <>
    {items.map((item, i) => (
      <FadeIn key={getKey(item, i)} variant={variant} delay={Math.min(i * step, maxDelay)}>
        {children(item, i)}
      </FadeIn>
    ))}
  </>
);

export default StaggerList;