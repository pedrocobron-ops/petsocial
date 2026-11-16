-- Gestão: abrir o aplicativo mais depressa.
--
-- Só acrescenta duas funções de leitura (nada muda em tabela, regra ou função que já existe): o aplicativo de antes segue
-- funcionando com esta migração aplicada, e o novo, se a função ainda não existir, lê do jeito antigo.
--
-- 1. gestao_base(p): o que o aplicativo lê ao abrir (pet shop, equipe e serviços, com as partes reservadas) numa ida só ao
--    banco, no lugar de oito pedidos ao mesmo tempo. Roda com o login de quem pede (security invoker): as regras de cada
--    tabela (RLS e colunas liberadas) valem igual, e as partes reservadas saem pelas mesmas funções de sempre
--    (petshop_reservado, petshop_diarias, petshop_opcoes, equipe_reservado, servicos_precos), com a mesma conferência de área.
--    Em plpgsql: o corpo só é conferido na hora de rodar (petshop_diarias vem de uma migração aplicada depois de publicar;
--    sem ela, a função falha e o aplicativo lê do jeito antigo).
-- 2. gestao_contagens(p): as seis contagens da tela Hoje (primeiros passos e fim do teste) numa ida só. Também com o login de
--    quem pede: conta só o que a pessoa enxergaria contando pela API.

create or replace function public.gestao_base(p uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path to ''
as $$
begin
  return jsonb_build_object(
    'petshop', (
      select to_jsonb(x) from (
        select s.id, s.nome, s.telefone, s.cidade, s.uf, s.fuso, s.horario, s.status, s.plano, s.teste_ate, s.assinatura_desde,
          s.criado_por, s.criado_em, s.whatsapp, s.link_codigo, s.link_ativo, s.link_aviso, s.vagas, s.guia_feito_em, s.logo, s.tema,
          s.pago_ate, s.periodo_meses, s.vagas_creche, s.vagas_hotel, s.link_creche, s.link_hotel, s.fidelidade_cada,
          s.fidelidade_premio, s.fidelidade_desde, s.modulos, s.principal, s.creche_bloqueia_vacina
        from public.petshops s where s.id = p
      ) x
    ),
    'reservado', coalesce((select jsonb_agg(to_jsonb(r)) from public.petshop_reservado(p) r), '[]'::jsonb),
    'diarias', coalesce((select jsonb_agg(to_jsonb(r)) from public.petshop_diarias(p) r), '[]'::jsonb),
    'opcoes', public.petshop_opcoes(p),
    'equipe', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.criado_em) from (
        select e.id, e.petshop_id, e.user_id, e.nome, e.papel, e.ve_financeiro, e.cor, e.escala, e.atende, e.ativo, e.criado_em,
          e.funcao, e.acessos
        from public.profissionais e where e.petshop_id = p
      ) x
    ), '[]'::jsonb),
    'equipe_reservado', coalesce((select jsonb_agg(to_jsonb(r)) from public.equipe_reservado(p) r), '[]'::jsonb),
    'servicos', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.ordem, x.nome, x.id) from (
        select v.id, v.petshop_id, v.nome, v.categoria, v.duracao_min, v.cor, v.ordem, v.ativo, v.criado_em
        from public.servicos v where v.petshop_id = p
      ) x
    ), '[]'::jsonb),
    'servicos_precos', coalesce((select jsonb_agg(to_jsonb(r)) from public.servicos_precos(p) r), '[]'::jsonb)
  );
end
$$;

revoke execute on function public.gestao_base(uuid) from public, anon;
grant execute on function public.gestao_base(uuid) to authenticated;

create or replace function public.gestao_contagens(p uuid)
returns jsonb
language sql
stable
security invoker
set search_path to ''
as $$
  select jsonb_build_object(
    'pets', (select count(*) from public.pets x where x.petshop_id = p),
    'agendamentos', (select count(*) from public.agendamentos x where x.petshop_id = p),
    'concluidos', (select count(*) from public.agendamentos x where x.petshop_id = p and x.status = 'concluido'),
    'lembrados', (select count(*) from public.agendamentos x where x.petshop_id = p and x.lembrete_em is not null),
    'estadias', (select count(*) from public.estadias x where x.petshop_id = p),
    'produtos', (select count(*) from public.produtos x where x.petshop_id = p)
  )
$$;

revoke execute on function public.gestao_contagens(uuid) from public, anon;
grant execute on function public.gestao_contagens(uuid) to authenticated;
