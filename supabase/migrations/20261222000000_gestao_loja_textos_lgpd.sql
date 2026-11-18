-- =====================================================================================================================
-- Loja, textos e LGPD (2ª rodada das testadoras: Camila, Neide e Juliana). Só acrescenta: colunas novas, funções novas, e funções
-- trocadas que mantêm a assinatura, copiadas da última definição (arquivo indicado em cada uma) e mudadas só no que está descrito.
-- O aplicativo de antes continua igual com esta migração aplicada.
--
-- 1. estoque_entrada (20261214): produto com "Controlar validade" pede a validade na entrada (o lote continua opcional). Antes as
--    unidades sem validade ficavam fora do "vence antes sai antes" e do Vencendo. Só a entrada pela tela (esta função) é
--    conferida; a volta de venda desfeita, a devolução, o saldo da planilha e o Mozart continuam como estão.
-- 2. Valor em estoque sem o custo médio arredondado: produtos.custo_exato (a mesma média, sem arredondar; reservada, só pela
--    função produtos_custo_exato, de quem vê o custo). aplicar_movimento_estoque (20261201) grava as duas; o custo em centavos
--    continua igual (5 × 142 + 4 × 150 dá R$ 1.310,00 no valor em estoque, não 9 × 145,56 = 1.310,04). Custo mudado sem a
--    média (ficha, Mozart): o gatilho produto_custo_exato_limpar esquece a média exata (vale o custo digitado).
-- 3. LGPD: lgpd_registros.protocolo (um código curto, "LGPD-7K3M-Q9TX", para o dono dar ao cliente; os registros antigos ganham o
--    seu). lgpd_registros_ver (20261199) devolve o protocolo e o nome do tutor lido do cadastro na hora (o registro continua
--    guardando só o id): depois de apagar o tutor, o cadastro diz "Cliente removido". Nada a mais fica guardado sobre o cliente.
--    cliente_dados (20261205): as planilhas com palavras em vez de códigos ("Concluído", "Cão", "Grande", "Macho"), dinheiro
--    como "R$ 150,00", aniversário do pet sem o ano ("20/11"); devolve o protocolo do pedido.
-- 4. Aniversário do pet sem o ano: pets.nascimento continua uma data; sem o ano, o aplicativo grava o ano 1904 (o mesmo do tutor,
--    20261205). As funções do banco já olham só o dia e o mês (niver_perto, niver_no_dia e as listas de aniversário).
-- =====================================================================================================================

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Entrada com validade (20261214)
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.estoque_entrada(p_petshop uuid, p_chave text, p_movimento jsonb, p_despesa jsonb default null)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_feito jsonb;
  v_mov uuid;
  v_lanc uuid;
  v_fuso text;
  v_hoje date;
  v_pago boolean;
  v_valor numeric;
  v_forma text;
  v_data date;
  v_caixa uuid;
  v_res jsonb;
begin
  if (select auth.uid()) is null or p_petshop is null or not (p_petshop in (select public.meus_petshops())) then
    raise exception 'Sem acesso a este pet shop.' using errcode = '42501';
  end if;
  if p_chave is null or char_length(p_chave) not between 8 and 100 then raise exception 'Operação sem chave. Atualize a tela e tente de novo.'; end if;
  if jsonb_typeof(p_movimento) is distinct from 'object' or (p_movimento ->> 'produto_id') is null then raise exception 'Diga o produto da entrada.'; end if;
  if coalesce((p_movimento ->> 'quantidade')::numeric, 0) <= 0 then raise exception 'Diga quantas unidades entraram.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_petshop::text || ':lote:' || p_chave, 0));
  v_feito := public.lote_ja_feito(p_petshop, p_chave);
  if v_feito is not null then return v_feito || jsonb_build_object('repetido', true); end if;
  -- produto com "Controlar validade": a entrada pede a validade (o lote é opcional). Sem ela, as unidades ficariam fora do
  -- "vence antes sai antes" e do Vencendo (achado da Camila, 2ª rodada).
  if exists (select 1 from public.produtos x where x.id = (p_movimento ->> 'produto_id')::uuid and x.petshop_id = p_petshop
               and x.controla_validade and x.tipo = 'produto')
     and nullif(p_movimento ->> 'validade', '') is null then
    raise exception 'Diga a validade do que está entrando (o lote é opcional). Sem ela, estas unidades ficam fora do Vencendo.'
      using hint = 'maestro:validade';
  end if;

  insert into public.movimentos_estoque (petshop_id, produto_id, tipo, quantidade, custo_unitario, motivo, criado_por, fornecedor_id, lote, validade, chave)
  values (p_petshop, (p_movimento ->> 'produto_id')::uuid, 'entrada', (p_movimento ->> 'quantidade')::numeric,
    nullif(p_movimento ->> 'custo_unitario', '')::numeric, coalesce(nullif(btrim(p_movimento ->> 'motivo'), ''), 'Compra'), (select auth.uid()),
    nullif(p_movimento ->> 'fornecedor_id', '')::uuid, left(nullif(btrim(p_movimento ->> 'lote'), ''), 60), nullif(p_movimento ->> 'validade', '')::date,
    p_chave || ':entrada')
  on conflict (petshop_id, chave) do nothing
  returning id into v_mov;
  if v_mov is null then
    select m.id into v_mov from public.movimentos_estoque m where m.petshop_id = p_petshop and m.chave = p_chave || ':entrada';
  end if;

  if jsonb_typeof(p_despesa) = 'object' then
    v_valor := round((p_despesa ->> 'valor')::numeric, 2);
    if v_valor is null or v_valor <= 0 then raise exception 'Confira o valor da compra.'; end if;
    v_pago := coalesce((p_despesa ->> 'pago')::boolean, true);
    v_forma := p_despesa ->> 'forma';
    if v_pago and coalesce(v_forma, '') not in ('dinheiro', 'pix', 'debito', 'credito', 'outro') then
      raise exception 'Escolha como você pagou a compra.' using hint = 'maestro:forma';
    end if;
    select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = p_petshop;
    v_hoje := (now() at time zone coalesce(v_fuso, 'America/Sao_Paulo'))::date;
    if v_pago then
      v_data := v_hoje;
      select c.id into v_caixa from public.caixas c where c.petshop_id = p_petshop and c.fechado_em is null limit 1;
    else
      v_data := nullif(p_despesa ->> 'vencimento', '')::date;
      if v_data is null then raise exception 'Escolha o dia de pagar a compra.' using hint = 'maestro:vencimento'; end if;
    end if;
    begin
      insert into public.lancamentos (petshop_id, tipo, valor, forma, categoria, descricao, data, vencimento, pago, caixa_id, origem, criado_por, chave)
      values (p_petshop, 'saida', v_valor, case when v_pago then v_forma end, coalesce(nullif(btrim(p_despesa ->> 'categoria'), ''), 'Produtos e material'),
        left(nullif(btrim(p_despesa ->> 'descricao'), ''), 200), v_data, case when v_pago then null else v_data end, v_pago, v_caixa, 'tela',
        (select auth.uid()), p_chave)
      on conflict (petshop_id, chave) do nothing
      returning id into v_lanc;
    exception when insufficient_privilege then
      raise exception '%', case when v_pago then 'Só quem cuida do caixa ou do financeiro lança a compra como despesa.'
        else 'Só quem cuida do financeiro anota uma compra para pagar depois.' end using errcode = '42501';
    end;
    if v_lanc is null then
      select l.id into v_lanc from public.lancamentos l where l.petshop_id = p_petshop and l.chave = p_chave;
    end if;
  end if;

  v_res := jsonb_build_object('ok', true, 'movimento_id', v_mov, 'lancamento_id', v_lanc);
  perform public.lote_guardar(p_petshop, p_chave, v_res);
  return v_res;
end $$;
revoke execute on function public.estoque_entrada(uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.estoque_entrada(uuid, text, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Custo médio sem arredondar (só para o valor em estoque)
-- ---------------------------------------------------------------------------------------------------------------------
alter table public.produtos add column if not exists custo_exato numeric;
-- sem grant: a coluna é do custo (reservada); quem vê o custo lê por produtos_custo_exato

-- custo mudado sem a média exata junto (ficha, Mozart, kit): a média exata deixa de valer
create or replace function public.produto_custo_exato_limpar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.custo is distinct from old.custo and new.custo_exato is not distinct from old.custo_exato then
    new.custo_exato := null;
  end if;
  return new;
end $$;
revoke execute on function public.produto_custo_exato_limpar() from public, anon, authenticated;
drop trigger if exists produto_custo_exato_limpar on public.produtos;
create trigger produto_custo_exato_limpar before update of custo on public.produtos
  for each row execute function public.produto_custo_exato_limpar();

-- 20261201, com custo_exato
create or replace function public.aplicar_movimento_estoque() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_media boolean;
  v_tipo text;
  v_antes numeric;
  v_soma numeric;
  k record;
begin
  select x.tipo, x.estoque into v_tipo, v_antes from public.produtos x where x.id = new.produto_id for update;
  if v_tipo = 'kit' then
    -- um movimento por produto do kit, com o mesmo motivo, ligado a este (sem a venda: o custo da venda fica no kit)
    for k in select i.componente_id, i.quantidade from public.produtos_kit_itens i where i.kit_id = new.produto_id order by i.componente_id loop
      insert into public.movimentos_estoque (petshop_id, produto_id, tipo, quantidade, motivo, origem, criado_por, kit_movimento_id)
      values (new.petshop_id, k.componente_id, new.tipo, round(new.quantidade * k.quantidade, 3), new.motivo, new.origem, new.criado_por, new.id);
    end loop;
    perform public.kits_recalcular(array[new.produto_id]);
    return new;
  end if;

  if new.tipo = 'entrada' then
    v_media := new.custo_unitario is not null and coalesce(
      (select (x.opcoes -> 'loja.margem') = 'true'::jsonb from public.petshops x where x.id = new.petshop_id), false);
    -- custo_exato: a mesma média, sem arredondar (só o valor em estoque usa; custo continua em centavos como antes)
    update public.produtos
      set custo = case
            when new.custo_unitario is null then custo
            when not v_media or custo is null or estoque <= 0 or estoque + new.quantidade <= 0 then new.custo_unitario
            else round((estoque * coalesce(custo_exato, custo) + new.quantidade * new.custo_unitario) / (estoque + new.quantidade), 2)
          end,
          custo_exato = case
            when new.custo_unitario is null then custo_exato
            when not v_media or custo is null or estoque <= 0 or estoque + new.quantidade <= 0 then new.custo_unitario
            else round((estoque * coalesce(custo_exato, custo) + new.quantidade * new.custo_unitario) / (estoque + new.quantidade), 10)
          end,
          ultimo_custo = coalesce(new.custo_unitario, ultimo_custo),
          fornecedor_id = coalesce(new.fornecedor_id, fornecedor_id),
          estoque = estoque + new.quantidade
      where id = new.produto_id;
    if new.lote_id is not null and new.quantidade > 0 then
      update public.produtos_lotes l set
          custo_unitario = case when new.custo_unitario is null then l.custo_unitario
            when l.custo_unitario is null or l.quantidade <= 0 then new.custo_unitario
            else round((l.quantidade * l.custo_unitario + new.quantidade * new.custo_unitario) / (l.quantidade + new.quantidade), 2) end,
          quantidade = l.quantidade + new.quantidade
        where l.id = new.lote_id;
      insert into public.movimentos_lotes (petshop_id, movimento_id, lote_id, quantidade) values (new.petshop_id, new.id, new.lote_id, new.quantidade);
    end if;
  elsif new.tipo = 'saida' then
    update public.produtos set estoque = estoque - new.quantidade where id = new.produto_id;
    perform public.lotes_consumir(new.id, new.petshop_id, new.produto_id, new.quantidade, new.lote_id);
  else
    update public.produtos set estoque = new.quantidade where id = new.produto_id;
    -- saldo corrigido para baixo do que está nos lotes: os lotes acompanham (primeiro o que vence antes)
    select coalesce(sum(l.quantidade), 0) into v_soma from public.produtos_lotes l where l.produto_id = new.produto_id and l.quantidade > 0;
    if v_soma > new.quantidade then
      perform public.lotes_consumir(new.id, new.petshop_id, new.produto_id, v_soma - new.quantidade, new.lote_id);
    end if;
  end if;
  return new;
end $$;

-- custo médio de cada produto, sem arredondar quando existe (senão o custo em centavos), para quem vê o custo
create or replace function public.produtos_custo_exato(p uuid) returns table (id uuid, custo numeric)
language sql stable security definer set search_path = '' as $$
  select x.id, coalesce(x.custo_exato, x.custo) from public.produtos x
  where x.petshop_id = p and x.tipo = 'produto' and x.custo is not null and (select public.vejo_custo(p))
$$;
revoke execute on function public.produtos_custo_exato(uuid) from public, anon;
grant execute on function public.produtos_custo_exato(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. LGPD: protocolo, nome do tutor no registro, planilhas com palavras
-- ---------------------------------------------------------------------------------------------------------------------
-- código curto, sem letras que se confundem (0/O, 1/I)
create or replace function public.lgpd_protocolo_novo() returns text
language plpgsql volatile set search_path = '' as $$
declare
  a constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  r text := '';
begin
  for i in 1..8 loop
    r := r || substr(a, 1 + floor(random() * 32)::int, 1);
    if i = 4 then r := r || '-'; end if;
  end loop;
  return 'LGPD-' || r;
end $$;
revoke execute on function public.lgpd_protocolo_novo() from public, anon, authenticated;

alter table public.lgpd_registros add column if not exists protocolo text default public.lgpd_protocolo_novo();
update public.lgpd_registros set protocolo = public.lgpd_protocolo_novo() where protocolo is null;
create index if not exists lgpd_registros_protocolo on public.lgpd_registros (protocolo);

-- "R$ 1.234,50" (negativo: "-R$ 54,00"); vazio fica vazio
create or replace function public.lgpd_brl(n numeric) returns text
language sql immutable set search_path = '' as $$
  select case when n is null then null
    else case when n < 0 then '-' else '' end || 'R$ ' || translate(to_char(abs(round(n, 2)), 'FM999,999,999,990.00'), ',.', '.,') end
$$;

-- palavra no lugar do código gravado (o que não conhece sai como está)
create or replace function public.lgpd_rotulo(p_tipo text, p_valor text) returns text
language sql immutable set search_path = '' as $$
  select case when p_valor is null then null else coalesce(case p_tipo
    when 'especie' then case p_valor when 'cao' then 'Cão' when 'gato' then 'Gato' when 'outro' then 'Outro' end
    when 'porte' then case p_valor when 'P' then 'Pequeno' when 'M' then 'Médio' when 'G' then 'Grande' when 'GG' then 'Gigante' end
    when 'sexo' then case p_valor when 'M' then 'Macho' when 'F' then 'Fêmea' end
    when 'saude' then case p_valor when 'vacina' then 'Vacina' when 'vermifugo' then 'Vermífugo' when 'antipulgas' then 'Antipulgas' when 'outro' then 'Outro' end
    when 'agendamento' then case p_valor when 'marcado' then 'Marcado' when 'confirmado' then 'Confirmado' when 'em_atendimento' then 'Em atendimento'
      when 'concluido' then 'Concluído' when 'faltou' then 'Faltou' when 'cancelado' then 'Cancelado' end
    when 'estadia_tipo' then case p_valor when 'creche' then 'Creche' when 'hotel' then 'Hotel' end
    when 'estadia' then case p_valor when 'reservada' then 'Reservada' when 'em_casa' then 'Na casa' when 'encerrada' then 'Encerrada' when 'cancelada' then 'Cancelada' end
    when 'mensalidade' then case p_valor when 'aberta' then 'Em aberto' when 'cancelada' then 'Cancelada' end
    when 'lancamento' then case p_valor when 'entrada' then 'Entrada' when 'saida' then 'Saída' end
    when 'pedido_tipo' then case p_valor when 'servico' then 'Serviço (banho e tosa)' when 'creche' then 'Creche' when 'hotel' then 'Hotel' end
    when 'pedido' then case p_valor when 'pendente' then 'Esperando resposta' when 'aceito' then 'Aceito' when 'recusado' then 'Recusado' end
  end, p_valor) end
$$;

-- aniversário: "20/11/2019", ou "20/11" quando o ano não foi anotado (guardado como 1904)
create or replace function public.lgpd_data_niver(d date) returns text
language sql immutable set search_path = '' as $$
  select case when d is null then null when extract(year from d) = 1904 then to_char(d, 'DD/MM') else to_char(d, 'DD/MM/YYYY') end
$$;
revoke execute on function public.lgpd_brl(numeric), public.lgpd_rotulo(text, text), public.lgpd_data_niver(date) from public, anon, authenticated;

-- 20261199, com o protocolo e o nome do tutor
create or replace function public.lgpd_registros_ver(p_petshop uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.sou_dono(p_petshop) then raise exception 'Só o dono do pet shop vê este registro.'; end if;
  -- o nome do tutor vem do cadastro na hora de ler (o registro guarda só o id): depois de apagar, o cadastro diz "Cliente removido"
  return coalesce((select jsonb_agg(jsonb_build_object('acao', r.acao, 'quem', r.quem_nome, 'quando', r.quando, 'detalhe', r.detalhe,
                       'protocolo', r.protocolo, 'cliente_id', r.detalhe ->> 'cliente_id',
                       'cliente', case when r.detalhe ? 'cliente_id' then coalesce(
                         (select c.nome from public.clientes c where c.id::text = r.detalhe ->> 'cliente_id' and c.petshop_id = p_petshop),
                         'Cliente removido') end) order by r.quando desc)
                     from (select * from public.lgpd_registros where petshop_id = p_petshop order by quando desc limit 30) r), '[]'::jsonb);
end $$;

-- 20261205, com as palavras, o dinheiro em R$ e o protocolo
create or replace function public.cliente_dados(p_cliente uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.clientes;
  v_fuso text;
  v_pets uuid[];
  v_fone text;
  v_arquivos jsonb := '[]'::jsonb;
  v_protocolo text;
begin
  select * into c from public.clientes where id = p_cliente;
  if not found or not public.sou_dono(c.petshop_id) then raise exception 'Cliente não encontrado.'; end if;
  select s.fuso into v_fuso from public.petshops s where s.id = c.petshop_id;
  select coalesce(array_agg(p.id), '{}') into v_pets from public.pets p where p.cliente_id = c.id and p.petshop_id = c.petshop_id;
  v_fone := nullif(regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g'), '');

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'cadastro.csv', 'explica', 'O cadastro do tutor: nome, telefone, e-mail, endereço, aniversário e observações.',
    'colunas', jsonb_build_array('Nome', 'Telefone', 'E-mail', 'Endereço', 'Aniversário', 'Observações', 'Cliente desde'),
    'linhas', jsonb_build_array(jsonb_build_array(c.nome, c.telefone, c.email, c.endereco,
      case when c.nascimento is null then null when extract(year from c.nascimento) = 1904 then to_char(c.nascimento, 'DD/MM') else to_char(c.nascimento, 'DD/MM/YYYY') end,
      c.obs, to_char(c.criado_em at time zone v_fuso, 'DD/MM/YYYY')))));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'pets.csv', 'explica', 'Os pets do tutor.',
    'colunas', jsonb_build_array('Pet', 'Espécie', 'Raça', 'Porte', 'Sexo', 'Nascimento', 'Alertas', 'Observações', 'Ativo', 'Adicionado em'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(p.nome, public.lgpd_rotulo('especie', p.especie::text), p.raca, public.lgpd_rotulo('porte', p.porte::text),
                 public.lgpd_rotulo('sexo', p.sexo::text), public.lgpd_data_niver(p.nascimento), p.alertas, p.obs,
                 case when p.ativo then 'Sim' else 'Não' end, to_char(p.criado_em at time zone v_fuso, 'DD/MM/YYYY')) order by p.nome)
               from public.pets p where p.id = any (v_pets)), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'saude.csv', 'explica', 'Vacinas, vermífugos, antipulgas e outros cuidados anotados na ficha dos pets.',
    'colunas', jsonb_build_array('Pet', 'Tipo', 'Nome', 'Aplicado em', 'Vence em', 'Observações'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(p.nome, public.lgpd_rotulo('saude', s.tipo::text), s.nome, to_char(s.aplicado_em, 'DD/MM/YYYY'), to_char(s.vence_em, 'DD/MM/YYYY'), s.obs) order by s.criado_em)
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
                 p.nome, v.nome, public.lgpd_rotulo('agendamento', a.status::text), public.lgpd_brl(a.preco), case when a.leva_traz then 'Sim' else 'Não' end, a.endereco_leva_traz, a.obs) order by a.inicio)
               from public.agendamentos a join public.pets p on p.id = a.pet_id left join public.servicos v on v.id = a.servico_id
              where a.pet_id = any (v_pets)), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'estadias.csv', 'explica', 'As estadias de creche e hotel.',
    'colunas', jsonb_build_array('Tipo', 'Pet', 'Entrada', 'Saída prevista', 'Saída', 'Situação', 'Diária', 'Valor cobrado', 'Observações'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(public.lgpd_rotulo('estadia_tipo', e.tipo::text), p.nome, to_char(e.entrada at time zone v_fuso, 'DD/MM/YYYY HH24:MI'),
                 to_char(e.saida_prevista at time zone v_fuso, 'DD/MM/YYYY HH24:MI'), to_char(e.saida at time zone v_fuso, 'DD/MM/YYYY HH24:MI'), public.lgpd_rotulo('estadia', e.status::text),
                 public.lgpd_brl(e.valor_diaria), public.lgpd_brl(e.valor_cobrado), e.obs) order by e.entrada)
               from public.estadias e join public.pets p on p.id = e.pet_id where e.pet_id = any (v_pets)), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'pacotes.csv', 'explica', 'Os pacotes comprados, com quanto já foi usado.',
    'colunas', jsonb_build_array('Pacote', 'Pet', 'Total', 'Usados', 'Preço', 'Comprado em', 'Vence em'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(k.nome, p.nome, k.total, k.usados, public.lgpd_brl(k.preco), to_char(k.comprado_em, 'DD/MM/YYYY'),
                 to_char(k.vence_em, 'DD/MM/YYYY')) order by k.comprado_em)
               from public.pacotes_clientes k join public.pets p on p.id = k.pet_id where k.pet_id = any (v_pets)), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'mensalidades.csv', 'explica', 'As mensalidades da creche.',
    'colunas', jsonb_build_array('Mês', 'Pet', 'Total', 'Vencimento', 'Situação'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(to_char(m.mes, 'MM/YYYY'), p.nome, public.lgpd_brl(m.total), to_char(m.vencimento, 'DD/MM/YYYY'), public.lgpd_rotulo('mensalidade', m.status::text)) order by m.mes)
               from public.creche_cobrancas m join public.pets p on p.id = m.pet_id where m.pet_id = any (v_pets)), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'financeiro.csv', 'explica', 'O que o tutor pagou e o que ficou a receber. Saídas (devoluções) com valor negativo.',
    'colunas', jsonb_build_array('Data', 'Tipo', 'Categoria', 'Descrição', 'Valor', 'Pago', 'Vencimento'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(to_char(l.data, 'DD/MM/YYYY'), public.lgpd_rotulo('lancamento', l.tipo::text), l.categoria, l.descricao,
                 public.lgpd_brl(case when l.tipo = 'saida' then -l.valor else l.valor end), case when l.pago then 'Sim' else 'Não' end,
                 to_char(l.vencimento, 'DD/MM/YYYY')) order by l.data, l.criado_em)
               from public.lancamentos l where l.petshop_id = c.petshop_id and l.cliente_id = c.id and l.movimento is null), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'credito.csv', 'explica', 'Os movimentos do crédito do tutor (o que ficou guardado e o que foi usado).',
    'colunas', jsonb_build_array('Quando', 'Valor', 'Motivo'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(to_char(k.criado_em at time zone v_fuso, 'DD/MM/YYYY HH24:MI'), public.lgpd_brl(k.valor), k.motivo) order by k.criado_em)
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
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(to_char(d.criado_em at time zone v_fuso, 'DD/MM/YYYY HH24:MI'), d.tutor_nome, d.pet_nome, public.lgpd_rotulo('pedido_tipo', d.tipo::text),
                 to_char(d.inicio at time zone v_fuso, 'DD/MM/YYYY HH24:MI'), public.lgpd_rotulo('pedido', d.status::text), to_char(d.termos_aceitos_em at time zone v_fuso, 'DD/MM/YYYY HH24:MI')) order by d.criado_em)
               from public.pedidos_agendamento d
              where v_fone is not null and d.petshop_id = c.petshop_id and regexp_replace(d.telefone, '\D', '', 'g') = v_fone), '[]'::jsonb)));

  perform public.lgpd_anotar(c.petshop_id, 'baixou_tutor', jsonb_build_object('cliente_id', c.id));
  -- o protocolo deste pedido (o registro acabou de ser gravado, nesta mesma chamada)
  select r.protocolo into v_protocolo from public.lgpd_registros r
   where r.petshop_id = c.petshop_id and r.acao = 'baixou_tutor' and r.detalhe ->> 'cliente_id' = c.id::text and r.quem is not distinct from (select auth.uid())
   order by r.id desc limit 1;
  return jsonb_build_object('cliente', c.nome, 'petshop', (select s.nome from public.petshops s where s.id = c.petshop_id),
                            'gerado_em', now(), 'arquivos', v_arquivos, 'protocolo', v_protocolo);
end $$;

revoke execute on function public.cliente_dados(uuid) from public, anon;
grant execute on function public.cliente_dados(uuid) to authenticated;
revoke execute on function public.lgpd_registros_ver(uuid) from public, anon;
grant execute on function public.lgpd_registros_ver(uuid) to authenticated;
