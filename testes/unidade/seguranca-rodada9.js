// Unidade: segurança, rodada 9. Sem banco.
//   - célula de planilha segura (celulaCsv): fórmula vira texto, aspas dobradas;
//   - dependências sem alerta alto ou crítico (npm audit --omit=dev); sem internet, vira problema conhecido;
//   - next.config.ts: os cabeçalhos de segurança estão ligados para todas as páginas.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { lib } = require('../lib/app');
const B = require('../lib/base');
const T = require('../lib/teste')('unidade-seguranca-rodada9');
const t = (nome, f) => { try { f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };

(async () => T.rodar(async () => {
  T.secao('planilha sem fórmula (L2)');
  const { celulaCsv } = lib('csv');
  t('texto comum fica entre aspas', () => assert.equal(celulaCsv('Ana Souza'), '"Ana Souza"'));
  t('fórmula (=, +, -, @) ganha um apóstrofo', () => {
    assert.equal(celulaCsv('=HYPERLINK("http://x","clique")'), '"\'=HYPERLINK(""http://x"",""clique"")"');
    for (const c of ['+1', '-1', '@x', '\tx', '\rx']) assert.ok(celulaCsv(c).startsWith('"\''), c);
  });
  t('número, vazio e nulo não quebram', () => { assert.equal(celulaCsv(12.5), '"12.5"'); assert.equal(celulaCsv(null), '""'); assert.equal(celulaCsv(undefined), '""'); });
  t('a exportação dos aceites usa a célula segura', () => assert.match(fs.readFileSync(path.join(B.RAIZ, 'src/components/gestao/admin/aceites.tsx'), 'utf8'), /map\(celulaCsv\)/));

  T.secao('cabeçalhos de segurança (M2)');
  const cfg = fs.readFileSync(path.join(B.RAIZ, 'next.config.ts'), 'utf8');
  t('next.config.ts manda os cabeçalhos em todas as páginas', () => {
    assert.match(cfg, /async headers\(\)/); assert.match(cfg, /source: "\/:path\*", headers: todos\.filter/); assert.match(cfg, /const todos = cabecalhosDeSeguranca\(\)/);
    for (const h of ['X-Content-Type-Options', 'Referrer-Policy', 'X-Frame-Options', 'Permissions-Policy', 'Content-Security-Policy-Report-Only']) assert.ok(cfg.includes(h), h);
  });
  t('câmera e microfone continuam liberados para o próprio site (fotos e Mozart por voz)', () => assert.match(cfg, /camera=\(self\), microphone=\(self\)/));

  T.secao('dependências (H1)');
  let saida = null, falhaDeRede = null;
  try { saida = execFileSync('npm', ['audit', '--omit=dev', '--audit-level=high', '--json'], { cwd: B.RAIZ, stdio: ['ignore', 'pipe', 'pipe'], timeout: 90_000 }).toString(); }
  catch (e) { saida = e.stdout?.toString() || null; if (!saida || !/"vulnerabilities"/.test(saida)) falhaDeRede = String(e.stderr || e.message).slice(0, 200); }
  if (falhaDeRede) T.conhecido('npm audit rodou', false, `sem acesso ao registro do npm agora: ${falhaDeRede}`);
  else {
    const j = JSON.parse(saida);
    const v = j.metadata?.vulnerabilities ?? {};
    const quais = Object.values(j.vulnerabilities ?? {}).filter((x) => ['high', 'critical'].includes(x.severity)).map((x) => `${x.name} (${x.severity})`);
    T.ok('nenhuma dependência de produção com alerta alto ou crítico (rode npm audit fix)', (v.high ?? 0) + (v.critical ?? 0) === 0, quais);
  }
}))();
