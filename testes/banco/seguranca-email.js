// Segurança do e-mail (migração 20261209): com "Confirm email" desligado, qualquer um cria conta com qualquer e-mail.
// Nada que dá acesso pode depender só do e-mail da conta:
//   - convite da equipe só entra com o código do link (convite_gerar / convite_aceitar), 7 dias, uso único, e-mail igual;
//     entrar() não liga mais nada pelo e-mail; convite antigo sem código aparece para mandar de novo;
//   - Escola: compra só aparece para quem provou o e-mail com código ou link (email_provar / meu_email);
//   - Cakto: o e-mail do dono só puxa o pagamento se já estava na conta antes da compra; cakto_email não puxa mais.
// O código do e-mail é gerado pela API de administrador do Auth local (generate_link), com uma chave de serviço assinada
// com o segredo do contêiner do Auth (só no Supabase local). A configuração da Cakto é global: guarda e devolve no fim.
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const B = require('../lib/base');
const { criarLoja, SENHA } = require('../lib/semente');
const T = require('../lib/teste')('seguranca-email');

const AUTH_CONTAINER = process.env.AUTH_CONTAINER || B.DB_CONTAINER.replace(/_db_/, '_auth_');

/** Chave de serviço do Supabase local (assinada com o segredo do contêiner do Auth). */
function chaveDeServico() {
  const env = execFileSync('docker', ['inspect', AUTH_CONTAINER, '--format', '{{range .Config.Env}}{{println .}}{{end}}']).toString();
  const segredo = (env.match(/^GOTRUE_JWT_SECRET=(.*)$/m) || [])[1];
  if (!segredo) throw new Error('sem GOTRUE_JWT_SECRET no contêiner ' + AUTH_CONTAINER);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const agora = Math.floor(Date.now() / 1000);
  const corpo = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ role: 'service_role', iss: 'supabase-demo', iat: agora, exp: agora + 3600 });
  return corpo + '.' + crypto.createHmac('sha256', segredo).update(corpo).digest('base64url');
}

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Email seguro', dados: false });
  const O = await criarLoja(T, { nome: 'Email outra', equipe: false, dados: false });
  const anon = B.cliente(), dono = L.sb.dono;
  const mail = (q) => `t-${L.suf}.${q}@teste-auto.local`;
  const SERVICO = chaveDeServico();
  // o teste usa 6 acessos (plano Pet shop no teste): monitor e estoque saem para caberem os três convites daqui
  B.sql(`update profissionais set ativo = false where id in ('${L.ids.monitor}', '${L.ids.estoque}')`);

  /** Cria uma conta com senha (como a tela criar-conta, com "Confirm email" desligado). */
  async function conta(email) {
    const sb = B.cliente();
    B.must(await sb.auth.signUp({ email, password: SENHA, options: B.dadosDoCadastro() }), 'cadastro ' + email);
    if (!(await sb.auth.getSession()).data.session) B.must(await sb.auth.signInWithPassword({ email, password: SENHA }), 'login ' + email);
    return sb;
  }
  /** Código de 6 números mandado para o e-mail (o que o Supabase mandaria pelo signInWithOtp). */
  async function codigoDoEmail(email) {
    const r = await fetch(B.SUPABASE_URL + '/auth/v1/admin/generate_link', {
      method: 'POST', headers: { apikey: B.SUPABASE_KEY, Authorization: 'Bearer ' + SERVICO, 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'magiclink', email }),
    });
    const j = await r.json();
    const otp = j.email_otp ?? j.properties?.email_otp;
    if (!otp) throw new Error('generate_link sem código: ' + JSON.stringify(j).slice(0, 200));
    return otp;
  }
  const uid = async (sb) => (await sb.auth.getUser()).data.user.id;
  const nomeDe = (q) => `Convite ${q}`;
  async function novoConvite(q, email = mail(q)) {
    const id = B.must(await dono.from('profissionais').insert({ petshop_id: L.P, nome: nomeDe(q), email_convite: email, acessos: ['agenda'], funcao: 'Recepção', papel: 'funcionario' }).select('id').single(), 'convite ' + q).id;
    return id;
  }
  const naLoja = async (sb) => (B.must(await sb.rpc('entrar'), 'entrar') ?? []).some((v) => v.petshop_id === L.P);
  const ligado = (id) => B.sql(`select coalesce(user_id::text, 'sem') from profissionais where id='${id}'`);

  // ------------------------------------------------------------------
  T.secao('convite: quem gera o código');
  const idA = await novoConvite('ana');
  T.recusa('anônimo não gera código', await anon.rpc('convite_gerar', { p_profissional: idA }));
  T.recusa('a recepção não gera código', await L.sb.caixa.rpc('convite_gerar', { p_profissional: idA }));
  T.recusa('o dono de outra loja não gera código', await O.sb.dono.rpc('convite_gerar', { p_profissional: idA }));
  T.recusa('quem já tem login não ganha código', await dono.rpc('convite_gerar', { p_profissional: L.ids.caixa }), /já entrou/);
  const r1 = await dono.rpc('convite_gerar', { p_profissional: idA });
  T.passa('o dono gera o código', r1, /^[0-9a-f]{32}$/.test(r1.data ?? ''));
  const codigoA1 = r1.data;
  T.ok('o banco guarda só o hash do código', B.num(`select count(*) from convites_equipe where profissional_id='${idA}' and codigo_hash = encode(extensions.digest('${codigoA1}', 'sha256'), 'hex')`) === 1
    && B.num(`select count(*) from convites_equipe c where c.codigo_hash like '%${codigoA1}%' or c::text like '%${codigoA1}%'`) === 0);
  T.ok('vale por 7 dias', B.sql(`select (expira_em between now() + interval '6 days 23 hours' and now() + interval '7 days 1 minute')::text from convites_equipe where profissional_id='${idA}'`) === 'true');
  for (const [n, c] of [['anônimo', anon], ['recepção', L.sb.caixa]]) {
    const q = await c.from('convites_equipe').select('*').limit(1);
    T.ok(`${n} não lê convites_equipe direto`, !!q.error || !(q.data ?? []).length, q.error?.message);
  }
  const sit = await dono.rpc('convites_situacao', { p: L.P });
  T.passa('o dono vê até quando vale o link', sit, (sit.data ?? []).some((x) => x.profissional_id === idA && !x.usado));
  const sitC = await L.sb.caixa.rpc('convites_situacao', { p: L.P });
  T.ok('a recepção não vê a situação dos convites', !!sitC.error || !(sitC.data ?? []).length);

  T.secao('convite: o atacante com o e-mail do convite, sem código');
  const atacante = await conta(mail('ana'));
  T.ok('criar a conta com o e-mail do convite não entra na equipe (entrar não liga mais pelo e-mail)', !(await naLoja(atacante)) && ligado(idA) === 'sem');
  T.recusa('sem código: recusado', await atacante.rpc('convite_aceitar', { p_codigo: '' }), /não vale/);
  T.recusa('código inventado: recusado', await atacante.rpc('convite_aceitar', { p_codigo: crypto.randomBytes(16).toString('hex') }), /não vale/);
  T.recusa('texto que não é código: recusado', await atacante.rpc('convite_aceitar', { p_codigo: "x' or 1=1 --" }), /não vale/);
  T.ok('… e continua fora da equipe', !(await naLoja(atacante)) && ligado(idA) === 'sem');
  T.recusa('anônimo não aceita convite', await anon.rpc('convite_aceitar', { p_codigo: codigoA1 }));

  T.secao('convite: código certo, outro e-mail');
  const outra = await conta(mail('outra'));
  T.recusa('o código certo com a conta de outro e-mail: recusado', await outra.rpc('convite_aceitar', { p_codigo: codigoA1 }), /outro e-mail/);
  T.ok('… e o código continua valendo para o e-mail do convite', B.num(`select count(*) from convites_equipe where profissional_id='${idA}' and usado_em is null`) === 1);

  T.secao('convite: gerar de novo invalida o anterior');
  const codigoA2 = B.must(await dono.rpc('convite_gerar', { p_profissional: idA }), 'gerar de novo');
  T.ok('código novo, diferente', codigoA2 !== codigoA1);
  T.recusa('o código antigo não vale mais', await atacante.rpc('convite_aceitar', { p_codigo: codigoA1 }), /não vale/);

  T.secao('convite: vencido');
  B.sql(`update convites_equipe set expira_em = now() - interval '1 minute' where profissional_id='${idA}'`);
  T.recusa('código vencido: recusado', await atacante.rpc('convite_aceitar', { p_codigo: codigoA2 }), /venceu/);
  T.ok('… e continua fora', ligado(idA) === 'sem');
  const sitV = B.must(await dono.rpc('convites_situacao', { p: L.P }), 'situação');
  T.ok('a situação mostra o link vencido', sitV.some((x) => x.profissional_id === idA && new Date(x.expira_em) < new Date()));

  T.secao('convite: o código certo entra (uma vez só)');
  const codigoA3 = B.must(await dono.rpc('convite_gerar', { p_profissional: idA }), 'gerar depois de vencer');
  // aqui a dona da conta do e-mail é quem recebeu o link (o "atacante" acima é a mesma conta: o que importa é o código)
  const ana = atacante;
  const ok1 = await ana.rpc('convite_aceitar', { p_codigo: codigoA3.toUpperCase() });
  T.passa('com o código certo, entra na equipe (maiúsculas também)', ok1, ok1.data === L.P);
  T.ok('… ligada à loja', (await naLoja(ana)) && ligado(idA) === (await uid(ana)));
  const de2 = await ana.rpc('convite_aceitar', { p_codigo: codigoA3 });
  T.passa('a mesma pessoa abrindo o link de novo: só confirma', de2, de2.data === L.P);
  T.recusa('outra conta com o código já usado: recusado', await outra.rpc('convite_aceitar', { p_codigo: codigoA3 }), /já foi usado/);
  T.ok('a situação marca o convite como usado', B.must(await dono.rpc('convites_situacao', { p: L.P }), 's').some((x) => x.profissional_id === idA && x.usado));

  T.secao('convite: trocar o e-mail ou tirar o acesso invalida o código');
  const idB = await novoConvite('bia');
  const codigoB = B.must(await dono.rpc('convite_gerar', { p_profissional: idB }), 'código bia');
  B.must(await dono.from('profissionais').update({ email_convite: mail('bia2') }).eq('id', idB).select('id'), 'trocar e-mail');
  T.ok('trocou o e-mail: o código sai', B.num(`select count(*) from convites_equipe where profissional_id='${idB}'`) === 0);
  const bia = await conta(mail('bia'));
  T.recusa('… e o código antigo não entra', await bia.rpc('convite_aceitar', { p_codigo: codigoB }), /não vale/);
  const codigoB2 = B.must(await dono.rpc('convite_gerar', { p_profissional: idB }), 'código bia2');
  B.must(await dono.from('profissionais').update({ email_convite: null }).eq('id', idB).select('id'), 'tirar o acesso');
  T.ok('tirou o acesso: o código sai', B.num(`select count(*) from convites_equipe where profissional_id='${idB}'`) === 0);
  const bia2 = await conta(mail('bia2'));
  T.recusa('… e não entra mais', await bia2.rpc('convite_aceitar', { p_codigo: codigoB2 }), /não vale/);
  T.recusa('sem e-mail no convite, não gera código', await dono.rpc('convite_gerar', { p_profissional: idB }), /e-mail/);

  T.secao('convite antigo (de antes do código)');
  const idC = await novoConvite('caio');
  const caio = await conta(mail('caio'));
  T.ok('convite sem código não liga mais pelo e-mail', !(await naLoja(caio)) && ligado(idC) === 'sem');
  T.ok('na situação ele aparece sem link (a tela pede para mandar de novo)', !B.must(await dono.rpc('convites_situacao', { p: L.P }), 's').some((x) => x.profissional_id === idC));
  const codigoC = B.must(await dono.rpc('convite_gerar', { p_profissional: idC }), 'mandar de novo');
  T.passa('mandou de novo: com o código novo, entra', await caio.rpc('convite_aceitar', { p_codigo: codigoC }), await naLoja(caio));

  // ------------------------------------------------------------------
  T.secao('Escola: compra liberada só com o e-mail provado');
  const compra = mail('compradora');
  B.sql(`insert into escola_compras (email, slug, origem, pedido) values ('${compra}', 'confeitaria', 'cakto', 'ped-${L.suf}')`);
  T.depois(() => B.sql(`delete from escola_compras where email like 't-${L.suf}.%'`));
  const intrusa = await conta(compra);
  const minhas = async (sb) => ((await sb.from('escola_compras').select('slug').eq('email', compra)).data ?? []).length;
  T.ok('conta nova com o e-mail da compra (só senha) não vê a compra', (await minhas(intrusa)) === 0);
  T.ok('meu_email() vem vazio sem prova', B.must(await intrusa.rpc('meu_email'), 'meu_email') === '');
  const p0 = await intrusa.rpc('email_provar');
  T.passa('email_provar com sessão de senha: não prova', p0, p0.data === false);
  T.ok('… e continua sem ver', (await minhas(intrusa)) === 0);
  T.ok('anônimo não chama email_provar nem meu_email', !!(await anon.rpc('email_provar')).error && !!(await anon.rpc('meu_email')).error);
  T.ok('ninguém lê emails_confirmados direto', !!(await intrusa.from('emails_confirmados').select('*')).error || !((await intrusa.from('emails_confirmados').select('*')).data ?? []).length);

  // a dona de verdade do e-mail recebe o código na caixa de entrada e entra com ele
  const dona = B.cliente();
  B.must(await dona.auth.signInWithPassword({ email: compra, password: SENHA }), 'login');
  const otp = await codigoDoEmail(compra);
  B.must(await dona.auth.verifyOtp({ email: compra, token: otp, type: 'email' }), 'código do e-mail');
  const p1 = await dona.rpc('email_provar');
  T.passa('com o código do e-mail, prova', p1, p1.data === true);
  T.ok('… e vê a compra', (await minhas(dona)) === 1);
  T.ok('… meu_email() devolve o e-mail', B.must(await dona.rpc('meu_email'), 'meu_email') === compra);

  T.secao('Escola: trocar o e-mail depois da prova não leva a compra de outra pessoa');
  const alvo = mail('alvo');
  B.sql(`insert into escola_compras (email, slug, origem) values ('${alvo}', 'adestramento', 'manual')`);
  const esperta = await conta(mail('esperta'));
  B.must(await esperta.auth.verifyOtp({ email: mail('esperta'), token: await codigoDoEmail(mail('esperta')), type: 'email' }), 'código esperta');
  T.passa('prova o próprio e-mail', await esperta.rpc('email_provar'), true);
  // troca o e-mail da conta para o da compradora (o Auth com troca automática faria isso sem confirmar)
  const uEsperta = await uid(esperta);
  B.sql(`update auth.users set email = '${alvo}' where id = '${uEsperta}'`);
  T.ok('a data do e-mail novo foi guardada', B.num(`select count(*) from emails_desde where user_id='${uEsperta}' and email='${alvo}' and desde > now() - interval '1 minute'`) === 1);
  const pe = await esperta.rpc('email_provar');
  T.passa('com a sessão do código de antes da troca: não prova o e-mail novo', pe, pe.data === false);
  T.ok('… e não vê a compra do e-mail novo', ((await esperta.from('escola_compras').select('slug').eq('email', alvo)).data ?? []).length === 0);
  B.sql(`delete from escola_compras where email = '${alvo}'`);

  // ------------------------------------------------------------------
  T.secao('Cakto: e-mail só vale se já estava na conta antes da compra');
  const suf = L.suf;
  const SEGREDO = 'segredo-email-' + suf;
  const FILTRO = `chave like 'cakto%' or chave = 'assinatura_aberta'`;
  const antes = B.sql(`select coalesce(json_agg(c), '[]') from config_interna c where ${FILTRO}`);
  T.depois(() => B.sql(`delete from config_interna where ${FILTRO}; insert into config_interna select * from json_populate_recordset(null::config_interna, ${B.q(antes)}::json);`));
  const emailsCakto = [];
  T.depois(() => { if (emailsCakto.length) B.sql(`delete from cakto_eventos where email in (${emailsCakto.map(B.q).join(', ')})`); });
  B.sql(`insert into config_interna (chave, valor) values ('cakto_segredo_gestao_sha256', encode(extensions.digest(${B.q(SEGREDO)}, 'sha256'), 'hex'))
         on conflict (chave) do update set valor = excluded.valor; delete from config_interna where chave = 'cakto_produto_gestao';`);
  const evento = (email, extra = {}) => (emailsCakto.push(email), anon).rpc('cakto_evento', {
    p_segredo: SEGREDO, p_evento: 'purchase_approved', p_email: email, p_assinatura: 'sub-' + B.sufixo(),
    p_payload: { pedido: 'ped-' + B.sufixo(), ...(extra.pago_em ? { pago_em: extra.pago_em } : {}) }, p_oferta: null, p_callback: extra.callback ?? null,
  });
  const status = (P) => B.sql(`select status from petshops where id='${P}'`);

  // loja nova, dona criada AGORA; compra feita uma hora antes
  const C1 = await criarLoja(T, { nome: 'Email cakto 1', equipe: false, dados: false });
  let r = await evento(C1.emails.dono, { pago_em: new Date(Date.now() - 3600e3).toISOString() });
  T.ok('compra de antes da conta existir: não cai na loja (sem_conta)', r.data === 'sem_conta' && status(C1.P) === 'teste', r.error?.message ?? r.data);
  r = await evento(C1.emails.dono, { pago_em: 'não é data' });
  T.ok('data da compra ilegível: vale agora (a conta já existia) → cai na loja', r.data === 'ok' && status(C1.P) === 'ativa', r.error?.message ?? r.data);

  // a dona troca o e-mail da conta para o do comprador DEPOIS da compra
  const C2 = await criarLoja(T, { nome: 'Email cakto 2', equipe: false, dados: false });
  const comprador = `pagou.${suf}@teste-auto.local`;
  const quando = new Date(Date.now() - 60e3).toISOString();
  B.sql(`update auth.users set email = '${comprador}' where email = '${C2.emails.dono}'`);
  r = await evento(comprador, { pago_em: quando });
  T.ok('e-mail posto na conta depois da compra: não puxa o pagamento', r.data === 'sem_conta' && status(C2.P) === 'teste', r.error?.message ?? r.data);
  B.sql(`update auth.users set email = '${C2.emails.dono}' where email = '${comprador}'`);

  // cakto_email (de uma compra anterior) não puxa compra nova de outra pessoa
  const C3 = await criarLoja(T, { nome: 'Email cakto 3', equipe: false, dados: false });
  const vitima = `vitima.${suf}@teste-auto.local`;
  B.sql(`update petshops set cakto_email = '${vitima}' where id='${C3.P}'`);
  r = await evento(vitima);
  T.ok('o e-mail de uma compra anterior (cakto_email) não liga compra nova', r.data === 'sem_conta' && status(C3.P) === 'teste', r.error?.message ?? r.data);

  // callback assinado do link de pagamento: liga mesmo com outro e-mail (é o caminho preferido)
  const cb = await C3.sb.dono.rpc('assinatura_callback', { p: C3.P });
  r = await evento(vitima, { callback: cb.data });
  T.ok('com o callback assinado da loja, liga (e-mail diferente)', r.data === 'ok' && status(C3.P) === 'ativa', r.error?.message ?? r.data);

  // pela rota do servidor: a data da compra (paidAt) chega ao banco
  if (await B.servidorNoAr()) {
    const C4 = await criarLoja(T, { nome: 'Email cakto 4', equipe: false, dados: false });
    emailsCakto.push(C4.emails.dono);
    const velho = new Date(Date.now() - 2 * 3600e3).toISOString();
    const corpo = { secret: SEGREDO, event: 'purchase_approved', data: { id: 'ped-' + B.sufixo(), status: 'paid', offer_type: 'main', customer: { email: C4.emails.dono }, subscription: { id: 'sub-' + B.sufixo() }, offer: { id: 'x' }, product: { id: B.uuid(), short_id: 'p' + suf.slice(-5) }, createdAt: velho, paidAt: velho } };
    const rr = await fetch(`${B.BASE_URL}/api/gestao/cakto`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
    const j = await rr.json().catch(() => null);
    T.ok('pela rota: compra de antes da conta → sem_conta', j?.resultado === 'sem_conta' && status(C4.P) === 'teste', j);
    T.ok('… e o registro guarda a data da compra', B.num(`select count(*) from cakto_eventos where email='${C4.emails.dono}' and payload->>'pago_em' = '${velho}'`) === 1);
  } else T.ok('servidor no ar para a parte da rota', false, B.BASE_URL);
}))();
