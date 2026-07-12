import { rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const targets = ['android/app/.cxx', 'android/app/build'];

// New-Architecture .cxx object paths routinely exceed Windows MAX_PATH (260). The
// \\?\ extended-length prefix (backslash-only, absolute) is what lets the Win32 API
// delete those deep descendants instead of failing with ENAMETOOLONG/EPERM.
const extended = absPath =>
  process.platform === 'win32'
    ? `\\\\?\\${absPath.replace(/\//g, '\\')}`
    : absPath;

for (const rel of targets) {
  const abs = join(repoRoot, rel);
  if (!existsSync(abs)) {
    console.log(`skip (absent): ${rel}`);
    continue;
  }
  rmSync(extended(abs), {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 100,
  });
  console.log(`removed: ${rel}`);
}

console.log('done');
