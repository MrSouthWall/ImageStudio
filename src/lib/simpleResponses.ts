import { SIMPLE_MASK_INSTRUCTION } from './simpleMaskedEdit'
import type { TaskParams } from '../types'
import type { SimpleCitation, SimpleOutputFile, SimpleToolCall } from './simpleHistory'
import { buildApiUrl } from './devProxy'
import { getApiErrorMessage, getResponsesImageResultBase64, MIME_MAP, normalizeBase64Image, pickActualParams } from './imageApiShared'
import { isEventStreamResponse, readJsonServerSentEvents } from './serverSentEvents'

export type SimpleTools = { images: boolean; web: boolean; code: boolean; files: boolean; vectorStoreIds: string; action: 'auto' | 'generate' | 'edit' }
export const DEFAULT_SIMPLE_TOOLS: SimpleTools = { images: true, web: false, code: false, files: false, vectorStoreIds: '', action: 'auto' }
// Standard text-token rates in USD per 1M tokens, verified 2026-11-06.
export const RESPONSE_MODEL_CHOICES = [
  { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', detail: '输入 $0.75 · 输出 $4.50' },
  { value: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', detail: '输入 $2.00 · 输出 $10.00' },
  { value: 'gpt-6-astra', label: 'GPT-6 Astra', detail: '输入 $10.00 · 输出 $50.00' },
]
export const RESPONSE_MODELS = RESPONSE_MODEL_CHOICES.map((model) => model.value)
export type SimpleResponseImage = { id: string; src: string; actualParams?: Partial<TaskParams>; usage?: unknown }
export type SimpleResponseState = { responseId?: string; text: string; citations: SimpleCitation[]; tools: SimpleToolCall[]; files: SimpleOutputFile[]; usage?: unknown }

type Options = {
  apiKey: string; baseUrl: string; model: string; imageModel: string; params: TaskParams; background: string; partialImages: number; timeout: number; input: unknown[]; previousResponseId?: string; tools: SimpleTools; signal?: AbortSignal; maskDataUrl?: string
  onUpdate: (state: SimpleResponseState) => void
  onImage: (image: SimpleResponseImage) => void
  onPartial: (id: string, src: string, partialImageIndex?: number) => void
}

export function createSimpleResponseBody(opts: Options) {
  const tools: Record<string, unknown>[] = []
  if (opts.tools.images) {
    const animated = opts.params.output_format === 'gif' || opts.params.output_format === 'svg'
    const image: Record<string, unknown> = { type: 'image_generation', model: opts.imageModel, action: opts.maskDataUrl ? 'edit' : opts.tools.action, size: opts.params.size, quality: opts.params.quality, output_format: opts.params.output_format, background: opts.background, moderation: opts.params.moderation }
    if (opts.maskDataUrl) image.input_image_mask = { image_url: opts.maskDataUrl }
    if (opts.params.complexity !== 'auto') image.complexity = opts.params.complexity
    if (!animated) image.partial_images = opts.partialImages
    if (['jpeg', 'webp'].includes(opts.params.output_format) && opts.params.output_compression !== null) image.output_compression = opts.params.output_compression
    if (opts.params.output_format === 'gif') { image.frame_count = opts.params.frame_count; image.frame_duration_ms = opts.params.frame_duration_ms }
    tools.push(image)
  }
  if (opts.tools.web) tools.push({ type: 'web_search' })
  if (opts.tools.code) tools.push({ type: 'code_interpreter', container: { type: 'auto', memory_limit: '1g' } })
  if (opts.tools.files) {
    const ids = opts.tools.vectorStoreIds.split(/[\s,，]+/).filter(Boolean)
    if (!ids.length || ids.some((id) => !/^vs_[\w-]+$/.test(id))) throw new Error('文件检索需要有效的向量库 ID（vs_…），请在工具选项中填写。')
    tools.push({ type: 'file_search', vector_store_ids: ids })
  }
  return {
    model: opts.model, input: opts.input, tools, tool_choice: opts.maskDataUrl ? { type: 'image_generation' } : 'auto', stream: true, store: true,
    ...(opts.previousResponseId ? { previous_response_id: opts.previousResponseId } : {}),
    instructions: `You are a helpful visual creation assistant. Reply in the user's language. Use image_generation only when the user asks to create or edit images. When generating images, the desired number is ${opts.params.n}; use separate image_generation calls for separate images and never substitute a collage. Preserve continuity with earlier messages and images. Use only the tools enabled in this request.${opts.maskDataUrl ? ` ${SIMPLE_MASK_INSTRUCTION}` : ''}`,
  }
}

export async function callSimpleResponses(opts: Options): Promise<SimpleResponseState> {
  const controller = new AbortController()
  const abort = () => controller.abort(opts.signal?.reason)
  opts.signal?.addEventListener('abort', abort, { once: true })
  if (opts.signal?.aborted) abort()
  const timer = setTimeout(() => controller.abort(new Error(`等待超过 ${opts.timeout} 秒，请检查接口。`)), opts.timeout * 1000)
  const items = new Map<string, Record<string, unknown>>()
  const completed = new Set<string>()
  const outputIds = new Map<number, string>()
  let state: SimpleResponseState = { text: '', citations: [], tools: [], files: [] }
  let receivedFinal = false
  const publish = () => {
    const values = [...items.values()]
    const textItems = values.filter((item) => item.type === 'message')
    const citations: SimpleCitation[] = []
    const files: SimpleOutputFile[] = []
    let text = ''
    for (const item of textItems) {
      for (const part of Array.isArray(item.content) ? item.content as Record<string, unknown>[] : []) {
        const value = typeof part.text === 'string' ? part.text : typeof part.refusal === 'string' ? part.refusal : ''
        const offset = text.length
        text += value
        for (const annotation of Array.isArray(part.annotations) ? part.annotations as Record<string, unknown>[] : []) {
          if (annotation.type === 'url_citation' && typeof annotation.url === 'string' && /^https?:\/\//i.test(annotation.url)) citations.push({ url: annotation.url, title: typeof annotation.title === 'string' ? annotation.title : annotation.url, start: typeof annotation.start_index === 'number' ? offset + annotation.start_index : undefined, end: typeof annotation.end_index === 'number' ? offset + annotation.end_index : undefined })
          if (typeof annotation.file_id === 'string') files.push({ id: annotation.file_id, containerId: typeof annotation.container_id === 'string' ? annotation.container_id : undefined, name: typeof annotation.filename === 'string' ? annotation.filename : annotation.file_id })
        }
      }
      if (text) text += '\n\n'
    }
    const tools = values.filter((item) => ['image_generation_call', 'web_search_call', 'code_interpreter_call', 'file_search_call'].includes(String(item.type))).map((item) => ({ id: String(item.id), type: String(item.type), status: String(item.status || 'in_progress'), ...(item.error && typeof item.error === 'object' && 'message' in item.error && typeof item.error.message === 'string' ? { error: item.error.message } : {}), ...(typeof item.code === 'string' ? { code: item.code } : {}), ...(Array.isArray(item.outputs) ? { logs: item.outputs.filter((output) => output && typeof output === 'object' && typeof output.logs === 'string').map((output) => output.logs).join('\n') } : {}) }))
    state = { ...state, ...(text ? { text: text.trimEnd() } : {}), citations, tools, files: [...new Map(files.map((file) => [file.id, file])).values()] }
    opts.onUpdate({ ...state })
  }
  const acceptItem = (raw: unknown, fallbackId: string) => {
    if (!raw || typeof raw !== 'object') return
    const item = raw as Record<string, unknown>
    const id = typeof item.id === 'string' ? item.id : fallbackId
    if (fallbackId.startsWith('output-')) { const index = Number(fallbackId.slice(7)); if (Number.isInteger(index)) outputIds.set(index, id) }
    items.set(id, { ...items.get(id), ...item, id })
    if (item.type === 'image_generation_call' && item.status !== 'failed') {
      const result = getResponsesImageResultBase64(item.result as Parameters<typeof getResponsesImageResultBase64>[0])
      if (result && !completed.has(id)) {
        completed.add(id)
        opts.onImage({ id, src: normalizeBase64Image(result, MIME_MAP[String(item.output_format || opts.params.output_format)] || 'image/png'), actualParams: pickActualParams(item), usage: item.usage })
        // 原图交给资产存储，工具状态与文字更新不再复制 base64。
        items.set(id, { ...items.get(id), result: undefined })
      }
    }
    publish()
  }
  const acceptResponse = (raw: unknown, final: boolean) => {
    if (!raw || typeof raw !== 'object') return
    const payload = raw as Record<string, unknown>
    state = { ...state, ...(typeof payload.id === 'string' ? { responseId: payload.id } : {}), ...(payload.usage ? { usage: payload.usage } : {}) }
    if (Array.isArray(payload.output)) payload.output.forEach((item, index) => acceptItem(item, `output-${index}`))
    if (typeof payload.output_text === 'string') state.text = payload.output_text
    if (final) {
      if (payload.status === 'failed' || payload.status === 'incomplete') {
        const error = payload.error as { message?: string } | undefined
        throw new Error(error?.message || '响应未完整完成，已收到的内容保留；不会自动重试。')
      }
      receivedFinal = true
    }
    publish()
  }
  try {
    const response = await fetch(buildApiUrl(opts.baseUrl, 'responses'), { method: 'POST', headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(createSimpleResponseBody(opts)), signal: controller.signal, cache: 'no-store' })
    if (!response.ok) {
      const message = await getApiErrorMessage(response)
      throw new Error(opts.previousResponseId && response.status === 404 ? `${message}\n上下文可能已过期。点击「重建上下文」后重新发送；不会自动重试。` : message)
    }
    if (!isEventStreamResponse(response)) acceptResponse(await response.json(), true)
    else await readJsonServerSentEvents(response, (event) => {
      const type = String(event.type || '')
      if (type === 'response.created' || type === 'response.in_progress') acceptResponse(event.response, false)
      if (type === 'response.output_text.delta') {
        const id = String(event.item_id || outputIds.get(Number(event.output_index)) || `output-${event.output_index}`)
        const item = items.get(id) || { id, type: 'message' }
        const content = Array.isArray(item.content) ? [...item.content] : []
        const index = typeof event.content_index === 'number' ? event.content_index : 0
        content[index] = { ...content[index], type: 'output_text', text: String(content[index]?.text || '') + String(event.delta || '') }
        items.set(id, { ...item, content })
        publish()
      }
      if (type === 'response.output_item.added' || type === 'response.output_item.done') acceptItem(event.item, `output-${event.output_index}`)
      if (type === 'response.image_generation_call.partial_image' && typeof event.partial_image_b64 === 'string') opts.onPartial(String(event.item_id || outputIds.get(Number(event.output_index)) || `output-${event.output_index}`), normalizeBase64Image(event.partial_image_b64, MIME_MAP[opts.params.output_format] || 'image/png'), typeof event.partial_image_index === 'number' ? event.partial_image_index : undefined)
      if (type === 'response.completed') acceptResponse(event.response, true)
      if (type === 'response.failed' || type === 'response.incomplete') { acceptResponse(event.response, true); throw new Error('响应未完整完成。') }
      if (type === 'error' || event.error) {
        const error = event.error as { message?: string } | undefined
        throw new Error(error?.message || String(event.message || 'Responses API 返回错误。'))
      }
      if (/^response\.(image_generation_call|web_search_call|file_search_call|code_interpreter_call)\./.test(type)) {
        const id = String(event.item_id || outputIds.get(Number(event.output_index)) || `output-${event.output_index}`)
        const status = type.split('.').pop()!
        if (['in_progress', 'searching', 'generating', 'interpreting', 'completed', 'failed'].includes(status)) acceptItem({ ...items.get(id), id, type: type.split('.')[1], status }, id)
      }
    }, { signals: [controller.signal] })
    if (!receivedFinal) throw new Error('连接已结束，但未收到 response.completed；已完成图片已保留。')
    return state
  } finally {
    clearTimeout(timer)
    opts.signal?.removeEventListener('abort', abort)
  }
}

export async function simpleResponseScope(baseUrl: string, apiKey: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${buildApiUrl(baseUrl, 'responses')}|${apiKey}`))
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
