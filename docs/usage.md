# Reticle Usage

This guide describes the viewer behavior that exists in the current app. It is intentionally concrete and does not describe planned features.

## Terminology

- **Base volume**: the primary loaded volume
- **Overlay**: an additional loaded volume blended on top of the base
- **Active layer**: the layer currently targeted by intensity and colormap controls
- **Crosshair**: the synchronized cursor position shared by the 2D slice views
- **Convention**: left/right display convention, either neuro or radio
- **Volume mode**: the 3D render mode, such as composite, MIP, or iso

## Loading Volumes

### Base volume

Load a base volume with either of these actions:

- Click **Open file**
- Drag and drop a `.nii` or `.nii.gz` file onto the window

Loading a new base volume replaces the current base volume and clears any overlays.

### Overlay

Add an overlay with either of these actions:

- Click **Add overlay**
- Hold `Shift` while dropping a file onto the window when a base volume is already loaded

New overlays become the active layer so the intensity and colormap controls immediately target the new overlay.

### Demo volume

The app auto-loads the bundled MNI152 sample brain on first mount so the viewer is usable before you load your own data. Use **Load sample brain** to restore it later. If the sample cannot be fetched, a synthetic phantom is used as a fallback.

## Toolbar Controls

### Convention

- **Neuro**: left side of the image corresponds to the subject's left
- **Radio**: left side of the image corresponds to the subject's right

### Interpolation

- **Sharp**: nearest-neighbor style display
- **Smooth**: smoothed canvas display for slice views

### Layout

- **Grid**: axial, coronal, sagittal, plus the control panel
- **Single**: one enlarged slice view
- **3D**: WebGL2 volume view plus the control panel

### Reset

Reset recent view changes with the reset button or `R`. Reset restores:

- crosshair position to the center of the base volume
- 2D pan and zoom state
- auto window/level preset
- 3D orbit state

## Slice View Interactions

Each slice viewport supports:

- crosshair sync across axial, coronal, and sagittal planes
- hover probe values in the status bar
- mouse wheel slice stepping
- zoom in, zoom out, fit, and maximize controls
- double-click to maximize or restore a plane

Additional interaction behavior:

- `Ctrl` + scroll zooms the slice view
- hold `Space` and drag to pan
- the crosshair can be hidden or shown with `C`

## 3D View Interactions

The 3D layout requires WebGL2 with 3D texture support.

Inside the 3D viewport:

- drag to rotate
- scroll to zoom
- hold `Shift` and drag to pan
- middle-drag to pan

The 3D control panel exposes:

- render mode
- threshold
- density
- quality
- shading toggle

## Keyboard Shortcuts

- `ArrowUp` / `ArrowDown`: step one slice in the plane the pointer is currently over
- `R`: reset crosshair, 2D views, auto window, and 3D orbit
- `C`: toggle crosshair visibility
- `I`: toggle interpolation between sharp and smooth
- hold `Space`: enable panning while dragging in a slice view

Shortcuts ignore editable controls such as numeric inputs.

## Control Panel

The side panel contains the current layer and display controls:

- **Time**: scrub timepoints when a volume has multiple frames
- **Layers**: inspect the base volume and overlays, select the active layer, change visibility, and adjust overlay opacity
- **Intensity Window**: adjust window/level and use presets
- **Colormap**: choose a LUT and invert it for the active layer
- **Volume Controls**: available in 3D layout only
- **Header Meta**: inspect volume metadata exposed by the current file

## Status Bar

The status bar reports:

- voxel coordinates
- world coordinates in millimeters
- sampled voxel value
- orientation code
- current volume dimensions

When the pointer is hovering a slice view, the status bar follows the hover location. Otherwise it follows the current crosshair location.

## Format Support and Limits

- Supported formats: `.nii`, `.nii.gz`
- Unsupported today: DICOM and other imaging formats
- This viewer is a development tool and prototype, not a clinically validated diagnostic system
