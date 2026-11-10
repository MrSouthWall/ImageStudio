import { canvasToBlob, loadImage } from './canvasImage'
import { blobToDataUrl } from './dataUrl'
import { getSimpleSizeError } from './simpleSize'

export const SIMPLE_MARKUP_INSTRUCTION = 'Use the separate markup annotation layer on the first input image to identify what the user wants edited. Circles, arrows, and strokes are guidance, not a pixel mask. Apply the requested change, preserve the composition and unrelated content, and remove all annotation marks from the finished image. Additional input images are references only.'

export async function validateSimpleMarkup(markupUrl: string, sourceUrl: string) {
  if (!markupUrl.startsWith('data:image/png;')) throw new Error('标记层必须为透明 PNG。')
  const [source, markup] = await Promise.all([loadImage(sourceUrl), loadImage(markupUrl)])
  const width = source.naturalWidth
  const height = source.naturalHeight
  if (markup.naturalWidth !== width || markup.naturalHeight !== height) throw new Error('标记层尺寸与原图不一致，请重新标记。')
  if (width * height > 16_777_216) throw new Error('标记引导的图片不能超过 16,777,216 像素。')
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(markup, 0, 0)
  const pixels = ctx.getImageData(0, 0, width, height).data
  let marked = false
  let transparent = false
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] > 0) marked = true
    if (pixels[i] === 0) transparent = true
    if (marked && transparent) return { width, height }
  }
  throw new Error(marked ? '标记层必须保留透明区域，不能把标记合并到原图。' : '请先圈选、画箭头或绘制标记。')
}

export async function createSimpleMarkupEdit(sourceUrl: string, markupUrl: string) {
  const { width, height } = await validateSimpleMarkup(markupUrl, sourceUrl)
  const size = `${width}x${height}`
  return {
    size: getSimpleSizeError(size, 'png') ? 'auto' : size,
    async render(resultUrl: string) {
      const result = await loadImage(resultUrl)
      if (Math.abs(result.naturalWidth / result.naturalHeight / (width / height) - 1) > 0.02) throw new Error('接口返回的图片比例与原图不同，无法继续沿用标记，已保留原图与标记。')
      if (result.naturalWidth === width && result.naturalHeight === height && resultUrl.startsWith('data:image/png;')) return resultUrl
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
      canvas.getContext('2d')!.drawImage(result, 0, 0, width, height)
      return blobToDataUrl(await canvasToBlob(canvas, 'image/png'))
    },
  }
}
