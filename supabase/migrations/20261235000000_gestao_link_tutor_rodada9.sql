-- Rodada 9 (N7): o link do cliente e tudo o que o tutor vê.
--
-- 1. Endereço do pet shop (rua e número, bairro, complemento): colunas novas em petshops, opcionais, com leitura e gravação
--    por coluna. Entram em link_info e link_pedido (o tutor vê onde fica) e em link_contato.
-- 2. O valor que o link mostrou ao tutor fica guardado com o pedido (pedidos_valores, sem leitura direta): o banco faz a
--    conta ao receber o pedido (preço da lista no porte, com a promoção do horário; estimativa do hotel; diárias da creche).
--    link_pedido devolve o valor ao tutor; pedidos_vistos devolve a quem recebe (dono, Caixa, Financeiro, Relatórios).
-- 3. link_pedido: mais endereço, cidade, serviço, começo e fim de cada item e a hora de buscar (hotel).
-- 4. link_contato: nome e WhatsApp de quem é o link, mesmo com o link desligado (a página "link não está disponível"
--    oferece o botão do WhatsApp). link_inicial leva o contato junto.
-- 5. link_pedir_com_termos: creche só dentro do horário de funcionamento do dia (como o hotel já era) e, hoje, não aceita
--    hora de chegada que já passou (creche e hotel).
-- 6. link_pedido_pedir_horario: o tutor pede outra data escolhendo um horário livre do link (vira o recado de sempre).
-- 7. pedidos_aceitar_juntos: "Aceitar todos" numa operação só (tudo ou nada), com a diária do porte e o sinal.
--
-- Trocas (cópia fiel da definição mais recente, mais o que está dito):
--   link_info (20261123): + endereco, bairro, complemento.
--   link_pedido (20261123): + endereço e cidade do pet shop; por item: servico_id, inicio, fim, hora_fim, ate_hora e valor.
--   link_inicial (20261229): + contato.
--   link_pedir_com_termos (20261177): + horário da creche, hora que já passou e o valor visto da creche e do hotel.
--   gestao_base (20261185): + endereco, bairro, complemento no pet shop (o aplicativo lê o endereço na abertura).

-- ---------- 1. endereço ----------
alter table public.petshops
  add column if not exists endereco text check (endereco is null or char_length(endereco) <= 120),
  add column if not exists bairro text check (bairro is null or char_length(bairro) <= 80),
  add column if not exists complemento text check (complemento is null or char_length(complemento) <= 80);
grant select (endereco, bairro, complemento) on public.petshops to authenticated;
grant update (endereco, bairro, complemento) on public.petshops to authenticated;

create or replace function public.link_info(p_codigo text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'nome', p.nome, 'telefone', p.telefone, 'cidade', p.cidade, 'uf', p.uf, 'horario', p.horario, 'aviso', p.link_aviso,
    'endereco', p.endereco, 'bairro', p.bairro, 'complemento', p.complemento,
    'logo', p.logo, 'tema', p.tema,
    'hoje', (now() at time zone p.fuso)::date,
    'creche', case when p.link_creche then jsonb_build_object('diaria', p.diaria_creche) else null end,
    'hotel', case when p.link_hotel then jsonb_build_object('diaria', p.diaria_hotel) else null end,
    'servicos', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.nome, 'duracao_min', s.duracao_min, 'cor', s.cor,
        'preco_p', s.preco_p, 'preco_m', s.preco_m, 'preco_g', s.preco_g, 'preco_gg', s.preco_gg) order by s.ordem, s.nome)
      from public.servicos s where s.petshop_id = p.id and s.ativo and s.categoria not in ('creche', 'hotel')
    ), '[]'::jsonb)
  )
  from public.petshops p
  where p.link_codigo = p_codigo and p.link_ativo and public.acesso_liberado(p.id)
$$;

-- Nome e WhatsApp de quem é o link (o WhatsApp do negócio, o mesmo que o link mostra quando está ligado).
create or replace function public.link_contato(p_codigo text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('nome', p.nome, 'telefone', p.telefone) from public.petshops p where p.link_codigo = p_codigo
$$;
revoke execute on function public.link_contato(text) from public;
grant execute on function public.link_contato(text) to anon, authenticated, service_role;

create or replace function public.link_inicial(p_codigo text) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'info', public.link_info(p_codigo),
    'nome', public.link_nome(p_codigo),
    'contato', public.link_contato(p_codigo),
    'google', public.link_google(p_codigo),
    'promocoes', public.link_promocoes(p_codigo),
    'fechados', coalesce((select jsonb_agg(d) from public.link_fechados(p_codigo) d), '[]'::jsonb),
    'ia', public.link_ia_ligada(p_codigo),
    'hotel', public.link_hotel_opcoes(p_codigo),
    'opcoes', public.link_opcoes(p_codigo))
$$;

-- ---------- 2. o valor que o tutor viu ----------
create table if not exists public.pedidos_valores (
  pedido_id uuid primary key references public.pedidos_agendamento (id) on delete cascade,
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  visto jsonb not null check (jsonb_typeof(visto) = 'object'),
  criado_em timestamptz not null default now()
);
create index if not exists pedidos_valores_petshop_idx on public.pedidos_valores (petshop_id);
alter table public.pedidos_valores enable row level security;
revoke all on public.pedidos_valores from public, anon, authenticated;
comment on table public.pedidos_valores is 'O valor que o link mostrou ao tutor em cada pedido. Sem regra de leitura: só as funções leem (link_pedido, pedidos_vistos).';

-- Quanto a promoção tira de um preço: % arredonda no centavo; R$ vai até o preço (a mesma conta de descontoNoPreco, promocoes.ts).
create or replace function public.promo_desconto_no_preco(p_promo jsonb, p_preco numeric) returns numeric
language sql immutable set search_path = '' as $$
  select case
    when p_promo is null or p_preco is null or p_preco <= 0 or coalesce(p_promo ->> 'tirada', '') = 'true'
         or jsonb_typeof(p_promo -> 'valor') <> 'number' then 0
    when p_promo ->> 'tipo' = 'pct' then round(p_preco * (p_promo ->> 'valor')::numeric / 100, 2)
    else least((p_promo ->> 'valor')::numeric, p_preco) end
$$;
revoke execute on function public.promo_desconto_no_preco(jsonb, numeric) from public, anon, authenticated;

-- Pedido de serviço: o preço da lista no porte do pet, com a promoção do horário (new.promo, que o gatilho pedidos_promo
-- já pôs). Sem porte (ou sem preço para o porte): um preço só vale para todos; preços diferentes viram "de X a Y".
create or replace function public.pedidos_valor_visto() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  s record; v_base numeric; v_min numeric; v_max numeric; v jsonb;
begin
  begin
    if new.tipo <> 'servico' or new.servico_id is null then return null; end if;
    select x.preco_p, x.preco_m, x.preco_g, x.preco_gg into s from public.servicos x where x.id = new.servico_id and x.petshop_id = new.petshop_id;
    if not found then return null; end if;
    select min(y), max(y) into v_min, v_max from unnest(array[s.preco_p, s.preco_m, s.preco_g, s.preco_gg]) y where y is not null;
    if v_min is null then return null; end if;
    v_base := case new.porte when 'P' then s.preco_p when 'M' then s.preco_m when 'G' then s.preco_g when 'GG' then s.preco_gg end;
    if v_base is null and v_min = v_max then v_base := v_min; end if;
    v := jsonb_build_object('tipo', 'servico', 'porte', new.porte);
    if v_base is not null then
      v := v || jsonb_build_object('base', v_base, 'valor', v_base - public.promo_desconto_no_preco(new.promo, v_base));
    else
      v := v || jsonb_build_object('base_de', v_min, 'base_ate', v_max,
        'de', v_min - public.promo_desconto_no_preco(new.promo, v_min), 'ate', v_max - public.promo_desconto_no_preco(new.promo, v_max));
    end if;
    if new.promo is not null then
      v := v || jsonb_build_object('promo', jsonb_build_object('nome', new.promo ->> 'nome', 'tipo', new.promo ->> 'tipo', 'valor', new.promo -> 'valor'));
    end if;
    insert into public.pedidos_valores (pedido_id, petshop_id, visto) values (new.id, new.petshop_id, v) on conflict (pedido_id) do nothing;
  exception when others then
    -- o valor guardado é um apoio: nunca derruba o pedido
    raise warning 'pedidos_valor_visto: %', sqlerrm;
  end;
  return null;
end $$;
revoke execute on function public.pedidos_valor_visto() from public, anon, authenticated;
drop trigger if exists pedidos_valor_visto on public.pedidos_agendamento;
create trigger pedidos_valor_visto after insert on public.pedidos_agendamento
  for each row execute function public.pedidos_valor_visto();

-- Pedido de creche ou de hotel: a mesma conta que a página mostrou. Hotel: link_hotel_estimativa (porte, temporada, feriado,
-- segundo pet), com os pets na ordem do pedido. Creche: diária vezes os dias. Dia de experiência e preço escondido: nada.
create or replace function public.pedidos_estadia_visto(p_id uuid, p_args jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.pedidos_agendamento; s public.petshops;
  v_ent date; v_sai date; v_pets jsonb; e jsonb; x jsonb; i int := 0; v_diaria numeric; v_dias int; v jsonb;
begin
  select * into p from public.pedidos_agendamento where id = p_id;
  if not found or p.tipo not in ('creche', 'hotel') or coalesce(p.experiencia, false) then return; end if;
  select * into s from public.petshops where id = p.petshop_id;
  v_ent := public.dia_iso(p_args ->> 'p_entrada'); v_sai := public.dia_iso(p_args ->> 'p_saida');
  if v_ent is null or v_sai is null then return; end if;
  v_pets := jsonb_build_array(jsonb_build_object('nome', p_args ->> 'p_pet', 'porte', p_args ->> 'p_porte'))
    || case when jsonb_typeof(p_args -> 'p_mais_pets') = 'array' then p_args -> 'p_mais_pets' else '[]'::jsonb end;
  if p.tipo = 'hotel' then
    e := public.link_hotel_estimativa(s.link_codigo, v_ent, v_sai, v_pets, true);
    if e is null or jsonb_typeof(e -> 'pets') <> 'array' or jsonb_array_length(e -> 'pets') <> jsonb_array_length(v_pets) then return; end if;
  else
    v_diaria := s.diaria_creche;
    if v_diaria is null then return; end if;
    v_dias := (v_sai - v_ent) + 1;
  end if;
  for x in select * from jsonb_array_elements(v_pets) loop
    v := case when p.tipo = 'hotel'
      then jsonb_build_object('tipo', 'hotel', 'noites', e -> 'noites', 'valor', e -> 'pets' -> i -> 'total', 'total', e -> 'total',
             'sinal', e -> 'sinal', 'varia', e -> 'varia', 'desconto', e -> 'desconto')
      else jsonb_build_object('tipo', 'creche', 'dias', v_dias, 'diaria', v_diaria, 'valor', v_diaria * v_dias,
             'total', v_diaria * v_dias * jsonb_array_length(v_pets)) end;
    insert into public.pedidos_valores (pedido_id, petshop_id, visto)
      select q.id, q.petshop_id, v from public.pedidos_agendamento q
       where q.petshop_id = p.petshop_id and (q.id = p.id or (p.grupo_id is not null and q.grupo_id = p.grupo_id))
         and lower(btrim(q.pet_nome)) = lower(left(btrim(coalesce(x ->> 'nome', '')), 80))
      on conflict (pedido_id) do nothing;
    i := i + 1;
  end loop;
end $$;
revoke execute on function public.pedidos_estadia_visto(uuid, jsonb) from public, anon, authenticated;

-- Para quem recebe (dono, Caixa, Financeiro, Relatórios): o valor que o tutor viu em cada pedido que ainda está na lista.
create or replace function public.pedidos_vistos(p uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when public.vejo_financeiro(p) then coalesce((
    select jsonb_object_agg(v.pedido_id, v.visto)
      from public.pedidos_valores v join public.pedidos_agendamento q on q.id = v.pedido_id
     where v.petshop_id = p and (q.status = 'pendente' or q.avisado_em is null or q.cliente_pedido_visto_em is null)
       and q.criado_em > now() - interval '120 days'
  ), '{}'::jsonb) else '{}'::jsonb end
$$;
revoke execute on function public.pedidos_vistos(uuid) from public, anon;
grant execute on function public.pedidos_vistos(uuid) to authenticated, service_role;

-- ---------- 3. a página do pedido ----------
create or replace function public.link_pedido(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'petshop', s.nome, 'telefone', s.telefone, 'codigo', s.link_codigo, 'tutor', split_part(p.tutor_nome, ' ', 1),
    'logo', s.logo, 'tema', s.tema,
    'endereco', s.endereco, 'bairro', s.bairro, 'complemento', s.complemento, 'cidade', s.cidade, 'uf', s.uf,
    'itens', (
      select jsonb_agg(jsonb_build_object(
        'pet', x.pet_nome,
        'servico', case x.tipo when 'creche' then 'Creche' when 'hotel' then 'Hotel' else sv.nome end,
        'servico_id', case when x.tipo = 'servico' then x.servico_id end,
        'tipo', x.tipo,
        'dia', to_char(coalesce(a.inicio, e.entrada, x.inicio) at time zone s.fuso, 'YYYY-MM-DD'),
        'hora', to_char(coalesce(a.inicio, x.inicio) at time zone s.fuso, 'HH24:MI'),
        'ate', case when x.tipo <> 'servico' then to_char(coalesce(e.saida_prevista, x.fim) at time zone s.fuso, 'YYYY-MM-DD') else null end,
        'ate_hora', case when x.tipo <> 'servico' then to_char(coalesce(e.saida_prevista, x.fim) at time zone s.fuso, 'HH24:MI') else null end,
        'hora_fim', case when x.tipo = 'servico' then to_char(coalesce(a.fim, x.fim) at time zone s.fuso, 'HH24:MI') else null end,
        'inicio', coalesce(a.inicio, e.entrada, x.inicio),
        'fim', coalesce(a.fim, e.saida_prevista, x.fim),
        'valor', (select pv.visto from public.pedidos_valores pv where pv.pedido_id = x.id),
        'status', case
          when x.status = 'aceito' and (a.status in ('cancelado', 'faltou') or e.status = 'cancelada') then 'cancelado'
          when x.status = 'aceito' and (a.status = 'concluido' or e.status = 'encerrada') then 'concluido'
          else x.status end
      ) order by x.inicio)
      from public.pedidos_agendamento x
      left join public.servicos sv on sv.id = x.servico_id
      left join public.agendamentos a on a.id = x.agendamento_id
      left join public.estadias e on e.id = x.estadia_id
      where x.id = p.id or (p.grupo_id is not null and x.grupo_id = p.grupo_id)
    )
  )
  from public.pedidos_agendamento p join public.petshops s on s.id = p.petshop_id
  where p.id = p_id
$$;

-- ---------- 6. outra data escolhendo um horário livre ----------
-- O tutor escolhe um horário que o link mostra livre; o banco confere e grava o recado de sempre ("pediu outra data"),
-- já com o dia e a hora. Nada é desmarcado: quem recebe o pedido muda o horário e responde.
create or replace function public.link_pedido_pedir_horario(p_id uuid, p_dia date, p_hora text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.pedidos_agendamento; s public.petshops; n int; v_recado text;
begin
  select * into p from public.pedidos_agendamento where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'erro', 'nao_achei'); end if;
  if p.tipo <> 'servico' or p.servico_id is null then return jsonb_build_object('ok', false, 'erro', 'fechado'); end if;
  select * into s from public.petshops where id = p.petshop_id;
  select count(*) into n from public.link_pedido_itens(p_id) t where t.estado in ('pendente', 'ativo');
  if n = 0 then return jsonb_build_object('ok', false, 'erro', 'fechado'); end if;
  if p_dia is null or coalesce(p_hora, '') !~ '^([01]\d|2[0-3]):[0-5]\d$'
     or not exists (select 1 from public.link_horarios(s.link_codigo, p.servico_id, p_dia, n) h where h = p_hora) then
    return jsonb_build_object('ok', false, 'erro', 'ocupado');
  end if;
  v_recado := 'Quero mudar para ' || (array['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'])[extract(dow from p_dia)::int + 1]
    || ', ' || to_char(p_dia, 'DD/MM') || ', às ' || p_hora || ' (horário que estava livre no link).';
  return public.link_pedido_pedir_mudanca(p_id, v_recado) || jsonb_build_object('recado', v_recado);
end $$;
revoke execute on function public.link_pedido_pedir_horario(uuid, date, text) from public;
grant execute on function public.link_pedido_pedir_horario(uuid, date, text) to anon, authenticated, service_role;

-- ---------- 7. aceitar todos de uma vez ----------
-- Roda com os direitos de quem chama (cada passo confere a permissão como sempre). Tudo numa transação: se um pet não
-- puder ser aceito, nenhum é (a tela mostra o motivo e o pedido inteiro continua esperando).
-- p_portes: { "<id do pedido>": "P" | "M" | "G" | "GG" | "depois" } (o porte respondido na hora de aceitar).
create or replace function public.pedidos_aceitar_juntos(p_ids uuid[], p_profissional uuid default null, p_forcar boolean default false,
  p_tutor_novo boolean default false, p_portes jsonb default null) returns jsonb
language plpgsql set search_path = '' as $$
declare
  q record; v_ag uuid; v_resp text; v_feitos jsonb := '[]'::jsonb; v_sinais int := 0; r jsonb; v_n int := 0;
begin
  if p_ids is null or cardinality(p_ids) < 1 or cardinality(p_ids) > 8 then raise exception 'Pedido não encontrado.' using errcode = 'P0002'; end if;
  for q in select x.id, x.tipo from public.pedidos_agendamento x where x.id = any (p_ids) order by x.inicio, x.id loop
    v_n := v_n + 1;
    v_ag := public.pedido_aceitar_como(q.id, case when q.tipo = 'servico' then p_profissional end, coalesce(p_forcar, false), coalesce(p_tutor_novo, false));
    v_resp := case when jsonb_typeof(p_portes) = 'object' then p_portes ->> q.id::text end;
    if q.tipo = 'servico' and v_ag is not null and v_resp is not null then
      begin
        if v_resp = 'depois' then
          update public.agendamentos a set obs = left(concat_ws(' ', nullif(a.obs, ''), 'Conferir o porte e o valor na hora.'), 400)
           where a.id = v_ag and position('Conferir o porte e o valor na hora.' in coalesce(a.obs, '')) = 0;
        elsif v_resp in ('P', 'M', 'G', 'GG') then
          update public.pets t set porte = v_resp where t.id = (select a.pet_id from public.agendamentos a where a.id = v_ag) and t.porte is null;
          perform public.agendamento_preco_da_tabela(v_ag);
        end if;
      exception when others then
        -- o horário já foi marcado: o porte e o valor ficam para acertar na ficha e no horário
        raise warning 'pedidos_aceitar_juntos (porte): %', sqlerrm;
      end;
    end if;
    v_feitos := v_feitos || jsonb_build_object('id', q.id, 'criado', v_ag);
  end loop;
  if v_n <> cardinality(p_ids) then raise exception 'Pedido não encontrado.' using errcode = 'P0002'; end if;
  -- com todas as reservas criadas: a diária de cada pet (pelo porte) e, por último, o sinal da regra do dono
  for q in select x.id from public.pedidos_agendamento x where x.id = any (p_ids) and x.tipo in ('creche', 'hotel') order by x.inicio, x.id loop
    begin perform public.pedido_acertar_diaria(q.id); exception when others then raise warning 'pedidos_aceitar_juntos (diária): %', sqlerrm; end;
  end loop;
  for q in select x.id from public.pedidos_agendamento x where x.id = any (p_ids) and x.tipo in ('creche', 'hotel') order by x.inicio, x.id loop
    begin
      r := public.pedido_criar_sinal(q.id);
      if r -> 'criado' = 'true'::jsonb then v_sinais := v_sinais + 1; end if;
    exception when others then raise warning 'pedidos_aceitar_juntos (sinal): %', sqlerrm; end;
  end loop;
  return jsonb_build_object('ok', true, 'feitos', v_feitos, 'sinais', v_sinais);
end $$;
revoke execute on function public.pedidos_aceitar_juntos(uuid[], uuid, boolean, boolean, jsonb) from public, anon;
grant execute on function public.pedidos_aceitar_juntos(uuid[], uuid, boolean, boolean, jsonb) to authenticated, service_role;

-- ---------- 5. creche no horário, hora que já passou e o valor visto ----------
CREATE OR REPLACE FUNCTION public.link_pedir_com_termos(p_funcao text, p_args jsonb, p_termos text DEFAULT NULL::text, p_vacinas boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v public.petshops;
  o jsonb;
  v_lista text;
  r jsonb;
  v_id uuid;
  v_grupo uuid;
  v_args jsonb := p_args;
  v_he text;
  v_hs text;
  v_exp boolean := false;
  v_fone text;
  v_rede text;
begin
  if p_funcao not in ('link_pedir', 'link_pedir_estadia', 'link_espera_pedir') or jsonb_typeof(p_args) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_args) k where k !~ '^p_[a-z_]{1,40}$') then
    return jsonb_build_object('ok', false, 'erro', 'dados');
  end if;
  select * into v from public.petshops where link_codigo = p_args ->> 'p_codigo' and link_ativo;
  if not found or not public.acesso_liberado(v.id) then return jsonb_build_object('ok', false, 'erro', 'fechado'); end if;
  o := public.link_opcoes_de(v.opcoes);
  -- dia de experiência (opção da creche): o tutor marca no pedido de creche de um dia só; o pedido guarda a marca
  if p_funcao = 'link_pedir_estadia' and p_args ? 'p_experiencia' then
    v_exp := p_args -> 'p_experiencia' = 'true'::jsonb;
    v_args := v_args - 'p_experiencia';
    if v_exp and (p_args ->> 'p_tipo' is distinct from 'creche' or p_args ->> 'p_entrada' is distinct from p_args ->> 'p_saida'
                  or not public.creche_experiencia_ligada(v.id)) then
      return jsonb_build_object('ok', false, 'erro', 'experiencia');
    end if;
  end if;
  -- hotel: chegada e busca só em dia que abre e dentro do horário de funcionamento daquele dia (ver link_hotel_dia_recusado)
  if p_funcao = 'link_pedir_estadia' and p_args ->> 'p_tipo' = 'hotel' then
    r := public.link_hotel_dia_recusado(v.id, public.dia_iso(p_args ->> 'p_entrada'), coalesce(p_args ->> 'p_hora_entrada', '08:00'), 'entrada');
    if r is null then r := public.link_hotel_dia_recusado(v.id, public.dia_iso(p_args ->> 'p_saida'), coalesce(p_args ->> 'p_hora_saida', '18:00'), 'saida'); end if;
    if r is not null then return r; end if;
  end if;
  -- creche: chegada e busca dentro do horário de funcionamento do dia (só quando a página manda as horas)
  if p_funcao = 'link_pedir_estadia' and p_args ->> 'p_tipo' = 'creche' and p_args ? 'p_hora_entrada' and p_args ? 'p_hora_saida' then
    r := public.link_hotel_dia_recusado(v.id, public.dia_iso(p_args ->> 'p_entrada'), p_args ->> 'p_hora_entrada', 'entrada');
    if r is null then
      r := public.link_hotel_dia_recusado(v.id, public.dia_iso(p_args ->> 'p_saida'), p_args ->> 'p_hora_saida', 'entrada');
      if r is not null then r := r || jsonb_build_object('quando', 'saida'); end if;
    end if;
    if r is not null then return r; end if;
  end if;
  -- creche e hotel: chegada hoje numa hora que já passou
  if p_funcao = 'link_pedir_estadia' and coalesce(p_args ->> 'p_hora_entrada', '') ~ '^([01]\d|2[0-3]):[0-5]\d$'
     and public.dia_iso(p_args ->> 'p_entrada') = (now() at time zone v.fuso)::date
     and (p_args ->> 'p_hora_entrada')::time < (now() at time zone v.fuso)::time then
    return jsonb_build_object('ok', false, 'erro', 'datas', 'motivo', 'hora_passou');
  end if;
  if p_funcao = 'link_espera_pedir' then
    v_he := case when p_args ->> 'p_hora_entrada' ~ '^([01]\d|2[0-3]):[0-5]\d$' then p_args ->> 'p_hora_entrada' end;
    v_hs := case when p_args ->> 'p_hora_saida' ~ '^([01]\d|2[0-3]):[0-5]\d$' then p_args ->> 'p_hora_saida' end;
    v_args := v_args - 'p_hora_entrada' - 'p_hora_saida';
  end if;
  if (o ->> 'termos')::boolean then
    if regexp_replace(btrim(coalesce(p_termos, '')), '\r', '', 'g') <> regexp_replace(o ->> 'texto', '\r', '', 'g')
       or ((o ->> 'vacinas')::boolean and not coalesce(p_vacinas, false)) then
      return jsonb_build_object('ok', false, 'erro', 'termos');
    end if;
  end if;
  -- muitos pedidos de uma vez (da loja toda, do mesmo WhatsApp ou da mesma rede): pede para tentar mais tarde (da 20261164)
  v_fone := public.link_fone_chave(p_args ->> 'p_telefone');
  v_rede := public.link_rede();
  if public.link_muitos_envios(v.id, v_fone, v_rede) then
    return jsonb_build_object('ok', false, 'erro', 'limite', 'motivo', 'muitos',
      'mensagem', 'Recebemos muitos pedidos agora. Tente de novo mais tarde ou chame no WhatsApp.');
  end if;
  select string_agg(format('%I => %L', e.key,
      case jsonb_typeof(e.value) when 'null' then null when 'string' then e.value #>> '{}' else e.value::text end), ', ')
    into v_lista from jsonb_each(v_args) e;
  begin
    execute format('select public.%I(%s)', p_funcao, v_lista) into r;
  exception when undefined_function or invalid_text_representation or datetime_field_overflow or invalid_datetime_format then
    return jsonb_build_object('ok', false, 'erro', 'dados');
  end;
  if r ->> 'ok' = 'true' then
    insert into public.link_envios (petshop_id, tipo, fone, rede, pedido_id)
      values (v.id, case when p_funcao = 'link_espera_pedir' then 'espera' else 'pedido' end, v_fone, v_rede,
              case when (r ->> 'id') ~* '^[0-9a-f-]{36}$' then (r ->> 'id')::uuid end);
  end if;
  -- o valor que a página mostrou (estimativa do hotel, diárias da creche) fica guardado com o pedido
  if p_funcao = 'link_pedir_estadia' and r ->> 'ok' = 'true' and (r ->> 'id') ~* '^[0-9a-f-]{36}$' then
    begin
      perform public.pedidos_estadia_visto((r ->> 'id')::uuid, v_args);
    exception when others then
      raise warning 'pedidos_estadia_visto: %', sqlerrm;
    end;
  end if;
  if p_funcao = 'link_espera_pedir' and r ->> 'ok' = 'true' and (r ->> 'id') is not null then
    v_id := (r ->> 'id')::uuid;
    perform set_config('maestro.link', '1', true);
    update public.lista_espera
      set hora_entrada = coalesce(v_he, hora_entrada), hora_saida = coalesce(v_hs, hora_saida),
          termos_aceitos_em = case when (o ->> 'termos')::boolean then now() else termos_aceitos_em end
      where id = v_id and petshop_id = v.id;
    perform set_config('maestro.link', '', true);
    return r;
  end if;
  if v_exp and r ->> 'ok' = 'true' and (r ->> 'id') is not null then
    v_id := (r ->> 'id')::uuid;
    select grupo_id into v_grupo from public.pedidos_agendamento where id = v_id;
    update public.pedidos_agendamento set experiencia = true
      where petshop_id = v.id and (id = v_id or (v_grupo is not null and grupo_id = v_grupo));
  end if;
  if (o ->> 'termos')::boolean and r ->> 'ok' = 'true' and (r ->> 'id') is not null then
    v_id := (r ->> 'id')::uuid;
    select grupo_id into v_grupo from public.pedidos_agendamento where id = v_id;
    update public.pedidos_agendamento
      set termos_aceitos_em = now(), termos_texto = nullif(o ->> 'texto', ''), termos_vacinas = (o ->> 'vacinas')::boolean
      where petshop_id = v.id and (id = v_id or (v_grupo is not null and grupo_id = v_grupo));
  end if;
  return r;
end $function$;

-- ---------- 1b. o aplicativo lê o endereço na abertura ----------
CREATE OR REPLACE FUNCTION public.gestao_base(p uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  return jsonb_build_object(
    'petshop', (
      select to_jsonb(x) from (
        select s.id, s.nome, s.telefone, s.cidade, s.uf, s.endereco, s.bairro, s.complemento, s.fuso, s.horario, s.status, s.plano, s.teste_ate, s.assinatura_desde,
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
$function$;
