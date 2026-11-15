-- Detalhes da rodada 11 (aditiva, segura ANTES do deploy: o código de hoje só lê chaves que continuam iguais).
-- Página do pedido no link: quando o tutor pediu outra data e quem recebe o pedido já remarcou o horário depois disso,
-- a função diz `remarcado_depois = true` e a página troca o recado antigo ("Até lá, o que está combinado continua valendo")
-- por "o horário foi remarcado". Mesma assinatura, mesmo retorno, uma chave a mais. Usa `agendamentos.remarcado_em` (20261166).

create or replace function public.link_pedido_cliente(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  p public.pedidos_agendamento;
  s public.petshops;
  o jsonb;
  v_pend boolean; v_ativo boolean; v_comeca timestamptz; v_itens jsonb;
  v_limite timestamptz;
  v_liga boolean;
  q public.pedidos_agendamento;
  v_remarcou boolean := false;
begin
  select * into p from public.pedidos_agendamento where id = p_id;
  if not found then return null; end if;
  select * into s from public.petshops where id = p.petshop_id;
  o := public.link_opcoes_de(s.opcoes);
  select coalesce(bool_or(i.estado = 'pendente'), false), coalesce(bool_or(i.estado = 'ativo'), false),
      min(i.comeca) filter (where i.estado = 'ativo'),
      jsonb_agg(jsonb_build_object('chave', i.chave, 'cancelado_cliente', i.estado = 'cliente'))
    into v_pend, v_ativo, v_comeca, v_itens
    from public.link_pedido_itens(p_id) i;
  v_limite := v_comeca - make_interval(hours => (o ->> 'horas')::int);
  v_liga := (o ->> 'cancelar')::boolean and s.link_ativo and public.acesso_liberado(s.id);
  -- o último recado do tutor neste pedido (outra data, ou cancelamento que depende do dono)
  select x.* into q from public.pedidos_agendamento x
    where x.cliente_pediu is not null and (x.id = p.id or (p.grupo_id is not null and x.grupo_id = p.grupo_id and x.petshop_id = p.petshop_id))
    order by x.cliente_pediu_em desc limit 1;
  -- depois do recado de "outra data", quem recebe o pedido já mudou o horário: o recado não fica mais "esperando resposta"
  if q.cliente_pediu = 'mudar' then
    select exists (
      select 1 from public.pedidos_agendamento x join public.agendamentos a on a.id = x.agendamento_id
      where (x.id = p.id or (p.grupo_id is not null and x.grupo_id = p.grupo_id and x.petshop_id = p.petshop_id))
        and a.remarcado_em is not null and a.remarcado_em > q.cliente_pediu_em
    ) into v_remarcou;
  end if;
  return jsonb_build_object(
    'ligado', v_liga,
    'horas', (o ->> 'horas')::int,
    'aberto', v_pend or v_ativo,
    'limite', v_limite,
    -- o mesmo limite no relógio de quem recebe o pedido, como os horários que a página mostra
    'limite_dia', to_char(v_limite at time zone s.fuso, 'YYYY-MM-DD'), 'limite_hora', to_char(v_limite at time zone s.fuso, 'HH24:MI'),
    -- pedido sem resposta cancela a qualquer hora; o que já foi aceito respeita o prazo
    'no_prazo', not v_ativo or now() <= v_limite,
    'itens', coalesce(v_itens, '[]'::jsonb),
    'pediu', q.cliente_pediu, 'pediu_em', q.cliente_pediu_em, 'recado', q.cliente_recado,
    'remarcado_depois', v_remarcou,
    'termos_aceitos_em', p.termos_aceitos_em
  );
end $function$;

-- a função já existia com estes acessos; o replace não muda os grants, mas fica escrito para quem aplica do zero
grant execute on function public.link_pedido_cliente(uuid) to anon, authenticated;
