// Drop Whisper's silence hallucinations ('[BLANK_AUDIO]', 'thank you').
export function scrubTranscript(raw) {
  return String(raw ?? "")
    .replace(/\[[^\]]{0,40}\]/g, " ")
    .replace(/\((?:silence|blank audio|inaudible|no speech)\)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isNoiseTranscript(text) {
  return (
    !text ||
    /^(you|thank you\.?|thanks for watching\.?|please subscribe\.?)$/i.test(text)
  );
}

// Join a pass onto the committed text, skipping overlapped words.
export function mergeTranscript(committed, addition) {
  const a = committed.trim() ? committed.trim().split(/\s+/) : [];
  const b = addition.trim() ? addition.trim().split(/\s+/) : [];
  if (!a.length) return b.join(" ");
  if (!b.length) return a.join(" ");
  const max = Math.min(a.length, b.length, 12);
  for (let k = max; k > 0; k -= 1) {
    if (
      a.slice(a.length - k).join(" ").toLowerCase() ===
      b.slice(0, k).join(" ").toLowerCase()
    ) {
      return [...a, ...b.slice(k)].join(" ");
    }
  }
  return [...a, ...b].join(" ");
}
