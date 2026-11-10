import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const MIN = 220, MAX = 360, DEFAULT = 252
const clamp = (width: number) => Math.max(MIN, Math.min(MAX, width))

export function SimpleSidebarResize() {
  const handle = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(() => {
    try { const saved = Number(localStorage.getItem('gpt-image-sidebar-width')); return saved ? clamp(saved) : DEFAULT } catch { return DEFAULT }
  })
  const stopDrag = useRef<(() => void) | null>(null)
  useEffect(() => () => stopDrag.current?.(), [])
  useLayoutEffect(() => { handle.current?.closest<HTMLElement>('.chat-app')?.style.setProperty('--sidebar-width', `${width}px`) }, [width])
  const save = (value: number) => { try { localStorage.setItem('gpt-image-sidebar-width', String(value)) } catch { /* 本次窗口仍可调整。 */ } }
  return <div ref={handle} className="sidebar-resize" role="separator" aria-label="调整侧栏宽度" aria-orientation="vertical" aria-valuemin={MIN} aria-valuemax={MAX} aria-valuenow={width} tabIndex={0} title="拖动调整宽度，双击恢复默认" onPointerDown={(event) => {
    if (event.button !== 0) return
    event.preventDefault()
    stopDrag.current?.()
    const startX = event.clientX, startWidth = width, pointerId = event.pointerId
    let currentWidth = width
    const move = (pointer: PointerEvent) => {
      if (pointer.pointerId !== pointerId) return
      currentWidth = clamp(startWidth + pointer.clientX - startX)
      setWidth(currentWidth)
    }
    const finish = () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', finish)
      document.removeEventListener('pointercancel', finish)
      stopDrag.current = null
      save(currentWidth)
    }
    stopDrag.current = finish
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', finish)
    document.addEventListener('pointercancel', finish)
    event.currentTarget.setPointerCapture(pointerId)
  }} onDoubleClick={() => { setWidth(DEFAULT); save(DEFAULT) }} onKeyDown={(event) => {
    const next = event.key === 'ArrowLeft' ? width - 10 : event.key === 'ArrowRight' ? width + 10 : event.key === 'Home' ? MIN : event.key === 'End' ? MAX : null
    if (next === null) return
    event.preventDefault(); setWidth(clamp(next)); save(clamp(next))
  }}/>
}
