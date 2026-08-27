import { entryFor, type NiftiDatatypeEntry } from "@/lib/imaging/nifti/datatypes";

export type Dim8 = readonly [number, number, number, number, number, number, number, number];
export type SRow = readonly [number, number, number, number];
export type SRows = readonly [SRow, SRow, SRow];

/**
 * Decoded NIfTI-1 or NIfTI-2 header.
 *
 * Field semantics mirror the on-disk format: see
 * https://nifti.nimh.nih.gov/nifti-1/documentation/nifti1fields/nifti1fields_pages
 */
export interface NiftiHeader {
  readonly isV2: boolean;
  readonly littleEndian: boolean;

  /** NIfTI datatype code (see DTYPE in datatypes.ts). */
  readonly datatypeCode: number;
  readonly bitpix: number;

  /** Eight raw dim values; dim[0] = number of valid dims, dim[1..7] = sizes. */
  readonly dim: Dim8;
  /** Eight raw pixdim values; pixdim[0] is the qfac sign for qform. */
  readonly pixdim: Dim8;

  /** Byte offset at which voxel data begins inside the file. */
  readonly voxOffset: number;
  readonly sclSlope: number;
  readonly sclInter: number;
  readonly calMin: number;
  readonly calMax: number;

  readonly qformCode: number;
  readonly sformCode: number;
  readonly quatern: readonly [number, number, number];
  readonly qoffset: readonly [number, number, number];
  readonly srow: SRows;

  readonly descrip: string;

  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly nt: number;

  readonly entry: NiftiDatatypeEntry;
}

interface EndianInfo {
  readonly littleEndian: boolean;
  readonly hdrSize: 348 | 540;
}

export function detectEndian(dv: DataView): EndianInfo | null {
  const le = dv.getInt32(0, true);
  if (le === 348 || le === 540) return { littleEndian: true, hdrSize: le };
  const be = dv.getInt32(0, false);
  if (be === 348 || be === 540) return { littleEndian: false, hdrSize: be };
  return null;
}

function readDim8(dv: DataView, base: number, stride: 2 | 8, le: boolean): Dim8 {
  const out: number[] = [];
  for (let i = 0; i < 8; i++) {
    out.push(
      stride === 2 ? dv.getInt16(base + i * 2, le) : Number(dv.getBigInt64(base + i * 8, le)),
    );
  }
  return out as unknown as Dim8;
}

function readPixdim8(dv: DataView, base: number, stride: 4 | 8, le: boolean): Dim8 {
  const out: number[] = [];
  for (let i = 0; i < 8; i++) {
    out.push(stride === 4 ? dv.getFloat32(base + i * 4, le) : dv.getFloat64(base + i * 8, le));
  }
  return out as unknown as Dim8;
}

function readSRows(dv: DataView, base: number, stride: 4 | 8, le: boolean): SRows {
  const row = (rowBase: number): SRow => {
    const r: number[] = [];
    for (let i = 0; i < 4; i++) {
      r.push(
        stride === 4 ? dv.getFloat32(rowBase + i * 4, le) : dv.getFloat64(rowBase + i * 8, le),
      );
    }
    return r as unknown as SRow;
  };
  return [row(base), row(base + stride * 4), row(base + stride * 8)];
}

function readZTerm(dv: DataView, base: number, max: number): string {
  let out = "";
  for (let i = 0; i < max; i++) {
    const c = dv.getUint8(base + i);
    if (c === 0) break;
    out += String.fromCharCode(c);
  }
  return out;
}

/**
 * NIfTI stores a magic string that distinguishes a self-contained volume from
 * the header half of a detached `.hdr`/`.img` pair:
 *
 *   NIfTI-1 @344: "n+1\0" single-file, "ni1\0" detached pair
 *   NIfTI-2 @4:   "n+2\0…" single-file, "ni2\0…" detached pair
 *
 * Only the *pair* magic is treated as a rejection. A zeroed magic means a bare
 * ANALYZE 7.5 header, which the rest of the parser already tolerates.
 */
function isDetachedPairMagic(dv: DataView, isV2: boolean): boolean {
  const base = isV2 ? 4 : 344;
  if (dv.byteLength < base + 4) return false;
  const expected = isV2 ? [0x6e, 0x69, 0x32] : [0x6e, 0x69, 0x31]; // "ni2" / "ni1"
  return (
    dv.getUint8(base) === expected[0] &&
    dv.getUint8(base + 1) === expected[1] &&
    dv.getUint8(base + 2) === expected[2] &&
    dv.getUint8(base + 3) === 0
  );
}

function checkDim(label: string, value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Invalid NIfTI header: ${label} is ${value}, expected a positive integer.`);
  }
  return value;
}

export function parseHeader(buf: ArrayBuffer): NiftiHeader {
  if (buf.byteLength < 4) {
    throw new Error(`Not a NIfTI file (only ${buf.byteLength} bytes).`);
  }
  const dv = new DataView(buf);
  const endian = detectEndian(dv);
  if (!endian) throw new Error("Not a NIfTI file (unrecognized header size).");
  if (buf.byteLength < endian.hdrSize) {
    throw new Error(
      `Truncated NIfTI header: declares ${endian.hdrSize} bytes, file has ${buf.byteLength}.`,
    );
  }
  const le = endian.littleEndian;
  const isV2 = endian.hdrSize === 540;

  // Must precede the truncation check below — a detached header is *always*
  // short on voxel data, and "truncated file" would misdescribe the cause.
  if (isDetachedPairMagic(dv, isV2)) {
    throw new Error(
      "Detached .hdr/.img pairs are not supported — use a single .nii or .nii.gz file.",
    );
  }

  let datatypeCode: number;
  let bitpix: number;
  let dim: Dim8;
  let pixdim: Dim8;
  let voxOffset: number;
  let sclSlope: number;
  let sclInter: number;
  let calMin: number;
  let calMax: number;
  let qformCode: number;
  let sformCode: number;
  let quatern: readonly [number, number, number];
  let qoffset: readonly [number, number, number];
  let srow: SRows;
  let descrip: string;

  if (!isV2) {
    datatypeCode = dv.getInt16(70, le);
    bitpix = dv.getInt16(72, le);
    dim = readDim8(dv, 40, 2, le);
    pixdim = readPixdim8(dv, 76, 4, le);
    voxOffset = dv.getFloat32(108, le);
    sclSlope = dv.getFloat32(112, le);
    sclInter = dv.getFloat32(116, le);
    calMax = dv.getFloat32(124, le);
    calMin = dv.getFloat32(128, le);
    qformCode = dv.getInt16(252, le);
    sformCode = dv.getInt16(254, le);
    quatern = [dv.getFloat32(256, le), dv.getFloat32(260, le), dv.getFloat32(264, le)];
    qoffset = [dv.getFloat32(268, le), dv.getFloat32(272, le), dv.getFloat32(276, le)];
    srow = readSRows(dv, 280, 4, le);
    descrip = readZTerm(dv, 148, 80);
  } else {
    datatypeCode = dv.getUint16(12, le);
    bitpix = dv.getUint16(14, le);
    dim = readDim8(dv, 16, 8, le);
    pixdim = readPixdim8(dv, 104, 8, le);
    voxOffset = Number(dv.getBigInt64(168, le));
    sclSlope = dv.getFloat64(176, le);
    sclInter = dv.getFloat64(184, le);
    calMax = dv.getFloat64(192, le);
    calMin = dv.getFloat64(200, le);
    qformCode = dv.getInt32(344, le);
    sformCode = dv.getInt32(348, le);
    quatern = [dv.getFloat64(352, le), dv.getFloat64(360, le), dv.getFloat64(368, le)];
    qoffset = [dv.getFloat64(376, le), dv.getFloat64(384, le), dv.getFloat64(392, le)];
    srow = readSRows(dv, 400, 8, le);
    descrip = readZTerm(dv, 240, 80);
  }

  if (!sclSlope || !Number.isFinite(sclSlope)) sclSlope = 1;
  if (!Number.isFinite(sclInter)) sclInter = 0;

  const entry = entryFor(datatypeCode);

  // `|| 1` is deliberate leniency for headers that zero an unused dimension.
  const nx = checkDim("dim[1]", dim[1] || 1);
  const ny = checkDim("dim[2]", dim[2] || 1);
  const nz = checkDim("dim[3]", dim[3] || 1);
  const nt = checkDim("dim[4]", dim[0] >= 4 && dim[4] > 0 ? dim[4] : 1);

  const nElem = nx * ny * nz * nt;
  if (!Number.isSafeInteger(nElem)) {
    throw new Error(`Invalid NIfTI header: voxel count ${nElem} is out of range.`);
  }
  if (!Number.isInteger(voxOffset) || voxOffset < 0) {
    throw new Error(`Invalid NIfTI header: vox_offset is ${voxOffset}.`);
  }
  const dataEnd = voxOffset + nElem * entry.bytes;
  if (!Number.isSafeInteger(dataEnd) || dataEnd > buf.byteLength) {
    throw new Error(
      `Truncated NIfTI file: header declares ${nElem} ${entry.name} voxels ending at byte ` +
        `${dataEnd}, but the file is ${buf.byteLength} bytes.`,
    );
  }

  return {
    isV2,
    littleEndian: le,
    datatypeCode,
    bitpix,
    dim,
    pixdim,
    voxOffset,
    sclSlope,
    sclInter,
    calMin,
    calMax,
    qformCode,
    sformCode,
    quatern,
    qoffset,
    srow,
    descrip,
    nx,
    ny,
    nz,
    nt,
    entry,
  };
}
