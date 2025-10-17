// deno run -A scripts/cdp_validate_sprint4.ts --port 9222 --app "http://localhost:8001" --table users --out logs/cdp4

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
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = Deno.args[i + 1] && !Deno.args[i + 1]!.startsWith("--") ? (Deno.args[++i] as string) : "true";
      m.set(k, v);
    }
  }
  return {
    port: Number.parseInt(m.get("port") ?? "9222"),
    app: m.get("app") ?? "http://localhost:8001",
    table: m.get("table") ?? "users",
    outDir: m.get("out") ?? "logs/cdp4",
  };
}

async function ensureChrome(port: number): Promise<void> {
  try {
    const res = await fetch(`http://localhost:${port}/json/version`);
    if (res.ok) return; // already running
  } catch {}
  const profile = `${Deno.cwd()}/.chrome-ubq`;
  const p = new Deno.Command("open", {
    args: [
      "-na",
      "Google Chrome",
      "--args",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--new-window",
      "about:blank",
    ],
  });
  p.spawn();
  const start = Date.now();
  while (Date.now() - start < 8000) {
    try {
      const res = await fetch(`http://localhost:${port}/json/version`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function listTargets(port: number): Promise<TargetInfo[]> {
  const res = await fetch(`http://localhost:${port}/json`);
  if (!res.ok) throw new Error(`Failed to list targets: ${res.status}`);
  const list = (await res.json()) as TargetInfo[];
  return list.filter((t) => t.type === "page" && t.webSocketDebuggerUrl);
}

async function pickOrNavigate(port: number, url: string): Promise<string> {
  const list = await listTargets(port);
  if (list.length === 0) throw new Error("No page targets available");
  const ws = list[0]!.webSocketDebuggerUrl!;
  const cdp = await CDPClient.connect(ws);
  try {
    await cdp.send("Page.enable");
    await cdp.send("Page.bringToFront");
    await cdp.send("Page.navigate", { url });
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
    ws.addEventListener("message", (ev) => {
      try {
        const msg = JSON.parse(String((ev as MessageEvent).data ?? "")) as {
          id?: number;
          result?: unknown;
          error?: unknown;
        };
        if (typeof msg.id === "number") {
          const p = this.pending.get(msg.id);
          if (p) {
            this.pending.delete(msg.id);
            if (msg.error) p.reject(msg.error);
            else p.resolve(msg.result);
          }
        }
      } catch {}
    });
  }
  static async connect(wsUrl: string): Promise<CDPClient> {
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error("WebSocket open timeout")), 5000);
      ws.addEventListener("open", () => {
        clearTimeout(to);
        resolve();
      });
      ws.addEventListener("error", (e) => {
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
    } catch {}
  }
}

function b64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function capture(cdp: CDPClient, outPath: string): Promise<void> {
  await cdp.send("Page.enable");
  await cdp.send("Page.bringToFront");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 900,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await new Promise((r) => setTimeout(r, 600));
  const res = await cdp.send<{ data: string }>("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: true,
  });
  const img = b64ToBytes(res.data);
  await Deno.writeFile(outPath, img);
}

async function evalStr(cdp: CDPClient, expr: string): Promise<string> {
  const r = await cdp.send<any>("Runtime.evaluate", { expression: expr, returnByValue: true });
  // deno-lint-ignore no-explicit-any
  const val = (r as any).result?.value;
  if (typeof val === "string") return val;
  try {
    return JSON.stringify(val ?? null);
  } catch {
    return String(val);
  }
}

async function main() {
  const args = parseArgs();
  await Deno.mkdir(args.outDir, { recursive: true });
  await ensureChrome(args.port);

  const baseUrl = `${args.app}/?table=${encodeURIComponent(args.table)}&limit=1000`;
  const wsUrl = await pickOrNavigate(args.port, baseUrl);
  const cdp = await CDPClient.connect(wsUrl);
  const results: Record<string, unknown> = {};
  try {
    await cdp.send("Page.enable");
    await cdp.send("Page.bringToFront");
    await new Promise((r) => setTimeout(r, 900));

    // Click target table in sidebar if present
    await evalStr(
      cdp,
      `(() => { const items = Array.from(document.querySelectorAll('#tableList li')); const tgt = items.find((li) => li.textContent?.trim() === '${args.table.replace(/'/g, "\\'")}'); (tgt||items[0])?.click(); return (tgt? 'clicked:'+tgt.textContent: 'clicked:first'); })()`,
    );
    await new Promise((r) => setTimeout(r, 1200));

    // Encourage large page size to exercise virtualization
    const sizeChange = await evalStr(
      cdp,
      `(() => { const sel = document.querySelector('#pageSize'); if (!sel) return 'no-sel'; sel.value = '1000'; sel.dispatchEvent(new Event('change', { bubbles: true })); return 'changed'; })()`,
    );
    results.pageSize = sizeChange;
    await new Promise((r) => setTimeout(r, 1200));

    // ARIA checks
    const aria = await evalStr(
      cdp,
      `(() => {
        const grid = document.querySelector('#sbGrid');
        const gridRole = grid?.getAttribute('role') || '';
        const colHdrs = document.querySelectorAll('#sbGrid thead th[role="columnheader"]').length;
        const rowRoles = document.querySelectorAll('#sbGrid tbody tr[role="row"]').length;
        const cells = document.querySelectorAll('#sbGrid tbody tr[role="row"] td[role="gridcell"]').length;
        return JSON.stringify({ gridRole, colHdrs, rowRoles, cells });
      })()`,
    );
    results.aria = JSON.parse(aria);

    // Keyboard navigation
    await evalStr(cdp, `(() => { const g = document.querySelector('#sbGrid'); g?.focus(); return document.activeElement === g ? 'focused' : 'no-focus'; })()`);
    const sel0 = await evalStr(
      cdp,
      `(() => { const sel = document.querySelector('#sbGrid tbody tr.row-click.selected'); return sel?.getAttribute('data-index') || 'none'; })()`,
    );
    await evalStr(cdp, `(() => { const g = document.querySelector('#sbGrid'); g?.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})); return 'ok'; })()`);
    await new Promise((r) => setTimeout(r, 150));
    const sel1 = await evalStr(
      cdp,
      `(() => { const sel = document.querySelector('#sbGrid tbody tr.row-click.selected'); return sel?.getAttribute('data-index') || 'none'; })()`,
    );
    await evalStr(cdp, `(() => { const g = document.querySelector('#sbGrid'); g?.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); return 'ok'; })()`);
    await new Promise((r) => setTimeout(r, 400));
    const expanded = await evalStr(
      cdp,
      `(() => { const sel = document.querySelector('#sbGrid tbody tr.row-click.selected'); if (!sel) return 'no-sel'; const next = sel.nextElementSibling; return next && next.classList.contains('expand-row') ? 'expanded' : 'collapsed'; })()`,
    );
    results.keyboard = { sel0, sel1, expanded };

    // Virtualization: try to jump to row 300 and inspect slice/spacers
    const v1 = await evalStr(
      cdp,
      `(() => { const g = document.querySelector('#sbGrid'); const api = g; if (api && api.__scrollToRow) api.__scrollToRow(300); return 'scrolled'; })()`,
    );
    await new Promise((r) => setTimeout(r, 500));
    const virt = await evalStr(
      cdp,
      `(() => {
        const cont = document.querySelector('.table-container');
        const g = document.querySelector('#sbGrid');
        const hasVirtAPI = !!(g && (g as any) && (g as any).__scrollToRow);
        // Prefer direct property if available
        const meta = (g && (g as any) && (g as any).__v) || {};
        const slice = (typeof meta.start === 'number' && typeof meta.end === 'number') ? (meta.end - meta.start) : 0;
        const rowEls = document.querySelectorAll('#sbGrid tbody tr.row-click').length;
        const spacers = document.querySelectorAll('#sbGrid tbody tr.v-spacer').length;
        const contH = cont ? cont.clientHeight : 0;
        const scrollH = cont ? cont.scrollHeight : 0;
        const css = getComputedStyle(document.documentElement).getPropertyValue('--row-h').trim();
        const rowH = parseFloat(css || '32') || 32;
        const approxVisible = Math.ceil((contH || (32 * 16)) / rowH) + 6;
        const virtualizedActive = (spacers > 0) || (hasVirtAPI && rowEls <= approxVisible && scrollH > contH * 2);
        const subtitle = document.querySelector('#tableSubtitle')?.textContent || '';
        const m = subtitle.match(/\bof\s+(\d+)\b/);
        const total = m ? parseInt(m[1] || '0', 10) : 0;
        return JSON.stringify({ meta, slice, rowEls, spacers, contH, scrollH, rowH, approxVisible, hasVirtAPI, virtualizedActive, total });
      })()`,
    );
    let virtObj: any = null;
    try { virtObj = JSON.parse(virt); } catch { virtObj = { parseError: true, raw: virt ?? null }; }
    const total = Number.isFinite(virtObj?.total) ? Number(virtObj.total) : 0;
    const shouldVirt = total >= 200;
    const ok = shouldVirt ? (virtObj?.virtualizedActive === true) : true; // n/a treated as pass if small dataset
    results.virtualization = { v1, ok, shouldVirt, ...virtObj };

    const outJson = `${args.outDir}/results.json`;
    await Deno.writeTextFile(outJson, JSON.stringify(results, null, 2));
    console.log(outJson);
    await capture(cdp, `${args.outDir}/sprint4.png`);
    await capture(cdp, `${args.outDir}/sprint4-virt.png`);
  } finally {
    cdp.close();
  }
}

if (import.meta.main) {
  await main();
}
