import { useEffect, useMemo, useRef, useState } from 'react'
import type { SimpleChat, SimpleRecord } from '../lib/simpleHistory'
import { SimplePopover } from './SimplePopover'

export function SimpleChatList({ chats, records, chatId, busyChat, disabled, onSelect, onChange, search, onSearch }: { chats: SimpleChat[]; records: SimpleRecord[]; chatId: string; busyChat: string; disabled: boolean; onSelect: (id: string) => void; onChange: (chat: SimpleChat) => Promise<void>; search: string; onSearch: (value: string) => void }) {
  const [filter, setFilter] = useState('active')
  const [sort, setSort] = useState(() => { try { return localStorage.getItem('gpt-image-chat-sort') || 'updated' } catch { return 'updated' } })
  const [editing, setEditing] = useState<SimpleChat | null>(null)
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { if (editing) { dialog.current?.showModal(); dialog.current?.querySelector<HTMLInputElement>('input')?.select() } }, [editing])
  useEffect(() => setFilter('active'), [chats.length])
  const matchingIds = useMemo(() => {
    if (!search.trim()) return null
    const query = search.trim().toLocaleLowerCase()
    return new Set(records.filter((record) => `${record.prompt}\n${record.assistantText || ''}`.toLocaleLowerCase().includes(query)).map((record) => record.chatId))
  }, [records, search])
  const visible = chats.filter((chat) => (filter === 'trash' ? !!chat.deletedAt : !chat.deletedAt && (filter === 'archived' ? chat.archived : !chat.archived)) && (!matchingIds || matchingIds.has(chat.id) || chat.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (sort === 'title' ? a.title.localeCompare(b.title, 'zh-CN') : sort === 'created' ? b.createdAt - a.createdAt : b.updatedAt - a.updatedAt))
  const change = (chat: SimpleChat) => { document.querySelectorAll<HTMLElement>('.chat-row [popover]:popover-open').forEach((el) => el.hidePopover()); void onChange(chat) }
  return <>
    <label className="chat-search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input aria-label="搜索对话" type="search" placeholder="搜索对话与内容" value={search} onChange={(e) => onSearch(e.target.value)}/></label>
    <div className="chat-list-controls"><SimplePopover label="对话范围" button={<><span>{filter === 'archived' ? '已归档' : filter === 'trash' ? '最近删除' : '最近对话'}</span><svg className="control-chevron" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></>}><div className="chat-action-menu">{[['active','最近对话'],['archived','已归档'],['trash','最近删除']].map(([value,label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={(event) => { setFilter(value); event.currentTarget.closest<HTMLElement>('[popover]')?.hidePopover() }}>{label}<span aria-hidden="true">{filter === value ? '✓' : ''}</span></button>)}</div></SimplePopover><SimplePopover label="对话排序" button={<><span>排序</span><svg className="control-chevron" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></>}><div className="chat-action-menu">{[['updated','最近更新'],['created','创建时间'],['title','名称顺序']].map(([value,label]) => <button key={value} type="button" aria-pressed={sort === value} onClick={(e) => { setSort(value); try { localStorage.setItem('gpt-image-chat-sort', value) } catch { /* 保留本次选择。 */ } e.currentTarget.closest<HTMLElement>('[popover]')?.hidePopover() }}>{label}<span>{sort === value ? '✓' : ''}</span></button>)}</div></SimplePopover></div>
    <div className="conversation-list" aria-label="已保存对话">
      {visible.map((chat) => <div key={chat.id} className={`chat-row${chat.id === chatId ? ' is-current' : ''}`}>
        <button type="button" className="chat-select" title={chat.title} aria-current={chatId === chat.id ? 'page' : undefined} disabled={disabled || !!chat.deletedAt} onClick={() => onSelect(chat.id)}><span>{chat.pinned && !chat.deletedAt && <svg className="pin-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-label="已置顶"><path d="m9 3 12 12-4 1-3 3-4-4-6 6m6-6-5-5 3-3 1-4Z"/></svg>}{chat.title}</span>{busyChat === chat.id && <span className="sidebar-busy" aria-label="正在生成"/>}</button>
        <SimplePopover label={`管理对话：${chat.title}`} button={<span aria-hidden="true">•••</span>}><div className="chat-action-menu">{chat.deletedAt ? <button type="button" onClick={() => change({ ...chat, deletedAt: undefined })}>恢复对话</button> : <>
          <button type="button" disabled={disabled || busyChat === chat.id} onClick={(e) => { e.currentTarget.closest<HTMLElement>('[popover]')?.hidePopover(); setTitle(chat.title); setEditing(chat) }}>重命名</button>
          <button type="button" disabled={disabled} onClick={() => change({ ...chat, pinned: !chat.pinned })}>{chat.pinned ? '取消置顶' : '置顶'}</button>
          <button type="button" disabled={disabled || busyChat === chat.id} onClick={() => change({ ...chat, archived: !chat.archived })}>{chat.archived ? '移出归档' : '归档'}</button>
          <button type="button" className="danger-action" disabled={disabled || busyChat === chat.id} onClick={() => change({ ...chat, deletedAt: Date.now() })}>移到最近删除</button>
        </>}</div></SimplePopover>
      </div>)}
      {!visible.length && <p className="sidebar-empty">{search ? '没有找到相关对话' : filter === 'trash' ? '没有已删除对话' : filter === 'archived' ? '没有归档对话' : '还没有对话'}</p>}
    </div>
    <dialog ref={dialog} className="settings-dialog rename-dialog" aria-labelledby="rename-title" onClose={() => setEditing(null)} onClick={(e) => { if (e.target === e.currentTarget) dialog.current?.close() }}><form onSubmit={async (e) => { e.preventDefault(); if (!editing || !title.trim() || saving) return; setSaving(true); try { await onChange({ ...editing, title: title.trim(), renamed: true }); dialog.current?.close() } finally { setSaving(false) } }}><div className="dialog-heading"><h2 id="rename-title">重命名对话</h2><button type="button" className="settings-close text-button" aria-label="关闭重命名" onClick={() => dialog.current?.close()}>×</button></div><input aria-label="对话名称" autoFocus maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} required/><button type="submit" className="settings-done" disabled={!title.trim() || saving}>{saving ? '保存中…' : '保存'}</button></form></dialog>
  </>
}
