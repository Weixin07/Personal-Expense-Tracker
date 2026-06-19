import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

const SRC_DIR = resolve(__dirname, '..', '..');
const NAVIGATOR_PATH = resolve(__dirname, '..', 'AppNavigator.tsx');
const INITIAL_ROUTE = 'Home';

const navigatorSource = readFileSync(NAVIGATOR_PATH, 'utf8');

const listSourceFiles = (): string[] =>
  (readdirSync(SRC_DIR, { recursive: true, encoding: 'utf8' }) as string[])
    .filter(
      file =>
        /\.tsx?$/.test(file) &&
        !file.includes('__tests__') &&
        !file.endsWith('.d.ts'),
    )
    .map(file => join(SRC_DIR, file));

const matchAll = (source: string, pattern: RegExp): string[] => {
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    results.push(match[1]);
  }
  return results;
};

const declaredRouteNames = (): string[] => {
  const block = navigatorSource.match(
    /RootStackParamList\s*=\s*\{([\s\S]*?)\};/,
  );
  if (!block) {
    throw new Error('Could not locate RootStackParamList declaration');
  }
  return matchAll(block[1], /^\s*([A-Za-z][A-Za-z0-9]*)\??:/gm);
};

const registeredRouteNames = (): string[] =>
  matchAll(navigatorSource, /<Stack\.Screen[\s\S]*?name="([^"]+)"/g);

const navigatedRouteNames = (): Set<string> => {
  const targets = new Set<string>();
  for (const filePath of listSourceFiles()) {
    for (const name of matchAll(
      readFileSync(filePath, 'utf8'),
      /\.navigate\(\s*['"]([^'"]+)['"]/g,
    )) {
      targets.add(name);
    }
  }
  return targets;
};

describe('navigation graph invariants', () => {
  const declared = declaredRouteNames();
  const registered = registeredRouteNames();
  const navigated = navigatedRouteNames();

  it('registers a screen component for every declared route', () => {
    expect([...registered].sort()).toEqual([...declared].sort());
  });

  it('exposes at least one navigation entry point for every non-initial route', () => {
    const orphaned = declared.filter(
      name => name !== INITIAL_ROUTE && !navigated.has(name),
    );
    expect(orphaned).toEqual([]);
  });
});
