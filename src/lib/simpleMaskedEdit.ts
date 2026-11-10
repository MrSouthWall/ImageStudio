import { canvasToBlob, loadImage } from './canvasImage'
import { blobToDataUrl } from './dataUrl'
import { getSimpleSizeError } from './simpleSize'

export const SIMPLE_MASK_INSTRUCTION = 'Edit only the transparent area of the supplied mask on the first input image. Keep the composition, camera, framing, and all unmasked content unchanged. Additional images are references only.'

export async function createSimpleMaskedEdit(sourceUrl: string, maskUrl: string) {
  const [source, mask] = await Promise.all([loadImage(sourceUrl), loadImage(maskUrl)])
  const width = source.naturalWidth
  const height = source.naturalHeight
  if (mask.naturalWidth !== width || mask.naturalHeight !== height) throw new Error('选区尺寸与原图不一致，请重新涂抹。')
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(source, 0, 0)
  const original = ctx.getImageData(0, 0, width, height).data
  ctx.clearRect(0, 0, width, height); ctx.drawImage(mask, 0, 0)
  const selection = ctx.getImageData(0, 0, width, height).data
  const size = `${width}x${height}`
  return {
    size: getSimpleSizeError(size, 'png') ? 'auto' : size,
    async render(resultUrl: string) {
      const result = await loadImage(resultUrl)
      if (Math.abs(result.naturalWidth / result.naturalHeight / (width / height) - 1) > 0.02) throw new Error('接口返回的图片比例与原图不同，无法对齐选区，已保留原图和选区。请检查接口是否支持指定尺寸。')
      ctx.clearRect(0, 0, width, height); ctx.drawImage(result, 0, 0, width, height)
      const output = ctx.getImageData(0, 0, width, height)
      const pixels = output.data
      for (let i = 0; i < pixels.length; i += 4) {
        const keep = selection[i + 3] / 255
        if (keep === 0) continue
        if (keep === 1) {
          pixels[i] = original[i]; pixels[i + 1] = original[i + 1]; pixels[i + 2] = original[i + 2]; pixels[i + 3] = original[i + 3]
          continue
        }
        const originalAlpha = original[i + 3] / 255 * keep
        const resultAlpha = pixels[i + 3] / 255 * (1 - keep)
        const alpha = originalAlpha + resultAlpha
        for (let channel = 0; channel < 3; channel++) pixels[i + channel] = alpha ? (original[i + channel] * originalAlpha + pixels[i + channel] * resultAlpha) / alpha : 0
        pixels[i + 3] = alpha * 255
      }
      ctx.putImageData(output, 0, 0)
      return blobToDataUrl(await canvasToBlob(canvas, 'image/png'))
    },
  }
}
