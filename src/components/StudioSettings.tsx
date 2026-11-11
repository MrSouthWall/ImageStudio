import { useId, useState, type RefObject } from 'react'
import { SimpleDataBackup } from './SimpleDataBackup'
import { StudioIcon } from './StudioIcon'
import licenseUrl from '../../LICENSE?url'
import noticesUrl from '../assets/third-party-notices.txt?url'
import exampleSourcesUrl from '../assets/examples/SOURCES.json?url'

type SettingsProps = {
  dialog: RefObject<HTMLDialogElement | null>
  apiKey: string
  baseUrl: string
  onConnectionChange: (patch: { apiKey?: string; baseUrl?: string }) => void
  timeout: number
  onTimeoutChange: (value: number) => void
  exchangeRate: number
  onExchangeRateChange: (value: number) => void
  saved: boolean
  busy: boolean
  beforeTransfer: () => Promise<void>
}

export function StudioSettings({ dialog, apiKey, baseUrl, onConnectionChange, timeout, onTimeoutChange, exchangeRate, onExchangeRateChange, saved, busy, beforeTransfer }: SettingsProps) {
  const [section, setSection] = useState<'connection' | 'data'>('connection')
  const [showKey, setShowKey] = useState(false)
  const [backupBusy, setBackupBusy] = useState(false)
  const connectionForm = useId()
  const close = () => { if (!backupBusy) dialog.current?.close() }

  return <dialog ref={dialog} className="settings-dialog studio-settings" aria-labelledby="settings-title" onClose={() => { setShowKey(false); setSection('connection') }} onCancel={(event) => { if (backupBusy) event.preventDefault() }} onClick={(event) => { if (event.target === event.currentTarget) close() }}>
    <div className="dialog-heading settings-heading">
      <div><h2 id="settings-title">工作台设置</h2><p>管理图片服务与浏览器里的创作数据。</p></div>
      <button type="button" className="icon-button settings-close" aria-label="关闭设置" disabled={backupBusy} onClick={close}><StudioIcon name="close"/></button>
    </div>
    <div className="settings-navigation" role="group" aria-label="设置分类">
      <button type="button" disabled={backupBusy} aria-pressed={section === 'connection'} onClick={() => setSection('connection')}><StudioIcon name="plug" size={17}/>接口连接</button>
      <button type="button" disabled={backupBusy} aria-pressed={section === 'data'} onClick={() => setSection('data')}><StudioIcon name="database" size={17}/>本地数据</button>
    </div>
    <div className="settings-body">
      <form id={connectionForm} hidden={section !== 'connection'} onSubmit={(event) => { event.preventDefault(); close() }}>
        <fieldset disabled={busy} className="connection-fields">
          <div className="connection-field">
            <label htmlFor="api-key">API Key</label>
            <div className="key-input"><input id="api-key" type={showKey ? 'text' : 'password'} autoComplete="off" spellCheck={false} placeholder="粘贴你的 API Key" value={apiKey} onChange={(event) => onConnectionChange({ apiKey: event.target.value })}/><button type="button" className="text-button" aria-label={showKey ? '隐藏 API Key' : '显示 API Key'} onClick={() => setShowKey(!showKey)}>{showKey ? '隐藏' : '显示'}</button></div>
            <div className="connection-note"><span>{saved ? '密钥仅保存在当前浏览器，发送请求时交给下方服务。' : '浏览器未保存设置，本次会话仍可使用。'}</span>{apiKey && <button type="button" className="text-button" onClick={() => onConnectionChange({ apiKey: '' })}>清除</button>}</div>
          </div>
          <label className="connection-field"><span>接口地址</span><input type="url" spellCheck={false} autoComplete="off" value={baseUrl} onChange={(event) => onConnectionChange({ baseUrl: event.target.value })} required/><small>可使用 OpenAI 或允许浏览器跨域访问的兼容服务。</small></label>
          <div className="connection-options">
            <label className="connection-field"><span>等待上限（秒）</span><input type="number" min="30" max="3600" value={timeout || ''} onChange={(event) => onTimeoutChange(Number(event.target.value))} required/><small>30–3600 秒</small></label>
            <label className="connection-field"><span>美元换算汇率</span><input type="number" min="0.01" max="1000" step="0.01" value={exchangeRate || ''} onChange={(event) => onExchangeRateChange(Number(event.target.value))} required/><small>仅用于人民币费用预估</small></label>
          </div>
        </fieldset>
      </form>
      <div hidden={section !== 'data'} className="settings-data">
        <SimpleDataBackup disabled={busy} beforeTransfer={beforeTransfer} onBusyChange={setBackupBusy}/>
        <p className="settings-note">对话、原图和草稿保存在此浏览器。连续对话也可能使用服务端保存的上下文。</p>
        <div className="settings-credits"><a href={licenseUrl} download="LICENSE.txt">MIT 许可证</a><a href={noticesUrl} target="_blank" rel="noreferrer">第三方许可</a><a href={exampleSourcesUrl} target="_blank" rel="noreferrer">示例来源</a></div>
      </div>
    </div>
    <div className="settings-footer"><span>{section === 'connection' && (saved ? '设置会自动保存' : '本次会话内生效')}</span>{section === 'connection' ? <button className="primary-button" form={connectionForm} type="submit" disabled={backupBusy}>完成</button> : <button className="primary-button" type="button" disabled={backupBusy} onClick={close}>完成</button>}</div>
  </dialog>
}
