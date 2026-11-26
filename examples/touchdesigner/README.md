# Strandlight → TouchDesigner

Use Strandlight's hands and plucks to drive visuals in TouchDesigner over OSC.

1. Start the bridge: `npx strandlight-bridge` (or, from this repo, `cd packages/bridge && npm install && node index.mjs`). It forwards to `127.0.0.1:9000` by default.
2. In Strandlight: switch to **Virtuoso** mode, open **Settings → OSC bridge → Connect to localhost**.
3. In TouchDesigner, add an **OSC In CHOP**, set _Network Port_ to `9000`.

You'll receive these channels:

| Channel                           | Meaning                                                            |
| --------------------------------- | ------------------------------------------------------------------ |
| `strandlight/hand/0/tip/1` (x, y) | Index fingertip of the first hand, 0–1                             |
| `strandlight/pinch`               | Hand index and pinch state (0/1)                                   |
| `strandlight/pluck`               | String id, MIDI note, velocity, timbre (0 crystal, 1 harp, 2 bass) |

Tip: feed `pluck` velocity into a **Lag CHOP** and use it to drive bloom or particle birth rate for visuals that breathe with the music.

A ready-made `.toe` example will be added once the demo video is recorded.
