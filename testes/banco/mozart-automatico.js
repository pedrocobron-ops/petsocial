// Mozart no modo automático (assistente/automatico*.ts, migração 20261244000000), pelo banco de verdade, com um modelo de
// mentira (roteiro fixo):
//  - desligado para todos no começo; a equipe não liga sem o dono permitir; o dono permite e a Rita liga (com o aceite
//    guardado); o dono tira a permissão e o automático dela para de valer na hora;
//  - o servidor recusa o automático de quem não pode, mesmo que o aparelho peça (rota com GESTAO_MOZART_FALSO: cartão normal;
//    mozart_acao_comecar recusado; a coluna mudada à mão sem aceite não vale; ninguém muda a coluna pela API);
//  - cada tipo de ação grava sem cartão e o Desfazer volta tudo: horário desmarcado, preço de volta, recebimento apagado,
//    venda desfeita com o estoque de volta, entrada de estoque com movimento contrário, produto/serviço/pet/tutor criados
//    apagados, tutor, funcionamento e diárias de volta, bloqueio tirado e posto de volta, desmarcado que volta (horário livre)
//    ou não volta (ocupado), reserva da creche cancelada, conta do cliente apagada, saúde apagada;
//  - leva de três com falha no meio: a primeira grava, a segunda falha, a terceira não é feita (PAROU_ANTES);
//  - Desfazer de outra pessoa é recusado; o dono desfaz o da equipe; depois do caixa fechado, explica; mudou depois, explica;
//    passou de 24 horas, explica; duas vezes, explica.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('mozart-automatico');
const C = lib('assistente/conversa');
const AS = lib('assistente/automatico-servidor');
const AU = lib('assistente/automatico');
const R = lib('reservado');
const A = lib('acessos');
const O = lib('opcoes');
const SB = lib('supabase');

let seq = 0;
const uso = (name, input) => ({ type: 'tool_use', id: `toolu_auto${Date.now().toString(36)}${++seq}`, name, input });

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Mozart automático', modulos: ['banho_tosa', 'creche', 'hotel', 'loja'] });
  const P = L.P;
  const q = (s) => B.sql(s);

  async function contexto(papel) {
    const sb = L.sb[papel];
    const u = (await sb.auth.getUser()).data.user;
    const [p, e, s] = await Promise.all([R.lerPetshop(sb, P), R.lerEquipe(sb, P), R.lerServicos(sb, P)]);
    const eu = (e.data || []).find((x) => x.user_id === u.id && x.ativo);
    const est = await AS.estadoDoAutomatico(sb, P);
    return {
      sb, userId: u.id, petshop: p.data, eu, equipe: e.data || [], servicos: s.data || [],
      vejoFinanceiro: A.podeArea(eu, 'caixa') || A.podeArea(eu, 'financeiro') || A.podeArea(eu, 'relatorios'),
      cuidoDoFinanceiro: A.podeArea(eu, 'financeiro') || A.podeArea(eu, 'relatorios'),
      areas: A.areasDe(eu), dono: eu.papel === 'dono', fusoMin: -180, agora: `${L.hoje}T10:00`, automatico: est.efetivo,
    };
  }
  const token = async (papel) => (await L.sb[papel].auth.getSession()).data.session.access_token;
  /** Um pedido com o "modelo" pedindo `usos` de uma vez, no automático (como a rota faz quando o banco diz que vale). */
  async function pedir(papel, usos) {
    const c = await contexto(papel);
    const tk = await token(papel);
    let n = 0, depois = null;
    const automatico = c.automatico ? AS.gravarNoAutomatico({ c, liberado: true, sbDaAcao: (id) => SB.bancoDoUsuario(tk, { 'x-mozart-acao': id }) }) : undefined;
    const r = await C.voltas({ c, mensagens: [{ role: 'user', content: 'pedido' }], liberado: true, contar: async () => true, automatico,
      chamar: async (msgs) => { if (n++ === 0) return { content: usos, stop_reason: 'tool_use' }; depois = msgs[msgs.length - 1].content; return { content: [{ type: 'text', text: 'Marquei.' }], stop_reason: 'end_turn' }; } });
    return { ...r, depois, c };
  }
  const desfazer = async (papel, acao) => AS.desfazerAcao(await contexto(papel), acao, true);
  /** Faz e desfaz uma ação; devolve { feito, undo }. */
  async function fazerEDesfazer(papel, nome, input, conferirFeito, conferirDesfeito) {
    const r = await pedir(papel, [uso(nome, input)]);
    const f = r.feitos[0];
    T.ok(`${nome}: gravou sem cartão`, r.propostas.length === 0 && f && f.ok && f.acao, { feitos: r.feitos, propostas: r.propostas.length, depois: r.depois });
    if (!f?.ok) return null;
    if (conferirFeito) T.ok(`${nome}: no banco como pedido`, conferirFeito(), conferirFeito.toString());
    const d = await desfazer(papel, f.acao);
    T.ok(`${nome}: Desfazer`, d.ok, d);
    if (conferirDesfeito) T.ok(`${nome}: voltou como era`, conferirDesfeito(), conferirDesfeito.toString());
    return f;
  }

  T.secao('Desligado no começo; a equipe só com a permissão do dono');
  const est0 = await AS.estadoDoAutomatico(L.sb.dono, P), estRita0 = await AS.estadoDoAutomatico(L.sb.caixa, P);
  T.ok('dono: desligado, mas pode ligar', !est0.ligado && !est0.efetivo && est0.pode && est0.dono, est0);
  T.ok('Rita (equipe): desligado e não pode', !estRita0.ligado && !estRita0.efetivo && !estRita0.pode, estRita0);
  const recusa = await L.sb.caixa.rpc('mozart_automatico_ligar', { p_petshop: P, p_ligar: true, p_versao: AU.VERSAO_AVISO_AUTOMATICO });
  T.ok('Rita tenta ligar: recusado (o dono não liberou)', recusa.error && /não liberou/.test(recusa.error.message), recusa.error);
  const semVersao = await L.sb.dono.rpc('mozart_automatico_ligar', { p_petshop: P, p_ligar: true });
  T.ok('ligar sem o "Entendi" (sem a versão do aviso): recusado', semVersao.error && /Entendi/.test(semVersao.error.message), semVersao.error);
  const coluna = await L.sb.dono.from('profissionais').update({ mozart_automatico: true }).eq('id', L.ids.caixa).select('id');
  T.ok('ninguém muda a coluna pela API (nem o dono, para outra pessoa)', Boolean(coluna.error) && q(`select mozart_automatico from profissionais where id='${L.ids.caixa}'`) === 'f', coluna.error);
  const leitura = await L.sb.dono.from('profissionais').select('mozart_automatico').eq('id', L.ids.dono);
  T.ok('a coluna também não é lida direto (sai por mozart_automatico_estado)', Boolean(leitura.error), leitura.error);

  const ligouDono = await L.sb.dono.rpc('mozart_automatico_ligar', { p_petshop: P, p_ligar: true, p_versao: AU.VERSAO_AVISO_AUTOMATICO });
  T.ok('dono liga: vale', !ligouDono.error && ligouDono.data.efetivo, ligouDono.error || ligouDono.data);
  T.ok('aceite do dono guardado (quem, quando, versão)', q(`select count(*) from mozart_automatico_aceites where petshop_id='${P}' and ligou and versao='${AU.VERSAO_AVISO_AUTOMATICO}' and user_id=(select user_id from profissionais where id='${L.ids.dono}')`) === '1');

  await O.salvarOpcoes(L.sb.dono, P, { [AU.CHAVE_AUTOMATICO_EQUIPE]: true });
  const ligouRita = await L.sb.caixa.rpc('mozart_automatico_ligar', { p_petshop: P, p_ligar: true, p_versao: AU.VERSAO_AVISO_AUTOMATICO });
  T.ok('com a permissão, Rita liga', !ligouRita.error && ligouRita.data.efetivo && ligouRita.data.equipe, ligouRita.error || ligouRita.data);
  const sbFora = await L.sb.caixa.from('mozart_automatico_aceites').select('user_id').eq('petshop_id', P);
  T.ok('Rita lê só o próprio aceite; o dono lê os dois', (sbFora.data || []).length === 1 && Number(((await L.sb.dono.from('mozart_automatico_aceites').select('id').eq('petshop_id', P)).data || []).length) === 2, sbFora);

  T.secao('O servidor decide: sem permissão, cartão normal (mesmo que o aparelho peça)');
  await O.salvarOpcoes(L.sb.dono, P, { [AU.CHAVE_AUTOMATICO_EQUIPE]: false });
  const estRita1 = await AS.estadoDoAutomatico(L.sb.caixa, P);
  T.ok('o dono tira a permissão: o da Rita para de valer (a escolha dela fica guardada)', estRita1.ligado && !estRita1.efetivo, estRita1);
  const abrir = await L.sb.caixa.rpc('mozart_acao_comecar', { p_petshop: P, p_uso: 'toolu_forjado1', p_ferramenta: 'marcar_horario' });
  T.ok('abrir ação no automático sem permissão: recusado no banco', abrir.error && /não está ligado/.test(abrir.error.message), abrir.error);
  const semAuto = await pedir('caixa', [uso('bloquear_horario', { dia: B.somaDias(L.hoje, 3), de: '12:00', ate: '13:00', motivo: 'Almoço' })]);
  T.ok('pedido da Rita: volta o cartão, nada gravado', semAuto.propostas.length === 1 && semAuto.feitos.length === 0 && q(`select count(*) from bloqueios where petshop_id='${P}'`) === '0', semAuto.feitos);
  // forjado: a coluna ligada direto no banco, sem aceite
  q(`update profissionais set mozart_automatico = true where id='${L.ids.monitor}'`);
  const estMonitor = await AS.estadoDoAutomatico(L.sb.monitor, P);
  T.ok('coluna ligada à mão, sem aceite e sem permissão: não vale', !estMonitor.efetivo, estMonitor);
  if (await B.servidorNoAr()) {
    const r = await fetch(`${B.BASE_URL}/api/gestao/assistente`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${await token('caixa')}` },
      body: JSON.stringify({ petshopId: P, texto: 'bloqueia o almoço de amanhã', agora: `${L.hoje}T10:00`, fusoMin: -180, automatico: true }) });
    const j = await r.json().catch(() => null);
    if (j && j.erro === 'sem_chave') T.conhecido('rota: servidor sem ANTHROPIC_API_KEY', false, 'rode com ANTHROPIC_API_KEY=sk-ant-chave-falsa GESTAO_MOZART_FALSO=1');
    else if (j && j.propostas && !j.propostas.length && !(j.feitos || []).length && !/[Bb]loque/.test(j.texto || '')) T.conhecido('rota: servidor sem GESTAO_MOZART_FALSO', false, 'rode o servidor com GESTAO_MOZART_FALSO=1 para conferir pela rota');
    else T.ok('rota: o aparelho pede "automatico: true", o servidor manda o cartão', r.status === 200 && j.propostas.length === 1 && !(j.feitos || []).length && j.automatico === false && q(`select count(*) from bloqueios where petshop_id='${P}'`) === '0', { status: r.status, j: j && { propostas: j.propostas, feitos: j.feitos, automatico: j.automatico } });
  } else T.conhecido('rota: servidor fora do ar', false, 'a parte da rota não rodou');
  await O.salvarOpcoes(L.sb.dono, P, { [AU.CHAVE_AUTOMATICO_EQUIPE]: true });

  T.secao('Cada ação grava sem cartão e o Desfazer volta tudo');
  const dia = B.somaDias(L.hoje, 2);
  const status = (id) => q(`select status from agendamentos where id='${id}'`);
  // horário
  let agId = null;
  await fazerEDesfazer('dono', 'marcar_horario', { pet_id: L.pets.Thor, servico_id: L.S.Banho, inicio: `${dia}T09:00` },
    () => { agId = q(`select id from agendamentos where petshop_id='${P}' and pet_id='${L.pets.Thor}' and inicio::date='${dia}' order by criado_em desc limit 1`); return status(agId) === 'marcado'; },
    () => status(agId) === 'cancelado');
  // preço
  const precos = () => q(`select concat_ws('/', preco_p, preco_m, preco_g, preco_gg) from servicos where id='${L.S.Banho}'`);
  const precosAntes = precos();
  await fazerEDesfazer('dono', 'alterar_servico', { servico_id: L.S.Banho, preco: 99 }, () => precos() === '99.00/99.00/99.00/99.00', () => precos() === precosAntes);
  // funcionamento e diárias
  const horario = () => q(`select horario::text from petshops where id='${P}'`);
  const hAntes = horario();
  await fazerEDesfazer('dono', 'alterar_funcionamento', { dias: [{ dia: 'domingo', fechado: true }] }, () => horario() !== hAntes, () => horario() === hAntes);
  const diarias = () => q(`select diaria_creche || '/' || diaria_hotel from petshops where id='${P}'`);
  const dAntes = diarias();
  await fazerEDesfazer('dono', 'alterar_diarias', { creche: 88, hotel: 150 }, () => diarias() === '88.00/150.00', () => diarias() === dAntes);
  // tutor
  const fone = () => q(`select telefone from clientes where id='${L.tutores.Ana}'`);
  const fAntes = fone();
  await fazerEDesfazer('dono', 'alterar_tutor', { cliente_id: L.tutores.Ana, telefone: '11977776666' }, () => fone() !== fAntes, () => fone() === fAntes);
  // cadastros criados: apagados (nada usa)
  await fazerEDesfazer('dono', 'criar_servico', { nome: 'Banho de ofurô', duracao_min: 30, preco: 45 },
    () => q(`select count(*) from servicos where petshop_id='${P}' and nome='Banho de ofurô'`) === '1', () => q(`select count(*) from servicos where petshop_id='${P}' and nome='Banho de ofurô'`) === '0');
  await fazerEDesfazer('dono', 'criar_produto', { nome: 'Petisco de frango', preco_venda: 12 },
    () => q(`select count(*) from produtos where petshop_id='${P}' and nome='Petisco de frango'`) === '1', () => q(`select count(*) from produtos where petshop_id='${P}' and nome='Petisco de frango'`) === '0');
  await fazerEDesfazer('dono', 'cadastrar_pet', { nome: 'Pipoca', especie: 'cao', porte: 'P', tutor_nome: 'Gabi Nova', tutor_telefone: '11966665555' },
    () => q(`select count(*) from pets p join clientes c on c.id=p.cliente_id where p.petshop_id='${P}' and p.nome='Pipoca' and c.nome='Gabi Nova'`) === '1',
    () => q(`select count(*) from pets where petshop_id='${P}' and nome='Pipoca'`) === '0' && q(`select count(*) from clientes where petshop_id='${P}' and nome='Gabi Nova'`) === '0');
  // bloqueio: criar e tirar
  await fazerEDesfazer('dono', 'bloquear_horario', { dia, de: '12:00', ate: '13:00', motivo: 'Almoço' },
    () => q(`select count(*) from bloqueios where petshop_id='${P}'`) === '1', () => q(`select count(*) from bloqueios where petshop_id='${P}'`) === '0');
  B.must(await L.sb.dono.from('bloqueios').insert({ petshop_id: P, inicio: B.instante(dia, '15:00', L.fuso).toISOString(), fim: B.instante(dia, '16:00', L.fuso).toISOString(), motivo: 'Reunião' }).select('id'), 'bloqueio');
  await fazerEDesfazer('dono', 'remover_bloqueio', { dia },
    () => q(`select count(*) from bloqueios where petshop_id='${P}'`) === '0', () => q(`select count(*) from bloqueios where petshop_id='${P}' and motivo='Reunião'`) === '1');
  q(`delete from bloqueios where petshop_id='${P}'`);
  // desmarcar e desfazer: volta se o horário está livre
  const ag2 = B.must(await L.sb.dono.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets.Mel, servico_id: L.S.Banho, inicio: B.instante(dia, '14:00', L.fuso).toISOString(), fim: B.instante(dia, '15:00', L.fuso).toISOString() }).select('id').single(), 'horário').id;
  await fazerEDesfazer('dono', 'alterar_horario', { agendamento_id: ag2, status: 'cancelado' }, () => status(ag2) === 'cancelado', () => status(ag2) === 'marcado');
  const r3 = await pedir('dono', [uso('alterar_horario', { agendamento_id: ag2, status: 'cancelado' })]);
  B.must(await L.sb.dono.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets.Mel, servico_id: L.S['Corte de unhas'], inicio: B.instante(dia, '14:30', L.fuso).toISOString(), fim: B.instante(dia, '14:45', L.fuso).toISOString() }).select('id'), 'outro horário da Mel');
  const d3 = await desfazer('dono', r3.feitos[0].acao);
  T.ok('desmarcado que não volta: o horário foi ocupado (explica)', !d3.ok && /ocupado/.test(d3.motivo) && status(ag2) === 'cancelado', d3);
  // creche
  await fazerEDesfazer('dono', 'reservar_estadia', { pet_id: L.pets.Luna, tipo: 'creche', dias: [dia] },
    () => q(`select status from estadias where petshop_id='${P}' and pet_id='${L.pets.Luna}'`) === 'reservada', () => q(`select status from estadias where petshop_id='${P}' and pet_id='${L.pets.Luna}'`) === 'cancelada');
  // saúde
  await fazerEDesfazer('dono', 'registrar_saude', { pet_id: L.pets.Bob, tipo: 'vacina', nome: 'V10' },
    () => q(`select count(*) from pets_saude where pet_id='${L.pets.Bob}'`) === '1', () => q(`select count(*) from pets_saude where pet_id='${L.pets.Bob}'`) === '0');
  // dinheiro
  await fazerEDesfazer('dono', 'abrir_caixa', { troco_inicial: 50 }, () => q(`select count(*) from caixas where petshop_id='${P}' and fechado_em is null`) === '1', () => q(`select count(*) from caixas where petshop_id='${P}'`) === '0');
  await pedir('dono', [uso('abrir_caixa', { troco_inicial: 0 })]);
  const lanc = (d) => q(`select count(*) from lancamentos where petshop_id='${P}' and descricao='${d}'`);
  await fazerEDesfazer('dono', 'lancar_dinheiro', { tipo: 'entrada', valor: 35, forma: 'pix', categoria: 'Outros', descricao: 'Recebi teste' }, () => lanc('Recebi teste') === '1', () => lanc('Recebi teste') === '0');
  await fazerEDesfazer('dono', 'anotar_divida', { cliente_id: L.tutores.Beto, valor: 40, descricao: 'Perfume' }, () => lanc('Perfume') === '1', () => lanc('Perfume') === '0');
  await fazerEDesfazer('dono', 'criar_conta', { tipo: 'saida', valor: 300, vencimento: dia, descricao: 'Fornecedor X' }, () => lanc('Fornecedor X') === '1', () => lanc('Fornecedor X') === '0');
  const contaId = B.must(await L.sb.dono.from('lancamentos').insert({ petshop_id: P, tipo: 'saida', valor: 120, categoria: 'Outros', descricao: 'Luz teste', data: dia, vencimento: dia, pago: false }).select('id').single(), 'conta a pagar').id;
  const paga = () => q(`select pago::text || '/' || coalesce(forma, '-') from lancamentos where id='${contaId}'`);
  const p0 = paga();
  await fazerEDesfazer('dono', 'pagar_conta', { conta_id: contaId, forma: 'pix' }, () => paga() === 'true/pix', () => paga() === p0 && p0.startsWith('false/'));
  const hotelBob = () => q(`select string_agg(status, ',') from estadias where petshop_id='${P}' and pet_id='${L.pets.Bob}'`);
  await fazerEDesfazer('dono', 'fazer_checkin', { pet_id: L.pets.Bob, tipo: 'hotel' }, () => hotelBob() === 'em_casa', () => hotelBob() === 'cancelada');
  // estoque
  const saldo = () => Number(q(`select estoque from produtos where id='${L.prod}'`));
  const s0 = saldo();
  await fazerEDesfazer('dono', 'movimentar_estoque', { produto_id: L.prod, tipo: 'entrada', quantidade: 5, motivo: 'Compra' }, () => saldo() === s0 + 5,
    () => saldo() === s0 && q(`select count(*) from movimentos_estoque where produto_id='${L.prod}' and tipo='saida' and motivo='Desfeito pelo Mozart'`) === '1');
  await fazerEDesfazer('dono', 'vender_produto', { itens: [{ produto_id: L.prod, quantidade: 2 }], forma: 'pix' },
    () => saldo() === s0 - 2 && q(`select count(*) from lancamentos where petshop_id='${P}' and categoria='Venda de produtos'`) === '1',
    () => saldo() === s0 && q(`select count(*) from lancamentos where petshop_id='${P}' and categoria='Venda de produtos'`) === '0');

  T.secao('Leva de três: para no primeiro erro (PAROU_ANTES)');
  const leva = await pedir('dono', [
    uso('criar_servico', { nome: 'Leva um', duracao_min: 20, preco: 10 }),
    uso('criar_servico', { nome: 'Leva um', duracao_min: 20, preco: 10 }),
    uso('criar_servico', { nome: 'Leva três', duracao_min: 20, preco: 10 }),
  ]);
  const res = (leva.depois || []).filter((b) => b.type === 'tool_result');
  T.ok('a 1ª gravou, a 2ª falhou, a 3ª não foi feita', leva.feitos.length === 3 && leva.feitos[0].ok && !leva.feitos[1].ok && !leva.feitos[2].ok && res[2]?.content === C.PAROU_ANTES
    && q(`select count(*) from servicos where petshop_id='${P}' and nome='Leva três'`) === '0', { feitos: leva.feitos.map((f) => [f.ok, f.erro]), res });
  T.ok('só a que gravou tem Desfazer', Boolean(leva.feitos[0].acao) && !leva.feitos[1].acao && !leva.feitos[2].acao);
  const duas = await pedir('dono', [uso('bloquear_horario', { dia, de: '07:00', ate: '08:00', motivo: 'Um' }), uso('bloquear_horario', { dia, de: '19:00', ate: '20:00', motivo: 'Dois' })]);
  T.ok('leva de duas: as duas gravam em ordem, cada uma com o seu Desfazer', duas.feitos.length === 2 && duas.feitos.every((f) => f.ok && f.acao) && q(`select count(*) from bloqueios where petshop_id='${P}'`) === '2', duas.feitos);
  q(`delete from bloqueios where petshop_id='${P}'`);

  T.secao('Quem desfaz, e quando não dá');
  B.must(await L.sb.tosador.rpc('mozart_automatico_ligar', { p_petshop: P, p_ligar: true, p_versao: '1' }), 'Tito liga');
  const doTito = await pedir('tosador', [uso('marcar_horario', { pet_id: L.pets.Rex, servico_id: L.S.Banho, inicio: `${dia}T11:00` })]);
  const acaoTito = doTito.feitos[0]?.acao;
  T.ok('Tito marcou no automático', Boolean(acaoTito), doTito.feitos);
  const pelaRita = await desfazer('caixa', acaoTito);
  T.ok('Rita não desfaz o do Tito', !pelaRita.ok && /Não achei|outra pessoa/.test(pelaRita.motivo), pelaRita);
  const direto = await L.sb.caixa.rpc('mozart_desfazer', { p_acao: acaoTito });
  T.ok('nem chamando a função direto (só quem pediu ou o dono)', direto.error && /Só quem pediu ou o dono|Não achei/.test(direto.error.message), direto.error);
  const ler = await L.sb.caixa.rpc('mozart_desfazer_ler', { p_acao: acaoTito });
  T.ok('a leitura do que foi gravado não abre por fora do Desfazer', Boolean(ler.error), ler.error);
  const linhas = await L.sb.dono.from('mozart_acoes_linhas').select('id').limit(1);
  T.ok('as linhas guardadas não são lidas pela API (nem pelo dono)', Boolean(linhas.error) || !(linhas.data || []).length, linhas);
  const peloDono = await desfazer('dono', acaoTito);
  T.ok('o dono desfaz o do Tito', peloDono.ok && q(`select status from agendamentos where petshop_id='${P}' and pet_id='${L.pets.Rex}' order by criado_em desc limit 1`) === 'cancelado', peloDono);
  const deNovo = await desfazer('dono', acaoTito);
  T.ok('duas vezes: "Isso já foi desfeito."', !deNovo.ok && deNovo.motivo === 'Isso já foi desfeito.', deNovo);

  // caixa fechado: o recebimento da Rita não sai mais
  const daRita = await pedir('caixa', [uso('lancar_dinheiro', { tipo: 'entrada', valor: 20, forma: 'dinheiro', categoria: 'Outros', descricao: 'Recebido Rita' })]);
  T.ok('Rita lançou no automático', daRita.feitos[0]?.ok, daRita.feitos);
  B.must(await L.sb.dono.from('caixas').update({ fechado_em: new Date().toISOString(), fechado_por: (await L.sb.dono.auth.getUser()).data.user.id, valor_contado: 20 }).eq('petshop_id', P).is('fechado_em', null).select('id'), 'fechar o caixa');
  const fechado = await desfazer('caixa', daRita.feitos[0]?.acao);
  T.ok('depois do caixa fechado: explica e nada sai', !fechado.ok && /caixa/.test(fechado.motivo) && /fechado/.test(fechado.motivo) && lanc('Recebido Rita') === '1', fechado);
  const fechadoDono = await desfazer('dono', daRita.feitos[0]?.acao);
  T.ok('nem pelo dono (a trava do caixa vale para todos)', !fechadoDono.ok && /fechado/.test(fechadoDono.motivo) && lanc('Recebido Rita') === '1', fechadoDono);

  // mudou depois
  const mudou = await pedir('dono', [uso('alterar_servico', { servico_id: L.S['Hidratação'], preco: 77 })]);
  B.must(await L.sb.dono.from('servicos').update({ preco_p: 70 }).eq('id', L.S['Hidratação']).select('id'), 'mudar à mão');
  const dm = await desfazer('dono', mudou.feitos[0]?.acao);
  T.ok('mudou depois por alguém: explica e nada volta', !dm.ok && /mudado depois/.test(dm.motivo) && q(`select preco_p from servicos where id='${L.S['Hidratação']}'`) === '70.00', dm);
  // 24 horas
  const velha = await pedir('dono', [uso('registrar_saude', { pet_id: L.pets.Bob, tipo: 'vermifugo', nome: 'Drontal' })]);
  q(`update mozart_acoes set criado_em = now() - interval '25 hours' where id='${velha.feitos[0]?.acao}'`);
  const dv = await desfazer('dono', velha.feitos[0]?.acao);
  T.ok('passou de 24 horas: explica', !dv.ok && /24 horas/.test(dv.motivo), dv);

  T.secao('Desligar');
  const desl = await L.sb.caixa.rpc('mozart_automatico_ligar', { p_petshop: P, p_ligar: false });
  T.ok('Rita desliga (sempre pode), e fica registrado', !desl.error && !desl.data.ligado && !desl.data.efetivo && q(`select count(*) from mozart_automatico_aceites where petshop_id='${P}' and not ligou`) === '1', desl.error || desl.data);
  const voltaCartao = await pedir('caixa', [uso('lancar_dinheiro', { tipo: 'entrada', valor: 5, forma: 'pix', categoria: 'Outros', descricao: 'Depois de desligar' })]);
  T.ok('desligado: volta o cartão', voltaCartao.propostas.length === 1 && !voltaCartao.feitos.length);
}))();
