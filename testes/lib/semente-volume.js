// Enche uma loja de teste (criarLoja) com história por SQL direto: horários de mais de um ano, contas com serviço e produto,
// partes de conta, "cobrar a diferença" (pela coluna e pela marca antiga no item), devoluções, créditos, taxas, estadias com
// sinal, pacotes, bloqueios e pedidos do link. Serve para comparar o resultado de uma função antes e depois de uma troca
// (banco/desempenho-operacao.js) e para apagar uma loja com caixas fechados. Sem gatilhos (session_replication_role = replica),
// como a limpeza das lojas de teste. `n`: quantos horários (o resto acompanha).
const B = require('./base');

function semearVolume(L, n = 400) {
  const sql = `
begin;
set local session_replication_role = replica;
select setseed(0.31);
create temp table z on commit drop as select '${L.P}'::uuid as p, (select user_id from profissionais where id = '${L.ids.dono}') as u, ${n}::int as n;
insert into clientes (petshop_id, nome, telefone) select p, 'Tutor Volume ' || g, '119' || lpad((70000000 + g)::text, 8, '0') from z, generate_series(1, greatest(20, n / 8)) g;
create temp table zc on commit drop as select id, row_number() over (order by id) as k from clientes where petshop_id = (select p from z);
insert into pets (petshop_id, cliente_id, nome, especie, porte, sexo)
select (select p from z), c.id, 'Pet Volume ' || g, 'cao', (array['P','M','G','GG'])[1 + g % 4], (array['M','F'])[1 + g % 2]
from generate_series(1, (select greatest(30, n / 5) from z)) g join zc c on c.k = 1 + g % (select count(*) from zc);
create temp table zp on commit drop as select id, cliente_id, row_number() over (order by id) as k from pets where petshop_id = (select p from z);
create temp table zs on commit drop as select id, row_number() over (order by id) as k from servicos where petshop_id = (select p from z) and categoria not in ('creche', 'hotel');
create temp table zf on commit drop as select id, row_number() over (order by id) as k from profissionais where petshop_id = (select p from z);
insert into produtos (petshop_id, nome, categoria, preco_venda, custo, estoque) select p, 'Produto Volume ' || g, 'Higiene', 10 + g, 4 + g / 2.0, 100 from z, generate_series(1, 12) g;
create temp table zd on commit drop as select id, nome, preco_venda, row_number() over (order by id) as k from produtos where petshop_id = (select p from z);
-- comissão: por serviço, em extras e em produtos
update profissionais set comissao_pct = 30 where petshop_id = (select p from z) and id in (select id from zf where k <= 3);
update petshops set opcoes = coalesce(opcoes, '{}'::jsonb) || '{"comissao.em_extras": true, "comissao.em_produtos": true, "comissao.produtos_pct": 5, "comissao.por_servico": true}'::jsonb where id = (select p from z);
insert into comissao_servicos (servico_id, petshop_id, pct) select id, (select p from z), 25 from zs where k = 2 on conflict do nothing;
-- caixas: um a cada 5 dias, fechados (o de hoje não)
create temp table zx on commit drop as select gen_random_uuid() as id, d::date as dia from generate_series((now() - interval '420 days')::date, (now() - interval '1 day')::date, interval '5 days') d;
insert into caixas (id, petshop_id, aberto_em, aberto_por, valor_inicial, fechado_em, fechado_por, valor_contado, valor_esperado)
select x.id, (select p from z), x.dia + time '08:00', (select u from z), 50, x.dia + time '19:00', (select u from z), 300, 300 from zx x;
-- horários: 420 dias para trás e 10 para a frente
create temp table za on commit drop as
select gen_random_uuid() as id, g, date_trunc('day', now()) - ((420 - (g * 430.0 / (select n from z)))::int || ' days')::interval + ((8 * 60 + (g * 37) % 540) || ' minutes')::interval as inicio,
  1 + (g * 7) % (select count(*) from zp) as pk, 1 + g % (select count(*) from zs) as sk, 1 + g % (select count(*) from zf) as fk, random() as r
from generate_series(1, (select n from z)) g;
insert into agendamentos (id, petshop_id, pet_id, servico_id, profissional_id, inicio, fim, status, preco, origem, criado_por, valor_concluido)
select a.id, (select p from z), zp.id, case when a.g % 23 = 0 then null else zs.id end, case when a.g % 17 = 0 then null else zf.id end, a.inicio,
  a.inicio + case when a.g % 41 = 0 then interval '3 hours' else interval '60 minutes' end,
  (case when a.inicio > now() then 'marcado' when a.r < 0.85 then 'concluido' when a.r < 0.92 then 'faltou' when a.r < 0.97 then 'cancelado' else 'marcado' end)::status_agendamento,
  60 + (a.g % 5) * 20, 'tela', (select u from z), case when a.inicio <= now() and a.r < 0.85 then 60 + (a.g % 5) * 20 end
from za a join zp on zp.k = a.pk join zs on zs.k = a.sk join zf on zf.k = a.fk;
insert into agendamento_servicos (petshop_id, agendamento_id, servico_id, preco, ordem)
select (select p from z), a.id, zs.id, 30, 1 from za a join zs on zs.k = 1 + (a.sk % (select count(*) from zs)) where a.g % 10 < 3;
-- contas dos concluídos: só serviço; serviço + produto; com desconto (item negativo); item com valor que não é número; itens que não são lista
insert into lancamentos (petshop_id, tipo, valor, forma, categoria, descricao, data, pago, caixa_id, agendamento_id, cliente_id, criado_por, criado_em, pago_em, itens)
select g.petshop_id, 'entrada',
  case when za.g % 9 = 0 then g.preco + 25.5 when za.g % 13 = 0 then g.preco - 7.25 else g.preco + case when za.g % 10 < 3 then 30 else 0 end end,
  (array['pix','dinheiro','debito','credito'])[1 + za.g % 4], 'banho', 'Atendimento', (g.inicio at time zone 'America/Sao_Paulo')::date, true,
  (select x.id from zx x where x.dia <= (g.inicio at time zone 'America/Sao_Paulo')::date order by x.dia desc limit 1), g.id, pe.cliente_id, (select u from z), g.fim, g.fim,
  case when za.g % 29 = 0 then '{"nao": "lista"}'::jsonb
       when za.g % 31 = 0 then null
       else jsonb_build_array(jsonb_build_object('tipo', 'servico', 'servico_id', g.servico_id, 'nome', 'Serviço', 'qtd', 1, 'valor', g.preco))
         || case when za.g % 10 < 3 then jsonb_build_array(jsonb_build_object('tipo', 'servico', 'servico_id', (select s.servico_id from agendamento_servicos s where s.agendamento_id = g.id limit 1), 'nome', 'Outro serviço', 'qtd', 1, 'valor', 30)) else '[]'::jsonb end
         || case when za.g % 9 = 0 then jsonb_build_array(jsonb_build_object('tipo', 'produto', 'produto_id', (select id from zd where k = 1 + za.g % 12), 'nome', 'Produto junto', 'qtd', 2, 'valor', 9.9),
                                                         jsonb_build_object('tipo', 'extra', 'nome', 'Taxa de busca', 'qtd', 1, 'valor', 5.7)) else '[]'::jsonb end
         || case when za.g % 13 = 0 then jsonb_build_array(jsonb_build_object('tipo', 'desconto', 'nome', 'Desconto', 'qtd', 1, 'valor', -7.25)) else '[]'::jsonb end
         || case when za.g % 37 = 0 then jsonb_build_array(jsonb_build_object('tipo', 'servico', 'nome', 'Valor torto', 'qtd', 'dois', 'valor', 'abc'), 'solto'::text) else '[]'::jsonb end
  end
from agendamentos g join za on za.id = g.id join pets pe on pe.id = g.pet_id
where g.petshop_id = (select p from z) and g.status = 'concluido' and za.g % 19 <> 0;
-- parte de conta (conta_id), "cobrar a diferença" pela coluna e pela marca antiga no item
insert into lancamentos (petshop_id, tipo, valor, forma, categoria, descricao, data, pago, conta_id, cliente_id, criado_por, pago_em)
select l.petshop_id, 'entrada', 15, 'dinheiro', l.categoria, 'Parte da conta', l.data, true, l.id, l.cliente_id, (select u from z), l.pago_em
from (select * from lancamentos where petshop_id = (select p from z) and agendamento_id is not null order by id limit (select n / 10 from z)) l;
insert into lancamentos (petshop_id, tipo, valor, forma, categoria, descricao, data, pago, diferenca_de, cliente_id, criado_por, pago_em, itens)
select l.petshop_id, 'entrada', 12.5, 'pix', l.categoria, 'Diferença', l.data, true, l.agendamento_id, l.cliente_id, (select u from z), l.pago_em, l.itens
from (select * from lancamentos where petshop_id = (select p from z) and agendamento_id is not null order by id desc limit (select n / 12 from z)) l;
insert into lancamentos (petshop_id, tipo, valor, forma, categoria, descricao, data, pago, cliente_id, criado_por, pago_em, itens)
select l.petshop_id, 'entrada', 8.4, 'pix', l.categoria, 'Diferença (marca antiga)', l.data, true, l.cliente_id, (select u from z), l.pago_em,
  jsonb_build_array(jsonb_build_object('tipo', 'servico', 'nome', 'Diferença', 'qtd', 1, 'valor', 8.4, 'diferenca_de', l.agendamento_id::text),
                    jsonb_build_object('tipo', 'servico', 'nome', 'Diferença de novo', 'qtd', 1, 'valor', 0, 'diferenca_de', l.agendamento_id::text))
from (select * from lancamentos where petshop_id = (select p from z) and agendamento_id is not null order by id offset (select n / 4 from z) limit (select n / 14 from z)) l;
-- vendas de balcão (produto; algumas com serviço sem horário), com quem vendeu
create temp table zv on commit drop as select gen_random_uuid() as id, g, now() - (random() * 420 || ' days')::interval as quando from generate_series(1, (select (n * 0.7)::int from z)) g;
insert into lancamentos (id, petshop_id, tipo, valor, forma, categoria, descricao, data, pago, caixa_id, cliente_id, criado_por, criado_em, pago_em, vendido_por, itens)
select v.id, (select p from z), 'entrada', d.preco_venda * (1 + v.g % 3) + case when v.g % 8 = 0 then 20 else 0 end, (array['pix','dinheiro','debito','credito'])[1 + v.g % 4], 'Venda de produtos', d.nome,
  (v.quando at time zone 'America/Sao_Paulo')::date, true, (select x.id from zx x where x.dia <= (v.quando at time zone 'America/Sao_Paulo')::date order by x.dia desc limit 1),
  case when v.g % 2 = 0 then (select id from zc where k = 1 + v.g % (select count(*) from zc)) end, (select u from z), v.quando, v.quando,
  case when v.g % 3 = 0 then (select id from zf where k = 1 + v.g % (select count(*) from zf)) end,
  jsonb_build_array(jsonb_build_object('tipo', 'produto', 'produto_id', d.id, 'nome', d.nome, 'qtd', 1 + v.g % 3, 'valor', d.preco_venda))
    || case when v.g % 8 = 0 then jsonb_build_array(jsonb_build_object('tipo', 'servico', 'servico_id', (select id from zs where k = 1), 'nome', 'Banho avulso', 'qtd', 1, 'valor', 20)) else '[]'::jsonb end
from zv v join zd d on d.k = 1 + v.g % 12;
insert into movimentos_estoque (petshop_id, produto_id, tipo, quantidade, custo_unitario, motivo, origem, criado_por, criado_em, lancamento_id)
select (select p from z), d.id, 'saida', 1 + v.g % 3, 4 + d.k / 2.0, 'Venda', 'sistema', (select u from z), v.quando, v.id from zv v join zd d on d.k = 1 + v.g % 12;
-- saídas, com devoluções (e a linha em devolucoes)
insert into lancamentos (petshop_id, tipo, valor, forma, categoria, descricao, data, pago, criado_por, pago_em)
select p, 'saida', 20 + g % 90, 'pix', (array['Produtos e material', 'Água, luz e internet', 'Outros', 'Devolução de sinal'])[1 + g % 4], 'Despesa ' || g, (now() - ((g * 420.0 / (n / 4)) || ' days')::interval)::date, true, u, now()
from z, generate_series(1, (select n / 4 from z)) g;
create temp table zdv on commit drop as select gen_random_uuid() as sid, l.id as venda, l.cliente_id, l.itens, row_number() over () as k, l.pago_em + interval '2 days' as quando
from (select * from lancamentos where petshop_id = (select p from z) and categoria = 'Venda de produtos' order by id limit (select n / 20 from z)) l;
insert into lancamentos (id, petshop_id, tipo, valor, forma, categoria, descricao, data, pago, criado_por, pago_em)
select d.sid, (select p from z), 'saida', (d.itens -> 0 ->> 'valor')::numeric, 'pix', 'Devolução', 'Devolução', (d.quando at time zone 'America/Sao_Paulo')::date, true, (select u from z), d.quando from zdv d;
insert into devolucoes (petshop_id, venda_id, cliente_id, modo, itens, valor, forma, saida_id, chave, criado_por, criado_em)
select (select p from z), d.venda, d.cliente_id, 'dinheiro', jsonb_build_array(jsonb_build_object('produto_id', d.itens -> 0 ->> 'produto_id', 'nome', d.itens -> 0 ->> 'nome', 'qtd', 1, 'valor', (d.itens -> 0 ->> 'valor')::numeric)),
  (d.itens -> 0 ->> 'valor')::numeric, 'pix', d.sid, 'volume-dev-' || d.k, (select u from z), d.quando from zdv d;
-- taxas de maquininha e créditos de tutor
insert into lancamentos_taxas (lancamento_id, petshop_id, parcelas, taxa, cartao, partes, regra)
select l.id, l.petshop_id, 1, round(l.valor * 0.03, 2), l.valor, '[]', '{}' from lancamentos l where l.petshop_id = (select p from z) and l.forma in ('debito', 'credito') and l.tipo = 'entrada';
insert into clientes_creditos (petshop_id, cliente_id, valor, motivo, criado_em, criado_por, lancamento_id)
select (select p from z), c.id, case when g % 3 = 0 then -(5 + g % 20) else 10 + g % 50 end, 'Crédito ' || g, now() - ((g * 400.0 / (select n / 6 from z)) || ' days')::interval, (select u from z),
  case when g % 6 = 0 then (select id from lancamentos where petshop_id = (select p from z) and tipo = 'entrada' order by id offset g limit 1) end
from generate_series(1, (select n / 6 from z)) g join zc c on c.k = 1 + g % (select count(*) from zc);
-- estadias: creche e hotel, encerradas, canceladas (metade com o dia do cancelamento) e reservadas; sinal pago descontado na conta
create temp table ze on commit drop as select gen_random_uuid() as id, g, date_trunc('day', now()) - ((420 - (g * 425.0 / (select n / 2 from z)))::int || ' days')::interval + interval '8 hours' as ent, 1 + (g * 11) % (select count(*) from zp) as pk
from generate_series(1, (select n / 2 from z)) g;
insert into estadias (id, petshop_id, pet_id, tipo, entrada, saida_prevista, saida, valor_diaria, status, diarias_cobradas, valor_cobrado)
select e.id, (select p from z), zp.id, case when e.g % 4 = 0 then 'hotel' else 'creche' end, e.ent,
  e.ent + case when e.g % 4 = 0 then interval '3 days' else interval '10 hours' end,
  case when e.ent < now() - interval '4 days' and e.g % 15 <> 1 then e.ent + case when e.g % 4 = 0 then interval '3 days' else interval '10 hours' end end,
  case when e.g % 4 = 0 then 90 else 50 end,
  case when e.g % 15 = 1 then 'cancelada' when e.ent < now() - interval '4 days' then 'encerrada' else 'reservada' end,
  case when e.g % 4 = 0 then 3 else 1 end, case when e.g % 4 = 0 then 270 else 50 end
from ze e join zp on zp.k = e.pk;
insert into estadias_canceladas (estadia_id, petshop_id, cancelada_em)
select e.id, e.petshop_id, e.entrada - interval '40 days' from estadias e join ze on ze.id = e.id where e.status = 'cancelada' and ze.g % 2 = 1 on conflict do nothing;
create temp table zl on commit drop as select e.id as estadia, gen_random_uuid() as conta, gen_random_uuid() as sinal, e.saida, e.entrada, e.valor_cobrado, pe.cliente_id, row_number() over (order by e.id) as k
from estadias e join pets pe on pe.id = e.pet_id where e.petshop_id = (select p from z) and e.status = 'encerrada';
insert into lancamentos (id, petshop_id, tipo, valor, forma, categoria, descricao, data, pago, cliente_id, criado_por, pago_em)
select l.conta, (select p from z), 'entrada', l.valor_cobrado - case when l.k % 5 = 0 then 40 else 0 end, 'pix', 'Creche e hotel', 'Estadia', (l.saida at time zone 'America/Sao_Paulo')::date, true, l.cliente_id, (select u from z), l.saida from zl l;
insert into lancamentos (id, petshop_id, tipo, valor, forma, categoria, descricao, data, pago, cliente_id, criado_por, pago_em)
select l.sinal, (select p from z), 'entrada', 40, 'pix', 'Creche e hotel', 'Sinal', (l.entrada at time zone 'America/Sao_Paulo')::date - 3, true, l.cliente_id, (select u from z), l.entrada - interval '3 days' from zl l where l.k % 5 = 0;
insert into estadias_valores (estadia_id, petshop_id, sinal, sinal_estado, sinal_lancamento_id, conta)
select l.estadia, (select p from z), case when l.k % 5 = 0 then 40 end, case when l.k % 5 = 0 then 'pago' end, case when l.k % 5 = 0 then l.sinal end,
  case when l.k % 3 = 0 or l.k % 5 = 0 then jsonb_build_object('lancamento_id', l.conta::text) end from zl l where l.k % 5 = 0 or l.k % 3 = 0;
-- pacotes (acabado, no último, vencido, vencendo, novo) ligados a horários concluídos
create temp table zk on commit drop as select gen_random_uuid() as id, g from generate_series(1, least(60, (select count(*)::int from zp))) g;
insert into pacotes_clientes (id, petshop_id, pet_id, nome, servico_id, total, usados, comprado_em, vence_em, preco, ativo, criado_em, acabou_em)
select k.id, (select p from z), zp.id, 'Pacote ' || k.g, (select id from zs where k = 1), 4, case when k.g % 5 = 0 then 4 when k.g % 5 = 1 then 3 else k.g % 3 end,
  current_date - (k.g * 3), case when k.g % 7 = 0 then current_date - (k.g % 40) when k.g % 7 = 1 then current_date + (k.g % 10) else current_date + 60 end,
  200, k.g % 13 <> 0, now() - ((k.g * 3) || ' days')::interval, case when k.g % 10 = 0 then now() - ((k.g % 50) || ' days')::interval end
from zk k join zp on zp.k = k.g;
insert into pacotes_clientes (petshop_id, pet_id, nome, servico_id, total, usados, comprado_em, vence_em, preco, ativo, criado_em)
select (select p from z), zp.id, 'Pacote novo ' || k.g, (select id from zs where k = 1), 4, 0, current_date, current_date + 90, 200, true, now() from zk k join zp on zp.k = k.g where k.g % 6 = 0;
with a as (select g.id, g.pet_id, row_number() over (partition by g.pet_id order by g.inicio desc) as rn from agendamentos g where g.petshop_id = (select p from z) and g.status = 'concluido')
update agendamentos g set pacote_cliente_id = k.id from a join zp on zp.id = a.pet_id join zk k on k.g = zp.k where g.id = a.id and a.rn <= 2;
-- bloqueios (um geral de 10 dias, um de uma pessoa, um curto) e pedidos do link esperando
insert into bloqueios (petshop_id, profissional_id, inicio, fim, motivo, criado_por) values
  ((select p from z), null, date_trunc('day', now()) + interval '20 days', date_trunc('day', now()) + interval '30 days', 'Férias coletivas', (select u from z)),
  ((select p from z), (select id from zf where k = 2), date_trunc('day', now()) + interval '2 days', date_trunc('day', now()) + interval '12 days', 'Férias', (select u from z)),
  ((select p from z), (select id from zf where k = 1), date_trunc('day', now()) + interval '1 day 12 hours', date_trunc('day', now()) + interval '1 day 14 hours', 'Almoço', (select u from z));
insert into pedidos_agendamento (petshop_id, tutor_nome, telefone, pet_nome, servico_id, inicio, fim, status, tipo)
select (select p from z), 'Tutor do link ' || g, '11977770000', 'Pet do link', (select id from zs where k = 1), date_trunc('day', now()) + ((g * 26) || ' hours')::interval, date_trunc('day', now()) + ((g * 26 + 1) || ' hours')::interval,
  case when g % 4 = 0 then 'recusado' else 'pendente' end, 'servico' from generate_series(1, 12) g;
commit;`;
  B.sql(sql);
  B.sql('analyze public.lancamentos; analyze public.agendamentos; analyze public.estadias;');
}

module.exports = { semearVolume };
