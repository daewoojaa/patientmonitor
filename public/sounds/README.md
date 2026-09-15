# Custom pulse-tone sounds

Drop `.mp3` files here to replace the synthesized pulse beep for each patient
state. Filenames must match exactly:

| File               | Used when the monitor is in... |
| ------------------ | ------------------------------- |
| `pulse-stable.mp3`     | STABLE     |
| `pulse-critical.mp3`   | CRITICAL   |
| `pulse-recovering.mp3` | RECOVERING |

Each file plays once per heartbeat (synced to the ECG R-peak), so keep them
**short** — well under a second (100-300ms is typical for a monitor "beep").
Any file you don't provide just falls back to the built-in synthesized tone,
so you can add one, some, or all three.

These are loaded via `public/sounds/<file>` at runtime (not bundled at build
time), so you can add or replace them without a rebuild — just refresh the
page.
