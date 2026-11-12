import type { ReactNode } from 'react'
import { StudioIcon } from './StudioIcon'
import { StudioOrb } from './StudioOrb'

export function StudioHome({ composer, dark, classic }: {
  composer: ReactNode
  dark: boolean
  classic: boolean
}) {
  return <div className={`workspace-pane ${classic ? 'classic-home' : 'origin-pane'}`}>
    <section className={classic ? 'classic-home-content' : 'origin-studio'} aria-labelledby="origin-title">
      <div className={classic ? 'classic-home-intro' : 'origin-intro'}>
        <h1 id="origin-title">{classic ? '想创作什么？' : '白洞'}</h1>
        <p className={classic ? undefined : 'origin-lede'}>{classic ? '写下画面描述，或拖入、粘贴参考图。' : '写下想象，让图像从这里涌出。'}</p>
        {classic && <span className="classic-home-mark" aria-hidden="true"><StudioIcon name="image" size={28}/></span>}
      </div>
      {!classic && <div className="origin-stage"><StudioOrb dark={dark}/></div>}
      <div className={classic ? 'classic-home-compose' : 'origin-compose'}>{composer}</div>
    </section>
  </div>
}
