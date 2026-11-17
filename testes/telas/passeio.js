// Passeio pelas telas: cada tela principal, no celular (390) e no computador (1366), com cada papel da equipe.
// Em cada uma: nenhum erro na página nem no console, nenhum pedido recusado (fora a IA, que no teste tem chave falsa),
// sem rolagem para o lado e com conteúdo na tela. Também as páginas públicas (produto, link do cliente, página do tutor).
// FOTOS=1 guarda as capturas em testes/saida/.
const fs = require('fs');
const path = require('path');
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('passeio');

const APP = ['', '/agenda', '/clientes', '/creche-hotel', '/pacotes', '/mensagens', '/caixa', '/financeiro', '/relatorios', '/estoque', '/equipe', '/meu-petshop', '/assinatura', '/manual', '/escola'];
const PAPEIS = {
  dono: APP,
  caixa: ['', '/agenda', '/clientes', '/creche-hotel', '/pacotes', '/mensagens', '/caixa'],
  monitor: ['', '/clientes', '/creche-hotel', '/mensagens'],
  tosador: ['', '/agenda', '/clientes', '/mensagens'],
  estoque: ['', '/estoque'],
};
// fora da área da pessoa: a tela tem de abrir sem erro (mostra o aviso ou volta para o início), nunca quebrar
const FORA = { tosador: ['/financeiro', '/caixa'], monitor: ['/agenda', '/relatorios'], estoque: ['/clientes', '/mensagens'] };
const TAMANHOS = [[390, 844], [1366, 900]];
const SAIDA = path.join(__dirname, '..', 'saida');

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Passeio' });
  const { dono } = L.sb;
  const P = L.P;
  // um dia com movimento: horários, uma conta recebida, caixa aberto, hotel e creche
  B.must(await dono.from('caixas').insert({ petshop_id: P, valor_inicial: 100 }).select('id'), 'caixa');
  for (const [pet, h, status] of [['Thor', '09:00', 'concluido'], ['Bob', '11:00', 'marcado'], ['Luna', '15:00', 'confirmado']]) {
    const ini = B.instante(L.hoje, h, L.fuso);
    const ag = B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets[pet], servico_id: L.S.Banho, profissional_id: L.ids.tosador, inicio: ini.toISOString(), fim: new Date(+ini + 36e5).toISOString(), preco: 60, status }).select('id').single(), 'horário').id;
    if (status === 'concluido') B.must(await dono.from('lancamentos').insert({ petshop_id: P, tipo: 'entrada', valor: 60, forma: 'pix', categoria: 'Banho e tosa', data: L.hoje, pago: true, agendamento_id: ag, cliente_id: L.petsDe[pet], itens: [{ tipo: 'servico', nome: 'Banho', qtd: 1, valor: 60 }] }).select('id'), 'conta');
  }
  B.must(await dono.from('estadias').insert({ petshop_id: P, pet_id: L.pets.Rex, tipo: 'hotel', status: 'em_casa', entrada: new Date(Date.now() - 864e5).toISOString(), saida_prevista: new Date(Date.now() + 2 * 864e5).toISOString(), valor_diaria: 120 }).select('id'), 'hotel');
  const plano = B.must(await dono.from('creche_planos').insert({ petshop_id: P, pet_id: L.pets.Mel, dias: [1, 2, 3, 4, 5], inicio: L.mesAnterior, vence_dia: 10 }).select('id').single(), 'plano').id;
  B.must(await dono.from('creche_planos_valores').upsert({ plano_id: plano, petshop_id: P, valor_mensal: 500, valor_extra: 45 }).select('plano_id'), 'valor do plano');
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'casa.tutor': { ativo: true, dias_fotos: 90 } } }), 'página do tutor');
  const token = B.must(await dono.rpc('tutor_link', { p_cliente: L.tutores.Ana }), 'link do tutor');
  if (process.env.FOTOS) fs.mkdirSync(SAIDA, { recursive: true });

  const conferir = async (page, erros, nome, larg, comMain = true) => {
    const lado = await N.rolagemLateral(page);
    const texto = comMain ? (await page.locator('.g-main').first().innerText().catch(() => '')).trim() : (await page.locator('body').innerText()).trim();
    const novos = erros.splice(0);
    T.ok(`${nome} (${larg})`, novos.length === 0 && lado <= 2 && texto.length >= 20, { erros: novos.slice(0, 4), rolagemLateral: lado, letras: texto.length });
    if (process.env.FOTOS) await page.screenshot({ path: path.join(SAIDA, `${larg}-${nome.replace(/[^\w-]+/g, '_')}.png`), fullPage: larg > 500 }).catch(() => {});
  };

  for (const [larg, alt] of TAMANHOS) {
    T.secao(`telas do aplicativo — ${larg}px`);
    for (const [papel, rotas] of Object.entries(PAPEIS)) {
      const { ctx, page, erros } = await N.contexto(larg, alt);
      await N.entrar(page, L.emails[papel], L.senha);
      for (const r of rotas) { await N.ir(page, '/gestao/app' + r); await N.fecharAvisos(page); await conferir(page, erros, `${papel} ${r || '/ (Hoje)'}`, larg); }
      for (const r of FORA[papel] ?? []) { await N.ir(page, '/gestao/app' + r); await conferir(page, erros, `${papel} ${r} (fora da área)`, larg); }
      if (papel === 'dono') {
        await N.ir(page, '/gestao/app/agenda');
        const semana = page.locator('.g-seg button', { hasText: 'Semana' }).first();
        if (larg > 500 && await semana.count()) { await semana.click(); await page.waitForTimeout(800); await conferir(page, erros, 'dono /agenda (semana)', larg); }
        for (const r of [`/agenda/imprimir?dia=${L.hoje}`, '/caixa/imprimir', '/creche-hotel/folha']) { await N.ir(page, '/gestao/app' + r, null); await conferir(page, erros, `dono ${r.split('?')[0]} (impressão)`, larg, false); }
        await N.ir(page, '/gestao/admin', null); await page.waitForTimeout(800);
        const adm = erros.splice(0).filter((e) => !/HTTP 4\d\d .*rest\/v1\/rpc\/admin_/.test(e));
        T.ok(`dono comum em /gestao/admin não vê o painel e a página não quebra (${larg})`, adm.length === 0 && !/Visão geral/.test(await page.locator('body').innerText()), adm);
      }
      await ctx.close();
    }
    T.secao(`páginas públicas — ${larg}px`);
    const { ctx, page, erros } = await N.contexto(larg, alt);
    for (const [nome, rota] of [['produto /gestao', '/gestao'], ['entrar', '/gestao/entrar'], ['link do cliente', `/gestao/agendar/${L.codigo}`], ['página do tutor', `/gestao/tutor/${token}`]]) {
      await N.ir(page, rota, null); await conferir(page, erros, nome, larg, false);
    }
    await ctx.close();
  }
  await N.fecharNavegador();
}))();
