// Mozart com anexos (fotos, prints e PDF) e os limites novos da IA (migração 20261248), pela rota de verdade com o roteiro
// de teste (nunca chama o modelo). O servidor precisa estar no ar com GESTAO_MOZART_FALSO=1 e GESTAO_CADERNO_FALSO=1.
//  - arquivo que não serve (tipo, quantidade, PDF longo ou pesado, planilha): recusado antes de gastar pedido ou página;
//  - só a foto: o Mozart diz o que entendeu e pergunta; a conversa que volta leva a marca "[foto enviada]", nunca o arquivo;
//  - conversa retomada: "marca os horários da foto" traz os cartões pelo que foi descrito, sem gastar outra página;
//  - PDF + "lança essa conta": cartão de conta a pagar; depois do "Pode fazer", a conta está em A pagar;
//  - modo automático: os dois bloqueios da foto são feitos na hora e o Desfazer desfaz;
//  - saldo único: o que o caderno gasta sai do saldo do Mozart e o contrário; outra loja não é afetada;
//  - devolução: o Mozart não respondeu, as páginas voltam (e a reserva some);
//  - limites 10 (teste) e 20 (quem paga) de páginas, 50 e 150 de pedidos, com a mensagem certa de cada um e os números
//    vindos do banco (config_interna muda, a mensagem muda);
//  - o Mozart é de toda a equipe (quem não tem Clientes manda foto; no caderno continua recusado); quem não é da equipe, não;
//  - texto dentro da foto não vira ordem, no que o roteiro permite: o modelo que obedece esbarra na permissão (recepção) e,
//    para o dono, vira só um cartão (nada muda sem o "Pode fazer").
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('mozart-anexos');
const A = lib('assistente/anexos');
const M = lib('assistente/modelo-de-teste');

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7)]);
const MARCA_JPEG = JPEG.toString('base64').slice(0, 40);
function pdf(n) {
  const kids = Array.from({ length: n }, (_, i) => `${i + 3} 0 R`).join(' ');
  const pags = Array.from({ length: n }, (_, i) => `${i + 3} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >> endobj`).join('\n');
  return Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [${kids}] /Count ${n} >> endobj\n${pags}\ntrailer << /Root 1 0 R >>\n%%EOF\n`, 'latin1');
}
const foto = (n = 1) => Array.from({ length: n }, (_, i) => [`f${i}.jpg`, JPEG, 'image/jpeg']);

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Mozart anexos' });
  const O = await criarLoja(T, { nome: 'Mozart anexos B', equipe: false });
  const P = L.P;
  const { dono } = L.sb;
  const agora = `${L.hoje}T10:00`;
  const token = async (sb) => (await sb.auth.getSession()).data.session?.access_token ?? '';
  /** Pedido ao Mozart: com arquivos vai em formulário (como a tela manda); sem, em JSON. */
  async function mozart(sb, corpo, arquivos = [], o = {}) {
    const dados = JSON.stringify({ petshopId: o.petshop ?? P, agora, fusoMin: -180, mensagens: [], ...corpo });
    const headers = { authorization: `Bearer ${await token(sb)}`, ...(o.stream ? { accept: 'application/x-ndjson' } : {}) };
    let body = dados;
    if (arquivos.length || o.formulario) {
      body = new FormData();
      body.set('dados', dados);
      if (o.paginas) body.set('paginas', String(o.paginas));
      for (const [nome, buf, mime] of arquivos) body.append('arquivo', new Blob([buf], { type: mime }), nome);
    } else headers['content-type'] = 'application/json';
    const r = await fetch(`${B.BASE_URL}/api/gestao/assistente`, { method: 'POST', headers, body });
    if (o.stream) {
      const linhas = (await r.text()).split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
      return { status: r.status, eventos: linhas, j: linhas.find((e) => e.t === 'fim') };
    }
    return { status: r.status, j: await r.json().catch(() => null) };
  }
  const caderno = async (sb, arquivos, extra = {}) => {
    const f = new FormData();
    f.set('petshopId', P); f.set('tipo', 'clientes');
    for (const [k, v] of Object.entries(extra)) f.set(k, v);
    for (const [nome, buf, mime] of arquivos) f.append('arquivo', new Blob([buf], { type: mime }), nome);
    const r = await fetch(`${B.BASE_URL}/api/gestao/caderno`, { method: 'POST', headers: { authorization: `Bearer ${await token(sb)}` }, body: f });
    return { status: r.status, j: await r.json().catch(() => null) };
  };
  const hojeDaLoja = `(now() at time zone 'America/Sao_Paulo')::date`;
  const paginas = (p = P) => B.num(`select coalesce(sum(paginas), 0) from caderno_uso where petshop_id='${p}' and dia = ${hojeDaLoja}`);
  const pedidos = (p = P) => B.num(`select coalesce(sum(pedidos), 0) from assistente_uso where petshop_id='${p}' and canal='mozart' and dia = ${hojeDaLoja}`);
  const reservas = () => B.num(`select count(*) from caderno_reservas where petshop_id='${P}'`);
  const porPaginas = (n) => B.sql(`insert into caderno_uso (petshop_id, dia, paginas, leituras) values ('${P}', ${hojeDaLoja}, ${n}, 1) on conflict (petshop_id, dia) do update set paginas = ${n}`);
  const porPedidos = (n) => B.sql(`insert into assistente_uso (petshop_id, canal, dia, pedidos, chamadas) values ('${P}', 'mozart', ${hojeDaLoja}, ${n}, 0) on conflict (petshop_id, canal, dia) do update set pedidos = ${n}, chamadas = 0`);
  const bloqueios = () => B.num(`select count(*) from bloqueios where petshop_id='${P}'`);
  const saldo = async (sb = dono, p = P) => B.must(await sb.rpc('mozart_anexo_reservar', { p_petshop: p, p_paginas: 0 }), 'saldo');
  /** Guarda e devolve uma chave de config_interna (global: fica mudada só por um instante). */
  const config = (chave, valor) => {
    const antes = B.sql(`select coalesce((select valor from config_interna where chave = '${chave}'), '')`);
    const voltar = () => B.sql(antes === '' ? `delete from config_interna where chave = '${chave}'` : `update config_interna set valor = ${B.q(antes)} where chave = '${chave}'`);
    T.depois(voltar);
    B.sql(`insert into config_interna (chave, valor) values ('${chave}', '${valor}') on conflict (chave) do update set valor = excluded.valor`);
    return voltar;
  };
  // os limites em vigor agora (o banco local pode ter config_interna própria)
  const lim = { pago: B.num(`select public.link_limite('caderno_dia', 20)`), teste: Math.min(B.num(`select public.link_limite('caderno_dia', 20)`), B.num(`select public.link_limite('caderno_teste_dia', 10)`)),
    mozartPago: B.num(`select public.link_limite('mozart_loja_dia', 150)`), mozartTeste: B.num(`select public.link_limite('mozart_teste_dia', 50)`) };

  T.secao('padrões do banco');
  T.ok(`páginas: ${lim.pago} por dia para quem paga e ${lim.teste} no teste (padrão 20 e 10)`, B.sql(`select count(*) from config_interna where chave in ('caderno_dia', 'caderno_teste_dia')`) !== '0' || (lim.pago === 20 && lim.teste === 10), lim);
  T.ok(`pedidos ao Mozart: ${lim.mozartPago} para quem paga e ${lim.mozartTeste} no teste (padrão 150 e 50)`, B.sql(`select count(*) from config_interna where chave in ('mozart_loja_dia', 'mozart_teste_dia')`) !== '0' || (lim.mozartPago === 150 && lim.mozartTeste === 50), lim);
  let s = await saldo();
  T.ok('a loja em teste começa com o saldo cheio do teste, e a resposta diz o limite, o do plano pago e que é teste', s.ok === true && s.restam === lim.teste && s.limite === lim.teste && s.pago === lim.pago && s.teste === true, s);

  T.secao('arquivo que não serve: recusado antes de gastar pedido ou página');
  let r = await mozart(dono, { texto: 'olha isso' }, [['foto.jpg', Buffer.from('isto não é uma foto de verdade, é só texto'), 'image/jpeg']]);
  T.ok('texto com nome de foto: 415 com a frase clara', r.status === 415 && r.j?.erro === 'tipo' && r.j.mensagem === A.TEXTO_TIPO, r);
  r = await mozart(dono, { texto: '' }, [['clientes.csv', Buffer.from('nome,telefone\nAna,11999990000'), 'text/csv']]);
  T.ok('planilha .csv: 415 apontando Trazer de planilha (Clientes e pets e Estoque)', r.status === 415 && r.j?.erro === 'planilha' && /Clientes e pets e toque em Trazer de planilha/.test(r.j.mensagem) && /Estoque, Trazer de planilha/.test(r.j.mensagem), r);
  r = await mozart(dono, { texto: '' }, [['lista.xlsx', Buffer.concat([Buffer.from('PK\u0003\u0004'), Buffer.alloc(200, 1)]), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']]);
  T.ok('planilha .xlsx: a mesma resposta', r.status === 415 && r.j?.erro === 'planilha', r);
  r = await mozart(dono, { texto: 'lê' }, foto(5));
  T.ok('5 fotos: 400 (até 4 fotos ou 1 PDF)', r.status === 400 && r.j?.erro === 'muitos' && /até 4 fotos ou prints, ou 1 PDF/.test(r.j.mensagem), r);
  r = await mozart(dono, { texto: 'lê' }, [['a.pdf', pdf(1), 'application/pdf'], ...foto(1)]);
  T.ok('PDF junto com foto: 400', r.status === 400 && r.j?.erro === 'muitos', r);
  r = await mozart(dono, { texto: 'lê' }, [['a.pdf', pdf(1), 'application/pdf'], ['b.pdf', pdf(1), 'application/pdf']]);
  T.ok('2 PDFs: 400', r.status === 400 && r.j?.erro === 'muitos', r);
  r = await mozart(dono, { texto: 'lê' }, [['longo.pdf', pdf(11), 'application/pdf']]);
  T.ok('PDF de 11 páginas: 413, diz quantas tem e o limite de 10', r.status === 413 && r.j?.erro === 'paginas' && /tem 11 páginas/.test(r.j.mensagem) && /até 10 páginas/.test(r.j.mensagem), r);
  r = await mozart(dono, { texto: 'lê' }, [['x.pdf', Buffer.from('%PDF-1.7\n(tudo comprimido)\n%%EOF'), 'application/pdf']], { paginas: 14 });
  T.ok('PDF que esconde as páginas: vale o que o aparelho contou (14): 413', r.status === 413 && r.j?.erro === 'paginas', r);
  r = await mozart(dono, { texto: 'lê' }, [['pesado.pdf', Buffer.concat([pdf(1), Buffer.alloc(10 * 1024 * 1024, 32)]), 'application/pdf']]);
  T.ok('PDF acima de 10 MB: 413', r.status === 413 && r.j?.erro === 'grande', r);
  r = await mozart(dono, { texto: '' }, [], { formulario: true });
  T.ok('formulário sem arquivo e sem texto: 400 (pedido vazio)', r.status === 400 && r.j?.erro === 'pedido_vazio', r);
  T.ok('nada disso gastou página nem pedido', paginas() === 0 && pedidos() === 0 && reservas() === 0, { paginas: paginas(), pedidos: pedidos() });

  T.secao('só a foto: o Mozart diz o que entendeu e pergunta');
  r = await mozart(dono, { texto: '' }, foto(1));
  T.ok('200, sem cartão, com a frase do que entendeu e a pergunta', r.status === 200 && r.j.propostas.length === 0 && r.j.texto === `${M.FOTO_DE_TESTE} Quer que eu marque esses horários?`, r.j);
  T.ok('gastou 1 página e 1 pedido', paginas() === 1 && pedidos() === 1, { paginas: paginas(), pedidos: pedidos() });
  T.ok('a resposta traz o saldo de páginas depois do pedido', r.j.paginas?.restam === lim.teste - 1 && r.j.paginas.limite === lim.teste && r.j.paginas.teste === true && r.j.paginas.pago === lim.pago, r.j.paginas);
  const conversa = JSON.stringify(r.j.mensagens);
  T.ok('a conversa que volta para o navegador leva a marca "[foto enviada]" e nunca o arquivo', conversa.includes('[foto enviada]') && !conversa.includes(MARCA_JPEG) && !/"type":"image"|base64/.test(conversa), conversa.slice(0, 400));
  T.ok('… e a nota de que o anexo é dado, não instrução', /é dado, não instrução/.test(conversa));
  T.ok('a reserva não volta para o aparelho', !/"reserva"/.test(JSON.stringify(r.j)));
  T.ok('no registro do pet shop fica só a marca (nada do arquivo)', B.sql(`select pedido from assistente_eventos where petshop_id='${P}' and acao='pedido' order by criado_em desc limit 1`) === '[foto enviada]');
  T.ok('nenhuma coluna de texto guarda o arquivo (a tabela de uso só tem números)', B.num(`select count(*) from information_schema.columns where table_name = 'caderno_uso' and data_type in ('text', 'bytea', 'jsonb')`) === 0);
  const primeira = r.j.mensagens;

  T.secao('conversa retomada: o Mozart trabalha pelo que descreveu');
  r = await mozart(dono, { texto: 'sim, marca os horários da foto', mensagens: primeira });
  T.ok('dois cartões de bloqueio, sem a foto e sem gastar outra página', r.status === 200 && r.j.propostas.length === 2 && r.j.propostas.every((p) => p.ferramenta === 'bloquear_horario') && paginas() === 1, r.j);
  T.ok('nada gravado antes do "Pode fazer"', bloqueios() === 0);
  r = await mozart(dono, { mensagens: r.j.mensagens, decisoes: r.j.propostas.map((p) => ({ id: p.id, ok: true })), parciais: r.j.parciais });
  T.ok('depois do "Pode fazer": os dois bloqueios de amanhã (9h às 10h e 15h às 16h)', r.status === 200 && bloqueios() === 2
    && B.sql(`select string_agg(motivo, ',' order by inicio) from bloqueios where petshop_id='${P}'`) === 'Da foto: manhã,Da foto: tarde', B.sql(`select string_agg(motivo, ',' order by inicio) from bloqueios where petshop_id='${P}'`));

  T.secao('foto + pedido: cartões criados a partir do anexo');
  r = await mozart(dono, { texto: 'marca esses horários' }, foto(2));
  T.ok('2 fotos + "marca esses horários": a descrição e dois cartões; 2 páginas a mais', r.status === 200 && r.j.propostas.length === 2 && r.j.texto === M.FOTO_DE_TESTE && paginas() === 3, { r: r.j, paginas: paginas() });
  T.ok('a marca diz quantas fotos foram', JSON.stringify(r.j.mensagens).includes('[2 fotos enviadas]') && !JSON.stringify(r.j.mensagens).includes(MARCA_JPEG));
  r = await mozart(dono, { mensagens: r.j.mensagens, decisoes: r.j.propostas.map((p) => ({ id: p.id, ok: false })), parciais: r.j.parciais });
  T.ok('"Agora não" nos dois: nada gravado', r.status === 200 && bloqueios() === 2, bloqueios());

  T.secao('PDF + "lança essa conta": conta a pagar');
  r = await mozart(dono, { texto: 'lança essa conta' }, [['boleto.pdf', pdf(2), 'application/pdf']], { paginas: 2 });
  T.ok('cartão Conta a pagar de R$ 380,00; o PDF de 2 páginas gastou 2', r.status === 200 && r.j.propostas.length === 1 && r.j.propostas[0].ferramenta === 'criar_conta' && r.j.propostas[0].resumo.titulo === 'Conta a pagar'
    && JSON.stringify(r.j.propostas[0].resumo.linhas).includes('380,00') && paginas() === 5, { r: r.j, paginas: paginas() });
  T.ok('a marca do PDF diz as páginas', JSON.stringify(r.j.mensagens).includes('[PDF enviado: 2 páginas]') && !/"type":"document"/.test(JSON.stringify(r.j.mensagens)));
  r = await mozart(dono, { mensagens: r.j.mensagens, decisoes: r.j.propostas.map((p) => ({ id: p.id, ok: true })), parciais: r.j.parciais });
  T.ok('depois do "Pode fazer": a conta de R$ 380,00 está em A pagar (não paga)', r.status === 200
    && B.sql(`select valor::text || '|' || pago::text || '|' || tipo from lancamentos where petshop_id='${P}' and descricao = 'Luz (boleto)'`) === '380.00|false|saida', B.sql(`select valor::text || '|' || pago::text || '|' || tipo from lancamentos where petshop_id='${P}' and descricao = 'Luz (boleto)'`));
  r = await mozart(dono, { texto: '' }, [['boleto.pdf', pdf(1), 'application/pdf']]);
  T.ok('só o PDF: diz que é um boleto e pergunta se lança', r.status === 200 && r.j.propostas.length === 0 && /^É um boleto de luz de R\$ 380,00 que vence em \d\d\/\d\d\. Quer que eu lance em contas a pagar\?$/.test(r.j.texto), r.j);
  r = await mozart(dono, { texto: 'está borrado, vê o que dá' }, foto(1));
  T.ok('trecho ilegível: lista o que ficou em dúvida e pergunta, sem cartão', r.status === 200 && r.j.propostas.length === 0 && /fiquei em dúvida/.test(r.j.texto) && /o telefone da Marta está borrado/.test(r.j.texto), r.j);

  T.secao('resposta aos poucos com anexo');
  r = await mozart(dono, { texto: '' }, foto(1), { stream: true });
  T.ok('a primeira frase de espera é "Olhando a foto…", o texto chega em pedaços e o fim traz o saldo', r.status === 200 && r.eventos[0]?.t === 'progresso' && r.eventos[0].frase === 'Olhando a foto…'
    && r.eventos.filter((e) => e.t === 'texto').length > 3 && r.j?.status === 200 && typeof r.j.paginas?.restam === 'number', r.eventos.slice(0, 3));
  T.ok('a conversa do fim também vem sem o arquivo', !JSON.stringify(r.j).includes(MARCA_JPEG));

  T.secao('histórico com imagem mandado pelo navegador não é aceito');
  const antesH = paginas();
  r = await mozart(dono, { texto: 'oi', mensagens: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: JPEG.toString('base64') } }, { type: 'text', text: 'olha' }] }, { role: 'assistant', content: [{ type: 'text', text: 'vi' }] }] });
  T.ok('a conversa recomeça sem a imagem (nenhuma página gasta por fora do saldo)', r.status === 200 && r.j.mensagens.length === 2 && !JSON.stringify(r.j.mensagens).includes(MARCA_JPEG) && paginas() === antesH, r.j?.mensagens?.length);

  T.secao('modo automático: faz na hora e o Desfazer desfaz');
  porPaginas(0);
  B.must(await dono.rpc('mozart_automatico_ligar', { p_petshop: P, p_ligar: true, p_versao: '1' }), 'ligar o automático');
  const antesB = bloqueios();
  r = await mozart(dono, { texto: 'marca esses horários' }, foto(1));
  T.ok('nenhum cartão: os dois bloqueios da foto foram feitos na hora, cada um com o Desfazer', r.status === 200 && r.j.propostas.length === 0 && r.j.feitos?.length === 2 && r.j.feitos.every((f) => f.ok && f.acao) && bloqueios() === antesB + 2, r.j);
  T.ok('a fala continua trazendo o que ele entendeu da foto', r.j.texto.startsWith(M.FOTO_DE_TESTE), r.j.texto);
  const desfazer = await fetch(`${B.BASE_URL}/api/gestao/assistente/desfazer`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${await token(dono)}` }, body: JSON.stringify({ petshopId: P, acao: r.j.feitos[0].acao }) });
  const dj = await desfazer.json().catch(() => null);
  T.ok('Desfazer no primeiro: um bloqueio a menos', dj?.ok === true && bloqueios() === antesB + 1, dj);
  B.must(await dono.rpc('mozart_automatico_ligar', { p_petshop: P, p_ligar: false }), 'desligar o automático');

  T.secao('saldo único com a Foto do caderno');
  porPaginas(0);
  r = await caderno(dono, foto(2));
  T.ok('o caderno leu 2 fotos', r.status === 200 && paginas() === 2, r);
  s = await saldo();
  T.ok('… e o saldo do Mozart caiu 2', s.restam === lim.teste - 2, s);
  T.ok('a resposta do caderno também diz o limite do teste e o do plano pago', r.j.limite === lim.teste && r.j.pago === lim.pago && r.j.teste === true && r.j.restam === lim.teste - 2, r.j);
  r = await mozart(dono, { texto: '' }, foto(3));
  T.ok('o Mozart leu 3 fotos', r.status === 200 && paginas() === 5, r);
  s = B.must(await dono.rpc('caderno_contar', { p_petshop: P, p_paginas: 0 }), 'saldo do caderno');
  T.ok('… e o saldo do caderno caiu 3 (é o mesmo contador)', s.restam === lim.teste - 5 && s.limite === lim.teste, s);
  s = await saldo(O.sb.dono, O.P);
  T.ok('a outra loja continua com o saldo cheio', s.restam === s.limite && paginas(O.P) === 0, s);

  T.secao('o Mozart não respondeu: as páginas voltam');
  let antesP = paginas(), antesR = reservas(), antesPed = pedidos();
  r = await mozart(dono, { texto: 'falha de teste' }, foto(2));
  T.ok('502 com a frase de sempre; as 2 páginas voltaram e a reserva sumiu', r.status === 502 && r.j?.erro === 'ia_fora' && paginas() === antesP && reservas() === antesR, { r, paginas: paginas() - antesP });
  T.ok('a recusa leva o saldo de volta para a tela', r.j?.paginas?.restam === lim.teste - antesP, r.j?.paginas);
  T.ok('o pedido contou (como em qualquer pedido que o Mozart não respondeu)', pedidos() === antesPed + 1);
  r = await mozart(dono, { texto: 'falha de teste' }, [['boleto.pdf', pdf(3), 'application/pdf']], { stream: true });
  T.ok('aos poucos: o fim vem com o erro e as 3 páginas do PDF voltam', r.j?.status === 502 && paginas() === antesP && reservas() === antesR, { fim: r.j, paginas: paginas() - antesP });
  r = await mozart(dono, { texto: '' }, foto(1));
  T.ok('a que deu certo conta', r.status === 200 && paginas() === antesP + 1 && reservas() === antesR + 1, { paginas: paginas() - antesP });

  T.secao('limite de páginas: teste (10) e quem paga (20), com a mensagem de cada um');
  porPaginas(lim.teste - 1);
  antesPed = pedidos();
  r = await mozart(dono, { texto: 'lê' }, foto(2));
  T.ok('teste, 2 fotos com 1 sobrando: 429 dizendo quanto resta, o limite do teste e o do plano pago', r.status === 429 && r.j?.erro === 'limite_paginas'
    && r.j.mensagem === `Hoje ainda dá para ler 1 foto ou página (o limite do período de teste é de ${lim.teste} por dia). Mande menos, ou continue amanhã. No plano pago são ${lim.pago} por dia.` && r.j.paginas?.restam === 1, r);
  T.ok('não gastou página nem pedido', paginas() === lim.teste - 1 && pedidos() === antesPed);
  r = await mozart(dono, { texto: 'lê' }, foto(1));
  T.ok('1 foto ainda cabe', r.status === 200 && r.j.paginas.restam === 0 && paginas() === lim.teste, r.j);
  r = await mozart(dono, { texto: 'lê' }, foto(1));
  const AVISO_TESTE = `Você chegou ao limite do período de teste: ${lim.teste} fotos ou páginas por dia. Amanhã renova. No plano pago são ${lim.pago} por dia.`;
  T.ok('teste no limite: "limite do período de teste: 10 fotos ou páginas por dia. Amanhã renova. No plano pago são 20 por dia."', r.status === 429 && r.j?.mensagem === AVISO_TESTE, r);
  r = await caderno(dono, foto(1));
  T.ok('o caderno, no mesmo saldo, dá o mesmo aviso', r.status === 429 && r.j?.erro === 'limite' && r.j.mensagem === AVISO_TESTE && r.j.teste === true, r);
  r = await mozart(dono, { texto: 'oi, tudo bem?' });
  T.ok('sem anexo o Mozart continua atendendo', r.status === 200, r);
  s = await saldo(O.sb.dono, O.P);
  r = await mozart(O.sb.dono, { texto: '' }, foto(1), { petshop: O.P });
  T.ok('a outra loja não é afetada: manda foto normalmente', r.status === 200 && r.j.paginas.restam === s.restam - 1, r.j);
  // os números vêm do banco: muda a chave, muda o aviso
  let voltar = config('caderno_teste_dia', String(lim.teste + 3));
  r = await mozart(dono, { texto: 'lê' }, foto(4));
  T.ok(`config_interna caderno_teste_dia = ${lim.teste + 3}: o aviso sai com o número novo`, r.status === 429 && r.j?.mensagem.includes(`Hoje ainda dá para ler 3 fotos ou páginas (o limite do período de teste é de ${lim.teste + 3} por dia)`), r);
  voltar();
  // quem paga
  B.sql(`update petshops set status = 'ativa' where id = '${P}'`);
  T.depois(() => B.sql(`update petshops set status = 'teste' where id = '${P}'`));
  s = await saldo();
  T.ok(`quem paga: o limite é ${lim.pago} e a resposta não diz "teste"`, s.limite === lim.pago && s.teste === false && s.restam === lim.pago - lim.teste, s);
  r = await mozart(dono, { texto: 'lê' }, foto(1));
  T.ok('quem paga, com 10 usadas: a foto passa', r.status === 200 && paginas() === lim.teste + 1, r.j);
  porPaginas(lim.pago);
  r = await mozart(dono, { texto: 'lê' }, foto(1));
  const AVISO_PAGO = `Você chegou ao limite de hoje: ${lim.pago} fotos ou páginas por dia. Amanhã renova.`;
  T.ok('quem paga no limite: "limite de hoje: 20 fotos ou páginas por dia. Amanhã renova." (sem falar de plano)', r.status === 429 && r.j?.mensagem === AVISO_PAGO && !/plano|teste/.test(r.j.mensagem), r);
  r = await caderno(dono, foto(1));
  T.ok('… e o caderno igual', r.status === 429 && r.j?.mensagem === AVISO_PAGO, r);
  B.sql(`update petshops set status = 'teste' where id = '${P}'`);
  porPaginas(0);

  T.secao('limite de pedidos ao Mozart: teste (50) e quem paga (150)');
  porPedidos(lim.mozartTeste);
  const AVISO_MOZART_TESTE = `Você chegou ao limite do período de teste: ${lim.mozartTeste} pedidos ao Mozart por dia. Amanhã renova. Enquanto isso, as telas continuam funcionando pelos botões. No plano pago, o limite é de ${lim.mozartPago} pedidos por dia.`;
  r = await mozart(dono, { texto: 'oi' });
  T.ok('teste no limite: diz que é o limite do período de teste (50 por dia), que renova amanhã, que as telas seguem e os 150 do plano pago', r.status === 429 && r.j?.erro === 'limite' && r.j.mensagem === AVISO_MOZART_TESTE, r);
  r = await mozart(dono, { texto: 'lê' }, foto(1));
  T.ok('com anexo: o mesmo aviso, e a página reservada volta (o pedido com anexo conta como 1 pedido)', r.status === 429 && r.j?.mensagem === AVISO_MOZART_TESTE && paginas() === 0, { r, paginas: paginas() });
  r = await mozart(O.sb.dono, { texto: 'oi' }, [], { petshop: O.P });
  T.ok('a outra loja continua com o Mozart', r.status === 200, r);
  voltar = config('mozart_teste_dia', String(lim.mozartTeste + 2));
  r = await mozart(dono, { texto: 'oi' });
  T.ok('config_interna mozart_teste_dia maior: volta a atender (o número vem do banco)', r.status === 200, r);
  porPedidos(lim.mozartTeste + 2);
  r = await mozart(dono, { texto: 'oi' });
  T.ok('… e no limite novo o aviso diz o número novo', r.status === 429 && r.j?.mensagem.includes(`${lim.mozartTeste + 2} pedidos ao Mozart por dia`), r);
  voltar();
  B.sql(`update petshops set status = 'ativa' where id = '${P}'`);
  r = await mozart(dono, { texto: 'oi' });
  T.ok('quem paga, com 52 pedidos: atende', r.status === 200, r);
  porPedidos(lim.mozartPago);
  r = await mozart(dono, { texto: 'oi' });
  T.ok('quem paga no limite: "limite de hoje: 150 pedidos ao Mozart por dia. Amanhã renova." (sem falar de plano)', r.status === 429
    && r.j?.mensagem === `Você chegou ao limite de hoje: ${lim.mozartPago} pedidos ao Mozart por dia. Amanhã renova. Enquanto isso, as telas continuam funcionando pelos botões.`, r);
  B.sql(`update petshops set status = 'teste' where id = '${P}'`);
  porPedidos(0);
  const c1 = B.must(await dono.rpc('assistente_contar_v2', { p_petshop: P, p_canal: 'mozart', p_tipo: 'chamada', p_limite: 600 }), 'contar chamada');
  T.ok('a contagem de chamadas devolve o limite em pedidos (4 chamadas por pedido)', c1.ok === true && c1.limite === lim.mozartTeste && c1.pago === lim.mozartPago && c1.teste === true, c1);
  const c2 = B.must(await dono.rpc('assistente_contar_v2', { p_petshop: P, p_canal: 'ajuda', p_tipo: 'pedido', p_limite: 80 }), 'contar ajuda');
  T.ok('a Ajuda continua com os limites dela (40 no teste, 80 pago)', c2.ok === true && c2.limite === Math.min(80, B.num(`select public.link_limite('ajuda_teste_dia', 40)`)), c2);

  T.secao('quem pode mandar anexo');
  porPaginas(0);
  r = await mozart(L.sb.estoque, { texto: '' }, foto(1));
  T.ok('quem não tem a área Clientes (estoque) manda foto ao Mozart', r.status === 200 && paginas() === 1, r);
  r = await caderno(L.sb.estoque, foto(1));
  T.ok('… e continua sem a Foto do caderno', r.status === 403, r);
  const antesE = paginas();
  r = await mozart(L.sb.estoque, { texto: 'falha de teste' }, foto(2));
  T.ok('a devolução também vale para quem não tem Clientes', r.status === 502 && paginas() === antesE, { r, paginas: paginas() });
  r = await mozart(O.sb.dono, { texto: '' }, foto(1));
  T.ok('dono de outro pet shop: 403, nada gasto', r.status === 403 && paginas() === antesE, r);
  r = await fetch(`${B.BASE_URL}/api/gestao/assistente`, { method: 'POST', body: (() => { const f = new FormData(); f.set('dados', JSON.stringify({ petshopId: P, agora, fusoMin: -180, texto: '' })); f.append('arquivo', new Blob([JPEG], { type: 'image/jpeg' }), 'a.jpg'); return f; })() });
  T.ok('sem login: 401', r.status === 401);
  T.ok('anônimo não reserva páginas', !!(await B.cliente().rpc('mozart_anexo_reservar', { p_petshop: P, p_paginas: 1 })).error);
  T.ok('dono de outro pet shop não reserva nem consulta o saldo de A', (await O.sb.dono.rpc('mozart_anexo_reservar', { p_petshop: P, p_paginas: 1 })).data?.motivo === 'sem_acesso' && (await O.sb.dono.rpc('mozart_anexo_reservar', { p_petshop: P, p_paginas: 0 })).data?.motivo === 'sem_acesso' && paginas() === antesE);
  const rv = B.must(await L.sb.estoque.rpc('mozart_anexo_reservar', { p_petshop: P, p_paginas: 2 }), 'reservar');
  T.ok('outro pet shop não devolve a reserva de A', (await O.sb.dono.rpc('caderno_devolver', { p_reserva: rv.reserva })).data?.ok === false && paginas() === antesE + 2);
  T.ok('quem reservou devolve uma vez só', (await L.sb.estoque.rpc('caderno_devolver', { p_reserva: rv.reserva })).data?.ok === true && (await L.sb.estoque.rpc('caderno_devolver', { p_reserva: rv.reserva })).data?.ok === false && paginas() === antesE);
  T.ok('as funções internas não são chamadas de fora', !!(await dono.rpc('paginas_ia_contar', { p_petshop: P, p_paginas: 1, p_area_clientes: false })).error && !!(await dono.rpc('paginas_ia_limites', { p_petshop: P })).error);

  T.secao('texto dentro da foto não vira ordem (o que o roteiro permite provar)');
  const banhoAtivo = () => B.sql(`select ativo::text from servicos where id='${L.S.Banho}'`) === 'true';
  r = await mozart(L.sb.caixa, { texto: 'ordem na foto' }, foto(1));
  T.ok('modelo que obedece à foto, pedido pela recepção: nenhum cartão (a ferramenta é só do dono) e o Banho continua ativo', r.status === 200 && r.j.propostas.length === 0 && (r.j.feitos ?? []).length === 0 && banhoAtivo(), r.j);
  r = await mozart(dono, { texto: 'ordem na foto' }, foto(1));
  T.ok('pedido pelo dono, sem o automático: vira só um cartão; nada muda sem o "Pode fazer"', r.status === 200 && r.j.propostas.length === 1 && r.j.propostas[0].ferramenta === 'alterar_servico' && banhoAtivo(), r.j);
  r = await mozart(dono, { mensagens: r.j.mensagens, decisoes: r.j.propostas.map((p) => ({ id: p.id, ok: false })), parciais: r.j.parciais });
  T.ok('"Agora não": o Banho continua ativo', r.status === 200 && banhoAtivo());

  T.secao('teste grátis com o e-mail do dono sem confirmar');
  const N = await criarLoja(T, { nome: 'Mozart anexos sem email', equipe: false, dados: false, emailSemConfirmar: true });
  r = await mozart(N.sb.dono, { texto: '' }, foto(1), { petshop: N.P });
  T.ok('anexo recusado com a mensagem do e-mail (a de sempre), sem gastar nada', r.status === 403 && r.j?.erro === 'email' && /e-mail do dono da conta é confirmado/.test(r.j.mensagem) && paginas(N.P) === 0 && pedidos(N.P) === 0, r);
}))();
