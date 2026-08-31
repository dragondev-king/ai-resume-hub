/**
 * Runs on pages that may be the AI Resume Hub web app.
 * Only hands off a pending capture when the current origin matches the configured app URL.
 */
(function () {
  const PAYLOAD_KEY = 'ai-resume-hub-extension-payload';
  const EVENT_NAME = 'ai-resume-hub-extension-payload';
  const DEFAULT_APP_URL = 'http://localhost:3000';

  function applyPendingJob(pendingJob) {
    if (!pendingJob || typeof pendingJob !== 'object') return;
    const hasText =
      (typeof pendingJob.jobDescription === 'string' && pendingJob.jobDescription.trim()) ||
      (typeof pendingJob.jobDescriptionLink === 'string' && pendingJob.jobDescriptionLink.trim());
    if (!hasText) return;

    try {
      sessionStorage.setItem(PAYLOAD_KEY, JSON.stringify(pendingJob));
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: pendingJob }));
    } catch (err) {
      console.warn('[AI Resume Hub extension] Failed to hand off job payload', err);
    }
  }

  function isAppOrigin(appBaseUrl) {
    try {
      const base = new URL(String(appBaseUrl || DEFAULT_APP_URL).replace(/\/$/, '') || DEFAULT_APP_URL);
      return location.origin === base.origin;
    } catch {
      return location.origin === 'http://localhost:3000';
    }
  }

  function tryHandoff() {
    chrome.storage.sync.get({ appBaseUrl: DEFAULT_APP_URL }, (sync) => {
      if (!isAppOrigin(sync.appBaseUrl)) return;

      chrome.storage.local.get(['pendingJob'], (result) => {
        const pending = result?.pendingJob;
        if (!pending) return;
        chrome.storage.local.remove('pendingJob', () => applyPendingJob(pending));
      });
    });
  }

  tryHandoff();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.pendingJob?.newValue) return;
    chrome.storage.sync.get({ appBaseUrl: DEFAULT_APP_URL }, (sync) => {
      if (!isAppOrigin(sync.appBaseUrl)) return;
      const pending = changes.pendingJob.newValue;
      chrome.storage.local.remove('pendingJob', () => applyPendingJob(pending));
    });
  });
})();
