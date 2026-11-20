// Privacidade, rodada 9 (migração 20261236). Trabalho técnico de conformidade, não parecer jurídico.
//
// 1. Um tutor com uma MARCA em todos os campos pessoais (ficha, pet, saúde, contatos, horário, estadia, diário, lista de
//    espera, pedidos pelo link com o telefone dele e com outro, orçamento, dinheiro, boletim, checklist, autorização de fotos,
//    conversas, rascunho, freio do link) e fotos em todos os buckets. Depois de "Apagar dados deste tutor", de "Excluir de
//    vez" e de apagar direto no banco, o banco INTEIRO é varrido (toda coluna de texto, lista ou jsonb de toda tabela) atrás
//    da marca e do telefone, e o Storage atrás dos arquivos: não pode sobrar nada.
// 2. Fotos: a antiga vai para a fila quando é trocada; a de formulário cancelado sai na faxina; a que está em uso fica.
// 3. Painel da equipe Maestro Pet: só números; ler uma conversa exige motivo e fica registrado; o dono vê quem abriu.
// 4. Dados do titular: planilhas novas do tutor, "Baixar os meus dados", apagar o próprio login.
// 5. Login com dados em outro produto do mesmo projeto nunca é apagado (fica anotado para a equipe).
// 6. Prazos: freio do link 2 dias, pedido pelo link que não virou horário 90 dias.
const { execSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');
const B = require('../lib/base');
const { lib } = require('../lib/app');
const { criarLoja, SENHA } = require('../lib/semente');
const T = require('../lib/teste')('lgpd-rodada9');
const F = lib('faxina');
const DOC = lib('documentos');

function chaveDeServico() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const env = execSync('npx supabase status -o env', { cwd: B.RAIZ, stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }).toString();
    const m = env.match(/^SERVICE_ROLE_KEY="?([^"\n]+)"?$/m);
    return m ? m[1] : null;
  } catch { return null; }
}
const JPG = new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])], { type: 'image/jpeg' });
const H = (n) => require('crypto').randomBytes(n / 2).toString('hex');
const digitos = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');

/** Todas as colunas de texto, lista e jsonb do esquema public, por tabela (com ou sem petshop_id). */
function colunasDeTexto() {
  const linhas = B.sql(`select c.table_name || '|' || bool_or(c.column_name = 'petshop_id')::text || '|' ||
      coalesce(string_agg(case when c.data_type in ('text', 'character varying', 'jsonb', 'json', 'ARRAY', 'USER-DEFINED', 'character') then c.column_name end, ','), '')
    from information_schema.columns c join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and t.table_type = 'BASE TABLE' group by c.table_name order by c.table_name`).split('\n').filter(Boolean);
  return linhas.map((l) => { const [tabela, loja, cols] = l.split('|'); return { tabela, loja: loja === 'true', cols: cols ? cols.split(',') : [] }; }).filter((x) => x.cols.length);
}

/**
 * Varre o banco inteiro atrás das marcas (texto, sem diferença de maiúsculas) e dos telefones (só os números, os 8 últimos).
 * Tabela com petshop_id: só as linhas da loja (e aí o telefone é procurado tirando tudo o que não é número, para achar com
 * traço, espaço ou +55). Tabela sem petshop_id: todas as linhas. Devolve ["tabela.coluna (n)", …].
 */
function varrer(P, marcas, fones, fora = []) {
  const partes = [];
  for (const { tabela, loja, cols } of colunasDeTexto()) {
    if (fora.includes(tabela)) continue;
    for (const col of cols) {
      const txt = `"${col}"::text`;
      const conds = [
        ...marcas.map((m) => `${txt} ilike ${B.q('%' + m + '%')}`),
        ...fones.map((f) => (loja ? `regexp_replace(${txt}, '\\D', '', 'g') like ${B.q('%' + f.slice(-8) + '%')}` : `${txt} like ${B.q('%' + f.slice(-8) + '%')}`)),
      ];
      partes.push(`select ${B.q(tabela + '.' + col)} as onde, count(*) as n from public."${tabela}" where ${loja ? `petshop_id = '${P}' and ` : ''}(${conds.join(' or ')})`);
    }
  }
  const achados = [];
  for (let i = 0; i < partes.length; i += 60) {
    const r = B.sql(`select onde || ' (' || n || ')' from (${partes.slice(i, i + 60).join(' union all ')}) x where n > 0`);
    if (r) achados.push(...r.split('\n').filter(Boolean));
  }
  return achados;
}

/** Cria um tutor com a marca em todos os campos pessoais e fotos em todos os buckets. Devolve ids, telefones e arquivos. */
async function semear(L, marca, o = {}) {
  const P = L.P, dono = L.sb.dono;
  const nome = `Marcela ${marca} Silva`, pet = `Fofo ${marca}`;
  const fone = '119' + digitos(8), fone2 = '219' + digitos(8);
  const up = async (bucket, sufixo = 'jpg') => {
    const caminho = `${P}/${B.uuid()}.${sufixo}`;
    B.must(await dono.storage.from(bucket).upload(caminho, JPG, { contentType: 'image/jpeg' }), `foto em ${bucket}`);
    return caminho;
  };
  const arq = { perfil: await up('pets'), antes: await up('pets'), depois: await up('pets'), diario: '', boletim: await up('boletim'), entrada: await up('entrada') };
  const c = B.sql(`insert into clientes (petshop_id, nome, telefone, email, endereco, obs, nascimento)
    values ('${P}', ${B.q(nome)}, '${fone}', '${marca.toLowerCase()}@tutor.local', 'Rua ${marca}, 77', 'obs ${marca} da tutora', '1980-05-17') returning id`);
  const p = B.sql(`insert into pets (petshop_id, cliente_id, nome, especie, porte, raca, alertas, obs, foto, nascimento)
    values ('${P}', '${c}', ${B.q(pet)}, 'cao', 'M', 'raça ${marca}', 'alerta ${marca}', 'obs ${marca} do pet', '${arq.perfil}', '2020-01-02') returning id`);
  arq.diario = `${P}/${p}/${L.hoje}/${B.sufixo()}.jpg`;
  B.must(await dono.storage.from('diario').upload(arq.diario, JPG, { contentType: 'image/jpeg' }), 'foto em diario');
  B.sql(`insert into pets_saude (petshop_id, pet_id, tipo, nome, obs) values ('${P}', '${p}', 'vacina', 'Vacina ${marca}', 'saúde ${marca}');
    insert into pets_contatos (petshop_id, cliente_id, pet_id, tipo, nome, relacao, telefone, obs) values ('${P}', '${c}', '${p}', 'busca', 'Tia ${marca}', 'tia', '${fone2}', 'contato ${marca}')`);
  const ag = B.sql(`insert into agendamentos (petshop_id, pet_id, servico_id, inicio, fim, obs, leva_traz, endereco_leva_traz, foto_antes, foto_depois)
    values ('${P}', '${p}', '${L.S.Banho}', now() - interval '3 days', now() - interval '3 days' + interval '1 hour', 'horário ${marca}', true, 'Rua ${marca}, 77 (horário)', '${arq.antes}', '${arq.depois}') returning id`);
  const es = B.sql(`insert into estadias (petshop_id, pet_id, tipo, status, entrada, saida_prevista, obs, endereco_leva_traz, cuidados, avisos)
    values ('${P}', '${p}', 'hotel', 'em_casa', now() - interval '1 hour', now() + interval '2 days', 'estadia ${marca}', 'Rua ${marca}, 77 (estadia)',
            '[{"hora": "08:00", "item": "Remédio ${marca}"}]'::jsonb, '{"texto": "aviso ${marca}"}'::jsonb) returning id`);
  B.sql(`insert into estadias_diario (petshop_id, estadia_id, dia, nota) values ('${P}', '${es}', current_date, 'diário ${marca}');
    insert into estadias_ocorrencias (petshop_id, estadia_id, pet_id, tipo, texto) values ('${P}', '${es}', '${p}', 'outro', 'ocorrência ${marca}');
    insert into estadias_cuidados (petshop_id, estadia_id, item, dia) values ('${P}', '${es}', 'Remédio ${marca}', current_date);
    insert into estadias_retiradas (estadia_id, petshop_id, quem, nome, relacao) values ('${es}', '${P}', 'outro', 'Tia ${marca}', 'tia');
    insert into estadias_horas_hist (petshop_id, estadia_id, motivo) values ('${P}', '${es}', 'pedido da ${nome}')`);
  B.sql(`insert into lista_espera (petshop_id, tipo, entrada, saida, pet_id, pet_nome, tutor_nome, telefone, obs, origem)
      values ('${P}', 'hotel', current_date + 30, current_date + 32, '${p}', ${B.q(pet)}, ${B.q(nome)}, '${fone}', 'espera ${marca}', 'equipe');
    insert into lista_espera (petshop_id, tipo, entrada, saida, pet_nome, tutor_nome, telefone, obs, origem)
      values ('${P}', 'hotel', current_date + 40, current_date + 42, 'Outro pet ${marca}', ${B.q(nome.toUpperCase())}, '${fone2}', 'espera pelo nome ${marca}', 'link')`);
  // pedidos pelo link: com o telefone da ficha, com outro telefone e o nome completo, e com outro telefone e outro nome mas
  // que virou o horário do pet
  B.sql(`insert into pedidos_agendamento (petshop_id, tutor_nome, telefone, pet_nome, inicio, fim, obs, status, termos_texto, cliente_recado)
      values ('${P}', ${B.q(nome)}, '(11) 9${fone.slice(3, 7)}-${fone.slice(7)}', ${B.q(pet)}, now() + interval '5 days', now() + interval '5 days 1 hour', 'recado ${marca} 1', 'pendente', 'regras ${marca}', 'depois ${marca}');
    insert into pedidos_agendamento (petshop_id, tutor_nome, telefone, pet_nome, inicio, fim, obs, status)
      values ('${P}', ${B.q('  ' + nome.toLowerCase() + ' ')}, '${fone2}', ${B.q(pet)}, now() + interval '6 days', now() + interval '6 days 1 hour', 'recado ${marca} outro número', 'pendente');
    insert into pedidos_agendamento (petshop_id, tutor_nome, telefone, pet_nome, inicio, fim, obs, status, agendamento_id)
      values ('${P}', 'Má ${marca}', '319${digitos(8)}', ${B.q(pet)}, now() - interval '3 days', now() - interval '3 days' + interval '1 hour', 'recado ${marca} do horário', 'aceito', '${ag}')`);
  B.sql(`insert into orcamentos (petshop_id, numero, cliente_id, nome, telefone, itens, validade, token, obs, total)
    values ('${P}', (select coalesce(max(numero), 0) + 1 from orcamentos where petshop_id = '${P}'), '${c}', ${B.q(nome)}, '${fone}', '[{"tipo": "servico", "nome": "Banho", "qtd": 1, "valor": 50}]'::jsonb,
            current_date + 7, '${H(48)}', 'orçamento da ${nome} para ${pet}', 50)`);
  const lanc = B.sql(`insert into lancamentos (petshop_id, tipo, valor, categoria, descricao, data, pago, forma, cliente_id, agendamento_id)
    values ('${P}', 'entrada', 50, 'Banho e tosa', ${B.q(`Banho · ${pet} (${nome})`)}, current_date, true, 'pix', '${c}', '${ag}') returning id`);
  B.sql(`insert into clientes_creditos (petshop_id, cliente_id, valor, motivo) values ('${P}', '${c}', 10, ${B.q(`troco da ${nome}`)})`);
  const bo = B.sql(`insert into boletins (petshop_id, pet_id, agendamento_id, token, texto, nota, atencao, fotos)
    values ('${P}', '${p}', '${ag}', '${H(64)}', 'boletim ${marca}', 'nota ${marca}', 'atenção ${marca}', array['${arq.boletim}']) returning id`);
  B.sql(`insert into diario_fotos (petshop_id, estadia_id, pet_id, dia, caminho, legenda) values ('${P}', '${es}', '${p}', current_date, '${arq.diario}', 'legenda ${marca}');
    insert into entradas (petshop_id, pet_id, agendamento_id, cuidados, lesoes_obs, pertences_outros, obs, fotos, aceite, aceite_nome, aceite_ip, aceite_navegador, aceito_em)
      values ('${P}', '${p}', '${ag}', 'cuidado ${marca}', 'lesão ${marca}', 'coleira ${marca}', 'entrada ${marca}', array['${arq.entrada}'], 'aparelho', ${B.q(nome)}, '203.0.113.9', 'Navegador ${marca}', now());
    insert into fotos_autorizacoes (petshop_id, pet_id, boletim_id, escopo, marcar, texto, codigo, ip, navegador)
      values ('${P}', '${p}', '${bo}', 'boletim', '@${marca.toLowerCase().slice(0, 20)}', 'autorizo as fotos do pet ${marca} nas redes', '${H(64)}', '203.0.113.9', 'Navegador ${marca}');
    insert into albuns (petshop_id, pet_id, token, itens) values ('${P}', '${p}', '${H(64)}', '[{"legenda": "álbum ${marca}", "caminho": "${arq.depois}"}]'::jsonb);
    insert into tutor_links (cliente_id, petshop_id, token) values ('${c}', '${P}', '${H(64)}')`);
  B.sql(`insert into conversas (petshop_id, canal, pergunta, resposta) values
      ('${P}', 'mozart', 'quanto a ${nome.toLowerCase()} deve?', 'A Marcela ${marca} Silva deve R$ 50.'),
      ('${P}', 'ajuda', 'como ligo para ${fone.slice(0, 2)} ${fone.slice(2, 7)}-${fone.slice(7)}?', 'Pelo botão do WhatsApp.');
    insert into assistente_eventos (petshop_id, acao, pedido, detalhes) values
      ('${P}', 'pedido', 'marca banho para a ${nome}', null),
      ('${P}', 'bloquear_horario', 'outro pedido', jsonb_build_object('pet_id', '${p}', 'pet', 'pet do ${marca}'));
    insert into link_envios (petshop_id, tipo, fone, rede) values ('${P}', 'pedido', '${fone.slice(-8)}', md5('rede ${marca}'));
    insert into rascunhos (petshop_id, user_id, tipo, dados) values ('${P}', (select user_id from profissionais where petshop_id='${P}' and papel='dono' limit 1), 'pet:${B.uuid()}', jsonb_build_object('tutorNome', ${B.q(nome)}, 'tutorFone', '${fone}', 'foto', '${arq.perfil}'))`);
  if (o.creche) {
    B.sql(`insert into creche_planos (petshop_id, pet_id, dias, inicio, obs) values ('${P}', '${p}', array[1,3]::smallint[], current_date, 'plano ${marca}')`);
  }
  return { c, p, ag, es, lanc, nome, pet, fone, fone2, arq, marca };
}

const noStorage = (caminhos) => B.num(`select count(*) from storage.objects where name in (${caminhos.map((x) => B.q(x)).join(',')})`);

(async () => T.rodar(async () => {
  const suf = B.sufixo().slice(-6).toUpperCase();
  const L = await criarLoja(T, { nome: 'LGPD rodada9' });
  const O = await criarLoja(T, { nome: 'LGPD rodada9 outra', equipe: false });
  const P = L.P, anon = B.cliente(), dono = L.sb.dono;
  B.sql(`update petshops set opcoes = jsonb_set(coalesce(opcoes, '{}'::jsonb), '{casa.tutor}', '{"ativo": true}'::jsonb) where id='${P}'`); // página do tutor ligada: o diário aceita foto
  const chave = chaveDeServico();
  const svc = chave ? createClient(B.SUPABASE_URL, chave, { auth: { persistSession: false, autoRefreshToken: false } }) : null;

  // ---------------------------------------------------------------------------------------------------------------
  T.secao('documentos: a versão em vigor existe no banco');
  for (const d of ['termos', 'privacidade']) {
    T.ok(`${d} ${DOC.DOCUMENTOS[d].versao} está em documentos_versoes`, B.num(`select count(*) from documentos_versoes where documento='${d}' and versao='${DOC.DOCUMENTOS[d].versao}'`) === 1);
  }
  T.ok('versão 2.4 ou mais nova nos dois', ['termos', 'privacidade'].every((d) => Number(DOC.DOCUMENTOS[d].versao) >= 2.4), DOC.DOCUMENTOS);
  T.ok('ninguém lê config_interna direto', ((await dono.from('config_interna').select('*')).data ?? []).length === 0);

  // ---------------------------------------------------------------------------------------------------------------
  T.secao('baixar os dados do tutor: o que faltava');
  const A = await semear(L, `ZZA${suf}`);
  const antesVarrer = varrer(P, [A.marca], [A.fone, A.fone2]);
  T.ok('a varredura acha a marca em pelo menos 25 lugares antes de apagar (a varredura funciona)', antesVarrer.length >= 25, antesVarrer.length);
  const d = B.must(await dono.rpc('cliente_dados', { p_cliente: A.c }), 'cliente_dados');
  const arq = (n) => d.arquivos.find((a) => a.arquivo === n) ?? { linhas: [], colunas: [] };
  const tem = (n, t) => JSON.stringify(arq(n).linhas).includes(t);
  T.ok('lista de espera (pela ficha do pet)', arq('lista-de-espera.csv').linhas.length === 1 && tem('lista-de-espera.csv', `espera ${A.marca}`), arq('lista-de-espera.csv').linhas);
  T.ok('pedidos pelo link com o recado e o texto das regras', tem('pedidos-pelo-link.csv', `recado ${A.marca} 1`) && tem('pedidos-pelo-link.csv', `regras ${A.marca}`) && tem('pedidos-pelo-link.csv', `depois ${A.marca}`));
  T.ok('… e o pedido com outro telefone que virou o horário do pet', tem('pedidos-pelo-link.csv', `recado ${A.marca} do horário`));
  T.ok('checklist de entrada com quem aceitou, IP e navegador', tem('checklist-de-entrada.csv', A.nome) && tem('checklist-de-entrada.csv', '203.0.113.9') && tem('checklist-de-entrada.csv', `cuidado ${A.marca}`));
  T.ok('orçamentos', arq('orcamentos.csv').linhas.length === 1 && tem('orcamentos.csv', 'Banho'), arq('orcamentos.csv').linhas);
  T.ok('aniversário e "não quer receber mensagens" no cadastro', tem('cadastro.csv', '17/05/1980') && arq('cadastro.csv').colunas.includes('Não quer receber mensagens'));
  T.ok('estadia com o endereço do leva e traz, os cuidados e os avisos', tem('estadias.csv', `Rua ${A.marca}, 77 (estadia)`) && tem('estadias.csv', `Remédio ${A.marca}`) && tem('estadias.csv', `aviso ${A.marca}`));
  T.ok('lista das fotos (perfil, antes, depois, diário, boletim, checklist)', arq('fotos.csv').linhas.length === 6 && Object.values(A.arq).every((c) => tem('fotos.csv', c)), arq('fotos.csv').linhas);
  T.ok('autorização de fotos com IP e navegador', tem('autorizacoes-de-fotos.csv', `Navegador ${A.marca}`));
  T.ok('prêmios: a planilha existe', !!d.arquivos.find((a) => a.arquivo === 'premios.csv'));
  T.ok('cada planilha com o mesmo número de colunas em cada linha', d.arquivos.every((a) => a.linhas.every((l) => l.length === a.colunas.length)));
  T.recusa('a recepção não baixa', await L.sb.caixa.rpc('cliente_dados', { p_cliente: A.c }));
  T.recusa('o dono de outra loja não baixa', await O.sb.dono.rpc('cliente_dados', { p_cliente: A.c }));

  // ---------------------------------------------------------------------------------------------------------------
  T.secao('"Apagar dados deste tutor": o banco inteiro varrido depois');
  // outra pessoa com o mesmo telefone da tutora B (mãe e filha): o pedido dela não pode sair junto
  const ap = await dono.rpc('cliente_anonimizar', { p_cliente: A.c, p_confirmacao: A.nome });
  T.passa('o dono apaga', ap, ap.data?.ok === true && ap.data.pedidos === 3);
  const sobrou = varrer(P, [A.marca], [A.fone, A.fone2]);
  T.ok('NADA com a marca nem com os telefones em nenhuma coluna de nenhuma tabela', sobrou.length === 0, sobrou);
  T.ok('a estadia fica, sem endereço, cuidados nem avisos (achado A1)',
    B.sql(`select coalesce(obs, '-') || '|' || coalesce(endereco_leva_traz, '-') || '|' || coalesce(cuidados::text, '-') || '|' || avisos::text from estadias where id='${A.es}'`) === '-|-|-|{}');
  T.ok('o dinheiro fica (valor e quantidade), sem o nome', B.sql(`select valor::text || '|' || descricao from lancamentos where id='${A.lanc}'`) === '50.00|Banho · Pet removido (Cliente removido)',
    B.sql(`select valor::text || '|' || descricao from lancamentos where id='${A.lanc}'`));
  T.ok('os 6 arquivos estão na fila da faxina', B.num(`select count(*) from arquivos_lixo where petshop_id='${P}' and caminho in (${Object.values(A.arq).map((x) => B.q(x)).join(',')})`) === 6);
  if (svc) {
    const fx = await F.faxinaGeral(svc, P);
    T.ok('depois da faxina, nenhum arquivo dela no Storage', noStorage(Object.values(A.arq)) === 0 && fx.falhas === 0, fx);
    const pub = await fetch(`${B.SUPABASE_URL}/storage/v1/object/public/pets/${A.arq.perfil}`);
    T.ok('o endereço público da foto não abre mais', pub.status >= 400, pub.status);
  } else T.ok('sem a chave de serviço local: faxina não conferida', true);

  // ---------------------------------------------------------------------------------------------------------------
  T.secao('"Excluir de vez" (como a tela faz) não apaga menos do que "Apagar dados"');
  const Bt = await semear(L, `ZZB${suf}`);
  const ex = await dono.from('clientes').delete().eq('id', Bt.c).eq('petshop_id', P).select('id');
  T.ok('o dono exclui', !ex.error && ex.data.length === 1, ex.error?.message);
  const sobrouB = varrer(P, [Bt.marca], [Bt.fone, Bt.fone2]);
  T.ok('NADA com a marca nem com os telefones no banco inteiro (lista de espera, pedidos, orçamento, conversas, dinheiro)', sobrouB.length === 0, sobrouB);
  T.ok('o dinheiro continua, sem o nome', B.sql(`select descricao || '|' || coalesce(cliente_id::text, 'sem') from lancamentos where id='${Bt.lanc}'`) === 'Banho · Pet removido (Cliente removido)|sem');
  T.ok('os 6 arquivos (inclusive o antes e depois) estão na fila, pelo banco', B.num(`select count(*) from arquivos_lixo where petshop_id='${P}' and caminho in (${Object.values(Bt.arq).map((x) => B.q(x)).join(',')})`) === 6,
    B.sql(`select string_agg(bucket || ':' || motivo, ', ') from arquivos_lixo where petshop_id='${P}' and caminho in (${Object.values(Bt.arq).map((x) => B.q(x)).join(',')})`));
  T.ok('fica no registro de pedidos de dados, sem o nome', B.num(`select count(*) from lgpd_registros where petshop_id='${P}' and acao='excluiu_tutor' and detalhe->>'cliente_id'='${Bt.c}' and detalhe::text not ilike '%${Bt.marca}%'`) === 1);

  T.secao('cliente apagado direto no banco: a mesma limpeza');
  const Ct = await semear(L, `ZZC${suf}`);
  B.sql(`delete from clientes where id='${Ct.c}'`);
  const sobrouC = varrer(P, [Ct.marca], [Ct.fone, Ct.fone2]);
  T.ok('NADA com a marca nem com os telefones no banco inteiro', sobrouC.length === 0, sobrouC);
  T.ok('os arquivos estão na fila', B.num(`select count(*) from arquivos_lixo where petshop_id='${P}' and caminho in (${Object.values(Ct.arq).map((x) => B.q(x)).join(',')})`) === 6);
  if (svc) {
    const fx = await F.faxinaGeral(svc, P);
    T.ok('depois da faxina, nenhum arquivo dos dois no Storage', noStorage([...Object.values(Bt.arq), ...Object.values(Ct.arq)]) === 0 && fx.falhas === 0, fx);
  }

  T.secao('o que NÃO pode sair junto');
  // duas fichas com o mesmo telefone: o pedido da outra pessoa fica
  const foneCasa = '119' + digitos(8);
  const mae = B.sql(`insert into clientes (petshop_id, nome, telefone) values ('${P}', 'Mãe ZZD${suf} Lima', '${foneCasa}') returning id`);
  const filha = B.sql(`insert into clientes (petshop_id, nome, telefone) values ('${P}', 'Filha ZZD${suf} Lima', '${foneCasa}') returning id`);
  B.sql(`insert into pedidos_agendamento (petshop_id, tutor_nome, telefone, pet_nome, inicio, fim, status) values
    ('${P}', 'Mãe ZZD${suf} Lima', '${foneCasa}', 'Pet da mãe', now() + interval '3 days', now() + interval '3 days 1 hour', 'pendente'),
    ('${P}', 'Filha ZZD${suf} Lima', '${foneCasa}', 'Pet da filha', now() + interval '3 days', now() + interval '3 days 1 hour', 'pendente')`);
  B.must(await dono.rpc('cliente_anonimizar', { p_cliente: mae, p_confirmacao: `Mãe ZZD${suf} Lima` }), 'apagar a mãe');
  T.ok('telefone dividido: sai o pedido da mãe e fica o da filha', B.sql(`select string_agg(tutor_nome, ',') from pedidos_agendamento where petshop_id='${P}' and telefone='${foneCasa}'`) === `Filha ZZD${suf} Lima`);
  // juntar duas fichas repetidas: a que some não leva os pedidos nem a lista de espera da que fica
  const rep = B.sql(`insert into clientes (petshop_id, nome, telefone) values ('${P}', 'Filha ZZD${suf} Lima', '${foneCasa}') returning id`);
  B.must(await dono.rpc('clientes_juntar', { p_de: rep, p_para: filha }), 'juntar');
  T.ok('juntar fichas repetidas: o pedido da pessoa continua', B.num(`select count(*) from pedidos_agendamento where petshop_id='${P}' and telefone='${foneCasa}'`) === 1
    && B.num(`select count(*) from lgpd_registros where petshop_id='${P}' and acao='excluiu_tutor' and detalhe->>'cliente_id'='${rep}'`) === 0);
  T.ok('os tutores da loja que não foram apagados continuam como estavam', B.sql(`select nome from clientes where id='${L.tutores.Beto}'`) === 'Beto Lima' && B.sql(`select nome from pets where id='${L.pets.Bob}'`) === 'Bob');

  // ---------------------------------------------------------------------------------------------------------------
  T.secao('fotos: trocada, tirada, formulário cancelado');
  const subir = async () => { const c = `${P}/${B.uuid()}.jpg`; B.must(await dono.storage.from('pets').upload(c, JPG, { contentType: 'image/jpeg' }), 'foto'); return c; };
  const f1 = await subir(), f2 = await subir(), orfa = await subir(), nova = await subir(), emUso = await subir(), a1 = await subir(), a2 = await subir();
  B.must(await dono.from('pets').update({ foto: f1 }).eq('id', L.pets.Bob).select('id'), 'foto 1');
  T.ok('a primeira foto não vai para a fila', B.num(`select count(*) from arquivos_lixo where caminho='${f1}'`) === 0);
  B.must(await dono.from('pets').update({ foto: f2 }).eq('id', L.pets.Bob).select('id'), 'foto 2');
  T.ok('foto trocada: a antiga vai para a fila, pelo banco', B.sql(`select motivo from arquivos_lixo where bucket='pets' and caminho='${f1}'`) === 'foto_trocada');
  B.must(await dono.from('pets').update({ foto: null }).eq('id', L.pets.Bob).select('id'), 'tirar a foto');
  T.ok('foto tirada: vai para a fila', B.sql(`select motivo from arquivos_lixo where bucket='pets' and caminho='${f2}'`) === 'foto_trocada');
  B.must(await dono.from('pets').update({ foto: emUso }).eq('id', L.pets.Bob).select('id'), 'foto em uso');
  const agB = B.sql(`insert into agendamentos (petshop_id, pet_id, servico_id, inicio, fim, foto_antes) values ('${P}', '${L.pets.Bob}', '${L.S.Banho}', now() - interval '1 day', now() - interval '23 hours', '${a1}') returning id`);
  B.sql(`update agendamentos set foto_antes='${a2}' where id='${agB}'`);
  T.ok('antes e depois trocado: o antigo vai para a fila', B.sql(`select motivo from arquivos_lixo where caminho='${a1}'`) === 'foto_trocada');
  T.recusa('ninguém lê nem grava a fila direto', await dono.from('arquivos_lixo').insert({ bucket: 'pets', caminho: emUso, petshop_id: P, motivo: 'sem_ficha' }));
  // formulário cancelado: a foto subiu e nenhuma ficha usa. Com menos de 1 dia fica; com mais, a faxina põe na fila
  const fx0 = JSON.parse(B.sql(`select public.gestao_faxina_lgpd('${P}')::text`));
  T.ok('foto sem ficha com menos de 1 dia: ainda não', fx0.fotos === 0 && B.num(`select count(*) from arquivos_lixo where caminho in ('${orfa}', '${nova}')`) === 0, fx0);
  B.sql(`update storage.objects set created_at = now() - interval '2 days' where bucket_id='pets' and name in ('${orfa}', '${emUso}', '${a2}')`);
  const fx1 = JSON.parse(B.sql(`select public.gestao_faxina_lgpd('${P}')::text`));
  T.ok('foto sem ficha com mais de 1 dia: vai para a fila', B.sql(`select motivo from arquivos_lixo where caminho='${orfa}'`) === 'sem_ficha', fx1);
  T.ok('foto em uso (perfil, antes e depois) e foto nova não vão', B.num(`select count(*) from arquivos_lixo where caminho in ('${emUso}', '${a2}', '${nova}')`) === 0);
  // uma foto na fila que voltou a ser usada sai da fila sem ser apagada
  B.sql(`insert into arquivos_lixo (bucket, caminho, petshop_id, motivo) values ('pets', '${emUso}', '${P}', 'foto_trocada')`);
  T.recusa('o dono não chama a faxina', await dono.rpc('gestao_faxina_lgpd', { p_petshop: P }));
  T.recusa('o dono não chama gestao_lgpd_arquivos', await dono.rpc('gestao_lgpd_arquivos', { p_petshop: P }));
  if (svc) {
    const fx = await F.faxinaGeral(svc, P);
    T.ok('depois da faxina: a trocada, a tirada, o antes antigo e a sem ficha saíram do Storage', noStorage([f1, f2, a1, orfa]) === 0, fx);
    T.ok('… e a que está em uso e a nova continuam', noStorage([emUso, a2, nova]) === 3);
    T.ok('a faxina conta as fotos sem ficha', typeof fx.semFicha === 'number', fx);
  }

  // ---------------------------------------------------------------------------------------------------------------
  T.secao('prazos: freio do link 2 dias, pedido pelo link que não virou horário 90 dias');
  B.sql(`insert into link_envios (petshop_id, tipo, fone, rede, em) values ('${P}', 'pedido', '11112222', 'velho-${suf}', now() - interval '3 days'), ('${P}', 'pedido', '33334444', 'novo-${suf}', now() - interval '1 day')`);
  B.sql(`insert into pedidos_agendamento (petshop_id, tutor_nome, telefone, pet_nome, inicio, fim, status, criado_em, agendamento_id) values
    ('${P}', 'Velho recusado', '11900000001', 'x', now() - interval '100 days', now() - interval '100 days' + interval '1 hour', 'recusado', now() - interval '101 days', null),
    ('${P}', 'Velho sem resposta', '11900000002', 'x', now() - interval '95 days', now() - interval '95 days' + interval '1 hour', 'pendente', now() - interval '96 days', null),
    ('${P}', 'Velho aceito', '11900000003', 'x', now() - interval '95 days', now() - interval '95 days' + interval '1 hour', 'aceito', now() - interval '96 days', '${agB}'),
    ('${P}', 'Recusado de 80 dias', '11900000004', 'x', now() - interval '80 days', now() - interval '80 days' + interval '1 hour', 'recusado', now() - interval '81 days', null),
    ('${P}', 'Pedido antigo para data futura', '11900000005', 'x', now() + interval '5 days', now() + interval '5 days' + interval '1 hour', 'pendente', now() - interval '96 days', null)`);
  const fx2 = JSON.parse(B.sql(`select public.gestao_faxina_lgpd('${P}')::text`));
  T.ok('freio do link: sai o de 3 dias, fica o de 1 dia', fx2.freio === 1 && B.sql(`select string_agg(rede, ',') from link_envios where petshop_id='${P}' and rede like '%-${suf}'`) === `novo-${suf}`, fx2);
  T.ok('pedidos: saem o recusado e o sem resposta com mais de 90 dias; ficam o aceito, o de 80 dias e o de data futura', fx2.pedidos === 2
    && B.sql(`select string_agg(tutor_nome, ',' order by tutor_nome) from pedidos_agendamento where petshop_id='${P}' and telefone like '1190000000%'`) === 'Pedido antigo para data futura,Recusado de 80 dias,Velho aceito', fx2);

  // ---------------------------------------------------------------------------------------------------------------
  T.secao('painel da equipe Maestro Pet: só números; ler exige motivo e fica registrado');
  const adm = B.cliente();
  const emailAdm = `t-${L.suf}.admin@teste-auto.local`;
  B.must(await adm.auth.signUp({ email: emailAdm, password: SENHA, options: B.dadosDoCadastro() }), 'cadastro do admin');
  const uidAdm = (await adm.auth.getUser()).data.user.id;
  B.sql(`insert into admins (user_id) values ('${uidAdm}') on conflict do nothing`);
  await B.adminForte(adm); // o painel só responde com o segundo fator (aal2, migração 20261245)
  T.depois(() => B.sql(`delete from admins where user_id='${uidAdm}'`));
  const uidDono = B.sql(`select id from auth.users where email = ${B.q(L.emails.dono)}`);
  const conv = B.sql(`insert into conversas (petshop_id, user_id, canal, pergunta, resposta, resolveu) values
    ('${P}', '${uidDono}', 'mozart', 'quanto o Beto Lima deve? SEGREDO-${suf}', 'O Beto Lima deve R$ 80. Telefone 11988880002.', false) returning id`);
  B.sql(`insert into mozart_tempos (petshop_id, modo, fim, total_ms, voltas, ferramentas, tokens_entrada, tokens_saida) values ('${P}', 'json', 'ok', 900, 2, 3, 1200, 300), ('${P}', 'json', 'erro', 400, 1, 0, 100, 0)`);
  const lista = B.must(await adm.rpc('admin_conversas', { p_petshop: P }), 'admin_conversas');
  const c0 = lista.find((x) => x.id === conv);
  T.ok('a lista traz a conversa sem o texto (pergunta vazia, resposta e pessoa nulas)', !!c0 && c0.pergunta === '' && c0.resposta === null && c0.pessoa === null, c0);
  T.ok('… com os metadados (canal, tamanho, não resolveu, ainda não aberta)', c0?.canal === 'mozart' && c0.letras_pergunta > 10 && c0.letras_resposta > 10 && c0.resolveu === false && c0.aberta_em === null, c0);
  T.ok('nada do texto em lugar nenhum da resposta', !JSON.stringify(lista).includes('SEGREDO') && !JSON.stringify(lista).includes('Beto') && !JSON.stringify(lista).includes('11988880002'));
  const todas = B.must(await adm.rpc('admin_conversas', {}), 'admin_conversas de todas');
  T.ok('a lista de todas as lojas também vem sem texto', todas.every((x) => x.pergunta === '' && x.resposta === null && x.pessoa === null));
  const nums = B.must(await adm.rpc('admin_conversas_numeros', { p_petshop: P, p_dias: 30 }), 'números');
  T.ok('números: conversas, não resolveu, pedidos, erros, ferramentas e tokens', nums.conversas >= 1 && nums.nao_resolveu >= 1 && nums.pedidos === 2 && nums.erros === 1 && nums.ferramentas === 3
    && nums.tokens_entrada === 1300 && nums.tokens_saida === 300 && nums.aberturas === 0, nums);
  T.recusa('abrir sem motivo: recusa', await adm.rpc('admin_conversa_abrir', { p_conversa: conv, p_motivo: '   ' }), /motivo/);
  T.recusa('motivo curto demais: recusa', await adm.rpc('admin_conversa_abrir', { p_conversa: conv, p_motivo: 'ver' }), /motivo/);
  T.ok('nada registrado depois das recusas', B.num(`select count(*) from equipe_maestro_acessos where petshop_id='${P}'`) === 0);
  const aberta = await adm.rpc('admin_conversa_abrir', { p_conversa: conv, p_motivo: 'A dona pediu ajuda pelo WhatsApp com esta resposta' });
  T.passa('com motivo: abre e devolve o texto', aberta, aberta.data?.pergunta?.includes('SEGREDO') && aberta.data.resposta.includes('Beto Lima'));
  T.ok('fica registrado quem, quando e por quê', B.sql(`select quem::text || '|' || quem_nome || '|' || motivo || '|' || canal || '|' || conversa_id from equipe_maestro_acessos where petshop_id='${P}'`)
    === `${uidAdm}|${emailAdm}|A dona pediu ajuda pelo WhatsApp com esta resposta|mozart|${conv}`);
  const lista2 = B.must(await adm.rpc('admin_conversas', { p_petshop: P }), 'admin_conversas');
  T.ok('a lista passa a dizer que foi aberta (e continua sem o texto)', !!lista2.find((x) => x.id === conv)?.aberta_em && lista2.find((x) => x.id === conv).pergunta === '');
  const vistos = await dono.rpc('equipe_maestro_acessos_ver', { p_petshop: P });
  T.ok('o dono vê a abertura: quem, quando, o motivo e de quando era a conversa', !vistos.error && vistos.data.length === 1 && vistos.data[0].quem === emailAdm
    && vistos.data[0].motivo.startsWith('A dona pediu') && !!vistos.data[0].em && !!vistos.data[0].conversa_em, vistos.error?.message ?? vistos.data);
  T.recusa('a recepção não vê a lista', await L.sb.caixa.rpc('equipe_maestro_acessos_ver', { p_petshop: P }), /dono/);
  T.recusa('o dono de outra loja não vê', await O.sb.dono.rpc('equipe_maestro_acessos_ver', { p_petshop: P }));
  T.recusa('anônimo não vê', await anon.rpc('equipe_maestro_acessos_ver', { p_petshop: P }));
  for (const [n, c] of [['o dono', dono], ['a recepção', L.sb.caixa], ['anônimo', anon]]) {
    T.recusa(`${n} não abre conversa pelo painel`, await c.rpc('admin_conversa_abrir', { p_conversa: conv, p_motivo: 'um motivo com mais de dez letras' }));
    T.recusa(`${n} não lê os números do painel`, await c.rpc('admin_conversas_numeros', {}));
    T.recusa(`${n} não lista as conversas do painel`, await c.rpc('admin_conversas', {}));
    const q = await c.from('equipe_maestro_acessos').select('*');
    T.ok(`${n} não lê a tabela de acessos direto`, !!q.error || q.data.length === 0);
  }
  T.ok('só houve uma abertura registrada', B.num(`select count(*) from equipe_maestro_acessos where petshop_id='${P}'`) === 1);

  // ---------------------------------------------------------------------------------------------------------------
  T.secao('"Baixar os meus dados": o que guardamos de cada pessoa');
  const meus = B.must(await L.sb.caixa.rpc('meus_dados'), 'meus_dados');
  const meu = (n) => meus.arquivos.find((a) => a.arquivo === n) ?? { linhas: [] };
  T.ok('login, pet shops, aceites, acessos e conversas', ['login.csv', 'pet-shops.csv', 'aceites.csv', 'acessos.csv', 'conversas.csv'].every((n) => meus.arquivos.some((a) => a.arquivo === n)), meus.arquivos.map((a) => a.arquivo));
  T.ok('o e-mail é o dela', meus.email === L.emails.caixa && meu('login.csv').linhas[0][0] === L.emails.caixa);
  T.ok('os aceites dos Termos e da Política dela', meu('aceites.csv').linhas.length >= 2);
  T.ok('o pet shop em que ela está', meu('pet-shops.csv').linhas.length === 1);
  T.ok('nada das conversas do dono', !JSON.stringify(meus).includes('SEGREDO'));
  const doDono = B.must(await dono.rpc('meus_dados'), 'meus_dados do dono');
  T.ok('o dono recebe a conversa dele', JSON.stringify(doDono).includes(`SEGREDO-${suf}`));
  T.recusa('anônimo não chama', await anon.rpc('meus_dados'));

  // ---------------------------------------------------------------------------------------------------------------
  T.secao('quem saiu da equipe apaga o próprio login');
  T.recusa('quem ainda está numa equipe não apaga o login', await L.sb.monitor.rpc('meu_login_apagar'), /ainda abre um pet shop/);
  T.recusa('o dono não apaga o login com o pet shop aberto', await dono.rpc('meu_login_apagar'), /ainda abre um pet shop/);
  T.recusa('anônimo não chama', await anon.rpc('meu_login_apagar'));
  T.recusa('a equipe Maestro Pet não apaga por aqui', await adm.rpc('meu_login_apagar'), /equipe Maestro/);
  const uidMonitor = B.sql(`select id from auth.users where email = ${B.q(L.emails.monitor)}`);
  B.must(await L.sb.monitor.rpc('equipe_sair', { p_petshop: P }), 'sair da equipe');
  const dadosSaiu = B.must(await L.sb.monitor.rpc('meus_dados'), 'meus_dados de quem saiu');
  T.ok('quem saiu ainda baixa os próprios dados (sem pet shop nenhum)', dadosSaiu.arquivos.find((a) => a.arquivo === 'pet-shops.csv').linhas.length === 0 && dadosSaiu.email === L.emails.monitor);
  const apl = await L.sb.monitor.rpc('meu_login_apagar');
  T.passa('quem saiu pede para apagar o login', apl, apl.data?.ok === true);
  T.ok('o login entra na fila de exclusão', B.num(`select count(*) from logins_lixo where user_id='${uidMonitor}'`) === 1);
  if (svc) {
    const fila = B.must(await svc.rpc('gestao_logins_lixo', { p_limite: 500 }), 'fila');
    T.ok('a faxina recebe este login para apagar', fila.includes(uidMonitor));
    const del = await svc.auth.admin.deleteUser(uidMonitor);
    await svc.rpc('gestao_login_lixo_feito', { p_user: uidMonitor, p_ok: !del.error, p_erro: del.error?.message ?? null });
    T.ok('o login some do Auth e da fila', !del.error && B.num(`select count(*) from auth.users where id='${uidMonitor}'`) === 0 && B.num(`select count(*) from logins_lixo where user_id='${uidMonitor}'`) === 0, del.error?.message);
    T.ok('o nome dela continua no histórico da equipe, sem login', B.sql(`select nome || '|' || coalesce(user_id::text, 'sem') from profissionais where id='${L.ids.monitor}'`) === 'Mário Monitor|sem');
  }

  // ---------------------------------------------------------------------------------------------------------------
  T.secao('login com dados em outro produto do mesmo projeto: nunca é apagado');
  const esquema = `zz_outro_${L.suf}`;
  B.sql(`create schema ${esquema}; create table ${esquema}.contas (id bigint generated always as identity primary key, user_id uuid references auth.users (id) on delete cascade, nome text)`);
  T.depois(() => B.sql(`drop schema if exists ${esquema} cascade`));
  const uidTosador = B.sql(`select id from auth.users where email = ${B.q(L.emails.tosador)}`);
  const uidCaixa = B.sql(`select id from auth.users where email = ${B.q(L.emails.caixa)}`);
  T.ok('login só do Gestão: nada fora', B.sql(`select coalesce(public.login_fora_do_gestao('${uidTosador}'), 'nada')`) === 'nada');
  B.sql(`insert into ${esquema}.contas (user_id, nome) values ('${uidTosador}', 'conta no outro produto')`);
  T.ok('com uma linha em tabela de outro produto: acusa (pela chave estrangeira, no catálogo)', B.sql(`select public.login_fora_do_gestao('${uidTosador}')`) === `tem dados em ${esquema}.contas`,
    B.sql(`select public.login_fora_do_gestao('${uidTosador}')`));
  T.ok('login que não foi criado pelo Gestão: também fica', /não foi criado/.test(B.sql(`select public.login_fora_do_gestao('${B.uuid()}')`)));
  T.recusa('ninguém chama a conferência direto', await dono.rpc('login_fora_do_gestao', { p_user: uidTosador }));
  // toda tabela que aponta para o login e não sai com o pet shop precisa estar na lista do Gestão (senão o login nunca é apagado)
  const fora = B.sql(`select coalesce(string_agg(distinct c.conrelid::regclass::text, ', '), '') from pg_constraint c join pg_class k on k.oid = c.conrelid join pg_namespace n on n.oid = k.relnamespace
    where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and n.nspname = 'public' and not (c.conrelid = any (public.gestao_tabelas()))`);
  T.ok('toda tabela do Gestão que guarda login está em gestao_tabelas() (tabela nova: acrescente na lista da função)', fora === '', fora);
  // sair da equipe e pedir para apagar: o login fica, anotado para a equipe
  B.must(await L.sb.tosador.rpc('equipe_sair', { p_petshop: P }), 'tosador sai');
  const naoApaga = await L.sb.tosador.rpc('meu_login_apagar');
  T.ok('quem tem dados no outro produto pede para apagar: não entra na fila, e a resposta diz por quê', !naoApaga.error && naoApaga.data.ok === false && naoApaga.data.motivo === 'outro_produto'
    && B.num(`select count(*) from logins_lixo where user_id='${uidTosador}'`) === 0, naoApaga.error?.message ?? naoApaga.data);
  T.ok('fica anotado para a equipe', /pediu para apagar o login: tem dados em/.test(B.sql(`select motivo from logins_mantidos where user_id='${uidTosador}'`)));
  const mant = B.must(await adm.rpc('admin_logins_mantidos'), 'admin_logins_mantidos');
  T.ok('a equipe vê o login que ficou, com o e-mail e o motivo', mant.some((x) => x.user_id === uidTosador && x.email === L.emails.tosador && /tem dados em/.test(x.motivo)));
  T.recusa('o dono não vê essa lista', await dono.rpc('admin_logins_mantidos'));
  // um login posto na fila à mão (ou por uma versão antiga) também não sai
  B.sql(`insert into logins_lixo (user_id, petshop_id) values ('${uidTosador}', null) on conflict do nothing`);
  if (svc) {
    const fila = B.must(await svc.rpc('gestao_logins_lixo', { p_limite: 500 }), 'fila');
    T.ok('a fila não devolve esse login e o tira dela', !fila.includes(uidTosador) && B.num(`select count(*) from logins_lixo where user_id='${uidTosador}'`) === 0);

    T.secao('apagar a conta inteira: o login com dados fora fica; o outro sai');
    const Z = await criarLoja(T, { nome: 'LGPD rodada9 apagar' });
    const nomeZ = B.sql(`select nome from petshops where id='${Z.P}'`);
    const zDono = B.sql(`select id from auth.users where email = ${B.q(Z.emails.dono)}`), zCaixa = B.sql(`select id from auth.users where email = ${B.q(Z.emails.caixa)}`);
    const zTosador = B.sql(`select id from auth.users where email = ${B.q(Z.emails.tosador)}`);
    B.sql(`insert into ${esquema}.contas (user_id, nome) values ('${zCaixa}', 'usa o outro produto')`);
    B.must(await Z.sb.dono.rpc('conta_exclusao_pedir', { p_petshop: Z.P, p_nome: nomeZ }), 'pedir a exclusão');
    B.sql(`update exclusoes_conta set apagar_em = now() - interval '1 minute' where petshop_id='${Z.P}'`);
    const fx = await F.faxinaGeral(svc, Z.P);
    T.ok('o pet shop foi apagado', fx.contas === 1 && B.num(`select count(*) from petshops where id='${Z.P}'`) === 0, fx);
    T.ok('o login que tem dados no outro produto continua no Auth', B.num(`select count(*) from auth.users where id='${zCaixa}'`) === 1);
    T.ok('… com os dados dele no outro produto intactos', B.num(`select count(*) from ${esquema}.contas where user_id='${zCaixa}'`) === 1);
    T.ok('… e anotado para a equipe', /tem dados em/.test(B.sql(`select motivo from logins_mantidos where user_id='${zCaixa}'`)));
    T.ok('os logins só do Gestão (dono e tosador) saíram', B.num(`select count(*) from auth.users where id in ('${zDono}', '${zTosador}')`) === 0,
      B.sql(`select string_agg(email, ',') from auth.users where id in ('${zDono}', '${zTosador}')`));
    T.depois(() => B.sql(`delete from logins_mantidos where user_id in ('${zCaixa}', '${uidTosador}')`));
    T.depois(async () => { await svc.auth.admin.deleteUser(zCaixa).catch(() => null); });
  } else T.ok('sem a chave de serviço local: exclusão de verdade não conferida', true);
  void uidCaixa;

  // ---------------------------------------------------------------------------------------------------------------
  if (await B.servidorNoAr()) {
    T.secao('rota do servidor: apagar o meu login');
    const sem = await fetch(`${B.BASE_URL}/api/gestao/minha-conta/apagar`, { method: 'POST' });
    T.ok('sem login: recusa', sem.status === 401, sem.status);
    const tk = (await L.sb.caixa.auth.getSession()).data.session.access_token;
    const naEquipe = await fetch(`${B.BASE_URL}/api/gestao/minha-conta/apagar`, { method: 'POST', headers: { authorization: `Bearer ${tk}` } });
    const corpo = await naEquipe.json().catch(() => ({}));
    T.ok('quem ainda está numa equipe: recusa com a frase', naEquipe.status === 409 && /ainda abre um pet shop/.test(corpo.mensagem ?? ''), [naEquipe.status, corpo]);
    T.ok('… e o login continua', B.num(`select count(*) from auth.users where id='${uidCaixa}'`) === 1 && B.num(`select count(*) from logins_lixo where user_id='${uidCaixa}'`) === 0);
  } else T.ok('servidor fora do ar: rota não conferida', true);
}))();
