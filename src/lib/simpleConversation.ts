import { loadSimpleAssets, type SimpleAttachment, type SimpleRecord } from './simpleHistory'

export async function buildSimpleConversationInput(records: SimpleRecord[], prompt: string, attachments: SimpleAttachment[], usePrevious: boolean, maskEdit = false) {
  const input: Record<string, unknown>[] = []
  if (!usePrevious) {
    const keys = maskEdit ? [] : [...new Set(records.flatMap((record) => [...record.images, ...record.attachments.map((file) => file.dataUrl)]).filter((key) => !key.startsWith('data:')))]
    const assets = keys.length ? await loadSimpleAssets(keys) : []
    const sources = new Map(keys.map((key, i) => [key, assets[i]]))
    const imageContent = (keys: string[]) => (maskEdit ? [] : keys).map((key) => key.startsWith('data:') ? key : sources.get(key)).filter(Boolean).map((image) => ({ type: 'input_image', image_url: image }))
    for (const record of records) {
      input.push({ role: 'user', content: [{ type: 'input_text', text: record.prompt }, ...imageContent(record.attachments.map((file) => file.dataUrl))] })
      if (record.assistantText) input.push({ role: 'assistant', content: record.assistantText })
      if (record.images.length && !maskEdit) input.push({ role: 'user', content: [{ type: 'input_text', text: '上一轮已生成的图片，供后续继续编辑。' }, ...imageContent(record.images)] })
    }
  }
  input.push({ role: 'user', content: [{ type: 'input_text', text: prompt }, ...attachments.map((file) => ({ type: 'input_image', image_url: file.dataUrl }))] })
  return input
}
