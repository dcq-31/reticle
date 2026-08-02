import { ungzip } from "pako";

import { readTypedArrayBigEndian, viewTypedArray } from "@/lib/imaging/nifti/datatypes";
import { parseHeader, type NiftiHeader } from "@/lib/imaging/nifti/header";
import { makeVolume } from "@/lib/imaging/nifti/volume";
import type { FormatAdapter, Volume } from "@/lib/imaging/types";

const GZIP_MAGIC = [0x1f, 0x8b] as const;

function looksGzipped(head: Uint8Array): boolean {
  return head.length >= 2 && head[0] === GZIP_MAGIC[0] && head[1] === GZIP_MAGIC[1];
}

function looksNifti(name: string, head: Uint8Array): boolean {
  const lower = name.toLowerCase();
  if (lower.endsWith(".nii") || lower.endsWith(".nii.gz") || lower.endsWith(".hdr")) {
    return true;
  }
  // Fall back to sniffing the header size word at offset 0.
  if (head.length >= 4) {
    const dv = new DataView(head.buffer, head.byteOffset, 4);
    const le = dv.getInt32(0, true);
    const be = dv.getInt32(0, false);
    if (le === 348 || le === 540 || be === 348 || be === 540) return true;
  }
  return looksGzipped(head);
}

/**
 * Parse an already-in-memory NIfTI buffer (possibly gzipped).
 *
 * Pure: no DOM access, no worker postMessage. Safe to call from main thread
 * or inside a Web Worker.
 */
export function parseNiftiBuffer(buffer: ArrayBuffer, name: string): Volume {
  let buf = buffer;
  const head = new Uint8Array(buf, 0, Math.min(buf.byteLength, 4));
  if (name.toLowerCase().endsWith(".gz") || looksGzipped(head)) {
    const inflated = ungzip(new Uint8Array(buf));
    buf = inflated.buffer.slice(inflated.byteOffset, inflated.byteOffset + inflated.byteLength);
  }

  const header: NiftiHeader = parseHeader(buf);
  const nElem = header.nx * header.ny * header.nz * header.nt;

  let data = viewTypedArray(header.entry, buf, header.voxOffset, nElem);
  if (!header.littleEndian && header.entry.bytes > 1) {
    data = readTypedArrayBigEndian(header.entry, buf, header.voxOffset, nElem);
  }

  return makeVolume(header, data, name, {
    details: niftiDetailsFor(header),
  });
}

function niftiDetailsFor(h: NiftiHeader): Record<string, string> {
  const provenance = h.sformCode > 0 ? "sform" : h.qformCode > 0 ? "qform" : "pixdim";
  const out: Record<string, string> = {
    Format: h.isV2 ? "NIfTI-2" : "NIfTI-1",
    Datatype: `${h.entry.name} (${h.bitpix}-bit)`,
    Orient: `(from ${provenance})`,
    Endian: h.littleEndian ? "little" : "big",
  };
  if (h.descrip) out.Descrip = h.descrip.slice(0, 40);
  return out;
}

export const niftiAdapter: FormatAdapter = {
  canLoad(file) {
    return looksNifti(file.name, file.head);
  },
  async load(file) {
    const buf = await file.arrayBuffer();
    return [parseNiftiBuffer(buf, file.name)];
  },
};
