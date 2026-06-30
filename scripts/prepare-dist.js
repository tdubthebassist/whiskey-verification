const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', 'dist');
const ROOT = path.join(__dirname, '..');

// Recreate dist so stale build artifacts are not served.
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

// Copy customer menu HTML and inject Supabase config
let menuHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
if (process.env.VITE_SUPABASE_URL) {
  menuHtml = menuHtml.replace(
    "window.__SUPABASE_URL = '';",
    `window.__SUPABASE_URL = '${process.env.VITE_SUPABASE_URL}';`,
  );
}
if (process.env.VITE_SUPABASE_ANON_KEY) {
  menuHtml = menuHtml.replace(
    "window.__SUPABASE_ANON_KEY = '';",
    `window.__SUPABASE_ANON_KEY = '${process.env.VITE_SUPABASE_ANON_KEY}';`,
  );
}
fs.writeFileSync(path.join(DIST, 'index.html'), menuHtml);

// Copy assets
copyDir(path.join(ROOT, 'assets'), path.join(DIST, 'assets'));

// Copy admin build output into dist/admin/
const adminDist = path.join(ROOT, 'admin', 'dist');
if (fs.existsSync(adminDist)) {
  copyDir(adminDist, path.join(DIST, 'admin'));
}

console.log('dist/ prepared successfully');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
