// Generates build/icon.ico (Windows) and build/icon.icns (macOS), plus a
// runtime assets/icon.png, from the single text-based source assets/icon.svg.
// Uses the pure-JS "icon-gen" package (no native dependency on macOS's
// iconutil), so this works the same on Windows/Linux/macOS CI runners.
//
// Runs automatically after "npm install" (see the "postinstall" script in
// package.json), so assets/icon.png always exists before "npm start" or
// "electron-builder" need it -- nothing binary has to be committed to git.
const fs = require('fs');
const path = require('path');
const iconGen = require('icon-gen');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'assets', 'icon.svg');
const OUT_DIR = path.join(ROOT, 'build');
const RUNTIME_PNG = path.join(ROOT, 'assets', 'icon.png');

async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error('Fichier source introuvable :', SOURCE);
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  await iconGen(SOURCE, OUT_DIR, {
    report: true,
    ico: { name: 'icon' },
    icns: { name: 'icon' },
    favicon: { name: 'icon', pngSizes: [512] }
  });

  fs.copyFileSync(path.join(OUT_DIR, 'icon512.png'), RUNTIME_PNG);
  fs.copyFileSync(path.join(OUT_DIR, 'icon512.png'), path.join(OUT_DIR, 'icon.png'));
  console.log('Icones generees dans', OUT_DIR, 'et', RUNTIME_PNG);
}

main().catch((err) => {
  console.error('Echec de la generation des icones :', err);
  process.exit(1);
});
