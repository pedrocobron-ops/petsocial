// Rotas do Mozart e do "Tirar dúvida" com as respostas de teste (nunca chamam o modelo). O servidor precisa estar no ar com
// GESTAO_MOZART_FALSO=1 e GESTAO_LINK_IA_FALSO=1 (ver testes/LEIAME.md).
//  - Juliana (velocidade): a resposta chega aos poucos pela rota de verdade, palavra por palavra, mesmo pedindo gzip
//    (sem compressão nem buffer no meio: content-encoding identity, no-transform, x-accel-buffering no).
//  - Juliana L1: o texto do cartão não manda "conferir no cartão e clicar em Pode fazer".
//  - Juliana M5: a mesma confirmação mandada duas vezes (a página recarregou no meio) grava um bloqueio só.
//  - Bia H1: "Quanto fica para os dois de X a Y?" no link responde com o total dos DOIS pets, igual à estimativa do link
//    (link_hotel_estimativa), com o sinal; e o contexto tem o preço de cada porte.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const T = require('../lib/teste')('mozart-rota');

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Mozart rota' });
  const { dono } = L.sb;
  const P = L.P;
  const token = (await dono.auth.getSession()).data.session.access_token;
  const agora = `${L.hoje}T10:00`;
  async function mozart(corpo) {
    const t0 = Date.now();
    const r = await fetch(`${B.BASE_URL}/api/gestao/assistente`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/x-ndjson', 'accept-encoding': 'gzip, br', authorization: `Bearer ${token}` },
      body: JSON.stringify({ petshopId: P, agora, fusoMin: -180, mensagens: [], ...corpo }) });
    const eventos = [];
    const leitor = r.body.getReader();
    const dec = new TextDecoder();
    let resto = '';
    for (;;) {
      const { value, done } = await leitor.read();
      if (done) break;
      resto += dec.decode(value, { stream: true });
      let i;
      while ((i = resto.indexOf('\n')) >= 0) { const l = resto.slice(0, i); resto = resto.slice(i + 1); if (l.trim()) eventos.push({ ms: Date.now() - t0, e: JSON.parse(l) }); }
    }
    return { r, eventos, fim: eventos.find((x) => x.e.t === 'fim')?.e };
  }

  T.secao('Juliana: a resposta chega palavra por palavra');
  {
    const { r, eventos, fim } = await mozart({ texto: 'oi mozart, tudo bem?' });
    const textos = eventos.filter((x) => x.e.t === 'texto');
    T.ok('sem compressão no caminho (content-encoding identity) e ndjson', !/gzip|br/.test(r.headers.get('content-encoding') ?? '') && /ndjson/.test(r.headers.get('content-type') ?? '') && /no-transform/.test(r.headers.get('cache-control') ?? ''), Object.fromEntries(r.headers));
    const espalhado = textos.length ? textos[textos.length - 1].ms - textos[0].ms : 0;
    T.ok(`os pedaços chegam espalhados no tempo (${textos.length} pedaços em ${espalhado} ms), não num bloco só`, textos.length >= 10 && espalhado >= 600, textos.map((x) => x.ms));
    T.ok('o fim traz a resposta inteira', fim?.status === 200 && /palavra por palavra/.test(fim.texto ?? ''), fim);
  }

  T.secao('Juliana L1 e M5: cartão sem "Pode fazer" no texto, e a mesma confirmação grava uma vez só');
  {
    const { fim } = await mozart({ texto: 'bloqueia o almoço de amanhã' });
    T.ok('veio o cartão de bloquear', fim?.propostas?.length === 1 && fim.propostas[0].ferramenta === 'bloquear_horario', fim);
    T.ok('o texto não manda conferir no cartão nem clicar em "Pode fazer"', fim && !/cart[ãa]o|pode fazer/i.test(fim.texto ?? '') && /bloquear o almoço/.test(fim.texto ?? ''), fim?.texto);
    const corpo = { mensagens: fim.mensagens, decisoes: [{ id: fim.propostas[0].id, ok: true }], parciais: fim.parciais };
    const bloqueios = () => B.num(`select count(*) from bloqueios where petshop_id='${P}'`);
    const a = await mozart(corpo);
    const b = await mozart(corpo);
    T.ok('duas confirmações iguais (a página recarregou no meio): um bloqueio só', bloqueios() === 1 && a.fim?.status === 200 && b.fim?.status === 200, bloqueios());
    T.ok('a segunda vez o servidor diz que já estava gravado', /já tinha sido gravada/.test(JSON.stringify(b.fim?.mensagens ?? [])), b.fim?.mensagens?.slice(-2));
  }

  T.secao('Bia H1: "Quanto fica para os dois…" no Tirar dúvida');
  {
    B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'link.ia': true, 'hotel.diaria_por_porte': { ativo: true, P: 90, M: 110, G: 130, GG: 150 }, 'hotel.sinal': { ativo: true, modo: 'percentual', valor: 30 }, 'hotel.desconto_segundo_pet': { ativo: true, pct: 20 } } }), 'opções do hotel');
    // duas noites dentro do mesmo mês, daqui a umas semanas
    let k = 15;
    while (L.dia(k).slice(5, 7) !== L.dia(k + 2).slice(5, 7)) k++;
    const de = L.dia(k), ate = L.dia(k + 2);
    const frase = `Quanto fica para os dois de ${Number(de.slice(8, 10))} a ${Number(ate.slice(8, 10))} de ${MESES[Number(de.slice(5, 7)) - 1]}?`;
    const anon = B.cliente();
    const est = (pets) => anon.rpc('link_hotel_estimativa', { p_codigo: L.codigo, p_entrada: de, p_saida: ate, p_pets: pets });
    const dois = B.must(await est([{ porte: null }, { porte: null }]), 'estimativa de 2'), um = B.must(await est([{ porte: null }]), 'estimativa de 1');
    const reais = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: Math.round(v * 100) % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
    const r = await fetch(`${B.BASE_URL}/api/gestao/link-ia`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': B.ipAleatorio() }, body: JSON.stringify({ codigo: L.codigo, falas: [{ de: 'eu', texto: frase }] }) });
    const j = await r.json();
    const texto = (j.texto ?? '').replace(/ /g, ' ');
    T.ok(`responde o total dos dois (${reais(dois.total)}), não o de um (${reais(um.total)})`, r.status === 200 && texto.includes(`total estimado ${reais(dois.total)}`) && Number(dois.total) > Number(um.total) && texto.includes('para 2 pets'), texto);
    T.ok(`e o sinal da estimativa do link (${reais(dois.sinal)})`, texto.includes(`sinal de ${reais(dois.sinal)}`), texto);
    const mp = B.must(await est([{ porte: 'M' }, { porte: 'P' }]), 'estimativa M e P');
    const r2 = await fetch(`${B.BASE_URL}/api/gestao/link-ia`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': B.ipAleatorio() }, body: JSON.stringify({ codigo: L.codigo, falas: [{ de: 'eu', texto: frase.replace('os dois', 'os dois, um médio e um pequeno,') }] }) });
    const t2 = ((await r2.json()).texto ?? '').replace(/ /g, ' ');
    T.ok(`com médio e pequeno: o total por porte (${reais(mp.total)})`, t2.includes(`total estimado ${reais(mp.total)}`), t2);
  }
}))();
