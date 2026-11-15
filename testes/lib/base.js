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

module.exports = { RAIZ, ENV, SUPABASE_URL, SUPABASE_KEY, BASE_URL, DB_CONTAINER, cliente, sql, num, q, must, uuid, sufixo, ipAleatorio, centavos, hojeNo, somaDias, diaDaSemana, proximoDia, instante, servidorNoAr };
