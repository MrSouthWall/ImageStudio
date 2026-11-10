import { useEffect, useRef, useState } from 'react'
import { loadSimpleAssets, type SimpleImageOrigin } from '../lib/simpleHistory'
import { copyImageSourceToClipboard, canCopyImageToClipboard } from '../lib/clipboard'
import { SimplePopover } from './SimplePopover'
import { saveFile } from '../lib/saveFile'

export type ImageSource = { id?: string; origin: SimpleImageOrigin; sourceAsset: string }
export type ImageProps = { asset: string; label: string; filename: string; onEnlarge: (src: string) => void; onError: (message: string) => void; download?: boolean; thumbnail?: boolean; onEdit: (src: string, name: string, source?: ImageSource) => void; onReuse: (src: string, name: string, source?: ImageSource) => void; busy: boolean; source?: ImageSource; showOrigin?: boolean; onPick?: () => void; selected?: boolean; blocked?: boolean; onDelete?: () => void }

export function SimpleStoredImage({ asset, label, filename, onEnlarge, onError, onEdit, onReuse, busy, download = true, thumbnail = false, source, showOrigin, onPick, selected, blocked, onDelete }: ImageProps) {
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
  return <div ref={root} className={`chat-image${thumbnail ? ' reference-thumbnail' : ''}`}>
    {src ? <><button type="button" className="chat-image-open" onClick={() => onPick ? onPick() : onEnlarge(src)} disabled={blocked} aria-pressed={onPick ? selected : undefined} aria-label={`${onPick ? '选择' : '放大'}：${label}${showOrigin && source ? `（${source.origin === 'generated' ? '生成' : '上传'}）` : ''}`} ><img src={src} alt={label} loading="lazy" onLoad={() => root.current?.dispatchEvent(new Event('imageready', { bubbles: true }))} onError={() => setFailed(true)} /></button>{showOrigin && source && <span className="gallery-origin">{source.origin === 'generated' ? '生成' : '上传'}</span>}{onPick && selected && <span className="gallery-selected" aria-hidden="true">✓</span>}{!thumbnail && !onPick && <div className="image-actions"><button type="button" disabled={busy} onClick={() => onEdit(src, filename, source)}>局部编辑</button><SimplePopover label={`图片操作：${label}`} button={<span>•••</span>}><div className="chat-action-menu"><button type="button" disabled={busy} onClick={(e) => { e.currentTarget.closest<HTMLElement>('[popover]')?.hidePopover(); onReuse(src, filename, source) }}>用作参考图</button>{canCopyImageToClipboard() && <button type="button" onClick={(e) => { e.currentTarget.closest<HTMLElement>('[popover]')?.hidePopover(); void copyImageSourceToClipboard(src).catch(() => onError('复制图片失败，请下载保存。')) }}>复制图片</button>}</div></SimplePopover></div>}{download && !onPick && <button type="button" className="image-download" aria-label={`下载：${label}`} title="下载图片" onClick={async () => {
      try {
        const blob = await (await fetch(src)).blob()
        const extension = blob.type === 'image/svg+xml' ? 'svg' : blob.type.split('/')[1] || 'png'
        saveFile(blob, `${filename.replace(/\.[^.]+$/, '')}.${extension}`)
      } catch { onError('下载失败，请重试。') }
    }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5"/></svg></button>}</> : <div className="stored-image-placeholder">{failed ? '图片读取失败' : '正在读取…'}</div>}
    {onDelete && <button type="button" className="gallery-delete" disabled={busy} aria-label={`删除：${label}`} title="删除图片" onClick={onDelete}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 10v7m4-7v7"/></svg></button>}
    {src && failed && <span className="image-read-error" role="alert">图片无法显示</span>}
  </div>
}
