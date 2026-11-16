// Trazer do caderno ou do outro sistema (migração 20261188): rota /api/gestao/caderno com a leitura de teste
// (GESTAO_CADERNO_FALSO=1, nunca chama o modelo) e a função caderno_contar (freio do dia por pet shop e geral).
// Papéis (Clientes; Quem me deve só com dinheiro; Agenda só com agenda; Tabela de preços só o dono), tipos e tamanhos de
// arquivo, páginas do PDF contando no limite, e a gravação: dívida com "desde" uma vez só pela mesma chave (toque duplo),
// só para quem mexe com dinheiro. Precisa do servidor no ar (veja testes/LEIAME.md).
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('caderno');
const D = lib('dinheiro');
const C = lib('caderno');

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7)]);
function pdf(n) {
  const kids = Array.from({ length: n }, (_, i) => `${i + 3} 0 R`).join(' ');
  const pags = Array.from({ length: n }, (_, i) => `${i + 3} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >> endobj`).join('\n');
  return Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [${kids}] /Count ${n} >> endobj\n${pags}\ntrailer << /Root 1 0 R >>\n%%EOF\n`, 'latin1');
}

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Caderno' });
  const Bl = await criarLoja(T, { nome: 'Caderno B', equipe: false, dados: false });
  const P = L.P;
  const URL = `${B.BASE_URL}/api/gestao/caderno`;
  const token = async (sb) => (await sb.auth.getSession()).data.session?.access_token ?? '';
  const ler = async (sb, tipo, arquivos, extra = {}) => {
    const f = new FormData();
    f.set('petshopId', extra.petshop ?? P);
    f.set('tipo', tipo);
    if (extra.paginas) f.set('paginas', extra.paginas);
    for (const [nome, buf, mime] of arquivos) f.append('arquivo', new Blob([buf], { type: mime }), nome);
    const r = await fetch(URL, { method: 'POST', headers: sb ? { authorization: `Bearer ${await token(sb)}` } : {}, body: f });
    return { status: r.status, j: await r.json().catch(() => null) };
  };
  const foto = (n = 1) => Array.from({ length: n }, (_, i) => [`f${i}.jpg`, JPEG, 'image/jpeg']);
  const usoHoje = (p = P) => B.num(`select coalesce(sum(paginas), 0) from caderno_uso where petshop_id='${p}' and dia = (now() at time zone 'America/Sao_Paulo')::date`);

  T.secao('quem pode ler');
  let r = await ler(null, 'clientes', foto());
  T.ok('sem login: 401', r.status === 401, r);
  r = await ler(L.sb.estoque, 'clientes', foto());
  T.ok('quem não tem Clientes (estoque): 403', r.status === 403 && r.j?.erro === 'sem_acesso', r);
  r = await ler(L.sb.tosador, 'dividas', foto());
  T.ok('Quem me deve sem área de dinheiro (tosador): 403', r.status === 403 && r.j?.erro === 'sem_dinheiro', r);
  r = await ler(L.sb.monitor, 'agenda', foto());
  T.ok('Agenda sem a área Agenda (monitora): 403', r.status === 403 && r.j?.erro === 'sem_agenda', r);
  r = await ler(L.sb.caixa, 'precos', foto());
  T.ok('Tabela de preços só com o dono (recepção): 403', r.status === 403 && r.j?.erro === 'sem_precos', r);
  r = await ler(Bl.sb.dono, 'clientes', foto());
  T.ok('dono de outro pet shop: 403', r.status === 403, r);
  T.ok('nada disso contou no limite', usoHoje() === 0, usoHoje());
  r = await ler(L.sb.tosador, 'auto', foto());
  T.ok('"Não sei" com o tosador: lê clientes e agenda, a lista de quem deve fica de fora (com aviso)', r.status === 200 && r.j.leitura.clientes.length === 2 && r.j.leitura.dividas.length === 0 && r.j.leitura.agenda.length === 2
    && r.j.leitura.duvidas.some((d) => /dinheiro/.test(d)), r.j);
  r = await ler(L.sb.caixa, 'dividas', foto());
  T.ok('a recepção (Caixa) lê Quem me deve', r.status === 200 && r.j.leitura.dividas.length === 2, r.j);
  const beto = r.j?.leitura.dividas.find((d) => d.cliente_nome === 'Beto Lima');
  T.ok('"desde 12/10" volta como data, nunca depois de hoje', beto && beto.desde === C.lerDataDoCaderno('12/10', L.hoje, 'passado') && beto.desde <= L.hoje, beto);
  const joana = r.j?.leitura.dividas.find((d) => d.cliente_nome === 'Joana Prado');
  T.ok('sem data escrita: "desde" em branco (nada inventado)', joana && joana.desde === null && joana.valor === 50, joana);

  T.secao('o que se lê de cada tipo');
  r = await ler(L.sb.dono, 'precos', foto());
  T.ok('tabela de preços (dono): só serviços, preço único espalhado pelos portes', r.status === 200 && r.j.leitura.servicos.length === 3 && !r.j.leitura.clientes.length
    && r.j.leitura.servicos.find((s) => s.nome === 'Banho de ofurô')?.preco_gg === 35, r.j?.leitura);
  r = await ler(L.sb.monitor, 'vacinas', foto(2));
  const vac = r.j?.leitura.vacinas ?? [];
  T.ok('carteirinha (monitora, que edita a saúde): só os cuidados', r.status === 200 && vac.length === 3 && !r.j.leitura.clientes.length, r.j);
  T.ok('a próxima dose que não está escrita fica em branco', vac.find((v) => v.nome === 'Antirrábica')?.vence === null && !!vac.find((v) => v.nome === 'V10')?.vence, vac);
  r = await ler(L.sb.dono, 'auto', foto());
  T.ok('"Não sei" nunca devolve carteirinha nem tabela de preços', r.status === 200 && !r.j.leitura.vacinas.length && !r.j.leitura.servicos.length, r.j?.leitura);
  const antesPdf = usoHoje();
  r = await ler(L.sb.dono, 'clientes', [['lista.pdf', pdf(3), 'application/pdf']], { paginas: '1' });
  T.ok('PDF do outro sistema: o relatório lido (clientes já juntados entre as páginas)', r.status === 200 && r.j.leitura.clientes.map((c) => c.nome).join() === 'Clara Dias,Paulo Nunes', r.j);
  T.ok('o PDF conta as 3 páginas (o número do aparelho, menor, não vale)', r.j?.paginas === 3 && usoHoje() - antesPdf === 3, { paginas: r.j?.paginas, uso: usoHoje() - antesPdf });

  T.secao('arquivos recusados');
  const antes = usoHoje();
  r = await ler(L.sb.dono, 'clientes', [['lista.csv', Buffer.from('nome;telefone\nAna;11999990000\n'), 'text/csv']]);
  T.ok('planilha ou texto: 415, foto ou PDF', r.status === 415 && r.j?.erro === 'tipo', r);
  r = await ler(L.sb.dono, 'clientes', [['foto.jpg', Buffer.from('não sou foto de verdade'), 'image/jpeg']]);
  T.ok('nome .jpg sem ser foto: 415 (o tipo vem dos bytes)', r.status === 415, r);
  r = await ler(L.sb.dono, 'clientes', [['grande.pdf', Buffer.concat([pdf(1), Buffer.alloc(10 * 1024 * 1024 + 10)]), 'application/pdf']]);
  T.ok('PDF de mais de 10 MB: 413', r.status === 413 && r.j?.erro === 'grande', r);
  r = await ler(L.sb.dono, 'clientes', [['longo.pdf', pdf(25), 'application/pdf']]);
  T.ok('PDF de 25 páginas: 413, pede para dividir', r.status === 413 && r.j?.erro === 'paginas' && /25 páginas/.test(r.j.mensagem), r);
  r = await ler(L.sb.dono, 'clientes', foto(6));
  T.ok('6 fotos de uma vez: 400', r.status === 400 && r.j?.erro === 'muitos', r);
  r = await ler(L.sb.dono, 'clientes', [['a.pdf', pdf(1), 'application/pdf'], ['b.pdf', pdf(1), 'application/pdf'], ['c.pdf', pdf(1), 'application/pdf']]);
  T.ok('3 PDFs de uma vez: 400', r.status === 400, r);
  r = await ler(L.sb.dono, 'clientes', []);
  T.ok('sem arquivo: 400', r.status === 400 && r.j?.erro === 'sem_arquivo', r);
  T.ok('recusados não contam no limite', usoHoje() === antes, { antes, depois: usoHoje() });

  T.secao('limite do dia');
  const anon = B.cliente();
  T.ok('anônimo não conta', !!(await anon.rpc('caderno_contar', { p_petshop: P, p_paginas: 1 })).error);
  T.ok('dono de outro pet shop não conta no de A', (await Bl.sb.dono.rpc('caderno_contar', { p_petshop: P, p_paginas: 1 })).data?.motivo === 'sem_acesso');
  T.ok('estoque (sem Clientes) não conta', (await L.sb.estoque.rpc('caderno_contar', { p_petshop: P, p_paginas: 1 })).data?.motivo === 'sem_acesso');
  T.ok('ninguém lê a tabela de uso direto', ((await L.sb.dono.from('caderno_uso').select('*')).data ?? []).length === 0);
  T.ok('nenhuma coluna de texto na tabela de uso (nada das fotos)', B.num(`select count(*) from information_schema.columns where table_name = 'caderno_uso' and data_type = 'text'`) === 0);
  const lim = B.num(`select public.link_limite('caderno_dia', 30)`);
  const q0 = B.must(await L.sb.dono.rpc('caderno_contar', { p_petshop: P, p_paginas: 0 }), 'quanto resta');
  T.ok('com 0 páginas, só diz quanto resta (sem contar)', q0.ok && q0.restam === lim - usoHoje() && q0.limite === lim, q0);
  B.sql(`update caderno_uso set paginas = ${lim - 1} where petshop_id='${P}' and dia = (now() at time zone 'America/Sao_Paulo')::date`);
  r = await ler(L.sb.dono, 'clientes', foto(2));
  T.ok('2 fotos com 1 página sobrando: 429, com quanto resta', r.status === 429 && r.j?.erro === 'limite' && r.j.restam === 1 && /1 página/.test(r.j.mensagem), r);
  r = await ler(L.sb.dono, 'clientes', foto(1));
  T.ok('1 foto ainda cabe', r.status === 200 && r.j.restam === 0, r);
  r = await ler(L.sb.dono, 'clientes', foto(1));
  T.ok('no limite: 429 com a mensagem amigável', r.status === 429 && /Amanhã/.test(r.j?.mensagem ?? ''), r);
  T.ok('a contagem para no limite', usoHoje() === lim, usoHoje());
  // limite geral: posto logo acima do que já foi lido hoje por todos, e devolvido no fim
  const geralAntes = B.sql(`select coalesce((select valor from config_interna where chave = 'caderno_dia_geral'), '')`);
  T.depois(() => B.sql(geralAntes === '' ? `delete from config_interna where chave = 'caderno_dia_geral'` : `update config_interna set valor = ${B.q(geralAntes)} where chave = 'caderno_dia_geral'`));
  const todas = B.num(`select coalesce(sum(paginas), 0) from caderno_uso where dia = (now() at time zone 'America/Sao_Paulo')::date`);
  B.sql(`insert into config_interna (chave, valor) values ('caderno_dia_geral', '${todas + 1}') on conflict (chave) do update set valor = excluded.valor`);
  r = await ler(Bl.sb.dono, 'clientes', foto(2), { petshop: Bl.P });
  T.ok('limite geral do dia: outro pet shop ouve "muitos pedidos hoje"', r.status === 429 && r.j?.erro === 'ocupado', r);
  r = await ler(Bl.sb.dono, 'clientes', foto(1), { petshop: Bl.P });
  T.ok('cabe uma no geral', r.status === 200, r);

  T.secao('salvar o que foi conferido (os caminhos de sempre)');
  const venc = L.dia(7), desde = C.lerDataDoCaderno('12/10', L.hoje, 'passado');
  const chave = B.uuid();
  const conta = (sb) => D.lancarAReceber(sb, P, { valor: 35, vencimento: venc, categoria: 'Outros', descricao: 'Banho', clienteId: L.tutores.Beto, devidoDesde: desde, chave: `${chave}:divida:x1` });
  const [a1, a2] = await Promise.all([conta(L.sb.caixa), conta(L.sb.caixa)]);
  T.ok('toque duplo em Salvar: a dívida entra uma vez só (mesma chave)', a1.id === a2.id && B.num(`select count(*) from lancamentos where petshop_id='${P}' and chave like '${chave}%'`) === 1);
  T.ok('a dívida fica na ficha do cliente, a receber, com o dia em que começou', B.sql(`select cliente_id || '|' || pago || '|' || devido_desde || '|' || data from lancamentos where id='${a1.id}'`) === `${L.tutores.Beto}|false|${desde}|${venc}`);
  let recusou = false;
  try { await D.lancarAReceber(L.sb.tosador, P, { valor: 10, vencimento: venc, categoria: 'Outros', descricao: 'x', clienteId: L.tutores.Beto, devidoDesde: desde, chave: B.uuid() }); } catch { recusou = true; }
  T.ok('o tosador não anota dívida (o banco recusa)', recusou);
  T.ok('anotar não põe dinheiro no caixa', B.num(`select count(*) from lancamentos where petshop_id='${P}' and pago and tipo='entrada'`) === 0);
}))();
