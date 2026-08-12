import FadeIn from "./FadeIn";

// ── PageTransition ───────────────────────────────────────────────────────
// Pembungkus untuk transisi antar SCREEN/VIEW penuh — beda dengan FadeIn
// biasa yang untuk elemen kecil, ini didesain untuk konten satu layar utuh
// (mis. Beranda <-> daftar "Total Diperiksa", atau step 1 <-> step 2 di
// FormScreen/TindakLanjutDetail).
//
// WAJIB kasih `viewKey` yang berubah tiap kali tampilan berganti (misalnya
// `view` atau `step`), supaya React remount elemen ini dan animasi
// benar-benar terpicu ulang tiap perpindahan — bukan cuma sekali di awal.
//
// Arah animasi otomatis: "forward" (slide dari kanan, dipakai saat maju ke
// step/level berikutnya) atau "back" (slide dari kiri, dipakai saat mundur/
// kembali). Default "forward" kalau tidak ditentukan.
//
// Contoh pemakaian di FormScreen (ganti langsung return-nya per step):
//   {step === 1 && (
//     <PageTransition viewKey="step1">
//       <SectionLabel>Data Kendaraan</SectionLabel>
//       ...
//     </PageTransition>
//   )}
//
// Contoh pemakaian untuk switch antar view penuh (DashboardScreen):
//   if (view === "list-all") {
//     return (
//       <PageTransition viewKey="list-all">
//         <InspeksiList .../>
//       </PageTransition>
//     );
//   }
const PageTransition = ({ viewKey, direction = "forward", children }) => (
  <FadeIn
    key={viewKey}
    variant={direction === "back" ? "slideInLeft" : "slideInRight"}
    duration={280}
  >
    {children}
  </FadeIn>
);

export default PageTransition;