import { Vector3, type PerspectiveCamera } from "three";

/** Default orbit pose (slight angle, looking down at the volume). */
export const DEFAULT_ORBIT = {
  theta: -0.65,
  phi: 1.18,
  radius: 2.4,
} as const;

/** Mutable orbit pose around a target point. */
export interface OrbitState {
  theta: number;
  phi: number;
  radius: number;
  target: Vector3;
}

export function createOrbitState(): OrbitState {
  return {
    theta: DEFAULT_ORBIT.theta,
    phi: DEFAULT_ORBIT.phi,
    radius: DEFAULT_ORBIT.radius,
    target: new Vector3(0, 0, 0),
  };
}

export function resetOrbit(orbit: OrbitState): void {
  orbit.theta = DEFAULT_ORBIT.theta;
  orbit.phi = DEFAULT_ORBIT.phi;
  orbit.radius = DEFAULT_ORBIT.radius;
  orbit.target.set(0, 0, 0);
}

/**
 * Place `camera` at the orbit's spherical position around its target and
 * orient it to look at the target. Y-up convention.
 */
export function placeCameraOnOrbit(camera: PerspectiveCamera, orbit: OrbitState): void {
  const sp = Math.sin(orbit.phi);
  const cp = Math.cos(orbit.phi);
  camera.position.set(
    orbit.target.x + orbit.radius * sp * Math.sin(orbit.theta),
    orbit.target.y + orbit.radius * cp,
    orbit.target.z + orbit.radius * sp * Math.cos(orbit.theta),
  );
  camera.up.set(0, 1, 0);
  camera.lookAt(orbit.target);
  camera.updateMatrixWorld();
}

export const ORBIT_PHI_MIN = 0.05;
export const ORBIT_PHI_MAX = Math.PI - 0.05;
export const ORBIT_RADIUS_MIN = 0.6;
export const ORBIT_RADIUS_MAX = 8;
