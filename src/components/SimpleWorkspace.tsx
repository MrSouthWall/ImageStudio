import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import ReactMarkdown from 'react-markdown'
import { getCitedMarkdown } from '../lib/simpleCitations'
import { type SimpleRecord, type SimpleOutputFile } from '../lib/simpleHistory'
import { copyTextToClipboard } from '../lib/clipboard'
import { SimplePopover } from './SimplePopover'
import { SimpleStoredImage as StoredImage, type ImageProps } from './SimpleStoredImage'
import { SimpleGallery } from './SimpleGallery'
import type { SimpleGalleryItem } from '../lib/simpleGallery'

export type WorkspaceTab = 'chat' | 'gallery'

function CopyButton({ text, label, onError }: { text: string; label: string; onError: (message: string) => void }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => { if (!copied) return; const timer = window.setTimeout(() => setCopied(false), 1800); return () => window.clearTimeout(timer) }, [copied])
  return <button type="button" className="copy-message" aria-label={label} onClick={async () => { try { await copyTextToClipboard(text); setCopied(true) } catch { onError('复制失败，请选择文字后复制。') } }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/></svg><span aria-live="polite">{copied ? '已复制' : '复制'}</span></button>
}

function Conversation({ records, busy, seconds, previews, onEnlarge, onError, onDownloadFile, onEdit, onReuse, onRetry }: { records: SimpleRecord[]; busy: boolean; seconds: number; previews: Record<string, string>; onEnlarge: ImageProps['onEnlarge']; onError: ImageProps['onError']; onEdit: ImageProps['onEdit']; onReuse: ImageProps['onReuse']; onRetry: (record: SimpleRecord) => void; onDownloadFile: (record: SimpleRecord, file: SimpleOutputFile) => void }) {
  const [visibleCount, setVisibleCount] = useState(20)
  const pane = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  const earlierHeight = useRef<number | null>(null)
  const current = records[records.length - 1]
  const latest = current?.id
  const activeTools = [...new Set(current?.status === 'running' ? current.tools?.filter((tool) => !['completed', 'failed'].includes(tool.status)).map((tool) => tool.type) : [])]
  const activities = activeTools.map((type) => ({ image_generation_call: '生成图片', web_search_call: '联网搜索', file_search_call: '检索文件', code_interpreter_call: '计算' } as Record<string, string>)[type]).filter(Boolean)
  const activity = activities.length ? `正在${activities.join('、')}` : current?.apiMode === 'images' ? '正在生成图片' : '正在响应'
  useLayoutEffect(() => {
    if (earlierHeight.current !== null && pane.current) {
      pane.current.scrollTop += pane.current.scrollHeight - earlierHeight.current
      earlierHeight.current = null
    }
  }, [visibleCount])
  useEffect(() => { following.current = true; if (pane.current) pane.current.scrollTop = pane.current.scrollHeight }, [latest])
  useEffect(() => {
    const el = pane.current!
    const follow = () => { if (following.current) el.scrollTop = el.scrollHeight }
    follow()
    el.addEventListener('imageready', follow)
    window.addEventListener('resize', follow)
    const observer = new ResizeObserver(follow)
    observer.observe(el)
    return () => { el.removeEventListener('imageready', follow); window.removeEventListener('resize', follow); observer.disconnect() }
  }, [records, previews, busy])
  return <div ref={pane} className="workspace-pane conversation" onScroll={() => { const el = pane.current!; following.current = el.scrollHeight - el.clientHeight - el.scrollTop < 100 }}>
    {records.length > visibleCount && <button type="button" className="load-history" onClick={() => { earlierHeight.current = pane.current!.scrollHeight; setVisibleCount((count) => count + 20) }}>查看更早记录（{records.length - visibleCount}）</button>}
    {records.slice(-visibleCount).map((record) => <article className="conversation-entry" key={record.id}>
      <div className="request-message"><p>{record.prompt}</p>{!!record.attachments.length && <div className="history-attachments">{record.attachments.map((file) => <StoredImage key={file.id} asset={file.dataUrl} label={file.name} filename={file.name} onEnlarge={onEnlarge} onError={onError} onEdit={onEdit} onReuse={onReuse} busy={busy} thumbnail download={false} />)}</div>}</div>
      <div className="message-meta user-meta"><time dateTime={new Date(record.createdAt).toISOString()} title={new Date(record.createdAt).toLocaleString('zh-CN')}>{new Date(record.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time><CopyButton text={record.prompt} label="复制提示词" onError={onError}/><button type="button" disabled={busy} onClick={() => onRetry(record)}>再次使用</button></div>
      {record.assistantText && <div className="assistant-message"><ReactMarkdown components={{ a: ({ href, children }) => href && /^https?:\/\//i.test(href) ? <a href={href} target="_blank" rel="noreferrer">{children}</a> : <span>{children}</span>, img: ({ src, alt }) => <a href={typeof src === 'string' && /^https?:\/\//.test(src) ? src : undefined} target="_blank" rel="noreferrer">{alt || '图片链接'}</a> }}>{getCitedMarkdown(record.assistantText, record.citations || [])}</ReactMarkdown>{!!record.citations?.some((citation) => citation.start === undefined || citation.end === undefined) && <div className="message-sources">{[...new Map(record.citations.filter((citation) => citation.start === undefined || citation.end === undefined).map((citation) => [citation.url, citation])).values()].map((citation) => <a key={citation.url} href={citation.url} target="_blank" rel="noreferrer">{citation.title} ↗</a>)}</div>}</div>}
      {record.tools?.filter((tool) => (tool.type !== 'image_generation_call' || tool.status !== 'completed') && (record.status !== 'running' || ['completed', 'failed'].includes(tool.status) || tool.code || tool.logs)).map((tool) => {
        const status = tool.status === 'completed' ? '已完成' : tool.status === 'failed' ? '失败' : record.status !== 'running' ? '已中断' : '进行中'
        const label = ({ image_generation_call: '图片生成', web_search_call: '联网搜索', file_search_call: '文件检索', code_interpreter_call: '代码解释器' } as Record<string,string>)[tool.type]
        return tool.code || tool.logs ? <details key={tool.id} className="tool-call"><summary>{label}<span>{status}</span></summary>{tool.code && <pre><code>{tool.code}</code></pre>}{tool.logs && <pre className="tool-logs">{tool.logs}</pre>}</details> : <div key={tool.id} className="tool-status">{label}<span>{status}</span></div>
      })}
      {!!record.files?.length && <div className="output-files">{record.files.map((file) => <button type="button" key={file.id} onClick={() => onDownloadFile(record, file)}>↓ {file.name}</button>)}</div>}
      <div className="conversation-images">{record.images.map((asset, i) => <StoredImage key={i} asset={asset} label={`生成图片 ${i + 1}`} filename={`image-${record.id}-${i + 1}`} source={{ origin: 'generated', sourceAsset: `result-${record.id}-${i}` }} onEnlarge={onEnlarge} onError={onError} onEdit={onEdit} onReuse={onReuse} busy={busy} />)}</div>
      {record.status !== 'running' && <div className="message-meta">{record.assistantText && <CopyButton text={record.assistantText} label="复制回复" onError={onError}/>}<SimplePopover label="消息详情" button={<span>详情</span>}><dl className="message-details"><dt>发送</dt><dd>{new Date(record.createdAt).toLocaleString('zh-CN')}</dd><dt>{record.status === 'error' ? '结束时间' : '接收完成'}</dt><dd>{record.completedAt ? new Date(record.completedAt).toLocaleString('zh-CN') : '旧记录未保存'}</dd>{record.completedAt && <><dt>耗时</dt><dd>{((record.completedAt - record.createdAt) / 1000).toFixed(1)} 秒</dd></>}<dt>方式</dt><dd>{record.apiMode === 'responses' ? '对话创作' : '直接生图'}</dd>{record.responseModel && <><dt>对话模型</dt><dd>{record.responseModel}</dd></>}<dt>图片模型</dt><dd>{record.model}</dd><dt>请求参数</dt><dd>{record.params.size} · {record.params.quality} · {record.params.output_format.toUpperCase()}</dd><dt>结果</dt><dd>{record.status === 'error' || record.error ? '未完整完成' : '已完成'} · {record.images.length} 张{record.mask ? record.mask.mode === 'markup' ? ' · 标记引导' : ' · 遮罩编辑' : ''}</dd></dl></SimplePopover>{record.completedAt && <span>{((record.completedAt - record.createdAt) / 1000).toFixed(1)} 秒</span>}</div>}
      {record.error && <p className="error-message" role="alert">{record.error}</p>}
    </article>)}
    {busy && <div className="generation-status" role="status"><span className="spinner"/>{activity} · {seconds} 秒</div>}
    <div className="conversation-images">{Object.entries(previews).map(([index, src]) => <div className="chat-image generating-image" key={index}><img src={src} alt={`临时图片预览`} /><span>生成中</span></div>)}</div>
    {!records.length && <div className="workspace-empty">想创作什么？</div>}
  </div>
}

export function SimpleWorkspace({ galleryToolbar, activeTab, chatRecords, galleryItems, onDeleteImage, busy, seconds, previews, ready, storageMessage, error, onEnlarge, onError, onDownloadFile, onEdit, onReuse, onRetry, resultArea, chatId }: { galleryToolbar: HTMLDivElement | null; activeTab: WorkspaceTab; chatRecords: SimpleRecord[]; galleryItems: SimpleGalleryItem[]; onDeleteImage: (item: SimpleGalleryItem) => Promise<void>; busy: boolean; seconds: number; previews: Record<string, string>; ready: boolean; storageMessage: string; error: string; onEnlarge: ImageProps['onEnlarge']; onError: ImageProps['onError']; onEdit: ImageProps['onEdit']; onReuse: ImageProps['onReuse']; onRetry: (record: SimpleRecord) => void; onDownloadFile: (record: SimpleRecord, file: SimpleOutputFile) => void; resultArea: RefObject<HTMLElement | null>; chatId: string }) {
  return <section className={`result-panel tabbed-workspace view-${activeTab}`} ref={resultArea} aria-label="图片工作区">
    {storageMessage && <p className="storage-message workspace-notice" role="alert">{storageMessage}</p>}{error && <p className="error-message workspace-notice" role="alert">{error}</p>}
    <div className="workspace-content" aria-label={activeTab === 'chat' ? '当前对话' : '图库'}>
      {!ready ? <div className="workspace-empty" role="status">正在恢复记录…</div> : activeTab === 'chat' ? <Conversation key={chatId} records={chatRecords} seconds={seconds} previews={previews} onEnlarge={onEnlarge} onError={onError} onEdit={onEdit} onReuse={onReuse} busy={busy} onDownloadFile={onDownloadFile} onRetry={onRetry}/> : <SimpleGallery toolbarTarget={galleryToolbar} onDelete={onDeleteImage} items={galleryItems} onEnlarge={onEnlarge} onError={onError} onEdit={onEdit} onReuse={onReuse} busy={busy}/>}
    </div>
  </section>
}
