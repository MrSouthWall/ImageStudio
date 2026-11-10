import { Zip, ZipPassThrough, strToU8, strFromU8, unzip } from 'fflate'
import { base64ToBytes, bytesToBase64 } from './dataUrl'
import { openSimpleHistory } from './simpleHistory'

const STORES = ['chats', 'records', 'draft', 'references', 'assets'] as const
const META = ['chats', 'records', 'draft', 'references'] as const
type Store = typeof META[number]
type Entry = [string, any]
type Asset = { key: string; file: string; header: string | null; crc: number }
export type BackupManifest = { format: 'gpt-image-workspace'; version: 1; exportedAt: string; includeApiKey: boolean; settings: Record<string, string>; stores: Record<Store, Entry[]>; assets: Asset[] }
export type PreparedBackup = { manifest: BackupManifest; files: Record<string, Uint8Array> }
const MAX_BYTES = 1024 * 1024 * 1024
const allowedSetting = (key: string) => ['gpt-image-simple-connection', 'gpt-image-simple-draft', 'gpt-image-active-chat', 'gpt-image-sidebar-width', 'gpt-image-sidebar-collapsed', 'gpt-image-chat-sort'].includes(key) || key.startsWith('gpt-image-simple-draft:')

function settingsSnapshot(includeApiKey: boolean) {
  const settings: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!
    if (allowedSetting(key)) settings[key] = localStorage.getItem(key)!
  }
  if (!includeApiKey && settings['gpt-image-simple-connection']) {
    const connection = JSON.parse(settings['gpt-image-simple-connection'])
    connection.apiKey = ''
    settings['gpt-image-simple-connection'] = JSON.stringify(connection)
  }
  return settings
}

export async function exportSimpleBackup(includeApiKey: boolean, onProgress: (count: number) => void) {
  const db = await openSimpleHistory()
  const manifest: BackupManifest = { format: 'gpt-image-workspace', version: 1, exportedAt: new Date().toISOString(), includeApiKey, settings: settingsSnapshot(includeApiKey), stores: { chats: [], records: [], draft: [], references: [] }, assets: [] }
  const chunks: BlobPart[] = []
  let totalBytes = 0
  const zip = new Zip((error, chunk) => { if (error) throw error; totalBytes += chunk.length; if (totalBytes > MAX_BYTES) throw new Error('备份超过 1 GB，当前浏览器无法完整打包。'); chunks.push(chunk as Uint8Array<ArrayBuffer>) })
  const add = (name: string, bytes: Uint8Array) => {
    const file = new ZipPassThrough(name)
    zip.add(file)
    for (let i = 0; i < bytes.length; i += 1024 * 1024) file.push(bytes.subarray(i, i + 1024 * 1024))
    file.push(new Uint8Array(), true)
    return file.crc >>> 0
  }
  try {
    // One readonly transaction gives a consistent snapshot, without loading all originals at once.
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([...STORES], 'readonly')
      for (const name of META) {
        const req = tx.objectStore(name).openCursor()
        req.onsuccess = () => {
          const cursor = req.result
          if (!cursor) return
          manifest.stores[name].push([String(cursor.key), cursor.value])
          cursor.continue()
        }
      }
      const req = tx.objectStore('assets').openCursor()
      req.onsuccess = () => {
        const cursor = req.result
        if (!cursor) return
        try {
          const value = cursor.value as string
          const match = /^(data:image\/[\w.+-]+;base64,)([\s\S]*)$/.exec(value)
          const file = `assets/${manifest.assets.length}.bin`
          const crc = add(file, match ? base64ToBytes(match[2]) : strToU8(value))
          manifest.assets.push({ key: String(cursor.key), file, header: match?.[1] || null, crc })
          onProgress(manifest.assets.length)
          cursor.continue()
        } catch (error) { tx.abort(); reject(error) }
      }
      tx.oncomplete = () => resolve()
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('备份读取中断。'))
    })
    const manifestCrc = add('manifest.json', strToU8(JSON.stringify(manifest)))
    add('manifest.crc', strToU8(String(manifestCrc)))
    zip.end()
    return new Blob(chunks, { type: 'application/zip' })
  } finally { zip.terminate() }
}

export function validateSimpleBackup(value: unknown, files: Record<string, Uint8Array>): BackupManifest {
  const m = value as BackupManifest
  const invalid = () => { throw new Error('备份文件损坏、缺少图片或格式不兼容，未修改现有数据。') }
  if (!m || m.format !== 'gpt-image-workspace' || m.version !== 1 || typeof m.includeApiKey !== 'boolean' || !m.stores || !Array.isArray(m.assets) || !m.settings || typeof m.settings !== 'object' || Array.isArray(m.settings)) return invalid()
  const assets = new Set<string>()
  for (const a of m.assets) {
    if (!a || typeof a.key !== 'string' || assets.has(a.key) || typeof a.file !== 'string' || !/^assets\/\d+\.bin$/.test(a.file) || !files[a.file] || a.header !== null && !/^data:image\/[\w.+-]+;base64,$/.test(a.header)) return invalid()
    if (!Number.isInteger(a.crc)) return invalid()
    const check = new ZipPassThrough('check')
    check.ondata = () => {}
    check.push(files[a.file], true)
    if ((check.crc >>> 0) !== a.crc) return invalid()
    assets.add(a.key)
  }
  const validParams = (p: any) => p && typeof p.size === 'string' && ['auto', 'low', 'medium', 'high', 'xhigh', 'max'].includes(p.quality) && ['png', 'jpeg', 'webp', 'gif', 'svg'].includes(p.output_format) && Number.isInteger(p.n) && p.n >= 1 && p.n <= 10
  const validDraftFields = (d: any) =>
    (d.prompt === undefined || typeof d.prompt === 'string') && (d.customSize === undefined || typeof d.customSize === 'string') &&
    (d.background === undefined || ['auto', 'opaque', 'transparent'].includes(d.background)) &&
    (d.partialCount === undefined || Number.isInteger(d.partialCount) && d.partialCount >= 0 && d.partialCount <= 3) &&
    (d.tools === undefined || d.tools && !Array.isArray(d.tools) && ['images', 'web', 'code', 'files'].every((key) => d.tools[key] === undefined || typeof d.tools[key] === 'boolean') && (d.tools.vectorStoreIds === undefined || typeof d.tools.vectorStoreIds === 'string') && (d.tools.action === undefined || ['auto', 'generate', 'edit'].includes(d.tools.action)))
  const validAsset = (key: unknown) => typeof key === 'string' && (assets.has(key) || key.startsWith('data:image/'))
  const chats = new Set<string>()
  for (const name of META) {
    if (!Array.isArray(m.stores[name])) return invalid()
    const seen = new Set<string>()
    for (const entry of m.stores[name]) {
      if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || seen.has(entry[0]) || !entry[1] || typeof entry[1] !== 'object') return invalid()
      seen.add(entry[0])
      const [key, item] = entry
      if (name !== 'draft' && item.id !== key) return invalid()
      if (name === 'chats') { if (typeof item.title !== 'string' || typeof item.createdAt !== 'number' || typeof item.updatedAt !== 'number') return invalid(); chats.add(key) }
      if (name === 'records' || name === 'draft' && key !== 'gallery-deleted') {
        if (!Array.isArray(item.attachments) || typeof item.prompt !== 'string' || !validParams(item.params) || !item.attachments.every((f: any) => f && typeof f.id === 'string' && typeof f.name === 'string' && validAsset(f.dataUrl)) || item.mask && (typeof item.mask.id !== 'string' || typeof item.mask.targetId !== 'string' || !validAsset(item.mask.dataUrl))) return invalid()
        if (name === 'records' && (!Array.isArray(item.images) || !item.images.every(validAsset) || typeof item.createdAt !== 'number' || !['done', 'running', 'error'].includes(item.status) || typeof item.error !== 'string' || typeof item.model !== 'string')) return invalid()
        for (const field of ['tools', 'citations', 'files']) if (name === 'records' && item[field] !== undefined && !Array.isArray(item[field])) return invalid()
        if (name === 'records') {
          if (item.tools?.some((t: any) => !t || !['id', 'type', 'status'].every((key) => typeof t[key] === 'string'))) return invalid()
          if (item.citations?.some((c: any) => !c || typeof c.url !== 'string' || typeof c.title !== 'string')) return invalid()
          if (item.files?.some((f: any) => !f || typeof f.id !== 'string' || typeof f.name !== 'string')) return invalid()
        }
        if (item.assistantText !== undefined && typeof item.assistantText !== 'string') return invalid()
      }
      if (name === 'draft' && key !== 'gallery-deleted' && !validDraftFields(item)) return invalid()
      if (name === 'draft' && key === 'gallery-deleted' && (!Array.isArray(item.ids) || !item.ids.every((id: unknown) => typeof id === 'string'))) return invalid()
      if (name === 'references' && (typeof item.name !== 'string' || !validAsset(item.dataUrl))) return invalid()
    }
  }
  for (const [, r] of m.stores.records) if (r.chatId && !chats.has(r.chatId)) return invalid()
  for (const [key, value] of Object.entries(m.settings)) {
    if (!allowedSetting(key) || typeof value !== 'string') return invalid()
    if (key === 'gpt-image-simple-connection' || key.startsWith('gpt-image-simple-draft')) {
      try { const parsed = JSON.parse(value); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || parsed.params && !validParams(parsed.params) || key.startsWith('gpt-image-simple-draft') && !validDraftFields(parsed)) return invalid() } catch { return invalid() }
    }
  }
  return m
}

// Early v1 exports have no checksum sidecar. Their ZIP central directory still
// contains the original manifest CRC, including when the local header uses a data descriptor.
function legacyManifestCrc(bytes: Uint8Array): number | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let end = bytes.length - 22; end >= Math.max(0, bytes.length - 65557); end--) {
    if (view.getUint32(end, true) !== 0x06054b50 || end + 22 + view.getUint16(end + 20, true) !== bytes.length) continue
    let offset = view.getUint32(end + 16, true)
    const count = view.getUint16(end + 10, true)
    for (let i = 0; i < count; i++) {
      if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) return undefined
      const nameLength = view.getUint16(offset + 28, true)
      const next = offset + 46 + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true)
      if (next > end) return undefined
      if (strFromU8(bytes.subarray(offset + 46, offset + 46 + nameLength)) === 'manifest.json') return view.getUint32(offset + 16, true)
      offset = next
    }
    return undefined
  }
}

export async function prepareSimpleBackup(file: File): Promise<PreparedBackup> {
  if (file.size > 1024 * 1024 * 1024) throw new Error('备份超过 1 GB，当前浏览器导入不支持此大小。')
  let expanded = 0, tooLarge = false
  const bytes = new Uint8Array(await file.arrayBuffer())
  const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) => unzip(bytes, {
    filter: (entry) => {
      if (entry.name !== 'manifest.json' && entry.name !== 'manifest.crc' && !/^assets\/\d+\.bin$/.test(entry.name)) return false
      expanded += entry.originalSize
      if (expanded > MAX_BYTES) { tooLarge = true; return false }
      return true
    },
  }, (error, result) => error ? reject(new Error('无法读取备份 ZIP，未修改现有数据。')) : resolve(result)))
  if (tooLarge) throw new Error('解压后的备份超过 1 GB，未修改现有数据。')
  if (!files['manifest.json']) throw new Error('这不是完整数据备份 ZIP，未修改现有数据。')
  const check = new ZipPassThrough('manifest-check')
  check.ondata = () => {}
  check.push(files['manifest.json'], true)
  const expectedCrc = files['manifest.crc'] ? strFromU8(files['manifest.crc']) : String(legacyManifestCrc(bytes))
  if (String(check.crc >>> 0) !== expectedCrc) throw new Error('备份内容校验失败，未修改现有数据。')
  let value: unknown
  try { value = JSON.parse(strFromU8(files['manifest.json'])) } catch { throw new Error('这不是完整数据备份 ZIP，未修改现有数据。') }
  const manifest = validateSimpleBackup(value, files)
  return { manifest, files }
}

export async function restoreSimpleBackup({ manifest: m, files }: PreparedBackup) {
  const db = await openSimpleHistory()
  const previous = settingsSnapshot(true)
  const replacement = { ...m.settings }
  if (!m.includeApiKey && replacement['gpt-image-simple-connection']) {
    const connection = JSON.parse(replacement['gpt-image-simple-connection'])
    const current = previous['gpt-image-simple-connection'] ? JSON.parse(previous['gpt-image-simple-connection']) : {}
    const address = (value: unknown) => typeof value === 'string' ? value.trim().replace(/\/+$/, '') : ''
    connection.apiKey = address(connection.baseUrl) === address(current.baseUrl) ? current.apiKey || '' : ''
    replacement['gpt-image-simple-connection'] = JSON.stringify(connection)
  }
  const replaceSettings = (settings: Record<string, string>) => {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i)!; if (allowedSetting(key)) keys.push(key) }
    keys.forEach((key) => localStorage.removeItem(key))
    for (const [key, value] of Object.entries(settings)) localStorage.setItem(key, value)
  }
  try {
    // Detect settings quota/security failures before changing the database.
    replaceSettings(replacement)
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([...STORES], 'readwrite')
      let failure: unknown
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(failure || tx.error || new Error('导入未完成，原有数据已保留。'))
      try {
        for (const name of STORES) tx.objectStore(name).clear()
        for (const name of META) for (const [key, value] of m.stores[name]) {
          if (name === 'draft') tx.objectStore(name).put(value, key)
          else tx.objectStore(name).put(value)
        }
        let index = 0
        const next = () => {
          if (index >= m.assets.length) return
          try {
            const asset = m.assets[index++]
            const value = asset.header === null ? strFromU8(files[asset.file]) : asset.header + bytesToBase64(files[asset.file])
            tx.objectStore('assets').put(value, asset.key).onsuccess = next
          } catch (error) { failure = error; tx.abort() }
        }
        next()
      } catch (error) { failure = error; tx.abort() }
    })
  } catch (error) {
    try { replaceSettings(previous) } catch { throw new Error('导入失败，数据库未更改；浏览器设置恢复失败，请勿关闭页面。') }
    throw error
  }
}
