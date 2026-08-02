/**
 * GLSL3 raycaster preserved character-for-character from the original viewer.
 *
 * The vertex shader passes box-local position to the fragment shader; the
 * fragment shader ray-marches in box-local space, sampling a 3D R8 texture
 * for the volume and a 2D LUT for color mapping.
 *
 * Modes:
 *   0 = MIP (maximum-intensity projection)
 *   1 = composite DVR (alpha-blended volume rendering)
 *   2 = iso-surface (first sample above threshold)
 *
 * GLSL3 (WebGL2) requires an explicit fragment output declaration — we use
 * `out vec4 outColor;` rather than `gl_FragColor` so the shader compiles
 * under modern Three.js without relying on legacy auto-substitution.
 */

export const VERT_SHADER = /* glsl */ `
out vec3 vLocal;
void main() {
  vLocal = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const FRAG_SHADER = /* glsl */ `
precision highp float;
precision highp sampler3D;
in vec3 vLocal;
out vec4 outColor;

uniform vec3 uAspect;        // box full dims (max axis = 1)
uniform sampler3D uData;     // R8, normalized to [0,1] over [volMin, volMax]
uniform sampler2D uLut;      // 256x1 RGBA colormap
uniform float uVolMin, uVolRange, uWinLo, uWinWidth;
uniform int   uMode;         // 0 MIP, 1 composite, 2 iso
uniform float uDensity, uThresh, uSteps;
uniform int   uShade;
uniform vec3  uCam;          // camera position in box-local space

vec3 toTex(vec3 p) { return p / uAspect + 0.5; }
float rawNorm(vec3 p) { return texture(uData, toTex(p)).r; }
float disp(float n) {
  float v = n * uVolRange + uVolMin;
  return clamp((v - uWinLo) / uWinWidth, 0.0, 1.0);
}
vec3 lut(float t) { return texture(uLut, vec2(clamp(t, 0.0, 1.0), 0.5)).rgb; }

vec2 hitBox(vec3 ro, vec3 rd) {
  vec3 inv = 1.0 / rd;
  vec3 t0 = (-uAspect * 0.5 - ro) * inv;
  vec3 t1 = ( uAspect * 0.5 - ro) * inv;
  vec3 tmin = min(t0, t1), tmax = max(t0, t1);
  return vec2(
    max(max(tmin.x, tmin.y), tmin.z),
    min(min(tmax.x, tmax.y), tmax.z)
  );
}

// Gradient of the *displayed* intensity (central differences). Used for shading.
vec3 grad(vec3 p, vec3 h) {
  float dx = disp(rawNorm(p + vec3(h.x, 0, 0))) - disp(rawNorm(p - vec3(h.x, 0, 0)));
  float dy = disp(rawNorm(p + vec3(0, h.y, 0))) - disp(rawNorm(p - vec3(0, h.y, 0)));
  float dz = disp(rawNorm(p + vec3(0, 0, h.z))) - disp(rawNorm(p - vec3(0, 0, h.z)));
  return vec3(dx, dy, dz);
}

vec3 shade(vec3 base, vec3 p, vec3 rd, vec3 h) {
  vec3 g = grad(p, h);
  if (length(g) < 1e-5) return base;
  vec3 N = normalize(-g);
  vec3 L = normalize(uCam - p);   // head-light
  float diff = max(dot(N, L), 0.0);
  vec3 H = normalize(L - rd);
  float spec = pow(max(dot(N, H), 0.0), 24.0);
  return base * (0.35 + 0.65 * diff) + vec3(0.55) * spec * 0.6;
}

void main() {
  vec3 ro = uCam;
  vec3 rd = normalize(vLocal - uCam);
  vec2 t = hitBox(ro, rd);
  if (t.x > t.y) { discard; }
  t.x = max(t.x, 0.0);
  int N = int(uSteps);
  float dt = (t.y - t.x) / float(N);
  // Per-fragment dither to break up step banding.
  float jit = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float tc = t.x + dt * jit;
  vec3 h = uAspect / vec3(textureSize(uData, 0));

  if (uMode == 0) {                                  // ---- MIP ----
    float mx = 0.0;
    for (int i = 0; i < 1024; i++) {
      if (i >= N) break;
      float d = disp(rawNorm(ro + rd * tc));
      mx = max(mx, d);
      tc += dt;
    }
    if (mx <= 0.001) { discard; }
    outColor = vec4(lut(mx), 1.0);

  } else if (uMode == 2) {                           // ---- iso surface ----
    bool hit = false;
    vec3 hp = vec3(0.0);
    for (int i = 0; i < 1024; i++) {
      if (i >= N) break;
      vec3 p = ro + rd * tc;
      if (disp(rawNorm(p)) >= uThresh) { hp = p; hit = true; break; }
      tc += dt;
    }
    if (!hit) { discard; }
    vec3 c = lut(disp(rawNorm(hp)));
    if (uShade == 1) c = shade(c, hp, rd, h);
    outColor = vec4(c, 1.0);

  } else {                                           // ---- composite DVR ----
    vec3 acc = vec3(0.0);
    float A = 0.0;
    for (int i = 0; i < 1024; i++) {
      if (i >= N) break;
      vec3 p = ro + rd * tc;
      float d = disp(rawNorm(p));
      if (d > uThresh) {
        float a = 1.0 - exp(-(d * d) * uDensity * dt * 8.0);
        vec3 c = lut(d);
        if (uShade == 1) c = shade(c, p, rd, h);
        acc += (1.0 - A) * a * c;
        A   += (1.0 - A) * a;
        if (A > 0.985) break;
      }
      tc += dt;
    }
    if (A <= 0.003) { discard; }
    outColor = vec4(acc, A);
  }
}
`;
