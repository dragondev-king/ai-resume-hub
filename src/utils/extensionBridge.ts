/**
 * Bridge between the Chrome extension and the web app generator.
 * The extension writes a payload into sessionStorage on the app origin;
 * the generator consumes it once on load.
 */
export const EXTENSION_PAYLOAD_KEY = 'ai-resume-hub-extension-payload';
export const EXTENSION_PAYLOAD_EVENT = 'ai-resume-hub-extension-payload';

export type ExtensionJobPayload = {
  jobDescription?: string;
  jobDescriptionLink?: string;
  capturedAt?: number;
};

export function readExtensionPayload(): ExtensionJobPayload | null {
  try {
    const raw = sessionStorage.getItem(EXTENSION_PAYLOAD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ExtensionJobPayload;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Read and clear so a refresh does not re-apply the same capture. */
export function consumeExtensionPayload(): ExtensionJobPayload | null {
  const payload = readExtensionPayload();
  if (payload) {
    try {
      sessionStorage.removeItem(EXTENSION_PAYLOAD_KEY);
    } catch {
      // ignore
    }
  }
  return payload;
}
