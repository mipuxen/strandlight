# Architecture

Strandlight is a framework-free Vite + TypeScript app. The rule that shapes everything: **`src/core` never imports a cloud or server module.** The optional cloud layer (planned) will plug in through configuration only, so the core always runs as a static site.

```
camera ──► Tracker (main) ──ImageBitmap──► tracker.worker (MediaPipe, wasm)
                                                   │ 21 landmarks × 2 hands
                                                   ▼
            HandSmoother (One Euro per point) ──► GestureEngine
                                                   │ pinch / tipMove / flick / fist / sustain
                                                   ▼
   pointer & keys ──────────────────────────────► App ──► StrandField (strings + undo)
                                                   │         │
                                    Looper ◄───────┤         ├──► Renderer (Canvas 2D → WebGL2 bloom)
                                    Metronome ◄────┤         │
                                                   ▼         │
                                       AudioEngine (Web Audio + AudioWorklet)
                                                   │
                                  MidiOut · OscClient · Recorder (MediaRecorder)
```

## Folders

| Path                               | What lives there                                                                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/tracking`                | Camera, the tracking worker and the MediaPipe wrapper. One frame in flight at a time (back-pressure), with a main-thread fallback if the worker can't start.                                |
| `src/core/filters`                 | One Euro filter, tuned for normalized coordinates.                                                                                                                                          |
| `src/core/gestures`                | Pure gesture logic, unit-tested: pinch with hysteresis (0.045 on / 0.07 off at a reference palm size, scaled by the real palm), 200 ms tracking-loss grace, fist, open-palm hold, flick.    |
| `src/core/strings`                 | `Strand` (simplified standing-wave physics: 4 modes, excited by pluck position, exponential decay) and `StrandField` (48-string cap with fade-out, crossings, nearest endpoint, undo/redo). |
| `src/core/music`                   | Scales and the length → note/timbre mapping. Longer strings are lower; notes snap to the scale except in Virtuoso "free" tuning.                                                            |
| `src/core/audio`                   | Synthesis engine and the Karplus-Strong AudioWorklet. All sound is generated; no samples.                                                                                                   |
| `src/core/instruments`             | Event-based looper (4 layers, sixteenth-note quantize) and metronome with tap tempo.                                                                                                        |
| `src/core/render`                  | Canvas 2D scene drawn additively, then a WebGL2 bloom (threshold, two blur levels, light chromatic aberration). Light mode skips WebGL.                                                     |
| `src/core/scene`                   | Scene schema, validation and `deflate-raw` + base64url links.                                                                                                                               |
| `src/core/record`, `src/core/midi` | MediaRecorder wrapper, Web MIDI, OSC WebSocket client.                                                                                                                                      |
| `src/i18n`                         | Tiny ICU formatter (`{var}`, `plural`), locale detection from `navigator.languages`, lazy-loaded locale files.                                                                              |
| `src/ui`                           | Safe DOM helper, shell (toolbar, settings, help), ghost-hand guide, toasts, CSS themes.                                                                                                     |
| `packages/bridge`                  | `strandlight-bridge`: localhost WebSocket → OSC/UDP.                                                                                                                                        |
| `scripts`                          | Asset preparation with hash verification, translation checks.                                                                                                                               |

## Performance budget

- Main bundle under 200 KB (CI enforces it). MediaPipe loads separately, lazily, in the worker.
- Tracking off the main thread; rendering and audio stay smooth even when detection is slow.
- Light mode (phones, or no WebGL2): half-resolution tracking, device pixel ratio 1, Canvas 2D glow instead of bloom.
- Target: 60 fps on desktop, 30 fps on phones; pluck-to-sound under 30 ms (`latencyHint: 'interactive'`, worklet synthesis).

## Coordinate spaces

Landmarks arrive normalized to the camera frame. `App.toStage` maps them through the same cover-fit used to draw the video, mirrors x (so the screen acts like a mirror), and normalizes to the stage. Strings are stored in stage-normalized space, so scenes survive window resizes; lengths are measured as a fraction of the screen diagonal.
