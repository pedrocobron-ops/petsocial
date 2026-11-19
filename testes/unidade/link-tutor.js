// Unidade (rodada 9, N7): o que o tutor vê no link. Sem banco nem servidor.
// - valor por pet e total (link-precos.ts): dois pets de portes diferentes numa promoção de 15% dão 42,41 + 76,41 = 118,82
//   (antes a página dizia "R$ 42,41 cada pet"); sem porte, a faixa; o que o banco guardou vira as mesmas linhas;
// - endereço do pet shop, link do mapa e a frase da mensagem (endereco.ts);
// - "Adicionar à agenda" (ics.ts);
// - Tirar dúvida (link-ia.ts): promoções e endereço no contexto, resposta pela metade (pergunta de duas partes);
// - a abertura do link numa ida só, também pelo navegador (link-inicial.ts);
// - a confirmação do horário com o endereço (agenda.ts).
const assert = require('node:assert/strict');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('unidade-link-tutor');
const P = lib('link-precos');
const E = lib('endereco');
const I = lib('ics');
const L = lib('link-ia');
const J = lib('link-inicial');
const A = lib('agenda');
const t = async (nome, f) => { try { await f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };

const banho = { preco_p: 49.9, preco_m: 64.9, preco_g: 89.9, preco_gg: 119.9 };
const quinta = { nome: 'Quinta do banho', tipo: 'pct', valor: 15 };

(async () => T.rodar(async () => {
  T.secao('valor por pet e total');
  await t('porte P e porte G com 15%: 42,41 e 76,41; total 118,82 (não "42,41 cada pet")', () => {
    const mel = P.valorDoServico(banho, 'P', quinta), bob = P.valorDoServico(banho, 'G', quinta);
    assert.equal(mel.valor, 42.41); assert.equal(mel.base, 49.9);
    assert.equal(bob.valor, 76.41); assert.equal(bob.base, 89.9);
    const linhas = [{ nome: 'Mel', v: mel }, { nome: 'Bob', v: bob }];
    assert.equal(P.totalDoPedido(linhas).valor, 118.82);
    assert.equal(P.totalPorExtenso(linhas), 'R$ 118,82');
    assert.equal(P.fraseDoPet(linhas[0]), 'Mel (porte P): de R$ 49,90 por R$ 42,41');
    assert.equal(P.fraseDoPet(linhas[1]), 'Bob (porte G): de R$ 89,90 por R$ 76,41');
    assert.equal(P.valorNaFrase(linhas), 'R$ 118,82 (Mel R$ 42,41 e Bob R$ 76,41)');
  });
  await t('sem promoção: o preço do porte de cada pet e o total', () => {
    const linhas = [{ nome: 'Mel', v: P.valorDoServico(banho, 'P', null) }, { nome: 'Bob', v: P.valorDoServico(banho, 'G', null) }];
    assert.equal(P.fraseDoPet(linhas[1]), 'Bob (porte G): R$ 89,90');
    assert.equal(P.totalPorExtenso(linhas), 'R$ 139,80');
    assert.equal(P.comDesconto(linhas[0].v), false);
  });
  await t('pet sem porte e preço que muda com o porte: a faixa, e o total também vira faixa', () => {
    const v = P.valorDoServico(banho, null, quinta);
    assert.equal(v.valor, undefined); assert.equal(v.de, 42.41); assert.equal(v.ate, 101.91);
    assert.equal(P.fraseDoPet({ nome: 'Thor', v }), 'Thor (sem porte): de R$ 42,41 a R$ 101,91, conforme o porte');
    const linhas = [{ nome: 'Mel', v: P.valorDoServico(banho, 'P', quinta) }, { nome: 'Thor', v }];
    assert.equal(P.totalDoPedido(linhas).valor, null);
    assert.equal(P.totalPorExtenso(linhas), 'de R$ 84,82 a R$ 144,32');
  });
  await t('um preço só: vale para qualquer porte e para quem não disse o porte', () => {
    const unha = { preco_p: 35.5, preco_m: 35.5, preco_g: 35.5, preco_gg: 35.5 };
    assert.equal(P.valorDoServico(unha, null, null).valor, 35.5);
    assert.equal(P.valorDoServico(unha, 'GG', quinta).valor, 30.17); // 35,50 − 5,33 (5,325 arredonda no centavo)
  });
  await t('serviço sem preço no link: sem valor (a página diz que o pet shop passa pelo WhatsApp)', () => {
    assert.equal(P.valorDoServico({ preco_p: null, preco_m: null, preco_g: null, preco_gg: null }, 'P', quinta), null);
    assert.equal(P.totalPorExtenso([]), null);
  });
  await t('desconto em reais vai até o preço (nunca abaixo de zero)', () => {
    assert.equal(P.valorDoServico(banho, 'P', { nome: 'x', tipo: 'reais', valor: 10 }).valor, 39.9);
    assert.equal(P.valorDoServico(banho, 'P', { nome: 'x', tipo: 'reais', valor: 80 }).valor, 0);
  });
  await t('o que o banco guardou (pedidos_valores.visto) vira as mesmas linhas, com números de verdade', () => {
    const v = P.lerVisto({ tipo: 'servico', porte: 'G', base: '89.90', valor: '76.41', promo: { nome: 'Quinta do banho', tipo: 'pct', valor: 15 } });
    assert.deepEqual([v.base, v.valor, v.promo.nome], [89.9, 76.41, 'Quinta do banho']);
    assert.equal(P.fraseDoPet({ nome: 'Bob', v }), 'Bob (porte G): de R$ 89,90 por R$ 76,41');
    assert.equal(P.lerVisto(null), null); assert.equal(P.lerVisto({ tipo: 'outra coisa' }), null);
    const hotel = [{ nome: 'Nina', v: P.lerVisto({ tipo: 'hotel', noites: 3, valor: 287.7, total: 546.63 }) }, { nome: 'Bob', v: P.lerVisto({ tipo: 'hotel', noites: 3, valor: 258.93, total: 546.63 }) }];
    assert.equal(P.totalPorExtenso(hotel), 'R$ 546,63');
    assert.equal(P.valorNaFrase(hotel), 'cerca de R$ 546,63 (3 noites; Nina R$ 287,70 e Bob R$ 258,93)');
    assert.equal(P.valorNaFrase([{ nome: 'Nina', v: P.lerVisto({ tipo: 'creche', dias: 2, diaria: 62.5, valor: 125, total: 125 }) }]), 'cerca de R$ 125,00 (2 dias)');
  });
  await t('"R$ 1.234,50": milhar com ponto, centavos sempre', () => { assert.equal(P.real(1234.5), 'R$ 1.234,50'); assert.equal(P.real(60), 'R$ 60,00'); });

  T.secao('endereço do pet shop');
  const loja = { endereco: ' Rua das Flores, 120 ', complemento: 'loja 2', bairro: 'Vila Nova', cidade: 'São Paulo', uf: 'SP' };
  await t('endereço por extenso, em linha e a frase da mensagem', () => {
    assert.equal(E.enderecoDaLoja(loja), 'Rua das Flores, 120, loja 2 · Vila Nova · São Paulo/SP');
    assert.equal(E.enderecoEmLinha(loja), 'Rua das Flores, 120, loja 2, Vila Nova, São Paulo/SP');
    assert.equal(E.fraseDoEndereco(loja), ' Nosso endereço: Rua das Flores, 120, loja 2, Vila Nova, São Paulo/SP.');
  });
  await t('só cidade e UF não é endereço: nada de "Abrir no mapa" nem frase na mensagem', () => {
    const so = { cidade: 'São Paulo', uf: 'SP' };
    assert.equal(E.enderecoDaLoja(so), null); assert.equal(E.linkDoMapa(so, 'Loja'), null); assert.equal(E.fraseDoEndereco(so), '');
    assert.equal(E.enderecoDaLoja(null), null);
  });
  await t('o link do mapa é uma busca com o nome, a rua, o bairro e a cidade (sem o complemento)', () => {
    const u = new URL(E.linkDoMapa(loja, 'Banho da Vila'));
    assert.equal(u.origin + u.pathname, 'https://www.google.com/maps/search/');
    assert.equal(u.searchParams.get('api'), '1');
    assert.equal(u.searchParams.get('query'), 'Banho da Vila, Rua das Flores, 120, Vila Nova, São Paulo, SP');
  });
  await t('a confirmação do horário diz o endereço quando ele existe, e fica como era sem ele', () => {
    const base = { tutor: 'Ana Souza', pet: 'Mel', sexo: 'F', servico: 'Banho', quando: 'segunda, 16/11', hora: '09:00', petshop: 'Banho da Vila' };
    const com = A.textoConfirmacao({ ...base, onde: E.enderecoEmLinha(loja) });
    assert.match(com, /às 09:00\. Nosso endereço: Rua das Flores, 120, loja 2, Vila Nova, São Paulo\/SP\. Qualquer coisa/);
    assert.doesNotMatch(A.textoConfirmacao(base), /endereço/);
    assert.equal(A.textoConfirmacao(base), A.textoConfirmacao({ ...base, onde: null }));
  });

  T.secao('Adicionar à agenda (.ics)');
  await t('um evento por horário confirmado, em UTC, com o endereço e os textos com escape', () => {
    const ics = I.icsDaAgenda([{ id: 'abc-0', titulo: 'Banho de Mel · Banho, Tosa & Cia', inicio: '2026-11-19T17:00:00.000Z', fim: '2026-11-19T18:00:00.000Z', onde: 'Rua das Flores, 120; loja 2', descricao: 'Linha 1\nLinha 2' }], new Date('2026-11-18T12:00:00Z'));
    assert.match(ics, /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/);
    assert.match(ics, /DTSTART:20261119T170000Z\r\nDTEND:20261119T180000Z/);
    assert.match(ics, /SUMMARY:Banho de Mel · Banho\\, Tosa & Cia\r\n/);
    assert.match(ics, /LOCATION:Rua das Flores\\, 120\\; loja 2\r\n/);
    assert.match(ics, /DESCRIPTION:Linha 1\\nLinha 2\r\n/);
    assert.match(ics, /UID:abc-0@maestropet\r\nDTSTAMP:20261118T120000Z/);
    assert.match(ics, /END:VEVENT\r\nEND:VCALENDAR\r\n$/);
  });
  await t('data inválida ou fim antes do começo: sem arquivo; linha comprida é dobrada em 75', () => {
    assert.equal(I.icsDaAgenda([{ id: 'x', titulo: 't', inicio: 'ontem', fim: 'hoje' }]), null);
    assert.equal(I.icsDaAgenda([{ id: 'x', titulo: 't', inicio: '2026-11-19T18:00:00Z', fim: '2026-11-19T17:00:00Z' }]), null);
    const ics = I.icsDaAgenda([{ id: 'x', titulo: 'á'.repeat(120), inicio: '2026-11-19T17:00:00Z', fim: '2026-11-19T18:00:00Z' }]);
    assert.ok(ics.split('\r\n').every((l) => Buffer.byteLength(l, 'utf8') <= 75), 'alguma linha passou de 75 octetos');
  });

  T.secao('Tirar dúvida: promoções, endereço e pergunta de duas partes');
  const horario = Object.fromEntries([1, 2, 3, 4, 5].map((d) => [String(d), { abre: '08:00', fecha: '18:00' }]));
  const dados = (mais = {}) => ({
    info: { nome: 'Banho da Vila', cidade: 'São Paulo', uf: 'SP', horario, hoje: '2026-11-16', aviso: null,
      servicos: [{ id: 'uuid-banho', nome: 'Banho', duracao_min: 60, ...banho }, { id: 'uuid-unha', nome: 'Corte de unhas', duracao_min: 15, preco_p: null, preco_m: null, preco_g: null, preco_gg: null }],
      creche: null, hotel: null, ...(mais.info ?? {}) },
    fechados: [],
    promocoes: mais.promocoes ?? [{ nome: 'Quinta do banho', dias: [4], hora_de: null, hora_ate: null, tipo: 'pct', valor: 15, comeca_em: null, termina_em: null, banho_tosa: true, casa: [], servicos: ['uuid-banho', 'uuid-unha'] }],
    opcoes: null,
  });
  await t('o contexto tem a promoção com o preço de cada porte já calculado (de X por Y)', () => {
    const c = L.contextoDoLink(dados());
    assert.match(c, /Promoção "Quinta do banho": 15% de desconto, quinta\./);
    assert.match(c, /S1 \(Banho\) na promoção: porte P de R\$ 49,90 por R\$ 42,41, porte M de R\$ 64,90 por R\$ 55,16, porte G de R\$ 89,90 por R\$ 76,41, porte GG de R\$ 119,90 por R\$ 101,91/);
    assert.match(c, /S2 \(Corte de unhas\): entra na promoção; o preço não está no link/);
  });
  await t('promoção vencida ou de serviço que não está no link fica de fora; sem nenhuma, o contexto diz isso', () => {
    const vencida = L.contextoDoLink(dados({ promocoes: [{ nome: 'Velha', dias: [4], tipo: 'pct', valor: 15, termina_em: '2026-11-01', servicos: ['uuid-banho'], casa: [] }] }));
    assert.doesNotMatch(vencida, /Velha/); assert.match(vencida, /Promoções: nenhuma no link agora/);
    assert.match(L.contextoDoLink(dados({ promocoes: [{ nome: 'De outro', dias: [4], tipo: 'pct', valor: 15, servicos: ['uuid-que-nao-existe'], casa: [] }] })), /Promoções: nenhuma/);
  });
  await t('endereço no contexto quando o pet shop escreveu a rua; sem ela, o assistente não inventa', () => {
    assert.match(L.contextoDoLink(dados({ info: { endereco: 'Rua das Flores, 120', bairro: 'Vila Nova' } })), /Endereço: Rua das Flores, 120, Vila Nova, São Paulo \/ SP/);
    assert.match(L.contextoDoLink(dados()), /o endereço completo não está no link/);
  });
  await t('uso dos dados: o contexto explica (vão só para o pet shop; link Privacidade)', () => {
    assert.match(L.contextoDoLink(dados()), /Dados do cliente: .*vai só para Banho da Vila.*Privacidade/);
  });
  await t('as instruções mandam responder a parte que dá e citar a promoção do dia', () => {
    assert.match(L.INSTRUCOES_LINK_IA, /mais de uma parte: responda TODAS as partes que estão nos dados/);
    assert.match(L.INSTRUCOES_LINK_IA, /\[\[RESTO_NO_WHATSAPP\]\]/);
    assert.match(L.INSTRUCOES_LINK_IA, /Promoção: quando o cliente perguntar o preço para um dia/);
  });
  await t('resposta pela metade: fica o que o assistente respondeu, com o botão do WhatsApp para o resto', () => {
    const d = dados();
    const r = L.lerResposta('Na quinta, o Banho para porte G sai de R$ 89,90 por R$ 76,41, na promoção Quinta do banho. O endereço é com o pet shop, pelo WhatsApp. [[RESTO_NO_WHATSAPP]]', d);
    assert.equal(r.naoSei, false); assert.equal(r.resto, true);
    assert.match(r.texto, /R\$ 76,41/); assert.doesNotMatch(r.texto, /\[\[/);
    // o modelo antigo punha [[NAO_SEI]] junto de uma resposta boa: a resposta não some mais
    const misto = L.lerResposta('O Banho para porte G custa R$ 89,90. [[NAO_SEI]]', d);
    assert.equal(misto.naoSei, false); assert.equal(misto.resto, true); assert.match(misto.texto, /R\$ 89,90/);
    // só a marca (ou quase nada): continua sendo "não sei"
    assert.equal(L.lerResposta('[[NAO_SEI]]', d).naoSei, true);
    assert.equal(L.lerResposta('Não sei. [[NAO_SEI]]', d).naoSei, true);
    assert.equal(L.lerResposta('O Banho custa R$ 89,90 para porte G.', d).resto, undefined);
  });
  await t('resposta de teste: "Quanto fica o banho na quinta? E qual o endereço?" responde o preço da promoção e manda o resto ao WhatsApp', () => {
    const d = dados();
    const bruto = L.respostaDeTeste('Quanto fica o banho de um cachorro grande na quinta? E qual o endereço de vocês?', L.contextoDoLink(d), d);
    assert.match(bruto, /porte G de R\$ 89,90 por R\$ 76,41/); assert.match(bruto, /\[\[RESTO_NO_WHATSAPP\]\]/);
    const r = L.lerResposta(bruto, d);
    assert.equal(r.naoSei, false); assert.equal(r.resto, true);
    // com o endereço preenchido, as duas partes são respondidas e não há resto
    const d2 = dados({ info: { endereco: 'Rua das Flores, 120' } });
    const tudo = L.lerResposta(L.respostaDeTeste('Quanto fica o banho de um cachorro grande na quinta? E qual o endereço de vocês?', L.contextoDoLink(d2), d2), d2);
    assert.equal(tudo.resto, undefined); assert.match(tudo.texto, /Rua das Flores, 120/); assert.match(tudo.texto, /R\$ 76,41/);
  });

  T.secao('a abertura do link numa ida só (também pelo navegador)');
  const junto = { info: { nome: 'Loja', hotel: { diaria: 100 } }, nome: 'Loja', contato: { nome: 'Loja', telefone: '11999990000' }, google: null, promocoes: [], fechados: ['2026-12-25'], ia: true, hotel: { preco: { mostrar: true } }, opcoes: { termos: null } };
  const leitor = (o) => { const chamadas = []; return { chamadas, ler: async (f) => { chamadas.push(f); return o(f); } }; };
  await t('banco com link_inicial: uma chamada, com o WhatsApp do link junto', async () => {
    const X = leitor((f) => (f === 'link_inicial' ? { data: junto, error: null } : { data: null, error: { message: 'não devia chamar' } }));
    const r = await J.lerLinkJunto(X.ler, 'abc');
    assert.deepEqual(X.chamadas, ['link_inicial']);
    assert.equal(r.telefone, '11999990000'); assert.equal(r.nome, 'Loja'); assert.equal(r.ia, true); assert.deepEqual(r.fechados, ['2026-12-25']);
  });
  await t('link desligado: info vazia, mas o nome e o WhatsApp de quem é o link vêm (a página oferece o botão)', async () => {
    const X = leitor(() => ({ data: { ...junto, info: null, nome: null }, error: null }));
    const r = await J.lerLinkJunto(X.ler, 'abc');
    assert.equal(r.info, null); assert.equal(r.nome, 'Loja'); assert.equal(r.telefone, '11999990000'); assert.equal(r.ia, false);
  });
  await t('o banco falhou ou demorou: undefined, sem repetir em oito; só banco sem a função lê as oito', async () => {
    const X = leitor(() => ({ data: null, error: { code: '57014', message: 'timeout' } }));
    assert.equal(await J.lerLinkJunto(X.ler, 'abc'), undefined);
    assert.deepEqual(X.chamadas, ['link_inicial']);
    const Y = leitor((f) => (f === 'link_inicial' ? { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } } : { data: f === 'link_info' ? junto.info : f === 'link_nome' ? 'Loja' : null, error: null }));
    const r = await J.lerLinkJunto(Y.ler, 'abc');
    assert.equal(Y.chamadas.length, 9); assert.equal(r.nome, 'Loja'); assert.equal(r.telefone, undefined);
  });
}))();
