import type { ReactNode } from 'react'
import { StudioOrb } from './StudioOrb'

export function StudioHome({ composer, dark }: {
  composer: ReactNode
  dark: boolean
}) {
  return <div className="workspace-pane origin-pane">
    <section className="origin-studio" aria-labelledby="origin-title">
      <div className="origin-intro">
        <h1 id="origin-title">白洞</h1>
        <p className="origin-lede">写下想象，让图像从这里涌出。</p>
      </div>
      <div className="origin-stage"><StudioOrb dark={dark}/></div>
      <div className="origin-compose">{composer}</div>
    </section>
  </div>
}
