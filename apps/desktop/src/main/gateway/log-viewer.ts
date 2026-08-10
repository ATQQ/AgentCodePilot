import { createServer, IncomingMessage, ServerResponse, Server } from 'http'
import { shell } from 'electron'
import {
  getGatewayLogsDir,
  listGatewayLogSummaries,
  listLogFacetValues,
  readRequestLog,
  type ListGatewayLogsQuery
} from './request-log'
import { loadGatewaySettings, updateGatewaySettings } from './settings-store'

let viewerServer: Server | null = null
let viewerPort = 3457

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store'
  })
  res.end(JSON.stringify(data))
}

function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store'
  })
  res.end(html)
}

function parseQuery(url: string): URLSearchParams {
  try {
    return new URL(url, 'http://127.0.0.1').searchParams
  } catch {
    return new URLSearchParams()
  }
}

function buildListQuery(params: URLSearchParams): ListGatewayLogsQuery {
  return {
    q: params.get('q') || undefined,
    session: params.get('session') || undefined,
    conversation: params.get('conversation') || undefined,
    project: params.get('project') || undefined,
    workspace: params.get('workspace') || undefined,
    cwd: params.get('cwd') || undefined,
    status: params.get('status') || undefined,
    protocol: params.get('protocol') || undefined,
    days: params.get('days') ? Number(params.get('days')) : undefined,
    limit: params.get('limit') ? Number(params.get('limit')) : undefined
  }
}

async function handleViewerRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const rawUrl = req.url || '/'
  const path = rawUrl.split('?')[0] || '/'
  const params = parseQuery(rawUrl)

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    })
    res.end()
    return
  }

  if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
    sendHtml(res, VIEWER_HTML)
    return
  }

  if (req.method === 'GET' && path === '/api/health') {
    sendJson(res, 200, {
      ok: true,
      logsDir: getGatewayLogsDir(),
      loggingEnabled: Boolean(loadGatewaySettings().logging?.enabled)
    })
    return
  }

  if (req.method === 'GET' && path === '/api/logs') {
    sendJson(res, 200, {
      items: listGatewayLogSummaries(buildListQuery(params)),
      logsDir: getGatewayLogsDir()
    })
    return
  }

  if (req.method === 'GET' && path.startsWith('/api/logs/')) {
    const id = decodeURIComponent(path.slice('/api/logs/'.length))
    const detail = readRequestLog(id)
    if (!detail) {
      sendJson(res, 404, { error: 'not found' })
      return
    }
    sendJson(res, 200, detail)
    return
  }

  if (req.method === 'GET' && path === '/api/facets') {
    sendJson(res, 200, {
      sessions: listLogFacetValues('sessionId'),
      conversations: listLogFacetValues('conversationId'),
      projects: listLogFacetValues('projectId'),
      workspaces: listLogFacetValues('workspaceId'),
      cwds: listLogFacetValues('cwd')
    })
    return
  }

  sendJson(res, 404, { error: 'not found' })
}

export function getLogViewerUrl(): string {
  return `http://127.0.0.1:${viewerPort}`
}

export function isLogViewerRunning(): boolean {
  return viewerServer !== null
}

export function startLogViewer(options?: { port?: number; openBrowser?: boolean }): {
  port: number
  url: string
} {
  const settings = loadGatewaySettings()
  viewerPort = options?.port ?? settings.logging?.viewerPort ?? 3457

  if (viewerServer) {
    const url = getLogViewerUrl()
    if (options?.openBrowser) void shell.openExternal(url)
    return { port: viewerPort, url }
  }

  viewerServer = createServer((req, res) => {
    handleViewerRequest(req, res).catch((err) => {
      console.error('[GatewayLogViewer] error:', err)
      if (!res.headersSent) sendJson(res, 500, { error: 'internal error' })
    })
  })

  viewerServer.once('error', (err: NodeJS.ErrnoException) => {
    const code = err.code || 'UNKNOWN'
    console.error(
      `[GatewayLogViewer] failed to bind 127.0.0.1:${viewerPort} (${code}): ${err.message}`
    )
    viewerServer?.close()
    viewerServer = null
  })

  viewerServer.listen(viewerPort, '127.0.0.1', () => {
    console.log(`[GatewayLogViewer] http://127.0.0.1:${viewerPort}`)
  })

  updateGatewaySettings({
    logging: {
      ...settings.logging,
      enabled: settings.logging?.enabled ?? false,
      viewerPort,
      openBrowser: settings.logging?.openBrowser ?? true
    }
  })

  const url = getLogViewerUrl()
  const shouldOpen = options?.openBrowser ?? settings.logging?.openBrowser ?? true
  if (shouldOpen) {
    // Only open if listen likely succeeded; error handler clears viewerServer async.
    setTimeout(() => {
      if (viewerServer && shouldOpen) void shell.openExternal(url)
    }, 50)
  }
  return { port: viewerPort, url }
}

export function stopLogViewer(): void {
  if (viewerServer) {
    viewerServer.close()
    viewerServer = null
    console.log('[GatewayLogViewer] stopped')
  }
}

export function syncLogViewerWithSettings(): { port: number; url: string; running: boolean } {
  const settings = loadGatewaySettings()
  if (settings.logging?.enabled) {
    const result = startLogViewer({
      port: settings.logging.viewerPort,
      openBrowser: false
    })
    return { ...result, running: true }
  }
  stopLogViewer()
  return {
    port: settings.logging?.viewerPort ?? 3457,
    url: `http://127.0.0.1:${settings.logging?.viewerPort ?? 3457}`,
    running: false
  }
}

const VIEWER_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Agent Desktop · Gateway Logs</title>
  <style>
    :root {
      --bg: #0f1419;
      --panel: #171d25;
      --border: #2a3441;
      --text: #e7ecf3;
      --muted: #93a0b0;
      --accent: #3d8bfd;
      --ok: #3dd68c;
      --err: #ff6b6b;
      --run: #f0b429;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
      background: radial-gradient(1200px 600px at 10% -10%, #1a2740 0%, var(--bg) 55%);
      color: var(--text);
      min-height: 100vh;
    }
    header {
      padding: 20px 24px 12px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: end;
      flex-wrap: wrap;
    }
    h1 { margin: 0; font-size: 20px; font-weight: 650; letter-spacing: 0.2px; }
    .sub { color: var(--muted); font-size: 12px; margin-top: 6px; }
    .layout { display: grid; grid-template-columns: 1.2fr 1fr; gap: 12px; padding: 12px 24px 24px; }
    @media (max-width: 980px) { .layout { grid-template-columns: 1fr; } }
    .panel {
      background: color-mix(in srgb, var(--panel) 92%, black);
      border: 1px solid var(--border);
      border-radius: 14px;
      overflow: hidden;
      min-height: 70vh;
    }
    .filters {
      display: grid;
      grid-template-columns: 2fr repeat(4, 1fr) auto;
      gap: 8px;
      padding: 12px;
      border-bottom: 1px solid var(--border);
    }
    @media (max-width: 1100px) { .filters { grid-template-columns: 1fr 1fr; } }
    input, select, button {
      background: #0d1218;
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 8px 10px;
      font-size: 13px;
    }
    button {
      background: var(--accent);
      border-color: transparent;
      cursor: pointer;
      font-weight: 600;
    }
    button.secondary { background: #243041; }
    .list { max-height: calc(100vh - 180px); overflow: auto; }
    .item {
      padding: 12px 14px;
      border-bottom: 1px solid var(--border);
      cursor: pointer;
    }
    .item:hover, .item.active { background: #1d2734; }
    .row { display: flex; justify-content: space-between; gap: 10px; align-items: center; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
    .muted { color: var(--muted); }
    .badge {
      display: inline-flex; align-items: center; gap: 6px;
      border-radius: 999px; padding: 2px 8px; font-size: 11px; font-weight: 650;
      border: 1px solid var(--border);
    }
    .badge.ok { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 40%, var(--border)); }
    .badge.error { color: var(--err); border-color: color-mix(in srgb, var(--err) 40%, var(--border)); }
    .badge.running { color: var(--run); border-color: color-mix(in srgb, var(--run) 40%, var(--border)); }
    .badge.pass { color: #7dd3fc; border-color: color-mix(in srgb, #7dd3fc 40%, var(--border)); }
    .badge.unified { color: #fbbf24; border-color: color-mix(in srgb, #fbbf24 40%, var(--border)); }
    .chain {
      display: grid;
      grid-template-columns: 1fr auto 1fr auto 1fr;
      gap: 8px;
      align-items: center;
      margin: 12px 0 16px;
      padding: 12px;
      background: #121821;
      border: 1px solid var(--border);
      border-radius: 12px;
      font-size: 12px;
    }
    .chain .node {
      background: #0d1218;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px;
      min-height: 64px;
    }
    .chain .arrow { color: var(--muted); text-align: center; font-size: 18px; }
    .chain .label { color: var(--muted); margin-bottom: 4px; }
    .event.intercept { border-left-color: #7dd3fc; }
    .event.passthrough, .event.pipe, .event.pipe_done { border-left-color: #38bdf8; }
    .event.upstream, .event.upstream_status { border-left-color: #a78bfa; }
    .preview { margin-top: 6px; color: var(--muted); font-size: 12px; line-height: 1.4; }
    .detail { padding: 14px; overflow: auto; max-height: calc(100vh - 120px); }
    .kv { display: grid; grid-template-columns: 120px 1fr; gap: 6px 10px; margin: 10px 0 16px; font-size: 13px; }
    .kv div:nth-child(odd) { color: var(--muted); }
    .events { display: flex; flex-direction: column; gap: 8px; }
    .event {
      border-left: 3px solid var(--border);
      padding: 8px 10px;
      background: #121821;
      border-radius: 0 10px 10px 0;
    }
    pre {
      white-space: pre-wrap;
      word-break: break-word;
      background: #0d1218;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px;
      font-size: 12px;
      max-height: 48vh;
      overflow: auto;
    }
    .empty { padding: 28px; color: var(--muted); text-align: center; }
    .section-title { margin: 16px 0 8px; font-size: 14px; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Gateway 过程日志</h1>
      <div class="sub" id="meta">加载中…</div>
    </div>
    <div style="display:flex; gap:8px;">
      <button class="secondary" id="refreshBtn">刷新</button>
      <button id="autoBtn">自动刷新: 开</button>
    </div>
  </header>
  <div class="layout">
    <section class="panel">
      <div class="filters">
        <input id="q" placeholder="关键词：模型 / session / project / 错误 / 预览" />
        <input id="session" placeholder="session" list="sessionList" />
        <input id="project" placeholder="project" list="projectList" />
        <input id="workspace" placeholder="workspace" list="workspaceList" />
        <input id="cwd" placeholder="cwd / 工作区路径" list="cwdList" />
        <button id="searchBtn">检索</button>
      </div>
      <datalist id="sessionList"></datalist>
      <datalist id="projectList"></datalist>
      <datalist id="workspaceList"></datalist>
      <datalist id="cwdList"></datalist>
      <div class="filters" style="grid-template-columns: repeat(4, 1fr);">
        <select id="status">
          <option value="">全部状态</option>
          <option value="ok">ok</option>
          <option value="error">error</option>
          <option value="running">running</option>
        </select>
        <select id="protocol">
          <option value="">全部协议</option>
          <option value="chat">chat</option>
          <option value="messages">messages</option>
          <option value="responses">responses</option>
          <option value="models">models</option>
        </select>
        <select id="days">
          <option value="1">近 1 天</option>
          <option value="3">近 3 天</option>
          <option value="7" selected>近 7 天</option>
          <option value="14">近 14 天</option>
        </select>
        <input id="conversation" placeholder="conversation id" />
      </div>
      <div class="list" id="list"><div class="empty">暂无日志。开启网关日志后，接口调用会显示在这里。</div></div>
    </section>
    <section class="panel">
      <div class="detail" id="detail"><div class="empty">选择左侧一条请求查看过程</div></div>
    </section>
  </div>
  <script>
    let auto = true;
    let selectedId = null;
    let selectedDetailKey = '';
    let timer = null;

    function val(id) { return document.getElementById(id).value.trim(); }

    function qs() {
      const p = new URLSearchParams();
      for (const [k, id] of [
        ['q','q'],['session','session'],['project','project'],['workspace','workspace'],
        ['cwd','cwd'],['status','status'],['protocol','protocol'],['days','days'],
        ['conversation','conversation']
      ]) {
        const v = val(id);
        if (v) p.set(k, v);
      }
      p.set('limit', '300');
      return p.toString();
    }

    function badge(status) {
      return '<span class="badge ' + status + '">' + status + '</span>';
    }

    function modeBadge(mode) {
      if (mode === 'passthrough') return '<span class="badge pass">透传</span>';
      if (mode === 'unified') return '<span class="badge unified">重建</span>';
      if (mode === 'convert') return '<span class="badge unified">转换</span>';
      return '';
    }

    function formatBytes(n) {
      if (n == null || Number.isNaN(n)) return '-';
      if (n < 1024) return n + ' B';
      if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
      return (n / (1024 * 1024)).toFixed(2) + ' MB';
    }

    function interceptChain(d) {
      const ix = d.intercept || {};
      const mode = d.proxyMode || ix.mode;
      if (!mode) return '';
      return '<h3 class="section-title">拦截链路</h3>' +
        '<div class="chain">' +
          '<div class="node"><div class="label">① 客户端 → 网关</div><div class="mono">' +
            escapeHtml(d.method + ' ' + d.path) + '<br/>入站 ' + formatBytes(ix.inboundBytes) +
          '</div></div>' +
          '<div class="arrow">→</div>' +
          '<div class="node"><div class="label">② 网关拦截</div><div class="mono">' +
            escapeHtml(
              mode === 'passthrough'
                ? '原样透传'
                : mode === 'convert'
                  ? 'Responses↔Chat 转换'
                  : 'UnifiedTurn 重建'
            ) +
            '<br/>改写: ' + escapeHtml((ix.rewritten || []).join(', ') || '-') +
          '</div></div>' +
          '<div class="arrow">→</div>' +
          '<div class="node"><div class="label">③ 网关 → 上游</div><div class="mono">' +
            escapeHtml(d.upstreamHost || '-') + '<br/>上游 ' + formatBytes(ix.upstreamBytes) +
            (ix.responseBytes != null ? (' · 回传 ' + formatBytes(ix.responseBytes)) : '') +
          '</div></div>' +
        '</div>' +
        (ix.note ? ('<div class="preview" style="margin-top:-8px;margin-bottom:12px">' + escapeHtml(ix.note) + '</div>') : '');
    }

    async function loadFacets() {
      const res = await fetch('/api/facets');
      const data = await res.json();
      fillList('sessionList', data.sessions || []);
      fillList('projectList', data.projects || []);
      fillList('workspaceList', data.workspaces || []);
      fillList('cwdList', data.cwds || []);
    }

    function fillList(id, values) {
      const el = document.getElementById(id);
      el.innerHTML = values.map(v => '<option value="' + escapeHtml(v) + '"></option>').join('');
    }

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    function prettyJson(value) {
      if (value == null) return '';
      if (typeof value === 'string') return value;
      try { return JSON.stringify(value, null, 2); } catch { return String(value); }
    }

    function jsonBlock(title, value) {
      if (value == null || value === '') return '';
      return '<h3 class="section-title">' + escapeHtml(title) + '</h3><pre>' + escapeHtml(prettyJson(value)) + '</pre>';
    }

    function detailFingerprint(d) {
      return [
        d.id,
        d.status,
        d.endedAt || '',
        d.latencyMs ?? '',
        d.error || '',
        d.proxyMode || '',
        (d.intercept && d.intercept.responseBytes) || '',
        (d.events && d.events.length) || 0,
        d.responseBody != null ? '1' : '0',
        d.requestBody != null ? '1' : '0',
        d.upstreamRequest != null ? '1' : '0',
        d.requestHeaders ? Object.keys(d.requestHeaders).length : 0,
        d.upstreamResponseHeaders ? Object.keys(d.upstreamResponseHeaders).length : 0
      ].join('|');
    }

    async function loadList(opts) {
      const preserveScroll = Boolean(opts && opts.preserveScroll);
      const list = document.getElementById('list');
      const scrollTop = preserveScroll ? list.scrollTop : 0;
      const res = await fetch('/api/logs?' + qs());
      const data = await res.json();
      document.getElementById('meta').textContent =
        '目录: ' + (data.logsDir || '') + ' · ' + (data.items?.length || 0) + ' 条';
      if (!data.items?.length) {
        list.innerHTML = '<div class="empty">没有匹配的日志</div>';
        return data.items || [];
      }
      list.innerHTML = data.items.map(item => {
        const active = item.id === selectedId ? ' active' : '';
        return '<div class="item' + active + '" data-id="' + escapeHtml(item.id) + '">' +
          '<div class="row">' +
            '<div class="mono">' + escapeHtml(item.protocol) + ' · ' + escapeHtml(item.model || '-') + '</div>' +
            '<div style="display:flex;gap:6px;align-items:center">' + modeBadge(item.proxyMode) + badge(item.status) + '</div>' +
          '</div>' +
          '<div class="row" style="margin-top:6px">' +
            '<div class="muted mono">' + escapeHtml(item.startedAt) +
              (item.latencyMs != null ? (' · ' + item.latencyMs + 'ms') : '') + '</div>' +
            '<div class="muted mono">' + escapeHtml(item.providerId || '') + '</div>' +
          '</div>' +
          '<div class="preview">' +
            escapeHtml([item.sessionId && ('session=' + item.sessionId), item.projectId && ('project=' + item.projectId), item.workspaceId && ('workspace=' + item.workspaceId), item.cwd].filter(Boolean).join(' · ') || item.path) +
          '</div>' +
          (item.promptPreview ? ('<div class="preview">' + escapeHtml(item.promptPreview) + '</div>') : '') +
        '</div>';
      }).join('');
      list.querySelectorAll('.item').forEach(el => {
        el.addEventListener('click', () => {
          selectedId = el.getAttribute('data-id');
          selectedDetailKey = '';
          loadDetail(selectedId, { force: true });
          loadList({ preserveScroll: true });
        });
      });
      if (preserveScroll) list.scrollTop = scrollTop;
      return data.items;
    }

    async function loadDetail(id, opts) {
      const force = Boolean(opts && opts.force);
      const soft = Boolean(opts && opts.soft);
      const detail = document.getElementById('detail');
      const scrollTop = soft ? detail.scrollTop : 0;
      const res = await fetch('/api/logs/' + encodeURIComponent(id));
      if (!res.ok) {
        if (force) detail.innerHTML = '<div class="empty">未找到详情</div>';
        return;
      }
      const d = await res.json();
      const key = detailFingerprint(d);
      // Auto-refresh: don't rebuild DOM (and reset scroll) if nothing meaningful changed.
      if (!force && soft && key === selectedDetailKey) return;
      selectedDetailKey = key;
      const tags = d.tags || {};
      detail.innerHTML =
        '<div class="row"><strong class="mono">' + escapeHtml(d.id) + '</strong>' +
          '<div style="display:flex;gap:6px">' + modeBadge(d.proxyMode || (d.intercept && d.intercept.mode)) + badge(d.status) + '</div></div>' +
        '<div class="kv">' +
          '<div>时间</div><div class="mono">' + escapeHtml(d.startedAt) + (d.endedAt ? (' → ' + escapeHtml(d.endedAt)) : '') + '</div>' +
          '<div>接口</div><div class="mono">' + escapeHtml(d.method + ' ' + d.path) + '</div>' +
          '<div>模式</div><div class="mono">' + escapeHtml((d.proxyMode || (d.intercept && d.intercept.mode) || '-')) + '</div>' +
          '<div>模型</div><div class="mono">' + escapeHtml((d.model || '-') + ' → ' + (d.upstreamModel || '-')) + '</div>' +
          '<div>Provider</div><div class="mono">' + escapeHtml(d.providerId || '-') + '</div>' +
          '<div>上游</div><div class="mono">' + escapeHtml(d.upstreamHost || '-') + '</div>' +
          '<div>耗时</div><div class="mono">' + escapeHtml(String(d.latencyMs ?? '-')) + ' ms</div>' +
          '<div>Session</div><div class="mono">' + escapeHtml(tags.sessionId || '-') + '</div>' +
          '<div>Conversation</div><div class="mono">' + escapeHtml(tags.conversationId || '-') + '</div>' +
          '<div>Project</div><div class="mono">' + escapeHtml(tags.projectId || '-') + '</div>' +
          '<div>Workspace</div><div class="mono">' + escapeHtml(tags.workspaceId || '-') + '</div>' +
          '<div>CWD</div><div class="mono">' + escapeHtml(tags.cwd || '-') + '</div>' +
          '<div>错误</div><div class="mono">' + escapeHtml(d.error || '-') + '</div>' +
        '</div>' +
        interceptChain(d) +
        '<h3 class="section-title">过程事件</h3>' +
        '<div class="events">' +
          (d.events || []).map(e =>
            '<div class="event ' + escapeHtml(e.type || '') + '"><div class="muted mono">' + escapeHtml(e.at) + ' · ' + escapeHtml(e.type) +
            '</div><div>' + escapeHtml(e.message) + '</div></div>'
          ).join('') +
        '</div>' +
        jsonBlock('① 入站请求头', d.requestHeaders) +
        jsonBlock('① 请求 JSON（客户端 → 网关）', d.requestBody) +
        jsonBlock('③ 上游请求（网关 → 上游）', d.upstreamRequest) +
        jsonBlock('③ 上游响应头', d.upstreamResponseHeaders) +
        jsonBlock('③→① 响应全文（pipe 回传）', d.responseBody != null ? d.responseBody : d.responsePreview) +
        (d.usage ? jsonBlock('Usage（旁路解析，未改写响应）', d.usage) : '');
      if (soft) detail.scrollTop = scrollTop;
    }

    async function autoRefresh() {
      await loadList({ preserveScroll: true });
      if (!selectedId) return;
      // Soft update: unchanged content skips DOM rebuild; scroll is preserved when it does update.
      await loadDetail(selectedId, { soft: true });
    }

    function schedule() {
      if (timer) clearInterval(timer);
      if (auto) timer = setInterval(() => { autoRefresh(); }, 3000);
    }

    document.getElementById('searchBtn').onclick = () => loadList();
    document.getElementById('refreshBtn').onclick = () => {
      loadFacets();
      loadList({ preserveScroll: true });
      if (selectedId) loadDetail(selectedId, { force: true });
    };
    document.getElementById('autoBtn').onclick = () => {
      auto = !auto;
      document.getElementById('autoBtn').textContent = '自动刷新: ' + (auto ? '开' : '关');
      schedule();
    };
    ['q','session','project','workspace','cwd','status','protocol','days','conversation'].forEach(id => {
      document.getElementById(id).addEventListener('keydown', (e) => {
        if (e.key === 'Enter') loadList();
      });
    });

    loadFacets();
    loadList();
    schedule();
  </script>
</body>
</html>
`
