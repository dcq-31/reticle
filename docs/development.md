# Reticle Development

This guide is for engineers working on the codebase. It focuses on the current local workflow, the structure that already exists, and the checks that matter when changing rendering or loading behavior.

## Tooling and Commands

### Prerequisites

- Node.js 20+
- `pnpm`

### Install dependencies

```bash
pnpm install
```

### Local development

```bash
pnpm dev
```

### Validation commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:cov
pnpm e2e
pnpm build
```

## Repository Layout

The main directories are:

- `app/`: Next.js App Router shell
- `src/components/`: viewer UI components
- `src/hooks/`: rendering, input, file-open, and resize coordination
- `src/store/`: Zustand slices and shared state
- `src/lib/imaging/`: format parsing, headers, volume creation, demo data
- `src/lib/geometry/`: plane mapping, voxel/world math, overlay resampling
- `src/lib/render/`: 2D slice rendering, colormaps, layout math, 3D rendering support
- `src/workers/`: worker entrypoints and Comlink-facing APIs
- `tests/`: unit tests for imaging, geometry, store, and rendering helpers
- `e2e/`: Playwright smoke coverage

## Local Workflow

The fastest loop for most changes is:

1. run `pnpm dev`
2. verify the demo volume still mounts
3. load a `.nii` or `.nii.gz` file manually if your change touches file loading or rendering
4. run focused validation, then the broader checks

For UI or rendering work, manually verify:

- grid, single, and 3D layouts
- neuro and radio conventions
- sharp and smooth interpolation
- base volume replacement and overlay insertion
- status bar probe updates
- reset behavior

## Test Strategy

### Unit tests

The unit suite covers low-level imaging and rendering logic, including:

- NIfTI parsing and affine behavior
- geometry helpers
- overlay resampling
- world/voxel coordinate logic
- colormap generation

Use unit tests when changing math, parsing, lookup tables, or derived-data behavior.

### End-to-end smoke tests

The Playwright smoke suite checks:

- page boot and demo volume mount
- 2D canvas paint
- slice stepping behavior
- 3D layout activation
- window/level interaction

Use or extend the smoke suite when changing user-visible workflows or renderer integration.

## Working on Loaders

If you change file loading:

- keep the heavy parsing path off the main thread
- confirm the adapter registry and `ViewerLoadService` still select the intended loader
- verify both base volume and overlay flows
- verify stale or superseded loads do not install old results
- verify status and toast behavior on success and failure
- keep supported-format claims in the docs aligned with the actual registry

## Working on 2D Rendering

If you change the slice renderer:

- verify all three planes
- verify pan, zoom, and maximize behavior
- verify crosshair placement and slice stepping
- verify overlay compositing and active layer controls
- run unit tests for geometry or render helpers touched by the change

## Working on 3D Rendering

If you change the volume renderer:

- verify WebGL2 fallback behavior still works
- verify texture rebuilds on timepoint, base-volume, and derived-stats change
- verify LUT, threshold, density, quality, and shade controls
- verify orbit reset and interaction responsiveness

The current implementation lowers render quality while the user is actively interacting. Preserve that behavior unless there is a deliberate performance redesign.

## Build and Environment Notes

- The app is designed to run in modern desktop browsers
- The 3D layout requires WebGL2 with 3D texture support
- Production build validation should be run in an unrestricted environment if the local sandbox interferes with Next.js or Turbopack worker/process behavior

## Documentation Conventions

When updating docs for this repo:

- describe current behavior, not roadmap ideas
- use concrete viewer terms consistently
- do not imply DICOM support or clinical validation unless the codebase actually provides it
- keep command examples synchronized with `package.json`
