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
import { Info, SimpleChoice, HelpRows } from './SimplePopover'
import { SimpleImageSettings } from './SimpleImageSettings'
import { buildSimpleGallery, type SimpleGalleryItem } from '../lib/simpleGallery'
import { SimpleGalleryPicker } from './SimpleGallery'
import type { ImageSource } from './SimpleStoredImage'
import { SimpleWorkspace, type WorkspaceTab } from './SimpleWorkspace'
import { SimpleChatList } from './SimpleChatList'
import { SimpleMaskEditor } from './SimpleMaskEditor'
import { StudioIcon } from './StudioIcon'
import { StudioComposer } from './StudioComposer'
import { StudioSettings } from './StudioSettings'
import { StudioSky } from './StudioSky'
import { StudioThemeMenu } from './StudioThemeMenu'
import { useStudioTheme } from '../lib/studioTheme'
import appIcon from '../assets/icon.svg'
import classicIcon from '../assets/classic-icon.svg'

const MODELS = SIMPLE_IMAGE_MODELS.map((model) => model.value)
const STORAGE_KEY = 'gpt-image-simple-connection'
const views = [
  { id: 'studio', label: '创作台', icon: 'spark' },
  { id: 'chat', label: '对话', icon: 'chat' },
  { id: 'gallery', label: '图库', icon: 'image' },
] as const

const sessionLayout = '(min-width: 821px)'

export function SimpleGenerator() {
  const { appearance, theme, setAppearance, setTheme } = useStudioTheme()
  const classic = appearance === 'classic'
  const dark = theme === 'dark'
  const [connection, setConnection] = useState(() => {
    const fallback = { apiKey: '', baseUrl: 'https://api.openai.com', model: MODELS[0], apiMode: 'responses' as 'images' | 'responses', responseModel: 'gpt-6.1-sol', defaultsVersion: 2 }
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
      if (saved) return { apiKey: typeof saved.apiKey === 'string' ? saved.apiKey : '', baseUrl: typeof saved.baseUrl === 'string' ? saved.baseUrl : fallback.baseUrl, model: MODELS.includes(saved.model) ? saved.model : fallback.model, apiMode: saved.apiMode === 'images' ? 'images' as const : 'responses' as const, responseModel: RESPONSE_MODELS.includes(saved.responseModel) && (saved.defaultsVersion === 2 || saved.responseModel !== 'gpt-5.4-mini') ? saved.responseModel : fallback.responseModel, defaultsVersion: 2 }
    } catch { /* 浏览器可能限制本地存储。 */ }
    return fallback
  })
  const [saved, setSaved] = useState(false)
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
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('studio')
  const [galleryPicker, setGalleryPicker] = useState(false)
  const [desktop, setDesktop] = useState(() => window.matchMedia(sessionLayout).matches)
  const sessionSheet = useRef<HTMLDialogElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const workbench = useRef<HTMLElement>(null)
  const [search, setSearch] = useState('')
  const [historyReady, setHistoryReady] = useState(false)
  const [draftReady, setDraftReady] = useState(false)
  const draftWrites = useRef(Promise.resolve())
  const [storageMessage, setStorageMessage] = useState('')
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const [rebuildContext, setRebuildContext] = useState(false)
  const settingsDialog = useRef<HTMLDialogElement>(null)
  const [error, setError] = useState('')
  const [enlarged, setEnlarged] = useState<{ src: string; label: string } | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const currentRecords = useMemo(() => records.filter((record) => record.chatId === chatId), [records, chatId])
  const currentChat = chats.find((chat) => chat.id === chatId)
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
  const usesImages = !responses || tools.images || !!mask
  const configured = !!connection.apiKey.trim()
  const locked = busy || readingFiles || !draftReady

  function openSettings(focusKey = false) {
    settingsDialog.current?.showModal()
    if (focusKey) settingsDialog.current?.querySelector<HTMLInputElement>('#api-key')?.focus()
  }

  function openPreview(src: string, label = '图片预览') { setEnlarged({ src, label }) }

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
      if (state.records.some((record) => record.chatId === id)) {
        setWorkspaceTab((current) => current === 'studio' ? 'chat' : current)
      }
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
  useEffect(() => {
    const query = window.matchMedia(sessionLayout)
    const update = () => setDesktop(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k' || document.querySelector('dialog[open]:not(.session-sheet)')) return
      event.preventDefault()
      setWorkspaceTab('chat')
      requestAnimationFrame(() => {
        if (sessionSheet.current && !sessionSheet.current.open) sessionSheet.current.showModal()
        searchInput.current?.focus()
        searchInput.current?.select()
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function switchChat(id: string, fresh = false, nextTab: WorkspaceTab = 'chat') {
    if (!draftReady || reading.current) return
    setDraftReady(false)
    try {
      await draftWrites.current
      const draft = fresh ? undefined : await loadSimpleDraft(id)
      restoreDraft(draft, id)
      setChatId(id)
      setWorkspaceTab(nextTab)
      setRebuildContext(false)
      setError('')
      setAttachmentMessage('')
      if (!fresh && nextTab === 'chat') requestAnimationFrame(() => workbench.current?.focus({ preventScroll: true }))
    } catch { setError('对话草稿读取失败，请重试。') }
    finally { setDraftReady(true) }
  }

  async function newChat() {
    if (!draftReady || reading.current) return
    sessionSheet.current?.close()
    setSearch('')
    if (!currentChat?.archived && !currentRecords.length && !prompt.trim() && !attachments.length) {
      setWorkspaceTab('studio')
      if (!busy) requestAnimationFrame(() => textarea.current?.focus())
      return
    }
    const chat = { id: crypto.randomUUID(), title: '新对话', createdAt: Date.now(), updatedAt: Date.now() }
    setChats((current) => [chat, ...current])
    void saveSimpleChat(chat).catch(() => setStorageMessage('对话保存失败。'))
    await switchChat(chat.id, true, 'studio')
    if (!busy) requestAnimationFrame(() => textarea.current?.focus())
  }

  function goToStudio() {
    if (!draftReady || reading.current) return
    if (currentRecords.length || currentChat?.archived) void newChat()
    else setWorkspaceTab('studio')
  }

  async function updateChat(chat: SimpleChat) {
    if (reading.current || !draftReady) return
    try {
      await draftWrites.current
      await saveSimpleChat(chat)
      setChats((current) => current.map((item) => item.id === chat.id ? chat : item))
      if (chat.id === chatId && (chat.deletedAt || chat.archived)) {
        const next = chats.find((item) => item.id !== chat.id && !item.archived && !item.deletedAt)
        if (next) await switchChat(next.id, false, workspaceTab)
        else {
          const fresh = { id: crypto.randomUUID(), title: '新对话', createdAt: Date.now(), updatedAt: Date.now() }
          await saveSimpleChat(fresh); setChats((current) => [fresh, ...current]); await switchChat(fresh.id, true, workspaceTab)
        }
      }
    } catch { setError('对话保存失败，请重试。') }
  }

  async function reuseImage(src: string, name: string, source?: ImageSource) {
    if (active.current || reading.current || !draftReady) return
    const target = workspaceTab === 'gallery' && !currentRecords.length ? 'studio' : 'chat'
    if (source && attachments.some((file) => file.id === source.id || file.sourceAsset === source.sourceAsset)) { setWorkspaceTab(target); return }
    if (attachments.length >= MAX_INPUT_IMAGES) { setError(`最多添加 ${MAX_INPUT_IMAGES} 张参考图。`); return }
    reading.current = true; setReadingFiles(true)
    try {
      const dataUrl = await toApiInputImageDataUrl(src)
      setAttachments((current) => [...current, { id: source?.id || (source ? `reused-${source.sourceAsset}` : crypto.randomUUID()), name, dataUrl, createdAt: Date.now(), origin: source?.origin || 'uploaded', sourceAsset: source?.sourceAsset }])
      setParams((current) => ({ ...current, output_format: current.output_format === 'gif' ? 'gif' : 'png' })); setTools((current) => ({ ...current, images: true }))
      setWorkspaceTab(target); requestAnimationFrame(() => textarea.current?.focus())
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
    if (!configured) { openSettings(true); return }
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

  const price = estimate && usesImages ? <span className="composer-price">图片输出预估 <strong>¥{(estimate.outputUsd * exchangeRate).toFixed(2)}</strong><span className="usd-price"> / ${estimate.outputUsd.toFixed(4)}</span><Info label="费用预估"><HelpRows rows={[
    ['本次估算', estimateSize.replace('x', '×') + ' · ' + estimateQuality + ' · ' + params.n + ' 张'],
    ['自动参数', '按横向 1080P 与高画质估算。'],
    ['计费范围', '仅含图片输出；输入、预览、对话和其它工具另计。'],
  ]} note="实际费用以服务商账单为准。"/></Info></span> : <span>{usesImages ? animated ? '此格式暂无费用预估' : '此尺寸暂无费用预估' : '当前为文字对话'}</span>

  const responseModel = responses && <SimpleChoice label="对话模型" triggerClassName="response-model"
    value={connection.responseModel} options={RESPONSE_MODEL_CHOICES}
    onChange={(value) => setConnection((current) => ({ ...current, responseModel: value }))} disabled={locked}
    help={<><HelpRows rows={[
      ['用途', '理解想法、记住上下文并调用图片工具。'],
      ['计费', '以美元／百万 token 计，图片生成和其它工具另计。'],
      ['费用差异', '缓存、长上下文和服务档位会影响费用。'],
    ]}/><p><a href="https://developers.openai.com/api/docs/models/gpt-5.4-mini" target="_blank" rel="noreferrer">Mini 定价</a> · <a href="https://developers.openai.com/api/docs/models/gpt-6.1-sol" target="_blank" rel="noreferrer">Sol 定价</a> · <a href="https://developers.openai.com/api/docs/models/gpt-6-astra" target="_blank" rel="noreferrer">Astra 定价</a></p></>}>
    <p className="choice-price-unit">美元／百万 token · 价格由低到高</p>
  </SimpleChoice>
  const composer = <StudioComposer textarea={textarea} prompt={prompt} continuing={currentRecords.length > 0} onChange={setPrompt} onSubmit={generate}
        attachments={attachments} onAddFiles={(files) => void addAttachments(files)} onChooseFromGallery={() => setGalleryPicker(true)} onEdit={setEditingImage} onEnlarge={openPreview} onRemove={(file) => { setAttachments((current) => current.filter((item) => item.id !== file.id)); setAttachmentMessage(''); if (mask?.targetId === file.id) setMask(undefined) }}
        mask={mask} onRemoveMask={() => setMask(undefined)} mode={connection.apiMode} onModeChange={(apiMode) => setConnection({ ...connection, apiMode })} tools={tools} onToolsChange={setTools}
        imageSettings={usesImages && <SimpleImageSettings onReset={() => { setParams({ ...DEFAULT_PARAMS }); setCustomSize(SIMPLE_DEFAULT_SIZE); setBackground('auto'); setPartialCount(0); setTools((current) => ({ ...current, action: 'auto' })) }} exchangeRate={exchangeRate} params={params} setParams={setParams} imageModel={connection.model} onModelChange={(model) => { setConnection({ ...connection, model }); if (model.startsWith('gpt-image-2.5-') && animated) { setParams((current) => ({ ...current, output_format: 'png', size: SIMPLE_DEFAULT_SIZE })); setCustomSize(SIMPLE_DEFAULT_SIZE) } }} customSize={customSize} setCustomSize={setCustomSize} background={background} setBackground={setBackground} partialCount={partialCount} setPartialCount={setPartialCount} busy={locked} hasAttachments={!!attachments.length} responses={responses}/>}
        ready={draftReady} busy={busy} elsewhere={busy && busyChat !== chatId} readingFiles={readingFiles} attachmentMessage={attachmentMessage} canRebuild={responses && !!currentRecords.length} rebuildContext={rebuildContext} onToggleRebuild={() => setRebuildContext(!rebuildContext)} onStop={() => controller.current?.abort()} price={price} responseModel={responseModel}/>

  const sessions = <div className="session-list">
    <div className="session-list-heading">
      <h2 id="session-list-title">对话</h2>
      <button className="icon-button session-new" type="button" title="新建对话" aria-label="新建对话"
        onClick={() => void newChat()} disabled={!draftReady || readingFiles}><StudioIcon name="plus" size={19}/></button>
      {!desktop && <button className="icon-button" type="button" aria-label="关闭对话列表" onClick={() => sessionSheet.current?.close()}><StudioIcon name="close" size={19}/></button>}
    </div>
    <SimpleChatList chats={chats} records={records} chatId={chatId} busyChat={busyChat}
      disabled={!draftReady || readingFiles} onSelect={(id) => { sessionSheet.current?.close(); void switchChat(id) }}
      onChange={updateChat} search={search} onSearch={setSearch} searchRef={searchInput}/>
  </div>

  const workspace = <SimpleWorkspace activeTab={workspaceTab} chatRecords={currentRecords} galleryItems={galleryItems}
    onDeleteImage={async (item) => { await draftWrites.current; setDeletedGallery(await deleteSimpleGalleryImage(item)) }}
    busy={busy && busyChat === chatId} imageActionsLocked={locked} seconds={seconds}
    previews={busyChat === chatId ? previews : {}} ready={historyReady} storageMessage={storageMessage}
    error={error} onEnlarge={openPreview} onError={setError} onDownloadFile={downloadOutputFile}
    onEdit={editImage} onReuse={(src, name, source) => void reuseImage(src, name, source)}
    onRetry={(record) => void reuseRecord(record)} chatId={chatId} title={currentChat?.title || '当前创作'}
    composer={composer} dark={dark} classic={classic} onStart={goToStudio}/>

  return <div className="studio-app">
    {!classic && <StudioSky dark={dark}/>}
    <a className="skip-link" href="#workspace-main">跳到工作区</a>
    <header className="studio-masthead" data-workspace={workspaceTab}>
      <button type="button" className="studio-brand" onClick={goToStudio} aria-label="图作间，回到创作台">
        <img src={classic ? classicIcon : appIcon} width="40" height="40" alt=""/>
        <span><strong>图作间</strong><small lang="en">IMAGE STUDIO</small></span>
      </button>
      <nav className="studio-nav" aria-label="工作区">
        {views.map((view) => <button type="button" key={view.id} aria-current={workspaceTab === view.id ? 'page' : undefined}
          onClick={() => view.id === 'studio' ? goToStudio() : setWorkspaceTab(view.id)}>
          <StudioIcon name={view.icon} size={17}/>
          <span>{view.label}</span>
          {view.id === 'chat' && busy && <i className="nav-activity" aria-hidden="true"/>}
        </button>)}
      </nav>
      <div className="masthead-actions">
        {workspaceTab !== 'chat' && <button type="button" className="masthead-new icon-button"
          aria-label="新建对话" title="新建对话" onClick={() => void newChat()} disabled={!draftReady || readingFiles}>
          <StudioIcon name="plus" size={19}/>
        </button>}
        <StudioThemeMenu appearance={appearance} theme={theme} onAppearanceChange={setAppearance} onThemeChange={setTheme}/>
        <button type="button" className={'connection-trigger' + (configured ? ' is-configured' : '')}
          onClick={() => openSettings()} aria-label={configured ? '连接设置（已配置 API）' : '连接 API'}
          title={configured ? '连接设置' : '连接 API'}>
          <i aria-hidden="true"/><span>{configured ? 'API 已配置' : '连接 API'}</span><StudioIcon name="plug" size={15}/>
        </button>
      </div>
    </header>
    <main ref={workbench} id="workspace-main" tabIndex={-1} className="studio-main">
      {workspaceTab === 'chat' ? <div className="session-layout">
        {desktop ? <aside className="session-sidebar" aria-labelledby="session-list-title">{sessions}</aside>
          : <dialog ref={sessionSheet} className="session-sheet" aria-labelledby="session-list-title"
            onClick={(event) => { if (event.target === event.currentTarget) sessionSheet.current?.close() }}>{sessions}</dialog>}
        <div className="session-workbench">
          {!desktop && <div className="session-mobile-toolbar">
            <button type="button" className="secondary-button" onClick={() => sessionSheet.current?.showModal()}><StudioIcon name="panel" size={16}/>对话列表</button>
          </div>}
          {workspace}
          {composer}
        </div>
      </div> : workspace}
    </main>

    {galleryPicker && <SimpleGalleryPicker items={galleryItems} attachments={attachments} maxSelection={MAX_INPUT_IMAGES - attachments.length} onConfirm={addGalleryImages} onClose={() => setGalleryPicker(false)}/>}
    {editingImage && <SimpleMaskEditor attachment={editingImage} mask={mask?.targetId === editingImage.id ? mask : undefined} onClose={() => setEditingImage(null)} onApply={(target, selectedMask) => { setAttachments((current) => [target, ...current.filter((file) => file.id !== editingImage.id && file.id !== target.id)]); setMask(selectedMask); if (selectedMask.mode === 'markup') setConnection((current) => ({ ...current, apiMode: 'images' })); setEditingImage(null); setParams((current) => ({ ...current, output_format: 'png' })); setTools((current) => ({ ...current, images: true })); if (workspaceTab === 'gallery') setWorkspaceTab(currentRecords.length ? 'chat' : 'studio'); requestAnimationFrame(() => textarea.current?.focus()) }}/>}
    <StudioSettings dialog={settingsDialog} apiKey={connection.apiKey} baseUrl={connection.baseUrl} onConnectionChange={(patch) => setConnection((current) => ({ ...current, ...patch }))} timeout={timeout} onTimeoutChange={setTimeoutValue} exchangeRate={exchangeRate} onExchangeRateChange={setExchangeRate} saved={saved} busy={locked} beforeTransfer={async () => { await draftWrites.current }}/>
    <dialog ref={dialog} className="image-dialog" aria-labelledby="preview-title" onClose={() => setEnlarged(null)} onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close() }}>
      {enlarged && <><header><span id="preview-title">{enlarged.label}</span><button type="button" className="close-preview icon-button" aria-label="关闭预览" onClick={() => dialog.current?.close()}><StudioIcon name="close"/></button></header><img src={enlarged.src} alt={enlarged.label}/></>}
    </dialog>
  </div>
}
