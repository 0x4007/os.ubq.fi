// deno run -A scripts/cdp_screenshot.ts --port 9222 --match "http://localhost:8000/" --out logs/ui-shot.png

type Target = {
  id: string;
  type?: string;
  url?: string;
  title?: string;
  webSocketDebuggerUrl?: string;
};

type Args = {
  port: number;
  match: string | null; // substring to match in target url
  out: string;
  width: number;
  height: number;
  scale: number;
};

function parseArgs(): Args {
  const args = new Map<string, string>();
  for (let i = 0; i < Deno.args.length; i++) {
    const a = Deno.args[i]!;
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v =
        Deno.args[i + 1] && !Deno.args[i + 1]!.startsWith('--')
          ? (Deno.args[++i] as string)
          : 'true';
      args.set(k, v);
    }
  }
  return {
    port: Number.parseInt(args.get('port') ?? '9222'),
    match: args.get('match') ?? null,
    out: args.get('out') ?? `logs/ui-shot-${Date.now()}.png`,
    width: Number.parseInt(args.get('width') ?? '1280'),
    height: Number.parseInt(args.get('height') ?? '900'),
    scale: Number.parseFloat(args.get('scale') ?? '2'),
  };
}

async function pickTarget(port: number, match: string | null): Promise<string> {
  const res = await fetch(`http://localhost:${port}/json`);
  const list = (await res.json()) as Target[];
  const candidates = list.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (candidates.length === 0) throw new Error('No page targets found');
  if (match) {
    const found = candidates.find((t) => (t.url ?? '').includes(match));
    if (found?.webSocketDebuggerUrl) return found.webSocketDebuggerUrl;
  }
  return candidates[0]!.webSocketDebuggerUrl!;
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
        // ignore
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

function decodeBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

if (import.meta.main) {
  const args = parseArgs();
  await Deno.mkdir('logs', { recursive: true });
  const wsUrl = await pickTarget(args.port, args.match);
  const cdp = await CDPClient.connect(wsUrl);
  try {
    await cdp.send('Page.enable');
    await cdp.send('Page.bringToFront');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: args.width,
      height: args.height,
      deviceScaleFactor: args.scale,
      mobile: false,
    });
    // small settle delay
    await new Promise((r) => setTimeout(r, 350));
    const res = await cdp.send<{ data: string }>('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: true,
    });
    const img = decodeBase64(res.data);
    await Deno.writeFile(args.out, img);
    console.log(args.out);
  } finally {
    cdp.close();
  }
}
