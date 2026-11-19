// Unidade: rodada 8 (agente L), defeitos e robustez depois dos três testadores exigentes. Sem banco.
//   - nome sem marcação (limparNome): "<b>V3</b>" sai, "Rex <3" fica "Rex 3";
//   - saída prevista longe demais (saidaLongeDemais): creche até 31 dias, hotel até 180; 18/11/2028 é recusada com o ano;
//   - data longe com o ano (dataAmigavel): "sábado, 18/11/2028", nunca "sábado, 18/11";
//   - balão do navegador em português (mensagemDeValidacao);
//   - sem internet diz isso (textoDeRede, ehFalhaDeRede) e a venda não fala de caixa fechado (conferirCaixa);
//   - Ajuda: "[EQUIPE] não é necessário nesta dúvida." sai da resposta e não chama a equipe (lerRespostaDaAjuda);
//   - Mozart: quem só tem o Caixa não recebe marcar_horario e o cartão forjado é recusado no servidor (permissao, conversa).
const assert = require('node:assert/strict');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('unidade-robustez');
const V = lib('validacao');
const U = lib('util');
const AJ = lib('ajuda');
const PM = lib('assistente/permissao');
const F = lib('assistente/ferramentas');
const C = lib('assistente/conversa');
const I = lib('assistente/instrucoes');
const A = lib('acessos');
const D = lib('dinheiro');
const t = (nome, f) => { try { f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };
const ta = async (nome, f) => { try { await f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };

(async () => T.rodar(async () => {
  T.secao('nomes sem marcação (L3)');
  t('o nome da loja do testador perde as etiquetas e fica com o resto', () => assert.equal(V.limparNome('Quebrador QA 🐶 <b>"V3"</b> & Cia'), 'Quebrador QA 🐶 "V3" & Cia'));
  t('script some; "Rex <3" vira "Rex 3"; espaços juntados', () => {
    assert.equal(V.limparNome('<script>alert(1)</script>  Bob'), 'alert(1) Bob');
    assert.equal(V.limparNome('Rex <3'), 'Rex 3');
    assert.equal(V.limparNome('  Mel   da  Ana '), 'Mel da Ana');
    assert.equal(V.limparNome(null), '');
  });

  T.secao('saída prevista longe demais (M1)');
  const ent = new Date(2026, 10, 18, 9, 0);
  t('creche com saída em 18/11/2028: recusada, com o ano e "Confira o dia e o ano"', () => {
    const m = V.saidaLongeDemais('creche', ent, new Date(2028, 10, 18, 18, 0));
    assert.match(m, /18\/11\/2028, 731 dias depois da entrada\. Confira o dia e o ano/);
  });
  t('hotel de 5 diárias (28/11 a 03/12) passa; hotel de 180 dias passa; 181 não', () => {
    assert.equal(V.saidaLongeDemais('hotel', new Date(2026, 10, 28, 14), new Date(2026, 11, 3, 12)), null);
    assert.equal(V.saidaLongeDemais('hotel', ent, U.somaDias(ent, 180)), null);
    assert.ok(V.saidaLongeDemais('hotel', ent, U.somaDias(ent, 181)));
  });
  t('creche: 31 dias passa, 32 não; sem saída, nada a dizer', () => {
    assert.equal(V.saidaLongeDemais('creche', ent, U.somaDias(ent, 31)), null);
    assert.ok(V.saidaLongeDemais('creche', ent, U.somaDias(ent, 32)));
    assert.equal(V.saidaLongeDemais('creche', ent, null), null);
  });
  t('data a mais de 6 meses mostra o ano e o dia da semana dela (18/11/2028 é sábado)', () => {
    assert.equal(U.dataAmigavel(new Date(2028, 10, 18, 18)), 'sábado, 18/11/2028');
    const perto = U.somaDias(new Date(), 10);
    assert.doesNotMatch(U.dataAmigavel(perto), /\/\d{4}$/);
  });

  T.secao('balão do navegador em português (L2)');
  t('obrigatório vazio: "Preencha este campo." (texto, e-mail); escolha na lista; caixinha', () => {
    assert.equal(V.mensagemDeValidacao({ valueMissing: true }, { type: 'text' }), 'Preencha este campo.');
    assert.equal(V.mensagemDeValidacao({ valueMissing: true }, { type: 'email' }), 'Preencha este campo.');
    assert.equal(V.mensagemDeValidacao({ valueMissing: true }, { tagName: 'SELECT' }), 'Escolha uma opção da lista.');
    assert.equal(V.mensagemDeValidacao({ valueMissing: true }, { type: 'checkbox' }), 'Marque esta opção para continuar.');
  });
  t('e-mail sem @, senha curta, data depois do máximo: em português, sem inglês', () => {
    assert.match(V.mensagemDeValidacao({ typeMismatch: true }, { type: 'email' }), /precisa ter @/);
    assert.equal(V.mensagemDeValidacao({ tooShort: true }, { minLength: 8 }), 'Escreva pelo menos 8 caracteres.');
    assert.match(V.mensagemDeValidacao({ rangeOverflow: true }, { type: 'date' }), /Confira o dia e o ano/);
    for (const v of [{ valueMissing: true }, { badInput: true }, { patternMismatch: true }, { stepMismatch: true }, {}]) assert.doesNotMatch(V.mensagemDeValidacao(v, {}), /Please|field|valid/i);
  });

  T.secao('sem internet (L5)');
  t('falha de rede reconhecida; sem internet e sem resposta têm frases diferentes, em português', () => {
    assert.ok(V.ehFalhaDeRede('TypeError: Failed to fetch'));
    assert.ok(V.ehFalhaDeRede('net::ERR_INTERNET_DISCONNECTED'));
    assert.ok(!V.ehFalhaDeRede('Este caixa já foi fechado.'));
    assert.match(V.textoDeRede(false), /^Sem internet agora/);
    assert.match(V.textoDeRede(true), /Não deu para falar com o servidor/);
    assert.doesNotMatch(V.textoDeRede(false), /caixa/i);
  });

  await ta('venda com a internet caída: pergunta "Sem internet agora", nunca "O caixa foi fechado há pouco"', async () => {
    const q = new Proxy({}, { get: (_, k) => (k === 'then' ? (ok) => ok({ data: null, error: { message: 'TypeError: Failed to fetch' } }) : () => q) });
    const sb = { from: () => q };
    D.lembrarCaixa('loja-offline', 'caixa-1'); // a tela viu o caixa aberto
    const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
    const perguntas = [];
    try {
      const r = await D.conferirCaixa(sb, 'loja-offline', async (p) => { perguntas.push(p); return false; });
      assert.equal(r, false);
    } finally { if (nav) Object.defineProperty(globalThis, 'navigator', nav); else delete globalThis.navigator; }
    assert.equal(perguntas.length, 1);
    assert.equal(perguntas[0].titulo, 'Sem internet agora');
    assert.match(perguntas[0].texto, /Nada foi gravado/);
    assert.ok(!perguntas.some((p) => /caixa foi fechado/i.test(p.titulo)));
  });

  T.secao('Ajuda sem comentário do modelo (estreante M1)');
  t('"[EQUIPE] não é necessário nesta dúvida." sai inteira e não chama a equipe', () => {
    const r = AJ.lerRespostaDaAjuda('Em Fechar a conta, toque em Pagou só uma parte? e escreva quanto entrou. O resto fica anotado.\n[EQUIPE] não é necessário nesta dúvida.');
    assert.equal(r.equipe, false);
    assert.doesNotMatch(r.texto, /necessário|EQUIPE/);
    assert.match(r.texto, /O resto fica anotado\.$/);
  });
  t('a marca sozinha na última linha chama a equipe; [NOVO] no começo é mudança de assunto', () => {
    const r = AJ.lerRespostaDaAjuda('[NOVO]\nIsso é com a nossa equipe: cobrança da assinatura.\n[EQUIPE]');
    assert.equal(r.equipe, true); assert.equal(r.novo, true);
    assert.equal(r.texto, 'Isso é com a nossa equipe: cobrança da assinatura.');
  });
  t('marca no fim de uma frase de verdade vale e a frase fica', () => {
    const r = AJ.lerRespostaDaAjuda('Vou te passar para a nossa equipe. [EQUIPE]');
    assert.equal(r.equipe, true); assert.equal(r.texto, 'Vou te passar para a nossa equipe.');
  });
  t('as instruções pedem para não escrever sobre a marca', () => assert.match(AJ.INSTRUCOES_AJUDA, /não escreva nada sobre ela/));

  T.secao('Mozart pelas áreas da pessoa (M3)');
  const caio = { nome: 'Caio', papel: 'equipe', ativo: true, atende: false, ve_financeiro: true, acessos: ['caixa'] };
  const bia = { nome: 'Bia', papel: 'equipe', ativo: true, atende: true, ve_financeiro: false, acessos: ['agenda'] };
  const nomes = (c) => F.ferramentasPara(c).map((f) => f.name);
  t('só Caixa: sem marcar_horario, cadastrar_pet, check-in nem estoque; com lancar_dinheiro e fechar_caixa', () => {
    const n = nomes({ vejoFinanceiro: true, areas: A.areasDe(caio) });
    for (const x of ['marcar_horario', 'bloquear_horario', 'horarios_livres', 'cadastrar_pet', 'fazer_checkin', 'reservar_estadia', 'vender_pacote', 'movimentar_estoque', 'ver_estoque']) assert.ok(!n.includes(x), x);
    for (const x of ['lancar_dinheiro', 'fechar_caixa', 'alterar_horario', 'buscar_pets']) assert.ok(n.includes(x), x);
    assert.ok(F.ferramentasPara({ vejoFinanceiro: true, areas: ['caixa'] }).every((f) => !('areas' in f) && !('grava' in f)), 'o modelo não vê as regras');
  });
  t('só Agenda: marca horário, sem dinheiro, sem check-in', () => {
    const n = nomes({ vejoFinanceiro: false, areas: A.areasDe(bia) });
    assert.ok(n.includes('marcar_horario') && n.includes('cadastrar_pet'));
    assert.ok(!n.includes('lancar_dinheiro') && !n.includes('fazer_checkin') && !n.includes('fechar_caixa'));
  });
  t('dono: todas as ferramentas', () => assert.equal(nomes({ vejoFinanceiro: true, areas: A.areasDe({ papel: 'dono' }), dono: true }).length, F.FERRAMENTAS.length));
  t('o contexto diz o que a pessoa não abre e manda não montar cartão', () => {
    const c = { petshop: { nome: 'Loja', horario: null, modulos: ['banho_tosa'], opcoes: {} }, servicos: [], equipe: [], eu: caio, vejoFinanceiro: true, cuidoDoFinanceiro: false, areas: A.areasDe(caio), agora: '2026-11-18T09:00' };
    assert.match(I.contextoDoPetshop(c), /Não abre: Agenda, Clientes e pets.*não monte cartão/);
  });
  t('a recusa diz a área ("não tem a área Agenda") e que nada foi gravado', () => assert.match(PM.motivoDaRecusa(F.definicao('marcar_horario'), { vejoFinanceiro: true, areas: ['caixa'] }), /área Agenda liberada.*Nada foi gravado/));

  const loja = { id: 'p', nome: 'Loja', horario: null, modulos: ['banho_tosa'], opcoes: {} };
  const nada = () => { throw new Error('não devia tocar no banco'); };
  const c = { sb: { from: nada, rpc: nada }, userId: 'u', petshop: loja, eu: caio, equipe: [], servicos: [], vejoFinanceiro: true, cuidoDoFinanceiro: false, areas: A.areasDe(caio), fusoMin: -180, agora: '2026-11-18T09:00' };
  await ta('modelo que pede marcar_horario para o Caio: nenhum cartão, o erro fala da Agenda', async () => {
    let n = 0, erro = null;
    const s = await C.voltas({ c, mensagens: [{ role: 'user', content: 'marca um banho pra Nina amanhã às 10' }], liberado: true, contar: async () => true,
      chamar: async (msgs) => {
        n++;
        if (n === 1) return { content: [{ type: 'tool_use', id: 'toolu_c1', name: 'marcar_horario', input: { pet_id: '11111111-1111-4111-8111-111111111111', servico_id: 's', inicio: '2026-11-19T10:00' } }], stop_reason: 'tool_use' };
        erro = msgs[msgs.length - 1].content[0];
        return { content: [{ type: 'text', text: 'Com o seu acesso eu não consigo marcar horário.' }], stop_reason: 'end_turn' };
      } });
    assert.equal(s.propostas.length, 0);
    assert.ok(erro && erro.is_error && /Agenda/.test(erro.content), JSON.stringify(erro));
  });
  await ta('cartão de marcar_horario confirmado à mão pelo Caio: recusado no servidor, sem tocar no banco', async () => {
    const pend = [{ type: 'tool_use', id: 'toolu_c2', name: 'marcar_horario', input: { pet_id: '11111111-1111-4111-8111-111111111111', servico_id: 's', inicio: '2026-11-19T10:00' } }];
    const r = await C.responderCartoes({ c, pendentes: pend, liberado: true, decisoes: [{ id: 'toolu_c2', ok: true }], reservar: async () => { throw new Error('não devia reservar'); } });
    assert.ok(r.resultados[0].is_error); assert.match(r.resultados[0].content, /Agenda.*Nada foi gravado/); assert.equal(r.mudou, false);
  });
}))();
