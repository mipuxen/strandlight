# strandlight-bridge

Browsers can't send UDP, so this tiny Node program forwards [Strandlight](https://github.com/mipuxen/strandlight)'s messages to **OSC over UDP** — for TouchDesigner, Max/MSP, Ableton (via Connection Kit), Resolume and anything else that speaks OSC.

```bash
npx strandlight-bridge                     # ws://127.0.0.1:8765 → osc://127.0.0.1:9000
npx strandlight-bridge --osc-port 7000     # different OSC port
```

Then in Strandlight: **Settings → Virtuoso → OSC bridge → Connect to localhost**.

| Address                         | Arguments                                                                                                |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `/strandlight/pluck`            | `string id (int)`, `midi note (int)`, `velocity 0–1 (float)`, `timbre 0 crystal / 1 harp / 2 bass (int)` |
| `/strandlight/hand/{i}/tip/{j}` | `x 0–1`, `y 0–1` — hand `i` (0, 1), fingertip `j` (0 thumb … 4 pinky)                                    |
| `/strandlight/pinch`            | `hand (int)`, `pinching 0/1 (int)`                                                                       |

## Security

- Listens on `127.0.0.1` only; it is not reachable from your network.
- Accepts connections only from `localhost`, `mipuxen.github.io` and `strandlight.vercel.app` (add one with `--allow-origin https://example.com`).
- Forwards only `/strandlight/...` addresses with up to 8 numeric arguments.
