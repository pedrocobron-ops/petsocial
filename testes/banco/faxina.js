// Faxina agendada (migração 20261195): a rota /api/gestao/faxina (Vercel Cron) só com o segredo, as funções só com a chave de
// serviço, e a faxina dos arquivos de um pet shop (a mesma `faxinaGeral` da rota, com a chave de serviço do Supabase local):
// foto do boletim sem boletim há mais de um dia sai, a nova fica; PDF do caderno-tmp com mais de uma hora sai, o novo fica;
// os arquivos de outro pet shop ficam. A tarefa diária do pg_cron existe quando o banco tem pg_cron.
// A faxina aqui roda só na loja de teste (p_petshop): outros testes ao mesmo tempo no mesmo banco não perdem nada.
const { execSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('faxina');
const F = lib('faxina');

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(800, 7)]);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n', 'latin1');

function chaveDeServico() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const env = execSync('npx supabase status -o env', { cwd: B.RAIZ, stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }).toString();
    const m = env.match(/^SERVICE_ROLE_KEY="?([^"\n]+)"?$/m);
    return m ? m[1] : null;
  } catch { return null; }
}

(async () => T.rodar(async () => {
  T.secao('a rota e o segredo');
  if (await B.servidorNoAr()) {
    const rota = `${B.BASE_URL}/api/gestao/faxina`;
    const r1 = await fetch(rota);
    T.ok('sem o segredo: recusa (401, ou 503 se o servidor não tem GESTAO_FAXINA_SEGREDO)', [401, 503].includes(r1.status), r1.status);
    const r2 = await fetch(rota, { headers: { authorization: 'Bearer segredo-errado-segredo-errado-segredo-errado' } });
    T.ok('com o segredo errado: recusa', [401, 503].includes(r2.status), r2.status);
    const j = await r2.json().catch(() => ({}));
    T.ok('a resposta não diz nada além do erro', Object.keys(j).sort().join() === 'erro,mensagem', j);
  } else T.ok('servidor fora do ar: rota não conferida', true);
  const antes = process.env.GESTAO_FAXINA_SEGREDO;
  process.env.GESTAO_FAXINA_SEGREDO = 'curto';
  T.ok('segredo curto (menos de 32) não vale', F.segredoDaFaxina() === null);
  const s = 'x'.repeat(40);
  process.env.GESTAO_FAXINA_SEGREDO = s;
  const pedido = (h) => new Request('http://x/api/gestao/faxina', { headers: h });
  T.ok('Authorization: Bearer <segredo> (o que a Vercel Cron manda com CRON_SECRET) vale', F.pedidoAutorizado(pedido({ authorization: `Bearer ${s}` }), F.segredoDaFaxina()));
  T.ok('x-gestao-faxina: <segredo> vale', F.pedidoAutorizado(pedido({ 'x-gestao-faxina': s }), s));
  T.ok('sem cabeçalho ou com outro valor não vale', !F.pedidoAutorizado(pedido({}), s) && !F.pedidoAutorizado(pedido({ authorization: `Bearer ${s}y` }), s));
  if (antes === undefined) delete process.env.GESTAO_FAXINA_SEGREDO; else process.env.GESTAO_FAXINA_SEGREDO = antes;

  T.secao('só a chave de serviço chama');
  const L = await criarLoja(T, { nome: 'Faxina' });
  const O = await criarLoja(T, { nome: 'Faxina outra', equipe: false, dados: false });
  const P = L.P;
  T.recusa('anônimo não chama gestao_faxina_arquivos', await B.cliente().rpc('gestao_faxina_arquivos', { p_limite: 1, p_petshop: P }));
  T.recusa('o dono não chama gestao_faxina_arquivos', await L.sb.dono.rpc('gestao_faxina_arquivos', { p_limite: 1, p_petshop: P }));
  T.recusa('o dono não chama gestao_faxina_banco', await L.sb.dono.rpc('gestao_faxina_banco'));
  const temCron = B.num(`select count(*) from pg_extension where extname = 'pg_cron'`) === 1;
  if (temCron) T.ok('pg_cron: a tarefa diária da faxina do banco existe', B.num(`select count(*) from cron.job where jobname = 'gestao-faxina-diaria' and command like '%gestao_faxina_banco%'`) === 1);
  else T.ok('sem pg_cron neste banco: a migração seguiu sem a tarefa (a rota faz a faxina do banco)', true);

  const chave = chaveDeServico();
  if (!chave) { T.ok('sem a chave de serviço local (npx supabase status): faxina dos arquivos não conferida', true); return; }
  const svc = createClient(B.SUPABASE_URL, chave, { auth: { persistSession: false, autoRefreshToken: false } });

  T.secao('a faxina dos arquivos');
  const sobe = async (sb, bucket, nome, buf, tipo) => B.must(await sb.storage.from(bucket).upload(nome, new Blob([buf], { type: tipo }), { contentType: tipo }), `subir ${nome}`);
  const existe = (bucket, nome) => B.num(`select count(*) from storage.objects where bucket_id = '${bucket}' and name = '${nome}'`) === 1;
  const envelhecer = (bucket, nome, intervalo) => B.sql(`update storage.objects set created_at = now() - interval '${intervalo}' where bucket_id = '${bucket}' and name = '${nome}'`);
  const orfaVelha = `${P}/${B.uuid()}.jpg`, orfaNova = `${P}/${B.uuid()}.jpg`, pdfVelho = `${P}/${B.uuid()}.pdf`, pdfNovo = `${P}/${B.uuid()}.pdf`, deOutro = `${O.P}/${B.uuid()}.pdf`;
  await sobe(L.sb.tosador, 'boletim', orfaVelha, JPEG, 'image/jpeg');
  await sobe(L.sb.tosador, 'boletim', orfaNova, JPEG, 'image/jpeg');
  await sobe(L.sb.dono, 'caderno-tmp', pdfVelho, PDF, 'application/pdf');
  await sobe(L.sb.dono, 'caderno-tmp', pdfNovo, PDF, 'application/pdf');
  await sobe(O.sb.dono, 'caderno-tmp', deOutro, PDF, 'application/pdf');
  envelhecer('boletim', orfaVelha, '2 days'); envelhecer('caderno-tmp', pdfVelho, '2 hours'); envelhecer('caderno-tmp', deOutro, '2 hours');
  T.depois(async () => { await svc.storage.from('boletim').remove([orfaNova]); await svc.storage.from('caderno-tmp').remove([pdfNovo, deOutro]); });

  const r = await F.faxinaGeral(svc, P);
  T.ok('foto do boletim sem boletim há mais de um dia: apagada', !existe('boletim', orfaVelha) && r.fotos >= 1, r);
  T.ok('foto sem boletim de agora: fica (pode estar sendo enviada)', existe('boletim', orfaNova));
  T.ok('PDF do caderno-tmp com mais de uma hora: apagado', !existe('caderno-tmp', pdfVelho) && r.pdfs >= 1, r);
  T.ok('PDF de agora: fica (a leitura pode estar acontecendo)', existe('caderno-tmp', pdfNovo));
  T.ok('o arquivo de outro pet shop fica (a faxina desta loja não mexe)', existe('caderno-tmp', deOutro));
  T.ok('a fila do boletim fica limpa depois', B.num(`select count(*) from boletim_lixo where petshop_id='${P}' and caminho='${orfaVelha}'`) === 0
    || (await F.faxinaGeral(svc, P), B.num(`select count(*) from boletim_lixo where petshop_id='${P}' and caminho='${orfaVelha}'`) === 0));
  const de2 = await F.faxinaGeral(svc, P);
  T.ok('rodar de novo não apaga nada a mais', de2.fotos === 0 && de2.pdfs === 0 && existe('boletim', orfaNova), de2);
}))();
