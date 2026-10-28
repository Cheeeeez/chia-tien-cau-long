/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { configDefaults } from 'vitest/config';
import preact from '@preact/preset-vite';

// File trong public/ cần có sẵn khi offline; thiếu file nào thì build fail (readFileSync ném lỗi).
const PUBLIC_PRECACHE = ['manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

/** Sinh dist/sw.js từ src/sw.js: danh sách precache = toàn bộ file build + PUBLIC_PRECACHE; VERSION = hash nội dung. */
function serviceWorker(): Plugin {
  return {
    name: 'service-worker',
    apply: 'build',
    writeBundle(options, bundle) {
      if (!options.dir) throw new Error('service-worker: thiếu output dir');
      const hash = createHash('sha256');
      const built = Object.keys(bundle)
        .filter((f) => !f.endsWith('.map'))
        .sort();
      for (const f of built) {
        const out = bundle[f];
        hash.update(f).update(out.type === 'chunk' ? out.code : out.source);
      }
      for (const f of PUBLIC_PRECACHE) hash.update(f).update(readFileSync(join('public', f)));
      const template = readFileSync('src/sw.js', 'utf8');
      if (!template.includes("'__VERSION__'") || !template.includes('__PRECACHE__')) {
        throw new Error('service-worker: src/sw.js thiếu token __VERSION__/__PRECACHE__');
      }
      hash.update(template);
      const sw = template
        .replace("'__VERSION__'", () => JSON.stringify(hash.digest('hex').slice(0, 12)))
        .replace('__PRECACHE__', () => JSON.stringify([...built, ...PUBLIC_PRECACHE]));
      writeFileSync(join(options.dir, 'sw.js'), sw);
    },
  };
}

// server/ là package riêng (deps riêng); CI gốc không cài deps đó nên không chạy test của nó.
export default defineConfig({
  base: './',
  plugins: [preact(), serviceWorker()],
  test: { environment: 'node', exclude: [...configDefaults.exclude, 'server/**'] },
});
