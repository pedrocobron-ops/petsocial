-- Mozart e "Tirar dúvida" do link depois da 2ª rodada dos testadores (Rafael, creche).
--
-- 1. O "Tirar dúvida" do link não sabia do táxi pet (leva e traz): "Vocês têm táxi dog? Quanto custa?" dava "Não sei".
--    Função pública nova `link_taxi(p_codigo)`, só leitura, para a rota do link (servidor) montar o que o assistente sabe:
--    a taxa de leva e traz de Meu pet shop (valor fixo ou por bairro, ida e volta) e se algum mensalista tem táxi no plano.
--    Com "Esconder o preço no link" (hotel.link_sem_preco), sai sem valor nenhum, como os planos da creche (link_creche_planos).
--    Sem taxa e sem mensalista com táxi: null (o assistente diz que não sabe). Nada de cliente, pet ou endereço.
--
-- Nenhuma função trocada; nenhuma tabela nova.

create or replace function public.link_taxi(p_codigo text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when x.tem_taxa or x.mensalista then jsonb_build_object(
      'sem_preco', x.sem_preco,
      'modo', case when x.tem_taxa then x.modo end,
      'valor', case when x.tem_taxa and not x.sem_preco and x.modo = 'fixo' then x.valor end,
      'bairros', case when x.tem_taxa and x.modo = 'bairro' then coalesce((
          select jsonb_agg(jsonb_build_object('nome', left(btrim(b ->> 'nome'), 60),
              'valor', case when x.sem_preco then null else (b ->> 'valor')::numeric end) order by b ->> 'nome')
          from jsonb_array_elements(case when jsonb_typeof(x.taxa -> 'bairros') = 'array' then x.taxa -> 'bairros' else '[]'::jsonb end) b
          where jsonb_typeof(b) = 'object' and nullif(btrim(coalesce(b ->> 'nome', '')), '') is not null
            and jsonb_typeof(b -> 'valor') = 'number' and (b ->> 'valor')::numeric >= 0), '[]'::jsonb) end,
      'mensalista', x.mensalista)
    end
  from (
    select p.opcoes -> 'taxi.taxa' as taxa,
      coalesce(p.opcoes -> 'hotel.link_sem_preco' = 'true'::jsonb, false) as sem_preco,
      case when p.opcoes -> 'taxi.taxa' ->> 'modo' = 'bairro' then 'bairro' else 'fixo' end as modo,
      case when jsonb_typeof(p.opcoes -> 'taxi.taxa' -> 'valor') = 'number' and (p.opcoes -> 'taxi.taxa' ->> 'valor')::numeric > 0
        then (p.opcoes -> 'taxi.taxa' ->> 'valor')::numeric end as valor,
      jsonb_typeof(p.opcoes -> 'taxi.taxa') = 'object' and (
        (p.opcoes -> 'taxi.taxa' ->> 'modo' = 'bairro' and jsonb_typeof(p.opcoes -> 'taxi.taxa' -> 'bairros') = 'array'
          and jsonb_array_length(p.opcoes -> 'taxi.taxa' -> 'bairros') > 0)
        or (coalesce(p.opcoes -> 'taxi.taxa' ->> 'modo', 'fixo') <> 'bairro' and jsonb_typeof(p.opcoes -> 'taxi.taxa' -> 'valor') = 'number'
          and (p.opcoes -> 'taxi.taxa' ->> 'valor')::numeric > 0)) as tem_taxa,
      coalesce(p.link_creche, false) and exists (select 1 from public.creche_planos pl where pl.petshop_id = p.id and pl.taxi is not null
        and (pl.fim is null or pl.fim >= (now() at time zone p.fuso)::date)) as mensalista
    from public.petshops p
    where p.link_codigo = p_codigo and p.link_ativo and public.acesso_liberado(p.id)
  ) x
$$;
revoke execute on function public.link_taxi(text) from public;
grant execute on function public.link_taxi(text) to anon, authenticated;
