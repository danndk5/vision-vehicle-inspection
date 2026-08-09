// ── internalViewFlag (stack LIFO global) ───────────────────────────────────
// Satu stack tunggal untuk SEMUA tampilan internal (sub-view/modal) yang
// dibuka lewat useBackableView di seluruh aplikasi — mis. daftar kendaraan
// di HSEDashboard, detail Tindak Lanjut, lightbox foto, dst.
//
// Kenapa harus satu stack + satu listener global (bukan listener per hook):
// kalau tiap useBackableView punya listener popstate sendiri-sendiri, semua
// listener itu ikut bereaksi ke SETIAP event popstate, bukan cuma event yang
// menutup entri miliknya. Akibatnya kalau ada 2 tampilan internal bertumpuk
// (mis. detail Tindak Lanjut lalu lightbox foto di atasnya), menutup yang
// paling atas (lightbox) dengan 1x tombol back malah ikut menutup yang di
// bawahnya juga (detail) — lompat 2 langkah sekaligus.
//
// Dengan satu stack + satu listener: setiap popstate cuma menutup entri
// PALING ATAS stack. Persis 1 langkah per 1x tombol back, tidak peduli
// berapa banyak tampilan internal yang sedang bertumpuk.
let stack = [];
let nextId = 1;
let listenerAttached = false;
// Berapa popstate berikutnya yang harus DIABAIKAN oleh listener global —
// dipakai saat kita sengaja melompat banyak langkah sekaligus secara
// programatik (lihat discardTopEntries) dan sudah menangani perubahan state
// itu sendiri, jadi popstate yang muncul akibat window.history.go(-n) tidak
// perlu (dan tidak boleh) diproses lagi oleh listener biasa di bawah.
let suppressCount = 0;

function ensureGlobalListener() {
  if (listenerAttached) return;
  listenerAttached = true;
  window.addEventListener("popstate", () => {
    if (suppressCount > 0) {
      suppressCount -= 1;
      return;
    }
    const top = stack.pop();
    if (top) top.closeFn();
  });
}

// Dipanggil useBackableView saat tampilan dibuka. Mengembalikan id unik
// yang dipakai untuk melepas entri ini lagi nanti (popInternalViewById).
export function pushInternalView(closeFn) {
  ensureGlobalListener();
  const id = nextId++;
  stack.push({ id, closeFn });
  return id;
}

// Lepas entri tertentu dari stack — dipanggil saat tampilan ditutup TANPA
// lewat popstate (mis. isOpen berubah false secara programatik), atau
// sebagai pembersihan setelah popstate menutupnya lewat jalur normal.
export function popInternalViewById(id) {
  const idx = stack.findIndex((e) => e.id === id);
  if (idx !== -1) stack.splice(idx, 1);
}

// Buang N entri PALING ATAS stack sekaligus TANPA memanggil closeFn
// masing-masing — dipakai saat kode pemanggil sudah menangani sendiri
// perubahan state yang setara (mis. "Mulai Baru" pada form multi-step yang
// langsung set step ke awal), lalu berencana memanggil window.history.go(-n)
// untuk menyinkronkan posisi browser. window.history.go(-n) hanya memicu
// SATU event popstate di tujuan akhir (bukan n event terpisah), makanya
// suppressCount ditambah 1 per pemanggilan — persis sejumlah popstate yang
// akan muncul dari satu panggilan go(-n), berapa pun besar n-nya.
export function discardTopEntries(n) {
  for (let i = 0; i < n && stack.length > 0; i++) {
    stack.pop();
  }
  suppressCount += 1;
}

// Dipakai App.jsx: true selama ada tampilan internal yang masih terbuka,
// supaya App.jsx tahu untuk TIDAK menampilkan dialog "Keluar dari aplikasi?"
// saat popstate ini sebenarnya cuma menutup tampilan internal.
export function hasOpenInternalView() {
  return stack.length > 0;
}