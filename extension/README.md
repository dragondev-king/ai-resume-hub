# AI Resume Hub — Chrome extension

Side panel with **login**, **assigned profiles**, **job capture**, and **resume generation**.

Config comes from the web app `.env` at build time — no manual Setup screen.

## 1. Build

Make sure the project root `.env` has:

```env
REACT_APP_SUPABASE_URL=...
REACT_APP_SUPABASE_ANON_KEY=...
```

Optional:

```env
REACT_APP_API_BASE_URL=https://ai-talent-resume-hub.vercel.app
```

(Defaults to the Vercel deployment. Do **not** use `http://localhost:3000` if another app is on that port.)

```bash
npm run build:extension
```

## 2. Load in Chrome

1. `chrome://extensions` → Developer mode
2. **Load unpacked** → select the `extension` folder
3. Click the extension icon → side panel opens on the **login** page

## 3. Use it

1. Sign in
2. Choose an assigned profile and resume template
3. Capture or paste a job description → Generate
4. Edit role / company / bullets (preview shows `<b>` as bold), generate answers with Copy, download DOCX or PDF
5. Downloads also save the application in the database

Generation calls your deployed API (`REACT_APP_API_BASE_URL`).

## Develop

```bash
cd extension/ui
npm run dev
```

Reload the extension in Chrome after rebuilds.
