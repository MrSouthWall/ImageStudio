import type { TaskParams } from '../types'
import type { SimpleRecord } from './simpleHistory'
import { estimateImageOutput } from './imagePricing'

export type SimpleCharge = { requestIndex: number; usd: number | null; source: 'usage' | 'estimate'; incomplete: boolean; pricingDate: string; label?: string }

export function priceSimpleRequest(requestIndex: number, usages: unknown[] | undefined, params: TaskParams, partialImages = 0): SimpleCharge {
  const prices = usages?.map((raw) => {
    if (!raw || typeof raw !== 'object') return null
    const usage = raw as Record<string, unknown>
    const details = usage.input_tokens_details as { text_tokens?: number; image_tokens?: number } | undefined
    const output = usage.output_tokens_details as { image_tokens?: number; text_tokens?: number } | undefined
    const valid = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    const outputTokens = output?.image_tokens ?? usage.output_tokens
    if (!valid(outputTokens)) return null
    const text = details?.text_tokens ?? (usage.input_tokens === 0 ? 0 : undefined)
    const image = details?.image_tokens ?? (usage.input_tokens === 0 ? 0 : undefined)
    const hasInput = valid(text) && valid(image)
    return { usd: (outputTokens * 30 + (hasInput ? text * 5 + image * 8 : 0)) / 1_000_000, incomplete: !hasInput || !!output?.text_tokens || params.output_format === 'svg' }
  })
  if (prices?.length && prices.every((price) => price !== null)) {
    // 用量已包含接口报告的输出消耗，不再次叠加预览图片费用。
    return { requestIndex, usd: prices.reduce((sum, price) => sum + price.usd, 0), source: 'usage', incomplete: prices.some((price) => price.incomplete), pricingDate: '2026-11-06' }
  }
  const estimate = estimateImageOutput(params)
  return { requestIndex, usd: estimate ? estimate.outputUsd + partialImages * 0.003 : null, source: 'estimate', incomplete: true, pricingDate: '2026-11-06' }
}

export function getSimpleRecordCost(record: SimpleRecord) {
  if (!record.charges?.length) return { usd: record.outputUsd, source: '输出预估', incomplete: true }
  const known = record.charges.filter((charge) => charge.usd !== null)
  return {
    usd: known.length ? known.reduce((sum, charge) => sum + charge.usd!, 0) : null,
    source: record.charges.every((charge) => charge.source === 'usage') ? '用量计价' : record.charges.every((charge) => charge.source === 'estimate') ? '输出预估' : '混合估算',
    incomplete: record.charges.some((charge) => charge.incomplete) || !!record.error || record.status !== 'done',
  }
}

export function priceSimpleResponseModel(model: string, raw: unknown): SimpleCharge {
  const rates: Record<string, [number, number, number]> = { 'gpt-5.4-mini': [0.75, 0.075, 4.5], 'gpt-6.1-sol': [2, 0.1, 10], 'gpt-6-astra': [10, 1, 50] }
  const usage = raw && typeof raw === 'object' ? raw as { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } } : {}
  const input = usage.input_tokens
  const output = usage.output_tokens
  const cached = usage.input_tokens_details?.cached_tokens ?? 0
  const rate = rates[model]
  const valid = rate && [input, output, cached].every((value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) && cached <= input!
  return { requestIndex: -1, usd: valid ? ((input! - cached) * rate[0] + cached * rate[1] + output! * rate[2]) / 1_000_000 : null, source: 'usage', incomplete: !valid, pricingDate: '2026-11-06', label: '对话模型' }
}
