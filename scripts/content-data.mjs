import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import ts from 'typescript';
import { runInNewContext } from 'node:vm';

/** Read standalone content modules with fresh source on every dev rescan. */
export async function readContentData(root, name) {
  if (!['projects', 'timeline', 'friends', 'construction'].includes(name)) throw new Error(`Unknown content module: ${name}`);
  const fileName = join(root, 'src/data', `${name}.ts`);
  const source = await readFile(fileName, 'utf8');
  const result = ts.transpileModule(source, {
    fileName,
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.CommonJS },
  });
  const errors = result.diagnostics?.filter(item => item.category === ts.DiagnosticCategory.Error) || [];
  if (errors.length) throw new Error(`${fileName}: ${errors.map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n')).join('\n')}`);
  const module = {};
  runInNewContext(result.outputText, { exports: module }, { filename: fileName });
  const data = module[`${name}Data`];
  if (!Array.isArray(data)) throw new Error(`${fileName} must export ${name}Data as an array`);
  return structuredClone(data);
}
