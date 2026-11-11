import { useEffect, useMemo, useRef, useState, type MouseEvent, type RefObject } from 'react'
import type { SimpleChat, SimpleRecord } from '../lib/simpleHistory'
import { SimplePopover } from './SimplePopover'
import { StudioIcon } from './StudioIcon'

const filters = [
  ['active', '最近对话'],
  ['archived', '已归档'],
  ['trash', '最近删除'],
] as const
const orders = [
  ['updated', '最近更新'],
  ['created', '创建时间'],
  ['title', '名称顺序'],
] as const
const shortDate = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
const closeMenu = (button: HTMLElement) => button.closest<HTMLElement>('[popover]')?.hidePopover()

type Props = {
  chats: SimpleChat[]
  records: SimpleRecord[]
  chatId: string
  busyChat: string
  disabled: boolean
  onSelect: (id: string) => void
  onChange: (chat: SimpleChat) => Promise<void>
  search: string
  onSearch: (value: string) => void
  searchRef: RefObject<HTMLInputElement | null>
}

export function SimpleChatList({ chats, records, chatId, busyChat, disabled, onSelect, onChange, search, onSearch, searchRef }: Props) {
  const [filter, setFilter] = useState<typeof filters[number][0]>('active')
  const [sort, setSort] = useState(() => {
    try { return localStorage.getItem('gpt-image-chat-sort') || 'updated' }
    catch { return 'updated' }
  })
  const [editing, setEditing] = useState<SimpleChat | null>(null)
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (!editing) return
    dialog.current?.showModal()
    dialog.current?.querySelector<HTMLInputElement>('input')?.select()
  }, [editing])
  useEffect(() => setFilter('active'), [chats.length])

  const query = search.trim().toLocaleLowerCase()
  const matchingIds = useMemo(() => {
    if (!query) return null
    return new Set(records.filter((record) =>
      record.prompt.toLocaleLowerCase().includes(query) || record.assistantText?.toLocaleLowerCase().includes(query)
    ).map((record) => record.chatId))
  }, [records, query])
  const counts = useMemo(() => {
    const next = new Map<string, number>()
    for (const record of records) {
      if (record.chatId) next.set(record.chatId, (next.get(record.chatId) || 0) + 1)
    }
    return next
  }, [records])
  const visible = chats.filter((chat) => {
    if (filter === 'trash' ? !chat.deletedAt : chat.deletedAt || !!chat.archived !== (filter === 'archived')) return false
    return !matchingIds || matchingIds.has(chat.id) || chat.title.toLocaleLowerCase().includes(query)
  }).sort((a, b) => {
    const pinned = Number(!!b.pinned) - Number(!!a.pinned)
    if (pinned) return pinned
    if (sort === 'title') return a.title.localeCompare(b.title, 'zh-CN')
    return sort === 'created' ? b.createdAt - a.createdAt : b.updatedAt - a.updatedAt
  })

  function change(event: MouseEvent<HTMLButtonElement>, chat: SimpleChat) {
    closeMenu(event.currentTarget)
    void onChange(chat)
  }

  return <>
    <div className="history-tools">
      <label className="chat-search">
        <StudioIcon name="search" size={19}/>
        <input ref={searchRef} aria-label="搜索对话" type="search" placeholder="搜索标题或对话内容"
          value={search} onChange={(event) => onSearch(event.target.value)}/>
        {!search && <kbd aria-hidden="true">{navigator.platform.toLowerCase().includes('mac') ? '⌘ K' : 'Ctrl K'}</kbd>}
      </label>
      <div className="chat-list-controls">
        <SimplePopover label="对话范围" button={<><span>{filters.find(([value]) => value === filter)?.[1]}</span><StudioIcon name="chevron" size={13}/></>}>
          <div className="chat-action-menu">
            {filters.map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value}
              onClick={(event) => { setFilter(value); closeMenu(event.currentTarget) }}>
              {label}{filter === value && <StudioIcon name="check" size={16}/>}
            </button>)}
          </div>
        </SimplePopover>
        <SimplePopover label="对话排序" button={<><StudioIcon name="sort" size={16}/><span>排序</span></>}>
          <div className="chat-action-menu">
            {orders.map(([value, label]) => <button key={value} type="button" aria-pressed={sort === value} onClick={(event) => {
              setSort(value)
              try { localStorage.setItem('gpt-image-chat-sort', value) } catch { /* 保留本次选择。 */ }
              closeMenu(event.currentTarget)
            }}>{label}{sort === value && <StudioIcon name="check" size={16}/>}</button>)}
          </div>
        </SimplePopover>
      </div>
    </div>
    <div className="conversation-list" aria-label="已保存对话">
      {visible.map((chat, index) => {
        const count = counts.get(chat.id) || 0
        const updated = new Date(chat.updatedAt)
        return <div key={chat.id} className={'chat-row' + (chat.id === chatId ? ' is-current' : '')}>
          <button type="button" className="chat-select" aria-label={chat.title} aria-current={chatId === chat.id ? 'page' : undefined}
            disabled={disabled || !!chat.deletedAt} onClick={() => onSelect(chat.id)}>
            <span className="chat-order" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            <span className="chat-name">
              <strong title={chat.title}>{chat.title}</strong>
              <small>{busyChat === chat.id ? '正在生成' : count ? count + ' 条创作记录' : '草稿'}</small>
            </span>
            {chat.pinned && !chat.deletedAt && <StudioIcon name="pin" size={15}/>}
            {Number.isFinite(updated.getTime()) && <time dateTime={updated.toISOString()}>{shortDate.format(updated)}</time>}
            {!chat.deletedAt && <StudioIcon name="arrowUpRight" size={17}/>}
          </button>
          <SimplePopover label={`管理对话：${chat.title}`} triggerClassName="chat-row-menu" button={<StudioIcon name="more" size={18}/>}>
            <div className="chat-action-menu">{chat.deletedAt
              ? <button type="button" disabled={disabled} onClick={(event) => change(event, { ...chat, deletedAt: undefined })}>恢复对话</button>
              : <>
                <button type="button" disabled={disabled || busyChat === chat.id} onClick={(event) => {
                  closeMenu(event.currentTarget)
                  setTitle(chat.title)
                  setEditing(chat)
                }}>重命名</button>
                <button type="button" disabled={disabled} onClick={(event) => change(event, { ...chat, pinned: !chat.pinned })}>{chat.pinned ? '取消置顶' : '置顶'}</button>
                <button type="button" disabled={disabled || busyChat === chat.id} onClick={(event) => change(event, { ...chat, archived: !chat.archived })}>{chat.archived ? '移出归档' : '归档'}</button>
                <button type="button" className="danger-action" disabled={disabled || busyChat === chat.id}
                  onClick={(event) => change(event, { ...chat, deletedAt: Date.now() })}>移到最近删除</button>
              </>}</div>
          </SimplePopover>
        </div>
      })}
      {!visible.length && <p className="history-empty">{query ? '没有找到相关对话' : filter === 'trash' ? '没有已删除对话' : filter === 'archived' ? '没有归档对话' : '还没有对话'}</p>}
    </div>
    <dialog ref={dialog} className="settings-dialog rename-dialog" aria-labelledby="rename-title"
      onClose={() => setEditing(null)} onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close() }}>
      <form onSubmit={async (event) => {
        event.preventDefault()
        if (!editing || !title.trim() || saving) return
        setSaving(true)
        try {
          await onChange({ ...editing, title: title.trim(), renamed: true })
          dialog.current?.close()
        } finally { setSaving(false) }
      }}>
        <div className="dialog-heading">
          <h2 id="rename-title">重命名对话</h2>
          <button type="button" className="settings-close icon-button" aria-label="关闭重命名" onClick={() => dialog.current?.close()}><StudioIcon name="close"/></button>
        </div>
        <input aria-label="对话名称" autoFocus maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} required/>
        <button type="submit" className="primary-button settings-done" disabled={!title.trim() || saving}>{saving ? '保存中…' : '保存'}</button>
      </form>
    </dialog>
  </>
}
