// Mozart e "Tirar dúvida" do link depois da 2ª rodada dos testadores, com o banco de verdade (e a rota do link com
// GESTAO_LINK_IA_FALSO=1; a do Mozart com GESTAO_MOZART_FALSO=1). Nunca chama o modelo.
//  - Rafael N3/I4: link_taxi (táxi pet do link, sem valor com "Esconder o preço no link") e o "Tirar dúvida" respondendo o
//    plano de 3x e o táxi pela rota de verdade.
//  - Bia L-n1: ver_sinais conta o sinal que virou crédito do tutor no cancelamento e diz o que ficou com o pet shop.
//  - Rafael C: ver_planos_creche e ver_hospedes dizem o táxi do mensalista (preço só para quem recebe).
//  - Rafael F: o dia fechado aparece em creche_por_dia ("o pet shop não abre").
//  - Camila M6b: ver_maquininha dá o mesmo "a receber" de taxas_do_periodo (Relatórios).
//  - Juliana N1: a rota do Mozart manda "Pensando…" antes de qualquer texto.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('mozart-link-v2');
const F = lib('assistente/ferramentas');
const R = lib('reservado');
const A = lib('acessos');
const MQ = lib('maquininha');

const n = (x) => JSON.parse(JSON.stringify(x).replace(/ /g, ' '));

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'MozLink2' });
  const Bl = await criarLoja(T, { nome: 'MozLink2 B', equipe: false, dados: false });
  const { dono } = L.sb;
  const P = L.P, COD = L.codigo, anon = B.cliente();
  async function contexto(papel, extra = {}) {
    const sb = L.sb[papel];
    const u = (await sb.auth.getUser()).data.user;
    const [p, e, s] = await Promise.all([R.lerPetshop(sb, P), R.lerEquipe(sb, P), R.lerServicos(sb, P)]);
    const eu = (e.data || []).find((x) => x.user_id === u.id && x.ativo);
    return { sb, userId: u.id, petshop: p.data, eu, equipe: e.data || [], servicos: s.data || [],
      vejoFinanceiro: A.podeArea(eu, 'caixa') || A.podeArea(eu, 'financeiro') || A.podeArea(eu, 'relatorios'),
      cuidoDoFinanceiro: A.podeArea(eu, 'financeiro') || A.podeArea(eu, 'relatorios'), fusoMin: -180, agora: `${L.hoje}T10:00`, ...extra };
  }
  const ch = (s) => `t-${s}-${B.sufixo()}`;

  T.secao('Rafael N3/I4: táxi pet e planos no link');
  T.ok('sem taxa e sem mensalista com táxi: link_taxi é null', (await anon.rpc('link_taxi', { p_codigo: COD })).data === null);
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'taxi.taxa': { modo: 'bairro', valor: null, bairros: [{ nome: 'Cambuí', valor: 35 }, { nome: 'Taquaral', valor: 45 }] } } }), 'taxa por bairro');
  let tx = (await anon.rpc('link_taxi', { p_codigo: COD })).data;
  T.ok('por bairro: Cambuí 35 e Taquaral 45 (ida e volta), sem mensalista', tx && tx.modo === 'bairro' && tx.sem_preco === false && tx.mensalista === false
    && JSON.stringify(tx.bairros) === JSON.stringify([{ nome: 'Cambuí', valor: 35 }, { nome: 'Taquaral', valor: 45 }]), tx);
  T.ok('outro link não vê esta taxa', (await anon.rpc('link_taxi', { p_codigo: Bl.codigo })).data === null);
  // um mensalista com táxi e os planos mensais no link
  const plano = B.must(await dono.from('creche_planos').insert({ petshop_id: P, pet_id: L.pets.Rex, dias: [1, 3, 5], inicio: L.mes1, vence_dia: 10, taxi: 'ida_volta' }).select('id').single(), 'plano Rex').id;
  B.must(await dono.from('creche_planos_valores').upsert({ plano_id: plano, petshop_id: P, valor_mensal: 780, valor_extra: 80, taxi_valor: 20, taxi_modo: 'dia' }).select('plano_id'), 'valor do plano');
  B.must(await dono.from('creche_modelos').insert([{ petshop_id: P, nome: '2x por semana', vezes: 2, valor_mensal: 560 }, { petshop_id: P, nome: '3x por semana', vezes: 3, valor_mensal: 780 }]).select('id'), 'modelos');
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'creche.planos_no_link': true, 'link.ia': true } }), 'planos no link e Tirar dúvida');
  tx = (await anon.rpc('link_taxi', { p_codigo: COD })).data;
  T.ok('com mensalista de táxi no plano: mensalista = true', tx?.mensalista === true, tx);
  if (await B.servidorNoAr()) {
    const URL = `${B.BASE_URL}/api/gestao/link-ia`;
    const rede = B.ipAleatorio();
    const pergunta = async (texto) => { const r = await fetch(URL, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': rede }, body: JSON.stringify({ codigo: COD, falas: [{ de: 'eu', texto }] }) }); return r.json().catch(() => null); };
    let j = await pergunta('Quanto é o plano de 3 vezes por semana?');
    T.ok('"plano de 3 vezes por semana?": R$ 780 por mês (não "Não sei")', j && !j.naoSei && /R\$ 780 por mês/.test(j.texto), j);
    j = await pergunta('Vocês têm táxi dog? Quanto custa?');
    T.ok('"táxi dog? quanto custa?": Cambuí R$ 35 e Taquaral R$ 45', j && !j.naoSei && /Cambuí R\$ 35/.test(j.texto) && /Taquaral R\$ 45/.test(j.texto), j);
    B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'hotel.link_sem_preco': true } }), 'esconde o preço');
    j = await pergunta('Vocês têm táxi dog? Quanto custa?');
    T.ok('com o preço escondido: o táxi existe, sem valor', j && !/R\$/.test(j.texto) && /não é informado|WhatsApp/.test(j.texto), j);
    j = await pergunta('Quanto é o plano de 3 vezes por semana?');
    T.ok('com o preço escondido: o plano sem valor', j && !/R\$ 780/.test(j.texto), j);
  } else T.ok('(servidor fora do ar: rota do link não conferida)', true);
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'hotel.link_sem_preco': true } }), 'esconde o preço');
  tx = (await anon.rpc('link_taxi', { p_codigo: COD })).data;
  T.ok('link_taxi com o preço escondido: sem_preco e nenhum valor', tx && tx.sem_preco === true && tx.valor === null && tx.bairros.length === 2 && tx.bairros.every((b) => b.valor === null), tx);
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'hotel.link_sem_preco': false } }), 'mostra o preço');

  T.secao('Rafael C: o táxi do mensalista no Mozart');
  {
    const r = n(JSON.parse((await F.rodarConsulta(await contexto('dono'), 'ver_planos_creche', {})).conteudo));
    const rex = r.planos.find((x) => x.pet === 'Rex');
    T.ok('dono: táxi ida e volta, R$ 20 por dia que veio', rex && /ida e volta/.test(rex.taxi) && /^20 por dia que veio/.test(rex.taxi_preco ?? ''), rex);
    const m = n(JSON.parse((await F.rodarConsulta(await contexto('monitor'), 'ver_planos_creche', {})).conteudo));
    const rexM = m.planos.find((x) => x.pet === 'Rex');
    T.ok('monitor (sem dinheiro): vê que tem táxi, sem preço', rexM && /ida e volta/.test(rexM.taxi) && rexM.taxi_preco === undefined && !/20 por dia/.test(JSON.stringify(m)), rexM);
  }

  T.secao('Rafael F: dia fechado em creche_por_dia');
  {
    // o próximo dia do plano do Rex (seg, qua ou sex) vira feriado
    let fer = null;
    for (let i = 1; i <= 7 && !fer; i++) { const d = L.dia(i); if ([1, 3, 5].includes(new Date(`${d}T12:00:00Z`).getUTCDay())) fer = { d, i }; }
    B.must(await dono.from('dias_especiais').insert({ petshop_id: P, dia: fer.d, nome: 'Feriado Teste', fechado: true, feriado: true }).select('id'), 'feriado');
    const c = await contexto('dono', { diasEspeciais: [{ dia: fer.d, nome: 'Feriado Teste', fechado: true, feriado: true }] });
    const r = n(JSON.parse((await F.rodarConsulta(c, 'ver_hospedes', { dias: 7 })).conteudo));
    const dia = r.creche_por_dia[fer.i];
    T.ok('o feriado diz que o pet shop não abre e não tem mensalista', dia && /não abre \(Feriado Teste\)/.test(dia.fechado ?? '') && dia.mensalistas.length === 0, dia);
    const outro = r.creche_por_dia.find((x) => !x.fechado && x.mensalistas.some((m) => m.startsWith('Rex')));
    T.ok('nos outros dias do plano, o Rex aparece com o táxi', outro && outro.mensalistas.some((m) => /Rex.*táxi: ida e volta/.test(m)), r.creche_por_dia);
  }

  T.secao('Bia L-n1: sinal que virou crédito do tutor');
  {
    const cliente = B.sql(`select cliente_id from pets where id='${L.pets.Thor}'`);
    async function reservaPaga(pet, sinal) {
      const id = B.must(await dono.from('estadias').insert({ petshop_id: P, pet_id: L.pets[pet], tipo: 'hotel', status: 'reservada', entrada: B.instante(L.dia(10), '14:00', L.fuso).toISOString(),
        saida_prevista: B.instante(L.dia(12), '12:00', L.fuso).toISOString(), valor_diaria: 110 }).select('id').single(), pet).id;
      const k = ch('sinal');
      B.must(await dono.rpc('estadia_sinal', { p_petshop: P, p_estadia: id, p_chave: k, p_passos: [
        { t: 'lancamento', nome: 'sinal', chave: `${k}:sinal`, linha: { tipo: 'entrada', valor: sinal, forma: 'pix', pagamentos: null, categoria: 'Creche e hotel', descricao: `Sinal da reserva: hotel de ${pet}`, cliente_id: cliente, pago: true, data: L.hoje } },
        { t: 'estadia_valores', estadia: id, modo: 'upsert', campos: { sinal, sinal_estado: 'pago', sinal_lancamento_id: '$ref:sinal', sinal_pago_em: L.hoje, sinal_devolucao_id: null, sinal_devolvido_em: null } },
      ] }), 'sinal ' + pet);
      return id;
    }
    const thor = await reservaPaga('Thor', 89.7);
    const bob = await reservaPaga('Bob', 54);
    await reservaPaga('Luna', 75.9);
    let k = ch('cancela');
    B.must(await dono.rpc('estadia_sinal', { p_petshop: P, p_estadia: thor, p_chave: k, p_passos: [
      { t: 'credito', cliente, valor: 89.7, estadia: thor, motivo: 'Sinal da reserva cancelada', chave: `${k}:credito` },
      { t: 'estadia_valores', estadia: thor, modo: 'update', campos: { sinal_estado: 'mantido' } },
      { t: 'estadia_cancelar', id: thor },
    ] }), 'cancela Thor (crédito)');
    k = ch('devolve');
    B.must(await dono.rpc('estadia_sinal', { p_petshop: P, p_estadia: bob, p_chave: k, p_passos: [
      { t: 'lancamento', nome: 'devolucao', chave: `${k}:devolucao`, linha: { tipo: 'saida', valor: 54, forma: 'pix', categoria: 'Devolução de sinal', descricao: 'Devolução do sinal: hotel de Bob', cliente_id: cliente, pago: true, data: L.hoje } },
      { t: 'estadia_valores', estadia: bob, modo: 'update', campos: { sinal_estado: 'devolvido', sinal_devolucao_id: '$ref:devolucao', sinal_devolvido_em: L.hoje } },
      { t: 'estadia_cancelar', id: bob },
    ] }), 'cancela Bob (devolve)');
    const r = n(JSON.parse((await F.rodarConsulta(await contexto('dono'), 'ver_sinais', { de: L.mes1, ate: L.hoje })).conteudo));
    T.ok('entrou R$ 219,60 de 3 reservas; devolvidos R$ 54', r.sinais_recebidos === 219.6 && r.reservas_com_sinal_recebido === 3 && r.devolvido === 54, r);
    T.ok('R$ 89,70 ficaram de crédito (do sinal da reserva cancelada)', r.deixado_de_credito_para_o_tutor === 89.7 && r.credito_do_sinal_de_reservas_canceladas === 89.7, r);
    T.ok('ficou com o pet shop: 219,60 − 54 − 89,70 = R$ 75,90', r.ficou_com_o_pet_shop === 75.9, r);
    T.ok('a conta manda falar sem "eu" ("foram devolvidos")', /nunca "devolvi"/.test(r.conta), r.conta);
  }

  T.secao('Camila M6b: o que a maquininha ainda vai pagar');
  {
    await MQ.salvarTaxas(dono, P, { ...MQ.TAXAS_ZERADAS, debito_pct: 2, debito_dias: 1, credito_pct: 4, credito_dias: 30, pix_pct: 0, pix_dias: 0 });
    const D = lib('dinheiro');
    await D.lancarPago(dono, P, { tipo: 'entrada', valor: 150, forma: 'credito', categoria: 'Venda de produtos', chave: D.novaChaveDeOperacao() });
    await D.lancarPago(dono, P, { tipo: 'entrada', valor: 100, forma: 'debito', categoria: 'Venda de produtos', chave: D.novaChaveDeOperacao() });
    const c = await contexto('dono');
    const r = n(JSON.parse((await F.rodarConsulta(c, 'ver_maquininha', {})).conteudo));
    const t = await MQ.taxasDoPeriodo(dono, P, `${L.hoje.slice(0, 8)}01`, L.hoje);
    const soma = Math.round(t.a_receber.reduce((s, x) => s + x.valor, 0) * 100) / 100;
    T.ok('a receber: 144 (crédito 150 − 4%) + 98 (débito 100 − 2%) = R$ 242', r.a_receber_da_maquininha.total === 242, r.a_receber_da_maquininha);
    T.ok('o mesmo total e as mesmas datas do cartão Taxas da maquininha', r.taxas_cadastradas === true && r.a_receber_da_maquininha.total === soma && r.a_receber_da_maquininha.dias.length === t.a_receber.length, { r: r.a_receber_da_maquininha, t: t.a_receber });
    T.ok('aponta para Relatórios', /Relatórios, cartão Taxas da maquininha/.test(r.onde_ver));
    const x = await F.rodarConsulta(await contexto('caixa'), 'ver_maquininha', {});
    T.ok('a recepção (caixa, sem financeiro) não vê', x.erro === true, x);
  }

  T.secao('Juliana F3: "quanto eu dei de desconto este mês?"');
  {
    const venda = (valor) => dono.from('lancamentos').insert({ petshop_id: P, tipo: 'entrada', valor, forma: 'pix', categoria: 'Venda de produtos', data: L.hoje, pago: true, origem: 'tela',
      itens: [{ tipo: 'produto', nome: 'Shampoo Neutro', qtd: 1, valor: 29.9, produto_id: L.prod }] }).select('id');
    B.must(await venda(25), 'venda com desconto de 4,90');
    B.must(await venda(27.9), 'venda com desconto de 2,00');
    const r = n(JSON.parse((await F.rodarConsulta(await contexto('dono'), 'ver_descontos', {})).conteudo));
    T.ok('2 descontos somando R$ 6,90 (a mesma lista de Financeiro, Alterações)', r.desconto_na_hora_de_receber.total === 6.9 && r.desconto_na_hora_de_receber.vezes === 2 && r.total_dos_dois >= 6.9, r);
    T.ok('quem não cuida do financeiro não vê', (await F.rodarConsulta(await contexto('caixa'), 'ver_descontos', {})).erro === true);
  }

  T.secao('Juliana N1: a rota manda "Pensando…" antes de tudo');
  if (await B.servidorNoAr()) {
    const token = (await dono.auth.getSession()).data.session.access_token;
    const r = await fetch(`${B.BASE_URL}/api/gestao/assistente`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/x-ndjson', authorization: `Bearer ${token}` },
      body: JSON.stringify({ petshopId: P, agora: `${L.hoje}T10:00`, fusoMin: -180, mensagens: [], texto: 'oi' }) });
    const linhas = (await r.text()).split('\n').filter(Boolean).map((l) => JSON.parse(l));
    T.ok('o primeiro evento é a frase "Pensando…"', linhas[0]?.t === 'progresso' && linhas[0].frase === 'Pensando…', linhas.slice(0, 3));
  } else T.ok('(servidor fora do ar)', true);
}))();
