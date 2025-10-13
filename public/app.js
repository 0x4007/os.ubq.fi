// src/web/app.ts
async function fetchJSON(path, options = {}) {
  const res = await fetch(path, options);
  const text = await res.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {
  }
  return {
    ok: res.ok,
    status: res.status,
    data
  };
}
function show(el, value) {
  el.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}
function byId(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}
window.addEventListener("DOMContentLoaded", () => {
  const healthBtn = byId("checkHealth");
  const healthOut = byId("healthOut");
  const timeBtn = byId("getTime");
  const timeOut = byId("timeOut");
  const echoForm = byId("echoForm");
  const echoInput = byId("echoInput");
  const echoOut = byId("echoOut");
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
      show(echoOut, {
        error: "Invalid JSON",
        details: String(err)
      });
      return;
    }
    const res = await fetchJSON("/api/echo", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: bodyText
    });
    show(echoOut, res);
  });
});
