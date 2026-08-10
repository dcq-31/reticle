# Reticle Architecture

This document describes the current structure of the viewer and the subsystem boundaries that matter when changing behavior.

## Top-Level Shape

Reticle is a Next.js App Router application with a client-only viewer surface. The server-rendered shell is minimal; the actual viewer mounts dynamically in the browser.

At a high level:

1. `app/page.tsx` loads the viewer without SSR
2. the viewer bootstraps a demo volume on first mount
3. Zustand holds the shared viewer state
4. a unified ingest service resolves the adapter and worker path
5. file loading and parsing create immutable normalized volume objects
6. dedicated 2D and 3D render paths consume store-backed render snapshots

## UI Composition

The viewer surface is composed from a few top-level pieces:

- **Toolbar**: file loading, layout switching, convention, interpolation, reset, sample load
- **Viewport grid**: axial, coronal, sagittal, or 3D layout depending on state
- **Control panel**: time, layers, intensity, colormap, metadata, 3D controls
- **Status bar**: live probe information
- **Drop overlay**: drag-and-drop receiver
- **Toast**: transient success/error feedback

The top-level viewer also installs global keyboard shortcuts and initializes the demo data on first mount.

## State Model

Shared state is stored in Zustand and split by responsibility.

### Viewer document slice

The volume slice owns the viewer document state:

- viewer document layers
- base layer and overlay subset
- active layer id
- crosshair position
- crosshair visibility
- per-layer display properties such as window/level, colormap, invert flag, LUT, and opacity
- derived-data cache metadata for current volumes

This slice also handles:

- setting or replacing the base volume
- adding or removing overlays
- clamping crosshair movement to the current volume bounds
- choosing the active layer for display controls
- applying window presets
- ensuring derived stats for the current timepoint without mutating the `Volume`

### Layout slice

The layout slice controls how the viewer is arranged:

- grid vs single vs 3D layout
- active maximized plane
- convention
- interpolation

### UI slice

The UI slice manages viewer interaction state that is not part of the volume model:

- hover probe state
- loading status
- toolbar status text
- toast messages
- drag-and-drop active flag
- reset sequence counters used to signal viewport resets

### 3D slice

The 3D slice owns volume-rendering settings:

- volume mode
- threshold
- density
- quality
- shading
- reset sequence for the orbit camera

## File Loading and Imaging Pipeline

The current format pipeline is NIfTI-only.

1. The user opens or drops a file
2. the file-open hook delegates to `ViewerLoadService`
3. the service resolves the adapter from the registry and starts a tracked load job
4. the main thread reads the file into an `ArrayBuffer`
5. worker-backed adapters transfer the buffer through Comlink
6. the worker parses the file and returns immutable `Volume` objects
7. the viewer store installs the result as a base layer or overlay
8. stale results are ignored if a newer request has already won

The format registry is explicit, and the ingest service is now the real execution path for that registry. Today, only the NIfTI adapter is registered.

## 2D Rendering Path

Each slice viewport uses an imperative canvas renderer fed by a small render-store adapter.

Key properties of the 2D path:

- one renderer instance per plane
- offscreen canvas used to rebuild slice image data
- separate compositor pass for pan/zoom and crosshair drawing
- frame scheduling through a small RAF coalescer
- targeted store subscriptions hidden behind a slice-render snapshot adapter

The renderer reacts to:

- base volume changes
- overlay changes
- slice movement and timepoint changes
- convention and interpolation changes
- crosshair visibility
- viewport-local pan and zoom state

Pointer handling for slice views is kept separate from rendering so interaction and drawing stay decoupled.

## 3D Rendering Path

The 3D view is a WebGL2 renderer built on Three.js and fed by a dedicated volume-render snapshot adapter.

Key properties of the 3D path:

- requires WebGL2 and 3D texture support
- builds a `Data3DTexture` from the current base volume and timepoint
- uses a custom shader material and LUT texture
- rebuilds texture state when the base volume, derived stats, or timepoint changes
- updates uniforms when display settings or 3D controls change
- maintains its own orbit state outside React

The interaction model is imperative:

- pointer drag rotates
- shift-drag or middle-drag pans
- wheel zooms
- active interaction temporarily lowers step count for faster feedback

## Where Core Logic Lives

The main logic is split by domain:

- imaging format parsing, load resolution, and derived-data cache helpers live under `src/lib/imaging`
- geometric transforms and probe math live under `src/lib/geometry`
- slice and volume rendering logic live under `src/lib/render`
- hooks coordinate rendering, resize, pointer input, file loading, and render snapshot adaptation
- components assemble the viewer UI around the state and render hooks

## Extension Points

The lowest-friction extension points in the current design are:

- add a new file-format adapter through the imaging loader registry and ingest service
- add new layer display controls through the viewer document slice and control panel
- add new 3D modes or uniforms in the volume-rendering material path
- add new probe or orientation behavior in the geometry utilities

## Constraints to Respect

When changing this codebase, keep these existing design choices intact unless there is a specific reason to replace them:

- parsing should stay off the main thread for real file loads
- React should not own per-frame canvas or WebGL draw state
- `Volume` objects should stay immutable; caches belong to derived-data services or store state
- documentation and UI text should distinguish current support from future ideas
- the current terminology is stable: base volume, overlay, active layer, crosshair, convention, interpolation, volume mode
