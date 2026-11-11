const noiseSize = 128
const noiseValues = new Float32Array(noiseSize * noiseSize)
let seed = 21490711
for (let index = 0; index < noiseValues.length; index++) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  noiseValues[index] = seed / 4294967296
}

function noise(x: number, y: number) {
  const column = Math.floor(x)
  const row = Math.floor(y)
  const tx = x - column
  const ty = y - row
  const sx = tx * tx * (3 - 2 * tx)
  const sy = ty * ty * (3 - 2 * ty)
  const mask = noiseSize - 1
  const left = column & mask
  const right = (column + 1) & mask
  const top = (row & mask) * noiseSize
  const bottom = ((row + 1) & mask) * noiseSize
  const a = noiseValues[top + left] * (1 - sx) + noiseValues[top + right] * sx
  const b = noiseValues[bottom + left] * (1 - sx) + noiseValues[bottom + right] * sx
  return a * (1 - sy) + b * sy
}

function cloud(x: number, y: number) {
  return 0.52 * noise(x, y)
    + 0.28 * noise(2.06 * x + 21.8, 2.06 * y + 5.3)
    + 0.14 * noise(4.27 * x - 13.4, 4.27 * y + 34.1)
    + 0.06 * noise(8.77 * x + 7.6, 8.77 * y - 11.2)
}

type Density = { columns: number; rows: number; opacity: Uint8Array }

function createDensity(columns: number, rows: number): Density {
  const opacityMap = new Uint8Array(columns * rows)
  for (let row = 0; row < rows; row++) {
    const y = 2 * (row + 0.5) / rows - 1
    for (let column = 0; column < columns; column++) {
      const x = 2 * (column + 0.5) / columns - 1
      const across = y + 0.46 * x - 0.08
      const warp = cloud(x * 2.6 + 12.3, y * 2.2 + 7.7) - 0.5
      const channel = across + 0.38 * warp
      const folds = cloud(x * 4.2 + 0.55 * y + 6.8, channel * 5.8 + 9.4)
      const threads = cloud(x * 8.1 + 4.1 * warp + 31.5, channel * 13.8 + 18.4)
      const main = Math.exp(-7.4 * channel * channel)
      const fringe = Math.exp(-13.5 * (channel + 0.41) ** 2)
      const density = Math.max(0, 0.86 * folds + 0.48 * threads - 0.47) ** 1.32
      const dustLane = Math.min(1, 0.32 + Math.abs(threads - 0.47) * 3.7)
      const grit = noise(x * 63.1 + 5.0 * warp, y * 53.5 - 17.3)
      const opacity = (main * (0.019 + 1.13 * density * dustLane * (0.75 + 0.42 * grit)) + fringe * 0.26 * density)
        * (0.69 + 0.47 * Math.sin(x * 2.1 + 1.2) ** 2)
      opacityMap[row * columns + column] = Math.round(255 * Math.min(0.35, opacity))
    }
  }

  return { columns, rows, opacity: opacityMap }
}

const flowVertex = `#version 300 es
out vec2 uv;
void main() {
  const vec2 points[3] = vec2[3](vec2(0.0, 0.0), vec2(2.0, 0.0), vec2(0.0, 2.0));
  uv = points[gl_VertexID];
  gl_Position = vec4(2.0 * uv - 1.0, 0.0, 1.0);
}
`

const flowFragment = `#version 300 es
precision highp float;
uniform sampler2D density;
uniform float time;
uniform float tint;
in vec2 uv;
out vec4 color;

void main() {
  vec2 p = vec2(uv.x, 1.0 - uv.y);
  vec2 local = 2.0 * p - 1.0;
  float phase = 0.48 * time;
  // Large billows pull the smaller eddies and filaments in different directions.
  float billow = sin(dot(local, vec2(2.2, 5.1)) - 0.78 * phase);
  float eddy = sin(dot(local, vec2(-4.6, 3.4)) + 1.04 * phase + 0.82 * billow);
  float filament = sin(dot(local, vec2(8.8, 7.0)) - 1.31 * phase + 1.16 * eddy);
  vec2 flow = vec2(0.055, -0.024) * billow
    + vec2(0.018, 0.043) * eddy
    + vec2(0.014, -0.012) * filament;
  // Taper displacement at the texture edges to keep the samples inside the cloud.
  vec2 edge = smoothstep(vec2(0.0), vec2(0.15), min(p, 1.0 - p));
  float alpha = texture(density, p + 0.5 * edge * flow).r;
  alpha *= 0.98 + 0.055 * filament;
  color = vec4(vec3(tint * alpha), alpha);
}
`

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader
  gl.deleteShader(shader)
  return null
}

function createFlowRenderer(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, depth: false, powerPreference: 'low-power' })
  if (!gl) return null
  const program = gl.createProgram()
  if (!program) return null
  const vertex = compile(gl, gl.VERTEX_SHADER, flowVertex)
  const fragment = compile(gl, gl.FRAGMENT_SHADER, flowFragment)
  if (vertex && fragment) {
    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)
  }
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  const texture = gl.getProgramParameter(program, gl.LINK_STATUS) ? gl.createTexture() : null
  if (!texture) {
    gl.deleteProgram(program)
    return null
  }
  gl.useProgram(program)
  const time = gl.getUniformLocation(program, 'time')
  const tint = gl.getUniformLocation(program, 'tint')
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)

  return {
    upload(density: Density) {
      const { columns, rows, opacity } = density
      canvas.width = columns
      canvas.height = rows
      gl.viewport(0, 0, columns, rows)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, columns, rows, 0, gl.RED, gl.UNSIGNED_BYTE, opacity)
    },
    draw(seconds: number, dark: boolean) {
      gl.uniform1f(time, seconds)
      gl.uniform1f(tint, Number(dark))
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
    dispose() {
      gl.deleteTexture(texture)
      gl.deleteProgram(program)
    },
  }
}

function drawStill(canvas: HTMLCanvasElement, { columns, rows, opacity }: Density, dark: boolean) {
  const context = canvas.getContext('2d')
  if (!context) return
  canvas.width = columns
  canvas.height = rows
  const image = context.createImageData(columns, rows)
  const tint = dark ? 255 : 0
  for (let pixel = 0; pixel < opacity.length; pixel++) {
    const index = pixel * 4
    image.data[index] = image.data[index + 1] = image.data[index + 2] = tint
    image.data[index + 3] = opacity[pixel]
  }
  context.putImageData(image, 0, 0)
}

const frameInterval = 1000 / 60

export function createStudioNebula(canvas: HTMLCanvasElement, fallback: HTMLCanvasElement, initialDark: boolean) {
  let renderer = createFlowRenderer(canvas)
  let density: Density | null = null
  let dark = initialDark
  let animated = false
  let seconds = 0
  let frame = 0
  let last = 0
  let next = 0

  function draw() {
    if (!density) return
    if (renderer) renderer.draw(seconds, dark)
    else drawStill(fallback, density, dark)
  }

  function tick(now: number) {
    frame = 0
    if (now + 0.75 >= next) {
      const deadline = next + frameInterval
      next = deadline > now ? deadline : now + frameInterval
      seconds += last ? Math.min(0.04, (now - last) / 1000) : 0
      last = now
      draw()
    }
    schedule()
  }

  function schedule() {
    if (animated && renderer && density && !document.hidden && !frame) frame = requestAnimationFrame(tick)
  }

  function stop() {
    cancelAnimationFrame(frame)
    frame = last = next = 0
  }

  function visibility() {
    if (document.hidden) stop()
    else schedule()
  }

  function showRenderer() {
    canvas.hidden = !renderer
    fallback.hidden = !!renderer
  }

  function contextLost(event: Event) {
    event.preventDefault()
    stop()
    renderer = null
    showRenderer()
    draw()
  }

  function contextRestored() {
    renderer = createFlowRenderer(canvas)
    if (density) renderer?.upload(density)
    showRenderer()
    draw()
    schedule()
  }

  showRenderer()
  document.addEventListener('visibilitychange', visibility)
  canvas.addEventListener('webglcontextlost', contextLost)
  canvas.addEventListener('webglcontextrestored', contextRestored)

  return {
    resize(width: number, height: number) {
      if (!width || !height) return
      const ratio = Math.min(0.70, 620 / width, 430 / height)
      const columns = Math.max(1, Math.round(width * ratio))
      const rows = Math.max(1, Math.round(height * ratio))
      if (density?.columns === columns && density.rows === rows) return
      density = createDensity(columns, rows)
      renderer?.upload(density)
      draw()
      schedule()
    },
    setDark(nextDark: boolean) {
      if (dark === nextDark) return
      dark = nextDark
      draw()
    },
    setAnimated(nextAnimated: boolean) {
      animated = nextAnimated
      if (animated) schedule()
      else stop()
    },
    dispose() {
      stop()
      document.removeEventListener('visibilitychange', visibility)
      canvas.removeEventListener('webglcontextlost', contextLost)
      canvas.removeEventListener('webglcontextrestored', contextRestored)
      renderer?.dispose()
    },
  }
}
