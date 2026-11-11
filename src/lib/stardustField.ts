import { escapeStart, radialEscapeSpeed } from './whiteHoleOptics'

type Position = { x: number; y: number }
type Point = Position & { z: number }
type Ejecta = { position: Point; direction: Point; radius: number; energy: number }

export type StardustPointer = Position & { vx: number; vy: number; radius: number }
export type StardustOrigin = Position & {
  radius: number
  project: (point: Point, target: Position) => void
}

type Particle = Position & {
  vx: number
  vy: number
  flow: Ejecta | null
  departureAge: number
  trail: Float32Array
  trailIndex: number
  trailPoints: number
  trailTime: number
  age: number
  life: number
  size: number
  shade: number
  flash: number
  reflection: number
}

const daylight = ['#585858', '#747474', '#898989', '#9c9c9c']
const night = ['#b0b0b0', '#c5c5c5', '#d9d9d9', '#efefef']
const trailPalettes = [daylight, night].map(palette => palette.map(color => [color + '00', color + '50', color]))

function emit(): Particle {
  const z = 2 * Math.random() - 1
  const spread = Math.sqrt(1 - z * z)
  const azimuth = 2 * Math.PI * Math.random()
  const direction = { x: Math.cos(azimuth) * spread, y: Math.sin(azimuth) * spread, z }
  const flow: Ejecta = {
    direction, radius: escapeStart, energy: 1.05 + Math.random() ** 1.24 * 1.17,
    position: { x: direction.x * escapeStart, y: direction.y * escapeStart, z: direction.z * escapeStart },
  }
  const trail = new Float32Array((5 + Math.floor(Math.random() * 7)) * 3)
  trail[0] = flow.position.x
  trail[1] = flow.position.y
  trail[2] = flow.position.z
  return {
    x: 0, y: 0, vx: 0, vy: 0, flow, departureAge: 0,
    trail, trailIndex: 0, trailPoints: 1, trailTime: 0,
    age: 0, life: 5.3 + Math.random() * 3.2, size: 0.52 + Math.random() ** 2.6 * 0.98,
    shade: Math.floor(Math.random() * daylight.length), flash: 0, reflection: 1,
  }
}

function moveFree(particle: Particle, elapsed: number, width: number, height: number, pointer: StardustPointer | null) {
  const previousVX = particle.vx
  const previousVY = particle.vy
  const drag = Math.exp(-elapsed * 0.07)
  particle.vx *= drag
  particle.vy *= drag
  particle.x += (previousVX + particle.vx) * elapsed / 2
  particle.y += (previousVY + particle.vy) * elapsed / 2
  const { size } = particle
  const right = width - size
  const bottom = height - size

  if (pointer) {
    const dx = particle.x - pointer.x
    const dy = particle.y - pointer.y
    const reach = pointer.radius + size
    const distance = Math.hypot(dx, dy)
    if (distance < reach) {
      let nx = distance > 0.001 ? dx / distance : 1
      let ny = distance > 0.001 ? dy / distance : 0
      if (pointer.x + nx * reach < size || pointer.x + nx * reach > right) nx *= -1
      if (pointer.y + ny * reach < size || pointer.y + ny * reach > bottom) ny *= -1
      particle.x = pointer.x + nx * reach
      particle.y = pointer.y + ny * reach
      const approach = (particle.vx - pointer.vx * 0.42) * nx + (particle.vy - pointer.vy * 0.42) * ny
      const impulse = Math.max(28, -1.86 * approach)
      particle.vx += nx * impulse
      particle.vy += ny * impulse
      const speed = Math.hypot(particle.vx, particle.vy)
      const speedLimit = Math.max(420, Math.hypot(previousVX, previousVY))
      if (speed > speedLimit) {
        particle.vx *= speedLimit / speed
        particle.vy *= speedLimit / speed
      }
      particle.flash = 1
    }
  }

  const bouncedX = particle.x < size || particle.x > right
  const bouncedY = particle.y < size || particle.y > bottom
  if (bouncedX) {
    particle.x = Math.max(size, Math.min(right, particle.x))
    particle.vx = (particle.x === size ? 1 : -1) * Math.abs(particle.vx) * 0.82
  }
  if (bouncedY) {
    particle.y = Math.max(size, Math.min(bottom, particle.y))
    particle.vy = (particle.y === size ? 1 : -1) * Math.abs(particle.vy) * 0.82
  }
  if (bouncedX || bouncedY) particle.reflection *= 0.35
}

export function createStardustField(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d')
  if (!context) return null
  const particles: Particle[] = []
  const point: Point = { x: 0, y: 0, z: 0 }
  const projected: Position = { x: 0, y: 0 }
  let width = 0
  let height = 0
  let limit = 0
  let started = false
  let cachedMask: (Position & { radius: number; gradient: CanvasGradient }) | null = null

  function trailPoint(particle: Particle, index: number, origin: StardustOrigin | null) {
    point.x = particle.trail[index]
    point.y = particle.trail[index + 1]
    point.z = particle.trail[index + 2]
    if (particle.flow && origin) origin.project(point, projected)
    else {
      projected.x = point.x
      projected.y = point.y
    }
    return projected
  }

  function move(particle: Particle, elapsed: number, origin: StardustOrigin | null, pointer: StardustPointer | null) {
    const flow = particle.flow
    particle.age += elapsed
    if (flow && origin) {
      const speed = radialEscapeSpeed(flow.radius, flow.energy)
      flow.radius += radialEscapeSpeed(flow.radius + speed * elapsed / 2, flow.energy) * elapsed
      const { direction, position } = flow
      position.x = direction.x * flow.radius
      position.y = direction.y * flow.radius
      position.z = direction.z * flow.radius
      origin.project(flow.position, particle)
      if (flow.radius >= 5.3) {
        const horizon = 0.008
        const nextRadius = flow.radius + speed * horizon
        point.x = direction.x * nextRadius
        point.y = direction.y * nextRadius
        point.z = direction.z * nextRadius
        origin.project(point, projected)
        particle.vx = (projected.x - particle.x) / horizon
        particle.vy = (projected.y - particle.y) / horizon
        const capacity = particle.trail.length / 3
        const first = (particle.trailIndex + capacity + 1 - particle.trailPoints) % capacity
        for (let sample = 0; sample < particle.trailPoints; sample++) {
          const index = (first + sample) % capacity * 3
          const screen = trailPoint(particle, index, origin)
          particle.trail[index] = screen.x
          particle.trail[index + 1] = screen.y
        }
        particle.flow = null
        particle.departureAge = particle.age
      }
    } else {
      moveFree(particle, elapsed, width, height, pointer)
    }

    const interval = particle.flow ? 0.019 : 0.030
    particle.trailTime += elapsed
    if (particle.trailTime >= interval) {
      const capacity = particle.trail.length / 3
      particle.trailTime %= interval
      particle.trailIndex = (particle.trailIndex + 1) % capacity
      particle.trailPoints = Math.min(capacity, particle.trailPoints + 1)
      const index = particle.trailIndex * 3
      const position = particle.flow?.position ?? particle
      particle.trail[index] = position.x
      particle.trail[index + 1] = position.y
      particle.trail[index + 2] = particle.flow?.position.z ?? 0
    }
    particle.flash *= Math.exp(-elapsed * 5.2)
  }

  return {
    resize(nextWidth: number, nextHeight: number) {
      if (nextWidth < 8 || nextHeight < 8) return
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(2_200_000 / (nextWidth * nextHeight)))
      const sx = width ? nextWidth / width : 1
      const sy = height ? nextHeight / height : 1
      for (const particle of particles) {
        if (particle.flow) continue
        particle.x *= sx
        particle.y *= sy
        particle.vx *= sx
        particle.vy *= sy
        for (let index = 0; index < particle.trail.length; index += 3) {
          particle.trail[index] *= sx
          particle.trail[index + 1] *= sy
        }
      }
      width = nextWidth
      height = nextHeight
      limit = Math.min(136, Math.max(40, Math.round(width * height / 9800)))
      particles.length = Math.min(limit, particles.length)
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      cachedMask = null
      context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0)
      context.lineCap = 'round'
      context.lineJoin = 'round'
    },
    render(elapsed: number, origin: StardustOrigin | null, pointer: StardustPointer | null, dark: boolean) {
      if (!width || !height) return
      if (origin && !started) {
        for (let index = 0; index < limit; index++) {
          const age = Math.random() * 5.6
          const particle = emit()
          while (particle.age + 0.025 < age) move(particle, 0.025, origin, null)
          particles.push(particle)
        }
        started = true
      }
      if (origin && particles.length < limit) particles.push(emit())

      context.clearRect(0, 0, width, height)
      const palette = trailPalettes[Number(dark)]
      const inner = origin ? origin.radius * 0.49 : 0
      for (let index = particles.length - 1; index >= 0; index--) {
        const particle = particles[index]
        if (particle.age >= particle.life) {
          if (origin) particles[index] = emit()
          else particles.splice(index, 1)
          continue
        }
        if (particle.flow && !origin) continue
        move(particle, elapsed, origin, pointer)
        if (particle.flow && origin) {
          // A perspective projection of the radial trail stays between the source and the particle head.
          const hidden = inner - particle.size - 2
          const dx = particle.x - origin.x
          const dy = particle.y - origin.y
          if (hidden > 0 && dx * dx + dy * dy <= hidden * hidden) continue
        }
        const fade = Math.min(1, particle.age / 0.26, (particle.life - particle.age) / 1.05)
        const energy = particle.flow
          ? 0.37 + 0.12 * Math.min(1, particle.flow.radius / 5.3)
          : 0.16 + 0.33 * Math.exp(-(particle.age - particle.departureAge) * 0.77)
        const opacity = Math.min(1, Math.max(0, fade) * ((0.55 + particle.size * 0.13) * energy + particle.flash * 0.16))
        const [tailColor, middleColor, color] = palette[particle.shade]

        if (particle.trailPoints > 1 && particle.reflection > 0.03) {
          const capacity = particle.trail.length / 3
          const start = (particle.trailIndex + capacity + 1 - particle.trailPoints) % capacity
          const tail = trailPoint(particle, start * 3, origin)
          const gradient = context.createLinearGradient(tail.x, tail.y, particle.x, particle.y)
          gradient.addColorStop(0, tailColor)
          gradient.addColorStop(0.60, middleColor)
          gradient.addColorStop(1, color)
          context.strokeStyle = gradient
          context.lineWidth = 0.34 + particle.size * 0.59
          context.globalAlpha = opacity * 0.81 * particle.reflection
          context.beginPath()
          context.moveTo(tail.x, tail.y)
          let previousX = tail.x
          let previousY = tail.y
          for (let sample = 1; sample < particle.trailPoints; sample++) {
            const { x, y } = trailPoint(particle, (start + sample) % capacity * 3, origin)
            context.quadraticCurveTo(previousX, previousY, (previousX + x) / 2, (previousY + y) / 2)
            previousX = x
            previousY = y
          }
          context.quadraticCurveTo(previousX, previousY, particle.x, particle.y)
          context.stroke()
        }

        context.fillStyle = color
        context.globalAlpha = opacity * (0.58 + 0.42 * particle.reflection)
        context.beginPath()
        context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2)
        context.fill()
        if (particle.flash > 0.23) {
          context.globalAlpha = opacity * particle.flash * 0.32
          context.beginPath()
          context.arc(particle.x, particle.y, particle.size * (2.2 + 1.8 * (1 - particle.flash)), 0, Math.PI * 2)
          context.fill()
        }
      }
      context.globalAlpha = 1
      if (origin) {
        const outer = origin.radius * 0.65
        if (!cachedMask || cachedMask.x !== origin.x || cachedMask.y !== origin.y || cachedMask.radius !== origin.radius) {
          const gradient = context.createRadialGradient(origin.x, origin.y, inner, origin.x, origin.y, outer)
          gradient.addColorStop(0, '#000')
          gradient.addColorStop(1, '#0000')
          cachedMask = { x: origin.x, y: origin.y, radius: origin.radius, gradient }
        }
        context.globalCompositeOperation = 'destination-out'
        context.fillStyle = cachedMask.gradient
        context.fillRect(origin.x - outer, origin.y - outer, outer * 2, outer * 2)
        context.globalCompositeOperation = 'source-over'
      }
    },
  }
}
