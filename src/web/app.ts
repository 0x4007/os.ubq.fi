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

function show(el: HTMLElement, value: unknown) {
  el.textContent = typeof value === "string"
    ? value
    : JSON.stringify(value, null, 2);
}

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

function focusCard(
  cards: HTMLElement[],
  currentIndex: number,
  direction: 1 | -1,
) {
  const nextIndex = (currentIndex + direction + cards.length) % cards.length;
  cards[nextIndex]?.focus();
}

function setupKeyboardNavigation() {
  const cards = Array.from(document.querySelectorAll<HTMLElement>(".api-card"));

  cards.forEach((card, index) => {
    card.addEventListener("keydown", (event) => {
      if (event.target !== card) return;

      if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault();
        focusCard(cards, index, 1);
      } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        event.preventDefault();
        focusCard(cards, index, -1);
      } else if (event.key === "Enter" || event.key === " ") {
        const action = card.querySelector<HTMLButtonElement>("button");
        if (action) {
          event.preventDefault();
          action.focus();
          action.click();
        }
      }
    });
  });
}

window.addEventListener("DOMContentLoaded", () => {
  const healthBtn = byId<HTMLButtonElement>("checkHealth");
  const healthOut = byId<HTMLPreElement>("healthOut");
  const timeBtn = byId<HTMLButtonElement>("getTime");
  const timeOut = byId<HTMLPreElement>("timeOut");
  const echoForm = byId<HTMLFormElement>("echoForm");
  const echoInput = byId<HTMLTextAreaElement>("echoInput");
  const echoOut = byId<HTMLPreElement>("echoOut");

  setupKeyboardNavigation();

  healthBtn.addEventListener("click", async () => {
    const res = await fetchJSON("/api/health");
    show(healthOut, res);
  });

  timeBtn.addEventListener("click", async () => {
    const res = await fetchJSON("/api/time");
    show(timeOut, res);
  });

  echoForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const bodyText = echoInput.value || "{}";
    try {
      JSON.parse(bodyText);
    } catch (err) {
      show(echoOut, { error: "Invalid JSON", details: String(err) });
      return;
    }
    const res = await fetchJSON("/api/echo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: bodyText,
    });
    show(echoOut, res);
  });
});
