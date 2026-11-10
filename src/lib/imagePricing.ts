import { SIMPLE_IMAGE_MODELS } from './simpleImageModels'
import type { TaskParams } from '../types'

export const IMAGE_PRICING_SOURCE = 'https://developers.openai.com/api/docs/guides/image-generation#calculating-costs'
export const IMAGE_PRICING_CHECKED = '2026-11-06'

// 计算规则来自官方 GPT Image 2.5/2.6 计算器；不把输入费或 SVG/GIF 套入静态输出估算。
export function estimateImageOutput(params: TaskParams, partialImages = 0, model = 'gpt-image-2.6-sunburst') {
  if (!SIMPLE_IMAGE_MODELS.some((item) => item.value === model)) return null
  if (!['png', 'jpeg', 'webp'].includes(params.output_format) || params.quality === 'auto') return null
  const match = /^(\d+)x(\d+)$/.exec(params.size)
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  const pixels = width * height
  if (!width || !height || width % 16 || height % 16 || Math.max(width, height) > 3840 || Math.max(width, height) / Math.min(width, height) > 3 || pixels < 655360 || pixels > 8294400) return null
  const longSide = { low: 16, medium: 24, high: 48, xhigh: 64, max: 96 }[params.quality]
  const shortSide = longSide / (Math.max(width, height) / Math.min(width, height))
  const floor = Math.floor(shortSide)
  // 官方对恰好 .5 的值使用偶数舍入，与 Math.round 不同。
  const rounded = shortSide - floor === 0.5 ? floor + floor % 2 : Math.round(shortSide)
  const baseTokens = Math.ceil(longSide * rounded * (2000000 + pixels) / 4000000)
  const tokens = model.startsWith('gpt-image-2.5-') ? baseTokens : Math.round(baseTokens * { low: 4.2, medium: 3.3, high: 1, xhigh: 1, max: 1 }[params.quality])
  return {
    tokensPerImage: tokens,
    outputUsd: tokens * params.n * 30 / 1000000,
    partialUsdMax: partialImages * params.n * 100 * 30 / 1000000,
  }
}
