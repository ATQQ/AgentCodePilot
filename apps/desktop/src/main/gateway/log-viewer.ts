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
    }
    .empty { padding: 28px; color: var(--muted); text-align: center; }
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

    async function loadList() {
      const res = await fetch('/api/logs?' + qs());
      const data = await res.json();
      document.getElementById('meta').textContent =
        '目录: ' + (data.logsDir || '') + ' · ' + (data.items?.length || 0) + ' 条';
      const list = document.getElementById('list');
      if (!data.items?.length) {
        list.innerHTML = '<div class="empty">没有匹配的日志</div>';
        return;
      }
      list.innerHTML = data.items.map(item => {
        const active = item.id === selectedId ? ' active' : '';
        return '<div class="item' + active + '" data-id="' + escapeHtml(item.id) + '">' +
          '<div class="row">' +
            '<div class="mono">' + escapeHtml(item.protocol) + ' · ' + escapeHtml(item.model || '-') + '</div>' +
            badge(item.status) +
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
          loadDetail(selectedId);
          loadList();
        });
      });
    }

    async function loadDetail(id) {
      const res = await fetch('/api/logs/' + encodeURIComponent(id));
      if (!res.ok) {
        document.getElementById('detail').innerHTML = '<div class="empty">未找到详情</div>';
        return;
      }
      const d = await res.json();
      const tags = d.tags || {};
      document.getElementById('detail').innerHTML =
        '<div class="row"><strong class="mono">' + escapeHtml(d.id) + '</strong>' + badge(d.status) + '</div>' +
        '<div class="kv">' +
          '<div>时间</div><div class="mono">' + escapeHtml(d.startedAt) + (d.endedAt ? (' → ' + escapeHtml(d.endedAt)) : '') + '</div>' +
          '<div>接口</div><div class="mono">' + escapeHtml(d.method + ' ' + d.path) + '</div>' +
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
        '<h3 style="margin:0 0 8px;font-size:14px">过程事件</h3>' +
        '<div class="events">' +
          (d.events || []).map(e =>
            '<div class="event"><div class="muted mono">' + escapeHtml(e.at) + ' · ' + escapeHtml(e.type) +
            '</div><div>' + escapeHtml(e.message) + '</div></div>'
          ).join('') +
        '</div>' +
        (d.promptPreview ? ('<h3 style="margin:16px 0 8px;font-size:14px">Prompt 预览</h3><pre>' + escapeHtml(d.promptPreview) + '</pre>') : '') +
        (d.responsePreview ? ('<h3 style="margin:16px 0 8px;font-size:14px">Response 预览</h3><pre>' + escapeHtml(d.responsePreview) + '</pre>') : '');
    }

    function schedule() {
      if (timer) clearInterval(timer);
      if (auto) timer = setInterval(() => { loadList(); if (selectedId) loadDetail(selectedId); }, 3000);
    }

    document.getElementById('searchBtn').onclick = () => loadList();
    document.getElementById('refreshBtn').onclick = () => { loadFacets(); loadList(); if (selectedId) loadDetail(selectedId); };
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
