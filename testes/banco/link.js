// Link do cliente (anônimo, pela API): o que o link mostra, pedido de banho e de hotel, regras e aceite (termos e vacinas),
// dia fechado e fora do horário, dia de experiência, nada vira cliente antes de aceitar, e os freios de envio
// (por WhatsApp, por rede e por loja).
//
// Os freios leem config_interna (link_limite_*). Se o banco de desenvolvimento estiver com eles desligados (valores enormes),
// o teste põe os valores padrão só durante o teste e devolve os de antes no fim.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const T = require('../lib/teste')('link');

const LIMITES = { link_limite_fone_abertos: 6, link_limite_fone_hora: 8, link_limite_rede_hora: 10, link_limite_loja_hora: 25, link_limite_loja_dia: 120, link_limite_pedido_hora: null };

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Link' });
  const { dono } = L.sb;
  const P = L.P, COD = L.codigo, SVC = L.S.Banho;
  const anon = () => B.cliente(B.ipAleatorio());

  T.secao('o que o link mostra');
  const info = B.must(await anon().rpc('link_info', { p_codigo: COD }), 'link_info');
  T.ok('nome, horário e serviços ativos com preço', info.nome?.startsWith('Link') && info.servicos?.some((s) => s.nome === 'Banho' && Number(s.preco_m) === 60) && info.horario, Object.keys(info ?? {}));
  T.ok('nada de dado interno (custo, comissão, e-mail, telefone de cliente)', !/custo|comissao|email|cliente_id/i.test(JSON.stringify(info)));
  T.ok('código que não existe: nada', (await anon().rpc('link_info', { p_codigo: 'naoexiste00' })).data == null);

  const dias = Array.from({ length: 40 }, (_, i) => L.dia(i + 2));
  let cursor = 0;
  const vaga = async (sb) => {
    for (let k = 0; k < dias.length; k++) {
      const dia = dias[(cursor + k) % dias.length];
      const h = await sb.rpc('link_horarios', { p_codigo: COD, p_servico: SVC, p_dia: dia, p_pets: 1 });
      if (h.data?.length) { cursor = (cursor + k) % dias.length; return [dia, h.data[h.data.length - 1]]; }
    }
    throw new Error('sem vaga no link');
  };
  const pedir = async (sb, fone, extra = {}) => {
    const [dia, hora] = await vaga(sb);
    const r = await sb.rpc('link_pedir_com_termos', { p_funcao: 'link_pedir', p_args: { p_codigo: COD, p_servico: SVC, p_dia: dia, p_hora: hora, p_tutor: 'Tutor do Link', p_telefone: fone, p_pet: 'Rex' }, ...extra });
    return r.data ?? { erro: r.error?.message };
  };

  T.secao('pedido de banho e regras');
  const sb1 = anon();
  let r = await pedir(sb1, '11987600001');
  T.ok('pedido de banho pelo link: ok', r.ok === true && r.id, r);
  T.ok('fica pendente, sem virar cliente nem pet antes de aceitar', B.sql(`select status from pedidos_agendamento where id='${r.id}'`) === 'pendente' && B.num(`select count(*) from clientes where petshop_id='${P}' and telefone like '%87600001'`) === 0);
  const [dia0, hora0] = await vaga(sb1);
  const direto = await sb1.rpc('link_pedir', { p_codigo: COD, p_servico: SVC, p_dia: dia0, p_hora: hora0, p_tutor: 'X', p_telefone: '11987600002', p_pet: 'Y' });
  T.ok('a função de pedido não aceita chamada direta (só por link_pedir_com_termos)', !!direto.error, direto.data);
  T.ok('função que não é de pedido: recusada', (await sb1.rpc('link_pedir_com_termos', { p_funcao: 'criar_petshop', p_args: { p_codigo: COD } })).data?.erro === 'dados');
  const TERMOS = 'Traga a carteira de vacinação. Cancelamento com 24 horas de antecedência.';
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'link.termos': true, 'link.termos_texto': TERMOS, 'link.termos_vacinas': true } }), 'regras ligadas');
  T.ok('com regras ligadas: pedido sem aceite é recusado', (await pedir(sb1, '11987600003')).erro === 'termos');
  T.ok('aceite de um texto diferente do atual: recusado', (await pedir(sb1, '11987600003', { p_termos: 'outro texto', p_vacinas: true })).erro === 'termos');
  T.ok('sem confirmar as vacinas: recusado', (await pedir(sb1, '11987600003', { p_termos: TERMOS, p_vacinas: false })).erro === 'termos');
  r = await pedir(sb1, '11987600003', { p_termos: TERMOS, p_vacinas: true });
  T.ok('com o aceite certo: ok, e o pedido guarda o texto aceito e a hora', r.ok === true && B.sql(`select (termos_aceitos_em is not null)::text || '|' || termos_vacinas || '|' || (termos_texto = ${B.q(TERMOS)})::text from pedidos_agendamento where id='${r.id}'`) === 'true|true|true', r);
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'link.termos': false } }), 'regras desligadas');

  T.secao('hotel e creche pelo link');
  const estadia = (args) => anon().rpc('link_pedir_com_termos', { p_funcao: 'link_pedir_estadia', p_args: { p_codigo: COD, p_tutor: 'Tutor Hotel', p_telefone: '11987600010', p_pet: 'Pipoca', p_especie: 'cao', p_porte: 'M', ...args } }).then((x) => x.data ?? { erro: x.error?.message });
  r = await estadia({ p_tipo: 'hotel', p_entrada: L.dia(10), p_saida: L.dia(12), p_hora_entrada: '09:00', p_hora_saida: '17:00' });
  T.ok('pedido de hotel: ok', r.ok === true, r);
  B.must(await dono.from('dias_especiais').insert({ petshop_id: P, dia: L.dia(15), nome: 'Folga', fechado: true, feriado: false }).select('id'), 'dia fechado');
  r = await estadia({ p_tipo: 'hotel', p_entrada: L.dia(15), p_saida: L.dia(17), p_hora_entrada: '09:00', p_hora_saida: '17:00' });
  T.ok('chegada num dia fechado: recusada (dia_fechado)', r.ok === false && r.erro === 'dia_fechado' && r.quando === 'entrada', r);
  r = await estadia({ p_tipo: 'hotel', p_entrada: L.dia(18), p_saida: L.dia(19), p_hora_entrada: '22:00', p_hora_saida: '17:00' });
  T.ok('chegada fora do horário (22:00 com o negócio até 20:00): recusada', r.ok === false && r.erro === 'fora_do_horario', r);
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'creche.experiencia': { ativo: true, max: 1, link: true }, 'creche.experiencia_preco': 40 } }), 'experiência');
  const exp = B.must(await anon().rpc('link_creche_experiencia', { p_codigo: COD }), 'link_creche_experiencia');
  T.ok('o link lê a regra do dia de experiência (ativo, limite e preço)', exp?.ativo === true && exp.max === 1 && Number(exp.preco) === 40, exp);
  r = await estadia({ p_tipo: 'creche', p_entrada: L.dia(3), p_saida: L.dia(4), p_experiencia: true });
  T.ok('dia de experiência em mais de um dia: recusado', r.ok === false && r.erro === 'experiencia', r);
  r = await estadia({ p_tipo: 'creche', p_entrada: L.dia(3), p_saida: L.dia(3), p_experiencia: true, p_telefone: '11987600011', p_pet: 'Novato' });
  T.ok('dia de experiência de um dia: ok, e o pedido fica marcado', r.ok === true && B.sql(`select experiencia from pedidos_agendamento where id='${r.id}'`) === 't', r);
  B.sql(`update petshops set link_ativo = false where id='${P}'`);
  T.ok('link desligado: "fechado"', (await estadia({ p_tipo: 'hotel', p_entrada: L.dia(10), p_saida: L.dia(12), p_hora_entrada: '09:00', p_hora_saida: '17:00' })).erro === 'fechado');
  B.sql(`update petshops set link_ativo = true where id='${P}'`);

  T.secao('freios de envio');
  const antes = Object.fromEntries(Object.keys(LIMITES).map((k) => [k, B.sql(`select valor from config_interna where chave='${k}'`) || null]));
  const poe = (k, v) => B.sql(v == null ? `delete from config_interna where chave='${k}'` : `insert into config_interna (chave, valor) values ('${k}', '${v}') on conflict (chave) do update set valor = excluded.valor`);
  const padrao = () => { for (const [k, v] of Object.entries(LIMITES)) poe(k, v); };
  T.depois(() => { for (const [k, v] of Object.entries(antes)) poe(k, v); });
  const limpar = () => B.sql(`delete from link_envios where petshop_id='${P}'; delete from pedidos_agendamento where petshop_id='${P}' and tutor_nome='Tutor do Link';`);
  padrao(); limpar();
  const rede = anon();
  const formatos = ['11987650001', '(11) 98765-0001', '+55 11 98765-0001', '5511987650001'];
  let n = 0;
  for (let i = 0; i < 6; i++) { r = await pedir(rede, formatos[i % 4]); if (r.ok) n++; else break; }
  // PROBLEMA CONHECIDO: a 20261164 pôs o freio (link_muitos_envios + link_envios) em link_pedir_com_termos, mas a 20261168 e a
  // 20261173 trocaram a função de novo sem ele. Hoje o link não freia envio nenhum. Ver testes/LEIAME.md.
  T.ok('6 pedidos pendentes do mesmo WhatsApp passam (quem tem vários pets)', n === 6, r);
  r = await pedir(rede, formatos[1]);
  T.ok('7º pendente do mesmo número (escrito de outro jeito): "muitos", com a frase para o tutor', r.ok === false && r.erro === 'limite' && r.motivo === 'muitos' && /Recebemos muitos pedidos agora/.test(r.mensagem ?? ''), r);
  T.ok('o banco anota cada envio com a rede em hash (o IP não fica)', B.num(`select count(distinct rede) from link_envios where petshop_id='${P}'`) === 1 && !/\d+\.\d+\.\d+\.\d+/.test(B.sql(`select coalesce(string_agg(rede, ','), '') from link_envios where petshop_id='${P}'`)));
  limpar(); n = 0;
  const rede2 = anon();
  for (let i = 0; i < 12; i++) { r = await pedir(rede2, `119876510${String(i).padStart(2, '0')}`); if (r.ok) n++; else break; }
  T.ok('mesma rede, números diferentes: 10 por hora, o 11º é recusado', n === 10 && r.motivo === 'muitos', `${n} ${JSON.stringify(r)}`);
  limpar(); n = 0;
  for (let i = 0; i < 30; i++) { r = await pedir(anon(), `219876520${String(i).padStart(2, '0')}`); if (r.ok) n++; else break; }
  T.ok('loja toda: 25 por hora, o 26º é recusado', n === 25 && r.motivo === 'muitos', `${n} ${JSON.stringify(r)}`);
  const lojaBarrou = n === 25;
  poe('link_limite_loja_hora', 27);
  r = await pedir(anon(), '21987659999');
  T.ok('o administrador sobe o limite em config_interna, sem migração (com 27, o 26º passa)', lojaBarrou && r.ok === true, r);
  poe('link_limite_loja_hora', 25);
  limpar(); n = 0;
  for (let i = 0; i < 10; i++) { r = await pedir(anon(), '31987653333'); if (r.ok) { n++; B.sql(`update pedidos_agendamento set status='recusado' where petshop_id='${P}' and status='pendente'`); } else break; }
  T.ok('mesmo número, já respondidos: 8 por hora, o 9º é recusado', n === 8 && r.motivo === 'muitos', `${n} ${JSON.stringify(r)}`);
  // o que ainda segura (dentro de link_pedir): no máximo 6 pets pendentes por WhatsApp
  limpar(); n = 0;
  for (let i = 0; i < 8; i++) { r = await pedir(anon(), '41987654444'); if (r.ok) n++; else break; }
  T.ok('o limite antigo de link_pedir continua: 6 pendentes por WhatsApp, o 7º "limite"', n === 6 && r.ok === false && r.erro === 'limite', `${n} ${JSON.stringify(r)}`);
  limpar();
}))();
