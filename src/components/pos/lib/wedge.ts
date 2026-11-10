// Keyboard-wedge scanners type a whole code in one fast burst, then Enter. A person types (or pastes) slower.
// Same timing rule as the till-wide listener in pos-app.tsx: keys under 80 ms apart, Enter under 120 ms after.

/** Feed it every keydown of one input. On Enter it says whether the input's whole value arrived as a scan; otherwise null. */
export function wedgeBurst() {
  let n = 0;
  let last = 0;
  return (e: { key: string; timeStamp: number; currentTarget: { value: string } }): boolean | null => {
    const now = e.timeStamp;
    if (e.key === "Enter") {
      const scanned = n >= 4 && n === e.currentTarget.value.length && now - last < 120;
      n = 0;
      return scanned;
    }
    if (e.key.length === 1) {
      n = now - last > 80 ? 1 : n + 1;
      last = now;
    } else n = 0;
    return null;
  };
}
