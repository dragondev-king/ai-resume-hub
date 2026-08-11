/**
 * Copies redistributable DejaVu fonts into public/fonts for PDF export.
 * Runs on postinstall so deployed builds always include the fonts.
 */
const fs = require('fs');
const path = require('path');

const destDir = path.join(__dirname, '..', 'public', 'fonts');
const srcDir = path.join(__dirname, '..', 'node_modules', 'dejavu-fonts-ttf', 'ttf');

const files = [
  'DejaVuSans.ttf',
  'DejaVuSans-Bold.ttf',
];

if (!fs.existsSync(srcDir)) {
  console.warn('[copy-pdf-fonts] dejavu-fonts-ttf not installed; skipped.');
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });

for (const file of files) {
  const from = path.join(srcDir, file);
  const to = path.join(destDir, file);
  if (!fs.existsSync(from)) {
    console.warn(`[copy-pdf-fonts] missing ${file}`);
    continue;
  }
  fs.copyFileSync(from, to);
  console.log(`[copy-pdf-fonts] ${file}`);
}
