// Decides when the next live transcription pass should run. Pure, so the timing rules are testable.
//
// Passes are short slices of the recording transcribed while the user is still speaking.
// The first pass is shorter so words appear quickly; later passes re-listen to a little
// of the previous audio so words at the edge are not cut off.

export function nextLiveWindow({
  covered,
  end,
  rate,
  firstSeconds,
  chunkSeconds,
  overlapSeconds,
}) {
  const need = (covered === 0 ? firstSeconds : chunkSeconds) * rate;
  if (end - covered < need) return { wait: true };
  return {
    wait: false,
    from: Math.max(0, covered - overlapSeconds * rate),
    end,
  };
}
