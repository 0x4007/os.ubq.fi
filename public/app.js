async function fetchJSON(path, options = {}) {
  const res = await fetch(path, options);
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text) };
  } catch {
    return { ok: res.ok, status: res.status, data: text };
  }
}

function show(el, value) {
  el.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

window.addEventListener('DOMContentLoaded', () => {
  const healthBtn = document.getElementById('checkHealth');
  const healthOut = document.getElementById('healthOut');
  const timeBtn = document.getElementById('getTime');
  const timeOut = document.getElementById('timeOut');
  const echoForm = document.getElementById('echoForm');
  const echoInput = document.getElementById('echoInput');
  const echoOut = document.getElementById('echoOut');

  healthBtn.addEventListener('click', async () => {
    const res = await fetchJSON('/api/health');
    show(healthOut, res);
  });

  timeBtn.addEventListener('click', async () => {
    const res = await fetchJSON('/api/time');
    show(timeOut, res);
  });

  echoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    let bodyText = echoInput.value || '{}';
    try {
      JSON.parse(bodyText);
    } catch (err) {
      show(echoOut, { error: 'Invalid JSON', details: String(err) });
      return;
    }
    const res = await fetchJSON('/api/echo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: bodyText,
    });
    show(echoOut, res);
  });
});

