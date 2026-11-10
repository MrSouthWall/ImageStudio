import { useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_PARAMS, MAX_INPUT_IMAGES, type TaskParams } from '../types'
import { callImageApi } from '../lib/api'
import { createDefaultOpenAIProfile, DEFAULT_SETTINGS, normalizeSettings } from '../lib/apiProfiles'
import { fileToDataUrl } from '../lib/dataUrl'
import { saveFile } from '../lib/saveFile'
import { buildApiUrl } from '../lib/devProxy'
import { getSimpleSizeDirection, getSimpleSizePresets, getSimpleSizeError, SIMPLE_DEFAULT_SIZE } from '../lib/simpleSize'
import { SIMPLE_IMAGE_MODELS } from '../lib/simpleImageModels'
import { estimateImageOutput } from '../lib/imagePricing'
import { toApiInputImageDataUrl, validateMaskMatchesImage } from '../lib/canvasImage'
import { createSimpleMarkupEdit, SIMPLE_MARKUP_INSTRUCTION, validateSimpleMarkup } from '../lib/simpleMarkupEdit'
import { createSimpleMaskedEdit, SIMPLE_MASK_INSTRUCTION } from '../lib/simpleMaskedEdit'
import { buildSimpleConversationInput } from '../lib/simpleConversation'
import { callSimpleResponses, DEFAULT_SIMPLE_TOOLS, RESPONSE_MODELS, RESPONSE_MODEL_CHOICES, simpleResponseScope, type SimpleTools } from '../lib/simpleResponses'
import { deleteSimpleGalleryImage, loadSimpleState, loadSimpleAssets, loadSimpleDraft, saveSimpleChat, saveSimpleItem, simpleRecordMetadata, type SimpleAttachment as Attachment, type SimpleRecord, type SimpleReference, type SimpleChat, type SimpleDraft, type SimpleOutputFile, type SimpleMask } from '../lib/simpleHistory'
import { Info, SimplePopover, SimpleChoice, HelpRows } from './SimplePopover'
import { SimpleImageSettings } from './SimpleImageSettings'
import { buildSimpleGallery, type SimpleGalleryItem } from '../lib/simpleGallery'
import { SimpleGalleryPicker } from './SimpleGallery'
import type { ImageSource } from './SimpleStoredImage'
import { SimpleWorkspace, type WorkspaceTab } from './SimpleWorkspace'
import { SimpleSidebarResize } from './SimpleSidebarResize'
import { SimpleDataBackup } from './SimpleDataBackup'
import { SimpleChatList } from './SimpleChatList'
import { SimpleMaskEditor } from './SimpleMaskEditor'
import appIcon from '../assets/icon.svg'
import licenseUrl from '../../LICENSE?url'
import noticesUrl from '../assets/third-party-notices.txt?url'
import exampleSourcesUrl from '../assets/examples/SOURCES.json?url'

const MODELS = SIMPLE_IMAGE_MODELS.map((model) => model.value)
const STORAGE_KEY = 'gpt-image-simple-connection'
const views = [{ id: 'chat', label: '对话', icon: 'chat' }, { id: 'gallery', label: '图库', icon: 'image' }] as const

function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = { menu: 'M4 6h16M4 12h16M4 18h16', plus: 'M12 4v16M4 12h16', chat: 'M21 11a8 8 0 0 1-8 8H6l-4 3V11a9 9 0 0 1 19 0Z', image: 'M4 3h16v18H4zM4 16l5-6 4 4 3-3 4 5M15 7h.01', reference: 'M7 7h14v14H7zM3 17V3h14', settings: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0', send: 'M12 20V4m-6 6 6-6 6 6', tools: 'm4 7 8-4 8 4-8 4-8-4Zm0 5 8 4 8-4M4 17l8 4 8-4', close: 'm6 6 12 12M6 18 18 6', attach: 'm8 13 7-7a3 3 0 0 1 4 4L9 20a5 5 0 0 1-7-7L13 2', panel: 'M4 4h16v16H4ZM9 4v16', stop: 'M6 6h12v12H6Z' }
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.chat} fill={name === 'stop' ? 'currentColor' : 'none'}/></svg>
}

export function SimpleGenerator() {
  const [connection, setConnection] = useState(() => {
    const fallback = { apiKey: '', baseUrl: 'https://api.openai.com', model: MODELS[0], apiMode: 'responses' as 'images' | 'responses', responseModel: 'gpt-6.1-sol', defaultsVersion: 2 }
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
      if (saved) return { apiKey: typeof saved.apiKey === 'string' ? saved.apiKey : '', baseUrl: typeof saved.baseUrl === 'string' ? saved.baseUrl : fallback.baseUrl, model: MODELS.includes(saved.model) ? saved.model : fallback.model, apiMode: saved.apiMode === 'images' ? 'images' as const : 'responses' as const, responseModel: RESPONSE_MODELS.includes(saved.responseModel) && (saved.defaultsVersion === 2 || saved.responseModel !== 'gpt-5.4-mini') ? saved.responseModel : fallback.responseModel, defaultsVersion: 2 }
    } catch { /* 浏览器可能限制本地存储。 */ }
    return fallback
  })
  const [saved, setSaved] = useState(false)
  const [backupBusy, setBackupBusy] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [params, setParams] = useState<TaskParams>({ ...DEFAULT_PARAMS })
  const [customSize, setCustomSize] = useState(SIMPLE_DEFAULT_SIZE)
  const [background, setBackground] = useState('auto')
  const [partialCount, setPartialCount] = useState(0)
  const [timeout, setTimeoutValue] = useState(600)
  const [exchangeRate, setExchangeRate] = useState(7)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [mask, setMask] = useState<SimpleMask | undefined>()
  const [editingImage, setEditingImage] = useState<Attachment | null>(null)
  const [tools, setTools] = useState<SimpleTools>({ ...DEFAULT_SIMPLE_TOOLS })
  const [readingFiles, setReadingFiles] = useState(false)
  const reading = useRef(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const [attachmentMessage, setAttachmentMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const active = useRef(false)
  const controller = useRef<AbortController | null>(null)
  const [busyChat, setBusyChat] = useState('')
  const [seconds, setSeconds] = useState(0)
  const [records, setRecords] = useState<SimpleRecord[]>([])
  const [deletedGallery, setDeletedGallery] = useState<string[]>([])
  const [references, setReferences] = useState<SimpleReference[]>([])
  const [chats, setChats] = useState<SimpleChat[]>([])
  const [chatId, setChatId] = useState('')
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('chat')
  const [galleryToolbar, setGalleryToolbar] = useState<HTMLDivElement | null>(null)
  const [galleryPicker, setGalleryPicker] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => { try { return localStorage.getItem('gpt-image-sidebar-collapsed') === 'true' } catch { return false } })
  useEffect(() => { try { localStorage.setItem('gpt-image-sidebar-collapsed', String(sidebarCollapsed)) } catch { /* 本次仍可收起。 */ } }, [sidebarCollapsed])
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 800px)')
    const closeDrawer = () => { if (desktop.matches) setSidebarOpen(false) }
    desktop.addEventListener('change', closeDrawer)
    return () => desktop.removeEventListener('change', closeDrawer)
  }, [])
  const [search, setSearch] = useState('')
  const [historyReady, setHistoryReady] = useState(false)
  const [draftReady, setDraftReady] = useState(false)
  const draftWrites = useRef(Promise.resolve())
  const [storageMessage, setStorageMessage] = useState('')
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const [rebuildContext, setRebuildContext] = useState(false)
  const settingsDialog = useRef<HTMLDialogElement>(null)
  const [error, setError] = useState('')
  const [enlarged, setEnlarged] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const resultArea = useRef<HTMLElement>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const currentRecords = records.filter((record) => record.chatId === chatId)
  const visibleRecords = useMemo(() => { const deleted = new Set(chats.filter((chat) => chat.deletedAt).map((chat) => chat.id)); return records.filter((record) => !deleted.has(record.chatId || '')) }, [records, chats])
  const galleryItems = useMemo(() => { if (workspaceTab !== 'gallery' && !galleryPicker) return []; const deleted = new Set(deletedGallery); return buildSimpleGallery(visibleRecords, references).filter((item) => !deleted.has(item.id)) }, [workspaceTab, galleryPicker, visibleRecords, references, deletedGallery])
  const responses = connection.apiMode === 'responses'
  const markup = mask?.mode === 'markup'
  const animated = params.output_format === 'gif' || params.output_format === 'svg'
  const size = params.size === 'custom' ? customSize.trim().toLowerCase().replace('×', 'x') : params.size
  const image25 = connection.model.startsWith('gpt-image-2.5-')
  const estimateSize = size === 'auto' ? SIMPLE_DEFAULT_SIZE : size
  const estimateQuality = params.quality === 'auto' ? 'high' : params.quality
  const estimate = estimateImageOutput({ ...params, size: estimateSize, quality: estimateQuality }, animated ? 0 : partialCount, connection.model)

  function openSettings() {
    settingsDialog.current?.showModal()
    settingsDialog.current?.querySelector<HTMLInputElement>('#api-key')?.focus()
  }

  function restoreDraft(draft: SimpleDraft | undefined, id: string) {
    let recent: Partial<SimpleDraft> = {}
    try { recent = JSON.parse(localStorage.getItem(`gpt-image-simple-draft:${id}`) || (id === 'legacy' ? localStorage.getItem('gpt-image-simple-draft') : null) || '{}') } catch { /* 使用 IndexedDB 中的草稿。 */ }
    const fields = draft ? { ...draft, ...recent, attachments: draft.attachments, mask: draft.mask } : recent
    setPrompt(fields.prompt || '')
    setAttachments(fields.attachments || [])
    setMask(fields.mask)
    if (fields.mask?.mode === 'markup') setConnection((current) => ({ ...current, apiMode: 'images' }))
    const restoredParams = { ...DEFAULT_PARAMS, ...fields.params }
    setParams(restoredParams)
    setCustomSize(fields.customSize || SIMPLE_DEFAULT_SIZE)
    if (!['auto', 'custom'].includes(restoredParams.size) && !getSimpleSizePresets(getSimpleSizeDirection(restoredParams.size), restoredParams.output_format).some((preset) => preset.value === restoredParams.size)) { setParams({ ...restoredParams, size: 'custom' }); setCustomSize(restoredParams.size) }
    setBackground(fields.background || 'auto')
    setPartialCount(fields.partialCount || 0)
    setTimeoutValue(fields.timeout ?? 600)
    setExchangeRate(fields.exchangeRate ?? 7)
    setTools({ ...DEFAULT_SIMPLE_TOOLS, ...fields.tools })
  }

  useEffect(() => {
    let cancelled = false
    loadSimpleState().then(async (state) => {
      if (cancelled) return
      const allChats = [...state.chats]
      if (!allChats.some((chat) => !chat.archived && !chat.deletedAt)) { const fresh = { id: crypto.randomUUID(), title: '新对话', createdAt: Date.now(), updatedAt: Date.now() }; allChats.unshift(fresh); await saveSimpleChat(fresh) }
      let storedId = ''
      try { storedId = localStorage.getItem('gpt-image-active-chat') || '' } catch { /* 使用最近的对话。 */ }
      const id = allChats.find((chat) => chat.id === storedId && !chat.deletedAt && !chat.archived)?.id || allChats.find((chat) => !chat.archived && !chat.deletedAt)!.id
      const draft = await loadSimpleDraft(id) || (!state.chats.length ? await loadSimpleDraft('current') : undefined)
      if (cancelled) return
      setChats(allChats); setChatId(id)
      setRecords(state.records.map((record) => record.status === 'running' ? { ...record, status: 'error', error: '上次响应已中断，已完成内容保留；不会自动重试。' } : record))
      setReferences(state.references)
      setDeletedGallery(state.deletedGallery)
      restoreDraft(draft, id)
      if (!state.chats.length) void saveSimpleChat(allChats[0]).catch(() => setStorageMessage('对话保存失败，请及时下载图片。'))
    }).catch(() => {
      if (cancelled) return
      const chat = { id: crypto.randomUUID(), title: '新对话', createdAt: Date.now(), updatedAt: Date.now() }
      setChats([chat]); setChatId(chat.id); setStorageMessage('历史存储不可用，本次结果请及时下载。')
    }).finally(() => { if (!cancelled) { setHistoryReady(true); setDraftReady(true) } })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!historyReady || !draftReady || !chatId) return
    const fields = { chatId, prompt, params, customSize, background, partialCount, timeout, exchangeRate, tools }
    try { localStorage.setItem(`gpt-image-simple-draft:${chatId}`, JSON.stringify(fields)); localStorage.setItem('gpt-image-active-chat', chatId) } catch { /* 完整草稿仍由 IndexedDB 保存。 */ }
    draftWrites.current = draftWrites.current.then(() => saveSimpleItem('draft', { ...fields, attachments, mask })).then(() => setReferences((current) => {
      const added = attachments.filter((file) => !current.some((reference) => reference.id === file.id)).map((file) => ({ id: file.id, name: file.name, origin: file.origin, sourceAsset: file.sourceAsset, dataUrl: `attachment-${file.id}`, createdAt: file.createdAt || Date.now() }))
      return added.length ? [...added.reverse(), ...current] : current
    })).catch(() => setStorageMessage('草稿或附件保存失败，请及时下载图片。'))
  }, [historyReady, draftReady, chatId, prompt, params, customSize, background, partialCount, timeout, exchangeRate, attachments, mask, tools])

  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(connection)); setSaved(true) } catch { setSaved(false) } }, [connection])
  useEffect(() => {
    if (!busy) return
    const start = Date.now()
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [busy])
  useEffect(() => { if (enlarged) dialog.current?.showModal() }, [enlarged])
  useEffect(() => { const input = textarea.current; if (input) { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 140)}px` } }, [prompt, workspaceTab])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setSidebarOpen(false) }
    const onResize = () => { if (window.innerWidth >= 800) setSidebarOpen(false) }
    window.addEventListener('keydown', onKey); window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize) }
  }, [])

  async function switchChat(id: string, fresh = false) {
    if (!draftReady || reading.current) return
    setDraftReady(false)
    try {
      await draftWrites.current
      const draft = fresh ? undefined : await loadSimpleDraft(id)
      restoreDraft(draft, id)
      setChatId(id); setWorkspaceTab('chat'); setRebuildContext(false); setError(''); setAttachmentMessage(''); setSidebarOpen(false)
    } catch { setError('对话草稿读取失败，请重试。') }
    finally { setDraftReady(true) }
  }

  async function newChat() {
    if (!draftReady || reading.current) return
    setSearch('')
    if (!chats.find((chat) => chat.id === chatId)?.archived && !currentRecords.length && !prompt.trim() && !attachments.length) { setWorkspaceTab('chat'); setSidebarOpen(false); return }
    const chat = { id: crypto.randomUUID(), title: '新对话', createdAt: Date.now(), updatedAt: Date.now() }
    setChats((current) => [chat, ...current])
    void saveSimpleChat(chat).catch(() => setStorageMessage('对话保存失败。'))
    await switchChat(chat.id, true)
  }

  async function updateChat(chat: SimpleChat) {
    if (reading.current || !draftReady) return
    try {
      await draftWrites.current
      await saveSimpleChat(chat)
      setChats((current) => current.map((item) => item.id === chat.id ? chat : item))
      if (chat.id === chatId && (chat.deletedAt || chat.archived)) {
        const next = chats.find((item) => item.id !== chat.id && !item.archived && !item.deletedAt)
        if (next) await switchChat(next.id)
        else {
          const fresh = { id: crypto.randomUUID(), title: '新对话', createdAt: Date.now(), updatedAt: Date.now() }
          await saveSimpleChat(fresh); setChats((current) => [fresh, ...current]); await switchChat(fresh.id, true)
        }
      }
    } catch { setError('对话保存失败，请重试。') }
  }

  async function reuseImage(src: string, name: string, source?: ImageSource) {
    if (active.current || reading.current || !draftReady) return
    if (source && attachments.some((file) => file.id === source.id || file.sourceAsset === source.sourceAsset)) { setWorkspaceTab('chat'); return }
    if (attachments.length >= MAX_INPUT_IMAGES) { setError(`最多添加 ${MAX_INPUT_IMAGES} 张参考图。`); return }
    reading.current = true; setReadingFiles(true)
    try {
      const dataUrl = await toApiInputImageDataUrl(src)
      setAttachments((current) => [...current, { id: source?.id || (source ? `reused-${source.sourceAsset}` : crypto.randomUUID()), name, dataUrl, createdAt: Date.now(), origin: source?.origin || 'uploaded', sourceAsset: source?.sourceAsset }])
      setParams((current) => ({ ...current, output_format: current.output_format === 'gif' ? 'gif' : 'png' })); setTools((current) => ({ ...current, images: true }))
      setWorkspaceTab('chat'); requestAnimationFrame(() => textarea.current?.focus())
    } catch { setError('图片读取失败，请重试。') }
    finally { reading.current = false; setReadingFiles(false) }
  }

  async function addGalleryImages(items: SimpleGalleryItem[]) {
    if (active.current || reading.current || !draftReady) throw new Error('请等待当前操作完成。')
    if (attachments.length + items.length > MAX_INPUT_IMAGES) throw new Error(`最多添加 ${MAX_INPUT_IMAGES} 张参考图。`)
    reading.current = true; setReadingFiles(true)
    try {
      const assets = await loadSimpleAssets(items.filter((item) => !item.asset.startsWith('data:')).map((item) => item.asset))
      let index = 0
      const added: Attachment[] = []
      for (const item of items) {
        const source = item.asset.startsWith('data:') ? item.asset : assets[index++]
        if (!source) throw new Error('图片已不可用，请重新选择。')
        added.push({ id: item.attachmentId || `reused-${item.sourceAsset}`, name: item.filename, dataUrl: await toApiInputImageDataUrl(source), origin: item.origin, sourceAsset: item.sourceAsset, createdAt: item.createdAt })
      }
      setAttachments((current) => [...current, ...added])
      setParams((current) => ({ ...current, output_format: current.output_format === 'gif' ? 'gif' : 'png' })); setTools((current) => ({ ...current, images: true }))
      setGalleryPicker(false); requestAnimationFrame(() => textarea.current?.focus())
    } finally { reading.current = false; setReadingFiles(false) }
  }

  function editImage(src: string, name: string, source?: ImageSource) {
    if (active.current || reading.current || !draftReady) return
    const existing = attachments.find((file) => file.dataUrl === src)
    if (!existing && attachments.length >= MAX_INPUT_IMAGES) { setError(`最多添加 ${MAX_INPUT_IMAGES} 张参考图，请先移除一张。`); return }
    setEditingImage(existing || { id: crypto.randomUUID(), name, dataUrl: src, createdAt: Date.now(), origin: source?.origin || 'uploaded', sourceAsset: source?.sourceAsset })
  }

  async function reuseRecord(record: SimpleRecord) {
    if (active.current || reading.current || !draftReady) return
    reading.current = true; setReadingFiles(true)
    try {
      const files = await Promise.all(record.attachments.map(async (file) => ({ ...file, dataUrl: file.dataUrl.startsWith('data:') ? file.dataUrl : (await loadSimpleAssets([file.dataUrl]))[0] })))
      if (files.some((file) => !file.dataUrl)) throw new Error('参考图读取失败。')
      const restoredMask = record.mask ? { ...record.mask, dataUrl: record.mask.dataUrl.startsWith('data:') ? record.mask.dataUrl : (await loadSimpleAssets([record.mask.dataUrl]))[0] } : undefined
      setPrompt(record.prompt); setAttachments(files); setMask(restoredMask); if (restoredMask?.mode === 'markup') setConnection((current) => ({ ...current, apiMode: 'images' }))
      setWorkspaceTab('chat'); requestAnimationFrame(() => textarea.current?.focus())
    } catch { setError('读取这条消息失败，请重试。') }
    finally { reading.current = false; setReadingFiles(false) }
  }

  async function addAttachments(files: File[]) {
    if (!historyReady || !draftReady || active.current || reading.current || !files.length) return
    setAttachmentMessage('')
    if (attachments.length + files.length > MAX_INPUT_IMAGES) { setAttachmentMessage(`最多添加 ${MAX_INPUT_IMAGES} 张参考图。`); return }
    if (files.some((file) => !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 50 * 1024 * 1024)) { setAttachmentMessage('请选择50 MB以内的 PNG、JPEG 或 WebP 图片。'); return }
    reading.current = true; setReadingFiles(true)
    try {
      const added: Attachment[] = []
      for (const file of files) { const dataUrl = await fileToDataUrl(file); const image = new Image(); image.src = dataUrl; await image.decode(); const id = crypto.randomUUID(); added.push({ id, name: file.name, dataUrl, createdAt: Date.now(), origin: 'uploaded', sourceAsset: `attachment-${id}` }) }
      setAttachments((current) => [...current, ...added])
      if (params.output_format === 'svg') { setParams((current) => ({ ...current, output_format: 'png' })); setAttachmentMessage('已切换为 PNG，以使用参考图。') }
    } catch { setAttachmentMessage('图片读取失败，请确认文件有效。') }
    finally { reading.current = false; setReadingFiles(false) }
  }

  async function generate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!historyReady || !draftReady || active.current || reading.current || !prompt.trim()) return
    setError('')
    if (!connection.apiKey.trim()) { openSettings(); return }
    if (markup && responses) { setError('标记引导仅支持直接生图（Images API），请切换创作方式后发送。'); return }
    if (image25 && animated) { setError('GPT Image 2.5 请使用 PNG、JPEG 或 WebP 输出；SVG / GIF 请选择 2.6。'); return }
    const sizeError = !mask && (!responses || tools.images) ? getSimpleSizeError(size, params.output_format) : null
    if (sizeError) { setError(sizeError); return }
    try { const url = new URL(connection.baseUrl); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error() } catch { setError('请输入有效的 HTTP / HTTPS 接口地址。'); return }
    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0 || exchangeRate > 1000 || !Number.isFinite(timeout) || timeout < 30 || timeout > 3600) { openSettings(); return }
    if (responses && tools.files && !tools.vectorStoreIds.trim()) { setError('请先在工具选项中填写文件检索的向量库 ID。'); return }
    if (mask && (!attachments.some((file) => file.id === mask.targetId) || animated)) { setError('请重新选择编辑图片，并使用 PNG、JPEG 或 WebP 输出。'); return }
    if (mask) {
      reading.current = true; setReadingFiles(true)
      try { const target = attachments.find((file) => file.id === mask.targetId)!; if (markup) await validateSimpleMarkup(mask.dataUrl, target.dataUrl); else await validateMaskMatchesImage(mask.dataUrl, target.dataUrl) } catch (err) { setError(err instanceof Error ? err.message : '选区无效'); return } finally { reading.current = false; setReadingFiles(false) }
    }
    if (active.current) return
    if (responses && tools.images && tools.action === 'edit' && !attachments.length && !currentRecords.some((record) => record.images.length || record.attachments.length)) { setError('强制编辑需要参考图，或对话中已有图片。'); return }
    active.current = true; setBusy(true); setBusyChat(chatId); setSeconds(0); setPreviews({}); setWorkspaceTab('chat')
    controller.current = new AbortController()
    let record: SimpleRecord = { id: crypto.randomUUID(), chatId, createdAt: Date.now(), prompt: prompt.trim(), model: connection.model, apiMode: connection.apiMode, responseModel: responses ? connection.responseModel : undefined, params: { ...params, size, complexity: image25 ? 'auto' : params.complexity }, attachments: mask ? [...attachments].sort((a, b) => Number(b.id === mask.targetId) - Number(a.id === mask.targetId)) : [...attachments], mask, images: [], status: 'running', error: '', outputUsd: null, exchangeRate }
    setRecords((current) => [...current, record])
    const chat = { ...chats.find((chat) => chat.id === chatId)!, title: currentRecords.length || chats.find((chat) => chat.id === chatId)?.renamed ? chats.find((chat) => chat.id === chatId)!.title : prompt.trim().slice(0, 32), updatedAt: Date.now() }
    setChats((current) => [chat, ...current.filter((item) => item.id !== chat.id)])
    void saveSimpleChat(chat).catch(() => setStorageMessage('对话标题保存失败。'))
    setPrompt(''); setAttachments([]); setMask(undefined); setAttachmentMessage('')
    let writes = Promise.resolve()
    let uiTimer: ReturnType<typeof setTimeout> | undefined
    const publish = (persist = true) => {
      if (uiTimer) { clearTimeout(uiTimer); uiTimer = undefined }
      const snapshot = { ...record, images: [...record.images] }
      setRecords((current) => current.map((item) => item.id === snapshot.id ? snapshot : item))
      if (persist) writes = writes.then(async () => { await saveSimpleItem('records', snapshot); setRecords((current) => current.map((item) => item === snapshot ? simpleRecordMetadata(snapshot) : item)) }).catch(() => setStorageMessage('本次记录保存失败，请及时下载图片。'))
    }
    let imageWork = Promise.resolve()
    let imageError: unknown
    let receivedImages = 0
    let maskedEdit: Awaited<ReturnType<typeof createSimpleMaskedEdit>> | undefined
    const receiveImage = (src: string) => {
      receivedImages++
      imageWork = imageWork.then(async () => {
        const image = maskedEdit ? await maskedEdit.render(src) : src
        record = { ...record, images: [...record.images, image] }
        publish()
      }).catch((err) => { imageError = err })
    }
    publish()
    try {
      if (record.mask) {
        maskedEdit = record.mask.mode === 'markup' ? await createSimpleMarkupEdit(record.attachments[0].dataUrl, record.mask.dataUrl) : await createSimpleMaskedEdit(record.attachments[0].dataUrl, record.mask.dataUrl)
        record = { ...record, params: { ...record.params, size: maskedEdit.size, output_format: 'png', output_compression: null } }
      }
      if (responses) {
        const scope = await simpleResponseScope(connection.baseUrl, connection.apiKey.trim())
        const last = currentRecords[currentRecords.length - 1]
        const previousResponseId = !record.mask && !rebuildContext && last?.status === 'done' && last.apiMode === 'responses' && last.responseScope === scope ? last.responseId : undefined
        record.responseScope = scope
        const input = await buildSimpleConversationInput(currentRecords, record.prompt, record.attachments, !!previousResponseId, !!record.mask)
        const result = await callSimpleResponses({ apiKey: connection.apiKey.trim(), baseUrl: connection.baseUrl, model: connection.responseModel, imageModel: connection.model, params: record.params, background, partialImages: animated || record.mask ? 0 : partialCount, timeout, input, previousResponseId, tools: record.mask ? { ...tools, images: true } : tools, maskDataUrl: record.mask?.dataUrl, signal: controller.current.signal,
          onUpdate: (state) => { record = { ...record, assistantText: state.text, citations: state.citations, tools: state.tools, files: state.files }; if (!uiTimer) uiTimer = setTimeout(() => publish(false), 80) },
          onPartial: (id, src) => { if (!record.mask) setPreviews((current) => ({ ...current, [id]: src })) },
          onImage: (image) => { receiveImage(image.src); setPreviews((current) => { const next = { ...current }; delete next[image.id]; return next }) },
        })
        await imageWork
        if (imageError) throw imageError
        record = { ...record, responseId: result.responseId, assistantText: result.text, citations: result.citations, tools: result.tools, files: result.files, status: 'done', error: result.tools.filter((tool) => tool.status === 'failed').map((tool) => tool.error || '工具执行失败，请检查提示词或权限。').join('；') }
        if (!record.assistantText && !record.images.length && !record.tools?.length) throw new Error('接口没有返回可显示的内容。')
        setRebuildContext(false)
      } else {
        const profile = createDefaultOpenAIProfile({ apiKey: connection.apiKey.trim(), baseUrl: connection.baseUrl.trim(), model: connection.model, selectedModel: connection.model, apiMode: 'images', apiProxy: false, codexCli: false, timeout, streamImages: partialCount > 0 && !animated && !record.mask, streamPartialImages: record.mask ? 0 : partialCount, backgroundMode: background === 'opaque' ? 'opaque' : 'auto', transparentBackgroundMethod: 'api' })
        const completed = new Set<number>()
        const result = await callImageApi({ settings: normalizeSettings({ ...DEFAULT_SETTINGS, profiles: [profile], activeProfileId: profile.id, allowPromptRewrite: true }), prompt: record.mask ? `${record.mask.mode === 'markup' ? SIMPLE_MARKUP_INSTRUCTION : SIMPLE_MASK_INSTRUCTION}\n\n${record.prompt}` : record.prompt, params: { ...record.params, transparent_output: background === 'transparent' }, nativeTransparentBackground: background === 'transparent', inputImageDataUrls: record.attachments.map((file) => file.dataUrl), maskDataUrl: record.mask?.mode === 'markup' ? undefined : record.mask?.dataUrl, markupDataUrl: record.mask?.mode === 'markup' ? record.mask.dataUrl : undefined,
          onPartialImage: (partial) => { if (!record.mask) setPreviews((current) => ({ ...current, [partial.requestIndex ?? 0]: partial.image })) },
          onImageComplete: (result) => { const index = result.requestIndex ?? 0; if (completed.has(index)) return; completed.add(index); result.images.forEach(receiveImage); setPreviews((current) => { const next = { ...current }; delete next[index]; return next }) },
        })
        if (!result.images.length) throw new Error('接口没有返回图片。')
        if (!receivedImages) result.images.forEach(receiveImage)
        await imageWork
        if (imageError) throw imageError
        record = { ...record, status: 'done', error: result.failedRequests?.length ? `${result.failedRequests.length} 张失败：${result.failedRequests.map((item) => item.error).join('；')}` : '' }
      }
      record = { ...record, completedAt: Date.now() }
      publish()
    } catch (err) {
      await imageWork
      const message = controller.current?.signal.aborted ? '已停止，已收到的内容保留；服务端可能仍产生费用。' : err instanceof Error ? err.message : String(err)
      record = { ...record, completedAt: Date.now(), status: 'error', error: /failed to fetch|load failed|networkerror/i.test(message) ? '无法连接接口，请检查地址、网络和浏览器跨域访问（CORS）。' : message }
      publish()
    } finally {
      if (uiTimer) clearTimeout(uiTimer)
      await writes; active.current = false; setBusy(false); setBusyChat(''); setPreviews({}); controller.current = null
    }
  }

  async function downloadOutputFile(record: SimpleRecord, file: SimpleOutputFile) {
    try {
      if (!connection.apiKey || record.responseScope !== await simpleResponseScope(connection.baseUrl, connection.apiKey.trim())) throw new Error('请恢复生成该文件时使用的接口地址和 API Key。')
      const path = file.containerId ? `containers/${encodeURIComponent(file.containerId)}/files/${encodeURIComponent(file.id)}/content` : `files/${encodeURIComponent(file.id)}/content`
      const response = await fetch(buildApiUrl(connection.baseUrl, path), { headers: { Authorization: `Bearer ${connection.apiKey.trim()}` } })
      if (!response.ok) throw new Error('文件不可用，代码容器可能已过期，请重新生成文件。')
      saveFile(await response.blob(), file.name)
    } catch (err) { setError(err instanceof Error ? err.message : '文件下载失败。') }
  }

  return <div className={`chat-app${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
    {sidebarOpen && <button type="button" className="sidebar-scrim" aria-label="关闭对话栏" onClick={() => setSidebarOpen(false)}/>}
    <aside className={`chat-sidebar${sidebarOpen ? ' is-open' : ''}`} aria-label="对话栏" id="conversation-sidebar">
      <div className="sidebar-brand"><img src={appIcon} width="28" height="28" alt=""/><span className="sidebar-brand-text"><span title="图作间">图作间</span><small className="app-version">V1.0</small></span><button type="button" className="icon-button desktop-only sidebar-collapse" aria-label="收起侧栏" aria-expanded={true} aria-controls="conversation-sidebar" title="收起侧栏" onClick={() => setSidebarCollapsed(true)}><Icon name="panel"/></button><button type="button" className="icon-button mobile-only" aria-label="关闭对话栏" onClick={() => setSidebarOpen(false)}><Icon name="close"/></button></div>
      <button type="button" className="new-chat" aria-label="新建对话" onClick={() => void newChat()} disabled={!draftReady}><Icon name="plus"/>新对话</button>
      <nav className="sidebar-nav" aria-label="工作区">{views.map((view) => <button type="button" key={view.id} className={workspaceTab === view.id ? 'is-active' : ''} aria-pressed={workspaceTab === view.id} onClick={() => { setWorkspaceTab(view.id); setSidebarOpen(false) }}><Icon name={view.icon}/>{view.label}</button>)}</nav>
      <SimpleChatList chats={chats} records={records} chatId={workspaceTab === 'chat' ? chatId : ''} busyChat={busyChat} disabled={!draftReady || readingFiles} onSelect={(id) => void switchChat(id)} onChange={updateChat} search={search} onSearch={setSearch}/>
      <div className="sidebar-bottom"><button type="button" onClick={() => openSettings()}><Icon name="settings"/>连接设置</button><a href="https://github.com/CookSleep/gpt_image_playground" target="_blank" rel="noreferrer">GPT Image Playground · MIT ↗</a></div>
      <SimpleSidebarResize/>
    </aside>
    <main className="chat-main" inert={sidebarOpen ? true : undefined}>
      <header className={`chat-header${workspaceTab === 'gallery' ? ' gallery-header' : ''}`}><button type="button" className="icon-button mobile-only" aria-label="打开对话栏" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(true)}><Icon name="menu"/></button>{sidebarCollapsed && <button type="button" className="icon-button desktop-only" aria-label="展开侧栏" aria-expanded={false} aria-controls="conversation-sidebar" title="展开侧栏" onClick={() => setSidebarCollapsed(false)}><Icon name="panel"/></button>}<div className="header-model">{workspaceTab === 'chat' && responses ? <SimpleChoice label="对话模型" value={connection.responseModel} options={RESPONSE_MODEL_CHOICES} onChange={(responseModel) => setConnection({ ...connection, responseModel })} disabled={busy} help={<><HelpRows rows={[["用途", "理解想法、记住上下文并调用图片工具。"], ["菜单排序", "标准文本单价从低到高。"], ["价格单位", "美元／百万 token，按输入与输出用量计费。"], ["费用差异", "缓存、长上下文和服务档位会影响费用。"]]} note="图片生成与其它工具另计。"/><p><a href="https://developers.openai.com/api/docs/models/gpt-5.4-mini" target="_blank" rel="noreferrer">Mini 定价</a> · <a href="https://developers.openai.com/api/docs/models/gpt-6.1-sol" target="_blank" rel="noreferrer">Sol 定价</a> · <a href="https://developers.openai.com/api/docs/models/gpt-6-astra" target="_blank" rel="noreferrer">Astra 定价</a></p></>}><p className="choice-price-unit">美元／百万 token · 价格由低到高</p></SimpleChoice> : <h1>{workspaceTab === 'chat' ? '图作间' : views.find((view) => view.id === workspaceTab)!.label}</h1>}</div>{workspaceTab === 'gallery' && <div className="gallery-header-tools" ref={setGalleryToolbar}/>}</header>
      <SimpleWorkspace galleryToolbar={galleryToolbar} activeTab={workspaceTab} chatRecords={currentRecords} galleryItems={galleryItems} onDeleteImage={async (item) => { await draftWrites.current; setDeletedGallery(await deleteSimpleGalleryImage(item)) }} busy={busy && busyChat === chatId} seconds={seconds} previews={busyChat === chatId ? previews : {}} ready={historyReady} storageMessage={storageMessage} error={error} onEnlarge={setEnlarged} onError={setError} onDownloadFile={downloadOutputFile} onEdit={editImage} onReuse={(src, name, source) => void reuseImage(src, name, source)} onRetry={(record) => void reuseRecord(record)} resultArea={resultArea} chatId={chatId}/>
      {workspaceTab === 'chat' && <div className="composer-dock"><form className="chat-composer" onSubmit={generate}>

        <div className="composer-input" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void addAttachments(Array.from(event.dataTransfer.files)) }} onPaste={(event) => { const files = Array.from(event.clipboardData.files); if (files.length) { event.preventDefault(); void addAttachments(files) } }}>
          {!!attachments.length && <div className="composer-attachments">{attachments.map((file, i) => <div className="composer-attachment" key={file.id}><button type="button" aria-label={`查看参考图 ${i+1}：${file.name}`} onClick={() => setEnlarged(file.dataUrl)}><img src={file.dataUrl} alt={file.name}/></button><button type="button" className="edit-composer-attachment" disabled={busy} onClick={() => setEditingImage(file)} aria-label={`编辑参考图 ${i+1}`}>{mask?.targetId === file.id ? markup ? '已标记' : '已选区' : '编辑'}</button><button type="button" className="remove-composer-attachment" aria-label={`移除参考图 ${i+1}`} disabled={busy} onClick={() => { setAttachments((current) => current.filter((item) => item.id !== file.id)); if (mask?.targetId === file.id) setMask(undefined) }}>×</button></div>)}</div>}
          <textarea ref={textarea} aria-label="提示词" placeholder={mask ? markup ? '描述标记位置要怎么改，例如：把圈中的花瓶换成蓝色…' : '描述选区要怎么改，例如：换成米白色沙发…' : responses ? '描述画面，或继续修改上一张图片…' : '描述你想生成的图片…'} value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={busy || readingFiles || !draftReady} rows={2} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }}/>
          <div className="composer-actions"><div className="composer-tools"><SimplePopover label="添加图片" triggerClassName="attachment-button" button={<Icon name="attach"/>} disabled={busy || readingFiles || !draftReady}><div className="chat-action-menu"><button type="button" disabled={attachments.length >= MAX_INPUT_IMAGES} onClick={(event) => { event.currentTarget.closest<HTMLElement>('[popover]')?.hidePopover(); setGalleryPicker(true) }}>从图库中选择图片</button><button type="button" disabled={attachments.length >= MAX_INPUT_IMAGES} onClick={(event) => { event.currentTarget.closest<HTMLElement>('[popover]')?.hidePopover(); fileInput.current?.click() }}>上传图片</button></div></SimplePopover><input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(event) => { void addAttachments(Array.from(event.target.files || [])); event.target.value = '' }}/>{responses && <SimplePopover label="工具" triggerClassName="tools-icon-button" button={<Icon name="tools"/>}><fieldset className="tool-menu" disabled={busy}><h3>工具</h3>{([['images','图片生成'],['web','联网搜索'],['code','计算与文件'],['files','文件检索']] as const).map(([key,label]) => <div className="tool-option" key={key}><label><input type="checkbox" checked={tools[key]} onChange={(event) => setTools({ ...tools, [key]: event.target.checked })}/>{label}</label><Info label={label}><HelpRows rows={key === 'images' ? [['开启', '使用所选 GPT Image 模型生成或编辑图片。'], ['关闭', '仅使用其余已启用的工具。']] : key === 'web' ? [['用途', '查找新信息，例如今年的海报趋势。'], ['费用', '搜索另计费。']] : key === 'code' ? [['用途', '计算和制作文件，例如配色表。'], ['费用', '代码容器另计费。'], ['保存', '生成的文件请及时下载。']] : [['用途', '从已有知识库找资料，例如品牌手册。'], ['配置', '需填写 vs_ ID。'], ['费用', '检索与存储另计费。']]} /></Info></div>)}{tools.files && <label className="tool-input-label">向量库 ID<input aria-label="向量库 ID" placeholder="vs_…，多个用逗号分隔" value={tools.vectorStoreIds} onChange={(event) => setTools({ ...tools, vectorStoreIds: event.target.value })}/></label>}{tools.images && <div className="setting-row"><span>图片操作<Info label="图片操作"><HelpRows rows={[["auto", "由模型决定新建或编辑。"], ["generate", "新建图片。"], ["edit", "强制编辑，需要参考图或已有图片上下文。"]]}/></Info></span><select aria-label="图片操作" value={tools.action} onChange={(event) => setTools({ ...tools, action: event.target.value as SimpleTools['action'] })}><option value="auto">自动（auto）</option><option value="generate">新建图片（generate）</option><option value="edit">编辑图片（edit）</option></select></div>}</fieldset></SimplePopover>}<SimpleChoice buttonLabel={responses ? '对话创作' : '直接生图'} label="创作方式" value={connection.apiMode} disabled={busy} onChange={(value) => setConnection({ ...connection, apiMode: value as 'responses' | 'images' })} options={[{value: 'responses',label: '对话创作（Responses API）'}, {value: 'images',label: '直接生图（Images API）'}]} help={<HelpRows rows={[["对话创作", "可连续修改，例如“把它改成夜景”。"], ["直接生图", "调用 Images API，按本次描述与参考图生成。"]]}/>}/>{(!responses || tools.images || mask) && <SimpleImageSettings onReset={() => { setParams({ ...DEFAULT_PARAMS }); setCustomSize(SIMPLE_DEFAULT_SIZE); setBackground('auto'); setPartialCount(0); setTools((current) => ({ ...current, action: 'auto' })) }} exchangeRate={exchangeRate} params={params} setParams={setParams} imageModel={connection.model} onModelChange={(model) => { setConnection({ ...connection, model }); if (model.startsWith('gpt-image-2.5-') && animated) { setParams((current) => ({ ...current, output_format: 'png', size: SIMPLE_DEFAULT_SIZE })); setCustomSize(SIMPLE_DEFAULT_SIZE) } }} customSize={customSize} setCustomSize={setCustomSize} background={background} setBackground={setBackground} partialCount={partialCount} setPartialCount={setPartialCount} busy={busy || readingFiles || !draftReady} hasAttachments={!!attachments.length} responses={responses}/>}<SimplePopover label="更多操作" button={<span aria-hidden="true">•••</span>}><div className="chat-action-menu">{mask && <button type="button" disabled={busy} onClick={(e) => { setMask(undefined); e.currentTarget.closest<HTMLElement>('[popover]')?.hidePopover() }}>{markup ? '移除编辑标记' : '移除编辑选区'}</button>}{responses && !!currentRecords.length && <><button type="button" disabled={busy} aria-pressed={rebuildContext} onClick={(e) => { setRebuildContext(!rebuildContext); e.currentTarget.closest<HTMLElement>('[popover]')?.hidePopover() }}>{rebuildContext ? '取消重建上下文' : '重建上下文'}</button></>}<button type="button" onClick={(e) => { e.currentTarget.closest<HTMLElement>('[popover]')?.hidePopover(); openSettings() }}>连接设置</button></div></SimplePopover></div>{busy && responses ? <button type="button" className="send-button" aria-label="停止响应" title="停止响应" onClick={() => controller.current?.abort()}><Icon name="stop"/></button> : <button type="submit" className="send-button" aria-label="发送" title="发送" disabled={busy || readingFiles || !draftReady || !prompt.trim()}>{busy || readingFiles ? <span className="spinner"/> : <Icon name="send"/>}</button>}</div>
        </div>
        <div className="composer-caption"><span className="composer-caption-left">{estimate && (!responses || tools.images || mask) ? <span title={`按 ${estimateSize.replace('x', '×')}、${estimateQuality} 画质、${params.n} 张估算。自动尺寸按横向 1080P，自动画质按 high；仅含图片输出，输入、预览、对话及其它工具费用另计，实际账单为准。`}>图片输出大约 <strong>¥{(estimate.outputUsd * exchangeRate).toFixed(2)}</strong><small> ${estimate.outputUsd.toFixed(4)}</small></span> : <span>{!responses || tools.images || mask ? animated ? '此格式暂不支持费用预估' : '当前尺寸暂不支持费用预估' : '纯文字对话'}</span>}{(attachmentMessage || readingFiles || mask) && <span role="status">{attachmentMessage || (readingFiles ? '正在读取参考图…' : markup ? '标记引导 · Images API' : '局部编辑 · 保留原尺寸和选区外内容')}</span>}</span><span>{rebuildContext ? '下次重建上下文' : responses ? 'Responses API' : 'Images API'}</span></div>
      </form></div>}
    </main>
    {galleryPicker && <SimpleGalleryPicker items={galleryItems} attachments={attachments} maxSelection={MAX_INPUT_IMAGES - attachments.length} onConfirm={addGalleryImages} onClose={() => setGalleryPicker(false)}/>}
    {editingImage && <SimpleMaskEditor attachment={editingImage} mask={mask?.targetId === editingImage.id ? mask : undefined} onClose={() => setEditingImage(null)} onApply={(target, selectedMask) => { setAttachments((current) => [target, ...current.filter((file) => file.id !== editingImage.id && file.id !== target.id)]); setMask(selectedMask); if (selectedMask.mode === 'markup') setConnection((current) => ({ ...current, apiMode: 'images' })); setEditingImage(null); setParams((current) => ({ ...current, output_format: 'png' })); setTools((current) => ({ ...current, images: true })); setWorkspaceTab('chat'); requestAnimationFrame(() => textarea.current?.focus()) }}/>}
    <dialog ref={settingsDialog} className="settings-dialog" aria-labelledby="settings-title" onClose={() => setShowKey(false)} onCancel={(event) => { if (backupBusy) event.preventDefault() }} onClick={(event) => { if (!backupBusy && event.target === event.currentTarget) settingsDialog.current?.close() }}>
      <div className="dialog-heading"><h2 id="settings-title">设置</h2><button type="button" className="text-button settings-close" aria-label="关闭设置" disabled={backupBusy} onClick={() => settingsDialog.current?.close()}>✕</button></div>
      <form onSubmit={(event) => { event.preventDefault(); if (!backupBusy) settingsDialog.current?.close() }}><fieldset disabled={backupBusy}>
        <div className="label-line"><span><label htmlFor="api-key">API Key</label><Info label="API Key"><HelpRows rows={[["用途", "连接你的账号。"], ["发送至", "下方配置的接口地址。"], ["保存", "当前浏览器。"]]} note="共享设备用完请清除 Key。"/></Info></span></div><div className="key-input"><input id="api-key" type={showKey ? 'text' : 'password'} autoComplete="off" spellCheck={false} placeholder="粘贴 API Key" value={connection.apiKey} onChange={(event) => setConnection({ ...connection, apiKey: event.target.value })} autoFocus/><button type="button" className="text-button" aria-label={showKey ? '隐藏 API Key' : '显示 API Key'} onClick={() => setShowKey(!showKey)}>{showKey ? '隐藏' : '显示'}</button></div><div className="connection-note"><span>{saved ? connection.apiKey ? '已保存在此浏览器' : '输入后自动保存' : '仅本次使用'}</span><button type="button" className="text-button" onClick={() => setConnection({ ...connection, apiKey: '' })}>清除 Key</button></div>
        <fieldset disabled={busy}><div className="setting-row"><span>接口地址<Info label="接口地址"><HelpRows rows={[["官方地址", "https://api.openai.com"], ["兼容服务", "也可填写兼容接口地址，须允许浏览器跨域访问。"], ["发送内容", "Key、提示词与对话内容。"]]}/></Info></span><input aria-label="接口地址" type="url" value={connection.baseUrl} onChange={(event) => setConnection({ ...connection, baseUrl: event.target.value })} required/></div><div className="setting-row"><span>最长等待（秒）<Info label="最长等待"><HelpRows rows={[["范围", "30–3600 秒。"], ["网关超时", "不能通过此设置延长。"], ["自动重试", "不会自动重试付费请求。"]]}/></Info></span><input aria-label="最长等待（秒）" type="number" min="30" max="3600" value={timeout} onChange={(event) => setTimeoutValue(Number(event.target.value))} required/></div><div className="setting-row"><span>美元换算汇率<Info label="美元换算汇率"><HelpRows rows={[["含义", "1 美元兑换的人民币金额。"], ["默认值", "7，仅为示例，并非实时汇率。"], ["用途", "发送前的费用预估。"]]}/></Info></span><input aria-label="美元换算汇率" type="number" min="0.01" max="1000" step="0.01" value={exchangeRate} onChange={(event) => setExchangeRate(Number(event.target.value))} required/></div></fieldset>
        <p className="settings-note">本地记录与原图保存在此浏览器。Responses 上下文也会保存在服务端，用于连续对话。</p>
        <p className="settings-note"><a href={licenseUrl} download="LICENSE.txt">MIT 许可证</a> · <a href={noticesUrl} target="_blank" rel="noreferrer">第三方许可</a> · <a href={exampleSourcesUrl} target="_blank" rel="noreferrer">示例来源</a></p></fieldset>
      <SimpleDataBackup disabled={busy || readingFiles || !draftReady} beforeTransfer={async () => { await draftWrites.current }} onBusyChange={setBackupBusy}/>
      <button className="settings-done" type="submit" disabled={backupBusy}>完成</button></form>
    </dialog>
    <dialog ref={dialog} className="image-dialog" aria-label="图片大图预览" onClose={() => setEnlarged('')} onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close() }}><button type="button" className="close-preview" aria-label="关闭预览" onClick={() => dialog.current?.close()}>✕</button>{enlarged && <img src={enlarged} alt="图片大图预览"/>}</dialog>
  </div>
}
