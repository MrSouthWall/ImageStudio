import type { TaskParams } from '../types'
import type { SimpleCharge } from './simpleBilling'
import type { SimpleTools } from './simpleResponses'

export type SimpleImageOrigin = 'generated' | 'uploaded'
export type SimpleAttachment = { origin?: SimpleImageOrigin; sourceAsset?: string; id: string; name: string; dataUrl: string; createdAt?: number }
export type SimpleReference = { origin?: SimpleImageOrigin; sourceAsset?: string; id: string; name: string; dataUrl: string; createdAt: number }
export type SimpleChat = { id: string; title: string; createdAt: number; updatedAt: number; archived?: boolean; pinned?: boolean; deletedAt?: number; renamed?: boolean }
export type SimpleEditMode = 'mask' | 'markup'
export type SimpleMask = { mode?: SimpleEditMode; id: string; targetId: string; dataUrl: string }
export type SimpleCitation = { url: string; title: string; start?: number; end?: number }
export type SimpleToolCall = { id: string; type: string; status: string; code?: string; logs?: string; error?: string }
export type SimpleOutputFile = { id: string; name: string; containerId?: string }
export type SimpleDraft = { chatId?: string; tools?: SimpleTools; mask?: SimpleMask; prompt: string; params: TaskParams; customSize: string; background: string; partialCount: number; timeout: number; exchangeRate: number; attachments: SimpleAttachment[] }
export type SimpleRecord = { id: string; createdAt: number; completedAt?: number; mask?: SimpleMask; prompt: string; model: string; params: TaskParams; attachments: SimpleAttachment[]; images: string[]; status: 'running' | 'done' | 'error'; error: string; outputUsd: number | null; exchangeRate: number; charges?: SimpleCharge[]; chatId?: string; apiMode?: 'images' | 'responses'; responseId?: string; responseScope?: string; responseModel?: string; assistantText?: string; citations?: SimpleCitation[]; tools?: SimpleToolCall[]; files?: SimpleOutputFile[] }

let database: Promise<IDBDatabase> | undefined
export function openSimpleHistory() {
  if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('gpt-image-simple-history', 3)
    request.onupgradeneeded = (event) => {
      const db = request.result
      if (event.oldVersion === 0) {
        db.createObjectStore('records', { keyPath: 'id' }).createIndex('createdAt', 'createdAt')
        db.createObjectStore('draft')
        db.createObjectStore('assets')
      }
      if (event.oldVersion < 2) {
        const refs = db.createObjectStore('references', { keyPath: 'id' })
        if (event.oldVersion > 0) {
          // 旧附件即使已从草稿移除，图片仍在 assets 中；迁移只读取键和记录元数据。
          const keys = request.transaction!.objectStore('assets').getAllKeys(IDBKeyRange.bound('attachment-', 'attachment-\uffff'))
          keys.onsuccess = () => {
            for (const key of keys.result) refs.put({ id: String(key).slice(11), name: '参考图', dataUrl: key, createdAt: 0 })
            const records = request.transaction!.objectStore('records').openCursor()
            records.onsuccess = () => {
              const cursor = records.result
              if (!cursor) return
              for (const file of cursor.value.attachments) refs.put({ ...file, createdAt: file.createdAt || cursor.value.createdAt })
              cursor.continue()
            }
            const draft = request.transaction!.objectStore('draft').get('current')
            draft.onsuccess = () => {
              for (const file of draft.result?.attachments || []) refs.put({ ...file, createdAt: file.createdAt || 0 })
            }
          }
        }
      }
      const chats = db.createObjectStore('chats', { keyPath: 'id' })
      const records = request.transaction!.objectStore('records').index('createdAt').getAll()
      records.onsuccess = () => {
        if (!records.result.length) return
        const first = records.result[0] as SimpleRecord
        const last = records.result[records.result.length - 1] as SimpleRecord
        chats.put({ id: 'legacy', title: '之前的记录', createdAt: first.createdAt, updatedAt: last.createdAt })
        for (const record of records.result) request.transaction!.objectStore('records').put({ ...record, chatId: 'legacy' })
        const draft = request.transaction!.objectStore('draft').get('current')
        draft.onsuccess = () => { if (draft.result) request.transaction!.objectStore('draft').put({ ...draft.result, chatId: 'legacy' }, 'legacy') }
      }
    }
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); database = undefined }
      resolve(request.result)
    }
    request.onerror = () => { database = undefined; reject(request.error) }
  })
  return database
}

export function simpleRecordMetadata(record: SimpleRecord): SimpleRecord {
  return { ...record, mask: record.mask ? { ...record.mask, dataUrl: `mask-${record.mask.id}` } : undefined, attachments: record.attachments.map((file) => ({ ...file, dataUrl: `attachment-${file.id}` })), images: record.images.map((_, i) => `result-${record.id}-${i}`) }
}

// 图片单独保存，同一附件在草稿与多次提交之间共用；记录列表不携带图片内容。
export async function saveSimpleItem(kind: 'records' | 'draft', item: SimpleRecord | SimpleDraft) {
  const db = await openSimpleHistory()
  const { attachments, ...rest } = item
  const record = 'id' in item ? item : null
  const files = attachments.map((file) => ({ key: `attachment-${file.id}`, value: file.dataUrl }))
  if (item.mask) files.push({ key: `mask-${item.mask.id}`, value: item.mask.dataUrl })
  if (record) record.images.forEach((value, index) => files.push({ key: `result-${record.id}-${index}`, value }))
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([kind, 'assets', 'references'], 'readwrite')
    const assets = tx.objectStore('assets')
    for (const file of files) {
      const existing = assets.getKey(file.key)
      existing.onsuccess = () => { if (existing.result === undefined) assets.put(file.value, file.key) }
    }
    const refs = tx.objectStore('references')
    for (const file of attachments) {
      const existing = refs.get(file.id)
      existing.onsuccess = () => {
        const reference = existing.result as SimpleReference | undefined
        if (!reference) refs.put({ id: file.id, name: file.name, origin: file.origin, sourceAsset: file.sourceAsset, dataUrl: `attachment-${file.id}`, createdAt: file.createdAt || record?.createdAt || Date.now() })
        else if (file.origin && reference.origin !== file.origin || file.sourceAsset && reference.sourceAsset !== file.sourceAsset) refs.put({ ...reference, origin: file.origin || reference.origin, sourceAsset: file.sourceAsset || reference.sourceAsset })
      }
    }
    const value = record ? simpleRecordMetadata(record) : { ...rest, mask: item.mask ? { ...item.mask, dataUrl: `mask-${item.mask.id}` } : undefined, attachments: attachments.map(({ id, name, createdAt, origin, sourceAsset }) => ({ id, name, createdAt, origin, sourceAsset, dataUrl: `attachment-${id}` })) }
    if (record) tx.objectStore(kind).put(value)
    else tx.objectStore(kind).put(value, (item as SimpleDraft).chatId || 'current')
    tx.oncomplete = () => resolve()
    tx.onabort = tx.onerror = () => reject(tx.error)
  })
}

export async function loadSimpleAssets(keys: string[]) {
  const db = await openSimpleHistory()
  return new Promise<string[]>((resolve, reject) => {
    const tx = db.transaction('assets', 'readonly')
    const values: string[] = []
    keys.forEach((key, i) => { const req = tx.objectStore('assets').get(key); req.onsuccess = () => { values[i] = req.result || '' } })
    tx.oncomplete = () => resolve(values)
    tx.onabort = tx.onerror = () => reject(tx.error)
  })
}

export async function loadSimpleState() {
  const db = await openSimpleHistory()
  const state = await new Promise<{ records: SimpleRecord[]; draft?: SimpleDraft; references: SimpleReference[]; chats: SimpleChat[]; deletedGallery: string[] }>((resolve, reject) => {
    const tx = db.transaction(['records', 'draft', 'references', 'chats'], 'readonly')
    const records = tx.objectStore('records').index('createdAt').getAll()
    const draft = tx.objectStore('draft').get('current')
    const refs = tx.objectStore('references').getAll()
    const chats = tx.objectStore('chats').getAll()
    const deletedGallery = tx.objectStore('draft').get('gallery-deleted')
    tx.oncomplete = () => resolve({ records: records.result, draft: draft.result, deletedGallery: deletedGallery.result?.ids || [], references: refs.result.sort((a, b) => b.createdAt - a.createdAt), chats: chats.result.sort((a, b) => b.updatedAt - a.updatedAt) })
    tx.onabort = tx.onerror = () => reject(tx.error)
  })
  return state
}

export async function saveSimpleChat(chat: SimpleChat) {
  const db = await openSimpleHistory()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('chats', 'readwrite')
    tx.objectStore('chats').put(chat)
    tx.oncomplete = () => resolve()
    tx.onabort = tx.onerror = () => reject(tx.error)
  })
}

export async function loadSimpleDraft(chatId: string) {
  const db = await openSimpleHistory()
  const draft = await new Promise<SimpleDraft | undefined>((resolve, reject) => {
    const req = db.transaction('draft', 'readonly').objectStore('draft').get(chatId)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  if (!draft) return undefined
  const urls = await loadSimpleAssets([...draft.attachments.map((file) => file.dataUrl), ...(draft.mask ? [draft.mask.dataUrl] : [])])
  return { ...draft, mask: draft.mask ? { ...draft.mask, dataUrl: urls[draft.attachments.length] } : undefined, attachments: draft.attachments.map((file, i) => ({ ...file, dataUrl: urls[i] })) }
}

// Remove the gallery entry; shared conversation/draft assets must remain readable.
export async function deleteSimpleGalleryImage(item: { id: string; asset: string; filename: string }) {
  const db = await openSimpleHistory()
  return new Promise<string[]>((resolve, reject) => {
    const tx = db.transaction(['records', 'draft', 'references', 'assets'], 'readwrite')
    const records = tx.objectStore('records').getAll()
    const drafts = tx.objectStore('draft').getAll()
    const refs = tx.objectStore('references').getAll()
    const deleted = tx.objectStore('draft').get('gallery-deleted')
    let remaining = 4
    let ids: string[] = []
    const complete = () => {
      if (--remaining) return
      ids = [...new Set<string>([...(deleted.result?.ids || []), item.id])]
      tx.objectStore('draft').put({ ids }, 'gallery-deleted')
      const used = new Set<string>()
      for (const entry of [...records.result, ...drafts.result]) {
        for (const asset of entry.images || []) used.add(asset)
        for (const file of entry.attachments || []) used.add(file.dataUrl)
        if (entry.mask) used.add(entry.mask.dataUrl)
      }
      const candidates = new Set([item.asset])
      for (const file of refs.result as SimpleReference[]) {
        const matches = file.sourceAsset === item.id || file.dataUrl === item.asset || (item.id.startsWith('result-') && !file.origin && file.name === item.filename)
        if (matches) { tx.objectStore('references').delete(file.id); candidates.add(file.dataUrl) }
        else used.add(file.dataUrl)
      }
      for (const asset of candidates) if (!used.has(asset)) tx.objectStore('assets').delete(asset)
    }
    for (const req of [records, drafts, refs, deleted]) req.onsuccess = complete
    tx.oncomplete = () => resolve(ids)
    tx.onabort = tx.onerror = () => reject(tx.error)
  })
}
