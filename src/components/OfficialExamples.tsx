import low from '../assets/examples/complexity-low.webp'
import medium from '../assets/examples/complexity-medium.webp'
import high from '../assets/examples/complexity-high.webp'
import flare from '../assets/examples/svg-flare.svg'
import sunburst from '../assets/examples/svg-sunburst.svg'
import partial0 from '../assets/examples/river-partial-0.jpg'
import partial1 from '../assets/examples/river-partial-1.jpg'
import final from '../assets/examples/river-final.jpg'
import gif from '../assets/examples/gif-example.gif'

const guide = 'https://developers.openai.com/api/docs/guides/image-generation'
const examples = {
  complexity: {
    caption: 'Sunburst · 相同提示词 · 1024×1536 · Medium 画质',
    note: '观察奖杯、球衣和标语位置。这是一次官方示例，档位不会固定画风或配色；提高复杂度也可能产生不希望的改动。',
    source: `${guide}#set-image-complexity`,
    images: [
      { src: low, title: '低 · Low', description: '皇冠奖杯，前景横幅', ratio: '2 / 3' },
      { src: medium, title: '中 · Medium', description: '月桂奖杯，球衣有队徽', ratio: '2 / 3' },
      { src: high, title: '高 · High', description: '蓝色球衣，标语移到看台', ratio: '2 / 3' },
    ],
  },
  svg: {
    caption: 'SVG 输出示例 · 相同面包店标志提示词',
    note: '两张 SVG 的透明区域分别使用深、浅底色展示。比较图形与文字布局，不代表每次结果或速度差异。',
    source: `${guide}#generate-svg-output`,
    images: [
      { src: flare, title: 'Flare', description: '面包图案与双行店名', ratio: '1' },
      { src: sunburst, title: 'Sunburst', description: '麦穗、面包与擀面杖', ratio: '1' },
    ],
  },
  previews: {
    caption: '生成指南中的流式流程示例（GPT Image 2.5）',
    note: '临时图逐步完善，最后一张才是结果。设定的预览次数是上限，最终图可能提前完成；这些图片不用于比较 2.6 画质。',
    source: `${guide}#streaming`,
    images: [
      { src: partial0, title: '第一次预览', description: '', ratio: '1' },
      { src: partial1, title: '第二次预览', description: '', ratio: '1' },
      { src: final, title: '最终结果', description: '', ratio: '1' },
    ],
  },
  gif: {
    caption: 'Sunburst · 512×512 · 9 帧 · 每帧 200ms',
    note: '官方循环动图示例。请在提示词中描述动作和循环方式；GIF 不支持参考图编辑或流式预览。',
    source: `${guide}#generate-animated-gif-output`,
    images: [{ src: gif, title: 'GIF · 1.8 秒循环', description: '', ratio: '1' }],
  },
}

export function OfficialExamples({ kind }: { kind: keyof typeof examples }) {
  const example = examples[kind]
  return <div className="official-examples">
    <p className="example-caption">{example.caption}</p>
    <div className={`example-gallery columns-${example.images.length}`} data-example-kind={kind} tabIndex={example.images.length > 1 ? 0 : undefined} aria-label={`${example.caption}，可横向滚动查看`}>
      {example.images.map((image) => <figure key={image.title}>
        <img src={image.src} alt={image.description ? `${image.title}：${image.description}` : image.title} style={{ aspectRatio: image.ratio }} decoding="async" />
        <figcaption><strong>{image.title}</strong>{image.description && <span>{image.description}</span>}</figcaption>
      </figure>)}
    </div>
    <p className="example-note">{example.note}</p>
    <a className="example-source" href={example.source} target="_blank" rel="noreferrer">OpenAI 官方示例 ↗</a>
  </div>
}
