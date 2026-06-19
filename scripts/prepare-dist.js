const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', 'dist');
const ROOT = path.join(__dirname, '..');

// Create dist directory
fs.mkdirSync(DIST, { recursive: true });

// Copy customer menu HTML
fs.copyFileSync(
  path.join(ROOT, 'Bar Backroom Menu.html'),
  path.join(DIST, 'index.html'),
);

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
