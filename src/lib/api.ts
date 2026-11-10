import { getActiveApiProfile, getCustomProviderDefinition } from './apiProfiles'
import { composeMarkupDataUrl, toApiInputImageDataUrl } from './canvasImage'
import { supportsImageMarkup } from './imageModels'
import { callOpenAICompatibleImageApi } from './openaiCompatibleImageApi'
import type { CallApiOptions, CallApiResult } from './imageApiShared'

export type { CallApiOptions, CallApiResult } from './imageApiShared'
export { normalizeBaseUrl } from './devProxy'

export async function callImageApi(opts: CallApiOptions): Promise<CallApiResult> {
  const profile = getActiveApiProfile(opts.settings)
  if (opts.params.output_format === 'svg' && opts.inputImageDataUrls.length) {
    throw new Error('SVG 仅支持文生图，请先移除参考图，或切换 PNG / WebP / JPEG。')
  }
  if (opts.params.output_format === 'gif' && opts.maskDataUrl) {
    throw new Error('GIF 不支持遮罩编辑，请移除遮罩或切换静态图片格式。')
  }
  const inputImageDataUrls = await Promise.all(opts.inputImageDataUrls.map(toApiInputImageDataUrl))
  const inputImageUrls = opts.inputImageUrls ? [...opts.inputImageUrls] : undefined
  let markupDataUrl = opts.markupDataUrl
  // 接口不支持 markup，或已有遮罩（两者不能同时使用）时，把标注直接画进第一张图
  if (markupDataUrl && inputImageDataUrls.length && (opts.maskDataUrl || !supportsImageMarkup(profile))) {
    inputImageDataUrls[0] = await composeMarkupDataUrl(inputImageDataUrls[0], markupDataUrl)
    if (inputImageUrls) inputImageUrls[0] = null
    markupDataUrl = undefined
  }
  const requestOpts = { ...opts, inputImageDataUrls, inputImageUrls, markupDataUrl }
  return callOpenAICompatibleImageApi(requestOpts, profile, getCustomProviderDefinition(opts.settings, profile.provider))
}
