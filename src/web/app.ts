type FetchJSONResult = { ok: boolean; status: number; data: unknown };

async function fetchJSON(
  path: string,
  options: RequestInit = {},
): Promise<FetchJSONResult> {
  const res = await fetch(path, options);
  const text = await res.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    // keep text as-is
  }
  return { ok: res.ok, status: res.status, data };
}

function setOutputState(
  el: HTMLElement,
  state: "empty" | "error" | "loading" | "ready",
) {
  el.classList.remove(
    "output-empty",
    "output-error",
    "output-loading",
    "output-ready",
  );
  el.classList.add(`output-${state}`);
}

function isEmptyData(value: unknown) {
  if (value == null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

function show(el: HTMLElement, value: unknown) {
  setOutputState(el, "ready");
  el.textContent =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function showEmpty(el: HTMLElement, message: string) {
  setOutputState(el, "empty");
  el.textContent = message;
}

function showError(el: HTMLElement, message: string, details?: unknown) {
  setOutputState(el, "error");
  el.textContent = details
    ? `${message}\n\n${JSON.stringify(details, null, 2)}`
    : message;
}

function showLoading(el: HTMLElement, label: string) {
  setOutputState(el, "loading");
  el.innerHTML = `
    <span class="skeleton-line skeleton-line--short"></span>
    <span class="skeleton-line"></span>
    <span class="skeleton-line"></span>
    <span class="sr-only">${label}</span>
  `;
}

function showResponse(
  el: HTMLElement,
  res: FetchJSONResult,
  emptyMessage: string,
) {
  if (!res.ok) {
    showError(el, `Request failed with status ${res.status}`, res.data);
    return;
  }

  if (isEmptyData(res.data)) {
    showEmpty(el, emptyMessage);
    return;
  }

  show(el, res);
}

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

window.addEventListener("DOMContentLoaded", () => {
  const healthBtn = byId<HTMLButtonElement>("checkHealth");
  const healthOut = byId<HTMLPreElement>("healthOut");
  const timeBtn = byId<HTMLButtonElement>("getTime");
  const timeOut = byId<HTMLPreElement>("timeOut");
  const echoForm = byId<HTMLFormElement>("echoForm");
  const echoInput = byId<HTMLTextAreaElement>("echoInput");
  const echoOut = byId<HTMLPreElement>("echoOut");

  healthBtn.addEventListener("click", async () => {
    showLoading(healthOut, "Loading health status");
    try {
      const res = await fetchJSON("/api/health");
      showResponse(healthOut, res, "No health status returned.");
    } catch (err) {
      showError(healthOut, "Unable to load health status.", String(err));
    }
  });

  timeBtn.addEventListener("click", async () => {
    showLoading(timeOut, "Loading server time");
    try {
      const res = await fetchJSON("/api/time");
      showResponse(timeOut, res, "No time data returned.");
    } catch (err) {
      showError(timeOut, "Unable to load server time.", String(err));
    }
  });

  echoForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const bodyText = echoInput.value || "{}";
    try {
      JSON.parse(bodyText);
    } catch (err) {
      showError(echoOut, "Invalid JSON payload.", String(err));
      return;
    }

    showLoading(echoOut, "Sending echo request");
    try {
      const res = await fetchJSON("/api/echo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: bodyText,
      });
      showResponse(echoOut, res, "No echo payload returned.");
    } catch (err) {
      showError(echoOut, "Unable to send echo request.", String(err));
    }
  });
});
