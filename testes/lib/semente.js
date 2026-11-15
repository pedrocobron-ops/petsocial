// Cria um pet shop novo, só deste teste, pela API de verdade (cadastro + criar_petshop + convites), com sufixo único.
// Nada depende de lojas antigas de teste. No fim, `L.limpar()` apaga a loja e os logins (MANTER_DADOS=1 guarda para olhar).
//
//   const L = await criarLoja(T, { nome: 'Dinheiro' });
//   L.P (id do pet shop), L.sb.dono / caixa / monitor / tosador / estoque (clientes já logados), L.emails, L.senha,
//   L.ids (profissionais), L.S (serviços por nome), L.tutores / L.pets (por nome), L.prod (produto), L.codigo (link), L.fuso, L.hoje
const B = require('./base');

const SENHA = 'Teste#Auto2026';
const DOMINIO = 'teste-auto.local';
// todo dia aberto das 07:00 às 20:00: nenhum teste depende do dia da semana em que roda
const HORARIO = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), { abre: '07:00', fecha: '20:00' }]));

const EQUIPE = {
  caixa: { nome: 'Rita Recepção', funcao: 'Recepção', acessos: ['agenda', 'clientes', 'creche_hotel', 'pacotes', 'caixa'], ve: true },
  monitor: { nome: 'Mário Monitor', funcao: 'Monitor(a) de creche', acessos: ['clientes', 'creche_hotel'], ve: false },
  tosador: { nome: 'Tito Tosador', funcao: 'Banhista e tosador(a)', acessos: ['agenda', 'clientes'], ve: false, atende: true },
  estoque: { nome: 'Edu Estoque', funcao: 'Estoque', acessos: ['estoque'], ve: false },
};
const PRECOS = {
  Banho: [50, 60, 70, 80, 60],
  'Hidratação': [25, 30, 35, 40, 30],
  'Corte de unhas': [15, 15, 15, 15, 15],
  'Banho e tosa': [80, 90, 100, 120, 90],
};
const TUTORES = [
  ['Ana Souza', '11988880001', [['Thor', 'M'], ['Mel', 'P']]],
  ['Beto Lima', '11988880002', [['Bob', 'G']]],
  ['Clara Dias', '11988880003', [['Luna', 'M']]],
  ['Davi Reis', '11988880004', [['Rex', 'GG']]],
];

async function cadastrar(email) {
  const sb = B.cliente();
  const r = await sb.auth.signUp({ email, password: SENHA });
  if (r.error) throw new Error(`cadastro ${email}: ${r.error.message}`);
  if (!r.data.session) B.must(await sb.auth.signInWithPassword({ email, password: SENHA }), 'login ' + email);
  return sb;
}

/** Entra de novo com um e-mail da loja (cliente novo, sessão própria). */
async function logar(email) {
  const sb = B.cliente();
  B.must(await sb.auth.signInWithPassword({ email, password: SENHA }), 'login ' + email);
  return sb;
}

async function criarLoja(T, o = {}) {
  const suf = B.sufixo();
  const mail = (q) => `t-${suf}.${q}@${DOMINIO}`;
  const L = { suf, senha: SENHA, emails: { dono: mail('dono') }, sb: {}, ids: {}, S: {}, tutores: {}, pets: {}, petsDe: {} };
  const modulos = o.modulos ?? ['banho_tosa', 'creche', 'hotel', 'loja'];

  L.sb.dono = await cadastrar(L.emails.dono);
  B.must(await L.sb.dono.rpc('criar_petshop', { p_nome: `${o.nome ?? 'Teste'} ${suf}`, p_seu_nome: 'Dona Teste', p_telefone: '11999990000', p_cidade: 'São Paulo', p_uf: 'SP', p_modulos: modulos, p_principal: modulos[0] }), 'criar_petshop');
  L.P = B.must(await L.sb.dono.rpc('entrar'), 'entrar')[0].petshop_id;
  if (T && !process.env.MANTER_DADOS) T.depois(() => limpar(L));
  L.limpar = () => limpar(L);
  L.ids.dono = B.sql(`select id from profissionais where petshop_id='${L.P}' and papel='dono'`);
  B.must(await L.sb.dono.from('petshops').update({ guia_feito_em: new Date().toISOString(), diaria_creche: 70, diaria_hotel: 120, horario: HORARIO, link_ativo: true, link_hotel: true, link_creche: true, vagas_creche: 20, vagas_hotel: 20 }).eq('id', L.P).select('id'), 'ajustes do pet shop');
  const ps = B.sql(`select fuso || '|' || link_codigo from petshops where id='${L.P}'`).split('|');
  L.fuso = ps[0]; L.codigo = ps[1];
  L.hoje = B.hojeNo(L.fuso);
  L.dia = (n) => B.somaDias(L.hoje, n);
  L.mes1 = L.hoje.slice(0, 8) + '01';
  L.mesAnterior = B.somaDias(L.mes1, -1).slice(0, 8) + '01';

  // serviços (os que criar_petshop já deixa) com preço por porte
  const servs = B.must(await L.sb.dono.from('servicos').select('id, nome').eq('petshop_id', L.P), 'serviços');
  for (const s of servs) L.S[s.nome] = s.id;
  for (const [nome, [p, m, g, gg]] of Object.entries(PRECOS)) {
    if (!L.S[nome]) L.S[nome] = B.must(await L.sb.dono.from('servicos').insert({ petshop_id: L.P, nome, categoria: 'outro', duracao_min: 30 }).select('id').single(), 'serviço ' + nome).id;
    B.must(await L.sb.dono.from('servicos').update({ preco_p: p, preco_m: m, preco_g: g, preco_gg: gg, ativo: true }).eq('id', L.S[nome]).select('id'), 'preço ' + nome);
  }
  L.preco = (servico, porte) => PRECOS[servico][{ P: 0, M: 1, G: 2, GG: 3 }[porte] ?? 4];

  // equipe: convite pelo e-mail e cadastro de cada um (o convite liga o login à loja)
  if (o.equipe !== false) {
    for (const [papel, e] of Object.entries(EQUIPE)) {
      L.emails[papel] = mail(papel);
      L.ids[papel] = B.must(await L.sb.dono.from('profissionais').insert({ petshop_id: L.P, nome: e.nome, email_convite: L.emails[papel], acessos: e.acessos, ve_financeiro: e.ve, funcao: e.funcao, papel: 'funcionario', atende: !!e.atende }).select('id').single(), 'convite ' + papel).id;
      L.sb[papel] = await cadastrar(L.emails[papel]);
      const v = B.must(await L.sb[papel].rpc('entrar'), 'entrar ' + papel);
      if (!v.some((x) => x.petshop_id === L.P)) throw new Error('o convite não ligou ' + papel);
    }
    B.must(await L.sb.dono.from('profissionais').update({ comissao_pct: 40 }).eq('id', L.ids.tosador).select('id'), 'comissão do tosador');
  }

  // clientes e pets
  if (o.dados !== false) {
    for (const [nome, tel, pets] of TUTORES) {
      const c = B.must(await L.sb.dono.from('clientes').insert({ petshop_id: L.P, nome, telefone: tel }).select('id').single(), 'cliente ' + nome).id;
      L.tutores[nome.split(' ')[0]] = c;
      for (const [pet, porte] of pets) {
        L.pets[pet] = B.must(await L.sb.dono.from('pets').insert({ petshop_id: L.P, cliente_id: c, nome: pet, especie: 'cao', porte }).select('id').single(), 'pet ' + pet).id;
        L.petsDe[pet] = c;
      }
    }
    L.prod = B.must(await L.sb.dono.from('produtos').insert({ petshop_id: L.P, nome: 'Shampoo Neutro', unidade: 'un', preco_venda: 29.9, custo: 12, estoque: 20, estoque_minimo: 2 }).select('id').single(), 'produto').id;
  }
  return L;
}

// Apaga as linhas de uma loja em todas as tabelas com petshop_id, sem gatilhos nem conferência de chave estrangeira
// (session_replication_role = replica): as travas do dinheiro (caixa fechado, valores guardados) não deixam apagar de outro jeito,
// e a ordem das cascatas de petshops esbarra em chaves compostas. Só para lojas de teste.
const APAGAR_LOJAS = (ids) => `
  set session_replication_role = replica;
  do $$ declare r record; begin
    for r in select c.table_name from information_schema.columns c join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
             where c.table_schema = 'public' and c.column_name = 'petshop_id' and t.table_type = 'BASE TABLE' loop
      execute format('delete from public.%I where petshop_id = any (%L::uuid[])', r.table_name, ${ids});
    end loop;
    delete from public.petshops where id = any (${ids}::uuid[]);
  end $$;
  set session_replication_role = origin;`;

/** Apaga a loja, os logins e as fotos. */
function limpar(L) {
  if (!L || !L.P) return;
  B.sql(APAGAR_LOJAS(`'{${L.P}}'`) + `delete from auth.users where email like 't-${L.suf}.%@${DOMINIO}';`);
  try { B.sql(`delete from storage.objects where name like '${L.P}/%'`); } catch { /* o storage pode proibir apagar direto; os arquivos ficam órfãos no disco de teste */ }
}

/** Apaga tudo que os testes automáticos deixaram (lojas cujo dono tem e-mail @teste-auto.local). */
function limparTudo() {
  const ids = B.sql(`select coalesce(array_agg(distinct p.petshop_id)::text, '{}') from profissionais p join auth.users u on u.id = p.user_id where u.email like '%@${DOMINIO}' and p.papel = 'dono'`);
  const lojas = ids === '{}' ? 0 : ids.split(',').length;
  if (lojas) B.sql(APAGAR_LOJAS(`'${ids}'`));
  const u = B.sql(`with a as (delete from auth.users where email like '%@${DOMINIO}' returning id) select count(*) from a;`);
  return { lojas, logins: Number(u) };
}

module.exports = { criarLoja, logar, limpar, limparTudo, SENHA, DOMINIO, EQUIPE, PRECOS };
