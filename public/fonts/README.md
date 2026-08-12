# PDF resume fonts

PDF export embeds **DejaVu Sans** (open license) so fonts work on the deployed site.

These files are copied from `dejavu-fonts-ttf` on install:

```bash
npm install
# or manually:
node scripts/copy-pdf-fonts.js
```

- `DejaVuSans.ttf`
- `DejaVuSans-Bold.ttf`

Word (.docx) still uses **Verdana** / **Lucida Sans** by name — those resolve from the reader’s OS and do not need to be bundled.
