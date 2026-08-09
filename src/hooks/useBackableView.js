import { useEffect, useRef } from "react";
import { pushInternalView, popInternalViewById, discardTopEntries } from "./internalViewFlag";

// ── useBackableView ────────────────────────────────────────────────────────
// Membuat tombol Back bawaan HP (fisik/gesture Android) menutup SATU langkah
// tampilan internal (mis. detail -> list, atau lightbox -> tutup) alih-alih
// langsung tembus keluar ke halaman sebelumnya di riwayat browser — dan kalau
// beberapa tampilan internal bertumpuk (mis. lightbox foto di atas layar
// detail), 1x tombol back cuma menutup yang PALING ATAS, bukan sekaligus dua.
//
// Pemakaian:
//   useBackableView(isOpen, closeFn)
// - isOpen  : true ketika tampilan/modal ini sedang aktif
// - closeFn : fungsi yang menutup tampilan ini (mis. () => setView("list"))
//
// PENTING: tombol "Kembali" versi UI (bukan tombol HP) HARUS memanggil
// goBack(closeFn) di bawah ini, BUKAN langsung memanggil closeFn. Supaya
// jalur tombol HP & tombol UI selalu konsisten dan tidak menyisakan
// riwayat "hantu" yang membuat tombol kembali berikutnya terasa aneh.
export function useBackableView(isOpen, closeFn) {
  const idRef = useRef(null);
  const closeFnRef = useRef(closeFn);
  closeFnRef.current = closeFn;

  useEffect(() => {
    if (isOpen && idRef.current === null) {
      window.history.pushState({ __view: true }, "");
      idRef.current = pushInternalView(() => closeFnRef.current());
    }
    if (!isOpen && idRef.current !== null) {
      popInternalViewById(idRef.current);
      idRef.current = null;
    }
  }, [isOpen]);

  // Jaga-jaga kalau komponen unmount total saat tampilan masih "terbuka".
  useEffect(() => {
    return () => {
      if (idRef.current !== null) {
        popInternalViewById(idRef.current);
        idRef.current = null;
      }
    };
  }, []);
}

// Panggil dari tombol "Kembali" versi UI (bukan tombol HP) supaya jalurnya
// sama persis dengan tombol kembali bawaan HP — history yang mengontrol,
// bukan langsung memanggil closeFn.
export function goBack(fallbackFn) {
  if (window.history.state && window.history.state.__view) {
    window.history.back();
  } else if (fallbackFn) {
    fallbackFn();
  }
}

// ── pushHistoryStep ────────────────────────────────────────────────────────
// Versi imperatif dari useBackableView, dipakai untuk alur MULTI-STEP linear
// seperti form HSE/P1 (sop -> kendaraan -> kategori -> ujikedap -> ringkasan),
// bukan modal on/off. Panggil sekali setiap kali step MAJU satu langkah;
// closeFn akan dipanggil PERSIS SEKALI saat tombol back HP (atau
// window.history.back() dari tombol "Kembali" versi UI) menutup langkah itu.
//
// Terintegrasi dengan stack global yang sama dipakai useBackableView, jadi
// tetap benar walau ada tampilan lain (mis. lightbox foto) yang ditumpuk di
// atas step form — 1x back cuma menutup yang paling atas dulu, baru langkah
// berikutnya mundur ke step sebelumnya.
//
// PENTING: tombol "Kembali" versi UI untuk step form HARUS memanggil
// window.history.back() (bukan langsung mengubah step), supaya jalurnya
// konsisten dengan tombol back HP dan tidak menyisakan entri history yang
// tidak sinkron.
export function pushHistoryStep(closeFn) {
  window.history.pushState({ __view: true }, "");
  return pushInternalView(closeFn);
}

// ── discardHistorySteps ────────────────────────────────────────────────────
// Dipakai saat form/alur multi-step perlu lompat balik BANYAK langkah
// sekaligus secara programatik (mis. tombol "Mulai Baru" yang langsung
// mereset ke step paling awal, bukan mundur step-demi-step lewat tombol
// "Kembali"). Membuang N entri history yang sudah didorong pushHistoryStep,
// lalu menyinkronkan posisi browser lewat window.history.go(-n) — supaya
// riwayat browser & step yang sedang tampil tetap konsisten, dan tombol
// back HP berikutnya tidak "nyasar" ke langkah lama yang sudah tidak relevan.
//
// Panggil ini SEBELUM mengubah state step ke tujuan akhir secara langsung
// (mis. setStep("sop")) — kode pemanggil tetap bertanggung jawab mengubah
// state-nya sendiri, fungsi ini hanya membereskan sisi history-nya.
export function discardHistorySteps(n) {
  if (n <= 0) return;
  discardTopEntries(n);
  window.history.go(-n);
}