import type { SimpleRecord, SimpleReference, SimpleImageOrigin } from './simpleHistory'

export type SimpleGalleryItem = { id: string; asset: string; name: string; filename: string; origin: SimpleImageOrigin; sourceAsset: string; attachmentId?: string; createdAt: number }

export function buildSimpleGallery(records: SimpleRecord[], references: SimpleReference[]) {
  const items = new Map<string, SimpleGalleryItem>()
  const generatedNames = new Map<string, string>()
  for (const record of records) {
    record.images.forEach((asset, i) => {
      const key = `result-${record.id}-${i}`
      const filename = `image-${record.id}-${i + 1}`
      generatedNames.set(filename, key)
      items.set(key, { id: key, asset, name: record.prompt, filename, origin: 'generated', sourceAsset: key, createdAt: record.createdAt })
    })
  }
  for (const file of references) {
    const legacySource = !file.origin ? generatedNames.get(file.name) : undefined
    const sourceAsset = file.sourceAsset || legacySource || file.dataUrl
    const origin = file.origin || (legacySource || ['局部编辑.png', '标记编辑.png'].includes(file.name) ? 'generated' : 'uploaded')
    const existing = items.get(sourceAsset)
    if (existing && (existing.origin === 'generated' || file.dataUrl !== sourceAsset)) continue
    items.set(sourceAsset, { id: sourceAsset, asset: file.dataUrl, name: file.name, filename: file.name, origin, sourceAsset, attachmentId: file.id, createdAt: file.createdAt })
  }
  return [...items.values()].sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
}
