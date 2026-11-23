// Configuração e apoio comuns a todos os testes: endereços, clientes do Supabase, SQL direto (só para preparar e conferir),
// datas no fuso do pet shop e um placar simples de ok/falhou.
//
// Variáveis (todas opcionais):
//   BASE_URL       servidor do Next já no ar (padrão http://localhost:3214)
//   SUPABASE_URL   padrão: NEXT_PUBLIC_SUPABASE_URL do .env.local
//   SUPABASE_KEY   padrão: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (ou ..._ANON_KEY) do .env.local
//   DB_CONTAINER   contêiner do Postgres local (padrão supabase_db_petsocial), usado com `docker exec ... psql`
//   DATABASE_URL   se existir, o SQL vai direto por `psql $DATABASE_URL` em vez do docker
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..', '..');
function lerEnv(arquivo) {
  if (!fs.existsSync(arquivo)) return {};
  return Object.fromEntries(fs.readFileSync(arquivo, 'utf8').split('\n')
    .filter((l) => /^\s*[A-Za-z_][A-Za-z0-9_]*\s*=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]));
}
const ENV = lerEnv(path.join(RAIZ, '.env.local'));
const SUPABASE_URL = process.env.SUPABASE_URL || ENV.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_KEY = process.env.SUPABASE_KEY || ENV.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const BASE_URL = (process.env.BASE_URL || 'http://localhost:3214').replace(/\/$/, '');
const DB_CONTAINER = process.env.DB_CONTAINER || 'supabase_db_petsocial';
if (!SUPABASE_KEY) throw new Error('Sem chave do Supabase: defina SUPABASE_KEY ou NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY no .env.local');

const { createClient } = require(path.join(RAIZ, 'node_modules', '@supabase', 'supabase-js'));
/** Cliente novo (sem sessão guardada). `ip` vira x-forwarded-for, para os freios por rede do link. */
const cliente = (ip) => createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: ip ? { 'x-forwarded-for': ip } : {} } });

/** SQL como postgres. Só para preparar dados que a API não deixa (admin, envelhecer datas) e para conferir resultados. */
function sql(q) {
  const args = process.env.DATABASE_URL
    ? ['psql', process.env.DATABASE_URL, '-At', '-F', '|', '-q', '-v', 'ON_ERROR_STOP=1']
    : ['docker', 'exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-At', '-F', '|', '-q', '-v', 'ON_ERROR_STOP=1'];
  return execFileSync(args[0], args.slice(1), { input: q, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }).toString().trim();
}
const num = (q) => Number(sql(q));
/** Texto seguro dentro de aspas simples no SQL. */
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

/** Falha com a mensagem do Supabase; devolve `data`. */
const must = (r, oque) => { if (r.error) throw new Error(`${oque}: ${r.error.message}`); return r.data; };
const uuid = () => crypto.randomUUID();
/** Sufixo curto e único por execução (base36 do tempo + aleatório). */
const sufixo = () => Date.now().toString(36) + crypto.randomBytes(2).toString('hex');
/** Um IP de teste aleatório (faixa de documentação 198.18.0.0/15), para cada rodada não esbarrar no freio da anterior. */
const ipAleatorio = () => `198.${18 + crypto.randomInt(2)}.${crypto.randomInt(256)}.${crypto.randomInt(1, 255)}`;
const centavos = (n) => Math.round(Number((Number(n) * 100).toPrecision(12)));

/* ---------- datas ---------- */
/** "AAAA-MM-DD" de hoje no fuso. */
const hojeNo = (fuso = 'America/Sao_Paulo', mais = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(new Date(Date.now() + mais * 864e5));
/** Soma dias a "AAAA-MM-DD" (sem depender do fuso da máquina). */
const somaDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** Dia da semana (0 = domingo) de "AAAA-MM-DD". */
const diaDaSemana = (iso) => new Date(iso + 'T12:00:00Z').getUTCDay();
/** Primeiro dia a partir de `de` (inclusive, se `incluir`) que cai num dos dias da semana pedidos. */
function proximoDia(de, dias, incluir = false) {
  for (let i = incluir ? 0 : 1; i < 15; i++) { const d = somaDias(de, i); if (dias.includes(diaDaSemana(d))) return d; }
  throw new Error('nenhum dia');
}
/** Instante (Date) de "AAAA-MM-DD" + "HH:MM" no fuso do pet shop (conta feita pelo banco). */
const instante = (dia, hora, fuso = 'America/Sao_Paulo') => new Date(sql(`select to_char(((date ${q(dia)} + time ${q(hora)}) at time zone ${q(fuso)}) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`));

/* ---------- servidor ---------- */
async function servidorNoAr() {
  try { const r = await fetch(BASE_URL + '/gestao', { redirect: 'manual' }); return r.status < 500; } catch { return false; }
}

/**
 * Dados do cadastro de um login de teste: o mesmo aceite dos Termos e da Política que a tela Criar conta manda
 * (src/lib/gestao/documentos.ts). Sem isso, a conta de teste pararia na tela de aceite de versão nova ao abrir o aplicativo.
 */
const dadosDoCadastro = () => ({ data: { app: 'maestro', aceite: require('./app').lib('documentos').aceiteDoCadastro() } });

/* ---------- senha do painel do administrador (migração 20261247) ---------- */
/** A senha do painel que os testes usam (cada admin de teste recebe esta, salvo quando o teste registra outra). */
const SENHA_PAINEL = 'Painel-de-teste-2026';
/**
 * Grava a senha do painel de um admin direto no banco (atalho de preparo: pela API, admin_senha_definir só aceita quem
 * acabou de chegar pelo link do e-mail; esse caminho é provado em banco/senha-do-painel.js e telas/senha-do-painel.js).
 */
function registrarSenhaDoPainel(uid, senha = SENHA_PAINEL) {
  sql(`insert into admin_senhas (user_id, hash, email) values ('${uid}', painel_senha_hash(${q(senha)}), (select lower(email) from auth.users where id = '${uid}'))
       on conflict (user_id) do update set hash = excluded.hash, definida_em = now(), email = excluded.email;
       delete from admin_senha_tentativas where user_id = '${uid}'`);
}
/**
 * Admin com o painel aberto num cliente já logado: registra a senha de teste (se o admin ainda não tem) e abre o painel
 * nesta sessão de login com admin_painel_abrir. Depois disto, sou_admin() diz sim para este cliente.
 */
async function adminAberto(sb, senha = SENHA_PAINEL) {
  const uid = (await sb.auth.getUser()).data.user?.id;
  if (!uid) throw new Error('adminAberto: cliente sem login');
  if (num(`select count(*) from admin_senhas where user_id = '${uid}'`) === 0) registrarSenhaDoPainel(uid, senha);
  const r = must(await sb.rpc('admin_painel_abrir', { p_senha: senha }), 'abrir o painel');
  if (!r || r.ok !== true) throw new Error(`adminAberto: o painel não abriu (${JSON.stringify(r)}); o usuário está em admins?`);
  return r;
}

/* ---------- e-mails do Auth local (Mailpit) ---------- */
const MAILPIT_URL = (process.env.MAILPIT_URL || 'http://127.0.0.1:54324').replace(/\/$/, '');
/**
 * O e-mail mais novo que o Auth local mandou para este endereço depois de `desde` (ms), lido no Mailpit:
 * { assunto, link (o primeiro do e-mail), texto }. Espera até 15 s.
 */
async function emailRecebido(email, desde = 0) {
  for (let k = 0; k < 30; k++) {
    const l = await (await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent('to:' + email)}`)).json();
    const m = (l.messages ?? []).find((x) => new Date(x.Created).getTime() >= desde - 1000);
    if (m) {
      const c = await (await fetch(`${MAILPIT_URL}/api/v1/message/${m.ID}`)).json();
      const link = ((c.HTML || '').match(/href="([^"]+)"/) || [])[1]?.replace(/&amp;/g, '&') ?? ((c.Text || '').match(/https?:\/\/\S+/) || [])[0] ?? null;
      return { assunto: c.Subject, link, texto: c.Text || '' };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`nenhum e-mail para ${email} no Mailpit (${MAILPIT_URL}); o Supabase local está no ar?`);
}
/**
 * Pede o link de entrada por e-mail (como a tela da senha do painel), abre o link e põe no cliente a sessão que ele dá
 * (a sessão de quem "acabou de chegar pelo e-mail"). Devolve { link, destino } (para onde o Auth mandou de volta).
 */
async function chegarPeloEmail(sb, email, voltarPara = `${BASE_URL}/gestao/admin`) {
  const desde = Date.now();
  must(await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: voltarPara } }), 'pedido do link por e-mail');
  const { link } = await emailRecebido(email, desde);
  if (!link) throw new Error('o e-mail veio sem link');
  const destino = (await fetch(link, { redirect: 'manual' })).headers.get('location') ?? '';
  const p = new URLSearchParams(destino.split('#')[1] ?? '');
  if (!p.get('access_token')) throw new Error('o link do e-mail não deu sessão: ' + destino.slice(0, 200));
  must(await sb.auth.setSession({ access_token: p.get('access_token'), refresh_token: p.get('refresh_token') }), 'sessão do link');
  return { link, destino };
}

/* ---------- trava do servidor (segredo que só o servidor tem; ver src/lib/gestao/servidor.ts) ---------- */
/** O segredo do servidor de teste: GESTAO_SEGREDO_SERVIDOR ou o derivado da chave da Anthropic (a falsa dos testes). */
const segredoDoServidor = () => (process.env.GESTAO_SEGREDO_SERVIDOR ?? '').trim().length >= 32 ? process.env.GESTAO_SEGREDO_SERVIDOR.trim()
  : crypto.createHmac('sha256', (process.env.ANTHROPIC_API_KEY || 'sk-ant-chave-falsa').replace(/[^\x21-\x7E]/g, '')).update('maestro-pet:servidor:v1').digest('hex');
/**
 * Roda `f` com a trava do servidor gravada (como em produção, onde o servidor grava sozinho com a chave de serviço) e volta
 * como estava. O IP e o navegador que o servidor repassa nos aceites públicos só valem com ela (migração 20261245).
 */
async function comTravaDoServidor(f) {
  const antes = sql(`select coalesce((select valor from config_interna where chave = 'servidor_segredo_sha256'), '')`);
  sql(`select servidor_segredo_registrar(${q(segredoDoServidor())})`);
  try { return await f(); } finally {
    sql(antes ? `update config_interna set valor = ${q(antes)} where chave = 'servidor_segredo_sha256'`
      : `delete from config_interna where chave in ('servidor_segredo_sha256', 'servidor_segredo_sha256_em', 'servidor_segredo_origem')`);
  }
}

module.exports = { segredoDoServidor, comTravaDoServidor, SENHA_PAINEL, registrarSenhaDoPainel, adminAberto, MAILPIT_URL, emailRecebido, chegarPeloEmail, RAIZ, dadosDoCadastro, ENV, SUPABASE_URL, SUPABASE_KEY, BASE_URL, DB_CONTAINER, cliente, sql, num, q, must, uuid, sufixo, ipAleatorio, centavos, hojeNo, somaDias, diaDaSemana, proximoDia, instante, servidorNoAr };
