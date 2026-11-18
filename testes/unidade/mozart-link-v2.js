// Unidade: Mozart e "Tirar dúvida" do link depois da 2ª rodada dos testadores, sem banco e sem chamar o modelo.
//  - Bia M-n1: o "Tirar dúvida" não desmente um total que veio da estimativa (regra nas instruções + frase que manda
//    desconsiderar sai da resposta).
//  - Rafael N3/I4: o "Tirar dúvida" sabe os planos mensais da creche (os da página) e o táxi pet, sem valor com o preço escondido.
//  - Juliana N1: a linha "Pensando…" sai antes da primeira chamada ao modelo e a cada volta (modelo de mentira lento).
//  - Juliana N2: nome interno de ferramenta ("resumo_financeiro") nunca chega à pessoa.
//  - Rafael C: ver_planos_creche diz o táxi do plano; as instruções não dizem mais que mensalista não tem leva e traz.
//  - Rafael F: o feriado dos próximos 14 dias vai no contexto do Mozart.
//  - Bia L-n1: as instruções mandam falar do que a loja fez sem "eu".
//  - Juliana N3: a resposta cortada por um recarregar volta guardada como interrompida.
//  - Camila M6b: ver_maquininha existe, é de quem cuida do financeiro e aponta para Relatórios.
const assert = require('node:assert/strict');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('unidade-mozart-link-v2');
const L = lib('link-ia');
const C = lib('assistente/conversa');
const F = lib('assistente/ferramentas');
const I = lib('assistente/instrucoes');
const P = lib('assistente/progresso');
const N = lib('assistente/sem-nomes');
const G = lib('assistente/guardada');
const t = (nome, f) => { try { f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };
const ta = async (nome, f) => { try { await f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };

const horario = { "0": null, "1": { abre: "07:00", fecha: "19:00" }, "2": { abre: "07:00", fecha: "19:00" }, "3": { abre: "07:00", fecha: "19:00" }, "4": { abre: "07:00", fecha: "19:00" }, "5": { abre: "07:00", fecha: "19:00" }, "6": null };
const creche = (extra = {}) => ({
  info: { nome: "Creche do Rafa", cidade: "Campinas", uf: "SP", horario, hoje: "2026-11-18", servicos: [], creche: { diaria: 95 }, hotel: null },
  fechados: ["2026-11-20"],
  hotel: null, opcoes: null, experiencia: null, espera: false,
  planos: { planos: [{ nome: "2x por semana", vezes: 2, valor: 560 }, { nome: "Plano 3 dias", vezes: 3, valor: 780 }, { nome: "Todo dia", vezes: 5, valor: 1190 }], pix: "rafa@pix.com" },
  taxi: { sem_preco: false, modo: "bairro", valor: null, bairros: [{ nome: "Cambuí", valor: 35 }, { nome: "Taquaral", valor: 45 }], mensalista: true },
  ...extra,
});

(async () => T.rodar(async () => {
  T.secao('Bia M-n1: o total da estimativa não é desmentido');
  t('a frase "não vieram do cálculo oficial, desconsidere" sai; o valor novo fica', () => {
    const bruto = 'Sem o porte, fica R$ 372,60 para os dois, com sinal de R$ 111,78. Também preciso corrigir minha resposta anterior: o total de R$ 418,60 e o sinal de R$ 125,58 que eu informei não vieram do cálculo oficial, então desconsidere esses valores.';
    const r = L.lerResposta(bruto, creche());
    assert.match(r.texto, /R\$ 372,60/); assert.match(r.texto, /R\$ 111,78/);
    assert.doesNotMatch(r.texto, /desconsider|corrigir|418,60/i);
  });
  t('número com ponto de milhar não quebra a frase ao meio', () => {
    assert.equal(L.semDesmentir('O total fica R$ 1.250,50. Desconsidere o valor de antes.'), 'O total fica R$ 1.250,50.');
    assert.equal(L.semDesmentir('O plano 5x custa R$ 1.190,00 por mês.'), 'O plano 5x custa R$ 1.190,00 por mês.');
  });
  t('a regra está nas instruções: o histórico não mostra as ferramentas, nunca desmentir', () => {
    assert.match(L.INSTRUCOES_LINK_IA, /histórico não mostra as chamadas/); assert.match(L.INSTRUCOES_LINK_IA, /nunca peça para desconsiderar/);
  });

  T.secao('Rafael N3/I4: planos mensais e táxi pet no Tirar dúvida');
  t('o contexto tem os planos com o preço da página e o Pix', () => {
    const c = L.contextoDoLink(creche());
    assert.match(c, /Planos mensais da creche/); assert.match(c, /- 2x por semana: R\$ 560 por mês/); assert.match(c, /- Plano 3 dias: R\$ 780 por mês/);
    assert.match(c, /- Todo dia, 5 dias por semana: R\$ 1\.190 por mês/); assert.match(c, /Pix: rafa@pix\.com/);
  });
  t('"Quanto é o plano de 3 vezes por semana?" responde R$ 780 (roteiro de teste lendo o contexto)', () => {
    const d = creche();
    const r = L.lerResposta(L.respostaDeTeste('Quanto é o plano de 3 vezes por semana?', L.contextoDoLink(d), d), d);
    assert.equal(r.naoSei, false); assert.match(r.texto, /R\$ 780 por mês/); assert.doesNotMatch(r.texto, /560/);
  });
  t('"Vocês têm táxi dog? Quanto custa?" responde os bairros e o mensalista', () => {
    const d = creche();
    const r = L.lerResposta(L.respostaDeTeste('Vocês têm táxi dog? Quanto custa?', L.contextoDoLink(d), d), d);
    assert.equal(r.naoSei, false); assert.match(r.texto, /Cambuí R\$ 35/); assert.match(r.texto, /Taquaral R\$ 45/);
  });
  t('com o preço escondido no link: planos e táxi sem valor nenhum', () => {
    const d = creche({ planos: { planos: [{ nome: "2x por semana", vezes: 2, valor: null }], pix: null }, taxi: { sem_preco: true, modo: "bairro", bairros: [{ nome: "Cambuí", valor: null }], mensalista: false } });
    const c = L.contextoDoLink(d);
    assert.match(c, /2x por semana: valor não informado no link/); assert.match(c, /Não dê valor de táxi/); assert.doesNotMatch(c, /R\$ 35|R\$ 560/);
  });
  t('sem táxi e sem planos (banco antigo): nada inventado', () => {
    const c = L.contextoDoLink(creche({ planos: null, taxi: null }));
    assert.doesNotMatch(c, /Táxi pet|Planos mensais/);
    const d = creche({ planos: null, taxi: null });
    assert.equal(L.lerResposta(L.respostaDeTeste('tem táxi?', c, d), d).naoSei, true);
  });
  t('taxa fixa: "taxa de R$ 30 (ida e volta)"', () => assert.match(L.contextoDoLink(creche({ taxi: { modo: 'fixo', valor: 30, bairros: null, sem_preco: false } })), /taxa de R\$ 30 \(ida e volta\)/));

  T.secao('Juliana N1: a linha de espera sai logo, a cada volta');
  const c = { sb: {}, userId: 'u', petshop: { id: 'p', nome: 'Loja', modulos: ['banho_tosa'], opcoes: {} }, eu: { nome: 'Ju', papel: 'dono', ativo: true }, equipe: [], servicos: [], vejoFinanceiro: true, cuidoDoFinanceiro: true, fusoMin: -180, agora: '2026-11-17T16:00' };
  await ta('"Pensando…" antes da 1ª chamada; "Juntando a resposta…" antes da 2ª; e o nome da ferramenta não aparece', async () => {
    const eventos = [];
    let i = 0;
    const s = await C.voltas({
      c, mensagens: [{ role: 'user', content: [{ type: 'text', text: 'quanto eu dei de desconto este mês?' }] }], liberado: true, contar: async () => true,
      avisos: { progresso: (f) => eventos.push(`frase:${f}`), texto: (d) => eventos.push(`texto:${d}`) },
      chamar: async (_m, ao) => {
        eventos.push(`modelo:${i}`);
        await new Promise((ok) => setTimeout(ok, 30));
        if (i++ === 0) return { content: [{ type: 'tool_use', id: 'toolu_x1', name: 'naoexiste_teste', input: {} }], stop_reason: 'tool_use' };
        const t2 = 'Os descontos ficam em Financeiro, Alterações. Se quiser, eu puxo o total que entrou no mês com **resumo_financeiro** para você comparar.';
        ao.texto(t2);
        return { content: [{ type: 'text', text: t2 }], stop_reason: 'end_turn' };
      },
    });
    assert.equal(eventos[0], 'frase:Pensando…'); assert.equal(eventos[1], 'modelo:0');
    const k = eventos.indexOf('modelo:1');
    assert.equal(eventos[k - 1], `frase:${P.FRASE_JUNTANDO}`);
    assert.doesNotMatch(s.texto, /resumo_financeiro|_/); assert.match(s.texto, /com \*\*o resumo do dinheiro\*\*/);
  });
  t('depois do "Pode fazer", a primeira frase é "Conferindo o que ficou feito…"', () => assert.equal(P.fraseInicial([{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }] }]), 'Conferindo o que ficou feito…'));

  T.secao('Juliana N2: nomes internos viram palavras');
  t('toda ferramenta do Mozart tem palavras próprias', () => {
    const faltam = F.FERRAMENTAS.map((f) => f.name).filter((n) => !N.NOMES_COM_PALAVRAS.includes(n));
    assert.deepEqual(faltam, []);
  });
  t('artigo antes do nome não duplica; campo desconhecido vira palavras; e-mail e link não mudam', () => {
    assert.equal(N.semNomesDeFerramenta('Olhei o ver_estoque e a creche_por_dia.'), 'Olhei o estoque e a creche por dia.');
    assert.equal(N.semNomesDeFerramenta('Use `ver_agenda` ali.'), 'Use a agenda ali.');
    assert.equal(N.semNomesDeFerramenta('Escreva para ana_maria@site.com.br ou veja site.com/meu_link'), 'Escreva para ana_maria@site.com.br ou veja site.com/meu_link');
  });
  t('as instruções proíbem nome de ferramenta e o "eu" nas ações da loja', () => {
    assert.match(I.INSTRUCOES, /Nunca escreva o nome de uma ferramenta/); assert.match(I.INSTRUCOES, /Foram devolvidos R\$ 54/);
  });

  T.secao('Rafael C e F: táxi do mensalista e feriado');
  t('as instruções não dizem mais que mensalista não tem leva e traz', () => {
    assert.doesNotMatch(I.INSTRUCOES, /Mensalista ainda não tem leva e traz/); assert.match(I.INSTRUCOES, /Mensalista pode ter táxi pet/);
  });
  t('ver_planos_creche fala do táxi do plano', () => assert.match(F.definicao('ver_planos_creche').description, /táxi pet/));
  t('o feriado dos próximos 14 dias vai no contexto (e o passado ou longe não)', () => {
    const ctx = I.contextoDoPetshop({ ...c, petshop: { ...c.petshop, horario }, diasEspeciais: [
      { dia: '2026-11-20', nome: 'Consciência Negra', fechado: true, feriado: true }, { dia: '2026-11-10', nome: 'Velho', fechado: true, feriado: false },
      { dia: '2026-12-25', nome: 'Natal', fechado: true, feriado: true }] });
    assert.match(ctx, /sexta 20\/11 \(Consciência Negra\): fechado, feriado/); assert.doesNotMatch(ctx, /Velho|Natal/);
    assert.match(I.contextoDoPetshop({ ...c, diasEspeciais: [] }), /nos próximos 14 dias: nenhum/);
  });

  T.secao('Camila M6b: o que a maquininha ainda vai pagar');
  t('ver_maquininha só para quem vê dinheiro, com frase de espera e apontando para Relatórios', () => {
    const d = F.definicao('ver_maquininha');
    assert.ok(d && d.financeiro && !d.grava);
    assert.ok(!F.ferramentasPara({ vejoFinanceiro: false }).some((x) => x.name === 'ver_maquininha'));
    assert.ok(P.FERRAMENTAS_COM_FRASE.includes('ver_maquininha'));
    assert.match(I.INSTRUCOES, /ver_maquininha[^.]*Relatórios, cartão Taxas da maquininha/);
  });
  await ta('quem não cuida do financeiro recebe a frase, sem número', async () => {
    const r = await F.rodarConsulta({ ...c, cuidoDoFinanceiro: false }, 'ver_maquininha', {});
    assert.equal(r.erro, true); assert.match(r.conteudo, /quem cuida do financeiro/);
  });

  T.secao('Juliana N3: resposta cortada por um recarregar');
  const guardado = new Map();
  global.window = { sessionStorage: { getItem: (k) => (guardado.has(k) ? guardado.get(k) : null), setItem: (k, v) => guardado.set(k, String(v)), removeItem: (k) => guardado.delete(k) } };
  t('o texto que já tinha chegado volta como interrompido', () => {
    const chave = G.chaveDaConversa('loja', 'ju');
    G.guardarConversa(chave, { itens: [{ tipo: 'eu', texto: 'marca o thor' }], mensagens: [], parciais: [], decidindo: null, esperando: true, aberta: true, interrompida: 'Pronto, o banho e tosa do Thor' });
    const g = G.lerConversa(chave);
    assert.equal(g.esperando, true); assert.equal(g.interrompida, 'Pronto, o banho e tosa do Thor');
    G.guardarConversa(chave, { itens: [{ tipo: 'eu', texto: 'oi' }], mensagens: [], parciais: [], decidindo: null, esperando: false, aberta: true });
    assert.equal(G.lerConversa(chave).interrompida, null);
  });
}))();
