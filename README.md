# GluePath CNC — Automated Adhesive Dispensing

Browser app for planning adhesive paths on a YoraHome CNC Router 3018-Pro with an external pneumatic glue dispenser (983A-style). Generates GRBL-compatible G-code for glue dispensing. **Not** a milling/cutting toolpath app.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Core flow

1. Import one or more STLs (glue targets and/or bed obstacles)
2. Mark each as **Glue** or **Obstacle**; place them in the work area
3. Draw adhesive paths on glue models (right sidebar / click model). Obstacles are for clearance only
4. Configure dispenser ON/OFF commands (defaults `M3 S1000` / `M5` for the laser output)
5. Keep **Dry-run** on until hardware is verified
6. Generate G-code → preview full nozzle travel (yellow = glue, cyan = rapid) → simulate → download `.gcode` for UGS

Projects and settings persist in `localStorage`.

## Hardware you must confirm

- YoraHome 3018-Pro travel limits (default 300 × 180 × 40 mm)
- GRBL firmware / controller board
- Isolated relay between the **laser output** (not spindle) and dispenser foot-pedal input
- Pedal pinout and NO/NC behavior
- Activation command mapping (defaults `M3 S1000` / `M5`; confirm `$30` max spindle/laser S value)

Never wire CNC laser/spindle voltage directly to the dispenser pedal circuit.

## Stack

Next.js (App Router), React, TypeScript, Tailwind CSS, Three.js / React Three Fiber, Zustand.
