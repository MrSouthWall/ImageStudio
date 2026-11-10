import { Zip, ZipPassThrough } from 'fflate'
import type { SimpleGalleryItem } from './simpleGallery'
import { loadSimpleAssets } from './simpleHistory'
import { sanitizeFileNamePart } from './exportFileName'
import { throwIfAborted } from './serverSentEvents'

const extensions: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/avif': 'avif' }

export async function buildSimpleGalleryZip(items: SimpleGalleryItem[], signal: AbortSignal, onProgress: (done: number) => void) {
  const chunks: BlobPart[] = []
  const archive = new Zip((error, chunk) => { if (error) throw error; chunks.push(chunk as Uint8Array<ArrayBuffer>) })
  try {
    for (const [index, item] of items.entries()) {
      throwIfAborted(signal)
      const src = item.asset.startsWith('data:') ? item.asset : (await loadSimpleAssets([item.asset]))[0]
      if (!src) throw new Error(`无法读取“${item.name}”，请取消勾选后重试。`)
      const blob = await (await fetch(src, { signal })).blob()
      const extension = extensions[blob.type] || 'bin'
      // Numbering prevents duplicate names from overwriting each other on extraction.
      const base = sanitizeFileNamePart(item.filename.replace(/\.[^.]+$/, '')) || 'image'
      const file = new ZipPassThrough(`${String(index + 1).padStart(3, '0')}-${base}.${extension}`)
      archive.add(file)
      // Store originals without recompression; process one source and 1 MiB chunk at a time.
      for (let offset = 0; offset < blob.size; offset += 1024 * 1024) {
        throwIfAborted(signal)
        file.push(new Uint8Array(await blob.slice(offset, offset + 1024 * 1024).arrayBuffer()))
      }
      file.push(new Uint8Array(), true)
      onProgress(index + 1)
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
    throwIfAborted(signal)
    archive.end()
    return new Blob(chunks, { type: 'application/zip' })
  } finally { archive.terminate() }
}
