// Unidade: o Mozart mais rápido e com voz melhor.
//  - Voz (src/lib/gestao/fala.ts): a melhor voz em português do aparelho (natural do Edge > Google > aprimorada da Apple >
//    outras do Brasil > Portugal), a escolhida pela pessoa, nome curto na lista; o texto limpo para falar (sem markdown, emoji
//    e símbolos; "R$ 60,00" = "60 reais", "10h30" = "10 e 30", "20/11" = "20 de novembro") e as frases que fecham enquanto o
//    texto chega aos poucos.
//  - Frases do que o Mozart está fazendo (assistente/progresso.ts): toda consulta tem a sua; "Procurando Thor…", "agenda de amanhã".
//  - Voltas (assistente/conversa.ts) com modelo de mentira: o texto vai aos poucos, as consultas de uma volta rodam ao mesmo
//    tempo e voltam na ordem pedida, e os tokens são somados. Sem banco: as consultas usam um Supabase de mentira.
//  - O contexto já traz os próximos dias (menos consultas) e a rota usa no máximo 4 marcas de cache.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { lib } = require('../lib/app');
const { RAIZ } = require('../lib/base');
const T = require('../lib/teste')('unidade-mozart-rapido');
const V = lib('fala');
const P = lib('assistente/progresso');
const C = lib('assistente/conversa');
const F = lib('assistente/ferramentas');
const I = lib('assistente/instrucoes');
const t = (nome, f) => { try { f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };
const ta = async (nome, f) => { try { await f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };

(async () => T.rodar(async () => {
  T.secao('escolha da voz');
  const edge = [
    { name: 'Microsoft Maria - Portuguese (Brazil)', lang: 'pt-BR', voiceURI: 'maria' },
    { name: 'Microsoft Antonio Online (Natural) - Portuguese (Brazil)', lang: 'pt-BR', voiceURI: 'antonio' },
    { name: 'Microsoft Francisca Online (Natural) - Portuguese (Brazil)', lang: 'pt-BR', voiceURI: 'francisca' },
    { name: 'Microsoft Raquel Online (Natural) - Portuguese (Portugal)', lang: 'pt-PT', voiceURI: 'raquel' },
    { name: 'Microsoft Aria Online (Natural) - English (United States)', lang: 'en-US', voiceURI: 'aria' },
  ];
  const chrome = [
    { name: 'Google US English', lang: 'en-US' },
    { name: 'Google português do Brasil', lang: 'pt-BR' },
    { name: 'Luciana', lang: 'pt-BR' },
  ];
  const android = [{ name: 'Português Portugal', lang: 'pt_PT' }, { name: 'Português Brasil', lang: 'pt_BR' }];
  t('Edge: uma voz natural do Brasil, não a Maria antiga nem a de Portugal', () => assert.match(V.melhorVoz(edge).name, /(Francisca|Antonio) Online \(Natural\).*Brazil/));
  t('Edge: entre as naturais, a Francisca', () => assert.equal(V.melhorVoz(edge).voiceURI, 'francisca'));
  t('Chrome: "Google português do Brasil"', () => assert.equal(V.melhorVoz(chrome).name, 'Google português do Brasil'));
  t('Android (pt_BR com sublinhado): a do Brasil', () => assert.equal(V.melhorVoz(android).name, 'Português Brasil'));
  t('só Portugal: usa Portugal', () => assert.equal(V.melhorVoz([{ name: 'Joana', lang: 'pt-PT' }, { name: 'Samantha', lang: 'en-US' }]).name, 'Joana'));
  t('Safari: aprimorada antes da comum', () => assert.equal(V.melhorVoz([{ name: 'Luciana', lang: 'pt-BR' }, { name: 'Luciana (Enhanced)', lang: 'pt-BR' }]).name, 'Luciana (Enhanced)'));
  t('sem português: nenhuma (o alto-falante some e aparece a dica)', () => assert.equal(V.melhorVoz([{ name: 'Samantha', lang: 'en-US' }]), null));
  t('a escolhida pela pessoa vale, se existe neste aparelho', () => { assert.equal(V.melhorVoz(edge, 'maria').voiceURI, 'maria'); assert.equal(V.melhorVoz(edge, 'sumiu').voiceURI, 'francisca'); });
  t('não escolhe voz em inglês nem quando é a escolhida', () => assert.equal(V.melhorVoz(edge, 'aria').voiceURI, 'francisca'));
  t('lista só português, melhor primeiro', () => assert.deepEqual(V.vozesEmPortugues(edge).map((v) => v.voiceURI), ['francisca', 'antonio', 'maria', 'raquel']));
  t('nome curto na lista', () => { assert.equal(V.nomeDaVoz(edge[2]), 'Francisca (natural)'); assert.equal(V.nomeDaVoz(edge[3]), 'Raquel (natural) (Portugal)'); });

  T.secao('texto para falar');
  const f = V.textoParaFalar;
  t('dinheiro', () => {
    assert.equal(f('Ficou R$ 60,00.'), 'Ficou 60 reais.');
    assert.equal(f('Total R$ 1.250,50'), 'Total 1250 reais e 50 centavos.');
    assert.equal(f('R$ 1,00 e R$ 0,50 e R$ 35'), '1 real e 50 centavos e 35 reais.');
    assert.equal(f('R$60'), '60 reais.');
  });
  t('horas e datas', () => {
    assert.equal(f('sexta, 20/11 às 10h30'), 'sexta, 20 de novembro às 10 e 30.');
    assert.equal(f('às 14h e às 9:00'), 'às 14 horas e às 9 horas.');
    assert.equal(f('15:45'), '15 e 45.');
  });
  t('sem markdown, link, emoji e símbolos', () => {
    assert.equal(f('**Prontinho!** Marquei o _banho_ 🐶✨ · veja https://x.com/a'), 'Prontinho! Marquei o banho veja.');
    assert.equal(f('# Agenda\n- Thor | 10h\n- Mel | 11h30'), 'Agenda. Thor 10 horas. Mel 11 e 30.');
    assert.equal(f('Veja [o link](https://a.b) & pronto'), 'Veja o link e pronto.');
  });
  t('frases para falar uma de cada vez', () => assert.deepEqual(V.dividirEmFrases(f('Oi! Marquei o Thor. Quer mais algo?')), ['Oi!', 'Marquei o Thor.', 'Quer mais algo?']));
  t('frase muito longa é cortada nas vírgulas', () => {
    const longa = Array.from({ length: 30 }, (_, i) => `item ${i}`).join(', ') + '.';
    const partes = V.dividirEmFrases(longa);
    assert.ok(partes.length > 1 && partes.every((p) => p.length <= 220), partes.map((p) => p.length));
  });
  t('aos poucos: fala cada frase quando fecha, não corta "R$ 1.250" nem "10h30"', () => {
    const j = V.criarJuntaFrases();
    const ditas = [];
    for (const p of ['Marquei o ', 'Thor às 10', 'h30 por R$ 1.', '250,00', '. Quer ', 'mais algo', '?']) ditas.push(...j.acrescentar(p));
    assert.deepEqual(ditas, ['Marquei o Thor às 10 e 30 por 1250 reais.']);
    assert.deepEqual(j.terminar(), ['Quer mais algo?']);
  });
  t('aos poucos: quebra de linha fecha o item da lista', () => {
    const j = V.criarJuntaFrases();
    assert.deepEqual(j.acrescentar('Thor 10h\nMel'), ['Thor 10 horas.']);
    assert.deepEqual(j.terminar(), ['Mel.']);
  });

  T.secao('frases enquanto espera');
  const leitura = F.FERRAMENTAS.filter((x) => !x.grava).map((x) => x.name);
  t('toda consulta tem frase própria', () => assert.deepEqual(leitura.filter((n) => !P.FERRAMENTAS_COM_FRASE.includes(n)), []));
  t('"Procurando Thor…" (o nome que a pessoa disse, limpo)', () => { assert.equal(P.fraseDaFerramenta('buscar_pets', { termo: 'thor' }), 'Procurando Thor…'); assert.equal(P.fraseDaFerramenta('buscar_pets', { termo: '  mel*** ' }), 'Procurando Mel…'); });
  t('antes de saber o nome: frase geral', () => assert.equal(P.fraseDaFerramenta('buscar_pets'), 'Procurando o pet…'));
  t('agenda de hoje, amanhã e de um dia', () => {
    const agora = '2026-11-17T10:00';
    assert.equal(P.fraseDaFerramenta('ver_agenda', { de: '2026-11-18', ate: '2026-11-18' }, agora), 'Olhando a agenda de amanhã…');
    assert.equal(P.fraseDaFerramenta('ver_agenda', { de: '2026-11-17', ate: '2026-11-17' }, agora), 'Olhando a agenda de hoje…');
    assert.equal(P.fraseDaFerramenta('horarios_livres', { dia: '2026-11-20' }, agora), 'Vendo os horários livres de sexta, 20/11…');
    assert.equal(P.fraseDaFerramenta('resumo_financeiro', { de: '2026-11-11', ate: '2026-11-17' }, agora), 'Somando o dinheiro da semana…');
  });
  t('caixa e ferramenta que grava', () => { assert.equal(P.fraseDaFerramenta('ver_caixa', {}), 'Conferindo o caixa…'); assert.equal(P.fraseDaFerramenta('marcar_horario', {}, undefined, true), 'Preparando para você conferir…'); });

  T.secao('voltas: aos poucos, em paralelo e medidas');
  // Supabase de mentira: cada consulta demora 120 ms e devolve vazio
  const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
  let abertas = 0, maxAbertas = 0;
  const consulta = () => {
    let um = false;
    const q = new Proxy({}, { get: (_, k) => (k === 'then' ? (ok) => { abertas++; maxAbertas = Math.max(maxAbertas, abertas); espera(120).then(() => { abertas--; ok({ data: um ? null : [], error: null, count: 0 }); }); } : (...a) => { if (k === 'single' || k === 'maybeSingle') um = true; return q; }) });
    return q;
  };
  const sb = { from: consulta, rpc: consulta };
  const c = { sb, userId: 'u', petshop: { id: 'p', nome: 'Loja', horario: null, modulos: [] }, eu: { nome: 'Bia', papel: 'dono', ativo: true, atende: true }, equipe: [], servicos: [], vejoFinanceiro: true, cuidoDoFinanceiro: true, fusoMin: -180, agora: '2026-11-17T10:00' };
  const usar = (id, name, input) => ({ type: 'tool_use', id, name, input });
  const gasto = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 900, cache_creation_input_tokens: 10 };
  await ta('três consultas na mesma volta rodam juntas, os resultados voltam na ordem pedida', async () => {
    const pedidos = [usar('a', 'ver_caixa', {}), usar('b', 'ver_agenda', { de: '2026-11-18', ate: '2026-11-18' }), usar('c', 'clientes_sumidos', { dias: 30 })];
    let n = 0;
    const textos = [], frases = [];
    const medidas = C.medidasZeradas();
    const t0 = Date.now();
    const s = await C.voltas({
      c, mensagens: [{ role: 'user', content: 'como está hoje?' }], liberado: true, contar: async () => true, medidas,
      avisos: { texto: (d) => textos.push(d), progresso: (f) => frases.push(f) },
      chamar: async (msgs, ao) => {
        n++;
        if (n === 1) { ao.texto('Vou '); ao.texto('olhar.'); ao.ferramenta('ver_caixa'); return { content: [{ type: 'text', text: 'Vou olhar.' }, ...pedidos], stop_reason: 'tool_use', usage: gasto }; }
        const r = msgs[msgs.length - 1].content;
        assert.deepEqual(r.map((x) => x.tool_use_id), ['a', 'b', 'c']);
        ao.texto('Tudo '); ao.texto('certo.');
        return { content: [{ type: 'text', text: 'Tudo certo.' }], stop_reason: 'end_turn', usage: gasto };
      },
    });
    const ms = Date.now() - t0;
    assert.equal(s.texto, 'Vou olhar.\n\nTudo certo.');
    assert.equal(textos.join(''), 'Vou olhar.\n\nTudo certo.', 'o texto aos poucos é igual ao final');
    assert.ok(frases.includes('Conferindo o caixa…') && frases.includes('Olhando a agenda de amanhã…') && frases.includes('Vendo quem está sumido…'), frases);
    assert.ok(maxAbertas >= 2, `consultas ao mesmo tempo: ${maxAbertas}`);
    assert.deepEqual(medidas, { voltas: 2, ferramentas: 3, entrada: 200, saida: 40, cacheLidos: 1800, cacheGravados: 20 });
    console.log(`        (3 consultas de 120 ms em ${ms} ms)`);
  });
  await ta('cartão continua parando para a pessoa confirmar (nada gravado)', async () => {
    const s = await C.voltas({
      c, mensagens: [{ role: 'user', content: 'abre o caixa com 50' }], liberado: true, contar: async () => true,
      chamar: async () => ({ content: [usar('x', 'ver_caixa', {}), usar('y', 'abrir_caixa', { troco: 50 })], stop_reason: 'tool_use' }),
    });
    assert.equal(s.propostas.length, 1);
    assert.equal(s.propostas[0].ferramenta, 'abrir_caixa');
    assert.deepEqual(s.parciais.map((p) => p.tool_use_id), ['x']);
  });

  T.secao('contexto e cache');
  t('o contexto traz hoje e os próximos 7 dias', () => assert.match(I.contextoDoPetshop(c), /Hoje: terça 17\/11\/2026\. Próximos dias: amanhã quarta 18\/11, quinta 19\/11, sexta 20\/11, sábado 21\/11, domingo 22\/11, segunda 23\/11, terça 24\/11\./));
  t('as instruções pedem consultas de uma vez', () => assert.match(I.INSTRUCOES, /peça todas de uma vez/));
  t('a rota usa no máximo 4 marcas de cache (instruções, contexto e a conversa)', () => {
    const rota = fs.readFileSync(path.join(RAIZ, 'src/app/api/gestao/assistente/route.ts'), 'utf8');
    const n = (rota.match(/cache_control:/g) || []).length;
    assert.ok(n >= 2 && n <= 4, n);
    assert.match(rota, /effort: "low"/);
  });
}))();
