-- LGPD: baixar os dados, dados de um tutor, apagar os dados de um tutor, encerrar e apagar a conta, sair da equipe e a cópia
-- completa do administrador.
--
-- Só acrescenta: três tabelas novas (lgpd_registros, exclusoes_conta, arquivos_lixo) e funções novas. Nenhuma coluna nova em
-- tabela antiga (petshops, pets, clientes… com permissão por coluna ficam como estão). Duas funções antigas mudam por dentro:
--   * acesso_liberado(p): com a conta marcada para ser apagada, o pet shop fica só para consulta (as regras e funções que já
--     chamam acesso_liberado passam a recusar gravação, e o link do cliente para de receber pedidos). O resto é igual.
--   * travar_caixa_fechado(): igual, mas aceita tirar o cliente (cliente_id) de um lançamento de caixa fechado quando quem pede
--     é cliente_anonimizar (marca maestro.lgpd na transação). Valor, forma, data e o resto continuam travados.
--
-- 1. Registro (lgpd_registros): cada pedido ligado à LGPD fica anotado com quem, quando e quantidades (nunca nome de cliente):
--    baixou os dados da loja, baixou os dados de um tutor, apagou os dados de um tutor, pediu e cancelou a exclusão da conta,
--    saiu da equipe, conta apagada e cópia completa do administrador. Ninguém lê nem grava direto.
-- 2. Dados de um tutor: cliente_dados (só dono) devolve tudo do tutor em planilhas prontas; cliente_anonimizar (só dono, com o
--    nome do tutor digitado) troca o nome por "Cliente removido", limpa telefone, e-mail, endereço e observações, deixa os pets
--    como "Pet removido" (sem foto, saúde, contatos, boletins, álbuns e autorizações), tira o nome dos textos e desliga o tutor
--    dos lançamentos. Os valores dos lançamentos não mudam: o financeiro e os relatórios fecham igual.
-- 3. Encerrar e apagar a conta: conta_exclusao_pedir (só o titular, com o nome do pet shop digitado) marca para apagar em 30
--    dias; até lá a conta fica só para consulta e qualquer dono cancela (conta_exclusao_cancelar). Passado o prazo, a faxina
--    (rota /api/gestao/faxina, chave de serviço) chama gestao_exclusoes_processar: põe os arquivos do pet shop na fila
--    (arquivos_lixo), apaga o pet shop (cascata) e devolve os logins do Maestro que ficaram sem pet shop, para a rota apagar.
-- 4. equipe_sair: quem é da equipe (menos o titular) sai do pet shop (como "Tirar acesso", feito pela própria pessoa).
-- 5. Cópia completa: gestao_copia_tabelas (só chave de serviço) lista as tabelas do public com as colunas que podem sair
--    (sem códigos de acesso, assinaturas de link e segredos); gestao_copia_registrar anota a cópia; admin_copias e
--    admin_exclusoes alimentam o painel (só admin).

-- ---------- tabelas ----------
create table public.lgpd_registros (
  id bigint generated always as identity primary key,
  -- sem chave estrangeira: o registro fica depois que o pet shop é apagado
  petshop_id uuid,
  quem uuid,
  quem_nome text check (char_length(quem_nome) <= 120),
  acao text not null check (acao in ('baixou_dados', 'baixou_tutor', 'apagou_tutor', 'pediu_exclusao', 'cancelou_exclusao',
                                     'saiu_da_equipe', 'conta_apagada', 'copia_completa')),
  detalhe jsonb not null default '{}'::jsonb check (jsonb_typeof(detalhe) = 'object'),
  quando timestamptz not null default now()
);
create index lgpd_registros_loja on public.lgpd_registros (petshop_id, quando desc);
create index lgpd_registros_acao on public.lgpd_registros (acao, quando desc);
alter table public.lgpd_registros enable row level security;
revoke all on public.lgpd_registros from public, anon, authenticated;

create table public.exclusoes_conta (
  id bigint generated always as identity primary key,
  petshop_id uuid not null,
  petshop_nome text not null,
  pedido_por uuid,
  pedido_nome text,
  pedido_email text,
  pedido_em timestamptz not null default now(),
  apagar_em timestamptz not null,
  cancelado_em timestamptz,
  cancelado_por uuid,
  apagado_em timestamptz,
  usuarios int,
  check (cancelado_em is null or apagado_em is null)
);
create unique index exclusoes_conta_ativa on public.exclusoes_conta (petshop_id) where cancelado_em is null and apagado_em is null;
create index exclusoes_conta_prazo on public.exclusoes_conta (apagar_em) where cancelado_em is null and apagado_em is null;
alter table public.exclusoes_conta enable row level security;
revoke all on public.exclusoes_conta from public, anon, authenticated;

-- fila de arquivos do Storage para apagar (fotos de tutor apagado, arquivos de conta apagada). A faxina apaga pela API.
create table public.arquivos_lixo (
  bucket text not null check (bucket in ('pets', 'diario', 'boletim', 'caderno-tmp')),
  caminho text not null check (char_length(caminho) between 3 and 400),
  petshop_id uuid,
  motivo text not null check (motivo in ('tutor_apagado', 'conta_apagada')),
  criado_em timestamptz not null default now(),
  tentativas int not null default 0,
  primary key (bucket, caminho)
);
create index arquivos_lixo_loja on public.arquivos_lixo (petshop_id, criado_em);
alter table public.arquivos_lixo enable row level security;
revoke all on public.arquivos_lixo from public, anon, authenticated;

-- ---------- ajudantes ----------
-- "Ana Souza" = " ana  souza " = "Âna Souza": para conferir o nome digitado
create function public.lgpd_texto_igual(a text, b text) returns boolean
language sql immutable set search_path = '' as $$
  select a is not null and b is not null and btrim(a) <> '' and
    lower(translate(regexp_replace(btrim(a), '\s+', ' ', 'g'), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))
    = lower(translate(regexp_replace(btrim(b), '\s+', ' ', 'g'), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))
$$;

-- troca cada nome (palavra inteira, sem diferença de maiúscula) por `p_por`
create function public.lgpd_trocar_nomes(p_texto text, p_nomes text[], p_por text) returns text
language plpgsql immutable set search_path = '' as $$
declare v text := p_texto; n text;
begin
  if v is null then return null; end if;
  foreach n in array coalesce(p_nomes, '{}') loop
    n := btrim(coalesce(n, ''));
    if char_length(n) >= 2 then
      v := regexp_replace(v, '\m' || regexp_replace(n, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g') || '\M', p_por, 'gi');
    end if;
  end loop;
  return v;
end $$;

create function public.lgpd_anotar(p_petshop uuid, p_acao text, p_detalhe jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.lgpd_registros (petshop_id, quem, quem_nome, acao, detalhe)
  values (p_petshop, (select auth.uid()),
          coalesce((select x.nome from public.profissionais x where x.petshop_id = p_petshop and x.user_id = (select auth.uid()) limit 1),
                   (select u.email from auth.users u where u.id = (select auth.uid()))),
          p_acao, coalesce(p_detalhe, '{}'::jsonb))
$$;

-- o titular: o primeiro dono do pet shop (o mesmo de proteger_titular)
create function public.lgpd_sou_titular(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profissionais x
     where x.id = (select t.id from public.profissionais t where t.petshop_id = p and t.papel = 'dono' order by t.criado_em, t.id limit 1)
       and x.user_id = (select auth.uid()) and x.ativo)
$$;

-- ---------- só para consulta enquanto a conta espera para ser apagada ----------
create or replace function public.acesso_liberado(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.petshops
    where id = p and (
      status in ('ativa', 'atrasada', 'cortesia')
      or (status = 'teste' and (teste_ate > now() or not exists (select 1 from public.config_interna where chave = 'assinatura_aberta')))
      or (status = 'cancelada' and pago_ate > now())
    )
  ) and not exists (
    select 1 from public.exclusoes_conta x where x.petshop_id = p and x.cancelado_em is null and x.apagado_em is null
  )
$$;

-- igual à de antes; só aceita tirar o cliente de lançamento de caixa fechado quando é cliente_anonimizar (maestro.lgpd)
create or replace function public.travar_caixa_fechado() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_direto boolean := pg_trigger_depth() = 1;
  v_lgpd boolean := coalesce(current_setting('maestro.lgpd', true), '') = '1';
begin
  if tg_op = 'INSERT' then
    if new.caixa_id is not null then
      perform 1 from public.caixas c where c.id = new.caixa_id for share;
      if exists (select 1 from public.caixas c where c.id = new.caixa_id and c.fechado_em is not null) then
        raise exception 'Este caixa já foi fechado. Abra um caixa novo para lançar.';
      end if;
    end if;
    -- quem lançou é sempre quem está logado
    if (select auth.uid()) is not null then new.criado_por := (select auth.uid()); end if;
    return new;
  end if;
  if old.caixa_id is not null and exists (select 1 from public.caixas c where c.id = old.caixa_id and c.fechado_em is not null) then
    if tg_op = 'DELETE' then
      if not exists (select 1 from public.petshops p where p.id = old.petshop_id) then return old; end if;
      raise exception 'Este lançamento é de um caixa já fechado e não pode ser apagado. Se precisar corrigir, lance um ajuste.';
    end if;
    if new.valor is distinct from old.valor or new.tipo is distinct from old.tipo or new.forma is distinct from old.forma
       or new.data is distinct from old.data or new.pago is distinct from old.pago or new.caixa_id is distinct from old.caixa_id
       or new.pagamentos is distinct from old.pagamentos or new.movimento is distinct from old.movimento
       or new.categoria is distinct from old.categoria or new.itens is distinct from old.itens
       or (v_direto and new.agendamento_id is distinct from old.agendamento_id)
       or (v_direto and new.cliente_id is distinct from old.cliente_id and not (v_lgpd and new.cliente_id is null)) then
      raise exception 'Este lançamento é de um caixa já fechado e não pode ser alterado. Se precisar corrigir, lance um ajuste.';
    end if;
  elsif tg_op = 'UPDATE' and new.caixa_id is distinct from old.caixa_id and new.caixa_id is not null then
    perform 1 from public.caixas c where c.id = new.caixa_id for share;
    if exists (select 1 from public.caixas c where c.id = new.caixa_id and c.fechado_em is not null) then
      raise exception 'Este caixa já foi fechado. Abra um caixa novo para lançar.';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

-- ---------- 1. baixar os dados da loja (a cópia é montada no aparelho do dono; aqui só o registro) ----------
create function public.lgpd_registrar_copia(p_petshop uuid, p_linhas int default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.sou_dono(p_petshop) then raise exception 'Só o dono do pet shop baixa todos os dados.'; end if;
  perform public.lgpd_anotar(p_petshop, 'baixou_dados', case when p_linhas is null then '{}'::jsonb else jsonb_build_object('linhas', greatest(p_linhas, 0)) end);
end $$;

create function public.lgpd_registros_ver(p_petshop uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.sou_dono(p_petshop) then raise exception 'Só o dono do pet shop vê este registro.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('acao', r.acao, 'quem', r.quem_nome, 'quando', r.quando, 'detalhe', r.detalhe) order by r.quando desc)
                     from (select * from public.lgpd_registros where petshop_id = p_petshop order by quando desc limit 30) r), '[]'::jsonb);
end $$;

-- ---------- 2. dados de um tutor ----------
create function public.lgpd_dinheiro(n numeric) returns numeric language sql immutable set search_path = '' as $$ select round(n, 2) $$;

create function public.cliente_dados(p_cliente uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.clientes;
  v_fuso text;
  v_pets uuid[];
  v_fone text;
  v_arquivos jsonb := '[]'::jsonb;
begin
  select * into c from public.clientes where id = p_cliente;
  if not found or not public.sou_dono(c.petshop_id) then raise exception 'Cliente não encontrado.'; end if;
  select s.fuso into v_fuso from public.petshops s where s.id = c.petshop_id;
  select coalesce(array_agg(p.id), '{}') into v_pets from public.pets p where p.cliente_id = c.id and p.petshop_id = c.petshop_id;
  v_fone := nullif(regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g'), '');

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'cadastro.csv', 'explica', 'O cadastro do tutor: nome, telefone, e-mail, endereço e observações.',
    'colunas', jsonb_build_array('Nome', 'Telefone', 'E-mail', 'Endereço', 'Observações', 'Cliente desde'),
    'linhas', jsonb_build_array(jsonb_build_array(c.nome, c.telefone, c.email, c.endereco, c.obs, to_char(c.criado_em at time zone v_fuso, 'DD/MM/YYYY')))));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'pets.csv', 'explica', 'Os pets do tutor.',
    'colunas', jsonb_build_array('Pet', 'Espécie', 'Raça', 'Porte', 'Sexo', 'Nascimento', 'Alertas', 'Observações', 'Ativo', 'Adicionado em'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(p.nome, p.especie, p.raca, p.porte, p.sexo, to_char(p.nascimento, 'DD/MM/YYYY'), p.alertas, p.obs,
                 case when p.ativo then 'Sim' else 'Não' end, to_char(p.criado_em at time zone v_fuso, 'DD/MM/YYYY')) order by p.nome)
               from public.pets p where p.id = any (v_pets)), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'saude.csv', 'explica', 'Vacinas, vermífugos, antipulgas e outros cuidados anotados na ficha dos pets.',
    'colunas', jsonb_build_array('Pet', 'Tipo', 'Nome', 'Aplicado em', 'Vence em', 'Observações'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(p.nome, s.tipo, s.nome, to_char(s.aplicado_em, 'DD/MM/YYYY'), to_char(s.vence_em, 'DD/MM/YYYY'), s.obs) order by s.criado_em)
               from public.pets_saude s join public.pets p on p.id = s.pet_id where s.pet_id = any (v_pets)), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'contatos.csv', 'explica', 'Outras pessoas anotadas para buscar ou para chamar em uma emergência.',
    'colunas', jsonb_build_array('Pet', 'Nome', 'Telefone', 'Relação', 'Observações'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(p.nome, k.nome, k.telefone, k.relacao, k.obs) order by k.criado_em)
               from public.pets_contatos k left join public.pets p on p.id = k.pet_id
              where k.petshop_id = c.petshop_id and (k.cliente_id = c.id or k.pet_id = any (v_pets))), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'agendamentos.csv', 'explica', 'Os horários de banho, tosa e outros serviços, com a situação e o preço.',
    'colunas', jsonb_build_array('Dia', 'Hora', 'Pet', 'Serviço', 'Situação', 'Preço', 'Leva e traz', 'Endereço do leva e traz', 'Observações'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(to_char(a.inicio at time zone v_fuso, 'DD/MM/YYYY'), to_char(a.inicio at time zone v_fuso, 'HH24:MI'),
                 p.nome, v.nome, a.status, public.lgpd_dinheiro(a.preco), case when a.leva_traz then 'Sim' else 'Não' end, a.endereco_leva_traz, a.obs) order by a.inicio)
               from public.agendamentos a join public.pets p on p.id = a.pet_id left join public.servicos v on v.id = a.servico_id
              where a.pet_id = any (v_pets)), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'estadias.csv', 'explica', 'As estadias de creche e hotel.',
    'colunas', jsonb_build_array('Tipo', 'Pet', 'Entrada', 'Saída prevista', 'Saída', 'Situação', 'Diária', 'Valor cobrado', 'Observações'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(e.tipo, p.nome, to_char(e.entrada at time zone v_fuso, 'DD/MM/YYYY HH24:MI'),
                 to_char(e.saida_prevista at time zone v_fuso, 'DD/MM/YYYY HH24:MI'), to_char(e.saida at time zone v_fuso, 'DD/MM/YYYY HH24:MI'), e.status,
                 public.lgpd_dinheiro(e.valor_diaria), public.lgpd_dinheiro(e.valor_cobrado), e.obs) order by e.entrada)
               from public.estadias e join public.pets p on p.id = e.pet_id where e.pet_id = any (v_pets)), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'pacotes.csv', 'explica', 'Os pacotes comprados, com quanto já foi usado.',
    'colunas', jsonb_build_array('Pacote', 'Pet', 'Total', 'Usados', 'Preço', 'Comprado em', 'Vence em'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(k.nome, p.nome, k.total, k.usados, public.lgpd_dinheiro(k.preco), to_char(k.comprado_em, 'DD/MM/YYYY'),
                 to_char(k.vence_em, 'DD/MM/YYYY')) order by k.comprado_em)
               from public.pacotes_clientes k join public.pets p on p.id = k.pet_id where k.pet_id = any (v_pets)), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'mensalidades.csv', 'explica', 'As mensalidades da creche.',
    'colunas', jsonb_build_array('Mês', 'Pet', 'Total', 'Vencimento', 'Situação'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(to_char(m.mes, 'MM/YYYY'), p.nome, public.lgpd_dinheiro(m.total), to_char(m.vencimento, 'DD/MM/YYYY'), m.status) order by m.mes)
               from public.creche_cobrancas m join public.pets p on p.id = m.pet_id where m.pet_id = any (v_pets)), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'financeiro.csv', 'explica', 'O que o tutor pagou e o que ficou a receber. Saídas (devoluções) com valor negativo.',
    'colunas', jsonb_build_array('Data', 'Tipo', 'Categoria', 'Descrição', 'Valor', 'Pago', 'Vencimento'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(to_char(l.data, 'DD/MM/YYYY'), l.tipo, l.categoria, l.descricao,
                 public.lgpd_dinheiro(case when l.tipo = 'saida' then -l.valor else l.valor end), case when l.pago then 'Sim' else 'Não' end,
                 to_char(l.vencimento, 'DD/MM/YYYY')) order by l.data, l.criado_em)
               from public.lancamentos l where l.petshop_id = c.petshop_id and l.cliente_id = c.id and l.movimento is null), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'credito.csv', 'explica', 'Os movimentos do crédito do tutor (o que ficou guardado e o que foi usado).',
    'colunas', jsonb_build_array('Quando', 'Valor', 'Motivo'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(to_char(k.criado_em at time zone v_fuso, 'DD/MM/YYYY HH24:MI'), public.lgpd_dinheiro(k.valor), k.motivo) order by k.criado_em)
               from public.clientes_creditos k where k.petshop_id = c.petshop_id and k.cliente_id = c.id), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'boletins.csv', 'explica', 'Os boletins mandados ao tutor (só as informações; as fotos ficam no aplicativo).',
    'colunas', jsonb_build_array('Pet', 'Feito em', 'Mandado em', 'Fotos', 'Página no ar até', 'Recado'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(p.nome, to_char(b.criado_em at time zone v_fuso, 'DD/MM/YYYY HH24:MI'),
                 to_char(b.enviado_em at time zone v_fuso, 'DD/MM/YYYY HH24:MI'), coalesce(cardinality(b.fotos), 0),
                 to_char(b.expira_em at time zone v_fuso, 'DD/MM/YYYY'), b.texto) order by b.criado_em)
               from public.boletins b join public.pets p on p.id = b.pet_id where b.pet_id = any (v_pets)), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'autorizacoes-de-fotos.csv', 'explica', 'As autorizações para postar as fotos dos pets nas redes do pet shop, com o texto que o tutor aceitou e quando tirou.',
    'colunas', jsonb_build_array('Pet', 'Autorizado em', 'Quais fotos', 'Perfil para marcar', 'Texto aceito', 'Tirada em'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(p.nome, to_char(f.autorizado_em at time zone v_fuso, 'DD/MM/YYYY HH24:MI'),
                 case f.escopo when 'boletim' then 'Só as daquele boletim' else 'Daquele boletim e das próximas visitas' end, f.marcar, f.texto,
                 to_char(f.retirado_em at time zone v_fuso, 'DD/MM/YYYY HH24:MI')) order by f.autorizado_em)
               from public.fotos_autorizacoes f join public.pets p on p.id = f.pet_id where f.pet_id = any (v_pets)), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'pedidos-pelo-link.csv', 'explica', 'Os pedidos feitos pelo link de agendamento com o mesmo telefone do tutor.',
    'colunas', jsonb_build_array('Pedido em', 'Nome', 'Pet', 'Para', 'Para quando', 'Situação', 'Aceitou as regras em'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(to_char(d.criado_em at time zone v_fuso, 'DD/MM/YYYY HH24:MI'), d.tutor_nome, d.pet_nome, d.tipo,
                 to_char(d.inicio at time zone v_fuso, 'DD/MM/YYYY HH24:MI'), d.status, to_char(d.termos_aceitos_em at time zone v_fuso, 'DD/MM/YYYY HH24:MI')) order by d.criado_em)
               from public.pedidos_agendamento d
              where v_fone is not null and d.petshop_id = c.petshop_id and regexp_replace(d.telefone, '\D', '', 'g') = v_fone), '[]'::jsonb)));

  perform public.lgpd_anotar(c.petshop_id, 'baixou_tutor', jsonb_build_object('cliente_id', c.id));
  return jsonb_build_object('cliente', c.nome, 'petshop', (select s.nome from public.petshops s where s.id = c.petshop_id),
                            'gerado_em', now(), 'arquivos', v_arquivos);
end $$;

create function public.cliente_anonimizar(p_cliente uuid, p_confirmacao text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.clientes;
  v_uid uuid := (select auth.uid());
  v_claims text := current_setting('request.jwt.claims', true);
  v_sub text := current_setting('request.jwt.claim.sub', true);
  v_pets uuid[];
  v_nomes text[];
  v_fone text;
  v_lancs uuid[];
  v_n_lanc int;
  v_arquivos int := 0;
  v_n int;
begin
  select * into c from public.clientes where id = p_cliente for update;
  if not found or not public.sou_dono(c.petshop_id) then raise exception 'Cliente não encontrado.'; end if;
  if exists (select 1 from public.lgpd_registros r where r.petshop_id = c.petshop_id and r.acao = 'apagou_tutor' and r.detalhe ->> 'cliente_id' = c.id::text) then
    return jsonb_build_object('ok', true, 'ja', true);
  end if;
  if not public.lgpd_texto_igual(p_confirmacao, c.nome) then
    raise exception 'Digite o nome do tutor igual ao da ficha para confirmar.';
  end if;

  select coalesce(array_agg(p.id), '{}'), coalesce(array_agg(p.nome), '{}') into v_pets, v_nomes
    from public.pets p where p.cliente_id = c.id and p.petshop_id = c.petshop_id;
  v_fone := nullif(regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g'), '');

  -- daqui para baixo é o banco quem mexe (as conferências de "quem pode" dos gatilhos já foram feitas acima):
  -- sem login na transação, os gatilhos não anotam "alterado depois de recebido" nem guardam o texto antigo com o nome.
  perform set_config('maestro.lgpd', '1', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);

  -- dinheiro: o valor fica; o nome sai do texto e o lançamento deixa de apontar para o tutor
  select coalesce(array_agg(l.id), '{}') into v_lancs from public.lancamentos l
   where l.petshop_id = c.petshop_id
     and (l.cliente_id = c.id
          or l.agendamento_id in (select a.id from public.agendamentos a where a.pet_id = any (v_pets))
          or l.id in (select m.lancamento_id from public.creche_cobrancas m where m.pet_id = any (v_pets) and m.lancamento_id is not null));
  update public.lancamentos l
     set cliente_id = case when l.cliente_id = c.id then null else l.cliente_id end,
         descricao = public.lgpd_trocar_nomes(public.lgpd_trocar_nomes(l.descricao, array[c.nome], 'Cliente removido'), v_nomes, 'Pet removido')
   where l.id = any (v_lancs);
  get diagnostics v_n_lanc = row_count;
  update public.lancamentos_alteracoes a
     set antes = case when a.antes ? 'descricao' and jsonb_typeof(a.antes -> 'descricao') = 'string'
                   then jsonb_set(a.antes, '{descricao}', to_jsonb(public.lgpd_trocar_nomes(public.lgpd_trocar_nomes(a.antes ->> 'descricao', array[c.nome], 'Cliente removido'), v_nomes, 'Pet removido')))
                   else a.antes end,
         depois = case when a.depois ? 'descricao' and jsonb_typeof(a.depois -> 'descricao') = 'string'
                   then jsonb_set(a.depois, '{descricao}', to_jsonb(public.lgpd_trocar_nomes(public.lgpd_trocar_nomes(a.depois ->> 'descricao', array[c.nome], 'Cliente removido'), v_nomes, 'Pet removido')))
                   else a.depois end
   where a.petshop_id = c.petshop_id and a.lancamento_id = any (v_lancs);
  update public.clientes_creditos k set motivo = public.lgpd_trocar_nomes(public.lgpd_trocar_nomes(k.motivo, array[c.nome], 'Cliente removido'), v_nomes, 'Pet removido')
   where k.petshop_id = c.petshop_id and k.cliente_id = c.id;
  update public.precos_alterados x set item = public.lgpd_trocar_nomes(x.item, v_nomes, 'Pet removido')
   where x.petshop_id = c.petshop_id and x.lancamento_id = any (v_lancs);

  -- arquivos: foto do pet, antes e depois, fotos do diário e do boletim vão para a fila da faxina
  insert into public.arquivos_lixo (bucket, caminho, petshop_id, motivo)
  select 'pets', x.caminho, c.petshop_id, 'tutor_apagado' from (
    select p.foto as caminho from public.pets p where p.id = any (v_pets) and p.foto is not null
    union select a.foto_antes from public.agendamentos a where a.pet_id = any (v_pets) and a.foto_antes is not null
    union select a.foto_depois from public.agendamentos a where a.pet_id = any (v_pets) and a.foto_depois is not null) x
  where x.caminho like c.petshop_id::text || '/%'
  on conflict do nothing;
  get diagnostics v_n = row_count; v_arquivos := v_arquivos + v_n;
  insert into public.arquivos_lixo (bucket, caminho, petshop_id, motivo)
  select 'diario', f.caminho, c.petshop_id, 'tutor_apagado' from public.diario_fotos f where f.pet_id = any (v_pets)
  on conflict do nothing;
  get diagnostics v_n = row_count; v_arquivos := v_arquivos + v_n;
  insert into public.arquivos_lixo (bucket, caminho, petshop_id, motivo)
  select 'boletim', u.caminho, c.petshop_id, 'tutor_apagado' from public.boletins b cross join lateral unnest(b.fotos) as u(caminho)
   where b.pet_id = any (v_pets)
  on conflict do nothing;
  get diagnostics v_n = row_count; v_arquivos := v_arquivos + v_n;

  delete from public.fotos_autorizacoes where pet_id = any (v_pets);
  delete from public.albuns where pet_id = any (v_pets);
  delete from public.boletins where pet_id = any (v_pets);
  delete from public.diario_fotos where pet_id = any (v_pets);
  delete from public.pets_saude where pet_id = any (v_pets);
  delete from public.pets_contatos where petshop_id = c.petshop_id and (cliente_id = c.id or pet_id = any (v_pets));
  delete from public.estadias_retiradas where estadia_id in (select e.id from public.estadias e where e.pet_id = any (v_pets));
  delete from public.estadias_cuidados where estadia_id in (select e.id from public.estadias e where e.pet_id = any (v_pets));
  update public.estadias_diario d set nota = null where d.estadia_id in (select e.id from public.estadias e where e.pet_id = any (v_pets));
  update public.estadias_ocorrencias o set texto = '(texto apagado a pedido do tutor)' where o.pet_id = any (v_pets);
  update public.estadias e set obs = null where e.pet_id = any (v_pets) and e.obs is not null;
  update public.agendamentos a set obs = null, endereco_leva_traz = null, foto_antes = null, foto_depois = null
   where a.pet_id = any (v_pets) and (a.obs is not null or a.endereco_leva_traz is not null or a.foto_antes is not null or a.foto_depois is not null);
  update public.creche_planos k set obs = null where k.pet_id = any (v_pets) and k.obs is not null;
  update public.creche_cobrancas k set obs = null where k.pet_id = any (v_pets) and k.obs is not null;
  delete from public.tutor_links where cliente_id = c.id;
  delete from public.tutor_acessos where cliente_id = c.id;
  update public.lista_espera w set pet_nome = 'Pet removido', tutor_nome = 'Cliente removido', telefone = null, obs = null
   where w.petshop_id = c.petshop_id and (w.pet_id = any (v_pets) or (v_fone is not null and regexp_replace(coalesce(w.telefone, ''), '\D', '', 'g') = v_fone));
  delete from public.pedidos_agendamento d
   where d.petshop_id = c.petshop_id and v_fone is not null and regexp_replace(d.telefone, '\D', '', 'g') = v_fone;

  update public.pets p set nome = 'Pet removido', raca = null, nascimento = null, alertas = null, obs = null, foto = null, ativo = false
   where p.id = any (v_pets);
  update public.clientes set nome = 'Cliente removido', telefone = null, email = null, endereco = null, obs = null where id = c.id;

  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  perform set_config('maestro.lgpd', '', true);

  insert into public.lgpd_registros (petshop_id, quem, quem_nome, acao, detalhe)
  values (c.petshop_id, v_uid, (select x.nome from public.profissionais x where x.petshop_id = c.petshop_id and x.user_id = v_uid limit 1), 'apagou_tutor',
          jsonb_build_object('cliente_id', c.id, 'pets', cardinality(v_pets), 'lancamentos', v_n_lanc, 'arquivos', v_arquivos));
  return jsonb_build_object('ok', true, 'pets', cardinality(v_pets), 'lancamentos', v_n_lanc, 'arquivos', v_arquivos);
end $$;

-- ---------- 3. encerrar e apagar a conta ----------
create function public.conta_exclusao_ver(p_petshop uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('pedido_em', x.pedido_em, 'apagar_em', x.apagar_em, 'pedido_nome', x.pedido_nome)
    from public.exclusoes_conta x
   where x.petshop_id = p_petshop and x.cancelado_em is null and x.apagado_em is null
     and p_petshop in (select public.meus_petshops())
$$;

create function public.conta_exclusao_pedir(p_petshop uuid, p_nome text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_loja public.petshops; v_x public.exclusoes_conta;
begin
  select * into v_loja from public.petshops where id = p_petshop for update;
  if not found or not public.sou_dono(p_petshop) then raise exception 'Pet shop não encontrado.'; end if;
  if not public.lgpd_sou_titular(p_petshop) then raise exception 'Só o titular da conta pode pedir para apagar a conta.'; end if;
  if not public.lgpd_texto_igual(p_nome, v_loja.nome) then raise exception 'Digite o nome do pet shop igual ao de Meu pet shop para confirmar.'; end if;
  select * into v_x from public.exclusoes_conta where petshop_id = p_petshop and cancelado_em is null and apagado_em is null;
  if found then return jsonb_build_object('pedido_em', v_x.pedido_em, 'apagar_em', v_x.apagar_em, 'ja', true); end if;
  insert into public.exclusoes_conta (petshop_id, petshop_nome, pedido_por, pedido_nome, pedido_email, apagar_em)
  values (p_petshop, v_loja.nome, (select auth.uid()), public.nome_na_equipe(p_petshop),
          (select u.email from auth.users u where u.id = (select auth.uid())), now() + interval '30 days')
  returning * into v_x;
  perform public.lgpd_anotar(p_petshop, 'pediu_exclusao', jsonb_build_object('apagar_em', v_x.apagar_em));
  return jsonb_build_object('pedido_em', v_x.pedido_em, 'apagar_em', v_x.apagar_em);
end $$;

create function public.conta_exclusao_cancelar(p_petshop uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  if not public.sou_dono(p_petshop) then raise exception 'Só o dono do pet shop pode cancelar.'; end if;
  update public.exclusoes_conta set cancelado_em = now(), cancelado_por = (select auth.uid())
   where petshop_id = p_petshop and cancelado_em is null and apagado_em is null;
  get diagnostics v_n = row_count;
  if v_n > 0 then perform public.lgpd_anotar(p_petshop, 'cancelou_exclusao'); end if;
  return v_n > 0;
end $$;

-- Só a chave de serviço (faxina). Apaga os pet shops cujo prazo passou; devolve os logins do Maestro que ficaram sem pet shop.
create function public.gestao_exclusoes_processar(p_petshop uuid default null, p_limite int default 5) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  x public.exclusoes_conta;
  v_membros uuid[];
  v_soltos uuid[];
  v_lojas int := 0;
  v_usuarios uuid[] := '{}';
begin
  perform pg_advisory_xact_lock(hashtext('gestao_exclusoes_processar'));
  for x in select * from public.exclusoes_conta
            where cancelado_em is null and apagado_em is null and apagar_em <= now() and (p_petshop is null or petshop_id = p_petshop)
            order by apagar_em limit least(greatest(coalesce(p_limite, 5), 1), 50) loop
    select coalesce(array_agg(distinct m.user_id), '{}') into v_membros from public.profissionais m where m.petshop_id = x.petshop_id and m.user_id is not null;
    insert into public.arquivos_lixo (bucket, caminho, petshop_id, motivo)
    select o.bucket_id, o.name, x.petshop_id, 'conta_apagada' from storage.objects o
     where o.bucket_id in ('pets', 'diario', 'boletim', 'caderno-tmp') and o.name like x.petshop_id::text || '/%'
    on conflict do nothing;
    delete from public.petshops where id = x.petshop_id;
    -- logins do Maestro que não ficaram em nenhum outro pet shop e não são da equipe Maestro Pet
    select coalesce(array_agg(u.id), '{}') into v_soltos from auth.users u
     where u.id = any (v_membros) and coalesce(u.raw_user_meta_data ->> 'app', '') = 'maestro'
       and not exists (select 1 from public.profissionais m where m.user_id = u.id)
       and not exists (select 1 from public.admins a where a.user_id = u.id);
    update public.exclusoes_conta set apagado_em = now(), usuarios = cardinality(v_soltos) where id = x.id;
    insert into public.lgpd_registros (petshop_id, quem, quem_nome, acao, detalhe)
    values (x.petshop_id, null, 'Maestro Pet (automático)', 'conta_apagada', jsonb_build_object('pedido_em', x.pedido_em, 'logins', cardinality(v_soltos)));
    v_lojas := v_lojas + 1;
    v_usuarios := v_usuarios || v_soltos;
  end loop;
  return jsonb_build_object('lojas', v_lojas, 'usuarios', to_jsonb(v_usuarios));
end $$;

-- Só a chave de serviço (faxina): os arquivos da fila, por bucket. O que já não existe sai da fila.
create function public.gestao_lgpd_arquivos(p_limite int default 500, p_petshop uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_lim int := least(greatest(coalesce(p_limite, 500), 1), 1000); v jsonb;
begin
  delete from public.arquivos_lixo l
   where (p_petshop is null or l.petshop_id = p_petshop)
     and not exists (select 1 from storage.objects o where o.bucket_id = l.bucket and o.name = l.caminho);
  with s as (
    update public.arquivos_lixo l set tentativas = l.tentativas + 1
     where (l.bucket, l.caminho) in (select y.bucket, y.caminho from public.arquivos_lixo y
                                      where y.tentativas < 20 and (p_petshop is null or y.petshop_id = p_petshop)
                                      order by y.criado_em limit v_lim)
    returning l.bucket, l.caminho)
  select coalesce(jsonb_object_agg(g.bucket, g.caminhos), '{}'::jsonb) into v
    from (select s.bucket, jsonb_agg(s.caminho) as caminhos from s group by s.bucket) g;
  return v;
end $$;

-- ---------- 4. sair da equipe ----------
create function public.equipe_sair(p_petshop uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v public.profissionais;
begin
  select * into v from public.profissionais where petshop_id = p_petshop and user_id = (select auth.uid()) limit 1;
  if not found then raise exception 'Você não está na equipe deste pet shop.'; end if;
  if public.lgpd_sou_titular(p_petshop) then
    raise exception 'O titular da conta não sai da equipe. Para fechar o pet shop, use Encerrar e apagar a conta, em Meu pet shop.';
  end if;
  perform public.lgpd_anotar(p_petshop, 'saiu_da_equipe');
  update public.profissionais
     set user_id = null, email_convite = null, acessos = null, ve_financeiro = false,
         papel = case when papel = 'dono' then 'funcionario'::public.papel_equipe else papel end
   where id = v.id;
  return true;
end $$;

-- ---------- 5. cópia completa do administrador ----------
-- colunas que nunca saem na cópia: códigos de acesso de páginas públicas, assinaturas de link e segredos
create function public.copia_coluna_fora(p_tabela text, p_coluna text) returns boolean
language sql immutable set search_path = '' as $$
  select p_coluna ~* '(senha|password|segredo|secret|sha256|hash)'
      or (p_tabela || '.' || p_coluna) = any (array['albuns.token', 'boletins.token', 'boletins.assinaturas', 'diario_fotos.assinatura',
                                                    'fotos_autorizacoes.codigo', 'tutor_links.token'])
$$;

create function public.gestao_copia_tabelas() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'tabela', c.relname,
    'colunas', (select coalesce(jsonb_agg(a.attname order by a.attnum), '[]'::jsonb) from pg_attribute a
                 where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped and not public.copia_coluna_fora(c.relname, a.attname)),
    'fora', (select coalesce(jsonb_agg(a.attname order by a.attnum), '[]'::jsonb) from pg_attribute a
              where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped and public.copia_coluna_fora(c.relname, a.attname)),
    'ordem', coalesce((select jsonb_agg(a.attname order by k.n) from pg_index i
                         cross join lateral unnest(i.indkey::int2[]) with ordinality as k(att, n)
                         join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.att
                        where i.indrelid = c.oid and i.indisprimary), '[]'::jsonb)
  ) order by c.relname), '[]'::jsonb)
  from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
$$;

create function public.gestao_copia_registrar(p_quem uuid, p_tabelas int, p_linhas bigint) returns void
language sql security definer set search_path = '' as $$
  insert into public.lgpd_registros (petshop_id, quem, quem_nome, acao, detalhe)
  values (null, p_quem, (select u.email from auth.users u where u.id = p_quem), 'copia_completa',
          jsonb_build_object('tabelas', p_tabelas, 'linhas', p_linhas))
$$;

create function public.admin_copias() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.sou_admin() then raise exception 'Sem acesso.'; end if;
  return jsonb_build_object('lista', coalesce((select jsonb_agg(jsonb_build_object('quando', r.quando, 'quem', r.quem_nome, 'tabelas', r.detalhe -> 'tabelas',
                                                                                 'linhas', r.detalhe -> 'linhas') order by r.quando desc)
                                                 from (select * from public.lgpd_registros where acao = 'copia_completa' order by quando desc limit 10) r), '[]'::jsonb));
end $$;

create function public.admin_exclusoes() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.sou_admin() then raise exception 'Sem acesso.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', x.id, 'petshop_id', x.petshop_id, 'petshop', x.petshop_nome, 'pedido_nome', x.pedido_nome, 'pedido_email', x.pedido_email,
      'pedido_em', x.pedido_em, 'apagar_em', x.apagar_em, 'cancelado_em', x.cancelado_em, 'apagado_em', x.apagado_em, 'usuarios', x.usuarios)
      order by (x.cancelado_em is null and x.apagado_em is null) desc, x.apagar_em desc)
    from (select * from public.exclusoes_conta order by (cancelado_em is null and apagado_em is null) desc, pedido_em desc limit 100) x), '[]'::jsonb);
end $$;

-- ---------- permissões ----------
revoke execute on function public.lgpd_texto_igual(text, text), public.lgpd_trocar_nomes(text, text[], text), public.lgpd_anotar(uuid, text, jsonb),
  public.lgpd_sou_titular(uuid), public.lgpd_dinheiro(numeric), public.copia_coluna_fora(text, text),
  public.lgpd_registrar_copia(uuid, int), public.lgpd_registros_ver(uuid), public.cliente_dados(uuid), public.cliente_anonimizar(uuid, text),
  public.conta_exclusao_ver(uuid), public.conta_exclusao_pedir(uuid, text), public.conta_exclusao_cancelar(uuid), public.equipe_sair(uuid),
  public.admin_copias(), public.admin_exclusoes(),
  public.gestao_exclusoes_processar(uuid, int), public.gestao_lgpd_arquivos(int, uuid), public.gestao_copia_tabelas(), public.gestao_copia_registrar(uuid, int, bigint)
  from public, anon, authenticated;
grant execute on function public.lgpd_registrar_copia(uuid, int), public.lgpd_registros_ver(uuid), public.cliente_dados(uuid), public.cliente_anonimizar(uuid, text),
  public.conta_exclusao_ver(uuid), public.conta_exclusao_pedir(uuid, text), public.conta_exclusao_cancelar(uuid), public.equipe_sair(uuid),
  public.admin_copias(), public.admin_exclusoes()
  to authenticated;
grant execute on function public.gestao_exclusoes_processar(uuid, int), public.gestao_lgpd_arquivos(int, uuid), public.gestao_copia_tabelas(),
  public.gestao_copia_registrar(uuid, int, bigint)
  to service_role;
