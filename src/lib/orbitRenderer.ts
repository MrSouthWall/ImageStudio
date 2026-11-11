import {
  Camera,
  Data3DTexture,
  DataTexture,
  Euler,
  FloatType,
  LinearFilter,
  Matrix3,
  Matrix4,
  Mesh,
  NearestFilter,
  PlaneGeometry,
  RedFormat,
  RepeatWrapping,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three'
import { cameraDistance, cameraSlope, createLensMap, emissionRadius, lensColumns, lensExtent, lensRows, lensSamples, skySamples } from './whiteHoleOptics'

type Rotation = [number, number, number]
type Position = { x: number; y: number }
type Point = Position & { z: number }

const noiseSize = 48

const screenVertex = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const lightFragment = `
uniform sampler2D uRays;
uniform sampler3D uNoise;
uniform mat3 uView;
uniform float uTime;
uniform float uBurstSeed;
uniform int uEmittingColumns;
varying vec2 vUv;

float noise(vec3 p) {
  vec3 f = fract(p);
  vec3 uv = (floor(p) + f * f * (3.0 - 2.0 * f) + 0.5) / ${noiseSize}.0;
  return texture(uNoise, uv).r;
}

float square(float x) { return x * x; }

void main() {
  vec2 screen = 2.0 * vUv - 1.0;
  float impact = length(screen);
  int column = int(impact / ${lensExtent} * ${lensColumns}.0);
  if (column >= uEmittingColumns) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec3 across = uView * vec3(screen / max(impact, 0.0001), 0.0);
  vec3 toward = uView * vec3(0.0, 0.0, 1.0);
  vec3 radiance = vec3(0.0);
  float opacity = 0.0;
  float structure = 0.0;

  for (int step = 1; step <= ${lensSamples}; step++) {
    vec4 samplePoint = texelFetch(uRays, ivec2(column, step), 0);
    float r = samplePoint.w;
    if (r < 1.01 || r >= ${emissionRadius}) continue;
    vec3 direction = across * samplePoint.x + toward * samplePoint.y;
    vec4 optics = texelFetch(uRays, ivec2(column, step + ${lensSamples + 1}), 0);
    float delay = optics.w;
    float emitted = uTime - delay;
    float coarse = noise(direction * 3.8 + vec3(3.7, 15.1, 7.8));
    vec3 bend = vec3(0.7, -0.5, 0.53) * (coarse - 0.5) * (r - 1.0) * 0.58;
    float folds = noise((direction + bend * 0.32) * 9.7 + vec3(0.3, 0.7, 1.0) * emitted * 0.17);
    float fibres = noise((direction + bend) * (33.0 + 1.6 * r) + vec3(0.62, -0.41, 0.21) * delay);
    float textureValue = 0.38 * coarse + 0.36 * folds + 0.26 * fibres;
    float variation = noise(direction * 3.7 + vec3(0.72, -0.53, 0.91) * emitted + vec3(uBurstSeed, 5.1, 17.8));
    float burst = smoothstep(0.22, 0.77, variation);
    float outer = smoothstep(1.24, 2.72, r);
    float pulse = 0.5 + 0.5 * cos(6.6 * emitted + 6.9 * coarse + 2.7 * folds + outer * (variation - 0.5) * 5.2);
    float wave = smoothstep(0.52, 0.97, pulse) * mix(1.0, 0.63 + 0.59 * burst, outer);
    float filaments = smoothstep(0.41, 0.77, textureValue + 0.09 * wave);
    vec3 drift = 0.30 * vec3(sin(0.77 * emitted + 6.1 * variation),
      cos(0.61 * emitted + 4.9 * variation + 1.7), sin(0.52 * emitted + 5.1 * variation - 0.9));
    vec3 outward = normalize(direction + (0.30 + 0.70 * outer) * drift);
    float spread = 0.78 + 0.49 * variation;
    float plume = (0.58 + 0.66 * burst) * pow(max(0.0, dot(outward, vec3(0.781, 0.524, 0.340))), 8.0 * spread)
      + (0.42 + 0.59 * folds) * pow(max(0.0, dot(outward, vec3(-0.872, -0.265, 0.412))), 10.0 * spread)
      + (0.17 + 0.40 * (1.0 - burst)) * pow(max(0.0, dot(outward, vec3(-0.394, 0.746, -0.536))), 7.0 * spread);
    float veil = exp(-10.0 * abs(dot(direction, vec3(-0.297, 0.889, 0.348)) + 0.25 * (coarse - 0.5)))
      * smoothstep(0.08, 0.76, direction.x + direction.y * 0.34);
    float hotLayer = exp(-square((r - 1.43 - 0.35 * folds - 0.10 * wave) / (0.23 + 0.11 * coarse)));
    float illumination = 0.57 + 0.62 * smoothstep(-0.39, 0.86, dot(direction, vec3(0.50, -0.19, 0.845)));
    float corePattern = smoothstep(0.23, 0.78, coarse * 0.60 + folds * 0.40);
    float inner = exp(-square((r - 1.24) / 0.184)) * (0.41 + 0.99 * corePattern) * illumination;
    float diffuse = exp(-0.35 * (r - 1.35)) * (1.0 - smoothstep(2.89 + 1.17 * burst, ${emissionRadius}, r));
    float ejecta = diffuse * (0.07 + 1.26 * filaments) * (0.013 + 1.58 * plume + 0.68 * veil) * (0.16 + 1.17 * wave);
    float dust = diffuse * (0.017 + 0.49 * plume + 0.47 * veil) * filaments;
    float kernel = hotLayer * (0.20 + 0.89 * filaments + 0.22 * wave) * illumination;
    float crest = exp(-square((r - 1.79 - 0.34 * folds - 0.32 * wave) / 0.53));
    float prominence = crest * (plume * 1.31 + veil * 0.54) * (0.15 + 1.26 * filaments);
    float opticalDepth = samplePoint.z * (0.41 * kernel + 0.43 * ejecta + 0.39 * dust + 0.29 * prominence);
    float transmit = 1.0 - opacity;
    float delta = 1.0 - exp(-opticalDepth);
    vec3 thermal = optics.rgb;
    float shiftCubed = max(thermal.r, max(thermal.g, thermal.b));
    vec3 scattered = mix(vec3(0.17, 0.25, 0.43), vec3(0.61, 0.68, 0.85), wave);
    vec3 hotGas = thermal * (8.0 * kernel + 5.8 * inner + 4.1 * prominence);
    vec3 coldGas = mix(scattered * shiftCubed, thermal, 0.30) * 2.54 * ejecta;
    vec3 localLight = hotGas + coldGas + scattered * dust * 0.69;
    radiance += localLight * transmit * samplePoint.z;
    structure += delta * transmit * (0.52 + 0.48 * filaments);
    opacity += delta * transmit;
    if (opacity > 0.994) break;
  }

  vec3 exposed = 1.0 - exp(-radiance * 0.81);
  gl_FragColor = vec4(exposed, structure);
}
`

const exposureFragment = `
uniform sampler2D uLight;
uniform sampler2D uRays;
uniform mat3 uSkyView;
uniform vec2 uPixel;
uniform vec2 uCenter;
uniform vec2 uFieldScale;
uniform float uLightExtent2;
uniform float uDark;
varying vec2 vUv;

float brightness(vec3 color) { return dot(color, vec3(0.22, 0.68, 0.10)); }

vec3 bloom(vec2 uv, float radius) {
  vec2 d = uPixel * radius;
  vec3 summed = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float angle = float(i) * 0.78539816 + radius * 0.07;
    summed += texture2D(uLight, uv + d * vec2(cos(angle), sin(angle))).rgb;
  }
  return summed * 0.125;
}

vec2 skyUv(vec3 direction) {
  return vec2(0.5 - atan(direction.x, -direction.z) / 6.28318531,
    0.5 + asin(clamp(direction.y, -1.0, 1.0)) / 3.14159265);
}

float starHash(vec2 cell) {
  vec3 key = fract(vec3(cell.xyx) * vec3(0.1031, 0.1030, 0.0973));
  key += dot(key, key.yzx + 33.33);
  return fract((key.x + key.y) * key.z);
}

float starLayer(vec2 uv, vec2 density, float rarity, float size) {
  vec2 grid = uv * density;
  vec2 cell = mod(floor(grid), density);
  float seed = starHash(cell + 7.8);
  vec2 dx = dFdx(grid);
  vec2 dy = dFdy(grid);
  if (seed < rarity) return 0.0;
  vec2 offset = 0.24 + 0.52 * vec2(starHash(cell + 15.3), starHash(cell - 11.4));
  float radius = (0.049 + 0.081 * starHash(cell + 49.4)) * size;
  float footprint = max(length(dx), length(dy));
  float area = abs(dx.x * dy.y - dx.y * dy.x);
  float stretch = footprint * footprint / max(0.00001, area);
  float edge = min(0.235, radius + max(0.015, 0.48 * footprint));
  float coverage = 1.0 - smoothstep(radius * 0.29, edge, length(fract(grid) - offset));
  float flux = 0.16 + 0.84 * starHash(cell + 91.1) * starHash(cell + 43.6);
  return coverage * flux * radius / max(radius, footprint) / (1.0 + 0.19 * max(0.0, stretch - 3.0));
}

float backgroundStars(vec2 screen) {
  float radius = length(screen);
  float rayVisible = 1.0;
  vec2 direction;
  if (radius < ${lensExtent}) {
    float column = clamp(radius / ${lensExtent} * ${lensColumns}.0 - 0.5, 0.0, ${lensColumns - 1}.0);
    int index = int(column);
    vec3 a = texelFetch(uRays, ivec2(index, 0), 0).xyz;
    vec3 b = texelFetch(uRays, ivec2(min(index + 1, ${lensColumns - 1}), 0), 0).xyz;
    float blend = a.z == b.z ? fract(column) : step(0.5, fract(column));
    direction = mix(a.xy, b.xy, blend);
    rayVisible = mix(a.z, b.z, blend);
  } else {
    const float start = ${Math.atan(lensExtent * cameraSlope)};
    float incidence = atan(radius * ${cameraSlope});
    float column = clamp((incidence - start) / (1.570796327 - start), 0.0, 1.0) * ${skySamples - 1}.0;
    int index = int(column);
    vec2 a = texelFetch(uRays, ivec2(index, ${lensSamples + 1}), 0).xy;
    vec2 b = texelFetch(uRays, ivec2(min(index + 1, ${skySamples - 1}), ${lensSamples + 1}), 0).xy;
    direction = mix(a, b, fract(column));
  }
  vec3 skyRay = normalize(uSkyView * vec3(screen * direction.x / max(radius, 0.0001), direction.y));
  vec2 uv = skyUv(skyRay);
  float distant = starLayer(uv, vec2(438.0, 219.0), 0.951, 0.96);
  float bright = starLayer(uv + vec2(0.23, 0.41), vec2(154.0, 77.0), 0.946, 1.33);
  return rayVisible * (0.35 * distant + 0.48 * bright);
}

vec4 exposeBody(vec2 uv) {
  vec4 light = texture2D(uLight, uv);
  vec3 nearGlow = bloom(uv, 2.0);
  vec3 farGlow = bloom(uv, 12.0);
  light.rgb = mix(light.rgb, nearGlow, 0.21);
  vec3 glare = max(vec3(0.0), nearGlow * 0.23 + farGlow * 0.17 - light.rgb * 0.14);
  float grain = 0.008 * (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5);
  if (uDark > 0.5) {
    vec3 exposed = clamp(light.rgb + glare * vec3(1.03, 0.91, 0.83), 0.0, 1.0);
    float alpha = clamp(max(exposed.r, max(exposed.g, exposed.b)) + light.a * 0.37, 0.0, 1.0);
    return vec4(exposed / max(alpha, 0.001) + grain, alpha);
  }
  float luminous = smoothstep(0.12, 0.85, brightness(light.rgb) + 0.19 * brightness(nearGlow));
  float material = light.a * smoothstep(0.034, 0.23, light.a);
  float alpha = clamp(0.86 * material + 0.14 * brightness(glare) + luminous * 0.95, 0.0, 1.0);
  return vec4(vec3(mix(0.27, 0.002, luminous) + grain), alpha);
}

void main() {
  vec2 field = (vUv - uCenter) * uFieldScale;
  float stars = backgroundStars(2.0 * field);
  vec4 body = vec4(0.0);
  if (dot(field, field) < uLightExtent2 && max(abs(field.x), abs(field.y)) < 0.5) {
    body = exposeBody(field + 0.5);
  }
  float skyAlpha = clamp(pow(stars, 0.86) * mix(0.80, 1.18, uDark), 0.0, 0.87) * (1.0 - body.a);
  vec3 skyColor = vec3(mix(0.026, 0.89, uDark));
  float alpha = body.a + skyAlpha;
  vec3 color = (body.rgb * body.a + skyColor * skyAlpha) / max(alpha, 0.001);
  gl_FragColor = vec4(color, alpha);
  #include <colorspace_fragment>
  gl_FragColor = clamp(gl_FragColor, 0.0, 1.0);
  gl_FragColor.rgb *= gl_FragColor.a;
}
`

function createNoiseTexture() {
  const data = new Uint8Array(noiseSize ** 3)
  let seed = 0x2e4c7831
  for (let index = 0; index < data.length; index++) {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
    data[index] = seed >>> 24
  }
  const texture = new Data3DTexture(data, noiseSize, noiseSize, noiseSize)
  texture.format = RedFormat
  texture.minFilter = texture.magFilter = LinearFilter
  texture.wrapS = texture.wrapT = texture.wrapR = RepeatWrapping
  texture.needsUpdate = true
  return texture
}

export function createOrbitRenderer(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('webgl2', { alpha: true, antialias: false, powerPreference: 'low-power' })
  if (!context) return null
  const renderer = new WebGLRenderer({ canvas, context, alpha: true, antialias: false })
  renderer.autoClear = false
  renderer.outputColorSpace = SRGBColorSpace

  const lens = createLensMap()
  const rays = new DataTexture(lens, lensColumns, lensRows, RGBAFormat, FloatType)
  rays.minFilter = rays.magFilter = NearestFilter
  rays.needsUpdate = true
  const noise = createNoiseTexture()

  const camera = new Camera()
  const geometry = new PlaneGeometry(2, 2)
  const buffer = new WebGLRenderTarget(1, 1, { depthBuffer: false, stencilBuffer: false })
  const view = new Matrix3()
  const skyView = new Matrix3()
  const skyOrientation = new Matrix3().setFromMatrix4(new Matrix4().makeRotationFromEuler(new Euler(0.37, 0.93, -0.38)))
  let lastLitColumn = lensColumns - 1
  while (lastLitColumn > 0 && lens[lastLitColumn * 4 + 3] === 0) lastLitColumn--
  const lightExtent = (lastLitColumn + 1) * lensExtent / (2 * lensColumns)
  const tracing = new ShaderMaterial({
    uniforms: {
      uRays: { value: rays }, uNoise: { value: noise }, uView: { value: view },
      uTime: { value: 0 }, uBurstSeed: { value: Math.random() * noiseSize },
      uEmittingColumns: { value: lastLitColumn + 1 },
    },
    vertexShader: screenVertex, fragmentShader: lightFragment, depthTest: false, depthWrite: false,
  })
  const exposure = new ShaderMaterial({
    uniforms: {
      uLight: { value: buffer.texture }, uRays: { value: rays }, uSkyView: { value: skyView },
      uPixel: { value: new Vector2(1, 1) }, uCenter: { value: new Vector2(0.5, 0.5) },
      uFieldScale: { value: new Vector2(1, 1) }, uLightExtent2: { value: 0.25 }, uDark: { value: 0 },
    },
    vertexShader: screenVertex, fragmentShader: exposureFragment, depthTest: false, depthWrite: false,
  })
  const lightScene = new Scene()
  const outputScene = new Scene()
  const light = new Mesh(geometry, tracing)
  const image = new Mesh(geometry, exposure)
  light.frustumCulled = image.frustumCulled = false
  lightScene.add(light)
  outputScene.add(image)
  const rotation = new Euler()
  const matrix = new Matrix4()
  const projection = new Matrix3()
  const projected = new Vector3()

  const draw = () => {
    renderer.setRenderTarget(buffer)
    renderer.render(lightScene, camera)
    renderer.setRenderTarget(null)
    renderer.render(outputScene, camera)
  }

  return {
    resize(width: number, height: number, size: number, deviceRatio: number) {
      const ratio = Math.min(deviceRatio, 1.32, 680 / size)
      renderer.setPixelRatio(Math.min(ratio, Math.sqrt(1_650_000 / (width * height))))
      renderer.setSize(width, height, false)
      const pixels = Math.max(1, Math.floor(size * ratio))
      buffer.setSize(pixels, pixels)
      // Outside this square the volume pass only writes zero. Keep the same sampling grid.
      const inset = Math.max(0, Math.floor(pixels * (0.5 - lightExtent)) - 1)
      buffer.scissor.set(inset, inset, pixels - 2 * inset, pixels - 2 * inset)
      buffer.scissorTest = true
      exposure.uniforms.uPixel.value.set(1 / pixels, 1 / pixels)
      exposure.uniforms.uFieldScale.value.set(width / size, height / size)
      // Allow for the 12-pixel bloom kernel and texture filtering beyond the last emitting ray.
      exposure.uniforms.uLightExtent2.value = (lightExtent + 14 / pixels) ** 2
    },
    project(point: Point, target: Position) {
      projected.set(point.x, point.y, point.z).applyMatrix3(projection)
      const scale = 0.5 / ((cameraDistance - projected.z) * cameraSlope)
      target.x = 0.5 + projected.x * scale
      target.y = 0.5 - projected.y * scale
    },
    render(pose: Rotation, time: number, dark: boolean, centerX: number, centerY: number) {
      view.setFromMatrix4(matrix.makeRotationFromEuler(rotation.set(...pose)))
      skyView.multiplyMatrices(skyOrientation, view)
      projection.copy(view).transpose()
      tracing.uniforms.uTime.value = time
      exposure.uniforms.uDark.value = dark ? 1 : 0
      exposure.uniforms.uCenter.value.set(centerX, 1 - centerY)
      draw()
    },
    dispose() {
      buffer.dispose()
      rays.dispose()
      noise.dispose()
      tracing.dispose()
      exposure.dispose()
      geometry.dispose()
      renderer.dispose()
    },
  }
}

export type OrbitRenderer = ReturnType<typeof createOrbitRenderer>
