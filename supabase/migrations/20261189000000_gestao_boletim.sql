-- Boletim do pet: uma página pública por visita (banho e tosa, dia de creche, dia de hotel), mandada ao tutor por um link no
-- WhatsApp. Sem aplicativo para instalar e sem login: o link (/gestao/boletim/<código>) é um código comprido, impossível de adivinhar,
-- que vale 60 dias. Depois disso a página some; as fotos continuam guardadas (bucket privado) no Álbum do pet, na ficha, enquanto
-- o pet existir. O dono apaga foto por foto.
--
-- Só entram objetos novos: tabelas novas (boletins, boletim_lixo, boletim_acessos, boletim_ia_uso, albuns), funções novas, um
-- bucket privado ("boletim") e políticas novas nele. Nenhuma tabela existente muda (agendamentos, estadias, petshops e as outras
-- com permissão por coluna ficam como estão: as duas opções novas moram em petshops.opcoes, gravadas por petshop_salvar_opcoes,
-- só o dono). O código no ar hoje não chama nada daqui. Nada aqui guarda dinheiro.
--
-- Opções novas em petshops.opcoes:
--   "loja.google"     link do Google para o cliente avaliar a loja (ou o link do Maps). Só endereços do Google (google_link_valido).
--                     Aparece no fim do boletim, do álbum e do link de agendamento, para todos, sem filtro e sem brinde.
--   "boletim.valores" true = o boletim do banho e tosa mostra o valor do atendimento, o que já foi pago e o que falta (só desta
--                     visita; nunca outras dívidas). Desligada por padrão. Creche e hotel não mostram valor.
--
-- 1. Quem lê e grava: a equipe do pet shop, pela área da visita. Banho e tosa (agendamento): área Agenda. Creche e hotel
--    (estadia): área Creche e hotel. A tabela só se lê pela regra; gravar é só pelas funções (boletim_salvar, boletim_enviado),
--    que conferem o pet, a visita, as fotos e a conta liberada. O código do link nasce no banco e ninguém escolhe.
-- 2. Fotos: até 4 por boletim, no bucket privado "boletim", em <petshop>/<aleatório>.jpg. O aparelho de quem manda reduz cada foto,
--    sobe, assina o endereço por 61 dias e entrega ao banco o caminho e o código da assinatura. A página pública nunca recebe o
--    caminho nem a assinatura: o servidor dela pede a foto por número (boletim_foto) e entrega os bytes.
-- 3. Página pública: boletim_publico(código) devolve só o que a página mostra (nome e logo do pet shop, telefone do pet shop,
--    link de agendamento se estiver ligado, nome do pet, data, serviços, texto, recados, atenção, quantas fotos). Nada do tutor.
--    Freio: 60 aberturas da página e 400 fotos por minuto por boletim (PT429).
-- 4. Texto pela IA ("Escrever com o Mozart"): no máximo config_interna 'boletim_ia_dia' (padrão 100) por pet shop por dia.
-- 5. Álbum: albuns guarda um link (/gestao/album/<código>, 60 dias) com as fotos do pet naquele momento; o aparelho de quem cria
--    assina cada foto de novo por 61 dias. O dono apaga uma foto (boletim_apagar_foto): sai do boletim, dos álbuns e vai para a fila.
-- 6. Faxina: boletim_faxina(petshop) põe na fila as fotos que subiram e não entraram em boletim nenhum (mais de um dia), tira da
--    fila o que já sumiu e devolve a lista para o aparelho apagar pela API do Storage (o banco não apaga arquivo do Storage).
--    Boletim com o link vencido fica (as fotos são do álbum); sai junto com o pet (gatilho põe as fotos na fila).
--    boletim_faxina_geral() apaga os links de álbum vencidos e o freio antigo (para rodar agendado).

-- ---------- a tabela ----------
create table public.boletins (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  pet_id uuid not null,
  agendamento_id uuid references public.agendamentos (id) on delete cascade,
  estadia_id uuid references public.estadias (id) on delete cascade,
  token text not null unique check (token ~ '^[0-9a-f]{64}$'),
  texto text not null default '' check (char_length(texto) <= 1500),
  chips jsonb not null default '[]'::jsonb check (jsonb_typeof(chips) = 'array'),
  nota text check (char_length(nota) <= 400),
  atencao text check (char_length(atencao) <= 400),
  fotos text[] not null default '{}' check (cardinality(fotos) <= 4),
  -- o código da assinatura de cada foto (mesma ordem de fotos): é com ele que o servidor da página busca o arquivo
  assinaturas text[] not null default '{}' check (cardinality(assinaturas) <= 4),
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  enviado_em timestamptz,
  expira_em timestamptz not null default now() + interval '60 days',
  check ((agendamento_id is null) <> (estadia_id is null)),
  foreign key (pet_id, petshop_id) references public.pets (id, petshop_id) on delete cascade
);
create index on public.boletins (petshop_id, criado_em desc);
create index on public.boletins (agendamento_id) where agendamento_id is not null;
create index on public.boletins (estadia_id) where estadia_id is not null;
create index on public.boletins (expira_em);

alter table public.boletins enable row level security;
revoke all on public.boletins from public, anon, authenticated;
grant select on public.boletins to authenticated;
-- a equipe lê os boletins das visitas da sua área (gravar, só pelas funções abaixo)
create policy boletins_ler on public.boletins for select to authenticated
  using (petshop_id in (select public.meus_petshops())
    and public.tenho_area(petshop_id, case when agendamento_id is not null then array['agenda'] else array['creche_hotel'] end));

-- ---------- a fila de arquivos para apagar ----------
create table public.boletim_lixo (
  caminho text primary key,
  petshop_id uuid not null, -- sem chave estrangeira: a fila fica mesmo quando o pet shop sai
  motivo text not null default 'apagado',
  criado_em timestamptz not null default now(),
  tentativas int not null default 0
);
create index on public.boletim_lixo (petshop_id, tentativas);
alter table public.boletim_lixo enable row level security;
revoke all on public.boletim_lixo from public, anon, authenticated;

-- boletim que sai (vencido, ou em cascata com o pet, a visita ou o pet shop): as fotos vão para a fila
create function public.boletim_para_lixo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.boletim_lixo (caminho, petshop_id, motivo)
  select f, old.petshop_id, coalesce(nullif(current_setting('gestao.boletim_motivo', true), ''), 'apagado') from unnest(old.fotos) f
  on conflict (caminho) do nothing;
  return old;
end $$;
create trigger boletim_para_lixo after delete on public.boletins
  for each row execute function public.boletim_para_lixo();

-- ---------- o freio da página ----------
create table public.boletim_acessos (
  boletim_id uuid not null references public.boletins (id) on delete cascade,
  tipo text not null,
  minuto timestamptz not null,
  n int not null default 0,
  primary key (boletim_id, tipo, minuto)
);
alter table public.boletim_acessos enable row level security;
revoke all on public.boletim_acessos from public, anon, authenticated;

create function public.boletim_frear(p_boletim uuid, p_tipo text, p_limite int) returns void
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  insert into public.boletim_acessos as a (boletim_id, tipo, minuto, n) values (p_boletim, p_tipo, date_trunc('minute', now()), 1)
  on conflict (boletim_id, tipo, minuto) do update set n = a.n + 1
  returning a.n into v_n;
  if v_n = 1 then delete from public.boletim_acessos a where a.boletim_id = p_boletim and a.minuto < now() - interval '10 minutes'; end if;
  if v_n > p_limite then
    raise exception 'Muitos acessos a este boletim agora. Espere um minuto e abra de novo.' using errcode = 'PT429';
  end if;
end $$;

-- ---------- a contagem do texto pela IA ----------
create table public.boletim_ia_uso (
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  dia date not null,
  textos int not null default 0 check (textos >= 0),
  primary key (petshop_id, dia)
);
alter table public.boletim_ia_uso enable row level security;
revoke all on public.boletim_ia_uso from public, anon, authenticated;

-- Conta um texto antes de chamar o modelo (a rota do servidor chama com o login da pessoa).
-- Devolve { ok, restam } ou { ok: false, motivo: 'sem_acesso' | 'limite' }.
create function public.boletim_ia_contar(p_petshop uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_dia date; v_lim int; v_n int;
begin
  if not public.tenho_area(p_petshop, array['agenda', 'creche_hotel']) or not public.acesso_liberado(p_petshop) then
    return jsonb_build_object('ok', false, 'motivo', 'sem_acesso');
  end if;
  select (now() at time zone coalesce(p.fuso, 'America/Sao_Paulo'))::date into v_dia from public.petshops p where p.id = p_petshop;
  v_lim := public.link_limite('boletim_ia_dia', 100);
  if v_lim <= 0 then return jsonb_build_object('ok', false, 'motivo', 'limite'); end if;
  insert into public.boletim_ia_uso as u (petshop_id, dia, textos) values (p_petshop, v_dia, 1)
  on conflict (petshop_id, dia) do update set textos = u.textos + 1 where u.textos < v_lim
  returning u.textos into v_n;
  if v_n is null then return jsonb_build_object('ok', false, 'motivo', 'limite'); end if;
  return jsonb_build_object('ok', true, 'restam', v_lim - v_n);
end $$;

-- ---------- gravar ----------
-- Cria (p_id nulo) ou corrige um boletim. Uma visita só: o agendamento (área Agenda) ou a estadia (área Creche e hotel), do mesmo
-- pet e do mesmo pet shop. Fotos: [{caminho, assinatura}], até 4, já no bucket, na pasta do pet shop. Foto que sai na correção
-- vai para a fila de apagar. Devolve { id, token, expira_em }.
create function public.boletim_salvar(p_petshop uuid, p_id uuid, p_pet uuid, p_agendamento uuid, p_estadia uuid,
  p_texto text, p_chips jsonb, p_nota text, p_atencao text, p_fotos jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_area text[];
  v_pet uuid;
  b public.boletins;
  v_fotos text[] := '{}';
  v_assin text[] := '{}';
  x record;
begin
  if (p_agendamento is null) = (p_estadia is null) then raise exception 'O boletim é de um atendimento ou de uma estadia.'; end if;
  v_area := case when p_agendamento is not null then array['agenda'] else array['creche_hotel'] end;
  if not public.tenho_area(p_petshop, v_area) then
    raise exception '%', case when p_agendamento is not null then 'Sem acesso à agenda.' else 'Sem acesso à creche e ao hotel.' end;
  end if;
  if not public.acesso_liberado(p_petshop) then raise exception 'A conta está só para consulta.'; end if;

  if p_agendamento is not null then
    select a.pet_id into v_pet from public.agendamentos a where a.id = p_agendamento and a.petshop_id = p_petshop;
  else
    select e.pet_id into v_pet from public.estadias e where e.id = p_estadia and e.petshop_id = p_petshop and e.status in ('em_casa', 'encerrada');
  end if;
  if v_pet is null or v_pet is distinct from p_pet then raise exception 'Visita não encontrada.'; end if;

  if char_length(coalesce(p_texto, '')) > 1500 then raise exception 'O texto ficou grande demais (até 1.500 letras).'; end if;
  if char_length(coalesce(p_nota, '')) > 400 or char_length(coalesce(p_atencao, '')) > 400 then raise exception 'O recado ficou grande demais (até 400 letras).'; end if;
  if jsonb_typeof(coalesce(p_chips, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_chips, '[]'::jsonb)) > 16
     or exists (select 1 from jsonb_array_elements(coalesce(p_chips, '[]'::jsonb)) c where jsonb_typeof(c) <> 'string' or char_length(c #>> '{}') > 80) then
    raise exception 'Recados rápidos inválidos.';
  end if;
  if jsonb_typeof(coalesce(p_fotos, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_fotos, '[]'::jsonb)) > 4 then
    raise exception 'Até 4 fotos por boletim.';
  end if;
  for x in select f ->> 'caminho' as caminho, f ->> 'assinatura' as assinatura from jsonb_array_elements(coalesce(p_fotos, '[]'::jsonb)) f loop
    if x.caminho is null or x.caminho !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$' or public.diario_pasta(x.caminho) is distinct from p_petshop then
      raise exception 'Foto fora da pasta do pet shop.';
    end if;
    if x.assinatura is null or x.assinatura !~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' or char_length(x.assinatura) > 2000 then
      raise exception 'Foto sem assinatura. Tente de novo.';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'boletim' and o.name = x.caminho) then raise exception 'A foto não chegou. Tente de novo.'; end if;
    if x.caminho = any (v_fotos) then raise exception 'Foto repetida.'; end if;
    if exists (select 1 from public.boletins o where x.caminho = any (o.fotos) and o.id is distinct from p_id) then raise exception 'Foto de outro boletim.'; end if;
    v_fotos := v_fotos || x.caminho;
    v_assin := v_assin || x.assinatura;
  end loop;

  if p_id is null then
    insert into public.boletins (petshop_id, pet_id, agendamento_id, estadia_id, token, texto, chips, nota, atencao, fotos, assinaturas, criado_por)
    values (p_petshop, p_pet, p_agendamento, p_estadia, encode(extensions.gen_random_bytes(32), 'hex'), coalesce(trim(p_texto), ''),
      coalesce(p_chips, '[]'::jsonb), nullif(trim(p_nota), ''), nullif(trim(p_atencao), ''), v_fotos, v_assin, (select auth.uid()))
    returning * into b;
  else
    select * into b from public.boletins o where o.id = p_id and o.petshop_id = p_petshop for update;
    if b.id is null or b.agendamento_id is distinct from p_agendamento or b.estadia_id is distinct from p_estadia then raise exception 'Boletim não encontrado.'; end if;
    if b.expira_em <= now() then raise exception 'Este boletim já venceu. Faça um novo.'; end if;
    insert into public.boletim_lixo (caminho, petshop_id, motivo)
    select f, p_petshop, 'trocada' from unnest(b.fotos) f where not (f = any (v_fotos))
    on conflict (caminho) do nothing;
    update public.boletins o set texto = coalesce(trim(p_texto), ''), chips = coalesce(p_chips, '[]'::jsonb), nota = nullif(trim(p_nota), ''),
      atencao = nullif(trim(p_atencao), ''), fotos = v_fotos, assinaturas = v_assin, atualizado_em = now()
    where o.id = b.id returning * into b;
  end if;
  return jsonb_build_object('id', b.id, 'token', b.token, 'expira_em', b.expira_em, 'enviado_em', b.enviado_em);
end $$;

-- Marca que o link foi aberto no WhatsApp para mandar ao tutor.
create function public.boletim_enviado(p_id uuid) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare v timestamptz;
begin
  update public.boletins b set enviado_em = now()
   where b.id = p_id and b.petshop_id in (select public.meus_petshops())
     and public.tenho_area(b.petshop_id, case when b.agendamento_id is not null then array['agenda'] else array['creche_hotel'] end)
  returning b.enviado_em into v;
  if v is null then raise exception 'Boletim não encontrado.'; end if;
  return v;
end $$;

-- ---------- a página pública ----------
create function public.boletim_do_codigo(p_token text) returns public.boletins
language sql stable security definer set search_path = '' as $$
  select b.* from public.boletins b
   where p_token ~ '^[0-9a-f]{64}$' and b.token = p_token and b.expira_em > now() and public.acesso_liberado(b.petshop_id)
$$;

-- O link do Google para avaliar a loja, se for mesmo do Google (https, até 500 letras); senão, nada.
create function public.google_link_valido(p text) returns text
language sql immutable set search_path = '' as $$
  select case when char_length(p) <= 500 and p ~ '^https://((www\.)?google\.com(\.br)?/(maps|search)|search\.google\.com/local/writereview|maps\.google\.com(\.br)?/|maps\.app\.goo\.gl/|g\.page/|goo\.gl/maps/)[^\s<>"''`]*$'
    then p end
$$;
create function public.loja_google(o jsonb) returns text
language sql stable set search_path = '' as $$
  select public.google_link_valido(case when jsonb_typeof(o -> 'loja.google') = 'string' then o ->> 'loja.google' end)
$$;

-- O link do Google da loja, para o rodapé do link de agendamento (link ativo e conta liberada).
create function public.link_google(p_codigo text) returns text
language sql stable security definer set search_path = '' as $$
  select public.loja_google(p.opcoes) from public.petshops p where p.link_codigo = p_codigo and p.link_ativo and public.acesso_liberado(p.id)
$$;

-- Só o que a página mostra: nada do tutor, nenhum caminho de arquivo. Valor e pagamento só com a opção "boletim.valores", só no
-- banho e tosa e só desta visita: { total, pago, falta }.
create function public.boletim_publico(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b public.boletins; s public.petshops; p public.pets; v_tipo text; v_quando timestamptz; v_servicos jsonb; v_dia int;
  v_valores jsonb; v_recebido numeric; v_dif numeric; v_total numeric; v_conta public.lancamentos;
begin
  b := public.boletim_do_codigo(p_token);
  if b.id is null then return null; end if;
  perform public.boletim_frear(b.id, 'pagina', 60);
  select * into s from public.petshops where id = b.petshop_id;
  select * into p from public.pets where id = b.pet_id;
  if b.agendamento_id is not null then
    v_tipo := 'banho';
    select a.inicio, coalesce((select jsonb_agg(n.nome order by n.o) from (
             select sv.nome, 0 as o from public.servicos sv where sv.id = a.servico_id
             union all
             select sv.nome, 1 + x.ordem from public.agendamento_servicos x join public.servicos sv on sv.id = x.servico_id where x.agendamento_id = a.id
           ) n), '[]'::jsonb)
      into v_quando, v_servicos
      from public.agendamentos a where a.id = b.agendamento_id;
    if s.opcoes -> 'boletim.valores' = 'true'::jsonb then
      -- a conta deste horário (uma só por atendimento): paga, ou a receber com o que já entrou em partes; e as diferenças
      -- recebidas depois. Sem conta fechada, o valor do horário (o pacote cobre o principal).
      select l.* into v_conta from public.lancamentos l where l.agendamento_id = b.agendamento_id and l.tipo = 'entrada' limit 1;
      select coalesce(sum(l.valor), 0) into v_dif from public.lancamentos l
       where l.diferenca_de = b.agendamento_id and l.tipo = 'entrada' and l.pago;
      if v_conta.id is not null and v_conta.pago then
        v_total := coalesce(v_conta.valor_original, v_conta.valor) + v_dif; v_recebido := v_total;
      elsif v_conta.id is not null then
        v_recebido := public.recebido_em_partes(v_conta.id) + v_dif; v_total := v_conta.valor + v_recebido;
      else
        select case when a.pacote_cliente_id is null then coalesce(a.preco, 0) else 0 end
               + coalesce((select sum(x.preco) from public.agendamento_servicos x where x.agendamento_id = a.id), 0)
          into v_total from public.agendamentos a where a.id = b.agendamento_id and a.status not in ('cancelado', 'faltou');
        v_recebido := 0;
      end if;
      if coalesce(v_total, 0) > 0 then
        v_valores := jsonb_build_object('total', round(v_total, 2), 'pago', round(v_recebido, 2), 'falta', round(greatest(v_total - v_recebido, 0), 2));
      end if;
    end if;
  else
    select e.tipo, e.entrada into v_tipo, v_quando from public.estadias e where e.id = b.estadia_id;
    v_dia := case when v_tipo = 'hotel' then ((b.criado_em at time zone coalesce(s.fuso, 'America/Sao_Paulo'))::date
                                            - (v_quando at time zone coalesce(s.fuso, 'America/Sao_Paulo'))::date) + 1 end;
    v_quando := b.criado_em;
    v_servicos := jsonb_build_array(case when v_tipo = 'hotel' then 'Hotel' else 'Creche' end);
  end if;
  return jsonb_build_object(
    'petshop', jsonb_build_object('nome', s.nome, 'logo', s.logo, 'tema', s.tema, 'telefone', s.telefone, 'cidade', s.cidade, 'uf', s.uf,
      'fuso', coalesce(s.fuso, 'America/Sao_Paulo'), 'agendar', case when s.link_ativo then s.link_codigo end, 'google', public.loja_google(s.opcoes)),
    'pet', jsonb_build_object('nome', p.nome, 'sexo', p.sexo, 'especie', p.especie),
    'tipo', v_tipo, 'quando', v_quando, 'dia_hotel', v_dia, 'servicos', coalesce(v_servicos, '[]'::jsonb), 'valores', v_valores,
    'texto', b.texto, 'chips', b.chips, 'atencao', b.atencao, 'fotos', cardinality(b.fotos),
    'criado_em', b.criado_em, 'expira_em', b.expira_em);
end $$;

-- Uma foto (0 a 3) para o servidor da página: o caminho e a assinatura. Código errado, vencido ou número fora: nada.
create function public.boletim_foto(p_token text, p_n int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b public.boletins;
begin
  b := public.boletim_do_codigo(p_token);
  if b.id is null or p_n is null or p_n < 0 or p_n >= cardinality(b.fotos) then return null; end if;
  perform public.boletim_frear(b.id, 'foto', 400);
  return jsonb_build_object('caminho', b.fotos[p_n + 1], 'assinatura', b.assinaturas[p_n + 1]);
end $$;

-- ---------- faxina ----------
-- O arquivo está na fila do pet shop de quem pede (com a área da agenda ou da creche e do hotel) e não está em boletim nenhum?
create function public.boletim_pode_limpar(p_nome text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.boletim_lixo l
                  where l.caminho = p_nome and l.petshop_id = public.diario_pasta(p_nome)
                    and public.tenho_area(l.petshop_id, array['agenda', 'creche_hotel']))
     and not exists (select 1 from public.boletins b where p_nome = any (b.fotos))
$$;
-- O arquivo está em algum boletim? (o bucket pergunta antes de deixar apagar um arquivo que acabou de subir)
create function public.boletim_foto_em_uso(p_nome text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.boletins b where p_nome = any (b.fotos))
$$;

-- A faxina do pet shop: põe na fila as fotos que ficaram sem boletim (mais de um dia), tira da fila o que já sumiu do bucket e
-- devolve {apagar: [caminhos]} para o aparelho apagar pela API do Storage. Boletim com o link vencido fica: as fotos são do álbum.
create function public.boletim_faxina(p_petshop uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_apagar jsonb;
begin
  if not public.tenho_area(p_petshop, array['agenda', 'creche_hotel']) then raise exception 'Sem acesso.'; end if;
  perform pg_advisory_xact_lock(hashtext('boletim_faxina' || p_petshop::text));

  delete from public.albuns a where a.petshop_id = p_petshop and a.expira_em <= now();

  insert into public.boletim_lixo (caminho, petshop_id, motivo)
  select o.name, p_petshop, 'sem_boletim' from storage.objects o
   where o.bucket_id = 'boletim' and left(o.name, 37) = p_petshop::text || '/' and o.created_at < now() - interval '1 day'
     and not exists (select 1 from public.boletins b where o.name = any (b.fotos))
   limit 500
  on conflict (caminho) do nothing;

  delete from public.boletim_lixo l
   where l.petshop_id = p_petshop
     and not exists (select 1 from storage.objects o where o.bucket_id = 'boletim' and o.name = l.caminho);

  with v as (
    update public.boletim_lixo l set tentativas = l.tentativas + 1
     where l.caminho in (select x.caminho from public.boletim_lixo x where x.petshop_id = p_petshop and x.tentativas < 20 order by x.criado_em limit 200)
    returning l.caminho)
  select coalesce(jsonb_agg(v.caminho), '[]'::jsonb) into v_apagar from v;

  return jsonb_build_object('apagar', v_apagar);
end $$;

-- ---------- o álbum do pet ----------
-- Um link do álbum: as fotos dos boletins do pet no momento em que foi criado, cada uma com uma assinatura nova (61 dias).
create table public.albuns (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  pet_id uuid not null,
  token text not null unique check (token ~ '^[0-9a-f]{64}$'),
  -- [{caminho, assinatura, dia, tipo}], do mais novo para o mais velho
  itens jsonb not null default '[]'::jsonb check (jsonb_typeof(itens) = 'array' and jsonb_array_length(itens) <= 200),
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '60 days',
  foreign key (pet_id, petshop_id) references public.pets (id, petshop_id) on delete cascade
);
create index on public.albuns (petshop_id, pet_id);
alter table public.albuns enable row level security;
revoke all on public.albuns from public, anon, authenticated;
grant select (id, petshop_id, pet_id, token, criado_em, expira_em) on public.albuns to authenticated;
create policy albuns_ler on public.albuns for select to authenticated
  using (petshop_id in (select public.meus_petshops()) and public.tenho_area(petshop_id, array['agenda', 'creche_hotel']));

-- Cria o link do álbum. p_fotos: [{caminho, assinatura}] (o aparelho assina; só entram fotos de boletins deste pet). Devolve { token, expira_em }.
create function public.album_criar(p_petshop uuid, p_pet uuid, p_fotos jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_itens jsonb; a public.albuns;
begin
  if not public.tenho_area(p_petshop, array['agenda', 'creche_hotel']) then raise exception 'Sem acesso.'; end if;
  if not public.acesso_liberado(p_petshop) then raise exception 'A conta está só para consulta.'; end if;
  if jsonb_typeof(coalesce(p_fotos, '[]'::jsonb)) <> 'array' or jsonb_array_length(p_fotos) = 0 then raise exception 'O álbum ainda não tem fotos.'; end if;
  if jsonb_array_length(p_fotos) > 200 then raise exception 'Até 200 fotos por álbum.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('caminho', x.caminho, 'assinatura', x.assinatura, 'dia', x.dia, 'tipo', x.tipo) order by x.quando desc, x.caminho), '[]'::jsonb)
    into v_itens
    from (select distinct on (f.caminho) f.caminho, f.assinatura, b.criado_em as quando,
                 (b.criado_em at time zone coalesce(s.fuso, 'America/Sao_Paulo'))::date as dia,
                 case when b.agendamento_id is not null then 'banho' else (select e.tipo from public.estadias e where e.id = b.estadia_id) end as tipo
            from jsonb_to_recordset(p_fotos) as f(caminho text, assinatura text)
            join public.boletins b on f.caminho = any (b.fotos) and b.petshop_id = p_petshop and b.pet_id = p_pet
            join public.petshops s on s.id = b.petshop_id
           where f.assinatura ~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' and char_length(f.assinatura) <= 2000) x;
  if jsonb_array_length(v_itens) = 0 then raise exception 'O álbum ainda não tem fotos.'; end if;
  insert into public.albuns (petshop_id, pet_id, token, itens, criado_por)
  values (p_petshop, p_pet, encode(extensions.gen_random_bytes(32), 'hex'), v_itens, (select auth.uid()))
  returning * into a;
  return jsonb_build_object('token', a.token, 'expira_em', a.expira_em, 'fotos', jsonb_array_length(v_itens));
end $$;

create function public.album_do_codigo(p_token text) returns public.albuns
language sql stable security definer set search_path = '' as $$
  select a.* from public.albuns a
   where p_token ~ '^[0-9a-f]{64}$' and a.token = p_token and a.expira_em > now() and public.acesso_liberado(a.petshop_id)
$$;

-- A página pública do álbum: o pet shop, o pet e as fotos (só o dia e o tipo da visita; nenhum caminho).
create function public.album_publico(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a public.albuns; s public.petshops; p public.pets;
begin
  a := public.album_do_codigo(p_token);
  if a.id is null then return null; end if;
  perform public.boletim_frear_album(a.id, 'pagina', 60);
  select * into s from public.petshops where id = a.petshop_id;
  select * into p from public.pets where id = a.pet_id;
  return jsonb_build_object(
    'petshop', jsonb_build_object('nome', s.nome, 'logo', s.logo, 'tema', s.tema, 'telefone', s.telefone, 'cidade', s.cidade, 'uf', s.uf,
      'fuso', coalesce(s.fuso, 'America/Sao_Paulo'), 'agendar', case when s.link_ativo then s.link_codigo end, 'google', public.loja_google(s.opcoes)),
    'pet', jsonb_build_object('nome', p.nome, 'sexo', p.sexo, 'especie', p.especie),
    'fotos', coalesce((select jsonb_agg(jsonb_build_object('dia', i ->> 'dia', 'tipo', i ->> 'tipo') order by n) from jsonb_array_elements(a.itens) with ordinality as t(i, n)), '[]'::jsonb),
    'criado_em', a.criado_em, 'expira_em', a.expira_em);
end $$;

create function public.album_foto(p_token text, p_n int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a public.albuns;
begin
  a := public.album_do_codigo(p_token);
  if a.id is null or p_n is null or p_n < 0 or p_n >= jsonb_array_length(a.itens) then return null; end if;
  perform public.boletim_frear_album(a.id, 'foto', 600);
  return jsonb_build_object('caminho', a.itens -> p_n ->> 'caminho', 'assinatura', a.itens -> p_n ->> 'assinatura');
end $$;

-- O freio do álbum (a mesma conta do boletim, numa tabela própria).
create table public.album_acessos (
  album_id uuid not null references public.albuns (id) on delete cascade,
  tipo text not null,
  minuto timestamptz not null,
  n int not null default 0,
  primary key (album_id, tipo, minuto)
);
alter table public.album_acessos enable row level security;
revoke all on public.album_acessos from public, anon, authenticated;
create function public.boletim_frear_album(p_album uuid, p_tipo text, p_limite int) returns void
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  insert into public.album_acessos as a (album_id, tipo, minuto, n) values (p_album, p_tipo, date_trunc('minute', now()), 1)
  on conflict (album_id, tipo, minuto) do update set n = a.n + 1
  returning a.n into v_n;
  if v_n = 1 then delete from public.album_acessos a where a.album_id = p_album and a.minuto < now() - interval '10 minutes'; end if;
  if v_n > p_limite then
    raise exception 'Muitos acessos a este álbum agora. Espere um minuto e abra de novo.' using errcode = 'PT429';
  end if;
end $$;

-- O dono apaga uma foto: sai do boletim (e da página dele), de todos os álbuns e vai para a fila de apagar o arquivo.
create function public.boletim_apagar_foto(p_boletim uuid, p_caminho text) returns text
language plpgsql security definer set search_path = '' as $$
declare b public.boletins; i int;
begin
  select * into b from public.boletins x where x.id = p_boletim for update;
  if b.id is null or not public.sou_dono(b.petshop_id) then raise exception 'Só o dono apaga fotos do álbum.'; end if;
  i := array_position(b.fotos, p_caminho);
  if i is null then raise exception 'Foto não encontrada.'; end if;
  update public.boletins x set fotos = b.fotos[:i - 1] || b.fotos[i + 1:], assinaturas = b.assinaturas[:i - 1] || b.assinaturas[i + 1:], atualizado_em = now()
   where x.id = b.id;
  update public.albuns a set itens = coalesce((select jsonb_agg(e order by n) from jsonb_array_elements(a.itens) with ordinality as t(e, n) where e ->> 'caminho' <> p_caminho), '[]'::jsonb)
   where a.petshop_id = b.petshop_id and a.itens @> jsonb_build_array(jsonb_build_object('caminho', p_caminho));
  insert into public.boletim_lixo (caminho, petshop_id, motivo) values (p_caminho, b.petshop_id, 'dono') on conflict (caminho) do nothing;
  return p_caminho;
end $$;

-- Para rodar agendado (pg_cron ou o painel), sem login: apaga os links de álbum vencidos e o freio antigo. Devolve quantos álbuns saíram.
create function public.boletim_faxina_geral() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  delete from public.albuns a where a.expira_em <= now();
  get diagnostics n = row_count;
  delete from public.boletim_acessos a where a.minuto < now() - interval '10 minutes';
  delete from public.album_acessos a where a.minuto < now() - interval '10 minutes';
  return n;
end $$;

revoke execute on function public.boletim_para_lixo(), public.boletim_frear(uuid, text, int), public.boletim_ia_contar(uuid),
  public.boletim_salvar(uuid, uuid, uuid, uuid, uuid, text, jsonb, text, text, jsonb), public.boletim_enviado(uuid),
  public.boletim_do_codigo(text), public.boletim_publico(text), public.boletim_foto(text, int), public.boletim_pode_limpar(text),
  public.boletim_foto_em_uso(text), public.boletim_faxina(uuid), public.boletim_faxina_geral(), public.google_link_valido(text),
  public.loja_google(jsonb), public.link_google(text), public.album_criar(uuid, uuid, jsonb), public.album_do_codigo(text),
  public.album_publico(text), public.album_foto(text, int), public.boletim_frear_album(uuid, text, int), public.boletim_apagar_foto(uuid, text)
  from public, anon, authenticated;
grant execute on function public.boletim_ia_contar(uuid), public.boletim_salvar(uuid, uuid, uuid, uuid, uuid, text, jsonb, text, text, jsonb),
  public.boletim_enviado(uuid), public.boletim_faxina(uuid), public.album_criar(uuid, uuid, jsonb), public.boletim_apagar_foto(uuid, text),
  public.google_link_valido(text) to authenticated;
-- o bucket confere com o papel de quem pede
grant execute on function public.boletim_pode_limpar(text), public.boletim_foto_em_uso(text) to authenticated;
-- os servidores das páginas públicas (boletim, álbum, link de agendamento) só têm a chave pública (anon)
grant execute on function public.boletim_publico(text), public.boletim_foto(text, int), public.album_publico(text), public.album_foto(text, int),
  public.link_google(text) to anon, authenticated;

-- ---------- o bucket privado ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('boletim', 'boletim', false, 1572864, array['image/jpeg'])
  on conflict (id) do nothing;

-- a equipe da agenda ou da creche e do hotel vê as fotos do pet shop (para assinar e para a prévia)
create policy boletim_equipe_ler on storage.objects for select to authenticated
  using (bucket_id = 'boletim' and public.diario_pasta(name) in (select public.meus_petshops())
    and public.tenho_area(public.diario_pasta(name), array['agenda', 'creche_hotel']));
-- e manda foto, com a conta liberada, só em <petshop>/<aleatório>.jpg
create policy boletim_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'boletim' and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
    and public.diario_pasta(name) in (select public.meus_petshops())
    and public.tenho_area(public.diario_pasta(name), array['agenda', 'creche_hotel'])
    and public.acesso_liberado(public.diario_pasta(name)));
-- apagar: o que está na fila, ou a foto que a própria pessoa subiu e ainda não entrou em boletim nenhum
create policy boletim_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'boletim' and (public.boletim_pode_limpar(name)
    or (owner_id = (select auth.uid())::text and public.diario_pasta(name) in (select public.meus_petshops()) and not public.boletim_foto_em_uso(name))));

notify pgrst, 'reload schema';
