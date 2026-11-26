/** Builds a stereo impulse response procedurally: no sample files ship with the app. */
export function makeImpulse(ctx: BaseAudioContext, seconds = 3.2, decay = 2.6): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // Exponentially decaying noise that gets darker over time, like air absorbing highs.
      const n = Math.random() * 2 - 1;
      const k = 0.9 - t * 0.75;
      lp = lp + k * (n - lp);
      data[i] = lp * Math.pow(1 - t, decay);
    }
  }
  return buf;
}
