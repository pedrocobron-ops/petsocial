// Carrega os módulos TypeScript do aplicativo (src/lib/gestao/*.ts) direto no Node, sem build: assim os testes chamam
// as mesmas funções que as telas chamam (lancarPago, receberConta, precoDasNoites…), com um cliente do Supabase logado.
// Só transpila (não confere tipos). Resolve o apelido "@/…" para src/.
const fs = require('fs');
const path = require('path');
const Module = require('module');
const { RAIZ } = require('./base');
const ts = require(path.join(RAIZ, 'node_modules', 'typescript'));

if (!require.extensions['.ts']) {
  const resolver = Module._resolveFilename;
  Module._resolveFilename = function (req, parent, ...resto) {
    if (req.startsWith('@/')) req = path.join(RAIZ, 'src', req.slice(2));
    try { return resolver.call(this, req, parent, ...resto); } catch (e) {
      for (const ext of ['.ts', '.tsx']) { try { return resolver.call(this, req + ext, parent, ...resto); } catch { /* tenta a próxima */ } }
      throw e;
    }
  };
  require.extensions['.ts'] = (m, arquivo) => {
    const saida = ts.transpileModule(fs.readFileSync(arquivo, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: arquivo }).outputText;
    m._compile(saida, arquivo);
  };
}

/** require('…/src/lib/gestao/<nome>.ts') */
const lib = (nome) => require(path.join(RAIZ, 'src', 'lib', 'gestao', nome + '.ts'));
module.exports = { lib };
