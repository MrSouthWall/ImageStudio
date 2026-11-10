import { useRef, useState } from 'react'
import { exportSimpleBackup, prepareSimpleBackup, restoreSimpleBackup, type PreparedBackup } from '../lib/simpleBackup'
import { saveFile } from '../lib/saveFile'
import { formatExportFileTime } from '../lib/exportFileName'

export function SimpleDataBackup({ disabled, beforeTransfer, onBusyChange }: { disabled: boolean; beforeTransfer: () => Promise<void>; onBusyChange: (busy: boolean) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [includeKey, setIncludeKey] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const [prepared, setPrepared] = useState<PreparedBackup | null>(null)
  const lock = (value: boolean) => { setPending(value); onBusyChange(value) }
  async function run(action: () => Promise<void>) {
    lock(true); setMessage(''); setFailed(false)
    try { await beforeTransfer(); await action() }
    catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : '操作失败，请重试。') }
    finally { lock(false) }
  }
  return <section className="data-backup" aria-label="数据备份">
    <h3>数据备份</h3><p className="backup-scope">仅备份本地数据，不含服务端临时文件。单份上限 1 GB。</p>
    <label className="backup-key-option"><input type="checkbox" checked={includeKey} disabled={disabled || pending} onChange={(e) => setIncludeKey(e.target.checked)}/>导出时包含 API Key{includeKey && <span>备份未加密</span>}</label>
    <div className="backup-buttons"><button type="button" disabled={disabled || pending} onClick={() => void run(async () => {
      setPrepared(null)
      const zip = await exportSimpleBackup(includeKey, (count) => setMessage(`正在备份图片 ${count}…`))
      saveFile(zip, `图作间-完整备份-${formatExportFileTime(new Date())}.zip`)
      setMessage('完整备份已导出。')
    })}>导出完整备份</button><button type="button" disabled={disabled || pending} onClick={() => input.current?.click()}>导入备份</button></div>
    <input ref={input} type="file" accept=".zip,application/zip" hidden onChange={(e) => {
      const file = e.target.files?.[0]; e.target.value = ''; if (!file) return
      setPrepared(null)
      void run(async () => { setMessage('正在校验备份…'); const data = await prepareSimpleBackup(file); setPrepared(data); setMessage('') })
    }}/>
    {prepared && <div className="backup-confirm"><p>{prepared.manifest.stores.chats.length} 个对话 · {prepared.manifest.stores.records.length} 条消息 · {prepared.manifest.assets.length} 个图片资源</p><p>将替换当前浏览器的对话、图片、草稿和设置。请先导出当前数据；导入后页面会重新加载。</p>{!prepared.manifest.includeApiKey && <p>备份不含 API Key；接口地址相同时保留本机密钥。</p>}<div className="backup-buttons"><button type="button" disabled={pending || disabled} onClick={() => setPrepared(null)}>取消</button><button type="button" disabled={pending || disabled} onClick={() => void run(async () => { setMessage('正在恢复数据…'); await restoreSimpleBackup(prepared); window.location.reload() })}>确认替换并恢复</button></div></div>}
    {message && <p className={failed ? 'error-message' : 'backup-status'} role={failed ? 'alert' : 'status'}>{message}</p>}
  </section>
}
