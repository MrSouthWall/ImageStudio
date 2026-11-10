import { createPortal } from 'react-dom'
import { buildSimpleGalleryZip } from '../lib/simpleGalleryDownload'
import { saveFile } from '../lib/saveFile'
import { formatExportFileTime } from '../lib/exportFileName'
import { useEffect, useRef, useState } from 'react'
import type { SimpleGalleryItem } from '../lib/simpleGallery'
import type { SimpleAttachment, SimpleImageOrigin } from '../lib/simpleHistory'
import { SimpleStoredImage, type ImageProps } from './SimpleStoredImage'

type GalleryProps = { toolbarTarget?: HTMLDivElement | null; items: SimpleGalleryItem[]; onEnlarge: ImageProps['onEnlarge']; onError: ImageProps['onError']; onEdit: ImageProps['onEdit']; onReuse: ImageProps['onReuse']; busy: boolean; selection?: Set<string>; onToggle?: (item: SimpleGalleryItem) => void; unavailable?: Set<string>; full?: boolean; onDelete?: (item: SimpleGalleryItem) => Promise<void> }

export function SimpleGallery({ items, onEnlarge, onError, onEdit, onReuse, busy, selection, onToggle, unavailable, full, onDelete, toolbarTarget }: GalleryProps) {
  const [batch, setBatch] = useState(false)
  const [downloadSelection, setDownloadSelection] = useState(new Set<string>())
  const [packing, setPacking] = useState(false)
  const [progress, setProgress] = useState(0)
  const [downloadError, setDownloadError] = useState('')
  const downloadController = useRef<AbortController | null>(null)
  useEffect(() => () => downloadController.current?.abort(), [])
  const locked = busy || packing
  const activeSelection = batch ? downloadSelection : selection
  const toggle = batch ? (item: SimpleGalleryItem) => setDownloadSelection((current) => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next }) : onToggle
  async function downloadSelected() {
    const selected = items.filter((item) => downloadSelection.has(item.id))
    if (!selected.length || packing) return
    const controller = new AbortController()
    downloadController.current = controller
    setPacking(true); setProgress(0); setDownloadError('')
    try {
      const zip = await buildSimpleGalleryZip(selected, controller.signal, setProgress)
      controller.signal.throwIfAborted()
      saveFile(zip, `图库-${formatExportFileTime(new Date())}.zip`)
      setBatch(false)
      setDownloadSelection(new Set())
    } catch (err) { if (!controller.signal.aborted) setDownloadError(err instanceof Error ? err.message : '下载失败，请重试。') }
    finally { setPacking(false); downloadController.current = null }
  }
  const deleteDialog = useRef<HTMLDialogElement>(null)
  const [deleting, setDeleting] = useState<SimpleGalleryItem | null>(null)
  const [pendingDelete, setPendingDelete] = useState(false)
  useEffect(() => { if (deleting) deleteDialog.current?.showModal() }, [deleting])
  async function confirmDelete() {
    if (!deleting || !onDelete || pendingDelete) return
    setPendingDelete(true)
    try { await onDelete(deleting); deleteDialog.current?.close(); setDeleting(null) }
    catch { onError('删除失败，请重试。') }
    finally { setPendingDelete(false) }
  }
  const [limit, setLimit] = useState(60)
  const [filter, setFilter] = useState<'all' | SimpleImageOrigin>('all')
  const filtered = filter === 'all' ? items : items.filter((item) => item.origin === filter)
  const toolbar = (
    <div className="gallery-toolbar"><div className="segmented" role="group" aria-label="图片来源">{([['all','全部'],['generated','生成'],['uploaded','上传']] as const).map(([value,label]) => <button type="button" key={value} aria-pressed={filter === value} disabled={packing} onClick={() => { setFilter(value); setLimit(60); if (batch) { setDownloadSelection(new Set()); setDownloadError('') } }}>{label}</button>)}</div><div className="gallery-toolbar-end"><span className="gallery-heading">{filtered.length} 张</span><span className="gallery-local-note">图片保存在当前浏览器中</span>{!onToggle && !batch && !!items.length && <button className="gallery-batch-start" type="button" disabled={busy} onClick={() => { setBatch(true); setDownloadError('') }}>批量下载</button>}{!onToggle && batch && !!items.length && <div className="gallery-batch-controls"><button type="button" disabled={packing || !filtered.length} onClick={() => setDownloadSelection(filtered.every((item) => downloadSelection.has(item.id)) ? new Set() : new Set(filtered.map((item) => item.id)))}>{filtered.length > 0 && filtered.every((item) => downloadSelection.has(item.id)) ? '取消全选' : '全选'}</button><button type="button" className="batch-download-primary" disabled={locked || !downloadSelection.size} onClick={() => void downloadSelected()}>{packing ? `打包中 ${progress}/${downloadSelection.size}` : `下载 ZIP（${downloadSelection.size}）`}</button><button type="button" onClick={() => { downloadController.current?.abort(); setBatch(false); setDownloadSelection(new Set()); setDownloadError('') }}>取消</button></div>}</div></div>
  )
  return <div className={`workspace-pane gallery-pane${toggle ? ' gallery-picking' : ''}`}>
    {toolbarTarget && !onToggle ? createPortal(toolbar, toolbarTarget) : toolbar}
    {downloadError && <p className="error-message" role="alert">{downloadError}</p>}
    {!filtered.length ? <div className="workspace-empty">还没有{filter === 'generated' ? '生成的' : filter === 'uploaded' ? '上传的' : ''}图片</div> : <><div className="workspace-gallery">{filtered.slice(0, limit).map((item) => <SimpleStoredImage key={item.id} asset={item.asset} onDelete={!batch && onDelete ? () => setDeleting(item) : undefined} showOrigin label={item.name} filename={item.filename} source={{ id: item.attachmentId, origin: item.origin, sourceAsset: item.sourceAsset }} onEnlarge={onEnlarge} onError={onError} onEdit={onEdit} onReuse={onReuse} busy={locked} onPick={toggle ? () => toggle(item) : undefined} selected={activeSelection?.has(item.id)} blocked={!!toggle && (packing || busy || !batch && (unavailable?.has(item.id) || !!full && !selection?.has(item.id)))} />)}</div>{filtered.length > limit && <button type="button" className="load-history" onClick={() => setLimit((value) => value + 60)}>加载更多（{filtered.length - limit}）</button>}</>}
    {deleting && <dialog ref={deleteDialog} className="gallery-delete-dialog" aria-labelledby="gallery-delete-title" onCancel={(event) => { if (pendingDelete) event.preventDefault() }} onClose={() => setDeleting(null)}><h2 id="gallery-delete-title">删除这张图片？</h2><p>对话和草稿中已使用的图片会保留。</p><div className="gallery-delete-actions"><button type="button" disabled={pendingDelete} onClick={() => deleteDialog.current?.close()}>取消</button><button type="button" className="danger-button" disabled={pendingDelete || busy} onClick={() => void confirmDelete()}>{pendingDelete ? '删除中…' : '删除'}</button></div></dialog>}
  </div>
}

export function SimpleGalleryPicker({ items, attachments, maxSelection, onConfirm, onClose }: { items: SimpleGalleryItem[]; attachments: SimpleAttachment[]; maxSelection: number; onConfirm: (items: SimpleGalleryItem[]) => Promise<void>; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [selection, setSelection] = useState(new Set<string>())
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const unavailable = new Set(items.filter((item) => attachments.some((file) => file.id === item.attachmentId || file.sourceAsset === item.sourceAsset)).map((item) => item.id))
  useEffect(() => { dialog.current?.showModal() }, [])
  async function confirm() {
    if (!selection.size || pending) return
    setPending(true); setError('')
    try { await onConfirm(items.filter((item) => selection.has(item.id))) }
    catch (err) { setError(err instanceof Error ? err.message : '图片读取失败，请重试。'); setPending(false) }
  }
  return <dialog ref={dialog} className="gallery-picker" aria-labelledby="gallery-picker-title" onCancel={(event) => { if (pending) event.preventDefault() }} onClose={onClose}>
    <div className="dialog-heading"><h2 id="gallery-picker-title">从图库选择图片</h2><button type="button" className="text-button" aria-label="关闭图库选择" disabled={pending} onClick={() => dialog.current?.close()}>×</button></div>
    <SimpleGallery items={items} selection={selection} unavailable={unavailable} full={selection.size >= maxSelection} onToggle={(item) => { setSelection((current) => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else if (next.size < maxSelection) next.add(item.id); return next }) }} busy={pending} onEnlarge={() => {}} onError={setError} onEdit={() => {}} onReuse={() => {}}/>
    <div className="gallery-picker-footer">{error && <span className="error-message" role="alert">{error}</span>}<button type="button" className="primary-button" disabled={pending || !selection.size} onClick={() => void confirm()}>{pending ? '读取中…' : selection.size ? `添加（${selection.size}）` : '添加'}</button></div>
  </dialog>
}
