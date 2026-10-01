import { cp, mkdir, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist');
for (const file of ['index.html', 'src', 'public', 'README.md', 'LICENSE', 'PROVENANCE.md']) await cp(file, `dist/${file}`, { recursive: true });
console.log('Built dependency-free static site in dist/');
