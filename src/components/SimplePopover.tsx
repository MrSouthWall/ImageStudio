import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type KeyboardEventHandler, type ReactNode } from 'react'
import { StudioIcon, type StudioIconName } from './StudioIcon'

type PopoverProps = {
  label: string
  children: ReactNode
  wide?: boolean
  button?: ReactNode
  disabled?: boolean
  triggerClassName?: string
  triggerDescriptionId?: string
  onTriggerKeyDown?: KeyboardEventHandler<HTMLButtonElement>
  onOpen?: (popup: HTMLDivElement) => void
}

export function SimplePopover({ label, children, wide = false, button, disabled = false, triggerClassName = '', triggerDescriptionId, onTriggerKeyDown, onOpen }: PopoverProps) {
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
      const gutter = 12
      const beside = wide && rect.right + width + gutter + 8 <= window.innerWidth
      const below = rect.bottom + height + 8 <= window.innerHeight - gutter
      popup.style.left = `${beside ? rect.right + 8 : Math.max(gutter, Math.min(rect.left, window.innerWidth - width - gutter))}px`
      popup.style.top = `${Math.max(gutter, Math.min(beside ? rect.top : below ? rect.bottom + 8 : rect.top - height - 8, window.innerHeight - height - gutter))}px`
      popup.style.visibility = 'visible'
    }
    position()
    onOpen?.(help.current!)
    const observer = new ResizeObserver(position)
    observer.observe(help.current!)
    window.addEventListener('resize', position)
    document.addEventListener('scroll', position, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', position)
      document.removeEventListener('scroll', position, true)
    }
  }, [open, wide, onOpen])
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
  return <>
    <button ref={trigger} disabled={disabled} type="button" className={`${button ? 'parameter-button' : 'info-button'} ${triggerClassName}`} popoverTarget={button ? id : undefined} onKeyDown={onTriggerKeyDown}
      onPointerEnter={(event) => { if (event.pointerType === 'mouse') showInfo() }} onPointerLeave={scheduleClose} onFocus={(event) => { if (!restoringFocus.current && event.currentTarget.matches(':focus-visible')) showInfo() }} onBlur={scheduleClose}
      onClick={button ? undefined : () => { cancelClose(); if (window.matchMedia('(hover: hover)').matches) showInfo(); else help.current?.togglePopover() }}
      aria-label={button ? label : `${label}说明`} aria-expanded={open} aria-controls={button ? id : undefined}
      aria-haspopup={button ? "dialog" : undefined} aria-describedby={button ? triggerDescriptionId : open ? id : undefined}>
      {button || <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><path d="M10 9v5M10 5.5v1.5"/></svg>}
    </button>
    <div id={id} ref={help} popover={button ? 'auto' : 'manual'}
      onPointerEnter={button ? undefined : cancelClose} onPointerLeave={scheduleClose} onFocus={button ? undefined : cancelClose} onBlur={scheduleClose} role={button ? 'dialog' : wide ? 'region' : 'tooltip'}
      aria-label={button ? label : `${label}说明`} className={`info-popover${wide ? ' info-popover-wide' : ''}${button ? ' menu-popover' : ''}`}
      onBeforeToggle={(event) => { if (event.target !== event.currentTarget) return; if (event.newState === 'open') event.currentTarget.style.visibility = 'hidden' }}
      onToggle={(event) => { if (event.target === event.currentTarget) setOpen(event.newState === 'open') }}>{open && children}</div>
  </>
}

export function Info({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <SimplePopover label={label} wide={wide}>{children}</SimplePopover>
}

type ChoiceProps<Value extends string | number> = {
  label: string
  value: Value
  options: readonly { value: Value; label: string; group?: string; detail?: string; disabled?: boolean }[]
  onChange: (value: Value) => void
  disabled?: boolean
  help?: ReactNode
  children?: ReactNode
  buttonLabel?: string
  icon?: StudioIconName
  triggerClassName?: string
}

function focusSelectedOption(popup: HTMLElement) {
  const selected = popup.querySelector<HTMLButtonElement>('button[aria-pressed="true"]:enabled')
    ?? popup.querySelector<HTMLButtonElement>('button[aria-pressed]:enabled')
  selected?.focus()
}

function openChoiceFromKeyboard(event: ReactKeyboardEvent<HTMLButtonElement>) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  const popup = document.getElementById(event.currentTarget.getAttribute('aria-controls') ?? '')
  if (!popup) return
  event.preventDefault()
  if (popup.matches(':popover-open')) focusSelectedOption(popup)
  else event.currentTarget.click()
}

function closeChoice(control: HTMLElement) {
  const popup = control.closest<HTMLElement>('[popover]')
  const trigger = popup?.previousElementSibling
  popup?.hidePopover()
  if (trigger instanceof HTMLButtonElement) trigger.focus({ preventScroll: true })
}

function handleChoiceKey(event: ReactKeyboardEvent<HTMLDivElement>) {
  const { key } = event
  if (key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    closeChoice(event.currentTarget)
    return
  }
  if (key !== 'ArrowDown' && key !== 'ArrowUp' && key !== 'Home' && key !== 'End') return
  const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button[aria-pressed]:enabled'))
  const index = options.indexOf(event.target as HTMLButtonElement)
  if (index < 0) return
  event.preventDefault()
  const next = {
    ArrowDown: (index + 1) % options.length,
    ArrowUp: (index + options.length - 1) % options.length,
    Home: 0,
    End: options.length - 1,
  }[key]
  options[next].focus()
}

export function SimpleChoice<Value extends string | number>({ label, value, options, onChange, disabled, help, children, buttonLabel, icon, triggerClassName }: ChoiceProps<Value>) {
  const descriptionId = useId()
  const selectedLabel = buttonLabel || options.find((option) => option.value === value)?.label || value
  return <SimplePopover label={label} disabled={disabled} triggerClassName={triggerClassName} triggerDescriptionId={descriptionId}
    onOpen={focusSelectedOption} onTriggerKeyDown={openChoiceFromKeyboard}
    button={<>{icon && <StudioIcon name={icon} size={16}/>}<span id={descriptionId} className="choice-label">{selectedLabel}</span><StudioIcon name="chevron" size={13}/></>}>
    <div className="choice-menu" onKeyDown={handleChoiceKey}>
      <div className="choice-heading">{label}{help && <Info label={label}>{help}</Info>}</div>
      <div role="group" aria-label={label}>
        {options.map((option, i) => <div key={option.value}>
          {option.group && option.group !== options[i - 1]?.group && <div className="choice-group">{option.group}</div>}
          <button type="button" disabled={disabled || option.disabled} aria-pressed={value === option.value} onClick={(event) => {
            if (value !== option.value) onChange(option.value)
            if (option.value !== 'custom') closeChoice(event.currentTarget)
          }}>
            <span className={option.detail ? 'choice-option-content' : undefined}><span>{option.label}</span>{option.detail && <span className="choice-option-detail">{option.detail}</span>}</span>
            {value === option.value && <StudioIcon name="check" size={15}/>}
          </button>
        </div>)}
      </div>
      {children}
    </div>
  </SimplePopover>
}

export function HelpRows({ rows, note }: { rows: [string, ReactNode][]; note?: ReactNode }) {
  return <><dl className="help-rows">{rows.map(([label, description]) => <div className="help-row" key={label}><dt>{label}</dt><dd>{description}</dd></div>)}</dl>{note && <p className="help-note">{note}</p>}</>
}
