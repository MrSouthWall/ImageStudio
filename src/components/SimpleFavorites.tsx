import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { SimpleAttachment, SimpleFavorite } from '../lib/simpleHistory'
import { SimpleStoredImage, type ImageProps } from './SimpleStoredImage'
import { StudioIcon } from './StudioIcon'

type FavoriteActions = {
  onEnlarge: ImageProps['onEnlarge']
  onError: ImageProps['onError']
  onUpdate: (id: string, title: string, prompt: string) => Promise<void>
  onRemove: (id: string) => Promise<void>
}

type Props = FavoriteActions & {
  items: SimpleFavorite[]
  locked: boolean
  wouldReplaceInput: (item: SimpleFavorite) => boolean
  onUse: (item: SimpleFavorite, fresh: boolean) => Promise<void>
}

function FavoriteImages({ files, onEnlarge, onError }: Pick<FavoriteActions, 'onEnlarge' | 'onError'> & { files: SimpleAttachment[] }) {
  return <div className="favorite-images">{files.map((file, index) => <SimpleStoredImage
    key={`${file.id}-${index}`} asset={file.dataUrl} label={file.name} filename={file.name} thumbnail busy={false}
    onEnlarge={onEnlarge} onError={onError}/>)}</div>
}

function FavoriteDetails({ item, onClose, onEnlarge, onError, onUpdate, onRemove }: FavoriteActions & { item: SimpleFavorite; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [title, setTitle] = useState(item.title)
  const [prompt, setPrompt] = useState(item.prompt)
  const [removing, setRemoving] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const changed = title.trim() !== item.title || prompt !== item.prompt
  useEffect(() => { dialog.current?.showModal() }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || !removing && !changed) return
    setPending(true)
    setError('')
    try {
      if (removing) await onRemove(item.id)
      else await onUpdate(item.id, title, prompt)
      dialog.current?.close()
    } catch (err) {
      setError(err instanceof Error && !(err instanceof DOMException) ? err.message : '收藏更新失败，请重试。')
    } finally { setPending(false) }
  }

  return <dialog ref={dialog} className="settings-dialog favorite-details" aria-labelledby="favorite-details-title"
    onClose={onClose} onCancel={(event) => { if (pending) event.preventDefault() }}>
    <div className="dialog-heading"><h2 id="favorite-details-title">收藏详情</h2>
      <button className="icon-button settings-close" type="button" aria-label="关闭收藏详情" disabled={pending} onClick={() => dialog.current?.close()}><StudioIcon name="close"/></button>
    </div>
    <form className="favorite-form" onSubmit={(event) => void submit(event)}>
      <label>名称<input value={title} onChange={(event) => setTitle(event.target.value)} disabled={pending || removing}/></label>
      <label>提示词<textarea value={prompt} rows={6} onChange={(event) => setPrompt(event.target.value)} disabled={pending || removing}/></label>
      {!!item.attachments.length && <div className="favorite-image-field"><p>{item.attachments.length} 张参考图</p><FavoriteImages files={item.attachments} onEnlarge={onEnlarge} onError={onError}/></div>}
      {removing && <p className="favorite-remove-confirm">确定移除这条收藏？</p>}
      {error && <p className="error-message" role="alert">{error}</p>}
      <div className="favorite-dialog-actions">
        {!removing && <button className="text-button favorite-remove" type="button" disabled={pending} onClick={() => { setError(''); setRemoving(true) }}><StudioIcon name="trash" size={16}/>移除收藏</button>}
        <button className="secondary-button" type="button" disabled={pending} onClick={() => {
          if (removing) { setError(''); setRemoving(false) }
          else dialog.current?.close()
        }}>取消</button>
        <button className={removing ? 'danger-button' : 'primary-button'} type="submit" disabled={pending || !removing && (!changed || !title.trim() || !prompt.trim() && !item.attachments.length)}>{removing ? '确认移除' : '保存修改'}</button>
      </div>
    </form>
  </dialog>
}

export function SimpleFavorites({ items, locked, wouldReplaceInput, onUse, onEnlarge, onError, onUpdate, onRemove }: Props) {
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(36)
  const [details, setDetails] = useState<SimpleFavorite | null>(null)
  const [selected, setSelected] = useState<SimpleFavorite | null>(null)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')
  const useDialog = useRef<HTMLDialogElement>(null)
  const freshButton = useRef<HTMLButtonElement>(null)
  const replacesInput = selected && wouldReplaceInput(selected)
  const query = search.trim().toLocaleLowerCase()
  const visible = query ? items.filter((item) => [item.title, item.prompt, ...item.attachments.map((file) => file.name)].some((text) => text.toLocaleLowerCase().includes(query))) : items

  useEffect(() => {
    if (!selected) return
    useDialog.current?.showModal()
    freshButton.current?.focus()
  }, [selected])

  async function apply(item: SimpleFavorite, fresh = false) {
    if (applying || locked) return
    setApplying(true)
    setError('')
    try {
      await onUse(item, fresh)
      useDialog.current?.close()
    } catch (err) {
      setError(err instanceof Error && !(err instanceof DOMException) ? err.message : '收藏读取失败，请重试。')
    } finally { setApplying(false) }
  }

  function select(item: SimpleFavorite) {
    setError('')
    if (item.prompt.trim()) setSelected(item)
    else void apply(item)
  }

  return <div className="workspace-pane favorites-pane">
    <div className="workspace-frame">
      <header className="index-heading favorites-heading">
        <h1>收藏</h1>
        {!!items.length && <label className="favorite-search"><StudioIcon name="search" size={18}/><input type="search" aria-label="搜索收藏" placeholder="搜索收藏" value={search} onChange={(event) => { setSearch(event.target.value); setLimit(36) }}/></label>}
      </header>
      {error && !selected && <p className="error-message" role="alert">{error}</p>}
      {visible.length ? <div className="favorites-grid">
        {visible.slice(0, limit).map((item) => {
          const prompt = item.prompt.trim()
          const [firstLine, ...rest] = prompt.split(/\r?\n/)
          const summary = firstLine.trim() === item.title ? rest.join('\n').trim() : prompt
          return <article className="favorite-card" key={item.id}>
            <h2><button className="favorite-title" type="button" title={item.title} onClick={() => setDetails(item)}><span>{item.title}</span><StudioIcon name="chevronRight" size={16}/></button></h2>
            {summary && <p className="favorite-summary">{summary}</p>}
            {!!item.attachments.length && <FavoriteImages files={item.attachments.slice(0, 3)} onEnlarge={onEnlarge} onError={onError}/>}
            <div className="favorite-card-actions">
              {!!item.attachments.length && <span>{item.attachments.length} 张参考图</span>}
              <button className="secondary-button" type="button" disabled={applying || locked} onClick={() => select(item)}>
                {prompt ? '使用' : '添加参考图'}<StudioIcon name="arrowRight" size={16}/>
              </button>
            </div>
          </article>
        })}
      </div> : <div className="favorites-empty">
        <StudioIcon name={query ? 'search' : 'bookmark'} size={28}/>
        <h2>{query ? '没有找到相关收藏' : '还没有收藏'}</h2>
        <p>{query ? '试试其他关键词。' : '在输入框、对话或图库里收藏常用的提示词和参考图。'}</p>
      </div>}
      {visible.length > limit && <button type="button" className="secondary-button load-history" onClick={() => setLimit((current) => current + 36)}>加载更多</button>}
    </div>
    {details && <FavoriteDetails item={details} onClose={() => setDetails(null)} onEnlarge={onEnlarge} onError={onError} onUpdate={onUpdate} onRemove={onRemove}/>}
    {selected && <dialog ref={useDialog} className="settings-dialog" aria-labelledby="favorite-use-title"
      onClose={() => { setSelected(null); setError('') }} onCancel={(event) => { if (applying) event.preventDefault() }}>
      <div className="dialog-heading">
        <div><h2 id="favorite-use-title">在哪里使用收藏？</h2>{replacesInput && <p>当前输入已有内容。在新创作中使用可以保留这份草稿。</p>}</div>
        <button className="icon-button settings-close" type="button" aria-label="取消使用收藏" disabled={applying} onClick={() => useDialog.current?.close()}><StudioIcon name="close"/></button>
      </div>
      {error && <p className="error-message" role="alert">{error}</p>}
      <div className="favorite-dialog-actions">
        <button className="secondary-button" type="button" disabled={applying || locked} onClick={() => void apply(selected)}>{replacesInput ? '替换当前输入' : '填入当前输入框'}</button>
        <button ref={freshButton} className="primary-button" type="button" disabled={applying || locked} onClick={() => void apply(selected, true)}>在新创作中使用</button>
      </div>
    </dialog>}
  </div>
}
