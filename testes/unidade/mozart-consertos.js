// Unidade: os consertos do Mozart e da IA depois dos cinco testadores (rodada final), sem banco e sem chamar o modelo.
//  - Juliana H1: creche e hotel nunca viram horário da agenda (marcar_horario recusa o serviço "Creche diária"; o contexto
//    marca o serviço; o modelo de mentira que tenta marcar na agenda recebe o erro e não sai cartão).
//  - Juliana M1: a foto da tabela de preços manda "Creche diária" para a diária e "Creche mensal 3x semana" para o modelo de plano.
//  - Bia H1: o "Tirar dúvida" conta os dois cães (estimar_hotel com pets: 2), mostra o preço de cada porte, e a creche é
//    calculada no código (estimar_creche).
//  - Neide M6: quem não vê dinheiro nunca ouve "não deve nada" (o contexto e a busca dizem que ela não vê valores).
//  - Juliana M6: a bolha mostra negrito e lista, sem asteriscos.
//  - Juliana L1 / Camila: o texto não pede "Pode fazer" (o cartão já tem o botão).
//  - Juliana M5: a conversa guardada na aba e o cartão que grava uma vez só (a mesma confirmação de novo não grava).
//  - Bia: frase "Olhando quem está no hotel…" numa loja só de hotel.
const assert = require('node:assert/strict');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('unidade-mozart-consertos');
const C = lib('assistente/conversa');
const F = lib('assistente/ferramentas');
const E = lib('assistente/ferramenta-estadia');
const I = lib('assistente/instrucoes');
const P = lib('assistente/progresso');
const M = lib('assistente/markdown');
const G = lib('assistente/guardada');
const TP = lib('tabela-precos');
const CA = lib('caderno');
const L = lib('link-ia');
const t = (nome, f) => { try { f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };
const ta = async (nome, f) => { try { await f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };

(async () => T.rodar(async () => {
  T.secao('Juliana H1: creche e hotel não vão para a agenda');
  const creche = { id: 's-creche', nome: 'Creche diária', categoria: 'outro', duracao_min: 60, ativo: true, preco_p: 60, preco_m: 60, preco_g: 60, preco_gg: 60 };
  const banho = { id: 's-banho', nome: 'Banho', categoria: 'banho', duracao_min: 60, ativo: true, preco_p: 50, preco_m: 60, preco_g: 70, preco_gg: 80 };
  const loja = { id: 'p', nome: 'Banho & Creche', horario: null, modulos: ['banho_tosa', 'creche'], opcoes: {} };
  t('"Creche diária" (categoria errada) é creche pelo nome; "Banho" não', () => { assert.equal(E.servicoDeCasa(creche), 'creche'); assert.equal(E.servicoDeCasa(banho), null); assert.equal(E.servicoDeCasa({ nome: 'Hospedagem', categoria: 'outro' }), 'hotel'); });
  t('com a Creche ligada, marcar na agenda é recusado e manda usar reservar_estadia', () => assert.match(E.agendaNaoEhCasa({ petshop: loja }, creche), /reservar_estadia com tipo "creche".*fazer_checkin/));
  t('loja que não usa creche nem hotel: o serviço da agenda continua valendo', () => assert.equal(E.agendaNaoEhCasa({ petshop: { ...loja, modulos: ['banho_tosa'] } }, creche), null));
  const pet = { id: '11111111-1111-4111-8111-111111111111', nome: 'Pipoca', porte: 'M', alertas: null, clientes: { id: 'c1', nome: 'Juliana', telefone: null } };
  const consulta = () => { let um = false; const q = new Proxy({}, { get: (_, k) => (k === 'then' ? (ok) => ok({ data: um ? pet : [], error: null, count: 0 }) : (...a) => { if (k === 'single' || k === 'maybeSingle') um = true; return q; }) }); return q; };
  const sb = { from: consulta, rpc: consulta };
  const c = { sb, userId: 'u', petshop: loja, eu: { nome: 'Juliana', papel: 'dono', ativo: true, atende: true }, equipe: [], servicos: [banho, creche], vejoFinanceiro: true, cuidoDoFinanceiro: true, fusoMin: -180, agora: '2026-11-17T16:00' };
  await ta('modelo que tenta "Marcar horário" de creche: nada de cartão, o erro manda usar reservar_estadia', async () => {
    let n = 0, erro = null;
    const s = await C.voltas({ c, mensagens: [{ role: 'user', content: 'coloca a Pipoca na creche amanhã, o dia todo' }], liberado: true, contar: async () => true,
      chamar: async (msgs) => {
        n++;
        if (n === 1) return { content: [{ type: 'tool_use', id: 'toolu_a1', name: 'marcar_horario', input: { pet_id: pet.id, servico_id: 's-creche', inicio: '2026-11-18T08:00' } }], stop_reason: 'tool_use' };
        erro = msgs[msgs.length - 1].content[0];
        return { content: [{ type: 'text', text: 'Vou reservar na creche.' }], stop_reason: 'end_turn' };
      } });
    assert.equal(s.propostas.length, 0);
    assert.ok(erro && erro.is_error && /reservar_estadia/.test(erro.content), JSON.stringify(erro));
  });
  t('a ferramenta reservar_estadia existe, grava (cartão) e diz que não entra na agenda', () => { const d = F.definicao('reservar_estadia'); assert.ok(d && d.grava); assert.match(d.description, /nunca na agenda/); });
  t('marcar_horario avisa: nunca para creche nem hotel', () => assert.match(F.definicao('marcar_horario').description, /Nunca para creche nem hotel/));
  t('o contexto marca o serviço de creche da lista e as instruções mandam reservar_estadia', () => {
    assert.match(I.contextoDoPetshop(c), /Creche diária \|.*é creche\/hotel: não marque na agenda/);
    assert.doesNotMatch(I.contextoDoPetshop(c).split('\n').find((l) => l.startsWith('- Banho')), /creche\/hotel/);
    assert.match(I.INSTRUCOES, /nunca use marcar_horario para creche/);
  });

  T.secao('Rafael: quem vem na creche em cada dia (mensalista incluído)');
  t('ver_hospedes manda responder por creche_por_dia, com todos os nomes', () => assert.match(F.definicao('ver_hospedes').description, /creche_por_dia/));
  t('as instruções lembram do mensalista que vem todo dia', () => assert.match(I.INSTRUCOES, /inclusive o mensalista que vem todo dia/));

  T.secao('Neide M6: sem acesso ao dinheiro, nunca "não deve nada"');
  const semDinheiro = { ...c, vejoFinanceiro: false, cuidoDoFinanceiro: false, eu: { nome: 'Kátia', papel: 'banhista', ativo: true, atende: true } };
  t('o contexto de quem não vê dinheiro proíbe "não deve nada"', () => assert.match(I.contextoDoPetshop(semDinheiro), /não consegue ver valores.*Nunca responda que não deve nada/));
  t('a busca leva o aviso no lugar do valor', () => assert.match(F.SEM_VALORES, /Nunca diga que não deve nada/));
  t('quem_me_deve não aparece para ela', () => assert.ok(!F.ferramentasPara(semDinheiro).some((x) => x.name === 'quem_me_deve' || x.name === 'ver_sinais')));

  T.secao('Bia M1: sinais no Mozart');
  t('ver_sinais é do financeiro e tem frase de espera', () => { const d = F.definicao('ver_sinais'); assert.ok(d && d.financeiro && !d.grava); assert.equal(P.fraseDaFerramenta('ver_sinais', {}), 'Somando os sinais…'); });

  T.secao('Bia: a frase de espera usa o nome da casa');
  t('só hotel: "no hotel"; só creche: "na creche"; os dois: "na creche e no hotel"', () => {
    assert.equal(P.fraseDaFerramenta('ver_hospedes', {}, undefined, false, 'Hotel'), 'Olhando quem está no hotel…');
    assert.equal(P.fraseDaFerramenta('ver_hospedes', {}, undefined, false, 'Creche'), 'Olhando quem está na creche…');
    assert.equal(P.fraseDaFerramenta('ver_hospedes', {}), 'Olhando quem está na creche e no hotel…');
  });

  T.secao('Juliana L1 e Camila: o texto não pede "Pode fazer"');
  t('com cartão: tira a frase que manda conferir no cartão', () => assert.equal(C.semPedidoDeConfirmar('Preparei a marcação da Pipoca. Confere no cartão e clica em "Pode fazer".', true), 'Preparei a marcação da Pipoca.'));
  t('"Confirma aí no cartão" e "está aí para você confirmar" saem', () => {
    assert.equal(C.semPedidoDeConfirmar('Thor na sexta às 10h. Confirma aí no cartão!', true), 'Thor na sexta às 10h.');
    assert.equal(C.semPedidoDeConfirmar('Anotei a despesa, está aí para você confirmar com Pode fazer. Quer mais algo?', false), 'Quer mais algo?');
  });
  t('sem frase de cartão: o texto fica igual; só a frase do cartão e sem cartão: fica como veio', () => {
    assert.equal(C.semPedidoDeConfirmar('Prontinho, marcado. Quer o lembrete?', false), 'Prontinho, marcado. Quer o lembrete?');
    assert.equal(C.semPedidoDeConfirmar('Confere no cartão.', false), 'Confere no cartão.');
    assert.equal(C.semPedidoDeConfirmar('Confere no cartão.', true), '');
  });

  T.secao('Juliana M6: negrito e lista na bolha');
  t('negrito vira trecho em negrito, sem asteriscos', () => assert.deepEqual(M.trechosDaLinha('somam **R$ 2.969,90**, cerca de **R$ 114 por dia**'), [{ t: 'somam ' }, { t: 'R$ 2.969,90', b: true }, { t: ', cerca de ' }, { t: 'R$ 114 por dia', b: true }]));
  t('lista com "- " vira lista; título e asterisco solto somem', () => {
    const b = M.blocosDoTexto('# Contas\nPor mês **R$ 10**.\n- Aluguel\n- Luz *estimada*\n\nFim.');
    assert.deepEqual(b.map((x) => x.tipo), ['p', 'lista', 'p']);
    assert.deepEqual(b[1].itens.map((i) => i.map((x) => x.t).join('')), ['Aluguel', 'Luz estimada']);
    assert.doesNotMatch(JSON.stringify(b), /\*|#/);
  });
  t('semMarkdown: texto limpo', () => assert.equal(M.semMarkdown('**Oi**, tudo `bem`?'), 'Oi, tudo bem?'));
  t('negrito que ainda não fechou (chegando aos poucos) aparece sem asterisco', () => assert.equal(M.semMarkdown('somam **R$ 2.9'), 'somam R$ 2.9'));

  T.secao('Juliana M1: foto da tabela de preços com creche');
  t('destino de cada linha, mesmo com a área errada da leitura', () => {
    assert.deepEqual(TP.destinoDaLinha('Creche diária', 'creche', 'diaria', null), { destino: 'creche_diaria', vezes: null });
    assert.deepEqual(TP.destinoDaLinha('Creche mensal 3x semana', 'banho_tosa', 'servico', null), { destino: 'creche_plano', vezes: 3 });
    assert.deepEqual(TP.destinoDaLinha('5x', 'creche', 'mensal', 5), { destino: 'creche_plano', vezes: 5 });
    assert.deepEqual(TP.destinoDaLinha('Hotel pernoite', 'banho_tosa', 'servico', null), { destino: 'hotel_diaria', vezes: null });
    assert.deepEqual(TP.destinoDaLinha('Day care seg a sex', 'banho_tosa', 'mensal', null), { destino: 'creche_plano', vezes: 5 });
    assert.deepEqual(TP.destinoDaLinha('Banho', 'banho_tosa', 'servico', null), { destino: 'servico', vezes: null });
    assert.deepEqual(TP.destinoDaLinha('Pacote 4 banhos', 'banho_tosa', 'pacote', null), { destino: 'pacote', vezes: null });
  });
  t('a leitura limpa: creche sem tempo de 1h e com o destino; plano sem dias por semana vai para Verificar', () => {
    const l = CA.limparLeitura({ pagina: 'precos', clientes: [], dividas: [], agenda: [], vacinas: [], duvidas: [], servicos: [
      { nome: 'Creche diária', area: 'creche', cobranca: 'diaria', vezes_semana: null, duracao_min: 60, preco_unico: 60, preco_p: null, preco_m: null, preco_g: null, preco_gg: null, certeza: 'alta' },
      { nome: 'Creche mensal 3x semana', area: 'banho_tosa', cobranca: 'servico', vezes_semana: null, duracao_min: 60, preco_unico: 480, preco_p: null, preco_m: null, preco_g: null, preco_gg: null, certeza: 'alta' },
      { nome: 'Plano creche', area: 'creche', cobranca: 'mensal', vezes_semana: null, duracao_min: null, preco_unico: 700, preco_p: null, preco_m: null, preco_g: null, preco_gg: null, certeza: 'alta' },
      { nome: 'Banho', area: 'banho_tosa', cobranca: 'servico', vezes_semana: null, duracao_min: 60, preco_unico: null, preco_p: 50, preco_m: 60, preco_g: null, preco_gg: null, certeza: 'alta' },
    ] }, '2026-11-17');
    assert.deepEqual(l.servicos.map((x) => [x.destino, x.area, x.duracao_min, x.vezes ?? null]), [['creche_diaria', 'creche', null, null], ['creche_plano', 'creche', null, 3], ['creche_plano', 'creche', null, null], ['servico', 'banho_tosa', 60, null]]);
    assert.equal(l.servicos[2].duvida, true);
    assert.equal(TP.rotuloDoDestino('creche_plano', 3), 'Vira modelo de plano da creche: 3x por semana');
  });

  T.secao('Bia H1: Tirar dúvida com dois cães, porte e creche no código');
  const dados = () => ({
    info: { nome: 'Hotelzinho', hoje: '2026-11-17', horario: { 0: { abre: '08:00', fecha: '18:00' }, 1: { abre: '08:00', fecha: '18:00' }, 2: { abre: '08:00', fecha: '18:00' }, 3: { abre: '08:00', fecha: '18:00' }, 4: { abre: '08:00', fecha: '18:00' }, 5: { abre: '08:00', fecha: '18:00' }, 6: null }, servicos: [], creche: { diaria: 70 }, hotel: { diaria: 90 } },
    fechados: [], hotel: { preco: { mostrar: true, de: 90, ate: 150, varia: true }, sinal: { modo: 'percentual', valor: 30, politica: null, creche: true }, segundo: 20, porPorte: { P: 90, M: 110, G: 130, GG: 150 } },
    experiencia: { ativo: true, max: 1, preco: 50 },
  });
  t('o contexto traz a diária de cada porte (pequeno e médio têm preço)', () => assert.match(L.contextoDoLink(dados()), /diária comum por porte: pequeno \(P\) R\$ 90, médio \(M\) R\$ 110, grande \(G\) R\$ 130, gigante \(GG\) R\$ 150/));
  t('"para os dois" sem porte: dois pets na estimativa (não um)', () => {
    const e = L.entradaHotel({ entrada: '2026-11-20', saida: '2026-11-22', pets: 2 }, dados());
    assert.ok(e.ok); assert.deepEqual(e.pets, [{ porte: null }, { porte: null }]);
  });
  t('portes M e P: dois pets; um porte com pets 2: o outro sem porte', () => {
    assert.deepEqual(L.entradaHotel({ entrada: '2026-11-20', saida: '2026-11-22', portes: ['M', 'P'] }, dados()).pets, [{ porte: 'M' }, { porte: 'P' }]);
    assert.deepEqual(L.entradaHotel({ entrada: '2026-11-20', saida: '2026-11-22', pets: 2, portes: ['M'] }, dados()).pets, [{ porte: 'M' }, { porte: null }]);
  });
  t('a pergunta da Bia vira estimar_hotel com 2 pets (modo de teste)', () => assert.deepEqual(L.pedidoDeTeste('Quanto fica para os dois de 20 a 22 de novembro, no feriado?', dados()), { nome: 'estimar_hotel', input: { entrada: '2026-11-20', saida: '2026-11-22', pets: 2 } }));
  t('o resumo da estimativa diz o total dos dois e o sinal', () => {
    const r = L.resumoDaEstimativa({ noites: 2, total: 372.6, varia: true, desconto: true, sinal: 111.78, pets: [{ porte: null, total: 207 }, { porte: null, total: 165.6 }] });
    assert.match(r.replace(/ /g, ' '), /2 noite\(s\) para 2 pets, total estimado R\$ 372,6/); assert.match(r.replace(/ /g, ' '), /sinal de R\$ 111,78/); assert.match(r, /Repita estes valores/);
  });
  t('creche no código: 2 dias × 2 pets × R$ 70, sinal 30%; domingo fechado fica fora', () => {
    const r = L.estimarCreche({ dias: ['2026-11-18', '2026-11-19', '2026-11-21'], pets: 2 }, dados()).replace(/ /g, ' ');
    assert.match(r, /2 dias de creche para 2 pets: total estimado R\$ 280/); assert.match(r, /R\$ 140 por pet/); assert.match(r, /não abre 21\/11/); assert.match(r, /sinal de R\$ 84/);
  });
  t('creche com dia de experiência: o primeiro dia sai pelo preço da experiência', () => assert.match(L.estimarCreche({ dias: ['2026-11-18', '2026-11-19'], experiencia: true }, dados()).replace(/ /g, ' '), /total estimado R\$ 120/));
  t('as instruções proíbem somar no texto', () => assert.match(L.INSTRUCOES_LINK_IA, /Nunca some, multiplique nem aplique desconto você mesmo/));
  t('a ferramenta estimar_creche só existe com diária da creche', () => {
    assert.ok(L.ferramentasDoLink(dados()).some((x) => x.name === 'estimar_creche'));
    const d = dados(); d.info.creche = null; assert.ok(!L.ferramentasDoLink(d).some((x) => x.name === 'estimar_creche'));
  });

  T.secao('Juliana M5: a conversa e o cartão voltam depois de recarregar, sem gravar duas vezes');
  const guardado = new Map();
  global.window = { sessionStorage: { getItem: (k) => (guardado.has(k) ? guardado.get(k) : null), setItem: (k, v) => guardado.set(k, String(v)), removeItem: (k) => guardado.delete(k) } };
  const chave = G.chaveDaConversa('loja', 'pessoa');
  t('guarda e lê de volta, com o cartão pendente', () => {
    G.guardarConversa(chave, { itens: [{ tipo: 'propostas', enviado: false, lista: [{ id: 'x', estado: 'pendente' }] }], mensagens: [{ role: 'user', content: 'oi' }], parciais: [], decidindo: null, esperando: false, aberta: true });
    const c2 = G.lerConversa(chave);
    assert.equal(c2.itens[0].lista[0].estado, 'pendente'); assert.equal(c2.mensagens.length, 1); assert.equal(G.abrirDepoisDeRecarregar(chave), true);
  });
  t('a conversa de outra pessoa ou de mais de 12 horas não volta', () => {
    assert.equal(G.lerConversa(G.chaveDaConversa('loja', 'outra')), null);
    assert.equal(G.lerConversa(chave, Date.now() + 13 * 3600_000), null);
  });
  t('conversa vazia e fechada não fica guardada', () => { G.guardarConversa(chave, { itens: [], mensagens: [], parciais: [], decidindo: null, esperando: false, aberta: false }); assert.equal(guardado.has(chave), false); });
  delete global.window;
  await ta('a mesma confirmação de novo: o servidor não grava outra vez (reservar devolve false)', async () => {
    const reservadas = new Set();
    const pend = [{ type: 'tool_use', id: 'toolu_mesmo', name: 'bloquear_horario', input: { dia: '2026-11-18' } }];
    const reservar = async (id) => { if (reservadas.has(id)) return false; reservadas.add(id); return true; };
    let liberou = 0;
    // primeira vez: reserva e a gravação falha (a internet caiu): a marca é solta para dar para tentar de novo
    const caiu = { ...c, sb: { from: () => { throw new Error('a internet caiu'); }, rpc: () => { throw new Error('a internet caiu'); } } };
    const r1 = await C.responderCartoes({ c: caiu, pendentes: pend, liberado: true, decisoes: [{ id: 'toolu_mesmo', ok: true }], reservar, liberar: async (id) => { liberou++; reservadas.delete(id); } });
    assert.equal(liberou, 1, 'falhou: a marca foi solta');
    // marca já gravada (como depois de uma gravação boa): a confirmação repetida não grava
    reservadas.add('toolu_mesmo');
    const r2 = await C.responderCartoes({ c, pendentes: pend, liberado: true, decisoes: [{ id: 'toolu_mesmo', ok: true }], reservar });
    assert.ok(r1.resultados[0].is_error);
    assert.match(r2.resultados[0].content, /já tinha sido gravada/); assert.equal(r2.mudou, false);
  });
}))();
