/**
 * The KnowledgeOS main panel: a read-only view of the running DSH Host.
 *
 * All values come from one Host request. Loading, success, failure, and stale
 * data are distinct states; nothing here hardcodes a successful response.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { loadStatus, StatusRequestError, type StatusPayload } from './status-client.ts'

/** One render state of the panel. */
type PanelState =
  | { readonly phase: 'loading'; readonly data?: StatusPayload }
  | { readonly phase: 'ready'; readonly data: StatusPayload }
  | { readonly phase: 'error'; readonly message: string; readonly failedAt: string; readonly data?: StatusPayload }

const PANEL_STYLE = `
.kos-panel { box-sizing: border-box; max-width: 880px; margin: 0 auto; padding: 32px 24px 40px; color: #23333A;
  font-family: "Segoe UI", "Microsoft YaHei UI", "PingFang SC", system-ui, sans-serif; }
.kos-panel *, .kos-panel *::before, .kos-panel *::after { box-sizing: border-box; }
.kos-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
.kos-title { margin: 0; font-size: 24px; line-height: 1.35; font-weight: 600; letter-spacing: .01em; }
.kos-sub { margin: 6px 0 0; color: #66777F; font-size: 14px; line-height: 1.6; }
.kos-chip { flex: none; display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px;
  font-size: 13px; line-height: 1.5; border: 1px solid transparent; white-space: nowrap; }
.kos-chip::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.kos-chip--ok { color: #2F6E5B; background: #EDF6F1; border-color: #CFE6DA; }
.kos-chip--loading { color: #3D7E86; background: #EDF5F6; border-color: #CEE2E4; }
.kos-chip--error { color: #9C4A44; background: #FBEFEE; border-color: #EFD3D0; }
.kos-banner { margin: 0 0 16px; padding: 12px 14px; border-radius: 10px; font-size: 14px; line-height: 1.65; }
.kos-banner--warn { color: #6B4E12; background: #FBF6E8; border: 1px solid #EADCB4; }
.kos-banner--error { color: #873B36; background: #FBEFEE; border: 1px solid #EFD3D0; }
.kos-banner strong { font-weight: 600; }
.kos-banner p { margin: 4px 0 0; }
.kos-card { background: #FFFFFF; border: 1px solid #E2E9EB; border-radius: 12px; padding: 6px 20px; }
.kos-row { display: flex; align-items: baseline; justify-content: space-between; gap: 24px; padding: 12px 0;
  border-bottom: 1px solid #EEF2F3; font-size: 14px; line-height: 1.6; }
.kos-row:last-child { border-bottom: 0; }
.kos-row dt { margin: 0; color: #66777F; flex: none; }
.kos-row dd { margin: 0; text-align: right; word-break: break-all; font-variant-numeric: tabular-nums; }
.kos-mono { font-family: "Cascadia Mono", Consolas, "Courier New", monospace; font-size: 13px; }
.kos-ok { color: #2F6E5B; font-weight: 600; }
.kos-bad { color: #9C4A44; font-weight: 600; }
.kos-unknown { color: #8A6A1F; font-weight: 600; }
.kos-empty { padding: 28px 0; color: #66777F; font-size: 14px; line-height: 1.7; }
.kos-skeleton { height: 14px; width: 42%; border-radius: 7px; background: #EEF2F3; margin: 18px 0; }
.kos-foot { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 20px; }
.kos-note { margin: 0; color: #66777F; font-size: 12px; line-height: 1.6; }
.kos-button { appearance: none; border: 1px solid #3D7E86; border-radius: 8px; background: #3D7E86; color: #FFFFFF;
  padding: 8px 18px; font: inherit; font-size: 14px; line-height: 1.6; cursor: pointer; }
.kos-button:hover { background: #356F76; border-color: #356F76; }
.kos-button:focus-visible { outline: 2px solid #3D7E86; outline-offset: 2px; }
.kos-button:disabled { cursor: progress; opacity: .6; }
.kos-button--ghost { background: transparent; color: #3D7E86; }
.kos-button--ghost:hover { background: #EDF5F6; }
@media (prefers-color-scheme: dark) {
  .kos-panel { color: #E6EEF1; }
  .kos-sub, .kos-note, .kos-row dt, .kos-empty { color: #A7B6BD; }
  .kos-card { background: #202B32; border-color: #2E3D45; }
  .kos-row { border-bottom-color: #2A3840; }
  .kos-chip--ok { background: #1D3129; border-color: #2C4A3C; color: #8FC9AF; }
  .kos-chip--loading { background: #1D2E31; border-color: #2C4448; color: #9CC8CC; }
  .kos-chip--error { background: #352321; border-color: #4C302D; color: #E0A29C; }
  .kos-banner--warn { background: #332B1B; border-color: #4E4227; color: #E2C98D; }
  .kos-banner--error { background: #352321; border-color: #4C302D; color: #E0A29C; }
}
`

function formatTime(value: string): string {
  const time = new Date(value)
  if (Number.isNaN(time.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(time)
}

function shortCommit(value: string): string {
  return value === 'unknown' ? value : value.slice(0, 12)
}

function describeError(error: unknown): string {
  if (error instanceof StatusRequestError) return error.message
  if (error instanceof Error) return error.message
  return String(error)
}

function verificationFace(verified: boolean | null): { className: string; text: string } {
  if (verified === true) return { className: 'kos-ok', text: '与锁定提交一致' }
  if (verified === false) return { className: 'kos-bad', text: '与锁定提交不一致' }
  return { className: 'kos-unknown', text: 'Host 未记录构建提交，无法核验' }
}

/**
 * Render the KnowledgeOS status panel and refresh it on demand.
 * @returns the panel element.
 */
export function KnowledgeOsPanel(): JSX.Element {
  const [state, setState] = useState<PanelState>({ phase: 'loading' })
  const requestId = useRef(0)
  const activeController = useRef<AbortController | null>(null)

  const refresh = useCallback((): void => {
    activeController.current?.abort()
    const controller = new AbortController()
    activeController.current = controller
    const id = ++requestId.current
    setState(previous => previous.phase === 'loading'
      ? previous
      : { phase: 'loading', data: previous.data })
    void loadStatus(controller.signal).then((data) => {
      if (id !== requestId.current) return
      setState({ phase: 'ready', data })
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      if (id !== requestId.current) return
      setState(previous => ({
        phase: 'error',
        message: describeError(error),
        failedAt: new Date().toISOString(),
        data: previous.data,
      }))
    })
  }, [])

  useEffect(() => {
    refresh()
    return () => { activeController.current?.abort() }
  }, [refresh])

  const data = state.data
  const phase = state.phase
  const chipClass = phase === 'ready' ? 'kos-chip--ok' : phase === 'error' ? 'kos-chip--error' : 'kos-chip--loading'
  const chipText = phase === 'ready'
    ? '已连接'
    : phase === 'error'
      ? '连接失败'
      : data === undefined ? '连接中' : '刷新中'
  // Loading must not read as a failure: it either has no result yet or is
  // refreshing the last successful result without changing its validity.
  const connectionText = phase === 'ready'
    ? '已连接本机 Host'
    : phase === 'loading'
      ? data === undefined ? '正在连接本机 Host…' : '正在刷新 · 显示上次结果'
      : data === undefined ? '连接失败' : '旧数据（连接失败）'
  const verified = data === undefined ? null : data.upstream_commit_verified
  const verification = verificationFace(verified)
  const stale = state.phase === 'error' && state.data !== undefined

  return (
    <section className="kos-panel" data-testid="knowledgeos-panel" data-state={phase}>
      <style>{PANEL_STYLE}</style>
      <header className="kos-head">
        <div>
          <h1 className="kos-title" id="kos-title">KnowledgeOS</h1>
          <p className="kos-sub">本机 DSH 运行状态 · 只读查询 · 不读取会话与账户数据</p>
        </div>
        <span className={`kos-chip ${chipClass}`} role="status" aria-live="polite" data-testid="kos-status">{chipText}</span>
      </header>

      {phase === 'error' ? (
        <div className="kos-banner kos-banner--error" role="alert" data-testid="kos-error">
          <strong>无法读取 Host 运行状态。</strong>
          <p>{state.message}</p>
          <p>失败时间：{formatTime(state.failedAt)}</p>
          {stale ? <p>下方为上次成功获取的数据，<strong>已失去实时性</strong>。</p> : null}
          <p><button type="button" className="kos-button" onClick={refresh} data-testid="kos-error-retry">重试</button></p>
        </div>
      ) : null}

      {stale ? <p className="kos-note" data-testid="kos-stale">状态：旧数据 · 等待重新连接</p> : null}

      {verified === false ? (
        <div className="kos-banner kos-banner--warn" role="status" data-testid="kos-mismatch">
          <strong>构建信息不匹配。</strong>
          <p>运行中的 Host 提交 {shortCommit(data?.upstream_commit ?? '')} 与本项目锁定的提交 {shortCommit(data?.expected_upstream_commit ?? '')} 不一致，本次运行不能作为固定版本的验收证据。</p>
        </div>
      ) : null}

      {verified === null && data !== undefined ? (
        <div className="kos-banner kos-banner--warn" role="status" data-testid="kos-unknown-commit">
          <strong>Host 未报告构建提交。</strong>
          <p>当前只能确认版本号，无法核验是否与锁定提交一致。</p>
        </div>
      ) : null}

      {phase === 'loading' && data !== undefined ? (
        <p className="kos-note" role="status" data-testid="kos-refreshing">正在刷新，以下为上次成功结果，尚不能视为当前连接状态。</p>
      ) : null}

      <div className="kos-card">
        {data === undefined ? (
          phase === 'loading'
            ? <div className="kos-empty" data-testid="kos-loading">正在通过 Host 服务读取运行状态…<div className="kos-skeleton" /></div>
            : <div className="kos-empty">尚无可用状态数据。请点击重试。</div>
        ) : (
          <dl>
            <div className="kos-row"><dt>连接状态</dt><dd data-testid="kos-connection">{connectionText}</dd></div>
            <div className="kos-row"><dt>DSH 版本</dt><dd className="kos-mono" data-testid="kos-version">{data.upstream_version}</dd></div>
            <div className="kos-row"><dt>上游提交</dt><dd className="kos-mono" data-testid="kos-commit">{shortCommit(data.upstream_commit)}</dd></div>
            <div className="kos-row"><dt>提交校验</dt><dd className={verification.className} data-testid="kos-verified">{verification.text}</dd></div>
            <div className="kos-row"><dt>主机实例</dt><dd className="kos-mono" data-testid="kos-instance">{data.host_instance_id}</dd></div>
            <div className="kos-row"><dt>实例启动</dt><dd data-testid="kos-started-at">{formatTime(data.started_at)}</dd></div>
            <div className="kos-row"><dt>本次查询</dt><dd data-testid="kos-checked-at" data-checked-at={data.checked_at}>{formatTime(data.checked_at)}</dd></div>
          </dl>
        )}
      </div>

      <footer className="kos-foot">
        <p className="kos-note">数据来自本机 DSH Host 插件；仅包含版本、提交、实例与时间等运行元数据。<br /><a href="/knowledgeos/account" style={{ color: '#3D7E86' }}>打开账号与个人空间</a></p>
        <button type="button" className="kos-button kos-button--ghost" onClick={refresh} disabled={phase === 'loading'} data-testid="kos-refresh">
          {phase === 'error' ? '重新连接' : '刷新'}
        </button>
      </footer>
    </section>
  )
}
