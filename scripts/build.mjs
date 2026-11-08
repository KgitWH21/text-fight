import { cp, mkdir, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
for (const file of ['index.html', 'style.css', 'app.js', 'core.js', 'sw.js', 'manifest.webmanifest', 'icons', 'data']) await cp(file, `dist/${file}`, { recursive: true });
console.log('Static app built in dist/. No runtime dependencies.');
