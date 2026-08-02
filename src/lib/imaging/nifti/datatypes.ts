import type { Datatype, TypedArray } from "@/lib/imaging/types";

/**
 * NIfTI datatype code (NIfTI-1 spec, field `datatype`).
 * Only the codes we support are listed; encountering any other code throws.
 */
export type NiftiDatatypeCode = 2 | 4 | 8 | 16 | 64 | 256 | 512 | 768;

export type TypedArrayCtor =
  | Uint8ArrayConstructor
  | Int8ArrayConstructor
  | Uint16ArrayConstructor
  | Int16ArrayConstructor
  | Uint32ArrayConstructor
  | Int32ArrayConstructor
  | Float32ArrayConstructor
  | Float64ArrayConstructor;

export interface NiftiDatatypeEntry {
  readonly name: Datatype;
  readonly bytes: 1 | 2 | 4 | 8;
  readonly Arr: TypedArrayCtor;
  readonly read: (dv: DataView, byteOffset: number, littleEndian: boolean) => number;
}

export const DTYPE: Readonly<Record<NiftiDatatypeCode, NiftiDatatypeEntry>> = {
  2: {
    name: "uint8",
    bytes: 1,
    Arr: Uint8Array,
    read: (dv, o) => dv.getUint8(o),
  },
  4: {
    name: "int16",
    bytes: 2,
    Arr: Int16Array,
    read: (dv, o, le) => dv.getInt16(o, le),
  },
  8: {
    name: "int32",
    bytes: 4,
    Arr: Int32Array,
    read: (dv, o, le) => dv.getInt32(o, le),
  },
  16: {
    name: "float32",
    bytes: 4,
    Arr: Float32Array,
    read: (dv, o, le) => dv.getFloat32(o, le),
  },
  64: {
    name: "float64",
    bytes: 8,
    Arr: Float64Array,
    read: (dv, o, le) => dv.getFloat64(o, le),
  },
  256: {
    name: "int8",
    bytes: 1,
    Arr: Int8Array,
    read: (dv, o) => dv.getInt8(o),
  },
  512: {
    name: "uint16",
    bytes: 2,
    Arr: Uint16Array,
    read: (dv, o, le) => dv.getUint16(o, le),
  },
  768: {
    name: "uint32",
    bytes: 4,
    Arr: Uint32Array,
    read: (dv, o, le) => dv.getUint32(o, le),
  },
};

export function isSupportedNiftiCode(code: number): code is NiftiDatatypeCode {
  return code in DTYPE;
}

export function entryFor(code: number): NiftiDatatypeEntry {
  if (!isSupportedNiftiCode(code)) {
    throw new Error(`Unsupported NIfTI datatype code: ${code}`);
  }
  return DTYPE[code];
}

/** Build a typed array view over an existing buffer when alignment permits. */
export function viewTypedArray(
  entry: NiftiDatatypeEntry,
  buffer: ArrayBuffer,
  byteOffset: number,
  length: number,
): TypedArray {
  if (byteOffset % entry.bytes === 0) {
    return new entry.Arr(buffer, byteOffset, length) as TypedArray;
  }
  const sliced = buffer.slice(byteOffset, byteOffset + length * entry.bytes);
  return new entry.Arr(sliced) as TypedArray;
}

/** Allocate a native-endian typed array by reading element-by-element. */
export function readTypedArrayBigEndian(
  entry: NiftiDatatypeEntry,
  buffer: ArrayBuffer,
  byteOffset: number,
  length: number,
): TypedArray {
  const out = new entry.Arr(length) as TypedArray;
  const dv = new DataView(buffer);
  for (let i = 0; i < length; i++) {
    (out as unknown as { [k: number]: number })[i] = entry.read(
      dv,
      byteOffset + i * entry.bytes,
      false,
    );
  }
  return out;
}
