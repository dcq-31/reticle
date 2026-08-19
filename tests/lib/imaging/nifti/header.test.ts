import { describe, expect, it } from "vitest";

import { detectEndian, parseHeader } from "@/lib/imaging/nifti/header";

import { buildNifti1Buffer } from "../../../fixtures/nifti";

describe("detectEndian", () => {
  it("identifies little-endian NIfTI-1", () => {
    const buf = new ArrayBuffer(8);
    new DataView(buf).setInt32(0, 348, true);
    const r = detectEndian(new DataView(buf));
    expect(r).toEqual({ littleEndian: true, hdrSize: 348 });
  });

  it("identifies big-endian NIfTI-2", () => {
    const buf = new ArrayBuffer(8);
    new DataView(buf).setInt32(0, 540, false);
    const r = detectEndian(new DataView(buf));
    expect(r).toEqual({ littleEndian: false, hdrSize: 540 });
  });

  it("returns null for non-NIfTI input", () => {
    const buf = new ArrayBuffer(8);
    new DataView(buf).setInt32(0, 0xdeadbeef, true);
    expect(detectEndian(new DataView(buf))).toBeNull();
  });
});

describe("parseHeader (NIfTI-1)", () => {
  it("reads dims, datatype, voxOffset, sclSlope", () => {
    const buf = buildNifti1Buffer({
      nx: 4,
      ny: 5,
      nz: 6,
      datatypeCode: 16,
      data: new Float32Array(4 * 5 * 6),
    });
    const h = parseHeader(buf);
    expect(h.isV2).toBe(false);
    expect(h.littleEndian).toBe(true);
    expect(h.nx).toBe(4);
    expect(h.ny).toBe(5);
    expect(h.nz).toBe(6);
    expect(h.nt).toBe(1);
    expect(h.datatypeCode).toBe(16);
    expect(h.entry.name).toBe("float32");
    expect(h.bitpix).toBe(32);
    expect(h.voxOffset).toBe(352);
    expect(h.sclSlope).toBe(1);
  });

  it("treats scl_slope of 0 as 1 (NIfTI default)", () => {
    const buf = buildNifti1Buffer({
      nx: 2,
      ny: 2,
      nz: 2,
      datatypeCode: 16,
      data: new Float32Array(8),
    });
    new DataView(buf).setFloat32(112, 0, true);
    const h = parseHeader(buf);
    expect(h.sclSlope).toBe(1);
  });

  it("parses an sform when present", () => {
    const buf = buildNifti1Buffer({
      nx: 2,
      ny: 2,
      nz: 2,
      datatypeCode: 2,
      data: new Uint8Array(8),
      sform: [
        [1.5, 0, 0, -10],
        [0, 1.5, 0, -20],
        [0, 0, 2, 5],
      ],
    });
    const h = parseHeader(buf);
    expect(h.sformCode).toBe(1);
    expect(h.srow[0]).toEqual([1.5, 0, 0, -10]);
    expect(h.srow[2]).toEqual([0, 0, 2, 5]);
  });

  it("throws on a bad header magic", () => {
    const buf = new ArrayBuffer(348);
    new DataView(buf).setInt32(0, 123, true);
    expect(() => parseHeader(buf)).toThrow(/Not a NIfTI/);
  });

  it("throws on unsupported datatype", () => {
    const buf = buildNifti1Buffer({
      nx: 1,
      ny: 1,
      nz: 1,
      datatypeCode: 2,
      data: new Uint8Array(1),
    });
    new DataView(buf).setInt16(70, 1024, true); // bogus datatype
    expect(() => parseHeader(buf)).toThrow(/Unsupported NIfTI datatype/);
  });
});

describe("parseHeader validation", () => {
  function validBuffer(): ArrayBuffer {
    return buildNifti1Buffer({
      nx: 4,
      ny: 4,
      nz: 4,
      datatypeCode: 16,
      data: new Float32Array(4 * 4 * 4),
    });
  }

  it("rejects a buffer too small to hold the size word", () => {
    expect(() => parseHeader(new ArrayBuffer(2))).toThrow(/only 2 bytes/);
  });

  it("rejects a buffer shorter than the declared header size", () => {
    const buf = new ArrayBuffer(100);
    new DataView(buf).setInt32(0, 348, true);
    expect(() => parseHeader(buf)).toThrow(/Truncated NIfTI header/);
  });

  it("rejects a negative dimension", () => {
    const buf = validBuffer();
    new DataView(buf).setInt16(42, -4, true); // dim[1]
    expect(() => parseHeader(buf)).toThrow(/dim\[1\] is -4/);
  });

  it("rejects a fractional vox_offset", () => {
    const buf = validBuffer();
    new DataView(buf).setFloat32(108, 352.5, true);
    expect(() => parseHeader(buf)).toThrow(/vox_offset is 352\.5/);
  });

  it("rejects a file whose voxel data is truncated", () => {
    const full = validBuffer();
    const truncated = full.slice(0, full.byteLength - 32);
    expect(() => parseHeader(truncated)).toThrow(/Truncated NIfTI file/);
  });

  it("accepts a file whose voxel data exactly fills the buffer", () => {
    expect(() => parseHeader(validBuffer())).not.toThrow();
  });
});
