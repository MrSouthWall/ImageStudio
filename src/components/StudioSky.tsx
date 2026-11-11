import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react'
import { createStudioNebula } from '../lib/studioNebula'

const starShadows = (() => {
  let seed = 319239
  function random() {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
    return seed / 4294967296
  }
  function layer(count: number, range: number, minimum = 12, halo = false) {
    const stars = Array.from({ length: count }, () => {
      const x = (random() * 100).toFixed(2)
      const y = (random() * 100).toFixed(2)
      const strength = Math.round(minimum + random() ** 1.7 * range)
      return { offset: `${x}vw ${y}dvh`, strength }
    })
    const shadows = stars.map(({ offset, strength }) => `${offset} color-mix(in srgb, var(--sky-star) ${strength}%, transparent)`)
    if (halo) {
      // Paint each star's halo into the layer so parallax only has to move it.
      for (const { offset, strength } of stars) {
        shadows.push(`${offset} 5px color-mix(in srgb, var(--sky-star) ${(strength * 0.39).toFixed(2)}%, transparent)`)
      }
    }
    return shadows.join(',')
  }
  return {
    '--sky-distant': layer(242, 63),
    '--sky-near': layer(31, 64),
    '--sky-dust': layer(220, 34, 13),
    '--sky-resolved': layer(96, 51, 28),
    '--sky-bright': layer(16, 40, 54, true),
  } as CSSProperties
})()

const brightStars = [
  [11.8, 27.3, 6], [23.7, 66.1, 4], [33.4, 16.8, 4], [68.9, 78.6, 5],
  [76.4, 38.6, 6], [88.6, 19.7, 4], [92.1, 62.2, 5],
]

export function StudioSky({ dark }: { dark: boolean }) {
  const sky = useRef<HTMLDivElement>(null)
  const nebula = useRef<HTMLCanvasElement>(null)
  const still = useRef<HTMLCanvasElement>(null)
  const renderer = useRef<ReturnType<typeof createStudioNebula>>(null)
  const theme = useRef(dark)

  useLayoutEffect(() => {
    theme.current = dark
    renderer.current?.setDark(dark)
  }, [dark])

  useEffect(() => {
    const layer = sky.current
    const canvas = nebula.current
    const fallback = still.current
    const cloudLayer = canvas?.parentElement
    if (!layer || !canvas || !fallback || !cloudLayer) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const clouds = createStudioNebula(canvas, fallback, theme.current)
    renderer.current = clouds
    let frame = 0
    let x = 0
    let y = 0
    let width = 0
    let height = 0

    const resize = () => {
      const nextWidth = layer.clientWidth
      const nextHeight = layer.clientHeight
      if (width === nextWidth && height === nextHeight) return
      width = nextWidth
      height = nextHeight
      clouds.resize(cloudLayer.clientWidth, cloudLayer.clientHeight)
    }

    const update = () => {
      frame = 0
      layer.style.setProperty('--sky-x', x.toFixed(4))
      layer.style.setProperty('--sky-y', y.toFixed(4))
    }

    function track(event: PointerEvent) {
      if (!event.isPrimary || event.pointerType === 'touch' || reducedMotion.matches || !width || !height) return
      x = Math.max(-1, Math.min(1, 2 * event.clientX / width - 1))
      y = Math.max(-1, Math.min(1, 2 * event.clientY / height - 1))
      if (!frame) frame = requestAnimationFrame(update)
    }

    function reset() {
      x = 0
      y = 0
      cancelAnimationFrame(frame)
      update()
    }

    function updateMotion() {
      reset()
      clouds.setAnimated(!reducedMotion.matches)
    }

    const observer = new ResizeObserver(resize)
    observer.observe(layer)
    resize()
    clouds.setAnimated(!reducedMotion.matches)
    window.addEventListener('pointermove', track, { capture: true, passive: true })
    window.addEventListener('blur', reset)
    document.documentElement.addEventListener('pointerleave', reset)
    reducedMotion.addEventListener('change', updateMotion)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      clouds.dispose()
      renderer.current = null
      window.removeEventListener('pointermove', track, true)
      window.removeEventListener('blur', reset)
      document.documentElement.removeEventListener('pointerleave', reset)
      reducedMotion.removeEventListener('change', updateMotion)
    }
  }, [])

  return <div ref={sky} className="studio-sky" aria-hidden="true" style={starShadows}>
    <div className="sky-nebula">
      <canvas ref={nebula} width={0} height={0}/>
      <canvas ref={still} width={0} height={0} hidden/>
    </div>
    <span className="sky-dust"/>
    <span className="sky-resolved"/>
    <span className="sky-bright"/>
    {brightStars.map(([x, y, size], index) => <span key={x} className="sky-glint" style={{
      left: `${x}%`, top: `${y}%`, '--glint-size': `${size}px`,
      '--glint-period': `${8 + index % 3 * 1.7}s`, '--glint-delay': `${-1.9 * index}s`,
    } as CSSProperties}/>)}
  </div>
}
