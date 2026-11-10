import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export function SimplePopover({ label, children, wide = false, button, disabled = false, triggerClassName = '' }: { label: string; children: ReactNode; wide?: boolean; button?: ReactNode; disabled?: boolean; triggerClassName?: string }) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const help = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const restoringFocus = useRef(false)
  const cancelClose = () => { clearTimeout(closeTimer.current) }
  const showInfo = () => { if (!button) { cancelClose(); help.current?.showPopover() } }
  const scheduleClose = () => {
    if (button) return
    cancelClose()
    closeTimer.current = setTimeout(() => {
      if (trigger.current?.matches(':hover, :focus-visible') || help.current?.matches(':hover') || help.current?.contains(document.activeElement)) return
      help.current?.hidePopover()
    }, 120)
  }
  useLayoutEffect(() => () => clearTimeout(closeTimer.current), [])
  useLayoutEffect(() => {
    if (!open) return
    const position = () => {
      const rect = trigger.current!.getBoundingClientRect()
      const popup = help.current!
      const width = popup.offsetWidth
      const height = popup.offsetHeight
      const beside = wide && rect.right + width + 24 <= window.innerWidth
      popup.style.left = `${beside ? rect.right + 8 : Math.max(16, Math.min(rect.left, window.innerWidth - width - 16))}px`
      popup.style.visibility = 'visible'
      popup.style.top = `${beside ? Math.max(16, Math.min(rect.top, window.innerHeight - height - 16)) : Math.max(16, rect.bottom + height + 8 <= window.innerHeight - 16 ? rect.bottom + 8 : rect.top - height - 8)}px`
    }
    position()
    const observer = new ResizeObserver(position)
    observer.observe(help.current!)
    window.addEventListener('resize', position)
    document.addEventListener('scroll', position, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', position)
      document.removeEventListener('scroll', position, true)
    }
  }, [open, wide])
  useLayoutEffect(() => {
    if (!open || button) return
    const popup = help.current!
    const parent = trigger.current!.closest<HTMLElement>('[popover]')
    const close = () => popup.hidePopover()
    const outside = (event: PointerEvent) => {
      if (!popup.contains(event.target as Node) && !trigger.current!.contains(event.target as Node)) close()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      close()
      restoringFocus.current = true
      trigger.current!.focus()
      restoringFocus.current = false
    }
    const parentToggle = (event: Event) => {
      if (event.target === parent && (event as ToggleEvent).newState === 'closed') close()
    }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('keydown', escape, true)
    parent?.addEventListener('beforetoggle', parentToggle)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('keydown', escape, true)
      parent?.removeEventListener('beforetoggle', parentToggle)
    }
  }, [open, button])
  return <><button ref={trigger} disabled={disabled} type="button" className={`${button ? 'parameter-button' : 'info-button'} ${triggerClassName}`} popoverTarget={button ? id : undefined} onPointerEnter={(event) => { if (event.pointerType === 'mouse') showInfo() }} onPointerLeave={scheduleClose} onFocus={(event) => { if (!restoringFocus.current && event.currentTarget.matches(':focus-visible')) showInfo() }} onBlur={scheduleClose} onClick={button ? undefined : () => { cancelClose(); if (window.matchMedia('(hover: hover)').matches) showInfo(); else help.current?.togglePopover() }} aria-label={button ? label : `${label}说明`} aria-expanded={open} aria-describedby={open ? id : undefined}>{button || <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><path d="M10 9v5M10 5.5v1.5"/></svg>}</button><div id={id} ref={help} popover={button ? 'auto' : 'manual'} onPointerEnter={button ? undefined : cancelClose} onPointerLeave={scheduleClose} onFocus={button ? undefined : cancelClose} onBlur={scheduleClose} role={button ? 'dialog' : wide ? 'region' : 'tooltip'} aria-label={button ? label : `${label}说明`} className={`info-popover${wide ? ' info-popover-wide' : ''}${button ? ' menu-popover' : ''}`} onBeforeToggle={(event) => { if (event.target !== event.currentTarget) return; if (event.newState === 'open') event.currentTarget.style.visibility = 'hidden' }} onToggle={(event) => { if (event.target === event.currentTarget) setOpen(event.newState === 'open') }}>{open && children}</div></>
}

export function Info({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <SimplePopover label={label} wide={wide}>{children}</SimplePopover>
}

export function SimpleChoice({ label, value, options, onChange, disabled, help, children, buttonLabel }: { buttonLabel?: string; label: string; value: string; options: { value: string; label: string; group?: string; detail?: string }[]; onChange: (value: string) => void; disabled?: boolean; help: ReactNode; children?: ReactNode }) {
  return <SimplePopover label={label} disabled={disabled} button={<><span>{buttonLabel || options.find((option) => option.value === value)?.label || value}</span><svg className="control-chevron" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></>}>
    <div className="choice-menu"><div className="choice-heading">{label}<Info label={label}>{help}</Info></div>
      <div role="group" aria-label={label}>{options.map((option, i) => <div key={option.value}>{option.group && option.group !== options[i - 1]?.group && <div className="choice-group">{option.group}</div>}<button type="button" disabled={disabled} aria-pressed={value === option.value} onClick={(event) => { onChange(option.value); if (option.value !== 'custom') event.currentTarget.closest<HTMLElement>('[popover]')?.hidePopover() }}><span className={option.detail ? 'choice-option-content' : undefined}><span>{option.label}</span>{option.detail && <span className="choice-option-detail">{option.detail}</span>}</span><span aria-hidden="true">{value === option.value ? '✓' : ''}</span></button></div>)}</div>
      {children}
    </div>
  </SimplePopover>
}

export function HelpRows({ rows, note }: { rows: [string, ReactNode][]; note?: ReactNode }) {
  return <><dl className="help-rows">{rows.map(([label, description]) => <div className="help-row" key={label}><dt>{label}</dt><dd>{description}</dd></div>)}</dl>{note && <p className="help-note">{note}</p>}</>
}
