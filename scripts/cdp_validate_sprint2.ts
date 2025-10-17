// deno run -A scripts/cdp_validate_sprint2.ts --port 9222 --app "http://localhost:8001" --table users --out logs/cdp2

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
    outDir: m.get("out") ?? "logs/cdp2",
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
    } catch {
      /* ignore */
    }
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
      } catch {
        /* ignore */
      }
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
    } catch {
      /* noop */
    }
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
  return typeof val === "string" ? val : JSON.stringify(val);
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
    await cdp.send("Page.enable");
    await cdp.send("Page.bringToFront");
    await new Promise((r) => setTimeout(r, 1000));

    // Override prompt and click Save View
    await evalStr(cdp, `(() => { window.__savedHref = location.href; window.prompt = () => 'AutoView1'; const btn = document.querySelector('#saveViewBtn'); if (!btn) return 'no-save-btn'; btn.click(); return 'clicked'; })()`);
    await new Promise((r) => setTimeout(r, 900));
    const viewCount = await evalStr(cdp, `(() => String(document.querySelectorAll('#viewList li').length))()`);
    const lsIndex = await evalStr(cdp, `(() => localStorage.getItem('views:index') || 'null')()`);
    results.savedViews = { count: viewCount, index: lsIndex };

    // Change URL state (limit=25) to create a difference
    await evalStr(
      cdp,
      `(() => { const u = new URL(location.href); u.searchParams.set('limit','25'); history.pushState({},'',u.toString()); window.dispatchEvent(new PopStateEvent('popstate')); return location.href; })()`,
    );
    await new Promise((r) => setTimeout(r, 800));
    const changedHref = await evalStr(cdp, 'location.href');
    results.changed = changedHref;

    // Apply first view
    await evalStr(cdp, `(() => { const li = document.querySelector('#viewList li'); if (!li) return 'no-li'; const apply = li.querySelector('button'); if (!apply) return 'no-apply'; apply.click(); return 'applied'; })()`);
    await new Promise((r) => setTimeout(r, 1000));
    const appliedHref = await evalStr(cdp, 'location.href');
    results.appliedHref = appliedHref;

    // Drill-through: click first outbound card and capture URL
    const drillRes = await evalStr(
      cdp,
      `(() => { const card = document.querySelector('#relatedOutbound .card'); if (!card) return 'no-card'; card.click(); return 'clicked'; })()`,
    );
    await new Promise((r) => setTimeout(r, 900));
    const drilledHref = await evalStr(cdp, 'location.href');
    results.drill = { action: drillRes, href: drilledHref };

    const outJson = `${args.outDir}/results.json`;
    await Deno.writeTextFile(outJson, JSON.stringify(results, null, 2));
    console.log(outJson);
    // Screenshot
    await capture(cdp, `${args.outDir}/screen.png`);
  } finally {
    cdp.close();
  }
}

