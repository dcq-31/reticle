export type Datatype =
  | "uint8"
  | "int8"
  | "uint16"
  | "int16"
  | "uint32"
  | "int32"
  | "float32"
  | "float64";

export type TypedArray =
  | Uint8Array
  | Int8Array
  | Uint16Array
  | Int16Array
  | Uint32Array
  | Int32Array
  | Float32Array
  | Float64Array;

export type Vec3 = readonly [number, number, number];
export type Vec4 = readonly [number, number, number, number];

/** Voxel-axis -> world-axis (R=0, A=1, S=2) mapping. */
export type AxisPerm = readonly [0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2];

/** Sign per voxel axis when projecting onto the matching world axis. */
export type AxisSign = readonly [-1 | 1, -1 | 1, -1 | 1];

export interface VolumeStats {
  readonly min: number;
  readonly max: number;
  /**
   * 2nd percentile of intensity over *all* voxels — used for auto windowing.
   * Background is not masked out, so on volumes with a large air region this
   * sits at or near the background level.
   */
  readonly p2: number;
  /** 98th percentile of intensity over all voxels. */
  readonly p98: number;
  /** 256-bin histogram over [min, max]. */
  readonly histogram: Uint32Array;
}

export type VolumeSource = "nifti" | "dicom";

/**
 * Canonical, format-agnostic volume representation consumed by the renderers.
 * Adapters (NIfTI, future DICOM) produce values of this type.
 *
 * Conventions:
 *  - `data` is in native voxel order (x fastest, then y, then z, then t).
 *  - `perm[w]` is the voxel-axis index that aligns with world axis `w`
 *    (0=R, 1=A, 2=S). `sgn[w]` flips it if the voxel axis points the opposite way.
 *  - `dimsWorld[w]` is the size along world axis `w`, i.e. `dimsVox[perm[w]]`.
 *  - `affine` is a 4x4 row-major matrix mapping voxel -> world (RAS, mm).
 */
export interface Volume {
  readonly id: string;
  readonly name: string;
  readonly source: VolumeSource;

  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly nt: number;

  readonly dimsVox: Vec3;
  readonly dimsWorld: Vec3;
  readonly spacing: Vec3;

  readonly perm: AxisPerm;
  readonly sgn: AxisSign;

  /** Row-major 4x4 voxel-index -> RAS-millimeter transform. */
  readonly affine: Float32Array;

  /** Three-letter orientation code (e.g. "RAS", "LAS", "LPS"). */
  readonly orientCode: string;

  readonly datatype: Datatype;
  readonly data: TypedArray;

  /** Element strides for x, y, z, t (in elements, not bytes). */
  readonly strides: Vec4;

  /** Apply as `value * sclSlope + sclInter` before display. */
  readonly sclSlope: number;
  readonly sclInter: number;

  /** Format-specific extras intended for the metadata panel. */
  readonly details?: Readonly<Record<string, string>>;
}

export interface FormatAdapter {
  /** Stable format id used by the ingest pipeline. */
  readonly id: VolumeSource;
  /** Whether this adapter should run through the generic worker path. */
  readonly execution: "worker" | "main";
  /** Sniff a file to decide whether this adapter can load it. */
  canLoad(file: { readonly name: string; readonly head: Uint8Array }): boolean;
  /** Parse into one or more volumes. */
  load(file: File, signal?: AbortSignal): Promise<readonly Volume[]>;
}
