import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { prepareMaskTargetDataUrl, type PreparedMaskTarget } from '../lib/maskPreprocess'
import { canvasToBlob, loadImage, validateMaskMatchesImage } from '../lib/canvasImage'
import { blobToDataUrl } from '../lib/dataUrl'
import { validateSimpleMarkup } from '../lib/simpleMarkupEdit'
import { clientPointToCanvasPoint, type Point } from '../lib/viewportTransform'
import type { SimpleAttachment, SimpleEditMode, SimpleMask } from '../lib/simpleHistory'
import { StudioIcon } from './StudioIcon'

type DrawingTool = 'brush' | 'ellipse' | 'arrow'
type Stroke = { points: Point[]; width: number; erase: boolean; tool: DrawingTool; color: string }
type Layer = { base: HTMLCanvasElement; strokes: Stroke[]; redo: Stroke[] }

export function SimpleMaskEditor({ attachment, mask, onClose, onApply }: { attachment: SimpleAttachment; mask?: SimpleMask; onClose: () => void; onApply: (attachment: SimpleAttachment, mask: SimpleMask) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const base = useRef<HTMLCanvasElement | null>(null)
  const strokes = useRef<Stroke[]>([])
  const redo = useRef<Stroke[]>([])
  const layers = useRef<Partial<Record<SimpleEditMode, Layer>>>({})
  const pointer = useRef<number | null>(null)
  const [mode, setMode] = useState<SimpleEditMode>(mask?.mode || 'mask')
  const [tool, setTool] = useState<DrawingTool>(mask?.mode === 'markup' ? 'ellipse' : 'brush')
  const [prepared, setPrepared] = useState<PreparedMaskTarget | null>(null)
  const [brush, setBrush] = useState(mask?.mode === 'markup' ? 1 : 6)
  const [erase, setErase] = useState(false)
  const [revision, setRevision] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { dialog.current?.showModal() }, [])
  useEffect(() => {
    let cancelled = false
    prepareMaskTargetDataUrl(attachment.dataUrl).then(async (image) => {
      const seed = document.createElement('canvas'); seed.width = image.width; seed.height = image.height
      if (mask) {
        const ctx = seed.getContext('2d')!
        ctx.drawImage(await loadImage(mask.dataUrl), 0, 0, image.width, image.height)
        if (mask.mode !== 'markup') {
          ctx.globalCompositeOperation = 'source-out'
          ctx.fillStyle = '#508ce9'; ctx.fillRect(0, 0, image.width, image.height)
        }
      }
      if (!cancelled) { base.current = seed; setPrepared(image) }
    }).catch(() => { if (!cancelled) setError('图片读取失败，请重新选择。') })
    return () => { cancelled = true }
  }, [attachment.dataUrl, mask])

  function switchMode(next: SimpleEditMode) {
    if (!prepared || saving || pointer.current !== null || next === mode) return
    layers.current[mode] = { base: base.current!, strokes: strokes.current, redo: redo.current }
    const saved = layers.current[next]
    if (saved) { base.current = saved.base; strokes.current = saved.strokes; redo.current = saved.redo }
    else { const seed = document.createElement('canvas'); seed.width = prepared.width; seed.height = prepared.height; base.current = seed; strokes.current = []; redo.current = [] }
    setMode(next); setTool(next === 'markup' ? 'ellipse' : 'brush'); setBrush(next === 'markup' ? 1 : 6); setErase(false); setError(''); setRevision((n) => n + 1)
  }

  function paint(stroke: Stroke, lastOnly = false) {
    const ctx = canvas.current!.getContext('2d')!
    ctx.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over'
    ctx.strokeStyle = stroke.color; ctx.fillStyle = stroke.color
    ctx.lineWidth = stroke.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    const first = stroke.points[0]
    const last = stroke.points[stroke.points.length - 1]
    if (stroke.tool === 'ellipse') {
      ctx.beginPath(); ctx.ellipse((first.x + last.x) / 2, (first.y + last.y) / 2, Math.abs(last.x - first.x) / 2, Math.abs(last.y - first.y) / 2, 0, 0, Math.PI * 2); ctx.stroke()
    } else if (stroke.tool === 'arrow') {
      const angle = Math.atan2(last.y - first.y, last.x - first.x)
      const head = Math.max(stroke.width * 4, Math.min(canvas.current!.width, canvas.current!.height) * 0.025)
      ctx.beginPath(); ctx.moveTo(first.x, first.y); ctx.lineTo(last.x, last.y); ctx.moveTo(last.x - head * Math.cos(angle - Math.PI / 6), last.y - head * Math.sin(angle - Math.PI / 6)); ctx.lineTo(last.x, last.y); ctx.lineTo(last.x - head * Math.cos(angle + Math.PI / 6), last.y - head * Math.sin(angle + Math.PI / 6)); ctx.stroke()
    } else {
      const points = lastOnly ? stroke.points.slice(-2) : stroke.points
      ctx.beginPath(); ctx.arc(points[0].x, points[0].y, stroke.width / 2, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y)
      for (const point of points.slice(1)) ctx.lineTo(point.x, point.y)
      ctx.stroke()
    }
  }
  function redraw() {
    if (!prepared || !canvas.current || !base.current) return
    const ctx = canvas.current.getContext('2d')!
    ctx.globalCompositeOperation = 'source-over'; ctx.clearRect(0, 0, prepared.width, prepared.height); ctx.drawImage(base.current, 0, 0)
    for (const stroke of strokes.current) paint(stroke)
  }
  useEffect(redraw, [prepared, revision, mode])

  function point(event: PointerEvent<HTMLCanvasElement>) {
    return clientPointToCanvasPoint(event.currentTarget.getBoundingClientRect(), { x: event.clientX, y: event.clientY }, { width: event.currentTarget.width, height: event.currentTarget.height })
  }
  async function apply() {
    if (!prepared || saving || pointer.current !== null) return
    setSaving(true); setError('')
    try {
      const output = document.createElement('canvas'); output.width = prepared.width; output.height = prepared.height
      const ctx = output.getContext('2d')!
      if (mode === 'mask') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, output.width, output.height); ctx.globalCompositeOperation = 'destination-out' }
      ctx.drawImage(canvas.current!, 0, 0)
      const blob = await canvasToBlob(output)
      if (blob.size >= 50 * 1024 * 1024) throw new Error('编辑图层过大，请换一张较小的图片。')
      const dataUrl = await blobToDataUrl(blob)
      if (mode === 'markup') await validateSimpleMarkup(dataUrl, prepared.dataUrl)
      else await validateMaskMatchesImage(dataUrl, prepared.dataUrl)
      const target = prepared.dataUrl === attachment.dataUrl ? attachment : { ...attachment, id: crypto.randomUUID(), name: attachment.name.replace(/\.[^.]+$/, '') + '.png', dataUrl: prepared.dataUrl }
      onApply(target, { id: crypto.randomUUID(), targetId: target.id, dataUrl, mode })
    } catch (err) { setError(err instanceof Error ? err.message : '保存编辑图层失败，请重试。') }
    finally { setSaving(false) }
  }
  return <dialog ref={dialog} className="mask-dialog" aria-labelledby="mask-title" onCancel={(e) => { if (saving) e.preventDefault() }} onClose={onClose}>
    <div className="dialog-heading"><div><h2 id="mask-title">局部编辑</h2><p>{mode === 'markup' ? '用圈、箭头或画笔指出你想修改的位置。' : '在原图上涂出你想修改的区域。'}</p></div><button type="button" className="icon-button settings-close" aria-label="关闭局部编辑" disabled={saving} onClick={() => dialog.current?.close()}><StudioIcon name="close"/></button></div>
    <div className="segmented edit-mode" role="group" aria-label="编辑方式"><button type="button" aria-pressed={mode === 'mask'} disabled={!prepared || saving} onClick={() => switchMode('mask')}>选区编辑</button><button type="button" aria-pressed={mode === 'markup'} disabled={!prepared || saving} onClick={() => switchMode('markup')}>标记引导</button></div>
    <fieldset className="mask-toolbar" disabled={!prepared || saving}><div className="segmented" role="group" aria-label="绘制工具">{mode === 'markup' && <><button type="button" aria-pressed={!erase && tool === 'ellipse'} onClick={() => { setTool('ellipse'); setErase(false) }}>圈选</button><button type="button" aria-pressed={!erase && tool === 'arrow'} onClick={() => { setTool('arrow'); setErase(false) }}>箭头</button></>}<button type="button" aria-pressed={!erase && tool === 'brush'} onClick={() => { setTool('brush'); setErase(false) }}>画笔</button><button type="button" aria-pressed={erase} onClick={() => setErase(true)}>橡皮</button></div><label>笔刷<input type="range" aria-label="笔刷大小" min="1" max="25" value={brush} onChange={(e) => setBrush(Number(e.target.value))}/><output>{brush}%</output></label><div className="mask-history"><button className="text-button" type="button" disabled={!strokes.current.length} onClick={() => { redo.current.push(strokes.current.pop()!); setRevision((n) => n + 1) }}>撤销</button><button className="text-button" type="button" disabled={!redo.current.length} onClick={() => { strokes.current.push(redo.current.pop()!); setRevision((n) => n + 1) }}>重做</button><button className="text-button" type="button" onClick={() => { base.current!.getContext('2d')!.clearRect(0, 0, prepared!.width, prepared!.height); strokes.current = []; redo.current = []; setRevision((n) => n + 1) }}>清除</button></div></fieldset>
    <div className="mask-stage">{prepared ? <div className="mask-picture" style={{ aspectRatio: `${prepared.width}/${prepared.height}`, width: `min(100%, ${prepared.width / prepared.height * 50}dvh, ${prepared.width / prepared.height * 480}px)` }}><img src={prepared.dataUrl} alt="待编辑的原图"/><canvas ref={canvas} width={prepared.width} height={prepared.height} style={{ opacity: mode === 'markup' ? 1 : 0.46 }} aria-label="涂抹编辑区域" onPointerDown={(e) => { if (pointer.current !== null || saving || e.button !== 0) return; pointer.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); strokes.current.push({ points: [point(e)], width: Math.min(prepared.width, prepared.height) * brush / 100, erase, tool: erase ? 'brush' : tool, color: mode === 'markup' ? '#e23c36' : '#508ce9' }); redo.current = []; paint(strokes.current[strokes.current.length - 1]); setError('') }} onPointerMove={(e) => { if (pointer.current !== e.pointerId) return; const stroke = strokes.current[strokes.current.length - 1]; const next = point(e); if (stroke.tool === 'brush') { stroke.points.push(next); paint(stroke, true) } else { stroke.points[1] = next; redraw() } }} onPointerUp={(e) => { if (pointer.current === e.pointerId) { pointer.current = null; e.currentTarget.releasePointerCapture(e.pointerId); setRevision((n) => n + 1) } }} onPointerCancel={() => { pointer.current = null; setRevision((n) => n + 1) }}/></div> : <span role="status">正在准备图片…</span>}</div>
    {error && <p className="error-message" role="alert">{error}</p>}
    <div className="mask-footer"><p>{mode === 'markup' ? '红色标记引导模型修改，不锁定像素；使用后切换至直接生图（Images API）。' : '蓝色是修改范围，选区外保留原图。'} 图层仅用于本次发送。{prepared?.wasResized && ` 编辑副本已缩至 ${prepared.width} × ${prepared.height}。`}</p><button type="button" className="primary-button" disabled={!prepared || saving} onClick={() => void apply()}>{saving ? '保存中…' : mode === 'markup' ? '使用标记' : '使用选区'}</button></div>
  </dialog>
}
