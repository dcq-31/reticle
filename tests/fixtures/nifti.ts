import { DTYPE, type NiftiDatatypeCode } from "@/lib/imaging/nifti/datatypes";

export interface NiftiFixtureOptions {
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly nt?: number;
  readonly datatypeCode: NiftiDatatypeCode;
  readonly littleEndian?: boolean;
  /** Voxel data; length must equal nx*ny*nz*nt. */
  readonly data: ArrayLike<number>;
  /** When provided, written into srow_x/y/z and sets sform_code = 1. */
  readonly sform?: readonly [
    readonly [number, number, number, number],
    readonly [number, number, number, number],
    readonly [number, number, number, number],
  ];
  readonly pixdim?: readonly [number, number, number];
  readonly description?: string;
}

/**
 * Build a complete in-memory NIfTI-1 (.nii) buffer from scratch.
 *
 * The header layout matches the NIfTI-1 spec (348-byte header + 4-byte magic
 * pad, voxel data starts at offset 352). Endianness, sform, and datatype are
 * configurable so we can exercise both branches of the parser.
 */
export function buildNifti1Buffer(opts: NiftiFixtureOptions): ArrayBuffer {
  const {
    nx,
    ny,
    nz,
    nt = 1,
    datatypeCode,
    littleEndian = true,
    data,
    sform,
    pixdim = [1, 1, 1],
    description = "",
  } = opts;

  const entry = DTYPE[datatypeCode];
  const dataBytes = nx * ny * nz * nt * entry.bytes;
  const voxOffset = 352;
  const buf = new ArrayBuffer(voxOffset + dataBytes);
  const dv = new DataView(buf);
  const le = littleEndian;

  dv.setInt32(0, 348, le);
  dv.setInt16(40, nt > 1 ? 4 : 3, le);
  dv.setInt16(42, nx, le);
  dv.setInt16(44, ny, le);
  dv.setInt16(46, nz, le);
  dv.setInt16(48, nt, le);
  dv.setInt16(50, 1, le);
  dv.setInt16(52, 1, le);
  dv.setInt16(54, 1, le);

  dv.setInt16(70, datatypeCode, le);
  dv.setInt16(72, entry.bytes * 8, le);

  dv.setFloat32(76, 1, le); // pixdim[0] (qfac)
  dv.setFloat32(80, pixdim[0], le);
  dv.setFloat32(84, pixdim[1], le);
  dv.setFloat32(88, pixdim[2], le);

  dv.setFloat32(108, voxOffset, le);
  dv.setFloat32(112, 1, le); // scl_slope
  dv.setFloat32(116, 0, le); // scl_inter

  if (sform) {
    dv.setInt16(254, 1, le); // sform_code = 1
    const writeRow = (rowBase: number, row: readonly number[]): void => {
      dv.setFloat32(rowBase + 0, row[0]!, le);
      dv.setFloat32(rowBase + 4, row[1]!, le);
      dv.setFloat32(rowBase + 8, row[2]!, le);
      dv.setFloat32(rowBase + 12, row[3]!, le);
    };
    writeRow(280, sform[0]);
    writeRow(296, sform[1]);
    writeRow(312, sform[2]);
  }

  if (description) {
    for (let i = 0; i < description.length && i < 80; i++) {
      dv.setUint8(148 + i, description.charCodeAt(i));
    }
  }

  // magic "n+1\0"
  dv.setUint8(344, 0x6e);
  dv.setUint8(345, 0x2b);
  dv.setUint8(346, 0x31);
  dv.setUint8(347, 0x00);

  // Voxel data — written in native endian per entry.bytes.
  const writeAt = (i: number): void => {
    const v = data[i] ?? 0;
    const offset = voxOffset + i * entry.bytes;
    switch (datatypeCode) {
      case 2:
        dv.setUint8(offset, v);
        return;
      case 256:
        dv.setInt8(offset, v);
        return;
      case 4:
        dv.setInt16(offset, v, le);
        return;
      case 512:
        dv.setUint16(offset, v, le);
        return;
      case 8:
        dv.setInt32(offset, v, le);
        return;
      case 768:
        dv.setUint32(offset, v, le);
        return;
      case 16:
        dv.setFloat32(offset, v, le);
        return;
      case 64:
        dv.setFloat64(offset, v, le);
        return;
    }
  };
  for (let i = 0; i < nx * ny * nz * nt; i++) writeAt(i);

  return buf;
}

export interface Nifti2FixtureOptions {
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly nt?: number;
  readonly datatypeCode: NiftiDatatypeCode;
  readonly littleEndian?: boolean;
  /** Voxel data; length must equal nx*ny*nz*nt. */
  readonly data: ArrayLike<number>;
  /** When provided, written into srow_x/y/z and sets sform_code = 1. */
  readonly sform?: readonly [
    readonly [number, number, number, number],
    readonly [number, number, number, number],
    readonly [number, number, number, number],
  ];
  readonly pixdim?: readonly [number, number, number];
  readonly description?: string;
}

/**
 * Build a complete in-memory NIfTI-2 (.nii) buffer from scratch.
 *
 * Header layout matches the NIfTI-2 spec (540-byte header, voxel data starts
 * at offset 540). Uses 64-bit dimensions, double-precision pixdim/scales, and
 * int64 vox_offset.
 */
export function buildNifti2Buffer(opts: Nifti2FixtureOptions): ArrayBuffer {
  const {
    nx,
    ny,
    nz,
    nt = 1,
    datatypeCode,
    littleEndian = true,
    data,
    sform,
    pixdim = [1, 1, 1],
    description = "",
  } = opts;

  const entry = DTYPE[datatypeCode];
  const dataBytes = nx * ny * nz * nt * entry.bytes;
  const voxOffset = 540;
  const buf = new ArrayBuffer(voxOffset + dataBytes);
  const dv = new DataView(buf);
  const le = littleEndian;

  // sizeof_hdr = 540
  dv.setInt32(0, 540, le);

  // magic "n+2\0" + PNG signature bytes
  dv.setUint8(4, 0x6e); // 'n'
  dv.setUint8(5, 0x2b); // '+'
  dv.setUint8(6, 0x32); // '2'
  dv.setUint8(7, 0x00); // '\0'
  dv.setUint8(8, 0x0d); // \r
  dv.setUint8(9, 0x0a); // \n
  dv.setUint8(10, 0x1a); // \032
  dv.setUint8(11, 0x0a); // \n

  // datatype (uint16) and bitpix (uint16)
  dv.setUint16(12, datatypeCode, le);
  dv.setUint16(14, entry.bytes * 8, le);

  // dim[8] as int64 — dim[0] = number of valid dims
  const ndims = nt > 1 ? 4 : 3;
  const writeDim8 = (base: number): void => {
    const dims = [ndims, nx, ny, nz, nt, 1, 1, 1];
    for (let i = 0; i < 8; i++) {
      dv.setBigInt64(base + i * 8, BigInt(dims[i]!), le);
    }
  };
  writeDim8(16);

  // pixdim[8] as float64 — pixdim[0] = qfac
  const writePixdim8 = (base: number): void => {
    const p = [1, pixdim[0], pixdim[1], pixdim[2], 1, 1, 1, 1];
    for (let i = 0; i < 8; i++) {
      dv.setFloat64(base + i * 8, p[i]!, le);
    }
  };
  writePixdim8(104);

  // vox_offset as int64
  dv.setBigInt64(168, BigInt(voxOffset), le);

  // scl_slope = 1, scl_inter = 0
  dv.setFloat64(176, 1, le);
  dv.setFloat64(184, 0, le);

  if (sform) {
    dv.setInt32(348, 1, le); // sform_code = 1
    const writeRow = (rowBase: number, row: readonly number[]): void => {
      dv.setFloat64(rowBase + 0, row[0]!, le);
      dv.setFloat64(rowBase + 8, row[1]!, le);
      dv.setFloat64(rowBase + 16, row[2]!, le);
      dv.setFloat64(rowBase + 24, row[3]!, le);
    };
    writeRow(400, sform[0]);
    writeRow(432, sform[1]);
    writeRow(464, sform[2]);
  }

  if (description) {
    for (let i = 0; i < description.length && i < 80; i++) {
      dv.setUint8(240 + i, description.charCodeAt(i));
    }
  }

  // Voxel data — written in native endian per entry.bytes.
  const writeAt = (i: number): void => {
    const v = data[i] ?? 0;
    const offset = voxOffset + i * entry.bytes;
    switch (datatypeCode) {
      case 2:
        dv.setUint8(offset, v);
        return;
      case 256:
        dv.setInt8(offset, v);
        return;
      case 4:
        dv.setInt16(offset, v, le);
        return;
      case 512:
        dv.setUint16(offset, v, le);
        return;
      case 8:
        dv.setInt32(offset, v, le);
        return;
      case 768:
        dv.setUint32(offset, v, le);
        return;
      case 16:
        dv.setFloat32(offset, v, le);
        return;
      case 64:
        dv.setFloat64(offset, v, le);
        return;
    }
  };
  for (let i = 0; i < nx * ny * nz * nt; i++) writeAt(i);

  return buf;
}
