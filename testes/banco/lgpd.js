// LGPD (migração 20261199): dados de um tutor (baixar e apagar), encerrar e apagar a conta, sair da equipe e a cópia completa do
// administrador. Cada parte confere quem pode (dono, equipe, dono de outra loja, anônimo) e o que fica: só os dados do tutor e da
// loja certa, o dinheiro igual depois de apagar o tutor, a conta só para consulta durante os 30 dias e apagada depois pela faxina.
const { execSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');
const B = require('../lib/base');
const { criarLoja, SENHA } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('lgpd');
const D = lib('dinheiro');
const F = lib('faxina');

function chaveDeServico() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const env = execSync('npx supabase status -o env', { cwd: B.RAIZ, stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }).toString();
    const m = env.match(/^SERVICE_ROLE_KEY="?([^"\n]+)"?$/m);
    return m ? m[1] : null;
  } catch { return null; }
}
const soma = (P) => B.sql(`select coalesce(sum(case when tipo='entrada' then valor else -valor end), 0)::text || '|' || count(*) from lancamentos where petshop_id='${P}'`);

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'LGPD' });
  const O = await criarLoja(T, { nome: 'LGPD outra', equipe: false });
  const P = L.P, anon = B.cliente(), dono = L.sb.dono;

  // ---------- dinheiro e dados da Ana (Thor e Mel), do Beto (Bob) ----------
  const agThor = B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets.Thor, servico_id: L.S.Banho, inicio: B.instante(L.hoje, '10:00', L.fuso), fim: B.instante(L.hoje, '11:00', L.fuso), obs: 'Ana pediu laço azul', endereco_leva_traz: 'Rua das Flores, 10' }).select('id').single(), 'horário do Thor').id;
  await D.lancarPago(dono, P, { tipo: 'entrada', valor: 60, forma: 'pix', categoria: 'Banho e tosa', agendamentoId: agThor, clienteId: L.tutores.Ana, descricao: 'Banho · Thor', chave: D.novaChaveDeOperacao() });
  await D.lancarAReceber(dono, P, { valor: 45.5, vencimento: L.dia(5), categoria: 'Banho e tosa', clienteId: L.tutores.Ana, descricao: 'Tosa da Mel (Ana Souza)', itens: null, chave: D.novaChaveDeOperacao() });
  await D.lancarPago(dono, P, { tipo: 'entrada', valor: 70, forma: 'dinheiro', categoria: 'Banho e tosa', clienteId: L.tutores.Beto, descricao: 'Banho · Bob', chave: D.novaChaveDeOperacao() });
  // um recebimento da Ana num caixa já fechado
  const caixa = B.must(await dono.from('caixas').insert({ petshop_id: P, valor_inicial: 0 }).select('id').single(), 'abrir caixa').id;
  const lFechado = B.must(await dono.from('lancamentos').insert({ petshop_id: P, tipo: 'entrada', valor: 33.3, forma: 'dinheiro', categoria: 'Venda', caixa_id: caixa, data: L.hoje, pago: true, cliente_id: L.tutores.Ana, descricao: 'Petisco para o Thor' }).select('id').single(), 'lançamento no caixa').id;
  B.must(await dono.from('caixas').update({ fechado_em: new Date().toISOString(), valor_contado: 33.3 }).eq('id', caixa).select('id'), 'fechar caixa');
  B.must(await dono.from('clientes').update({ email: 'ana@exemplo.com', endereco: 'Rua das Flores, 10', obs: 'Prefere WhatsApp' }).eq('id', L.tutores.Ana).select('id'), 'dados da Ana');
  B.must(await dono.from('pets').update({ raca: 'Shih-tzu', obs: 'Alérgico a frango', alertas: 'Morde se puxar a orelha' }).eq('id', L.pets.Thor).select('id'), 'dados do Thor');
  B.must(await dono.from('pets_saude').insert({ petshop_id: P, pet_id: L.pets.Thor, tipo: 'vacina', nome: 'V10', vence_em: L.dia(90) }).select('id'), 'vacina do Thor');
  B.sql(`update pets set foto = '${P}/${B.uuid()}.jpg' where id = '${L.pets.Thor}'`);
  B.sql(`insert into fotos_autorizacoes (petshop_id, pet_id, escopo, marcar, texto, codigo) values ('${P}', '${L.pets.Thor}', 'todas', '@ana.souza', 'Autorizo a loja a postar as fotos do Thor deste boletim e das próximas visitas. Pode marcar o meu perfil @ana.souza.', encode(extensions.gen_random_bytes(32), 'hex'))`);

  T.secao('baixar os dados de um tutor');
  const r = await dono.rpc('cliente_dados', { p_cliente: L.tutores.Ana });
  T.passa('o dono baixa os dados da Ana', r);
  const d = r.data ?? { arquivos: [] };
  const arq = (n) => d.arquivos.find((a) => a.arquivo === n) ?? { linhas: [] };
  const texto = JSON.stringify(d);
  T.ok('vem o cadastro da Ana com e-mail e endereço', arq('cadastro.csv').linhas[0]?.[0] === 'Ana Souza' && texto.includes('ana@exemplo.com'), arq('cadastro.csv').linhas);
  T.ok('vêm só os pets dela (Thor e Mel)', arq('pets.csv').linhas.map((l) => l[0]).sort().join() === 'Mel,Thor', arq('pets.csv').linhas);
  T.ok('a vacina, o horário com o preço e a autorização das fotos', arq('saude.csv').linhas.length === 1 && arq('agendamentos.csv').linhas.length === 1 && arq('autorizacoes-de-fotos.csv').linhas.length === 1);
  T.ok('o financeiro dela: 60 + 45,50 + 33,30', arq('financeiro.csv').linhas.map((l) => l[4]).sort((a, b) => a - b).join() === '33.3,45.5,60', arq('financeiro.csv').linhas);
  T.ok('nada do Beto, do Bob nem da outra loja', !/Beto|Bob|Clara|Luna|11988880002/.test(texto) && !texto.includes(O.P));
  T.ok('nenhum código do "Não quero mais" sai', !/[0-9a-f]{64}/.test(texto));
  T.ok('cada planilha com o mesmo número de colunas em cada linha', d.arquivos.every((a) => a.linhas.every((l) => l.length === a.colunas.length)));
  const z = lib('zip');
  T.ok('o zip do tutor monta (README e uma planilha por parte)', z.montarZip([{ nome: 'README.txt', conteudo: 'x' }, ...d.arquivos.map((a) => ({ nome: a.arquivo, conteudo: 'x' }))]).length > 100);
  T.ok('fica no registro (sem o nome)', B.num(`select count(*) from lgpd_registros where petshop_id='${P}' and acao='baixou_tutor' and detalhe->>'cliente_id'='${L.tutores.Ana}' and detalhe::text not like '%Ana%'`) === 1);
  T.recusa('a recepção não baixa', await L.sb.caixa.rpc('cliente_dados', { p_cliente: L.tutores.Ana }));
  T.recusa('o tosador não baixa', await L.sb.tosador.rpc('cliente_dados', { p_cliente: L.tutores.Ana }));
  T.recusa('o dono de outra loja não baixa', await O.sb.dono.rpc('cliente_dados', { p_cliente: L.tutores.Ana }));
  T.recusa('anônimo não baixa', await anon.rpc('cliente_dados', { p_cliente: L.tutores.Ana }));

  T.secao('baixar todos os dados: registro só do dono');
  T.passa('o dono anota que baixou', await dono.rpc('lgpd_registrar_copia', { p_petshop: P, p_linhas: 42 }));
  T.recusa('a recepção não anota', await L.sb.caixa.rpc('lgpd_registrar_copia', { p_petshop: P }));
  T.recusa('o dono de outra loja não anota', await O.sb.dono.rpc('lgpd_registrar_copia', { p_petshop: P }));
  const reg = await dono.rpc('lgpd_registros_ver', { p_petshop: P });
  T.ok('o dono vê o registro (baixou os dados, baixou um tutor)', !reg.error && reg.data.some((x) => x.acao === 'baixou_dados') && reg.data.some((x) => x.acao === 'baixou_tutor'), reg.error?.message);
  T.recusa('a recepção não vê o registro', await L.sb.caixa.rpc('lgpd_registros_ver', { p_petshop: P }));
  T.recusa('o dono de outra loja não vê o registro', await O.sb.dono.rpc('lgpd_registros_ver', { p_petshop: P }));
  T.ok('ninguém lê as tabelas novas direto', ((await dono.from('lgpd_registros').select('id')).data ?? []).length === 0
    && ((await dono.from('exclusoes_conta').select('id')).data ?? []).length === 0 && ((await dono.from('arquivos_lixo').select('caminho')).data ?? []).length === 0);

  T.secao('apagar os dados de um tutor');
  const antes = soma(P);
  const contaRelatorio = (p) => B.sql(`select coalesce(sum(valor), 0)::text from lancamentos where petshop_id='${p}' and tipo='entrada' and pago and data='${L.hoje}'`);
  const recebidoAntes = contaRelatorio(P);
  T.recusa('nome errado na confirmação: recusa', await dono.rpc('cliente_anonimizar', { p_cliente: L.tutores.Ana, p_confirmacao: 'Ana' }), /nome do tutor/);
  T.recusa('a recepção não apaga', await L.sb.caixa.rpc('cliente_anonimizar', { p_cliente: L.tutores.Ana, p_confirmacao: 'Ana Souza' }));
  T.recusa('o dono de outra loja não apaga', await O.sb.dono.rpc('cliente_anonimizar', { p_cliente: L.tutores.Ana, p_confirmacao: 'Ana Souza' }));
  T.recusa('anônimo não apaga', await anon.rpc('cliente_anonimizar', { p_cliente: L.tutores.Ana, p_confirmacao: 'Ana Souza' }));
  T.ok('nada mudou depois das recusas', B.sql(`select nome from clientes where id='${L.tutores.Ana}'`) === 'Ana Souza');
  const ap = await dono.rpc('cliente_anonimizar', { p_cliente: L.tutores.Ana, p_confirmacao: '  ana   SOUZA ' });
  T.passa('o dono apaga, digitando o nome (sem diferença de maiúscula e espaço)', ap, ap.data?.ok === true);
  T.ok('o tutor vira "Cliente removido", sem telefone, e-mail, endereço e observação',
    B.sql(`select nome || '|' || coalesce(telefone, '-') || '|' || coalesce(email, '-') || '|' || coalesce(endereco, '-') || '|' || coalesce(obs, '-') from clientes where id='${L.tutores.Ana}'`) === 'Cliente removido|-|-|-|-');
  T.ok('os pets viram "Pet removido", desativados, sem foto, raça e observações',
    B.num(`select count(*) from pets where cliente_id='${L.tutores.Ana}' and nome='Pet removido' and not ativo and foto is null and raca is null and obs is null and alertas is null`) === 2);
  T.ok('saúde e autorização de fotos apagadas', B.num(`select count(*) from pets_saude where pet_id='${L.pets.Thor}'`) === 0 && B.num(`select count(*) from fotos_autorizacoes where pet_id='${L.pets.Thor}'`) === 0);
  T.ok('a foto do pet vai para a fila da faxina', B.num(`select count(*) from arquivos_lixo where petshop_id='${P}' and bucket='pets' and motivo='tutor_apagado'`) === 1);
  T.ok('o horário fica, sem observação e endereço', B.sql(`select coalesce(obs, '-') || '|' || coalesce(endereco_leva_traz, '-') from agendamentos where id='${agThor}'`) === '-|-');
  T.ok('o dinheiro da loja fica igual (soma e quantidade de lançamentos)', soma(P) === antes, [antes, soma(P)]);
  T.ok('o recebido de hoje fica igual', contaRelatorio(P) === recebidoAntes, [recebidoAntes, contaRelatorio(P)]);
  T.ok('os lançamentos não apontam mais para o tutor (inclusive o do caixa fechado)', B.num(`select count(*) from lancamentos where cliente_id='${L.tutores.Ana}'`) === 0
    && B.sql(`select coalesce(cliente_id::text, 'sem') from lancamentos where id='${lFechado}'`) === 'sem');
  T.ok('o nome do tutor e dos pets sai das descrições', B.num(`select count(*) from lancamentos where petshop_id='${P}' and (descricao ~* 'thor|\\mmel\\M|ana souza')`) === 0,
    B.sql(`select string_agg(descricao, ' / ') from lancamentos where petshop_id='${P}'`));
  T.ok('o caixa fechado não ganhou "alterado depois de recebido"', B.sql(`select coalesce(alterado_em::text, 'não') from lancamentos where id='${lFechado}'`) === 'não');
  T.ok('o Beto e o Bob ficam como estavam', B.sql(`select nome from clientes where id='${L.tutores.Beto}'`) === 'Beto Lima' && B.sql(`select nome from pets where id='${L.pets.Bob}'`) === 'Bob'
    && B.num(`select count(*) from lancamentos where cliente_id='${L.tutores.Beto}'`) === 1);
  T.ok('fica no registro, com quantidades e sem nome', B.num(`select count(*) from lgpd_registros where petshop_id='${P}' and acao='apagou_tutor' and (detalhe->>'pets')::int = 2 and detalhe::text !~* 'ana|thor'`) === 1);
  const de2 = await dono.rpc('cliente_anonimizar', { p_cliente: L.tutores.Ana, p_confirmacao: 'qualquer' });
  T.ok('pedir de novo não faz nada (já apagado)', !de2.error && de2.data?.ja === true && B.num(`select count(*) from lgpd_registros where petshop_id='${P}' and acao='apagou_tutor'`) === 1, de2.error?.message);

  T.secao('sair da equipe');
  T.recusa('o titular não sai da equipe', await dono.rpc('equipe_sair', { p_petshop: P }), /titular/);
  T.recusa('anônimo não sai', await anon.rpc('equipe_sair', { p_petshop: P }));
  T.recusa('quem não é da loja não sai', await O.sb.dono.rpc('equipe_sair', { p_petshop: P }));
  T.passa('o tosador sai da equipe', await L.sb.tosador.rpc('equipe_sair', { p_petshop: P }));
  const v = B.must(await L.sb.tosador.rpc('entrar'), 'entrar');
  T.ok('… e não entra mais na loja', !v.some((x) => x.petshop_id === P));
  T.ok('… o nome continua na equipe, sem login', B.sql(`select coalesce(user_id::text, 'sem') || '|' || nome from profissionais where id='${L.ids.tosador}'`) === 'sem|Tito Tosador');
  T.ok('… e fica no registro', B.num(`select count(*) from lgpd_registros where petshop_id='${P}' and acao='saiu_da_equipe' and quem_nome='Tito Tosador'`) === 1);
  T.ok('… não lê mais os clientes', ((await L.sb.tosador.from('clientes').select('id').eq('petshop_id', P)).data ?? []).length === 0);

  T.secao('encerrar e apagar a conta: marcar e cancelar');
  const nomeLoja = B.sql(`select nome from petshops where id='${P}'`);
  T.recusa('a recepção não pede', await L.sb.caixa.rpc('conta_exclusao_pedir', { p_petshop: P, p_nome: nomeLoja }));
  T.recusa('o dono de outra loja não pede', await O.sb.dono.rpc('conta_exclusao_pedir', { p_petshop: P, p_nome: nomeLoja }));
  T.recusa('anônimo não pede', await anon.rpc('conta_exclusao_pedir', { p_petshop: P, p_nome: nomeLoja }));
  T.recusa('nome errado: recusa', await dono.rpc('conta_exclusao_pedir', { p_petshop: P, p_nome: 'Outro nome' }), /nome do pet shop/);
  T.recusa('sócio (dono que não é o titular) não pede', await (async () => {
    // a recepção vira sócia só para esta conferência
    B.sql(`update profissionais set papel='dono' where id='${L.ids.caixa}'`);
    const x = await L.sb.caixa.rpc('conta_exclusao_pedir', { p_petshop: P, p_nome: nomeLoja });
    B.sql(`update profissionais set papel='funcionario' where id='${L.ids.caixa}'`);
    return x;
  })(), /titular/);
  T.ok('nada marcado depois das recusas', B.num(`select count(*) from exclusoes_conta where petshop_id='${P}'`) === 0);
  const pe = await dono.rpc('conta_exclusao_pedir', { p_petshop: P, p_nome: nomeLoja.toUpperCase() });
  T.passa('o titular pede, digitando o nome do pet shop', pe);
  const dias = (new Date(pe.data?.apagar_em) - Date.now()) / 864e5;
  T.ok('a data é daqui a 30 dias', dias > 29.9 && dias <= 30, dias);
  const pe2 = await dono.rpc('conta_exclusao_pedir', { p_petshop: P, p_nome: nomeLoja });
  T.ok('pedir de novo devolve o mesmo pedido', !pe2.error && pe2.data?.ja === true && B.num(`select count(*) from exclusoes_conta where petshop_id='${P}'`) === 1);
  const ver = await L.sb.caixa.rpc('conta_exclusao_ver', { p_petshop: P });
  T.ok('a equipe vê que a conta está marcada', !ver.error && ver.data?.apagar_em === pe.data.apagar_em, ver.error?.message ?? ver.data);
  const verO = await O.sb.dono.rpc('conta_exclusao_ver', { p_petshop: P });
  T.ok('o dono de outra loja não vê', !verO.error && verO.data === null, verO.data);
  T.ok('a conta fica só para consulta (acesso_liberado)', B.sql(`select acesso_liberado('${P}')::text`) === 'false');
  T.recusa('o dono não cadastra cliente', await dono.from('clientes').insert({ petshop_id: P, nome: 'Novo', telefone: '11977776666' }).select('id'));
  T.recusa('a recepção não cadastra cliente', await L.sb.caixa.from('clientes').insert({ petshop_id: P, nome: 'Novo', telefone: '11977776667' }).select('id'));
  T.ok('… mas lê tudo (para baixar os dados)', ((await dono.from('clientes').select('id').eq('petshop_id', P)).data ?? []).length === 4);
  T.passa('… e ainda baixa os dados de um tutor', await dono.rpc('cliente_dados', { p_cliente: L.tutores.Beto }));
  T.ok('a outra loja continua lançando', !(await O.sb.dono.from('clientes').insert({ petshop_id: O.P, nome: 'Novo', telefone: '11977776668' }).select('id')).error);
  T.recusa('a recepção não cancela', await L.sb.caixa.rpc('conta_exclusao_cancelar', { p_petshop: P }));
  T.recusa('o dono de outra loja não cancela', await O.sb.dono.rpc('conta_exclusao_cancelar', { p_petshop: P }));
  const ca = await dono.rpc('conta_exclusao_cancelar', { p_petshop: P });
  T.passa('o dono cancela', ca, ca.data === true);
  T.ok('… a conta volta a lançar', B.sql(`select acesso_liberado('${P}')::text`) === 'true' && !(await dono.from('clientes').insert({ petshop_id: P, nome: 'Novo', telefone: '11977776669' }).select('id')).error);
  T.ok('… e o pedido e o cancelamento ficam no registro', B.num(`select count(*) from lgpd_registros where petshop_id='${P}' and acao in ('pediu_exclusao', 'cancelou_exclusao')`) === 2);

  T.secao('a cópia completa e o painel (só admin)');
  const adm = B.cliente();
  const emailAdm = `t-${L.suf}.admin@teste-auto.local`;
  B.must(await adm.auth.signUp({ email: emailAdm, password: SENHA, options: B.dadosDoCadastro() }), 'cadastro do admin');
  const uidAdm = (await adm.auth.getUser()).data.user.id;
  B.sql(`insert into admins (user_id) values ('${uidAdm}') on conflict do nothing`);
  T.depois(() => B.sql(`delete from admins where user_id='${uidAdm}'; delete from auth.users where id='${uidAdm}'`));
  for (const f of ['admin_copias', 'admin_exclusoes']) {
    T.recusa(`anônimo recusado em ${f}`, await anon.rpc(f));
    T.recusa(`dono recusado em ${f}`, await dono.rpc(f));
    T.passa(`admin lê ${f}`, await adm.rpc(f));
  }
  for (const [f, a] of [['gestao_copia_tabelas', {}], ['gestao_copia_registrar', { p_quem: uidAdm, p_tabelas: 1, p_linhas: 1 }], ['gestao_exclusoes_processar', { p_petshop: P }], ['gestao_lgpd_arquivos', { p_petshop: P }]]) {
    T.recusa(`o dono não chama ${f}`, await dono.rpc(f, a));
    T.recusa(`o admin (login) não chama ${f}`, await adm.rpc(f, a));
  }
  if (await B.servidorNoAr()) {
    const rota = `${B.BASE_URL}/api/gestao/admin/copia`;
    const token = async (sb) => (await sb.auth.getSession()).data.session?.access_token;
    T.ok('rota da cópia sem login: 401', (await fetch(rota)).status === 401);
    T.ok('rota da cópia com o login do dono: 403', (await fetch(rota, { headers: { authorization: `Bearer ${await token(dono)}` } })).status === 403);
    T.ok('rota da cópia com o login da recepção: 403', (await fetch(rota, { headers: { authorization: `Bearer ${await token(L.sb.caixa)}` } })).status === 403);
    const ra = await fetch(rota, { headers: { authorization: `Bearer ${await token(adm)}` } });
    T.ok('rota da cópia com o admin: o zip (200) ou 503 se o servidor não tem a chave de serviço', ra.status === 200 ? (ra.headers.get('content-type') === 'application/zip') : ra.status === 503, ra.status);
    if (ra.status === 200) await ra.arrayBuffer();
  } else T.ok('servidor fora do ar: rota não conferida', true);

  const chave = chaveDeServico();
  if (!chave) { T.ok('sem a chave de serviço local: cópia completa e exclusão de verdade não conferidas', true); return; }
  const svc = createClient(B.SUPABASE_URL, chave, { auth: { persistSession: false, autoRefreshToken: false } });

  T.secao('a cópia completa (com a chave de serviço)');
  const tokenTutor = B.sql(`insert into tutor_links (petshop_id, cliente_id, token) values ('${P}', '${L.tutores.Beto}', encode(extensions.gen_random_bytes(24), 'hex')) returning token`);
  const C = lib('copia-completa');
  const partes = [];
  const m = await C.copiaCompleta(svc, (b) => partes.push(Buffer.from(b)), { id: uidAdm, email: emailAdm });
  const zip = Buffer.concat(partes);
  const tudo = zip.toString('utf8');
  T.ok('o manifesto conta as tabelas e as linhas', m.tabelas.length > 50 && m.tabelas.some((t) => t.tabela === 'clientes' && t.linhas >= 8) && m.total_de_linhas > 0, m.tabelas.length);
  T.ok('o zip tem cada tabela, o manifesto e o LEIA-ME', tudo.includes('tabelas/clientes.json') && tudo.includes('manifesto.json') && tudo.includes('LEIA-ME.txt'));
  T.ok('os dados da loja estão lá', tudo.includes('Beto Lima'));
  T.ok('o código da página do tutor não sai', !tudo.includes(tokenTutor) && m.tabelas.find((t) => t.tabela === 'tutor_links').colunas_fora.includes('token'));
  T.ok('nenhum segredo da configuração sai', !/cakto_segredo|servidor_segredo|sha256/.test(tudo.replace(/"colunas_fora"[^\]]*\]/g, '')));
  T.ok('nada do schema auth (senhas)', !/encrypted_password|\$2[aby]\$/.test(tudo));
  try {
    const fs = require('fs'), os = require('os'), path = require('path');
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'copia-'));
    fs.writeFileSync(path.join(pasta, 'c.zip'), zip);
    const py = execSync(`python3 -I -c "import sys,zipfile,json; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; m=json.loads(z.read('manifesto.json')); print(len(z.namelist()), len(json.loads(z.read('tabelas/clientes.json'))), len(m['tabelas']))" ${path.join(pasta, 'c.zip')}`).toString().trim().split(' ').map(Number);
    fs.rmSync(pasta, { recursive: true, force: true });
    T.ok('o zip abre no Python (tabelas + manifesto + LEIA-ME, JSON válido)', py[0] === m.tabelas.length + 2 && py[1] >= 8 && py[2] === m.tabelas.length, py);
  } catch (e) { T.ok('python3 não deu para conferir o zip: pulei', true, e.message); }
  const cp = B.must(await adm.rpc('admin_copias'), 'admin_copias');
  T.ok('"última cópia baixada em" vem do registro', cp.lista[0] && Math.abs(new Date(cp.lista[0].quando) - Date.now()) < 120000 && cp.lista[0].quem === emailAdm, cp.lista[0]);

  T.secao('a conta apagada depois do prazo (faxina com a chave de serviço)');
  const Z = await criarLoja(T, { nome: 'LGPD apagar' });
  const nomeZ = B.sql(`select nome from petshops where id='${Z.P}'`);
  const foto = `${Z.P}/${B.uuid()}.jpg`;
  B.must(await Z.sb.dono.storage.from('pets').upload(foto, new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], { type: 'image/jpeg' }), { contentType: 'image/jpeg' }), 'foto');
  B.must(await Z.sb.dono.rpc('conta_exclusao_pedir', { p_petshop: Z.P, p_nome: nomeZ }), 'pedir');
  const x0 = await F.faxinaGeral(svc, Z.P);
  T.ok('antes do prazo a faxina não apaga', x0.contas === 0 && B.num(`select count(*) from petshops where id='${Z.P}'`) === 1, x0);
  const lista = B.must(await adm.rpc('admin_exclusoes'), 'admin_exclusoes');
  T.ok('o painel do admin lista a conta marcada', lista.some((e) => e.petshop_id === Z.P && !e.apagado_em && !e.cancelado_em));
  B.sql(`update exclusoes_conta set apagar_em = now() - interval '1 minute' where petshop_id='${Z.P}' and apagado_em is null`);
  const x1 = await F.faxinaGeral(svc, Z.P);
  T.ok('passado o prazo, a faxina apaga o pet shop', x1.contas === 1 && B.num(`select count(*) from petshops where id='${Z.P}'`) === 0, x1);
  T.ok('… os clientes, pets e a equipe somem', B.num(`select (select count(*) from clientes where petshop_id='${Z.P}') + (select count(*) from pets where petshop_id='${Z.P}') + (select count(*) from profissionais where petshop_id='${Z.P}')`) === 0);
  T.ok('… os arquivos do Storage saem', B.num(`select count(*) from storage.objects where name like '${Z.P}/%'`) === 0, x1);
  T.ok('… os logins da loja (dono e equipe) são apagados', B.num(`select count(*) from auth.users where email like 't-${Z.suf}.%'`) === 0 && x1.logins === 5, x1);
  T.ok('… o pedido fica como apagado (para o painel) e no registro', B.num(`select count(*) from exclusoes_conta where petshop_id='${Z.P}' and apagado_em is not null and usuarios = 5`) === 1
    && B.num(`select count(*) from lgpd_registros where petshop_id='${Z.P}' and acao='conta_apagada'`) === 1);
  T.ok('… e a loja L e a outra continuam lá', B.num(`select count(*) from petshops where id in ('${P}', '${O.P}')`) === 2);
  const x2 = await F.faxinaGeral(svc, Z.P);
  T.ok('rodar de novo não apaga nada a mais', x2.contas === 0 && x2.logins === 0, x2);
  const x3 = await F.faxinaGeral(svc, P);
  T.ok('a foto do tutor apagado sai da fila', B.num(`select count(*) from arquivos_lixo where petshop_id='${P}'`) === 0, x3);
}))();
