import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getCitedMarkdown } from '../lib/simpleCitations'
import type { SimpleRecord, SimpleOutputFile } from '../lib/simpleHistory'
import { copyTextToClipboard } from '../lib/clipboard'
import type { SimpleGalleryItem } from '../lib/simpleGallery'
import { SimplePopover } from './SimplePopover'
import { SimpleStoredImage as StoredImage, type ImageProps } from './SimpleStoredImage'
import { SimpleGallery } from './SimpleGallery'
import { StudioHome } from './StudioHome'
import { StudioIcon } from './StudioIcon'
import appIcon from '../assets/icon.svg'

export type WorkspaceTab = 'studio' | 'chat' | 'gallery'
const ReactMarkdown = lazy(() => import('react-markdown'))

type ConversationProps = {
  records: SimpleRecord[]
  busy: boolean
  imageActionsLocked: boolean
  seconds: number
  previews: Record<string, string>
  onEnlarge: ImageProps['onEnlarge']
  onError: ImageProps['onError']
  onEdit: ImageProps['onEdit']
  onReuse: ImageProps['onReuse']
  onRetry: (record: SimpleRecord) => void
  onDownloadFile: (record: SimpleRecord, file: SimpleOutputFile) => void
}

function CopyButton({ text, label, onError }: { text: string; label: string; onError: (message: string) => void }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1800)
    return () => window.clearTimeout(timer)
  }, [copied])
  return <button type="button" className="message-action copy-message" aria-label={label} onClick={async () => {
    try { await copyTextToClipboard(text); setCopied(true) }
    catch { onError('复制失败，请选择文字后复制。') }
  }}><StudioIcon name={copied ? 'check' : 'copy'} size={14}/><span aria-live="polite">{copied ? '已复制' : '复制'}</span></button>
}

const toolLabels: Record<string, string> = { image_generation_call: '生成图片', web_search_call: '联网搜索', file_search_call: '检索文件', code_interpreter_call: '计算与文件' }
const timestamp = (value: number) => new Date(value).toLocaleString('zh-CN')

function describeActivity(record?: SimpleRecord) {
  const pending = record?.status === 'running' ? record.tools?.filter((tool) => !['completed', 'failed'].includes(tool.status)) : []
  const activities = [...new Set(pending?.map((tool) => toolLabels[tool.type]).filter(Boolean))]
  if (activities.length) return '正在' + activities.join('、')
  return record?.apiMode === 'images' ? '正在生成图片' : '正在响应'
}

function RecordDetails({ record }: { record: SimpleRecord }) {
  const duration = record.completedAt ? ((record.completedAt - record.createdAt) / 1000).toFixed(1) + ' 秒' : ''
  return <>
    <SimplePopover label="消息详情" triggerClassName="message-action" button={<span>详情</span>}><dl className="message-details">
      <dt>发送</dt><dd>{timestamp(record.createdAt)}</dd>
      <dt>结束</dt><dd>{record.completedAt ? timestamp(record.completedAt) : '旧记录未保存'}</dd>
      {duration && <><dt>耗时</dt><dd>{duration}</dd></>}
      <dt>方式</dt><dd>{record.apiMode === 'responses' ? '对话创作' : '直接生图'}</dd>
      {record.responseModel && <><dt>对话模型</dt><dd>{record.responseModel}</dd></>}
      <dt>图片模型</dt><dd>{record.model}</dd>
      <dt>请求参数</dt><dd>{record.params.size} · {record.params.quality} · {record.params.output_format.toUpperCase()}</dd>
      <dt>结果</dt><dd>{record.status === 'error' || record.error ? '未完整完成' : '已完成'} · {record.images.length} 张{record.mask ? record.mask.mode === 'markup' ? ' · 标记引导' : ' · 选区编辑' : ''}</dd>
    </dl></SimplePopover>
    {duration && <span className="message-time">{duration}</span>}
  </>
}

function Conversation({ records, busy, imageActionsLocked, seconds, previews, onEnlarge, onError, onEdit, onReuse, onRetry, onDownloadFile }: ConversationProps) {
  const [visibleCount, setVisibleCount] = useState(20)
  const [away, setAway] = useState(false)
  const pane = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  const earlierHeight = useRef<number | null>(null)
  const current = records[records.length - 1]
  const latest = current?.id

  function jumpToLatest() {
    following.current = true
    setAway(false)
    if (pane.current) pane.current.scrollTop = pane.current.scrollHeight
  }

  useLayoutEffect(jumpToLatest, [latest])
  useLayoutEffect(() => {
    const element = pane.current!
    if (earlierHeight.current !== null) {
      element.scrollTop += element.scrollHeight - earlierHeight.current
      earlierHeight.current = null
    } else if (following.current) element.scrollTop = element.scrollHeight
  }, [visibleCount, records, previews, busy])
  useEffect(() => {
    const element = pane.current!
    const follow = () => { if (following.current) element.scrollTop = element.scrollHeight }
    const observer = new ResizeObserver(follow)
    observer.observe(element)
    if (element.firstElementChild) observer.observe(element.firstElementChild)
    element.addEventListener('imageready', follow)
    return () => { element.removeEventListener('imageready', follow); observer.disconnect() }
  }, [])

  return <div className="conversation-shell">
    <div ref={pane} className="workspace-pane conversation" onScroll={() => {
      const element = pane.current!
      following.current = element.scrollHeight - element.clientHeight - element.scrollTop < 100
      setAway(!following.current)
    }}>
      <div className="conversation-thread">
        {records.length > visibleCount && <button type="button" className="secondary-button load-history" onClick={() => { earlierHeight.current = pane.current!.scrollHeight; setVisibleCount((count) => count + 20) }}>查看更早记录（{records.length - visibleCount}）</button>}
        {records.slice(-visibleCount).map((record) => <article className="conversation-entry" key={record.id}>
          <div className="request-block">
            <div className="request-heading"><span>你的描述</span><time dateTime={new Date(record.createdAt).toISOString()} title={timestamp(record.createdAt)}>{new Date(record.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time></div>
            <div className="request-message">
              <p>{record.prompt}</p>
              {!!record.attachments.length && <div className="history-attachments">{record.attachments.map((file) => <StoredImage key={file.id} asset={file.dataUrl} label={file.name} filename={file.name} onEnlarge={onEnlarge} onError={onError} onEdit={onEdit} onReuse={onReuse} busy={imageActionsLocked} thumbnail download={false}/>)}</div>}
            </div>
            <div className="message-meta user-meta"><CopyButton text={record.prompt} label="复制提示词" onError={onError}/><button type="button" className="message-action" disabled={imageActionsLocked} onClick={() => onRetry(record)}><StudioIcon name="retry" size={14}/>再次使用</button></div>
          </div>
          <div className="assistant-block">
            <div className="assistant-heading"><img src={appIcon} alt="" width="28" height="28"/><strong>图作间</strong></div>
            <div className="assistant-body">
              {record.assistantText && <div className="assistant-message">
                <Suspense fallback={<p className="plain-reply">{record.assistantText}</p>}><ReactMarkdown components={{ a: ({ href, children }) => href && /^https?:\/\//i.test(href) ? <a href={href} target="_blank" rel="noreferrer">{children}</a> : <span>{children}</span>, img: ({ src, alt }) => <a href={typeof src === 'string' && /^https?:\/\//.test(src) ? src : undefined} target="_blank" rel="noreferrer">{alt || '图片链接'}</a> }}>{getCitedMarkdown(record.assistantText, record.citations || [])}</ReactMarkdown></Suspense>
                {!!record.citations?.some((citation) => citation.start === undefined || citation.end === undefined) && <div className="message-sources">{[...new Map(record.citations.filter((citation) => citation.start === undefined || citation.end === undefined).map((citation) => [citation.url, citation])).values()].map((citation) => <a key={citation.url} href={citation.url} target="_blank" rel="noreferrer">{citation.title} ↗</a>)}</div>}
              </div>}
              {record.tools?.filter((tool) => (tool.type !== 'image_generation_call' || tool.status !== 'completed') && (record.status !== 'running' || ['completed', 'failed'].includes(tool.status) || tool.code || tool.logs)).map((tool) => {
                const status = tool.status === 'completed' ? '已完成' : tool.status === 'failed' ? '失败' : record.status !== 'running' ? '已中断' : '进行中'
                const label = toolLabels[tool.type]
                return tool.code || tool.logs ? <details key={tool.id} className="tool-call"><summary>{label}<span>{status}</span></summary>{tool.code && <pre><code>{tool.code}</code></pre>}{tool.logs && <pre className="tool-logs">{tool.logs}</pre>}</details> : <div key={tool.id} className="tool-status">{label}<span>{status}</span></div>
              })}
              {!!record.files?.length && <div className="output-files">{record.files.map((file) => <button className="secondary-button" type="button" key={file.id} onClick={() => onDownloadFile(record, file)}><StudioIcon name="download" size={16}/>{file.name}</button>)}</div>}
              {!!record.images.length && <div className="conversation-images">{record.images.map((asset, i) => <StoredImage key={i} asset={asset} label={'生成图片 ' + (i + 1)} filename={'image-' + record.id + '-' + (i + 1)} source={{ origin: 'generated', sourceAsset: 'result-' + record.id + '-' + i }} onEnlarge={onEnlarge} onError={onError} onEdit={onEdit} onReuse={onReuse} busy={imageActionsLocked}/>)}</div>}
              {record.error && <p className="error-message" role="alert">{record.error}</p>}
              {record.status !== 'running' && <div className="message-meta">{record.assistantText && <CopyButton text={record.assistantText} label="复制回复" onError={onError}/>}<RecordDetails record={record}/></div>}
            </div>
          </div>
        </article>)}
        {busy && <div className="generation-status"><span className="spinner"/><span role="status">{describeActivity(current)}</span><time>{seconds} 秒</time></div>}
        {!!Object.keys(previews).length && <div className="conversation-images">{Object.entries(previews).map(([index, src]) => <div className="chat-image generating-image" key={index}><img src={src} alt="临时图片预览"/><span>生成预览</span></div>)}</div>}
      </div>
    </div>
    {away && <button type="button" className="secondary-button jump-latest" onClick={jumpToLatest}><StudioIcon name="arrowDown" size={16}/>回到最新</button>}
  </div>
}

function StudioResult({ title, ...conversation }: ConversationProps & { title: string }) {
  const { records, busy, seconds, previews, imageActionsLocked, onEnlarge, onEdit, onReuse, onError, onRetry } = conversation
  const [view, setView] = useState<'canvas' | 'thread'>('thread')
  const [selection, setSelection] = useState<{ recordId: string; frameId: string } | null>(null)
  const current = records[records.length - 1]
  const frames = useMemo(() => records.flatMap((record) => record.images.map((asset, order) => ({
    id: `result-${record.id}-${order}`,
    asset,
    order,
    record,
  }))), [records])
  const pickedIndex = selection?.recordId === current.id ? frames.findIndex((frame) => frame.id === selection.frameId) : -1
  const index = pickedIndex < 0 ? frames.length - 1 : pickedIndex
  const frame = frames[index]
  const partials = Object.values(previews)
  const preview = busy && pickedIndex < 0 ? partials[partials.length - 1] : undefined
  const canShowCanvas = busy || frames.length > 0
  const canvas = canShowCanvas && view === 'canvas'

  function selectFrame(next: number) {
    const target = frames[next]
    if (target) setSelection({ recordId: current.id, frameId: target.id })
  }

  return <div className="studio-result">
    <header className="result-toolbar">
      <div className="result-title"><span className="section-code"><i/> SESSION</span><h1 title={title}>{title}</h1></div>
      <div className="result-views" role="group" aria-label="创作视图">
        <button type="button" aria-pressed={canvas} disabled={!canShowCanvas} onClick={() => setView('canvas')}><StudioIcon name="image" size={16}/>画布</button>
        <button type="button" aria-pressed={!canvas} onClick={() => setView('thread')}><StudioIcon name="chat" size={16}/>对话过程</button>
      </div>
    </header>
    {canvas ? <div className="workspace-pane result-stage-scroll">
      <div className="result-stage">
        <div className="result-exposure">
          {preview ? <div className="stage-preview"><img src={preview} alt="生成中的临时预览"/><span>临时预览</span></div>
          : frame ? <StoredImage key={frame.id} asset={frame.asset} label={'生成图片 ' + (index + 1)} caption={frame.record.prompt}
            filename={`image-${frame.record.id}-${frame.order + 1}`} source={{ origin: 'generated', sourceAsset: frame.id }}
            onEnlarge={onEnlarge} onError={onError} onEdit={onEdit} onReuse={onReuse} busy={imageActionsLocked}/>
          : <div className="stage-awaiting"><StudioIcon name="spark" size={51}/><p>正在显影</p></div>}
          {busy && <div className="stage-activity"><span className="spinner"/><span role="status">{describeActivity(current)}</span><time>{seconds} 秒</time></div>}
        </div>
        {current.error && <p className="error-message stage-error" role="alert">{current.error}</p>}
        <div className="stage-index">
          {frame ? <div className="stage-frame-nav" role="group" aria-label="选择生成图片">
            <button className="icon-button" type="button" aria-label="上一张" disabled={index <= 0} onClick={() => selectFrame(index - 1)}><StudioIcon name="chevronLeft" size={17}/></button>
            <span aria-live="polite">{String(index + 1).padStart(2, '0')} / {String(frames.length).padStart(2, '0')}</span>
            <button className="icon-button" type="button" aria-label="下一张" disabled={index >= frames.length - 1} onClick={() => selectFrame(index + 1)}><StudioIcon name="chevronRight" size={17}/></button>
          </div> : <span className="section-code">EXPOSURE</span>}
          {frame && !preview && <div className="stage-record-actions">
            <button type="button" className="text-button" disabled={imageActionsLocked} onClick={() => onRetry(frame.record)}><StudioIcon name="retry" size={15}/>再次使用</button>
            {frame.record.status !== 'running' && <RecordDetails record={frame.record}/>}
          </div>}
        </div>
      </div>
    </div> : <Conversation {...conversation}/>}
  </div>
}

type WorkspaceProps = Omit<ConversationProps, 'records'> & {
  activeTab: WorkspaceTab
  chatRecords: SimpleRecord[]
  galleryItems: SimpleGalleryItem[]
  onDeleteImage: (item: SimpleGalleryItem) => Promise<void>
  ready: boolean
  storageMessage: string
  error: string
  chatId: string
  title: string
  composer: ReactNode
  dark: boolean
  onStart: () => void
}

export function SimpleWorkspace({ activeTab, chatRecords, galleryItems, onDeleteImage, ready, storageMessage, error, chatId, title, composer, dark, onStart, ...conversation }: WorkspaceProps) {
  return <section className={'result-panel view-' + activeTab} aria-label="图片工作区">
    {storageMessage && <p className="storage-message workspace-notice" role="alert">{storageMessage}</p>}
    {error && <p className="error-message workspace-notice" role="alert">{error}</p>}
    <div className="workspace-content">
      {!ready && <div className="workspace-loading" role="status"><span className="spinner"/>正在恢复记录…</div>}
      {ready && activeTab === 'studio' && <StudioHome composer={composer} dark={dark}/>}
      {ready && activeTab === 'gallery' && <SimpleGallery onStart={onStart} onDelete={onDeleteImage} items={galleryItems}
        onEnlarge={conversation.onEnlarge} onError={conversation.onError} onEdit={conversation.onEdit}
        onReuse={conversation.onReuse} busy={conversation.imageActionsLocked}/>}
      {ready && activeTab === 'chat' && (chatRecords.length
        ? <StudioResult key={chatId} title={title} records={chatRecords} {...conversation}/>
        : <div className="session-empty">
          <span><StudioIcon name="chat" size={28}/></span>
          <h1>{title}</h1>
          <p>写下第一条提示词，开始这段对话。</p>
        </div>)}
    </div>
  </section>
}
