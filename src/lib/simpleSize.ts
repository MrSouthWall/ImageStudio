import type { TaskParams } from '../types'
import { normalizeImageSize } from './size'

export function getSimpleSizeError(size: string, format: TaskParams['output_format']) {
  if (size === 'auto') return ''
  if (format === 'gif') {
    const match = /^(\d+)x(\d+)$/.exec(size)
    const width = Number(match?.[1])
    const height = Number(match?.[2])
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || width % 16 || height % 16) return 'GIF 每帧宽高必须为正整数且是 16 的倍数；总帧数和尺寸预算由接口校验。'
    return ''
  }
  if (!/^\d+x\d+$/.test(size) || normalizeImageSize(size) !== size) return '尺寸需要是 16 的倍数，最长边不超过 3840，宽高比不超过 3:1，总像素在 655,360–8,294,400 之间。'
  return ''
}

export const SIMPLE_DEFAULT_SIZE = '1920x1088'

export type SimpleDirection = 'auto' | 'square' | 'landscape' | 'portrait'

export function getSimpleSizeDirection(size: string): SimpleDirection {
  if (size === 'auto') return 'auto'
  const [width, height] = size.split('x').map(Number)
  return width > height ? 'landscape' : height > width ? 'portrait' : 'square'
}

export function getSimpleSizePresets(direction: SimpleDirection, format: TaskParams['output_format']): Array<{ value: string; label: string }> {
  if (direction === 'auto') return [...getSimpleSizePresets('landscape', format), ...getSimpleSizePresets('square', format)]
  if (direction === 'square') return [
    ...(format === 'gif' ? [{ value: '512x512', label: '512 × 512 · GIF' }] : []),
    { value: '1024x1024', label: '1024 × 1024' },
    { value: '2048x2048', label: '2048 × 2048' },
  ]
  return [
    { value: '1280x720', label: '720P' },
    { value: '1920x1088', label: '1080P' },
    { value: '2560x1440', label: '2K' },
    { value: '3840x2160', label: '4K' },
  ].map((preset) => {
    const value = direction === 'portrait' ? preset.value.split('x').reverse().join('x') : preset.value
    return { value, label: `${preset.label ? `${preset.label} · ` : ''}${value.replace('x', '×')}` }
  })
}
