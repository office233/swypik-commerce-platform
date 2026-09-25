/** Beep scurt dublu prin WebAudio + vibrație — alertă la ofertă nouă (fără fișier audio). */
export function alertNewOffer(withSound: boolean): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.([200, 100, 200]);
  if (!withSound || typeof window === "undefined") return;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const beep = (start: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + 0.4);
    };
    beep(0);
    beep(0.5);
    setTimeout(() => void ctx.close().catch(() => undefined), 1500);
  } catch {
    /* audio indisponibil */
  }
}
