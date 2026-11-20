// Unidade: reforços de segurança (migração 20261245). Sem banco.
//   - a regra de conteúdo do aplicativo e do painel (csp.ts): nonce no script, nada de 'unsafe-inline' no script, nada de
//     pixel nem Cakto, o Supabase (https e wss) na lista; nonce novo a cada vez; quais páginas recarregam ao entrar;
//   - next.config.ts não manda a regra "só avisando" para /gestao/app e /gestao/admin (o middleware manda a que vale);
//   - a logo do pet shop pela rota do site (logoDaLoja): só caminho de logo, nunca o endereço público do bucket;
//   - ninguém mais monta o endereço público do bucket `pets`; o painel pergunta admin_situacao e mostra o segundo fator.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { lib } = require('../lib/app');
const B = require('../lib/base');
const T = require('../lib/teste')('unidade-seguranca-reforcos');
const t = (nome, f) => { try { f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };
const ler = (c) => fs.readFileSync(path.join(B.RAIZ, c), 'utf8');

(async () => T.rodar(async () => {
  T.secao('regra de conteúdo do aplicativo');
  const { politicaDoApp, novoNonce, precisaRecarregar, ROTAS_COM_CSP } = lib('csp');
  const p = politicaDoApp({ nonce: 'abc123==', supabase: 'https://x.supabase.co/' });
  const dir = (n) => p.split('; ').find((d) => d.startsWith(n + ' ')) ?? '';
  t('script só do site e com o nonce da página', () => assert.equal(dir('script-src'), "script-src 'self' 'nonce-abc123=='"));
  t("nada de 'unsafe-inline' nem 'unsafe-eval' no script (fora do modo de desenvolvimento)", () => { assert.doesNotMatch(dir('script-src'), /unsafe/); assert.equal(dir('script-src-attr'), "script-src-attr 'none'"); });
  t("no desenvolvimento, só o 'unsafe-eval' do React a mais", () => assert.equal(politicaDoApp({ nonce: 'n', supabase: 'https://x.supabase.co', dev: true }).split('; ').find((d) => d.startsWith('script-src ')), "script-src 'self' 'nonce-n' 'unsafe-eval'"));
  t('nada de pixel da Meta nem script da Cakto', () => assert.doesNotMatch(p, /facebook|cakto|digitaloceanspaces/));
  t('o Supabase (https e wss) nos dados; fotos assinadas do Supabase, blob: e data:', () => {
    assert.equal(dir('connect-src'), "connect-src 'self' https://x.supabase.co wss://x.supabase.co");
    assert.equal(dir('img-src'), "img-src 'self' data: blob: https://x.supabase.co");
  });
  t("frame-ancestors, object-src 'none', base-uri e o aviso para /api/gestao/csp", () => { for (const d of ["frame-ancestors 'self'", "object-src 'none'", "base-uri 'self'", 'report-uri /api/gestao/csp']) assert.ok(p.includes(d), d); });
  t('nonce novo a cada vez (16 bytes em base64)', () => { const a = novoNonce(), b = novoNonce(); assert.notEqual(a, b); assert.match(a, /^[A-Za-z0-9+/]{22}==$/); });
  t('rotas com a regra que vale: /gestao/app e /gestao/admin (e nada mais)', () => {
    for (const r of ['/gestao/app', '/gestao/app/agenda', '/gestao/admin']) assert.ok(ROTAS_COM_CSP.test(r), r);
    for (const r of ['/', '/gestao', '/gestao/entrar', '/gestao/apps', '/gestao/agendar/abc', '/gestao/tutor/x']) assert.ok(!ROTAS_COM_CSP.test(r), r);
  });
  t('quem abriu a página na capa, no site ou na tela de entrar recarrega ao entrar no aplicativo', () => {
    for (const u of ['http://localhost:3214/', 'https://maestropet.com/gestao', 'https://maestropet.com/gestao/entrar?convite=x']) assert.equal(precisaRecarregar(u), true, u);
    for (const u of ['https://maestropet.com/gestao/app', 'https://maestropet.com/gestao/app/agenda?dia=1', 'https://maestropet.com/gestao/admin', '', null]) assert.equal(precisaRecarregar(u), false, String(u));
  });
  t('o middleware vale só para as páginas do aplicativo e do painel', () => {
    const m = ler('src/middleware.ts');
    assert.match(m, /source: "\/gestao\/app\/:path\*"/); assert.match(m, /source: "\/gestao\/admin\/:path\*"/);
    assert.match(m, /cab\.set\("x-nonce", nonce\)/); assert.match(m, /res\.headers\.set\("Content-Security-Policy", csp\)/);
  });
  t('next.config.ts: a regra "só avisando" do site não vai para o aplicativo e o painel', () => {
    const cfg = ler('next.config.ts');
    assert.match(cfg, /source: "\/\(\(\?!gestao\/app\(\?:\/\|\$\)\|gestao\/admin\(\?:\/\|\$\)\)\.\*\)", headers: todos\.filter\(ehCsp\)/);
    assert.match(cfg, /h\.key !== "Referrer-Policy" && !ehCsp\(h\)/);
  });
  t('os scripts em linha da abertura levam o nonce', () => assert.equal((ler('src/components/gestao/contexto.tsx').match(/<script nonce=\{nonce\}/g) ?? []).length, 2));
  t('o leitor de PDF não testa eval (o teste dispararia a regra)', () => { assert.match(ler('src/components/gestao/caderno.tsx'), /isEvalSupported: false/); assert.match(ler('src/components/gestao/escola/leitor.tsx'), /isEvalSupported: false/); });

  T.secao('fotos dos pets e logo');
  const { logoDaLoja } = lib('supabase-config');
  const logo = 'a1b2c3d4-0000-4000-8000-000000000000/logo-11111111-2222-4333-8444-555555555555.webp';
  t('a logo vai pela rota do site', () => assert.equal(logoDaLoja(logo), `/gestao/marca/${logo}`));
  t('com origem, endereço completo (prévia do WhatsApp)', () => assert.equal(logoDaLoja(logo, 'https://maestropet.com'), `https://maestropet.com/gestao/marca/${logo}`));
  t('caminho estranho não vira endereço', () => { for (const c of [null, '', '../x', 'a/b', `${logo}/../../x`, 'x'.repeat(40)]) assert.equal(logoDaLoja(c), null, String(c)); });
  t('ninguém monta o endereço público do bucket pets', () => {
    const achados = [];
    const andar = (d) => { for (const n of fs.readdirSync(d, { withFileTypes: true })) { const c = path.join(d, n.name); if (n.isDirectory()) andar(c); else if (/\.(ts|tsx)$/.test(n.name) && /object\/public\/pets|fotoPet\(/.test(fs.readFileSync(c, 'utf8'))) achados.push(path.relative(B.RAIZ, c)); } };
    andar(path.join(B.RAIZ, 'src'));
    assert.deepEqual(achados, []);
  });

  T.secao('painel do administrador');
  const pag = ler('src/app/(gestao)/gestao/admin/page.tsx');
  t('o painel pergunta admin_situacao e mostra o segundo fator antes dos dados', () => { assert.match(pag, /rpc\("admin_situacao"\)/); assert.match(pag, /setAcesso\("fator"\)/); assert.match(pag, /<SegundoFator /); });
  const sf = ler('src/components/gestao/admin/segundo-fator.tsx');
  t('o segundo fator usa o Supabase Auth (enroll, challengeAndVerify, listFactors)', () => { for (const f of ['mfa.enroll(', 'mfa.challengeAndVerify(', 'mfa.listFactors(']) assert.ok(sf.includes(f), f); });
  t('o menu mostra "Administrador" pela situação (antes do código)', () => assert.match(ler('src/components/gestao/casca.tsx'), /rpc\("admin_situacao"\)/));
  t('o TOTP ligado no Supabase local', () => assert.match(ler('supabase/config.toml'), /\[auth\.mfa\.totp\]\nenroll_enabled = true\nverify_enabled = true/));
}))();
