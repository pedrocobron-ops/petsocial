// Registro de erros do aplicativo (migração 20261180) pela API: ninguém lê a tabela direto; `erro_registrar` aceita anônimo e
// logado, limpa de novo no banco, corta tamanhos, junta repetições, freia excesso e só conta falhas sem internet; papel e áreas
// vêm de quem está logado; as funções do painel (`admin_erros`, `admin_erro_resolver`) só para o admin; "resolvido" some até
// voltar numa versão nova; a rota de teste do servidor (GESTAO_ERRO_TESTE=1) cai no registro com origem "servidor".
const B = require('../lib/base');
const { criarLoja, SENHA } = require('../lib/semente');
const T = require('../lib/teste')('erros');

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Erros' });
  const anon = B.cliente(), dono = L.sb.dono;
  const adm = B.cliente();
  const emailAdm = `t-${L.suf}.admin@teste-auto.local`;
  B.must(await adm.auth.signUp({ email: emailAdm, password: SENHA }), 'cadastro do admin');
  const uid = (await adm.auth.getUser()).data.user.id;
  B.sql(`insert into admins (user_id) values ('${uid}') on conflict do nothing`); // só por SQL
  const ap = (x) => `t${L.suf.replace(/[^a-z0-9]/g, '')}${x}`; // aparelhos deste teste
  const marca = L.suf.replace(/[0-9]/g, '').slice(0, 6) || 'xyz'; // sem números: a assinatura troca número por 0
  T.depois(() => B.sql(`delete from admins where user_id='${uid}'; delete from erros_app_resolvidos where assinatura in (select assinatura from erros_app where aparelho like '${ap('')}%'); delete from erros_app where aparelho like '${ap('')}%'; delete from erros_app_freio where chave like 'a:${ap('')}%';`));
  const reg = (c, o) => c.rpc('erro_registrar', { p_origem: 'navegador', p_tipo: 'erro', p_versao: 'v1', p_navegador: 'Chrome 131 · Linux', p_tela: '390x844', ...o });
  const linhas = (aparelho) => B.num(`select count(*) from erros_app where aparelho='${aparelho}'`);

  T.secao('ninguém lê nem grava as tabelas direto');
  for (const [n, c] of [['anônimo', anon], ['dono', dono], ['admin', adm]]) {
    for (const tab of ['erros_app', 'erros_app_resolvidos', 'erros_app_contagem', 'erros_app_freio']) {
      const q = await c.from(tab).select('*').limit(3);
      T.ok(`${n} não lê ${tab}`, !!q.error || (q.data ?? []).length === 0, q.error?.message ?? q.data);
    }
    T.ok(`${n} não grava erros_app direto`, !!(await c.from('erros_app').insert({ assinatura: 'x', origem: 'navegador', tipo: 'erro', mensagem: 'x', aparelho: 'x' })).error);
    T.ok(`${n} não chama erro_limpar`, !!(await c.rpc('erro_limpar', { p: 'x', p_max: 10 })).error);
  }
  T.secao('funções do painel só para o admin');
  for (const [n, c] of [['anônimo', anon], ['dono', dono], ['recepção', L.sb.caixa]]) {
    const a = await c.rpc('admin_erros', { p_horas: 24 });
    T.ok(`${n} recusado em admin_erros`, !!a.error && !a.data, a.error?.message);
    T.ok(`${n} recusado em admin_erro_resolver`, !!(await c.rpc('admin_erro_resolver', { p_assinatura: 'x' })).error);
  }
  T.passa('admin chama admin_erros', await adm.rpc('admin_erros', { p_horas: 24 }));

  T.secao('quem manda e o que fica guardado');
  T.passa('anônimo registra um erro', await reg(anon, { p_mensagem: `Falhou ${marca} anon`, p_aparelho: ap('a'), p_rota: '/gestao/agendar/:id', p_petshop: L.P }));
  T.ok('… guardado como anônimo, com o pet shop', B.sql(`select papel || '|' || coalesce(petshop_id::text,'') from erros_app where aparelho='${ap('a')}'`) === `anonimo|${L.P}`);
  T.passa('dono registra', await reg(dono, { p_mensagem: `Falhou ${marca} dono`, p_aparelho: ap('d'), p_petshop: L.P }));
  T.ok('… papel dono vem do banco', B.sql(`select papel from erros_app where aparelho='${ap('d')}'`) === 'dono');
  T.passa('monitora registra', await reg(L.sb.monitor, { p_mensagem: `Falhou ${marca} monitora`, p_aparelho: ap('m'), p_petshop: L.P }));
  T.ok('… papel equipe com as áreas dela', B.sql(`select papel || '|' || array_to_string(areas, ',') from erros_app where aparelho='${ap('m')}'`) === 'equipe|clientes,creche_hotel');
  T.passa('pet shop que não existe: aceita e guarda sem pet shop', await reg(dono, { p_mensagem: `Falhou ${marca} outra`, p_aparelho: ap('o'), p_petshop: B.uuid() }));
  T.ok('… sem pet shop e sem papel de dono', B.sql(`select coalesce(petshop_id::text,'-') || '|' || papel from erros_app where aparelho='${ap('o')}'`) === '-|logado');

  T.secao('limpeza e limites no banco');
  const sujo = `Erro ${marca} de ana.souza@gmail.com tel (11) 98765-4321 valor R$ 1.234,56 id 3f2a1b4c-1111-2222-3333-444455556666 em https://x.com/a?tel=1199#y ficha eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc ` + 'x'.repeat(3000);
  const pilha = Array.from({ length: 20 }, (_, i) => `f${i} (https://x.com/_next/a.js?v=2:${i}:1)`).join('\n');
  T.passa('aceita mensagem e pilha enormes', await reg(anon, { p_mensagem: sujo, p_pilha: pilha, p_nome: 'TypeError<script>', p_rota: '/x?y=1', p_aparelho: ap('s'), p_tela: '390x844;drop', p_versao: 'v1"' }));
  const g = B.sql(`select mensagem || '§' || pilha || '§' || nome || '§' || rota || '§' || tela || '§' || versao from erros_app where aparelho='${ap('s')}'`).split('§');
  T.ok('mensagem cortada em 500', g[0].length <= 500, g[0].length);
  T.ok('e-mail, telefone, valor, uuid, consulta, âncora e ficha saíram', !/ana\.souza|98765|1\.234|3f2a1b4c|tel=|#y|eyJ/.test(g[0]) && /\[email\]/.test(g[0]) && /:n/.test(g[0]) && /R\$ :valor/.test(g[0]) && /:id/.test(g[0]) && /:token/.test(g[0]), g[0].slice(0, 200));
  T.ok('pilha com no máximo 6 linhas, sem consulta, com linha:coluna', g[1].split('\n').length === 6 && !g[1].includes('?v=') && g[1].includes('a.js:0:1'), g[1]);
  T.ok('nome, rota, tela e versão só com caracteres permitidos', g[2] === 'TypeErrorscript' && g[3] === '/x' && g[4] === '390x844' && g[5] === 'v1', g.slice(2));

  await reg(anon, { p_mensagem: `Versao ${marca}`, p_aparelho: ap('v'), p_versao: '8b06419281e7', p_navegador: 'Chrome 131 · Android' });
  T.ok('versão (commit com muitos números) e navegador ficam inteiros', B.sql(`select versao || '|' || navegador from erros_app where aparelho='${ap('v')}'`) === '8b06419281e7|Chrome 131 · Android');

  T.secao('repetição junta, freio corta');
  for (let i = 0; i < 3; i++) await reg(anon, { p_mensagem: `Repetido ${marca}`, p_aparelho: ap('r') });
  T.ok('o mesmo erro 3 vezes no mesmo aparelho: 1 linha com contagem 3', B.sql(`select count(*) || '|' || sum(contagem) from erros_app where aparelho='${ap('r')}'`) === '1|3');
  await reg(anon, { p_mensagem: `Repetido ${marca}`, p_aparelho: ap('r'), p_versao: 'v2' });
  T.ok('em outra versão: outra linha', linhas(ap('r')) === 2);
  await reg(anon, { p_mensagem: `Repetido ${marca}`, p_aparelho: ap('r2') });
  T.ok('em outro aparelho: outra linha', linhas(ap('r2')) === 1);
  T.ok('número diferente na mensagem conta como o mesmo erro', (await reg(anon, { p_mensagem: `Repetido ${marca} 12`, p_aparelho: ap('n') }), await reg(anon, { p_mensagem: `Repetido ${marca} 99`, p_aparelho: ap('n') }), linhas(ap('n')) === 1));

  // freio por aparelho: 30 por minuto (longe da virada do minuto para não dividir a janela)
  const s = new Date().getSeconds(); if (s > 40) await espera((62 - s) * 1000);
  for (let i = 0; i < 36; i++) await reg(anon, { p_mensagem: `Freio ${marca} ${'abcdefghijklmnopqrstuvwxyzABCDEFGHIJ'[i]}`, p_aparelho: ap('f') });
  T.ok('36 erros diferentes no mesmo aparelho em 1 minuto: só 30 guardados', linhas(ap('f')) === 30, linhas(ap('f')));
  // freio por pet shop: 60 por minuto (aparelhos diferentes)
  await Promise.all(Array.from({ length: 66 }, (_, i) => reg(anon, { p_mensagem: `Loja ${marca}`, p_aparelho: ap(`p${i}`), p_petshop: L.P })));
  const daLoja = B.num(`select count(*) from erros_app where aparelho like '${ap('p')}%' and petshop_id='${L.P}'`);
  T.ok('66 aparelhos no mesmo pet shop em 1 minuto: no máximo 60 guardados', daLoja <= 60 && daLoja >= 50, daLoja);
  // freio geral (1000 por hora): põe a conta da hora no limite e devolve depois
  const hora = B.sql(`select date_trunc('hour', now())`);
  const antes = B.sql(`select coalesce((select n::text from erros_app_freio where chave='geral' and janela='${hora}'), 'nada')`);
  T.depois(() => B.sql(antes === 'nada' ? `delete from erros_app_freio where chave='geral' and janela='${hora}'` : `update erros_app_freio set n = ${antes} + n - 1000 where chave='geral' and janela='${hora}'`));
  B.sql(`insert into erros_app_freio (chave, janela, n) values ('geral', '${hora}', 1000) on conflict (chave, janela) do update set n = 1000`);
  const desc0 = B.num(`select coalesce(sum(n),0) from erros_app_contagem where tipo='descartado'`);
  T.passa('acima do limite geral: aceita a chamada…', await reg(anon, { p_mensagem: `Geral ${marca}`, p_aparelho: ap('g') }));
  T.ok('… não guarda e conta como descartado', linhas(ap('g')) === 0 && B.num(`select coalesce(sum(n),0) from erros_app_contagem where tipo='descartado'`) === desc0 + 1);
  B.sql(`update erros_app_freio set n = 1 where chave='geral' and janela='${hora}'`);

  T.secao('sem internet só conta');
  const sem0 = B.num(`select coalesce(sum(n),0) from erros_app_contagem where tipo='sem_internet'`);
  T.passa('falha sem internet aceita', await reg(anon, { p_mensagem: 'sem internet', p_aparelho: ap('i'), p_sem_internet: true }));
  T.ok('… não vira linha, só contagem', linhas(ap('i')) === 0 && B.num(`select coalesce(sum(n),0) from erros_app_contagem where tipo='sem_internet'`) === sem0 + 1);

  T.secao('painel: agrupado, resolvido e de volta');
  const ver = async (p = {}) => B.must(await adm.rpc('admin_erros', { p_horas: 24, ...p }), 'admin_erros');
  const achar = (r, m) => r.grupos.find((x) => x.mensagem === m);
  let r = await ver();
  const grp = achar(r, `Repetido ${marca}`);
  T.ok('grupo junta versões e aparelhos', grp && grp.vezes === 5 && grp.aparelhos === 2 && grp.versoes.sort().join(',') === 'v1,v2', grp);
  T.ok('o painel não traz e-mail nem telefone', !/@gmail|98765/.test(JSON.stringify(r)));
  T.ok('grupo da monitora traz papel e áreas', (() => { const x = achar(r, `Falhou ${marca} monitora`); return x && x.papeis.includes('equipe') && x.areas.includes('creche_hotel') && x.lojas === 1; })());
  T.passa('admin marca como resolvido', await adm.rpc('admin_erro_resolver', { p_assinatura: grp.assinatura }));
  r = await ver();
  T.ok('… some da lista', !achar(r, `Repetido ${marca}`));
  T.ok('… aparece com "Mostrar resolvidos"', !!achar(await ver({ p_resolvidos: true }), `Repetido ${marca}`));
  await reg(anon, { p_mensagem: `Repetido ${marca}`, p_aparelho: ap('r3'), p_versao: 'v2' });
  T.ok('acontece de novo numa versão que já tinha: continua escondido', !achar(await ver(), `Repetido ${marca}`));
  await reg(anon, { p_mensagem: `Repetido ${marca}`, p_aparelho: ap('r3'), p_versao: 'v3' });
  r = await ver();
  T.ok('acontece numa versão nova: volta, marcado "voltou"', achar(r, `Repetido ${marca}`)?.voltou === true, achar(r, `Repetido ${marca}`));
  T.passa('admin desmarca', await adm.rpc('admin_erro_resolver', { p_assinatura: grp.assinatura, p_resolvido: false }));
  T.ok('… sem resolvido', B.num(`select count(*) from erros_app_resolvidos where assinatura='${grp.assinatura}'`) === 0);
  T.ok('período de 30 dias aceito', Array.isArray((await ver({ p_horas: 720 })).grupos));

  T.secao('servidor');
  if (!(await B.servidorNoAr())) { T.ok('servidor no ar', false, B.BASE_URL); return; }
  const lig = await fetch(`${B.BASE_URL}/api/gestao/erro-teste`, { cache: 'no-store' });
  if (!T.ok('gatilho de teste ligado (servidor com GESTAO_ERRO_TESTE=1)', lig.status === 200, lig.status)) return;
  const antesSrv = B.num(`select coalesce(sum(contagem),0) from erros_app where origem='servidor' and rota='/api/gestao/erro-teste'`);
  const x = await fetch(`${B.BASE_URL}/api/gestao/erro-teste`, { method: 'POST', body: JSON.stringify({ email: 'ana@x.com' }) });
  const corpo = await x.json().catch(() => ({}));
  T.ok('rota que quebra responde 500 com frase simples', x.status === 500 && /Algo deu errado do nosso lado/.test(corpo.mensagem ?? ''), [x.status, corpo]);
  T.ok('… e o erro foi registrado com origem servidor e a rota', B.num(`select coalesce(sum(contagem),0) from erros_app where origem='servidor' and rota='/api/gestao/erro-teste'`) === antesSrv + 1);
  T.ok('… sem o corpo do pedido', B.num(`select count(*) from erros_app where origem='servidor' and (mensagem like '%ana@%' or coalesce(pilha,'') like '%ana@%')`) === 0);
  T.ok('… com a versão do servidor', B.sql(`select coalesce(versao,'') from erros_app where origem='servidor' and rota='/api/gestao/erro-teste' order by ultimo_em desc limit 1`) !== '');
  B.sql(`delete from erros_app where origem='servidor' and rota='/api/gestao/erro-teste'`);
}))();
