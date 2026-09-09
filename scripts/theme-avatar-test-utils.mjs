import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual TS modules in an isolated browser-shaped environment.
// Transpilation only supplies Vite's DEV flag and the project's import aliases.
export function loadAvatarModules(globals = {}) {
  const context = vm.createContext({ HTMLElement: class {}, ...globals });
  const cache = new Map();
  function load(path) {
    if (cache.has(path)) return cache.get(path);
    const source = fs.readFileSync(new URL(`../src/${path}.ts`, import.meta.url), 'utf8')
      .replaceAll('import.meta.env.DEV', 'true');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    const exports = {};
    cache.set(path, exports);
    const require = (specifier) => load(specifier === '@constants/constants'
      ? 'constants/constants' : `utils/${specifier.replace('./', '')}`);
    vm.runInContext(`(function(require, exports) { ${outputText}\n})`, context)(require, exports);
    return exports;
  }
  return { ...load('utils/setting-utils'), ...load('utils/theme-avatar') };
}
