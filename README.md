# Reticle

Reticle is a browser-based medical image viewer for NIfTI volumes. It provides synchronized axial, coronal, and sagittal slice views, a WebGL2 3D volume view, overlay support, and a worker-backed loading path so file parsing does not block the main UI thread.

This repository is currently a focused viewer prototype, not a general PACS workstation. It is intended for local exploration, rendering work, and imaging-tool development.

## What Works Today

- Load `.nii` and `.nii.gz` files
- Auto-load a bundled MNI152 sample brain on first mount
- Replace the base volume or add overlays
- Switch between neuro and radiological conventions
- Toggle sharp vs smooth interpolation
- Explore synchronized 2D slice views
- Switch into a 3D volume rendering layout
- Adjust window/level, colormap, overlay opacity, and 3D rendering controls

## Current Boundaries

- NIfTI is the only supported imaging format, and only as a single self-contained `.nii` or `.nii.gz` file — detached `.hdr`/`.img` pairs are rejected
- 3D viewing requires WebGL2 with 3D texture support
- The app auto-loads the bundled MNI152 sample until you replace it with your own file
- This project does not claim clinical validation
- There is no DICOM support in the current codebase

## Quick Start

### Prerequisites

- Node.js 20+
- `pnpm`

### Install

```bash
pnpm install
```

### Run the app

```bash
pnpm dev
```

Then open `http://localhost:3000`.

### Common commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm e2e
pnpm build
```

## Basic Use

- Use **Open file** to load a base volume
- Use **Add overlay** to stack a second volume on top of the base
- Use **Load sample brain** to restore the bundled MNI152 sample
- Drag and drop a NIfTI file onto the window to replace the base volume
- Hold `Shift` while dropping to add the file as an overlay when a base volume is already loaded
- Use the toolbar to change convention, interpolation, and layout
- Use the side panel to adjust time, layers, intensity window, colormap, and 3D settings

## Documentation

- [Usage](docs/usage.md)
- [Architecture](docs/architecture.md)
- [Development](docs/development.md)

## Notes for Contributors

- The main viewer is client-only and mounts through Next.js App Router
- NIfTI parsing runs through a worker-backed path
- Production build validation should be run in an unrestricted environment if Turbopack is sandbox-sensitive
