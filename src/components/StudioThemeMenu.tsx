import type { StudioAppearance, StudioTheme } from '../lib/studioTheme'
import { SimplePopover } from './SimplePopover'
import { StudioIcon } from './StudioIcon'

const appearances = [
  { value: 'studio', label: '白洞', detail: '星云背景与半透明面板' },
  { value: 'classic', label: '经典', detail: 'V1.0 的灰阶面板与细边框' },
] as const

type Props = {
  appearance: StudioAppearance
  theme: StudioTheme
  onAppearanceChange: (appearance: StudioAppearance) => void
  onThemeChange: (theme: StudioTheme) => void
}

export function StudioThemeMenu({ appearance, theme, onAppearanceChange, onThemeChange }: Props) {
  return <SimplePopover label="主题" triggerClassName="theme-trigger icon-button" button={<StudioIcon name={theme === 'dark' ? 'sun' : 'moon'} size={19}/>}>
    <div className="theme-menu">
      <div className="choice-heading">界面主题</div>
      <div className="chat-action-menu" role="group" aria-label="界面主题">
        {appearances.map(({ value, label, detail }) => <button type="button" key={value} aria-pressed={appearance === value} onClick={() => onAppearanceChange(value)}>
          <span className="choice-option-content"><span>{label}</span><span className="choice-option-detail">{detail}</span></span>
          {appearance === value && <StudioIcon name="check" size={17}/>}
        </button>)}
      </div>
      <div className="choice-heading theme-color-heading">明暗模式</div>
      <div className="segmented theme-colors" role="group" aria-label="明暗模式">
        <button type="button" aria-pressed={theme === 'light'} onClick={() => onThemeChange('light')}><StudioIcon name="sun" size={16}/>浅色</button>
        <button type="button" aria-pressed={theme === 'dark'} onClick={() => onThemeChange('dark')}><StudioIcon name="moon" size={16}/>深色</button>
      </div>
    </div>
  </SimplePopover>
}
