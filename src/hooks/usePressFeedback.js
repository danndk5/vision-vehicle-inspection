// ── usePressFeedback ─────────────────────────────────────────────────────
// Hook kecil untuk memberi efek "ditekan" (scale-down halus) pada elemen
// yang bisa diklik/ketuk — kartu kendaraan, stat card, tombol custom, dll.
// Tidak butuh library tambahan, murni style + event handler inline.
//
// Contoh pemakaian:
//   const press = usePressFeedback();
//   <div {...press} style={{ ...press.style, ...otherStyle }} onClick={...}>
//
// Atau lebih ringkas, spread langsung (style-nya sudah termasuk transition):
//   <Card {...usePressFeedback()} onClick={...}>...</Card>

import { useRef } from "react";

const usePressFeedback = (scale = 0.97) => {
  const ref = useRef(null);

  const setScale = (val) => {
    if (ref.current) ref.current.style.transform = `scale(${val})`;
  };

  return {
    ref,
    style: { transition: "transform 0.15s ease" },
    onMouseDown: () => setScale(scale),
    onMouseUp: () => setScale(1),
    onMouseLeave: () => setScale(1),
    onTouchStart: () => setScale(scale),
    onTouchEnd: () => setScale(1),
  };
};

export default usePressFeedback;