// Unidade: senha do painel do administrador (migração 20261247). Sem banco.
//   - a leitura da resposta de admin_situacao (lerSituacao) e os textos da porta do painel (senha-do-painel.ts);
//   - as regras mínimas da senha nova, as mesmas do banco (10 a 200, diferente do e-mail, as duas iguais);
//   - o painel pergunta admin_situacao, mostra a porta antes dos dados e tem o "Fechar o painel";
//   - o segundo fator (TOTP) saiu do código: nada de mfa, nem a tela, nem os apoios de teste;
//   - a migração guarda só o hash (bcrypt, custo 12), não devolve a senha em erro e tira as permissões das tabelas.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { lib } = require('../lib/app');
const B = require('../lib/base');
const T = require('../lib/teste')('unidade-senha-do-painel');
const t = (nome, f) => { try { f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };
const ler = (c) => fs.readFileSync(path.join(B.RAIZ, c), 'utf8');

(async () => T.rodar(async () => {
  const S = lib('senha-do-painel');

  T.secao('situação do painel');
  t('quem não é admin: tudo fechado, sem mais nada', () => assert.deepEqual(S.lerSituacao({ admin: false, tem_senha: true, aberto: true, pode_definir: true, bloqueado_ate: '2026-01-01T00:00:00Z' }),
    { admin: false, temSenha: false, aberto: false, podeDefinir: false, bloqueadoAte: null }));
  t('admin com senha e painel fechado', () => assert.deepEqual(S.lerSituacao({ admin: true, tem_senha: true, aberto: false, vale_ate: null, pode_definir: false, bloqueado_ate: null }),
    { admin: true, temSenha: true, aberto: false, podeDefinir: false, bloqueadoAte: null }));
  t('admin que chegou pelo e-mail, travado', () => assert.deepEqual(S.lerSituacao({ admin: true, tem_senha: false, aberto: false, pode_definir: true, bloqueado_ate: '2026-11-22T15:00:00Z' }),
    { admin: true, temSenha: false, aberto: false, podeDefinir: true, bloqueadoAte: '2026-11-22T15:00:00Z' }));
  t('resposta do banco de antes (admin e forte): não vale como situação', () => { assert.equal(S.lerSituacao({ admin: true, forte: true }), null); assert.equal(S.lerSituacao(null), null); assert.equal(S.lerSituacao('x'), null); });
  t('"aberto" só com true de verdade', () => assert.equal(S.lerSituacao({ admin: true, tem_senha: true, aberto: 'true' }), null));

  T.secao('regras da senha nova');
  const email = 'Dono@maestropet.com';
  t('menos de 10 é curta', () => assert.match(S.problemaDaSenhaNova('123456789', '123456789', email), /pelo menos 10/));
  t('só espaços não conta', () => assert.match(S.problemaDaSenhaNova(' '.repeat(12), ' '.repeat(12), email), /pelo menos 10/));
  t('mais de 200 é longa', () => assert.match(S.problemaDaSenhaNova('x'.repeat(201), 'x'.repeat(201), email), /no máximo 200/));
  t('igual ao e-mail (em qualquer caixa) não pode', () => assert.match(S.problemaDaSenhaNova('dono@MAESTROPET.com', 'dono@MAESTROPET.com', email), /e-mail/));
  t('as duas diferentes', () => assert.match(S.problemaDaSenhaNova('uma senha boa 1', 'uma senha boa 2', email), /diferentes/));
  t('10 letras, iguais e diferente do e-mail: pode', () => { assert.equal(S.problemaDaSenhaNova('0123456789', '0123456789', email), null); assert.equal(S.problemaDaSenhaNova('x'.repeat(200), 'x'.repeat(200), null), null); });
  t('os limites são os do banco', () => { assert.equal(S.SENHA_MIN, 10); assert.equal(S.SENHA_MAX, 200); const m = ler('supabase/migrations/20261247000000_gestao_senha_do_painel.sql'); assert.match(m, /char_length\(p_nova\) < 10/); assert.match(m, /char_length\(p_nova\) > 200/); });
  t('cada motivo do banco tem o seu texto', () => {
    assert.match(S.motivoDaSenhaNova('curta'), /pelo menos 10/); assert.match(S.motivoDaSenhaNova('longa'), /no máximo 200/);
    assert.match(S.motivoDaSenhaNova('igual_email'), /e-mail/); assert.match(S.motivoDaSenhaNova('email_trocado'), /Abra o painel uma vez com a senha atual/); assert.match(S.motivoDaSenhaNova('email'), /link novo/); assert.match(S.motivoDaSenhaNova('outro'), /Tente de novo/);
  });

  T.secao('textos da porta');
  const agora = Date.parse('2026-11-22T15:00:00Z');
  t('travado só enquanto o tempo não passou', () => { assert.equal(S.travado('2026-11-22T15:10:00Z', agora), true); assert.equal(S.travado('2026-11-22T14:59:59Z', agora), false); assert.equal(S.travado(null, agora), false); });
  t('o aviso da trava diz quantos minutos faltam', () => { assert.match(S.textoDoBloqueio('2026-11-22T15:14:30Z', agora), /espere 15 minutos/); assert.match(S.textoDoBloqueio('2026-11-22T15:00:20Z', agora), /espere 1 minuto /); });
  t('… e lembra do link por e-mail', () => assert.match(S.textoDoBloqueio('2026-11-22T15:14:30Z', agora), /link por e-mail/));
  t('senha errada com as tentativas que restam', () => { assert.match(S.textoDaSenhaErrada(4), /4 vezes/); assert.match(S.textoDaSenhaErrada(1), /1 vez /); assert.doesNotMatch(S.textoDaSenhaErrada(undefined), /vez/); });
  t('o e-mail aparece disfarçado', () => { assert.equal(S.emailDisfarcado('maria@gmail.com'), 'ma•••@gmail.com'); assert.equal(S.emailDisfarcado('a@x.com'), 'a•••@x.com'); assert.equal(S.emailDisfarcado(''), 'o e-mail da sua conta'); });

  T.secao('painel do administrador');
  const pag = ler('src/app/(gestao)/gestao/admin/page.tsx');
  const porta = ler('src/components/gestao/admin/senha-do-painel.tsx');
  t('o painel pergunta admin_situacao e mostra a senha do painel antes dos dados', () => { assert.match(pag, /rpc\("admin_situacao"\)/); assert.match(pag, /setAcesso\("senha"\)/); assert.match(pag, /<SenhaDoPainel /); });
  t('fechado o painel, os dados saem da tela', () => assert.match(pag, /if \(!s\.aberto\) \{ setLojas\(null\); setUso\(\[\]\); setContas\(\[\]\);/));
  t('tem o botão "Fechar o painel" (admin_painel_fechar)', () => { assert.match(pag, /rpc\("admin_painel_fechar"\)/); assert.match(pag, /Fechar o painel/); });
  t('a porta chama as funções do banco e o e-mail de entrada do Supabase', () => { for (const f of ['rpc("admin_painel_abrir"', 'rpc("admin_senha_definir"', 'auth.signInWithOtp(', 'shouldCreateUser: false', '/gestao/admin`']) assert.ok(porta.includes(f), f); });
  t('a senha não fica guardada no navegador nem vai para o registro de erros', () => { assert.doesNotMatch(porta, /localStorage|sessionStorage|console\.|registrarErro|avisarErro/); assert.match(porta, /type="password"/); });
  t('depois de mandar, o campo da senha é limpo', () => { assert.match(porta, /setSenha\(""\)/); assert.match(porta, /setNova\(""\); setRepetida\(""\)/); });
  t('os textos da tela são os combinados', () => { for (const x of ['Senha do painel', 'Abrir o painel', 'Esqueci ou quero trocar a senha: receber o link por e-mail', 'Receber o link por e-mail', 'Use uma senha diferente da senha da sua conta']) assert.ok(porta.includes(x), x); });
  t('o menu mostra "Administrador" pela situação (mesmo com o painel fechado)', () => assert.match(ler('src/components/gestao/casca.tsx'), /rpc\("admin_situacao"\)/));
  t('a rota da cópia completa pergunta sou_admin com o login de quem pede', () => assert.match(ler('src/app/api/gestao/admin/copia/route.ts'), /eu\.rpc\("sou_admin"\)/));

  T.secao('o segundo fator saiu');
  t('a tela do segundo fator não existe mais', () => assert.equal(fs.existsSync(path.join(B.RAIZ, 'src/components/gestao/admin/segundo-fator.tsx')), false));
  t('nada no aplicativo nem nos testes usa mfa, TOTP ou a sessão forte (fora o teste que confere que ela sumiu do banco)', () => {
    const achados = [];
    const andar = (d) => { for (const n of fs.readdirSync(d, { withFileTypes: true })) { const c = path.join(d, n.name); if (n.isDirectory()) andar(c); else if (/\.(ts|tsx|js)$/.test(n.name) && c !== __filename && !/banco\.ts$|banco\/senha-do-painel\.js$/.test(c) && /auth\.mfa\b|sessao_forte|adminForte|passarDoSegundoFator|segredosMfa|SegundoFator/.test(fs.readFileSync(c, 'utf8'))) achados.push(path.relative(B.RAIZ, c)); } };
    andar(path.join(B.RAIZ, 'src')); andar(path.join(B.RAIZ, 'testes'));
    assert.deepEqual(achados, []);
  });
  t('os tipos do banco não têm mais sessao_forte e têm as funções novas', () => { const b = ler('src/lib/gestao/banco.ts'); assert.doesNotMatch(b, /"sessao_forte"/); for (const f of ['admin_painel_abrir', 'admin_painel_fechar', 'admin_senha_definir']) assert.ok(b.includes(`"${f}":`), f); });
  t('o TOTP desligado no Supabase local (ninguém usa)', () => assert.match(ler('supabase/config.toml'), /\[auth\.mfa\.totp\]\nenroll_enabled = false\nverify_enabled = false/));

  T.secao('migração');
  const m = ler('supabase/migrations/20261247000000_gestao_senha_do_painel.sql');
  const semComentario = m.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
  t('sou_admin() exige o painel aberto e não fala mais de sessão forte', () => { assert.match(semComentario, /function public\.sou_admin\(\)[\s\S]{0,200}from public\.admins where user_id = \(select auth\.uid\(\)\)\) and public\.painel_aberto\(\)/); assert.doesNotMatch(semComentario, /aal2|sessao_forte\(\)(?! *;)/); });
  t('a sessão vem do token (session_id) e de nenhum parâmetro', () => { assert.match(semComentario, /auth\.jwt\(\)\) ->> 'session_id'/); assert.match(semComentario, /function public\.admin_painel_abrir\(p_senha text\)/); assert.match(semComentario, /function public\.admin_painel_fechar\(\)/); });
  t('bcrypt com custo 12, e o hash de mentira com o mesmo custo', () => { assert.match(semComentario, /gen_salt\('bf', 12\)/); assert.match(semComentario, /c_mentira constant text := '\$2a\$12\$/); });
  t('as três tabelas com RLS e sem permissão para os papéis da API', () => {
    for (const tab of ['admin_senhas', 'admin_painel_sessoes', 'admin_senha_tentativas']) {
      assert.ok(semComentario.includes(`alter table public.${tab} enable row level security;`), tab);
      assert.ok(semComentario.includes(`revoke all on public.${tab} from public, anon, authenticated, service_role;`), tab);
    }
    assert.doesNotMatch(semComentario, /create policy/);
  });
  t('toda função é security definer ou só de conta, com search_path vazio', () => assert.equal((semComentario.match(/create or replace function/g) ?? []).length, (semComentario.match(/set search_path = ''/g) ?? []).length));
  t('nenhum erro nem aviso leva a senha', () => { assert.doesNotMatch(semComentario, /raise[^;]*p_senha/); assert.doesNotMatch(semComentario, /raise[^;]*p_nova/); assert.doesNotMatch(semComentario, /insert into[^;]*values[^;]*\(p_senha|values[^;]*, p_nova[,)]/); });
  t('5 erros, 15 minutos de trava, 15 minutos do link e 12 horas de painel', () => { assert.match(semComentario, /t\.erros \+ 1 >= 5/); assert.match(semComentario, /interval '15 minutes'/); assert.match(semComentario, /- 900/); assert.match(semComentario, /interval '12 hours'/); });
  t('a cópia completa só lista o que a chave de serviço lê', () => assert.match(semComentario, /has_table_privilege\('service_role', c\.oid, 'select'\)/));
}))();
