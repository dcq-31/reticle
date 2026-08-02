import { makeVolume } from "@/lib/imaging/nifti/volume";
import { entryFor } from "@/lib/imaging/nifti/datatypes";
import type { NiftiHeader, Dim8, SRows } from "@/lib/imaging/nifti/header";
import type { Volume } from "@/lib/imaging/types";

/**
 * Build a synthetic brain phantom volume. Used as the on-mount sample and as
 * a fixture for tests that want a realistic-shaped volume without disk I/O.
 *
 * Geometry is deterministic; intensity has a small Math.random()-based jitter.
 * Pass `seed` for reproducible jitter.
 */
export function makeDemoVolume(seed?: number): Volume {
  const nx = 140;
  const ny = 172;
  const nz = 146;
  const data = new Float32Array(nx * ny * nz);

  const cx = nx / 2;
  const cy = ny / 2 - 4;
  const cz = nz / 2 + 6;
  const Rx = 54;
  const Ry = 70;
  const Rz = 58;

  const rand = seed === undefined ? Math.random : mulberry32(seed);
  const noise = (x: number, y: number, z: number): number =>
    (Math.sin(x * 0.7) * Math.cos(y * 0.5) + Math.sin(z * 0.6 + x * 0.2)) * 0.5;

  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const dx = (x - cx) / Rx;
        const dy = (y - cy) / Ry;
        const dz = (z - cz) / Rz;
        const e = dx * dx + dy * dy + dz * dz;
        let val = 0;
        if (e < 1.0) {
          if (e > 0.86) {
            val = 120 + noise(x, y, z) * 25;
          } else {
            const gyri = Math.sin(x * 0.9) * Math.sin(y * 0.8) * Math.sin(z * 0.85);
            val = 300 + gyri * 60 + noise(x, y, z) * 40;
            if (e > 0.62) val = 230 + gyri * 45;
            const vx = (x - cx) / 12;
            const vy = (y - cy + 6) / 26;
            const vz = (z - cz - 2) / 9;
            if (vx * vx + vy * vy + vz * vz < 1) val = 40 + noise(x, y, z) * 12;
            const lx = (x - cx - 20) / 6;
            const ly = (y - cy - 22) / 6;
            const lz = (z - cz - 4) / 6;
            if (lx * lx + ly * ly + lz * lz < 1) val = 560;
          }
          val += (rand() - 0.5) * 14;
        }
        if (val < 0) val = 0;
        data[x + y * nx + z * nx * ny] = val;
      }
    }
  }

  const srow: SRows = [
    [1.2, 0, 0, -cx * 1.2],
    [0, 1.2, 0, -cy * 1.2],
    [0, 0, 1.2, -cz * 1.2],
  ];
  const dim: Dim8 = [3, nx, ny, nz, 1, 1, 1, 1];
  const pixdim: Dim8 = [1, 1.2, 1.2, 1.2, 0, 0, 0, 0];

  const h: NiftiHeader = {
    isV2: false,
    littleEndian: true,
    datatypeCode: 16,
    bitpix: 32,
    dim,
    pixdim,
    voxOffset: 352,
    sclSlope: 1,
    sclInter: 0,
    calMin: 0,
    calMax: 0,
    qformCode: 0,
    sformCode: 1,
    quatern: [0, 0, 0],
    qoffset: [0, 0, 0],
    srow,
    descrip: "Synthetic phantom",
    nx,
    ny,
    nz,
    nt: 1,
    entry: entryFor(16),
  };

  return makeVolume(h, data, "sample_brain.nii", {
    details: { Descrip: "Synthetic phantom" },
  });
}

/** Tiny seeded PRNG; deterministic jitter for tests. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
