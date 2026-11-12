import { useLayoutEffect, useRef, useState, type FormEventHandler, type ReactNode, type RefObject } from 'react'
import { MAX_INPUT_IMAGES } from '../types'
import { type SimpleTools } from '../lib/simpleResponses'
import type { SimpleAttachment, SimpleMask } from '../lib/simpleHistory'
import { Info, HelpRows, SimpleChoice, SimplePopover } from './SimplePopover'
import { StudioIcon } from './StudioIcon'

type Props = {
  textarea: RefObject<HTMLTextAreaElement | null>
  prompt: string
  continuing: boolean
  onChange: (value: string) => void
  onSubmit: FormEventHandler<HTMLFormElement>
  attachments: SimpleAttachment[]
  onAddFiles: (files: File[]) => void
  onChooseFromGallery: () => void
  onEdit: (file: SimpleAttachment) => void
  onEnlarge: (src: string, label: string) => void
  onRemove: (file: SimpleAttachment) => void
  mask?: SimpleMask
  onRemoveMask: () => void
  mode: 'responses' | 'images'
  onModeChange: (value: 'responses' | 'images') => void
  tools: SimpleTools
  onToolsChange: (tools: SimpleTools) => void
  imageSettings: ReactNode
  ready: boolean
  busy: boolean
  elsewhere: boolean
  readingFiles: boolean
  attachmentMessage: string
  canRebuild: boolean
  rebuildContext: boolean
  onToggleRebuild: () => void
  onFavorite: () => void
  onChooseFromFavorites: () => void
  onStop: () => void
  price: ReactNode
  responseModel: ReactNode
}

const closeMenu = (trigger: HTMLElement) => trigger.closest<HTMLElement>('[popover]')?.hidePopover()

export function StudioComposer({ textarea, prompt, continuing, onChange, onSubmit, attachments, onAddFiles, onChooseFromGallery, onEdit, onEnlarge, onRemove, mask, onRemoveMask, mode, onModeChange, tools, onToolsChange, imageSettings, ready, busy, elsewhere, readingFiles, attachmentMessage, canRebuild, rebuildContext, onToggleRebuild, onFavorite, onChooseFromFavorites, onStop, price, responseModel }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)
  const [dragging, setDragging] = useState(false)
  const responses = mode === 'responses'
  const markup = mask?.mode === 'markup'
  const locked = busy || readingFiles || !ready
  const atLimit = attachments.length >= MAX_INPUT_IMAGES
  const canFavorite = !!prompt.trim() || attachments.length > 0
  const submitLabel = !responses || tools.images || mask ? '生成' : '发送'
  const status = attachmentMessage || (readingFiles ? '正在读取参考图…' : elsewhere ? '另一个对话正在生成' : mask ? markup ? '已添加编辑标记' : '已选区 · 保留选区外画面' : rebuildContext ? '下次发送时重建上下文' : '')
  const placeholder = mask
    ? markup ? '描述标记处要怎么改，例如把圈中的花瓶换成蓝色…' : '描述选区要怎么改，例如把沙发换成米白色…'
    : continuing && responses ? '继续描述画面，或说说想怎么改…' : '描述你想创作的画面…'

  useLayoutEffect(() => {
    const input = textarea.current
    if (!input) return
    const resize = () => { input.style.height = 'auto'; input.style.height = `${input.scrollHeight}px` }
    resize()
    let lastWidth = input.clientWidth
    const observer = new ResizeObserver(() => { if (input.clientWidth !== lastWidth) { lastWidth = input.clientWidth; resize() } })
    observer.observe(input)
    return () => observer.disconnect()
  }, [prompt, textarea])

  return <div className="composer-dock"><form className="chat-composer workspace-frame" aria-label="创作输入" onSubmit={onSubmit}>
    <div className={`composer-input${dragging ? ' is-dragging' : ''}`}
      onDragEnter={(event) => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); if (!locked && !atLimit) { dragDepth.current++; setDragging(true) } } }}
      onDragLeave={() => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false) }}
      onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = locked || atLimit ? 'none' : 'copy' } }}
      onDrop={(event) => { if (event.dataTransfer.files.length) { event.preventDefault(); if (!locked) onAddFiles(Array.from(event.dataTransfer.files)) }; dragDepth.current = 0; setDragging(false) }}
      onPaste={(event) => { const files = Array.from(event.clipboardData.files); if (files.length) { event.preventDefault(); if (!locked) onAddFiles(files) } }}>
      {dragging && <div className="composer-drop-indicator" aria-hidden="true"><StudioIcon name="upload" size={22}/>松开以添加参考图</div>}
      {mask && <label className="prompt-label" htmlFor="studio-prompt">编辑描述</label>}
      {!!attachments.length && <div className="composer-attachments" aria-label="已添加的参考图">{attachments.map((file, i) => <div className="composer-attachment" key={file.id}>
        <button type="button" className="composer-attachment-preview" aria-label={`查看参考图 ${i + 1}：${file.name}`} onClick={() => onEnlarge(file.dataUrl, file.name)}><img src={file.dataUrl} alt=""/></button>
        <button type="button" className={`edit-composer-attachment${mask?.targetId === file.id ? ' is-applied' : ''}`} disabled={locked} onClick={() => onEdit(file)} aria-label={`编辑参考图 ${i + 1}`}>{mask?.targetId === file.id ? markup ? '已标记' : '已选区' : '编辑'}</button>
        <button type="button" className="remove-composer-attachment" aria-label={`移除参考图 ${i + 1}`} disabled={locked} onClick={() => onRemove(file)}><StudioIcon name="close" size={13}/></button>
      </div>)}</div>}
      <textarea id="studio-prompt" ref={textarea} aria-label={mask ? undefined : '创作描述'} placeholder={placeholder} value={prompt}
        onChange={(event) => onChange(event.target.value)} disabled={locked} rows={2}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return
          event.preventDefault()
          event.currentTarget.form?.requestSubmit()
        }}/>

      <div className="composer-actions">
        <div className="composer-tools">
          <SimplePopover label="添加参考图" triggerClassName="composer-button attachment-button" button={<><StudioIcon name="plus"/><span className="attach-label">参考图</span></>} disabled={locked}>
            <div className="chat-action-menu">
              <button type="button" disabled={atLimit} onClick={(event) => { closeMenu(event.currentTarget); fileInput.current?.click() }}><StudioIcon name="upload" size={17}/>上传图片</button>
              <button type="button" disabled={atLimit} onClick={(event) => { closeMenu(event.currentTarget); onChooseFromGallery() }}><StudioIcon name="image" size={17}/>从图库选择</button>
              {mask && <button type="button" onClick={(event) => { closeMenu(event.currentTarget); onRemoveMask() }}><StudioIcon name="close" size={17}/>{markup ? '移除编辑标记' : '移除编辑选区'}</button>}
              <p>{atLimit ? `已达到 ${MAX_INPUT_IMAGES} 张参考图的上限` : '也可以拖入或粘贴图片'}</p>
            </div>
          </SimplePopover>
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(event) => { onAddFiles(Array.from(event.target.files || [])); event.target.value = '' }}/>
          <SimpleChoice triggerClassName="composer-button mode-button" icon={responses ? 'chat' : 'image'} buttonLabel={responses ? '对话创作' : '直接生图'} label="创作方式" value={mode} disabled={locked} onChange={(value) => onModeChange(value as Props['mode'])} options={[{ value: 'responses', label: '对话创作', detail: '保留对话上下文，可继续修改图片。' }, { value: 'images', label: '直接生图', detail: '只使用本次描述与参考图。' }]} help={<HelpRows rows={[["对话创作", "使用 Responses API，可连续修改，例如“把它改成夜景”。"], ["直接生图", "使用 Images API，每次独立生成。"]]}/>}/>
          {imageSettings}
          {responses && <SimplePopover label="对话工具" triggerClassName="composer-button tools-icon-button" button={<><StudioIcon name="tools" size={17}/><span className="tools-label">工具</span></>} disabled={locked}>
            <fieldset className="tool-menu" disabled={locked}>
              <h3>对话工具</h3><p>选择此对话可使用的工具。</p>
              {([['images', '图片生成'], ['web', '联网搜索'], ['code', '计算与文件'], ['files', '文件检索']] as const).map(([key, label]) => <div className="tool-option" key={key}><label><input type="checkbox" checked={tools[key]} onChange={(event) => onToolsChange({ ...tools, [key]: event.target.checked })}/>{label}</label><Info label={label}><HelpRows rows={key === 'images' ? [['开启', '使用所选图片模型生成或编辑图片。'], ['关闭', '仅使用其余已启用的工具。']] : key === 'web' ? [['用途', '查找新信息，例如今年的海报趋势。'], ['费用', '搜索另计费。']] : key === 'code' ? [['用途', '计算和制作文件，例如配色表。'], ['费用', '代码容器另计费。'], ['保存', '生成的文件请及时下载。']] : [['用途', '从已有知识库找资料，例如品牌手册。'], ['配置', '需填写 vs_ ID。'], ['费用', '检索与存储另计费。']]}/></Info></div>)}
              {tools.files && <label className="setting-row"><span>向量库 ID</span><input placeholder="vs_…，多个用逗号分隔" value={tools.vectorStoreIds} onChange={(event) => onToolsChange({ ...tools, vectorStoreIds: event.target.value })}/></label>}
              {tools.images && <div className="setting-row">
                <span>图片操作</span>
                <SimpleChoice label="图片操作" value={tools.action} disabled={locked} onChange={(action) => onToolsChange({ ...tools, action })}
                  options={[{ value: 'auto', label: '自动选择' }, { value: 'generate', label: '新建图片' }, { value: 'edit', label: '强制编辑' }]}/>
              </div>}
              {canRebuild && <div className="chat-action-menu">
                <button type="button" aria-pressed={rebuildContext} onClick={(event) => { closeMenu(event.currentTarget); onToggleRebuild() }}>{rebuildContext ? '取消重建上下文' : '重建上下文'}</button>
              </div>}
            </fieldset>
          </SimplePopover>}
          <SimplePopover label="收藏" triggerClassName="composer-button composer-favorites" button={<StudioIcon name="bookmark" size={17}/>} disabled={locked}>
            <div className="chat-action-menu">
              <button type="button" onClick={(event) => { closeMenu(event.currentTarget); onChooseFromFavorites() }}><StudioIcon name="stack" size={17}/>使用收藏</button>
              {canFavorite && <button type="button" onClick={(event) => { closeMenu(event.currentTarget); onFavorite() }}><StudioIcon name="bookmark" size={17}/>收藏当前输入</button>}
            </div>
          </SimplePopover>
        </div>
        {busy && responses && !elsewhere ? <button type="button" className="primary-button send-button" onClick={onStop}><StudioIcon name="stop" size={16}/>停止</button> : <button type="submit" className="primary-button send-button" title={`${submitLabel}（Enter）`} disabled={locked || !prompt.trim()}>{busy || readingFiles ? <span className="spinner"/> : <StudioIcon name="send" size={18}/>}<span>{submitLabel}</span></button>}
      </div>
    </div>
    <div className="composer-caption">
      <div className="composer-caption-left">{price}{status && <span className="composer-status" role="status">{status}</span>}</div>
      <div className="composer-caption-right">
        <span className="composer-keys"><kbd>Enter</kbd> 发送 <span>·</span> <kbd>Shift + Enter</kbd> 换行</span>
        {responseModel}
      </div>
    </div>
  </form></div>
}
