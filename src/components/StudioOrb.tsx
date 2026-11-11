import { useEffect, useRef, useState } from 'react'
import lightStill from '../assets/studio/white-hole-light.webp'
import darkStill from '../assets/studio/white-hole-dark.webp'
import type { OrbitRenderer } from '../lib/orbitRenderer'
import { createStardustField, type StardustOrigin, type StardustPointer } from '../lib/stardustField'

const reducedMotion = '(prefers-reduced-motion: reduce)'
const frameInterval = 1000 / 60

export function StudioOrb({ dark }: { dark: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const dustCanvas = useRef<HTMLCanvasElement>(null)
  const orbit = useRef<HTMLDivElement>(null)
  const disc = useRef<HTMLDivElement>(null)
  const renderer = useRef<OrbitRenderer>(null)
  const pose = useRef({ seconds: 0.75, x: 0, y: 0, yaw: 0, pitch: 0 })
  const theme = useRef(dark)
  const redraw = useRef<() => void>(undefined)
  const [live, setLive] = useState<boolean | null>(null)
  const [reduced, setReduced] = useState(() => window.matchMedia(reducedMotion).matches)

  useEffect(() => {
    const preference = window.matchMedia(reducedMotion)
    const update = () => setReduced(preference.matches)
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    theme.current = dark
    redraw.current?.()
  }, [dark])

  useEffect(() => {
    const element = canvas.current
    if (!element) return
    let generation = 0
    let closed = false
    async function init() {
      const attempt = ++generation
      try {
        const { createOrbitRenderer } = await import('../lib/orbitRenderer')
        if (closed || attempt !== generation) return
        renderer.current = createOrbitRenderer(element!)
        setLive(!!renderer.current)
      } catch {
        if (!closed && attempt === generation) setLive(false)
      }
    }
    const contextLost = (event: Event) => {
      event.preventDefault()
      generation++
      renderer.current?.dispose()
      renderer.current = null
      setLive(false)
    }
    void init()
    element.addEventListener('webglcontextlost', contextLost)
    element.addEventListener('webglcontextrestored', init)
    return () => {
      closed = true
      element.removeEventListener('webglcontextlost', contextLost)
      element.removeEventListener('webglcontextrestored', init)
      renderer.current?.dispose()
      renderer.current = null
    }
  }, [])

  useEffect(() => {
    if (live === null || !canvas.current || !dustCanvas.current || !orbit.current || !disc.current) return
    const overlay = dustCanvas.current
    const target = orbit.current
    const surface = disc.current
    const motion = pose.current
    const field = reduced ? null : createStardustField(overlay)
    let view = overlay.getBoundingClientRect()
    let modelSize = 0
    const source: StardustOrigin = {
      x: 0, y: 0, radius: 0,
      project(point, screen) {
        if (renderer.current) renderer.current.project(point, screen)
        else {
          screen.x = 0.5 + 0.063 * point.x
          screen.y = 0.5 - 0.063 * point.y
        }
        screen.x = source.x + (screen.x - 0.5) * modelSize
        screen.y = source.y + (screen.y - 0.5) * modelSize
      },
    }
    let sourceInView = false
    let ratio = 0
    let visible = true
    let frame = 0
    let last = 0
    let nextFrame = 0
    let targetX = 0
    let targetY = 0
    let pointer: (StardustPointer & { time: number; id: number }) | null = null
    let drag: { id: number; x: number; y: number } | null = null

    function placeModel() {
      const bounds = target.getBoundingClientRect()
      const left = bounds.left - view.left
      const top = bounds.top - view.top
      const centerX = left + bounds.width / 2
      const centerY = top + bounds.height / 2
      source.x = centerX
      source.y = centerY
      source.radius = modelSize * 0.32
      sourceInView = source.radius > 0 && centerX >= 0 && centerX <= view.width && centerY >= 0 && centerY <= view.height
    }

    function drawModel() {
      if (!modelSize || !view.width || !view.height) return
      renderer.current?.render([
        0.13 + motion.y + motion.pitch,
        -0.10 + motion.x + motion.yaw + 0.08 * Math.sin(motion.seconds * 0.22),
        -0.21,
      ], motion.seconds, theme.current, source.x / view.width, source.y / view.height)
    }

    function resize() {
      const next = overlay.getBoundingClientRect()
      const nextRatio = window.devicePixelRatio || 1
      const viewportChanged = !ratio || view.width !== next.width || view.height !== next.height || ratio !== nextRatio
      if (viewportChanged) {
        field?.resize(next.width, next.height)
      }
      view = next
      const size = Math.round(Math.min(1100, target.clientWidth * 1.50, target.clientHeight * 1.95))
      if (size && view.width && view.height && (modelSize !== size || viewportChanged)) {
        modelSize = size
        target.style.setProperty('--orbit-diameter', `${size}px`)
        renderer.current?.resize(view.width, view.height, size, nextRatio)
      }
      ratio = nextRatio
      placeModel()
      drawModel()
    }

    function tick(now: number) {
      frame = 0
      schedule()
      if (now + 0.75 < nextFrame) return
      // Carry the deadline across display refreshes and skip missed frames after a stall.
      const deadline = nextFrame + frameInterval
      nextFrame = deadline > now ? deadline : now + frameInterval
      const elapsed = last ? Math.min(0.04, (now - last) / 1000) : 1 / 60
      last = now
      if (visible) {
        motion.seconds += elapsed
        const ease = 1 - Math.exp(-elapsed * 9)
        motion.x += (targetX - motion.x) * ease
        motion.y += (targetY - motion.y) * ease
        drawModel()
      }
      if (pointer) {
        const friction = Math.exp(-elapsed * 8)
        pointer.vx *= friction
        pointer.vy *= friction
      }
      field?.render(elapsed, visible && sourceInView ? source : null, pointer, theme.current)
    }

    function schedule() {
      if (!reduced && (renderer.current || field) && !document.hidden && !frame) frame = requestAnimationFrame(tick)
    }

    function track(event: PointerEvent) {
      if (!event.isPrimary) return
      if (!reduced && (event.pointerType !== 'touch' || event.buttons !== 0)) {
        const x = event.clientX - view.left
        const y = event.clientY - view.top
        const previous = pointer?.id === event.pointerId ? pointer : null
        const elapsed = previous ? Math.max(0.012, (event.timeStamp - previous.time) / 1000) : 1
        pointer = {
          id: event.pointerId, time: event.timeStamp, x, y,
          vx: previous ? Math.max(-720, Math.min(720, (x - previous.x) / elapsed)) : 0,
          vy: previous ? Math.max(-720, Math.min(720, (y - previous.y) / elapsed)) : 0,
          radius: Math.max(37, Math.min(62, Math.min(view.width, view.height) * 0.081)),
        }
        if (event.pointerType !== 'touch' && view.width && view.height) {
          targetX = (x / view.width - 0.5) * 0.32
          targetY = (y / view.height - 0.5) * 0.24
        }
      }
      if (drag?.id === event.pointerId) {
        motion.yaw += (event.clientX - drag.x) * 0.012
        motion.pitch = Math.max(-1.12, Math.min(1.12, motion.pitch + (event.clientY - drag.y) * 0.009))
        drag.x = event.clientX
        drag.y = event.clientY
        if (reduced) drawModel()
      }
    }

    function grab(event: PointerEvent) {
      if (!live || !event.isPrimary || event.button !== 0) return
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY }
      surface.setPointerCapture(event.pointerId)
      target.dataset.dragging = 'true'
    }

    function leave() {
      pointer = null
      targetX = 0
      targetY = 0
    }

    function release(event: PointerEvent) {
      if (drag?.id === event.pointerId) {
        drag = null
        delete target.dataset.dragging
      }
      if (pointer?.id === event.pointerId && (event.pointerType === 'touch' || event.type === 'pointercancel')) leave()
    }

    function visibility() {
      if (document.hidden) {
        cancelAnimationFrame(frame)
        frame = 0
        last = 0
        nextFrame = 0
        leave()
      } else schedule()
    }

    function scroll() {
      placeModel()
      if (reduced || !visible) drawModel()
    }

    const pane = target.closest('.origin-pane')
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      placeModel()
      if (!visible) drawModel()
    })
    const sizeObserver = new ResizeObserver(resize)
    sizeObserver.observe(target)
    sizeObserver.observe(overlay)
    if (pane) sizeObserver.observe(pane)
    intersection.observe(surface)
    pane?.addEventListener('scroll', scroll, { passive: true })
    surface.addEventListener('pointerdown', grab)
    surface.addEventListener('lostpointercapture', release)
    window.addEventListener('pointermove', track, { capture: true, passive: true })
    window.addEventListener('pointerdown', track, { capture: true, passive: true })
    window.addEventListener('pointerup', release, true)
    window.addEventListener('pointercancel', release, true)
    window.addEventListener('resize', resize, { passive: true })
    window.addEventListener('blur', leave)
    document.documentElement.addEventListener('pointerleave', leave)
    document.addEventListener('visibilitychange', visibility)
    redraw.current = drawModel
    resize()
    schedule()
    return () => {
      sizeObserver.disconnect()
      intersection.disconnect()
      pane?.removeEventListener('scroll', scroll)
      surface.removeEventListener('pointerdown', grab)
      surface.removeEventListener('lostpointercapture', release)
      window.removeEventListener('pointermove', track, true)
      window.removeEventListener('pointerdown', track, true)
      window.removeEventListener('pointerup', release, true)
      window.removeEventListener('pointercancel', release, true)
      window.removeEventListener('resize', resize)
      window.removeEventListener('blur', leave)
      document.documentElement.removeEventListener('pointerleave', leave)
      document.removeEventListener('visibilitychange', visibility)
      delete target.dataset.dragging
      leave()
      redraw.current = undefined
      cancelAnimationFrame(frame)
    }
  }, [live, reduced])

  return <>
    <canvas ref={canvas} className="orbit-sky" hidden={live !== true} aria-hidden="true"/>
    <div ref={orbit} className="orbit-installation" data-renderer={live ? 'three' : live === false ? 'still' : 'loading'}>
      <div ref={disc} className="orbit-disc" role="img" aria-label="白洞理论示意，发光物质向外扩散，引力将后方星光弯折成弧">
        {live !== true && <div className="orbit-object">
          {live === false && <img src={dark ? darkStill : lightStill} alt="" decoding="async"/>}
        </div>}
      </div>
    </div>
    <canvas ref={dustCanvas} className="orbit-stardust" aria-hidden="true"/>
  </>
}
