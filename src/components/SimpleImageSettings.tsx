import type { Dispatch, SetStateAction } from 'react'
import { DEFAULT_PARAMS, type TaskParams } from '../types'
import { getSimpleSizeError, getSimpleSizePresets, getSimpleSizeDirection, SIMPLE_DEFAULT_SIZE } from '../lib/simpleSize'
import { estimateImageOutput, IMAGE_PRICING_SOURCE } from '../lib/imagePricing'
import { SIMPLE_IMAGE_MODELS } from '../lib/simpleImageModels'
import { OfficialExamples } from './OfficialExamples'
import { Info, SimplePopover, SimpleChoice, HelpRows } from './SimplePopover'
import { StudioIcon } from './StudioIcon'

type Props = { onReset: () => void; exchangeRate: number; params: TaskParams; setParams: Dispatch<SetStateAction<TaskParams>>; imageModel: string; onModelChange: (model: string) => void; customSize: string; setCustomSize: (size: string) => void; background: string; setBackground: (background: string) => void; partialCount: number; setPartialCount: (count: number) => void; busy: boolean; hasAttachments: boolean; responses: boolean }

const qualityOptions = [
  { value: 'auto', label: '自动画质' },
  { value: 'low', label: '低画质' },
  { value: 'medium', label: '中画质' },
  { value: 'high', label: '高画质' },
  { value: 'xhigh', label: '超高画质' },
  { value: 'max', label: '最高画质' },
] as const

const complexityOptions = [
  { value: 'auto', label: '自动（auto）' },
  { value: 'low', label: '低（low）' },
  { value: 'medium', label: '中（medium）' },
  { value: 'high', label: '高（high）' },
] as const

const previewOptions = [{ value: 0, label: '关闭' }, ...[1, 2, 3].map((value) => ({ value, label: String(value) }))]
const sizeDirectionLabels = { auto: '自动', portrait: '竖向', landscape: '横向', square: '方形' }

export function SimpleImageSettings({ onReset, exchangeRate, params, setParams, imageModel, onModelChange, customSize, setCustomSize, background, setBackground, partialCount, setPartialCount, busy, hasAttachments, responses }: Props) {
  const image25 = imageModel.startsWith('gpt-image-2.5-')
  const animated = params.output_format === 'gif' || params.output_format === 'svg'
  const size = params.size === 'custom' ? customSize.trim().toLowerCase().replace('×', 'x') : params.size
  const [customWidth = '', customHeight = ''] = customSize.toLowerCase().replace('×', 'x').split('x')
  const direction = getSimpleSizeDirection(size)
  const directionLabel = sizeDirectionLabels[direction]
  const presetLabel = getSimpleSizePresets(direction, params.output_format).find((preset) => preset.value === size)?.label.split(' · ')[0]
  const sizeLabel = params.size === 'auto' ? '自动尺寸' : params.size === 'custom' ? '自定义' : directionLabel + ' ' + (presetLabel || size.replace('x', '×'))
  const modelChoice = {
    label: '图片模型',
    value: imageModel,
    onChange: onModelChange,
    disabled: busy,
    options: SIMPLE_IMAGE_MODELS.map((model) => ({ value: model.value, label: model.name, detail: model.description })),
    help: <div className="model-price-comparison">
      <table className="model-price-table">
        <caption>大约价格（元 / 张）</caption>
        <thead><tr><th scope="col">模型</th><th scope="col">低画质</th><th scope="col">中画质</th><th scope="col">高画质</th></tr></thead>
        <tbody>{SIMPLE_IMAGE_MODELS.map((model) => <tr key={model.value}>
          <th scope="row">{model.name}</th>
          {(['low', 'medium', 'high'] as const).map((quality) => {
            const price = estimateImageOutput({ ...DEFAULT_PARAMS, size: SIMPLE_DEFAULT_SIZE, quality, n: 1, output_format: 'png' }, 0, model.value)!
            return <td key={quality}>¥{(price.outputUsd * exchangeRate).toFixed(2)}</td>
          })}
        </tr>)}</tbody>
      </table>
      <p className="help-note">按横向 1080P（1920×1088）估算，仅图片输出；输入、预览、对话及其它工具费用另计。</p>
      <p className="model-price-source"><a href={IMAGE_PRICING_SOURCE} target="_blank" rel="noreferrer">官方价格计算器 ↗</a></p>
    </div>,
  }
  const sizeChoice = {
    label: '尺寸与方向',
    value: params.size,
    buttonLabel: sizeLabel,
    disabled: busy,
    onChange: (value: string) => {
      if (value === 'custom' && size !== 'auto') setCustomSize(size)
      setParams((current) => ({ ...current, size: value }))
    },
    options: [
      { value: 'auto', label: '自动尺寸' },
      ...(['square', 'landscape', 'portrait'] as const).flatMap((group) => getSimpleSizePresets(group, params.output_format).map((preset) => ({
        ...preset, group: sizeDirectionLabels[group],
      }))),
      { value: 'custom', label: '自定义' },
    ],
    help: <HelpRows rows={[['方形', '头像。'], ['横向', '封面。'], ['竖向', '手机海报。']]} note="1080P 使用 1920×1088，满足接口要求。"/>,
    children: params.size === 'custom' && <div className="custom-size-inline">
      <span>自定义<Info label="自定义尺寸"><HelpRows rows={[['宽高步长', '16 像素的倍数。'], ['长边上限', '3840 像素。'], ['宽高比', '不超过 3:1。'], ['总像素', '655360–8294400。']]}/></Info></span>
      <input aria-label="自定义宽度（像素）" type="number" min="16" step="16" value={customWidth} onChange={(e) => setCustomSize(e.target.value + 'x' + customHeight)} placeholder="宽"/>
      <span>×</span>
      <input aria-label="自定义高度（像素）" type="number" min="16" step="16" value={customHeight} onChange={(e) => setCustomSize(customWidth + 'x' + e.target.value)} placeholder="高"/>
    </div>,
  }
  const formatOptions = [
    { value: 'png', label: 'PNG' },
    { value: 'jpeg', label: 'JPEG' },
    { value: 'webp', label: 'WebP' },
    { value: 'gif', label: 'GIF 动图', disabled: image25 },
    { value: 'svg', label: hasAttachments ? 'SVG 矢量图 · 仅文生图' : 'SVG 矢量图', disabled: image25 || hasAttachments },
  ] as const

  function changeOutputFormat(format: TaskParams['output_format']) {
    const nextSize = params.size === 'auto' ? 'auto' : format === 'gif' ? '512x512'
      : params.output_format === 'gif' && getSimpleSizeError(size, format) ? '1024x1024' : params.size
    setParams((current) => ({ ...current, output_format: format, n: format === 'svg' ? 1 : current.n, size: nextSize }))
    if (!['png', 'webp', 'svg'].includes(format) && background === 'transparent') setBackground('auto')
  }

  return <fieldset className="image-parameters" disabled={busy} aria-label="图片参数">
    <div className="image-quick-settings">
      <SimpleChoice {...modelChoice} triggerClassName="composer-button model-button"/>
      <SimpleChoice {...sizeChoice} triggerClassName="composer-button size-button"/>
    </div>
    <SimplePopover label="图片设置" triggerClassName="composer-button parameter-trigger" disabled={busy} button={<><StudioIcon name="settings" size={17}/><span>参数</span></>}>
      <div className="parameter-menu">
        <h3>图片参数</h3><p>设置尺寸、画质和输出方式。</p>
        <div className="setting-row"><span>图片模型</span><SimpleChoice {...modelChoice}/></div>
        <div className="setting-row"><span>尺寸与方向</span><SimpleChoice {...sizeChoice}/></div>
        <div className="setting-row">
          <span>画质<Info label="画质"><HelpRows rows={[['低画质', '先试想法。'], ['高画质', '适合正式海报。']]} note="更高的画质通常更精细，也更慢、更贵。"/></Info></span>
          <SimpleChoice label="画质" value={params.quality} options={qualityOptions} onChange={(quality) => setParams((current) => ({ ...current, quality }))}/>
        </div>
        <div className="setting-row">
          <span>图片数量<Info label="图片数量"><HelpRows rows={[['比较方案', '可先生成 2–4 张。'], ['对话创作', '张数是目标，实际数量由模型决定。'], ['SVG', '一次 1 张。']]}/></Info></span>
          <SimpleChoice label="图片数量" value={params.n}
            options={Array.from({ length: params.output_format === 'svg' ? 1 : 10 }, (_, index) => ({ value: index + 1, label: (index + 1) + ' 张' }))}
            onChange={(n) => setParams((current) => ({ ...current, n }))}/>
        </div>
        <div className="setting-row">
          <span>复杂度（complexity）<Info label="复杂度" wide><HelpRows rows={[['低', '换颜色等简单修改。'], ['高', '多人物或文字海报。'], ['自动', '不确定时选默认。']]} note="控制绘制前的思考程度；本工具仅对 2.6 开放。"/><OfficialExamples kind="complexity"/></Info></span>
          <SimpleChoice label="复杂度" value={image25 ? 'auto' : params.complexity} disabled={image25} options={complexityOptions}
            onChange={(complexity) => setParams((current) => ({ ...current, complexity }))}/>
        </div>
        <div className="setting-row">
          <span>输出格式<Info label="输出格式" wide>
            <HelpRows rows={[['PNG', '保存原图。'], ['JPEG / WebP', '网页配图。'], ['GIF', '动图。'], ['SVG', '可缩放图标。']]} note="GIF / SVG 仅对 2.6 开放。GIF 支持文字或静态参考图生成；SVG 仅支持文字生成。"/>
            {params.output_format === 'gif' ? <OfficialExamples kind="gif"/> : params.output_format === 'svg' ? <OfficialExamples kind="svg"/> : null}
          </Info></span>
          <SimpleChoice label="输出格式" value={params.output_format} options={formatOptions} onChange={changeOutputFormat}/>
        </div>
        <div className="setting-row">
          <span>背景（background）<Info label="背景"><HelpRows rows={[['透明', '贴纸或商品素材。'], ['不透明', '完整场景。'], ['自动', '不确定时使用。']]}/></Info></span>
          <SimpleChoice label="背景" value={background} onChange={setBackground} options={[
            { value: 'auto', label: '自动（auto）' },
            { value: 'opaque', label: '不透明（opaque）' },
            { value: 'transparent', label: '透明（transparent）', disabled: !['png', 'webp', 'svg'].includes(params.output_format) },
          ]}/>
        </div>
        <div className="setting-row">
          <span>内容审核（moderation）<Info label="内容审核"><HelpRows rows={[['auto', '默认审核。'], ['low', '较宽松。']]} note="两者仍受服务安全规则约束。"/></Info></span>
          <SimpleChoice label="内容审核" value={params.moderation} onChange={(moderation) => setParams((current) => ({ ...current, moderation }))}
            options={[{ value: 'auto', label: '自动（auto）' }, { value: 'low', label: '较宽松（low）' }]}/>
        </div>
        <div className="setting-row">
          <span>预览张数<Info label="预览张数" wide><HelpRows rows={[['用途', '生成过程中先看草图。'], ['次数', '每张最多 3 次。'], ['费用', '预览另计费。']]} note="GIF / SVG 不支持预览。"/><OfficialExamples kind="previews"/></Info></span>
          <SimpleChoice label="预览张数" value={animated ? 0 : partialCount} disabled={animated || busy} options={previewOptions} onChange={setPartialCount}/>
        </div>
        {['jpeg', 'webp'].includes(params.output_format) && <div className="setting-row">
          <span>压缩质量（%）<Info label="压缩质量（%）"><HelpRows rows={[['建议', '网页配图可试 80，减少文件大小。'], ['适用格式', 'JPEG / WebP。'], ['默认值', '留空为 100。']]}/></Info></span>
          <input aria-label="压缩质量（%）" type="number" min="0" max="100" placeholder="100（默认）" value={params.output_compression ?? ''}
            onChange={(event) => { const value = event.target.value; setParams((current) => ({ ...current, output_compression: value === '' ? null : Number(value) })) }}/>
        </div>}
        {params.output_format === 'gif' && <>
          <div className="setting-row">
            <span>帧数<Info label="帧数"><HelpRows rows={[['含义', '动作分成的画面数量。'], ['示例', '简单眨眼可用 9 帧。'], ['范围', '2–16 帧。']]}/></Info></span>
            <input aria-label="帧数" type="number" min="2" max="16" value={params.frame_count}
              onChange={(event) => { const frame_count = Number(event.target.value); setParams((current) => ({ ...current, frame_count })) }} required/>
          </div>
          <div className="setting-row">
            <span>每帧时长（毫秒）<Info label="每帧时长（毫秒）"><HelpRows rows={[['含义', '每张画面停留的时间。'], ['示例', '简单眨眼可用 200 毫秒。'], ['范围', '20–2000 毫秒。']]} note="数字越小，动作越快。"/></Info></span>
            <input aria-label="每帧时长（毫秒）" type="number" min="20" max="2000" step="10" value={params.frame_duration_ms}
              onChange={(event) => { const frame_duration_ms = Number(event.target.value); setParams((current) => ({ ...current, frame_duration_ms })) }} required/>
          </div>
        </>}
        {animated && <p className="format-note">{params.output_format === 'svg' ? 'SVG 仅支持一次生成 1 张，编写模型由服务决定。' : 'GIF 支持 2–16 帧，可添加静态参考图，在提示词中描述动作和循环方式。'} 此格式不支持流式预览，可能需要额外权限。</p>}
        <div className="image-settings-reset"><button type="button" disabled={busy} onClick={onReset}>恢复默认设置</button></div>
      </div>
    </SimplePopover>
    {responses && <span className="sr-only">对话创作的张数为生成目标。</span>}
  </fieldset>
}
