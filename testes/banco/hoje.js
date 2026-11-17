// Tela Hoje numa ida só ao banco (migração 20261195, `gestao_hoje`): cada parte tem de ser igual à leitura antiga pela API
// (as mesmas consultas de `hoje-dados.ts`, lerDoJeitoAntigo), para dono, recepção, monitora, tosador e estoque, com as partes
// de estoque, dinheiro e pacotes só para quem tem a área. Anônimo não chama; dono de outra loja não lê nada.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('hoje');
const A = lib('acessos');
const { SELECT_AGENDAMENTO } = lib('tipos');
const { CATEGORIAS_DEVOLUCAO } = lib('faturamento');

// sem depender da ordem das chaves
const normal = (x) => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((c) => [c, v[c]])) : v));
const porJson = (l) => [...(l ?? [])].map(normal).sort();
const iguais = (a, b) => normal(porJson(a)) === normal(porJson(b));
const ts = (s) => (s == null ? s : new Date(s).toISOString());
// as datas: a API e o banco escrevem o mesmo instante; compara como instante
const instantes = (l, campos) => (l ?? []).map((x) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, campos.includes(k) ? ts(v) : v])));

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Hoje' });
  const { dono } = L.sb;
  const P = L.P;
  const em = (dia, hora) => B.instante(dia, hora, L.fuso).toISOString();
  const ag = async (dia, hora, pet, status, extra = {}) => B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets[pet], servico_id: L.S.Banho, inicio: em(dia, hora), fim: em(dia, hora.replace(':00', ':45')), status, ...extra }).select('id').single(), 'horário').id;
  const a1 = await ag(L.hoje, '09:00', 'Thor', 'concluido', { profissional_id: L.ids.tosador, preco: 60 });
  await ag(L.hoje, '11:00', 'Bob', 'marcado');
  await ag(L.hoje, '15:00', 'Luna', 'cancelado');
  await ag(L.dia(1), '10:00', 'Mel', 'marcado');
  await ag(L.dia(2), '10:00', 'Rex', 'confirmado');
  await ag(L.dia(-3), '10:00', 'Rex', 'marcado');
  await ag(L.dia(-10), '10:00', 'Bob', 'concluido');
  B.sql(`insert into agendamento_servicos (petshop_id, agendamento_id, servico_id, ordem, preco) values ('${P}', '${a1}', '${L.S['Corte de unhas']}', 1, 15)`);
  B.must(await dono.from('estadias').insert({ petshop_id: P, pet_id: L.pets.Bob, tipo: 'hotel', status: 'em_casa', entrada: em(L.dia(-1), '09:00'), saida_prevista: em(L.hoje, '18:00') }).select('id'), 'estadia');
  B.must(await dono.from('produtos').update({ estoque: 1 }).eq('id', L.prod).select('id'), 'estoque baixo');
  B.must(await dono.from('lancamentos').insert({ petshop_id: P, tipo: 'entrada', valor: 90.1, forma: 'pix', categoria: 'Serviços', data: L.hoje, pago: true }).select('id'), 'entrada');
  B.must(await dono.from('lancamentos').insert({ petshop_id: P, tipo: 'entrada', valor: 33.3, forma: 'pix', categoria: 'Serviços', data: L.dia(-2), pago: true }).select('id'), 'entrada antiga');
  B.must(await dono.from('lancamentos').insert({ petshop_id: P, tipo: 'saida', valor: 40, categoria: 'Aluguel', data: L.dia(-1), vencimento: L.dia(-1), pago: false }).select('id'), 'conta vencida');
  B.must(await dono.from('pets_saude').insert({ petshop_id: P, pet_id: L.pets.Thor, tipo: 'vacina', nome: 'V10', aplicado_em: L.dia(-360), vence_em: L.dia(5) }).select('id'), 'vacina vencendo');

  const hoje0 = new Date(em(L.hoje, '00:00'));
  const d = (n) => new Date(hoje0.getTime() + n * 864e5); // o fuso de teste não tem horário de verão
  const dow = (new Date(`${L.hoje}T12:00:00Z`).getUTCDay() + 6) % 7;
  const seg = d(-dow);

  for (const papel of ['dono', 'caixa', 'monitor', 'tosador', 'estoque']) {
    T.secao(papel);
    const sb = L.sb[papel];
    const { data: { user } } = await sb.auth.getUser();
    const eu = B.must(await sb.from('profissionais').select('papel, ve_financeiro, acessos').eq('petshop_id', P).eq('user_id', user.id).single(), 'eu');
    const pode = (a) => A.podeArea(eu, a);
    const q = { estoque: pode('estoque'), financeiro: pode('caixa') || pode('financeiro') || pode('relatorios'), cuido: pode('financeiro') || pode('relatorios'), pacotes: pode('pacotes') };
    q.cobrar = q.financeiro && pode('creche_hotel'); q.cobrar_hoje = pode('agenda') || q.financeiro;
    const saudeAte = B.somaDias(L.hoje, 15);
    const r = await sb.rpc('gestao_hoje', { p: P, a: {
      hoje_ini: hoje0.toISOString(), amanha: d(1).toISOString(), depois: d(2).toISOString(), seg: seg.toISOString(), seg7: new Date(seg.getTime() + 7 * 864e5).toISOString(),
      ha30: d(-30).toISOString(), dia: L.hoje, ha6: L.dia(-6), mais7: L.dia(7), saude_ate: saudeAte, cred_de: em(L.dia(-6), '00:00'), cred_ate: d(1).toISOString(),
      devolucao: CATEGORIAS_DEVOLUCAO, ...q } });
    if (!T.passa('gestao_hoje responde (sem cair na leitura antiga)', r, r.data && Array.isArray(r.data.lista))) continue;
    const h = r.data;

    // a agenda de hoje com SELECT_AGENDAMENTO (os serviços a mais na ordem, como a tela usa)
    const lista = B.must(await sb.from('agendamentos').select(SELECT_AGENDAMENTO).eq('petshop_id', P).gte('inicio', hoje0.toISOString()).lt('inicio', d(1).toISOString()).order('inicio').order('id'), 'lista');
    const ord = (l) => l.map((a) => ({ ...a, inicio: ts(a.inicio), fim: ts(a.fim), criado_em: ts(a.criado_em), lembrete_em: ts(a.lembrete_em), sem_cobranca_em: ts(a.sem_cobranca_em), pronto_avisado_em: ts(a.pronto_avisado_em),
      agendamento_servicos: [...(a.agendamento_servicos ?? [])].sort((x, y) => x.ordem - y.ordem || (x.id < y.id ? -1 : 1)) }));
    T.ok('agenda de hoje = a leitura pela API (pet, tutor, serviços, profissional, na ordem)', h.lista.length === 3 && normal(ord(h.lista)) === normal(ord(lista)), { banco: h.lista, api: lista });
    const precos = await sb.rpc('agendamentos_precos', { p: P, p_ids: lista.map((a) => a.id) });
    T.ok('preços = agendamentos_precos (só quem recebe vê)', iguais(h.precos, (precos.data ?? []).map((x) => ({ id: x.id, preco: x.preco }))) && (q.financeiro ? h.precos.length === 4 && h.precos.some((x) => x.preco === 60) && h.precos.some((x) => x.preco === 15) : h.precos.length === 0), { banco: h.precos, api: precos.data });

    const amanha = B.must(await sb.from('agendamentos').select('id, lembrete_em, status, pets(clientes(id, telefone))').eq('petshop_id', P).gte('inicio', d(1).toISOString()).lt('inicio', d(2).toISOString()), 'amanhã');
    T.ok('amanhã igual', amanha.length === 1 && iguais(h.amanha, amanha), { banco: h.amanha, api: amanha });
    const casa = B.must(await sb.from('estadias').select('id, status, entrada, saida_prevista').eq('petshop_id', P).in('status', ['em_casa', 'reservada']).limit(1000), 'estadias');
    T.ok('estadias em casa e reservadas iguais', iguais(instantes(h.em_casa, ['entrada', 'saida_prevista']), instantes(casa, ['entrada', 'saida_prevista'])), { banco: h.em_casa, api: casa });
    const semana = B.must(await sb.from('agendamentos').select('inicio, status').eq('petshop_id', P).gte('inicio', seg.toISOString()).lt('inicio', new Date(seg.getTime() + 7 * 864e5).toISOString()), 'semana');
    T.ok('horários da semana iguais', iguais(instantes(h.semana, ['inicio']), instantes(semana, ['inicio'])), { banco: h.semana, api: semana });
    const mes = B.must(await sb.from('agendamentos').select('status, servicos(nome, cor)').eq('petshop_id', P).gte('inicio', d(-30).toISOString()).lt('inicio', d(1).toISOString()).order('inicio').order('id'), 'mês');
    const porServico = new Map();
    for (const a of mes) { if (['cancelado', 'faltou'].includes(a.status) || !a.servicos) continue; const x = porServico.get(a.servicos.nome) ?? { rotulo: a.servicos.nome, valor: 0, cor: a.servicos.cor }; x.valor++; porServico.set(a.servicos.nome, x); }
    T.ok('serviços mais pedidos = a conta da tela (na mesma ordem)', normal(h.servicos_mes) === normal([...porServico.values()]), { banco: h.servicos_mes, api: [...porServico.values()] });
    const prox = B.must(await sb.from('agendamentos').select('id, inicio, pets(nome)').eq('petshop_id', P).gte('inicio', d(1).toISOString()).in('status', ['marcado', 'confirmado']).order('inicio').order('id').limit(2), 'próximos');
    T.ok('próximos dois iguais, na ordem', normal(instantes(h.proximos, ['inicio'])) === normal(instantes(prox, ['inicio'])), { banco: h.proximos, api: prox });
    const sf = await sb.from('agendamentos').select('id, inicio, pets(nome)', { count: 'exact' }).eq('petshop_id', P).lt('inicio', hoje0.toISOString()).in('status', ['marcado', 'confirmado', 'em_atendimento']).order('inicio').order('id').limit(3);
    T.ok('sem fechar: total e os primeiros iguais', h.sem_fechar_total === sf.count && sf.count === 1 && normal(instantes(h.sem_fechar, ['inicio'])) === normal(instantes(sf.data, ['inicio'])), { banco: [h.sem_fechar_total, h.sem_fechar], api: [sf.count, sf.data] });
    const c = await sb.rpc('gestao_contagens', { p: P });
    T.ok('contagens = gestao_contagens', normal(h.contagens) === normal(c.data), { banco: h.contagens, api: c.data });

    if (q.estoque) {
      const prod = B.must(await sb.from('produtos').select('id, nome, estoque, estoque_minimo').eq('petshop_id', P).eq('ativo', true).gt('estoque_minimo', 0).order('nome').order('id'), 'produtos');
      T.ok('produtos com estoque mínimo iguais', normal(h.acabando) === normal(prod) && prod.length === 1, { banco: h.acabando, api: prod });
    } else T.ok('sem a área Estoque: nada de produtos', h.acabando === undefined);
    if (q.financeiro) {
      const ent = B.must(await sb.from('lancamentos').select('valor, tipo, categoria').eq('petshop_id', P).eq('pago', true).is('movimento', null).eq('data', L.hoje), 'entradas');
      T.ok('o que entrou hoje igual', iguais(h.entradas, ent) && ent.length === 1, { banco: h.entradas, api: ent });
    } else T.ok('sem dinheiro: nada do que entrou', h.entradas === undefined);
    if (q.cuido) {
      const contas = B.must(await sb.from('lancamentos').select('id, valor, vencimento, tipo, categoria').eq('petshop_id', P).eq('pago', false).lte('vencimento', L.hoje), 'contas');
      T.ok('contas vencidas iguais', iguais(h.contas, contas) && contas.length === 1, { banco: h.contas, api: contas });
      const u7 = B.must(await sb.from('lancamentos').select('valor, data').eq('petshop_id', P).eq('pago', true).eq('tipo', 'entrada').is('movimento', null).gte('data', L.dia(-6)).lte('data', L.hoje), 'últimos 7');
      const soma = {}; for (const l of u7) soma[l.data] = Math.round(((soma[l.data] ?? 0) + Number(l.valor)) * 100) / 100;
      T.ok('o que entrou em cada um dos últimos 7 dias igual', normal(Object.fromEntries(h.ultimos7.map((l) => [l.data, Number(l.valor)]))) === normal(soma), { banco: h.ultimos7, api: soma });
      T.ok('devoluções e créditos vêm (vazios aqui)', Array.isArray(h.devolucoes) && Array.isArray(h.creditos));
    } else T.ok('sem o financeiro: nada de contas nem da semana do dinheiro', h.contas === undefined && h.ultimos7 === undefined && h.devolucoes === undefined);
    if (q.pacotes) T.ok('pacotes vencendo: lista (vazia aqui)', Array.isArray(h.pacotes));
    else T.ok('sem Pacotes: nada de pacotes', h.pacotes === undefined);
    const perto = B.must(await sb.from('pets_saude').select('pet_id, tipo, nome, aplicado_em, vence_em, criado_em').eq('petshop_id', P).lte('vence_em', saudeAte).order('vence_em').order('id'), 'saúde');
    T.ok('saúde vencendo igual (e o nome do pet ativo)', h.saude && normal(instantes(h.saude.perto.map(({ id, ...x }) => x), ['criado_em'])) === normal(instantes(perto, ['criado_em'])) && (perto.length === 0 || h.saude.pets.some((p) => p.nome === 'Thor')), { banco: h.saude, api: perto });
    if (q.cobrar) {
      const pc = await sb.rpc('estadias_para_cobrar', { p: P });
      T.ok('check-outs sem cobrança e taxas pendentes contados', h.para_cobrar === Math.min((pc.data ?? []).length, 150) && h.atrasos === 0, { banco: [h.para_cobrar, h.atrasos], api: pc.data });
    }
    if (q.cobrar_hoje) {
      const pc = await sb.rpc('agendamentos_para_cobrar', { p: P, p_de: L.hoje, p_ate: L.hoje });
      T.ok('concluídos de hoje sem cobrança = agendamentos_para_cobrar', iguais(h.cobrar_hoje, (pc.data ?? []).map((x) => x.id)), { banco: h.cobrar_hoje, api: pc.data });
    }
  }

  T.secao('quem não é da loja');
  const a = { hoje_ini: hoje0.toISOString(), amanha: d(1).toISOString(), depois: d(2).toISOString(), seg: seg.toISOString(), seg7: d(7).toISOString(), ha30: d(-30).toISOString(), dia: L.hoje, ha6: L.dia(-6), mais7: L.dia(7), saude_ate: L.dia(15), estoque: true, financeiro: true, cuido: true, pacotes: true, cobrar: true, cobrar_hoje: true, cred_de: d(-6).toISOString(), cred_ate: d(1).toISOString() };
  T.recusa('anônimo não chama gestao_hoje', await B.cliente().rpc('gestao_hoje', { p: P, a }));
  const O = await criarLoja(T, { nome: 'Hoje outra', equipe: false, dados: false });
  const fora = await O.sb.dono.rpc('gestao_hoje', { p: P, a });
  const x = fora.data ?? {};
  T.ok('dono de outra loja não lê nada (tudo vazio, conta zero)', !fora.error && !x.lista.length && !x.amanha.length && !x.em_casa.length && !x.semana.length && !x.entradas.length && !x.contas.length
    && !x.acabando.length && !(x.precos ?? []).length && x.sem_fechar_total === 0 && Object.values(x.contagens).every((v) => v === 0) && !x.saude.perto.length && !(x.cobrar_hoje ?? []).length, fora.error ? fora.error.message : x);
}))();
