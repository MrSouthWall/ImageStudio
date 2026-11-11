import { useEffect, useRef, useState } from 'react'
import { loadSimpleAssets, type SimpleImageOrigin } from '../lib/simpleHistory'
import { copyImageSourceToClipboard, canCopyImageToClipboard } from '../lib/clipboard'
import { SimplePopover } from './SimplePopover'
import { StudioIcon } from './StudioIcon'
import { saveFile } from '../lib/saveFile'

export type ImageSource = { id?: string; origin: SimpleImageOrigin; sourceAsset: string }
export type ImageProps = { asset: string; label: string; caption?: string; filename: string; onEnlarge: (src: string, label?: string) => void; onError: (message: string) => void; download?: boolean; thumbnail?: boolean; onEdit: (src: string, name: string, source?: ImageSource) => void; onReuse: (src: string, name: string, source?: ImageSource) => void; busy: boolean; source?: ImageSource; variant?: 'gallery' | 'picker'; onPick?: () => void; selected?: boolean; blocked?: boolean; onDelete?: () => void }

export function SimpleStoredImage({ asset, label, caption = label, filename, onEnlarge, onError, onEdit, onReuse, busy, download = true, thumbnail = false, source, variant, onPick, selected, blocked, onDelete }: ImageProps) {
  const root = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [src, setSrc] = useState(asset.startsWith('data:') ? asset : '')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect() } }, { rootMargin: '300px' })
    if (root.current) observer.observe(root.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (asset.startsWith('data:')) { setSrc(asset); return }
    if (!visible) return
    let cancelled = false
    loadSimpleAssets([asset]).then(([value]) => { if (!cancelled) { setSrc(value); setFailed(!value) } }).catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [asset, visible])

  async function downloadImage() {
    try {
      const blob = await (await fetch(src)).blob()
      const extension = blob.type === 'image/svg+xml' ? 'svg' : blob.type.split('/')[1] || 'png'
      saveFile(blob, filename.replace(/\.[^.]+$/, '') + '.' + extension)
    } catch { onError('下载失败，请重试。') }
  }

  const galleryCard = variant !== undefined
  const origin = source?.origin === 'generated' ? '生成' : '上传'
  return <div ref={root} className={'chat-image' + (thumbnail ? ' reference-thumbnail' : '') + (galleryCard ? ' gallery-card' : '') + (onPick ? ' is-pickable' : '') + (selected ? ' is-selected' : '')}>
    <div className="media-surface">
      {src && !failed ? <button type="button" className="chat-image-open" onClick={() => onPick ? onPick() : onEnlarge(src, label)} disabled={blocked} aria-pressed={onPick ? !!selected : undefined} aria-label={(onPick ? '选择：' : '放大：') + label}>
        <img src={src} alt="" loading="lazy" onLoad={() => root.current?.dispatchEvent(new Event('imageready', { bubbles: true }))} onError={() => setFailed(true)}/>
        {onPick && <span className="image-check" aria-hidden="true">{selected && <StudioIcon name="check" size={16}/>}</span>}
      </button> : <div className="stored-image-placeholder">{failed ? '图片读取失败' : '正在读取图片…'}</div>}
    </div>
    {!thumbnail && <div className="image-footer">
      <div className="image-caption"><span title={caption}>{caption}</span>{galleryCard && source && <small>{origin}</small>}</div>
      {src && !failed && !onPick && <div className="image-actions">
        <button type="button" className="icon-button image-edit" aria-label={'局部编辑：' + label} title="局部编辑" disabled={busy} onClick={() => onEdit(src, filename, source)}><StudioIcon name="edit" size={17}/><span>局部编辑</span></button>
        {download && <button type="button" className="icon-button image-download" aria-label={'下载：' + label} title="下载图片" onClick={() => void downloadImage()}><StudioIcon name="download" size={17}/></button>}
        <SimplePopover label={'图片操作：' + label} triggerClassName="media-more" button={<StudioIcon name="more" size={17}/>}><div className="chat-action-menu">
          <button type="button" disabled={busy} onClick={(event) => { event.currentTarget.closest<HTMLElement>('[popover]')?.hidePopover(); onReuse(src, filename, source) }}><StudioIcon name="stack" size={17}/>用作参考图</button>
          {canCopyImageToClipboard() && <button type="button" onClick={(event) => { event.currentTarget.closest<HTMLElement>('[popover]')?.hidePopover(); void copyImageSourceToClipboard(src).catch(() => onError('复制图片失败，请下载保存。')) }}><StudioIcon name="copy" size={17}/>复制图片</button>}
          {onDelete && <button type="button" disabled={busy} className="danger-action" onClick={(event) => { event.currentTarget.closest<HTMLElement>('[popover]')?.hidePopover(); onDelete() }}><StudioIcon name="trash" size={17}/>移出图库</button>}
        </div></SimplePopover>
      </div>}
      {failed && onDelete && <button className="icon-button" type="button" disabled={busy} aria-label={'移出图库：' + label} title="移出图库" onClick={onDelete}><StudioIcon name="trash" size={17}/></button>}
    </div>}
  </div>
}
