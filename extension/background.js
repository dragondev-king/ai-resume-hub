const DEFAULT_APP_URL = 'https://ai-talent-resume-hub.vercel.app';

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.runtime.onStartup?.addListener?.(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

async function getAppBaseUrl() {
  const { appBaseUrl } = await chrome.storage.sync.get({ appBaseUrl: DEFAULT_APP_URL });
  return String(appBaseUrl || DEFAULT_APP_URL).replace(/\/$/, '');
}

/**
 * Side panel is chrome-extension://… — browser CORS blocks direct calls to the API.
 * The service worker can fetch with host_permissions, so all API calls go through here.
 */
async function proxyFetch(message) {
  const { url, method = 'GET', headers = {}, body } = message;
  if (!url || typeof url !== 'string') {
    throw new Error('Missing URL for API request');
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body != null ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 500) };
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'API_FETCH') {
    proxyFetch(message)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) =>
        sendResponse({
          ok: false,
          error: String(err?.message || err),
        })
      );
    return true;
  }

  if (message?.type === 'OPEN_WEB_GENERATOR') {
    (async () => {
      await chrome.storage.local.set({ pendingJob: message.payload || {} });
      const base = await getAppBaseUrl();
      await chrome.tabs.create({ url: `${base}/#/generator?ext=1` });
    })()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }

  return false;
});
