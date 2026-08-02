import {
  BackSide,
  BoxGeometry,
  DataTexture,
  GLSL3,
  LinearFilter,
  Mesh,
  RGBAFormat,
  ShaderMaterial,
  UnsignedByteType,
  Vector3,
  type IUniform,
} from "three";

import { FRAG_SHADER, VERT_SHADER } from "@/lib/render/volume3d/shaders";
import { lutBytesToRgba } from "@/lib/render/volume3d/texture";

export interface VolumeUniforms {
  uData: IUniform<unknown>;
  uLut: IUniform<DataTexture>;
  uAspect: IUniform<Vector3>;
  uVolMin: IUniform<number>;
  uVolRange: IUniform<number>;
  uWinLo: IUniform<number>;
  uWinWidth: IUniform<number>;
  uMode: IUniform<number>;
  uDensity: IUniform<number>;
  uThresh: IUniform<number>;
  uSteps: IUniform<number>;
  uShade: IUniform<number>;
  uCam: IUniform<Vector3>;
}

export interface VolumeMaterialBundle {
  readonly material: ShaderMaterial;
  readonly uniforms: VolumeUniforms;
  readonly lutTexture: DataTexture;
  readonly mesh: Mesh<BoxGeometry, ShaderMaterial>;
  /** Disposes the material, LUT texture, and mesh geometry. */
  dispose(): void;
}

/**
 * Build the back-faced box mesh + ShaderMaterial that drives the raycaster.
 *
 * The mesh starts as a unit cube; `useVolumeRenderer` swaps its geometry to
 * match the volume's physical aspect once a texture is built.
 */
export function createVolumeMaterial(initialLut: Uint8Array): VolumeMaterialBundle {
  const lutTexture = new DataTexture(
    lutBytesToRgba(initialLut),
    256,
    1,
    RGBAFormat,
    UnsignedByteType,
  );
  lutTexture.minFilter = LinearFilter;
  lutTexture.magFilter = LinearFilter;
  lutTexture.needsUpdate = true;

  const uniforms: VolumeUniforms = {
    uData: { value: null },
    uLut: { value: lutTexture },
    uAspect: { value: new Vector3(1, 1, 1) },
    uVolMin: { value: 0 },
    uVolRange: { value: 1 },
    uWinLo: { value: 0 },
    uWinWidth: { value: 1 },
    uMode: { value: 1 },
    uDensity: { value: 1.2 },
    uThresh: { value: 0.12 },
    uSteps: { value: 256 },
    uShade: { value: 1 },
    uCam: { value: new Vector3() },
  };

  const material = new ShaderMaterial({
    glslVersion: GLSL3,
    uniforms: uniforms as unknown as Record<string, IUniform>,
    vertexShader: VERT_SHADER,
    fragmentShader: FRAG_SHADER,
    transparent: true,
    side: BackSide,
    depthTest: false,
    depthWrite: false,
  });

  const geometry = new BoxGeometry(1, 1, 1);
  const mesh = new Mesh(geometry, material);

  return {
    material,
    uniforms,
    lutTexture,
    mesh,
    dispose() {
      material.dispose();
      lutTexture.dispose();
      mesh.geometry.dispose();
    },
  };
}

/** Replace LUT pixel data in-place; cheaper than recreating the texture. */
export function updateLutTexture(lutTexture: DataTexture, lutBytes: Uint8Array): void {
  const rgba = lutBytesToRgba(lutBytes);
  const dst = lutTexture.image.data as Uint8Array;
  dst.set(rgba);
  lutTexture.needsUpdate = true;
}
