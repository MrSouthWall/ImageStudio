import { useEffect, useRef, useState } from 'react'
import { buildSimpleGalleryZip } from '../lib/simpleGalleryDownload'
import { saveFile } from '../lib/saveFile'
import { formatExportFileTime } from '../lib/exportFileName'
import type { SimpleGalleryItem } from '../lib/simpleGallery'
import type { SimpleAttachment, SimpleImageOrigin } from '../lib/simpleHistory'
import { SimpleStoredImage, type ImageProps } from './SimpleStoredImage'
import { StudioIcon } from './StudioIcon'

type GalleryProps = {
  items: SimpleGalleryItem[]
  onEnlarge: ImageProps['onEnlarge']
  onError: ImageProps['onError']
  onEdit: ImageProps['onEdit']
  onReuse: ImageProps['onReuse']
  busy: boolean
  selection?: Set<string>
  onToggle?: (item: SimpleGalleryItem) => void
  unavailable?: Set<string>
  full?: boolean
  onDelete?: (item: SimpleGalleryItem) => Promise<void>
  onStart?: () => void
}

const filters = [['all', '全部'], ['generated', '生成'], ['uploaded', '上传']] as const

export function SimpleGallery({ items, onEnlarge, onError, onEdit, onReuse, busy, selection, onToggle, unavailable, full, onDelete, onStart }: GalleryProps) {
  const picker = !!onToggle
  const [batch, setBatch] = useState(false)
  const [downloadSelection, setDownloadSelection] = useState(new Set<string>())
  const [packing, setPacking] = useState(false)
  const [progress, setProgress] = useState(0)
  const [downloadError, setDownloadError] = useState('')
  const downloadController = useRef<AbortController | null>(null)
  const [limit, setLimit] = useState(60)
  const [filter, setFilter] = useState<'all' | SimpleImageOrigin>('all')
  const deleteDialog = useRef<HTMLDialogElement>(null)
  const [deleting, setDeleting] = useState<SimpleGalleryItem | null>(null)
  const [pendingDelete, setPendingDelete] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  useEffect(() => () => downloadController.current?.abort(), [])
  useEffect(() => { if (deleting) deleteDialog.current?.showModal() }, [deleting])

  const locked = busy || packing
  const activeSelection = batch ? downloadSelection : selection
  const toggle = batch ? (item: SimpleGalleryItem) => setDownloadSelection((current) => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next }) : onToggle
  const generatedCount = items.filter((item) => item.origin === 'generated').length
  const counts = { all: items.length, generated: generatedCount, uploaded: items.length - generatedCount }
  const filtered = filter === 'all' ? items : items.filter((item) => item.origin === filter)
  const allSelected = filtered.length > 0 && filtered.every((item) => downloadSelection.has(item.id))

  function endBatch() {
    downloadController.current?.abort()
    setBatch(false)
    setDownloadSelection(new Set())
    setDownloadError('')
  }

  async function downloadSelected() {
    const selected = filtered.filter((item) => downloadSelection.has(item.id))
    if (!selected.length || packing) return
    const controller = new AbortController()
    downloadController.current = controller
    setPacking(true); setProgress(0); setDownloadError('')
    try {
      const zip = await buildSimpleGalleryZip(selected, controller.signal, setProgress)
      controller.signal.throwIfAborted()
      saveFile(zip, '图库-' + formatExportFileTime(new Date()) + '.zip')
      endBatch()
    } catch (err) { if (!controller.signal.aborted) setDownloadError(err instanceof Error ? err.message : '下载失败，请重试。') }
    finally { setPacking(false); downloadController.current = null }
  }

  async function confirmDelete() {
    if (!deleting || !onDelete || pendingDelete) return
    setPendingDelete(true); setDeleteError('')
    try { await onDelete(deleting); deleteDialog.current?.close() }
    catch { setDeleteError('移出失败，请重试。') }
    finally { setPendingDelete(false) }
  }

  return <div className={'workspace-pane gallery-pane' + (picker ? ' picker-pane' : '')}>
    <div className={picker ? 'picker-content' : 'gallery-content workspace-frame'}>
      {!picker && <header className="index-heading gallery-intro">
        <div><span className="section-code"><i/> 03 / LIGHT TABLE</span><h1>图库</h1><p>回看生成的作品，或把一张参考图带进下一次创作。</p></div>
        <span className="gallery-local-note"><StudioIcon name="database" size={16}/>保存在此浏览器</span>
      </header>}
      <div className="gallery-toolbar">
        <div className="segmented gallery-filters" role="group" aria-label="图片来源">
          {filters.map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} disabled={picker ? busy : packing} onClick={() => { setFilter(value); setLimit(60); if (batch) { setDownloadSelection(new Set()); setDownloadError('') } }}>{label}<small>{counts[value]}</small></button>)}
        </div>
        {!picker && !batch && !!items.length && <button className="secondary-button gallery-batch-start" type="button" disabled={busy} onClick={() => { setBatch(true); setDownloadError('') }}><StudioIcon name="download" size={17}/>批量下载</button>}
        {!picker && batch && <div className="gallery-batch-controls">
          <button type="button" className="text-button" onClick={endBatch}>取消</button>
          <button type="button" className="secondary-button" disabled={packing || !filtered.length} onClick={() => setDownloadSelection(allSelected ? new Set() : new Set(filtered.map((item) => item.id)))}>{allSelected ? '取消全选' : '全选'}</button>
          <button type="button" className="primary-button" disabled={locked || !downloadSelection.size} onClick={() => void downloadSelected()}>{packing ? '打包中 ' + progress + '/' + downloadSelection.size : '下载 ZIP（' + downloadSelection.size + '）'}</button>
        </div>}
      </div>
      {downloadError && <p className="error-message" role="alert">{downloadError}</p>}
      {!filtered.length ? <div className="gallery-empty">
        <span className="empty-art" aria-hidden="true"><i/><StudioIcon name={filter === 'uploaded' ? 'upload' : 'image'} size={30}/><small>00</small></span>
        <h2>{filter === 'generated' ? '还没有生成的作品' : filter === 'uploaded' ? '还没有上传的参考图' : '图库里还没有图片'}</h2>
        <p>{picker ? '可以关闭这里，改为上传一张图片。' : '生成图片或添加参考图后，就能在这里查看和复用。'}</p>
        {onStart && <button type="button" className="secondary-button" onClick={onStart}>回到创作台<StudioIcon name="arrowRight" size={16}/></button>}
      </div> : <>
        <div className="workspace-gallery">{filtered.slice(0, limit).map((item) => <SimpleStoredImage key={item.id} asset={item.asset} variant={picker ? 'picker' : 'gallery'} onDelete={!batch && onDelete ? () => { setDeleteError(''); setDeleting(item) } : undefined} label={item.name} filename={item.filename} source={{ id: item.attachmentId, origin: item.origin, sourceAsset: item.sourceAsset }} onEnlarge={onEnlarge} onError={onError} onEdit={onEdit} onReuse={onReuse} busy={locked} onPick={toggle ? () => toggle(item) : undefined} selected={activeSelection?.has(item.id)} blocked={!!toggle && (locked || !batch && (unavailable?.has(item.id) || !!full && !selection?.has(item.id)))} />)}</div>
        {filtered.length > limit && <button type="button" className="secondary-button load-history" onClick={() => setLimit((value) => value + 60)}>加载更多（{filtered.length - limit}）</button>}
      </>}
    </div>
    {deleting && <dialog ref={deleteDialog} className="settings-dialog gallery-delete-dialog" aria-labelledby="gallery-delete-title" onCancel={(event) => { if (pendingDelete) event.preventDefault() }} onClose={() => setDeleting(null)}>
      <div className="dialog-heading"><h2 id="gallery-delete-title">从图库移出图片？</h2></div>
      <p>已在对话或草稿中使用的图片会继续保留。</p>
      {deleteError && <p className="error-message" role="alert">{deleteError}</p>}
      <div className="gallery-delete-actions"><button type="button" className="secondary-button" disabled={pendingDelete} onClick={() => deleteDialog.current?.close()}>取消</button><button type="button" className="danger-button" disabled={pendingDelete || busy} onClick={() => void confirmDelete()}>{pendingDelete ? '正在移出…' : '移出图库'}</button></div>
    </dialog>}
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
    <div className="dialog-heading"><div><h2 id="gallery-picker-title">选择参考图</h2><p>从本地图库中选择要带入这次创作的图片。</p></div><button type="button" className="icon-button settings-close" aria-label="关闭图库选择" disabled={pending} onClick={() => dialog.current?.close()}><StudioIcon name="close"/></button></div>
    <SimpleGallery items={items} selection={selection} unavailable={unavailable} full={selection.size >= maxSelection} onToggle={(item) => { setSelection((current) => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else if (next.size < maxSelection) next.add(item.id); return next }) }} busy={pending} onEnlarge={() => {}} onError={setError} onEdit={() => {}} onReuse={() => {}}/>
    {error && <p className="error-message" role="alert">{error}</p>}
    <div className="gallery-picker-footer"><span>已选 {selection.size} / {maxSelection} 张</span><button type="button" className="primary-button" disabled={pending || !selection.size} onClick={() => void confirm()}><StudioIcon name="plus" size={17}/>{pending ? '正在添加…' : '添加参考图'}</button></div>
  </dialog>
}
