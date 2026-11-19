// Unidade: a camada de dados das telas (rodada 9, N3). Sem banco e sem navegador.
//  - Memória curta, prazo, releitura e aviso de leitura que falhou (src/lib/gestao/dados-memoria.ts, usado pelo useDados).
//  - Pedido que grava e pedido preso (src/lib/gestao/supabase.ts: pedidoGrava, buscarComPrazo).
//  - De qual banco o build fala (src/lib/gestao/banco-do-build.ts): sem variáveis, só o build de produção usa produção.
//  - Os cartões de baixo da tela Hoje contados no banco (src/lib/gestao/hoje-extras.ts).
//  - Mozart: a conta liberada pela regra do banco, o prazo de cada chamada e o prazo total das voltas (assistente/conversa.ts).
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { lib } = require('../lib/app');
const { RAIZ } = require('../lib/base');
const T = require('../lib/teste')('unidade-dados-das-telas');
const M = lib('dados-memoria');
const S = lib('supabase');
const BB = lib('banco-do-build');
const HX = lib('hoje-extras');
const C = lib('assistente/conversa');
const E = lib('erros');
const t = (nome, f) => { try { f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };
const ta = async (nome, f) => { try { await f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.stack || e.message); } };
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));

(async () => T.rodar(async () => {
  T.secao('memória curta das leituras');
  await ta('a segunda visita não busca de novo dentro de 30 s; depois disso mostra o guardado e busca por trás', async () => {
    M.esquecerTudo();
    let n = 0, agora = 1_000_000;
    const k = M.chaveDaLeitura('clientes', ['loja-1', 3]);
    assert.equal(M.lerGuardado(k, agora), null);
    assert.deepEqual(await M.buscarGuardando(k, async () => ({ v: ++n }), () => agora), { v: 1 });
    assert.deepEqual(M.lerGuardado(k, agora + 10_000), { valor: { v: 1 }, fresco: true });
    assert.deepEqual(M.lerGuardado(k, agora + M.FRESCO_MS + 1), { valor: { v: 1 }, fresco: false });
    assert.equal(M.lerGuardado(k, agora + M.GUARDA_MS + 1), null, 'velho demais: não aparece');
  });
  await ta('chave: o nome mais as dependências (outra semana, outra chave)', async () => {
    assert.notEqual(M.chaveDaLeitura('agenda', ['p', 1]), M.chaveDaLeitura('agenda', ['p', 2]));
    assert.notEqual(M.chaveDaLeitura('agenda', ['p', 1]), M.chaveDaLeitura('caixa', ['p', 1]));
    assert.equal(M.chaveDaLeitura('agenda', ['p', new Date(5)]), M.chaveDaLeitura('agenda', ['p', new Date(5)]));
  });
  await ta('gravou alguma coisa: o guardado ainda aparece, mas deixa de valer como novo', async () => {
    M.esquecerTudo();
    const k = M.chaveDaLeitura('hoje', ['p']);
    await M.buscarGuardando(k, async () => 'antes', () => 1000);
    M.marcarTudoVelho();
    assert.deepEqual(M.lerGuardado(k, 1001), { valor: 'antes', fresco: false });
    await M.buscarGuardando(k, async () => 'depois', () => 2000);
    assert.deepEqual(M.lerGuardado(k, 2001), { valor: 'depois', fresco: true });
  });
  await ta('leitura que começou antes de uma gravação não fica guardada como nova', async () => {
    M.esquecerTudo();
    const k = M.chaveDaLeitura('caixa', ['p']);
    let soltar;
    const p = M.buscarGuardando(k, () => new Promise((ok) => { soltar = ok; }), () => 5000);
    M.marcarTudoVelho(); // alguém recebeu enquanto a leitura estava a caminho
    soltar('lido antes da gravação');
    assert.equal(await p, 'lido antes da gravação');
    assert.equal(M.lerGuardado(k, 5001).fresco, false);
  });
  await ta('duas telas pedindo a mesma leitura ao mesmo tempo dividem um pedido só', async () => {
    M.esquecerTudo();
    let n = 0;
    const buscar = async () => { n++; await espera(20); return n; };
    const k = M.chaveDaLeitura('servicos', ['p']);
    const [a, b] = await Promise.all([M.buscarGuardando(k, buscar), M.buscarGuardando(k, buscar)]);
    assert.equal(n, 1);
    assert.equal(a, b);
  });
  await ta('erro não fica guardado; a tentativa seguinte busca de novo', async () => {
    M.esquecerTudo();
    const k = M.chaveDaLeitura('x', []);
    await assert.rejects(M.buscarGuardando(k, async () => { throw new Error('caiu'); }));
    assert.equal(M.lerGuardado(k), null);
    assert.equal(await M.buscarGuardando(k, async () => 7), 7);
  });
  await ta('trocou de conta ou de pet shop: esquece tudo (nunca mostra dado de outra loja)', async () => {
    M.definirDonoDaMemoria('u1:loja-a');
    const k = M.chaveDaLeitura('clientes', ['x']);
    await M.buscarGuardando(k, async () => 'da loja A');
    M.definirDonoDaMemoria('u1:loja-a');
    assert.ok(M.lerGuardado(k), 'mesmo dono: continua');
    M.definirDonoDaMemoria('u1:loja-b');
    assert.equal(M.lerGuardado(k), null);
  });

  T.secao('prazo, releitura e virada do dia');
  await ta('pedido que não responde vira erro de prazo (a tela mostra "Tentar de novo")', async () => {
    const t0 = Date.now();
    await assert.rejects(M.comPrazo(new Promise(() => {}), 40), (e) => e instanceof M.TempoEsgotado);
    assert.ok(Date.now() - t0 < 500);
    assert.equal(await M.comPrazo(Promise.resolve(3), 40), 3);
    await assert.rejects(M.comPrazo(Promise.reject(new Error('outro')), 40), /outro/);
  });
  t('o texto do prazo vira "Demorou demais, tente de novo."', () => {
    assert.equal(E.textoAmigavel(new M.TempoEsgotado().message), 'Demorou demais, tente de novo.');
    assert.equal(E.textoAmigavel('tempo esgotado: o servidor não respondeu a tempo'), 'Demorou demais, tente de novo.');
  });
  t('ao voltar para a aba: no máximo uma releitura a cada 30 s', () => {
    assert.equal(M.podeReler(1000, 1000 + 29_000), false);
    assert.equal(M.podeReler(1000, 1000 + 30_000), true);
  });
  t('virada do dia: o temporizador acorda logo depois da meia-noite do aparelho', () => {
    assert.equal(M.msAteVirarODia(new Date(2026, 10, 18, 23, 59, 0)), 62_000);
    assert.equal(M.msAteVirarODia(new Date(2026, 10, 18, 0, 0, 0)), 86_402_000);
    assert.notEqual(M.diaDoAparelho(new Date(2026, 10, 18, 23, 59)), M.diaDoAparelho(new Date(2026, 10, 19, 0, 0)));
  });
  t('releitura que trouxe a mesma coisa não mexe na tela (compara objetos, datas, Map e Set por dentro)', () => {
    assert.ok(M.iguais({ a: [1, { b: 'x' }], d: new Date(5) }, { a: [1, { b: 'x' }], d: new Date(5) }));
    assert.ok(!M.iguais({ a: [1, 2] }, { a: [1, 3] }));
    assert.ok(M.iguais(new Map([['k', { v: 1 }]]), new Map([['k', { v: 1 }]])));
    assert.ok(!M.iguais(new Map([['k', { v: 1 }]]), new Map([['k', { v: 2 }]])), 'Map com valor diferente é diferente');
    assert.ok(!M.iguais(new Set([1]), new Set([2])));
    assert.ok(!M.iguais({ a: 1 }, { a: 1, b: undefined }));
    assert.ok(!M.iguais(null, {}));
  });

  T.secao('leitura que falhou e a tela não tratou');
  t('entra no aviso comum com o "Tentar de novo" e sai quando a leitura dá certo', () => {
    let avisos = 0, tentou = 0;
    const parar = M.ouvirLeiturasComErro(() => { avisos++; });
    const tentar = () => { tentou++; };
    M.anotarLeituraComErro(901, { texto: 'O servidor falhou agora.', tentar });
    M.anotarLeituraComErro(901, { texto: 'O servidor falhou agora.', tentar }); // o mesmo de novo: não avisa outra vez
    assert.equal(avisos, 1);
    assert.equal(M.leiturasComErro().length, 1);
    M.leiturasComErro()[0].tentar();
    assert.equal(tentou, 1);
    M.anotarLeituraComErro(901, null);
    assert.equal(M.leiturasComErro().length, 0);
    assert.equal(avisos, 2);
    parar();
  });
  t('recusa por falta de acesso não entra no aviso ("Tentar de novo" não resolve)', () => {
    assert.ok(M.ehRecusaDeAcesso('permission denied for table lancamentos'));
    assert.ok(M.ehRecusaDeAcesso('qualquer', '42501'));
    assert.ok(!M.ehRecusaDeAcesso('Failed to fetch'));
  });
  t('useDados entrega o erro por um campo que marca "a tela olhou" e avisa a casca quando ninguém olha', () => {
    const ui = fs.readFileSync(path.join(RAIZ, 'src/components/gestao/ui.tsx'), 'utf8');
    assert.match(ui, /get erro\(\) \{ olhou\.current = true; return erro; \}/);
    assert.match(ui, /anotarLeituraComErro\(meu, semTratar && !olhou\.current && erro \?/);
    const casca = fs.readFileSync(path.join(RAIZ, 'src/components/gestao/casca.tsx'), 'utf8');
    assert.match(casca, /<LeiturasComErro \/>/);
  });

  T.secao('pedido que grava e pedido preso');
  t('gravação direta na tabela e função que grava marcam a memória como velha; leitura e rotina de fundo, não', () => {
    const u = 'http://x/rest/v1/';
    assert.equal(S.pedidoGrava(u + 'agendamentos?id=eq.1', 'PATCH'), true);
    assert.equal(S.pedidoGrava(u + 'lancamentos', 'POST'), true);
    assert.equal(S.pedidoGrava(u + 'lancamentos?select=id', 'GET'), false);
    for (const f of ['quadro_mover', 'receber_conta', 'estoque_entrada', 'creche_plano_salvar', 'venda_devolver', 'fechar_caixa', 'importar_clientes', 'modo_envio_marcar']) assert.equal(S.pedidoGrava(u + 'rpc/' + f, 'POST'), true, f);
    for (const f of ['gestao_hoje', 'gestao_hoje_extras', 'gestao_sinal', 'gestao_base', 'visitas_dos_pets', 'marcar_uso', 'contas_fixas_gerar', 'creche_gerar_cobrancas', 'entrar', 'sou_admin', 'agendamentos_precos', 'lucro_do_periodo', 'assistente_contar_v2', 'erro_registrar', 'link_horarios']) assert.equal(S.pedidoGrava(u + 'rpc/' + f, 'POST'), false, f);
    assert.equal(S.pedidoGrava('http://x/storage/v1/object/pets/a.jpg', 'POST'), false);
  });
  await ta('pedido ao banco que não começa a responder é cortado e vira "tempo esgotado"', async () => {
    const preso = (_u, o) => new Promise((_ok, falha) => { o.signal.addEventListener('abort', () => falha(Object.assign(new Error('aborted'), { name: 'AbortError' }))); });
    const f = S.buscarComPrazo(40, preso);
    const t0 = Date.now();
    await assert.rejects(f('http://x/rest/v1/pets?select=id', {}), /tempo esgotado/);
    assert.ok(Date.now() - t0 < 500);
  });
  await ta('gravação que deu certo avisa quem ouve; envio de arquivo não tem prazo', async () => {
    let gravou = 0;
    const parar = S.ouvirGravacoes(() => { gravou++; });
    const responde = async () => ({ ok: true });
    const f = S.buscarComPrazo(40, responde);
    await f('http://x/rest/v1/agendamentos', { method: 'POST' });
    await f('http://x/rest/v1/agendamentos?select=id', {});
    assert.equal(gravou, 1);
    parar();
    let comSinal = null;
    const g = S.buscarComPrazo(40, async (_u, o) => { comSinal = o && o.signal; return { ok: true }; });
    await g('http://x/storage/v1/object/pets/foto.jpg', { method: 'POST' });
    assert.equal(comSinal, undefined, 'arquivo: sem corte por prazo');
  });

  T.secao('de qual banco o build fala');
  t('com as duas variáveis: valem elas', () => {
    const b = BB.bancoDoBuild({ NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'k' });
    assert.deepEqual([b.url, b.chave, b.origem, b.aviso], ['http://127.0.0.1:54321', 'k', 'variaveis', null]);
  });
  t('sem variáveis fora da produção (prévia, máquina de alguém): não fala com produção e avisa', () => {
    for (const env of [{}, { VERCEL_ENV: 'preview' }, { VERCEL_ENV: 'development' }, { NEXT_PUBLIC_SUPABASE_URL: 'http://x' }]) {
      const b = BB.bancoDoBuild(env);
      assert.equal(b.origem, 'nenhum');
      assert.equal(b.url, ''); assert.equal(b.chave, '');
      assert.match(b.aviso, /ATENÇÃO/);
    }
  });
  t('sem variáveis no build de produção da Vercel: segue no projeto de produção (com aviso)', () => {
    const b = BB.bancoDoBuild({ VERCEL_ENV: 'production' });
    assert.equal(b.origem, 'producao');
    assert.equal(b.url, BB.BANCO_DE_PRODUCAO.url);
    assert.ok(b.aviso);
  });
  t('o endereço de produção não é mais o padrão de supabase-config.ts', () => {
    const cfg = fs.readFileSync(path.join(RAIZ, 'src/lib/gestao/supabase-config.ts'), 'utf8');
    assert.doesNotMatch(cfg, /supabase\.co|sb_publishable_/);
    const next = fs.readFileSync(path.join(RAIZ, 'next.config.ts'), 'utf8');
    assert.match(next, /bancoDoBuild\(process\.env\)/);
    assert.doesNotMatch(next, /pifuiczrytmizqxzygbi/);
  });

  T.secao('tela Hoje: cartões de baixo contados no banco');
  t('monta o resumo de quem chamar, as dicas e a contagem das mensagens', () => {
    const x = HX.montarExtras({
      chamar: { sumidos: { todos: 5, tutores: 3, pets: 4, nomes: ['Thor', 'Mel'] }, niver: { todos: 1, tutores: 1, pets: 1, nomes: ['Luna'], hoje: true } },
      dicas: { sumidos: { q: 12, nomes: ['Bob', 'Nina'] }, faltas: ['Fred'], faltas_q: 1, niver: [{ nome: 'Luna', em: 0 }], niver_q: 1, amanha: 2, vieram: 40, pacotes: { q: 1, nomes: ['Max'] } },
      envio: { lembrete: { n: 3, ver: [] }, cobranca: { n: 1, ver: ['11 98888-7777 / 11 3333-4444', 'ramal 12'] }, volta: { n: 0, ver: [] } },
      falhas: [],
    });
    assert.equal(x.chamar.sumidos.tutores, 3);
    assert.equal(HX.nomesEMais(x.chamar.sumidos.nomes, x.chamar.sumidos.pets), 'Thor, Mel e mais 2');
    assert.equal(x.chamar.niver.hoje, true);
    assert.equal(x.dicas.sumidos.q, 12);
    // lembrete 3; cobrança 1 + o telefone escrito com dois números (vale o primeiro); "ramal 12" não é telefone
    assert.deepEqual(x.envio.map((e) => [e.tipo, e.quantas]), [['lembrete', 3], ['cobranca', 2]]);
  });
  t('"Thor e Mel" / "Thor" / "Thor, Mel e mais 1"', () => {
    assert.equal(HX.nomesEMais(['Thor'], 1), 'Thor');
    assert.equal(HX.nomesEMais(['Thor', 'Mel'], 2), 'Thor e Mel');
    assert.equal(HX.nomesEMais(['Thor', 'Mel'], 3), 'Thor, Mel e mais 1');
  });
  t('parte que o banco não mandou fica vazia (o cartão some), sem quebrar a tela', () => {
    const x = HX.montarExtras({ chamar: null, dicas: null, envio: null, falhas: [{ parte: 'dicas', erro: 'x' }] });
    assert.deepEqual([x.chamar, x.dicas, x.envio], [null, null, null]);
    assert.deepEqual(x.falhas, [{ parte: 'dicas', erro: 'x' }]);
  });
  await ta('banco sem a função (antes da atualização): devolve null e a tela lê do jeito antigo; outro erro sobe', async () => {
    const sb = (erro) => ({ rpc: async () => ({ data: null, error: erro }) });
    const q = { chamar: true, dicas: true, pacotes: false, envio: true, chamadosVolta: [], chamadosNiver: [] };
    assert.equal(await HX.lerExtrasDoHoje(sb({ code: 'PGRST202', message: 'não achei' }), 'p', new Date(), q), null);
    await assert.rejects(HX.lerExtrasDoHoje(sb({ code: '57014', message: 'canceling statement due to statement timeout' }), 'p', new Date(), q), /timeout/);
    let chamou = false;
    const nada = await HX.lerExtrasDoHoje({ rpc: async () => { chamou = true; return { data: {}, error: null }; } }, 'p', new Date(), { ...q, chamar: false, dicas: false, envio: false });
    assert.equal(chamou, false, 'ninguém pediu nada: nem vai ao banco');
    assert.deepEqual(nada, { chamar: null, dicas: null, envio: null, falhas: [] });
  });
  t('a tela Hoje não baixa mais os pets nem o histórico: lê gestao_hoje_extras (o jeito antigo só com o banco antigo)', () => {
    const hoje = fs.readFileSync(path.join(RAIZ, 'src/app/(gestao)/gestao/app/page.tsx'), 'utf8');
    assert.match(hoje, /lerExtrasDoHoje\(sb, petshop\.id, hoje/);
    assert.match(hoje, /primeiroOlhar && semExtras \? buscarParaChamar/);
    assert.match(hoje, /guardar: "hoje"/);
  });

  T.secao('Mozart: conta liberada, prazo e estoque');
  t('a conta pode gravar? vale o que o banco diz (acesso_liberado)', () => {
    const vencido = { status: 'teste', teste_ate: '2020-01-01T00:00:00Z' };
    // teste vencido com a assinatura ainda fechada: o banco libera, e o Mozart acompanha (antes dizia "só para consulta")
    assert.equal(C.contaLiberada(true, vencido), true);
    // conta em dia marcada para apagar: o banco recusa, e o Mozart acompanha
    assert.equal(C.contaLiberada(false, { status: 'ativa', teste_ate: '2020-01-01T00:00:00Z' }), false);
    // sem a resposta do banco: a regra antiga, para não travar
    assert.equal(C.contaLiberada(null, vencido), false);
    assert.equal(C.contaLiberada(undefined, { status: 'ativa', teste_ate: '2020-01-01T00:00:00Z' }), true);
  });
  t('a rota pergunta ao banco e não refaz a conta do acesso por conta própria', () => {
    const rota = fs.readFileSync(path.join(RAIZ, 'src/app/api/gestao/assistente/route.ts'), 'utf8');
    assert.match(rota, /rpc\("acesso_liberado", \{ p: corpo\.petshopId \}\)/);
    assert.match(rota, /const liberado = contaLiberada\(/);
    assert.match(rota, /inicioDoPedido: inicio/);
  });
  t('prazo de cada chamada: nunca mais do que falta; nova tentativa só na primeira volta', () => {
    assert.deepEqual(C.limitesDaChamada({ volta: 0, restaMs: 50_000 }), { timeout: 25_000, maxRetries: 1 });
    assert.deepEqual(C.limitesDaChamada({ volta: 0, restaMs: 30_000 }), { timeout: 15_000, maxRetries: 1 });
    assert.deepEqual(C.limitesDaChamada({ volta: 1, restaMs: 30_000 }), { timeout: 25_000, maxRetries: 0 });
    assert.deepEqual(C.limitesDaChamada({ volta: 2, restaMs: 6_000 }), { timeout: 6_000, maxRetries: 0 });
    // pior caso da primeira volta: duas tentativas cabem no que falta
    for (const resta of [50_000, 40_000, 20_000]) { const l = C.limitesDaChamada({ volta: 0, restaMs: resta }); assert.ok(l.timeout * (l.maxRetries + 1) <= resta); }
    assert.ok(C.PRAZO_TOTAL_MS < 60_000);
  });
  const c = { sb: { from: () => { throw new Error('sem banco'); }, rpc: () => { throw new Error('sem banco'); } }, userId: 'u', petshop: { id: 'p', nome: 'Loja', horario: null, modulos: [] }, eu: { nome: 'Bia', papel: 'dono', ativo: true, atende: true }, equipe: [], servicos: [], vejoFinanceiro: true, cuidoDoFinanceiro: true, fusoMin: -180, agora: '2026-11-17T10:00' };
  const usar = (id, name, input) => ({ type: 'tool_use', id, name, input });
  await ta('sem tempo para mais uma chamada: o Mozart responde com o que tem, sem chamar o modelo de novo', async () => {
    let relogio = 0, chamadas = 0;
    const tempos = [];
    const s = await C.voltas({
      c, mensagens: [{ role: 'user', content: 'como está?' }], liberado: true, contar: async () => true, relogio: () => relogio, inicioDoPedido: 0, prazoMs: 1e9,
      chamar: async (_m, _ao, tempo) => {
        chamadas++; tempos.push(tempo);
        relogio += 24_000; // cada volta gastou 24 s
        return { content: [{ type: 'text', text: `Volta ${chamadas}.` }, usar(`f${chamadas}`, 'ferramenta_que_nao_existe', {})], stop_reason: 'tool_use' };
      },
    });
    // 0 s -> 24 s -> 48 s: na terceira sobram 2 s (menos que a folga) e ela não começa
    assert.equal(chamadas, 2);
    assert.deepEqual(tempos, [{ volta: 0, restaMs: 50_000 }, { volta: 1, restaMs: 26_000 }]);
    assert.equal(s.tipo, 'ok');
    assert.equal(s.cortou, true);
    assert.match(s.texto, /Volta 1\./);
  });
  await ta('o modelo não respondeu a tempo depois da primeira volta: responde com o que já tem (não vira erro)', async () => {
    let n = 0;
    const s = await C.voltas({
      c, mensagens: [{ role: 'user', content: 'como está?' }], liberado: true, contar: async () => true,
      chamar: async () => {
        n++;
        if (n === 1) return { content: [{ type: 'text', text: 'Vou olhar.' }, usar('a', 'ferramenta_que_nao_existe', {})], stop_reason: 'tool_use' };
        throw Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError' });
      },
    });
    assert.equal(s.tipo, 'ok');
    assert.equal(s.cortou, true);
    assert.equal(s.texto, 'Vou olhar.');
  });
  await ta('na primeira volta o erro sobe como antes (a rota responde "não respondeu agora")', async () => {
    await assert.rejects(C.voltas({ c, mensagens: [{ role: 'user', content: 'oi' }], liberado: true, contar: async () => true,
      chamar: async () => { throw Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError' }); } }), /timed out/);
  });
  t('entrada de estoque do Mozart vai pela mesma função das telas (estoque_entrada), com a validade', () => {
    const f = fs.readFileSync(path.join(RAIZ, 'src/lib/gestao/assistente/ferramentas.ts'), 'utf8');
    const i = f.lastIndexOf('case "movimentar_estoque"');
    const trecho = f.slice(i, i + 3500);
    assert.match(trecho, /sb\.rpc\("estoque_entrada"/);
    assert.match(trecho, /p_despesa: comDespesa \?/);
    assert.doesNotMatch(trecho, /from\("lancamentos"\)\.insert/, 'a despesa não é mais uma gravação à parte');
    assert.match(f, /Esse produto controla validade: pergunte a validade/);
  });

  T.secao('tutor: e-mail e endereço só para quem tem a área Clientes');
  t('nenhuma tela lê clientes com select("*")', () => {
    const R = lib('reservado');
    assert.doesNotMatch(R.COLS_CLIENTE, /email|endereco/);
    assert.match(R.colsDoTutor(true), /email, endereco/);
    assert.equal(R.colsDoTutor(false), R.COLS_CLIENTE);
    assert.deepEqual(R.tutorLido({ id: '1', nome: 'Ana' }), { email: null, endereco: null, id: '1', nome: 'Ana' });
    for (const a of ['clientes/lista.tsx', 'clientes/ficha-tutor.tsx', 'clientes/form-tutor.tsx', 'clientes/ficha-pet.tsx']) {
      const s = fs.readFileSync(path.join(RAIZ, 'src/components/gestao', a), 'utf8');
      assert.doesNotMatch(s, /from\("clientes"\)\.select\("\*"\)|clientes\(\*\)/, a);
    }
  });
}))();
