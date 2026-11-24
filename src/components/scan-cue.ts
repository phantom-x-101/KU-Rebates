export function playTone(ok: boolean) {
  try {
    const ctx = new window.AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = ok ? "sine" : "square";
    osc.frequency.value = ok ? 880 : 180;
    gain.gain.setValueAtTime(0.07, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    const stopAt = ctx.currentTime + (ok ? 0.12 : 0.28);
    osc.stop(stopAt);
    osc.onended = () => void ctx.close();
  } catch {
    // Audio can be blocked until a gesture. A scan keystroke counts.
  }
}

export function vibrateScan(ok: boolean) {
  try {
    if (!navigator.vibrate) return;
    if (ok) navigator.vibrate(40);
    else navigator.vibrate([80, 40, 80]);
  } catch {
    // Vibration is optional; missing API or permission is fine.
  }
}

/** Short beep + vibration on an accepted scan; lower tone + pulse on reject. */
export function playScanCue(ok: boolean) {
  playTone(ok);
  vibrateScan(ok);
}
