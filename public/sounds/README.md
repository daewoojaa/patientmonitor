# Custom ambient/alarm sounds

Drop `.mp3` files here to add a looping background tone for each patient
state. Filenames must match exactly:

| File               | Loops while the monitor is in... |
| ------------------ | --------------------------------- |
| `pulse-stable.mp3`     | STABLE     |
| `pulse-critical.mp3`   | CRITICAL   |
| `pulse-recovering.mp3` | RECOVERING |

Each file loops seamlessly (`AudioBufferSourceNode.loop = true`) for as long
as that state is active and sound is on — any length works, and it restarts
from the top each time it loops around, so a clip that starts/ends on a
similar beat/silence loops most cleanly. Any state you don't provide a file
for falls back to the built-in synthesized per-heartbeat beep instead.

These are loaded via `public/sounds/<file>` at runtime (not bundled at build
time), so you can add or replace them without a rebuild — just refresh the
page.
