// Schwarzschild coordinates in units of the horizon radius (2GM/c²).
export const cameraDistance = 17
export const cameraSlope = 0.465
export const lensColumns = 2048
export const lensSamples = 42
export const lensRows = 2 * lensSamples + 2
export const lensExtent = 1.19
export const skySamples = 256
export const emissionRadius = 5.9
export const escapeStart = 1.17
export const animationRate = 5.3

type PathPoint = { x: number; z: number; distance: number; weight: number }

function acceleration(u: number) {
  return 1.5 * u * u - u
}

export function radialEscapeSpeed(radius: number, energy: number) {
  const lapseSquared = 1 - 1 / radius
  return animationRate * lapseSquared * Math.sqrt(1 - lapseSquared / (energy * energy))
}

function traceRay(incidence: number, path: PathPoint[]) {
  const impact = cameraDistance * Math.sin(incidence) / Math.sqrt(1 - 1 / cameraDistance)
  let u = 1 / cameraDistance
  let slope = Math.sqrt(Math.max(0, 1 / (impact * impact) - u * u * (1 - u)))
  let angle = 0
  let distance = 0
  path.length = 0

  for (let index = 0; index < 2500; index++) {
    // Null geodesic in the ray's orbital plane: u″ + u = 3u²/2, u = 1/r.
    const step = Math.min(0.015, 0.006 / Math.max(0.08, Math.abs(slope)))
    const halfSlope = slope + acceleration(u) * step / 2
    const nextU = u + halfSlope * step
    if (nextU <= 0) return { angle: angle + step * u / (u - nextU), distance, escaped: true }

    const nextAngle = angle + step * Math.min(1, (1 - u) / Math.max(nextU - u, 1e-10))
    const radius = Math.max(1, 1 / nextU)
    const previousRadius = 1 / u
    if (radius <= emissionRadius || previousRadius <= emissionRadius) {
      const middleRadius = (previousRadius + radius) / 2
      const weight = 1 + 1.65 * Math.exp(-1.8 * (middleRadius - 1.30) ** 2)
      const segment = Math.hypot(
        (radius - previousRadius) / Math.sqrt(Math.max(0.035, 1 - 1 / middleRadius)),
        middleRadius * (nextAngle - angle),
      )
      if (!path.length) {
        path.push({ x: previousRadius * Math.sin(angle), z: previousRadius * Math.cos(angle), distance: 0, weight })
      }
      distance += segment * weight
      path.push({ x: radius * Math.sin(nextAngle), z: radius * Math.cos(nextAngle), distance, weight })
    }

    if (nextU >= 1) return { angle: nextAngle, distance, escaped: false }
    u = nextU
    angle = nextAngle
    slope = halfSlope + acceleration(u) * step / 2
  }
  return { angle, distance, escaped: false }
}

let lensMap: Float32Array | undefined

export function createLensMap() {
  if (lensMap) return lensMap
  const data = new Float32Array(lensColumns * lensRows * 4)
  const path: PathPoint[] = []
  for (let column = 0; column < lensColumns; column++) {
    const screenRadius = lensExtent * (column + 0.5) / lensColumns
    const { angle, distance, escaped } = traceRay(Math.atan(screenRadius * cameraSlope), path)
    const head = column * 4
    data[head] = Math.sin(angle)
    data[head + 1] = Math.cos(angle)
    data[head + 2] = Number(escaped)
    data[head + 3] = distance
    if (distance === 0) continue

    let end = 1
    const interval = distance / lensSamples
    for (let sample = 0; sample < lensSamples; sample++) {
      const position = (sample + 0.5) * interval
      while (path[end].distance < position) end++
      const a = path[end - 1]
      const b = path[end]
      const t = (position - a.distance) / (b.distance - a.distance)
      const offset = ((sample + 1) * lensColumns + column) * 4
      const x = a.x + t * (b.x - a.x)
      const z = a.z + t * (b.z - a.z)
      const radius = Math.fround(Math.hypot(x, z))
      data[offset] = x / radius
      data[offset + 1] = z / radius
      data[offset + 2] = interval / b.weight
      data[offset + 3] = radius
      if (radius < 1.01 || radius >= emissionRadius) continue

      // Travel delay and the redshifted spectrum depend on radius alone, not on the view or the eruption.
      const optics = offset + (lensSamples + 1) * lensColumns * 4
      const shift = Math.sqrt((1 - 1 / radius) / (1 - 1 / cameraDistance))
      const temperature = Math.max(2100, (4900 + 18800 * Math.exp(-1.01 * (radius - 1.15))) * shift)
      const red = 0.59 / Math.expm1(22135 / temperature)
      const green = 1.10 / Math.expm1(27147 / temperature)
      const blue = 2.05 / Math.expm1(31278 / temperature)
      const scale = shift ** 3 / Math.max(red, green, blue)
      data[optics] = red * scale
      data[optics + 1] = green * scale
      data[optics + 2] = blue * scale
      data[optics + 3] = (radius - 1.14 + Math.log(Math.max(radius - 1, 0.018) / 0.14)) / animationRate
    }
  }
  // Continue the background rays outside the emitting volume so the sky spans the viewport.
  const outerIncidence = Math.atan(lensExtent * cameraSlope)
  for (let column = 0; column < skySamples; column++) {
    const incidence = outerIncidence + (Math.PI / 2 - outerIncidence) * column / (skySamples - 1)
    const { angle } = traceRay(incidence, path)
    const offset = ((lensSamples + 1) * lensColumns + column) * 4
    data[offset] = Math.sin(angle)
    data[offset + 1] = Math.cos(angle)
  }
  lensMap = data
  return data
}
