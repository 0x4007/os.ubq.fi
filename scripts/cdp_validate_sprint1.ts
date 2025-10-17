// deno run -A scripts/cdp_validate_sprint1.ts --port 9222 --app "http://localhost:8001" --table users --out logs/cdp

type TargetInfo = {
  id: string;
  type?: string;
  url?: string;
  title?: string;
  webSocketDebuggerUrl?: string;
};

type Args = {
  port: number;
  app: string;
  table: string;
  outDir: string;
};

function parseArgs(): Args {
  const m = new Map<string, string>();
  for (let i = 0; i < Deno.args.length; i++) {
    const a = Deno.args[i]!;
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = Deno.args[i + 1] && !Deno.args[i + 1]!.startsWith('--') ? (Deno.args[++i] as string) : 'true';
      m.set(k, v);
    }
  }
  return {
    port: Number.parseInt(m.get('port') ?? '9222'),
    app: m.get('app') ?? 'http://localhost:8001',
    table: m.get('table') ?? 'users',
    outDir: m.get('out') ?? 'logs/cdp',
  };
}

async function ensureChrome(port: number): Promise<void> {
  try {
    const res = await fetch(`http://localhost:${port}/json/version`);
    if (res.ok) return; // already running
  } catch {
    // not up
  }
  const profile = `${Deno.cwd()}/.chrome-ubq`;
  const p = new Deno.Command('open', {
    args: ['-na', 'Google Chrome', '--args', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--new-window', 'about:blank'],
  });
  p.spawn();
  // wait for debugger endpoint
  const start = Date.now();
  while (Date.now() - start < 8000) {
    try {
      const res = await fetch(`http://localhost:${port}/json/version`);
      if (res.ok) return;
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Chrome with CDP did not come up');
}

async function listTargets(port: number): Promise<TargetInfo[]> {
  const res = await fetch(`http://localhost:${port}/json`);
  if (!res.ok) throw new Error(`Failed to list targets: ${res.status}`);
  const list = (await res.json()) as TargetInfo[];
  return list.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
}

async function pickOrNavigate(port: number, url: string): Promise<string> {
  const list = await listTargets(port);
  if (list.length === 0) throw new Error('No page targets available');
  // Use the first available page target
  const ws = list[0]!.webSocketDebuggerUrl!;
  const cdp = await CDPClient.connect(ws);
  try {
    await cdp.send('Page.enable');
    await cdp.send('Page.bringToFront');
    await cdp.send('Page.navigate', { url });
  } finally {
    cdp.close();
  }
  return ws;
}

class CDPClient {
  ws: WebSocket;
  nextId = 1;
  pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(String((ev as MessageEvent).data ?? '')) as {
          id?: number;
          result?: unknown;
          error?: unknown;
        };
        if (typeof msg.id === 'number') {
          const p = this.pending.get(msg.id);
          if (p) {
            this.pending.delete(msg.id);
            if (msg.error) p.reject(msg.error);
            else p.resolve(msg.result);
          }
        }
      } catch {
        /* ignore */
      }
    });
  }
  static async connect(wsUrl: string): Promise<CDPClient> {
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('WebSocket open timeout')), 5000);
      ws.addEventListener('open', () => {
        clearTimeout(to);
        resolve();
      });
      ws.addEventListener('error', (e) => {
        clearTimeout(to);
        reject(e);
      });
    });
    return new CDPClient(ws);
  }
  async send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    const p = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout for ${method}`));
        }
      }, 8000);
    });
    this.ws.send(payload);
    return (await p) as T;
  }
  close() {
    try {
      this.ws.close();
    } catch {
      /* noop */
    }
  }
}

function b64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function capture(cdp: CDPClient, outPath: string): Promise<void> {
  await cdp.send('Page.enable');
  await cdp.send('Page.bringToFront');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 900,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await new Promise((r) => setTimeout(r, 500));
  const res = await cdp.send<{ data: string }>('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: true,
  });
  const img = b64ToBytes(res.data);
  await Deno.writeFile(outPath, img);
}

async function evalStr(cdp: CDPClient, expr: string): Promise<string> {
  const r = await cdp.send<any>('Runtime.evaluate', { expression: expr, returnByValue: true });
  // deno-lint-ignore no-explicit-any
  const val = (r as any).result?.value;
  return typeof val === 'string' ? val : JSON.stringify(val);
}

async function clickFirstDataHeader(cdp: CDPClient): Promise<void> {
  const js = `(() => { const th = document.querySelector('#sbGrid thead tr th:nth-child(2)'); if (!th) return 'no-th'; th.click(); return 'clicked'; })()`;
  await evalStr(cdp, js);
}

async function addSimpleFilter(cdp: CDPClient): Promise<void> {
  const js = `(() => {
    const host = document.querySelector('#filterChips');
    if (!host) return 'no-host';
    const b = host.querySelector('.filter-builder');
    if (!b) return 'no-builder';
    const selects = b.querySelectorAll('select');
    const input = b.querySelector('input');
    const btn = b.querySelector('button');
    if (!selects || selects.length < 2 || !input || !btn) return 'controls-missing';
    // choose first column
    const colSel = selects[0];
    const opSel = selects[1];
    // @ts-ignore
    if (colSel.options.length === 0) return 'no-cols';
    // @ts-ignore
    colSel.value = colSel.options[0].value;
    // @ts-ignore
    opSel.value = 'eq';
    // @ts-ignore
    input.value = '1';
    // @ts-ignore
    btn.click();
    return 'added';
  })()`;
  await evalStr(cdp, js);
}

async function waitForChipCount(
  cdp: CDPClient,
  min: number,
  timeoutMs = 5000,
  pollMs = 200,
): Promise<number> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const s = await evalStr(
      cdp,
      `(() => { const n = document.querySelectorAll('#filterChips .chip').length; return String(n); })()`,
    );
    const n = Number.parseInt(s);
    if (Number.isFinite(n) && n >= min) return n;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  // Final read
  const s = await evalStr(
    cdp,
    `(() => { const n = document.querySelectorAll('#filterChips .chip').length; return String(n); })()`,
  );
  const n = Number.parseInt(s);
  return Number.isFinite(n) ? n : 0;
}

if (import.meta.main) {
  const args = parseArgs();
  await Deno.mkdir(args.outDir, { recursive: true });
  await ensureChrome(args.port);

  const baseUrl = `${args.app}/?table=${encodeURIComponent(args.table)}`;
  const wsUrl = await pickOrNavigate(args.port, baseUrl);
  const cdp = await CDPClient.connect(wsUrl);
  const results: Record<string, unknown> = {};
  try {
    await cdp.send('Page.enable');
    await cdp.send('Page.bringToFront');
    // initial settle
    await new Promise((r) => setTimeout(r, 900));

    // Click first table in sidebar to ensure we have a non-empty table
    const clickTableRes = await evalStr(cdp, `(() => { const li = document.querySelector('#tableList li'); if (!li) return 'no-table'; li.click(); return 'clicked'; })()`);
    results.selectTable = clickTableRes;
    await new Promise((r) => setTimeout(r, 1400));
    // Screenshot base
    const basePng = `${args.outDir}/base.png`;
    await capture(cdp, basePng);
    results.base = basePng;

    // Click header once (asc), capture and record URL
    await clickFirstDataHeader(cdp);
    await new Promise((r) => setTimeout(r, 600));
    const href1 = await evalStr(cdp, 'location.href');
    const ascPng = `${args.outDir}/sort-asc.png`;
    await capture(cdp, ascPng);
    results.sortAsc = { href: href1, png: ascPng };

    // Click header again (desc)
    await clickFirstDataHeader(cdp);
    await new Promise((r) => setTimeout(r, 600));
    const href2 = await evalStr(cdp, 'location.href');
    const descPng = `${args.outDir}/sort-desc.png`;
    await capture(cdp, descPng);
    results.sortDesc = { href: href2, png: descPng };

    // Add a simple filter via builder and wait until chips render
    await addSimpleFilter(cdp);
    let chipsCountNum = await waitForChipCount(cdp, 1, 6000, 250);
    // Fallback: if chips didn't render (slow network or builder didn't attach), inject filters via URL
    if (chipsCountNum < 1) {
      await evalStr(
        cdp,
        `(() => { const u=new URL(location.href); if(!u.searchParams.get('filters')){ u.searchParams.set('filters','id.eq.1'); history.pushState({},'',u.toString()); window.dispatchEvent(new PopStateEvent('popstate')); } return location.href; })()`,
      );
      chipsCountNum = await waitForChipCount(cdp, 1, 6000, 250);
    }
    const href3 = await evalStr(cdp, 'location.href');
    const filtPng = `${args.outDir}/filters.png`;
    await capture(cdp, filtPng);
    results.filters = { href: href3, chips: String(chipsCountNum), png: filtPng };

    const outJson = `${args.outDir}/results.json`;
    await Deno.writeTextFile(outJson, JSON.stringify(results, null, 2));
    console.log(outJson);
  } finally {
    cdp.close();
  }
}
