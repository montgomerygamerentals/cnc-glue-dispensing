# GluePath CNC — Automated Adhesive Dispensing

Browser app for planning adhesive paths on a SainSmart Genmitsu CNC with an external pneumatic glue dispenser (983A-style). Generates GRBL-compatible G-code for batch fixture dispensing. **Not** a milling/cutting toolpath app.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Core flow

1. Import your workpiece STL (nothing ships bundled — start empty and import your own)
2. Register the model in the machine work area
3. Configure the 12-up fixture (rows × columns, spacing, machine position)
4. Draw / edit the adhesive path on the master product (replicates to all slots). Delete a whole path or individual points from the right sidebar
5. Configure dispenser ON/OFF commands (defaults `M8`/`M9` are placeholders)
6. Keep **Dry-run** on until hardware is verified
7. Generate G-code → simulate from that G-code → download `.gcode` for Candle / UGS

Projects and settings persist in `localStorage`.

## Hardware you must confirm

- Exact Genmitsu model and travel limits
- GRBL firmware / controller board
- Isolated relay between CNC output and dispenser foot-pedal input
- Pedal pinout and NO/NC behavior
- Activation command mapping (do not assume `M8`/`M9`)

Never wire CNC output voltage directly to the dispenser pedal circuit.

## Stack

Next.js (App Router), React, TypeScript, Tailwind CSS, Three.js / React Three Fiber, Zustand.
