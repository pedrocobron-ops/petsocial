// Promoção em dias fracos, aniversário do tutor e pacote acabando pela tela (migração 20261205), em 390 e 1366, com a dona.
// A loja tem a promoção "Semana do banho" (todos os dias, 10% no Banho), o banho do Thor de hoje (com a promoção), o pacote do
// Thor com 1 uso sobrando e o aniversário da Ana hoje (sem o ano).
// 390: Meu pet shop mostra a promoção e cria outra; o link do cliente mostra "10% off" nos horários e "de R$ 60 por R$ 54" com o
// porte M; o horário do Thor mostra a linha da promoção e o aviso do pacote; Fechar a conta mostra a promoção (R$ 6) e tira com um
// toque; a ficha da Ana mostra o aniversário e o pacote acabando; Aniversariantes do mês com "Dar parabéns".
// 1366: Pacotes acabando, "Vender de novo" abre a venda; Relatórios com o bloco Promoções; Mandar mensagens com o aniversário do
// tutor; a ficha da Ana com o campo Aniversário. Sem rolagem para o lado, sem erro na página. Capturas em testes/saida/.
const fs = require('fs');
const path = require('path');
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('promo-niver-pacote-tela');

const SAIDA = path.join(__dirname, '..', 'saida');

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Promo tela', modulos: ['banho_tosa', 'creche', 'hotel', 'loja', 'pacotes'] });
  const { dono } = L.sb;
  const P = L.P;
  fs.mkdirSync(SAIDA, { recursive: true });
  const foto = async (page, nome) => { await page.waitForTimeout(600); return page.screenshot({ path: path.join(SAIDA, `promo-niver-pacote-${nome}.png`), fullPage: true }); };
  const semRolagem = async (page, onde) => T.ok(`sem rolagem para o lado (${onde})`, (await N.rolagemLateral(page)) <= 0);

  B.must(await dono.rpc('promocao_salvar', { p: P, p_id: null, p_dados: { nome: 'Semana do banho', dias: [0, 1, 2, 3, 4, 5, 6], hora_de: null, hora_ate: null, servicos: [L.S.Banho], tipo: 'pct', valor: 10, comeca_em: null, termina_em: null, ativa: true } }), 'promoção');
  const ini = B.instante(L.hoje, '09:00', L.fuso);
  const agThor = B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets.Thor, servico_id: L.S.Banho, profissional_id: L.ids.tosador, inicio: ini.toISOString(), fim: new Date(+ini + 36e5).toISOString(), preco: 60 }).select('id, promo').single(), 'Thor');
  if (!agThor.promo) throw new Error('o horário do Thor veio sem a promoção');
  B.sql(`insert into pacotes_clientes (petshop_id, pet_id, nome, servico_id, total, usados, comprado_em, preco, ativo) values ('${P}', '${L.pets.Thor}', 'Pacote 4 banhos', '${L.S.Banho}', 4, 3, '${L.dia(-20)}', 200, true)`);
  B.must(await dono.from('clientes').update({ nascimento: `1904-${L.hoje.slice(5)}` }).eq('id', L.tutores.Ana).select('id'), 'aniversário da Ana');

  T.secao('celular (390)');
  let { ctx, page, erros } = await N.contexto(390, 844);
  await ctx.route('https://wa.me/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>WhatsApp</p>' }));
  await N.entrar(page, L.emails.dono, L.senha);

  // Meu pet shop: o cartão das promoções (o atalho #promocoes abre o grupo)
  await N.ir(page, '/gestao/app/meu-petshop#promocoes');
  const cartao = page.locator('#promocoes');
  await cartao.waitFor({ timeout: 30000 });
  await cartao.scrollIntoViewIfNeeded();
  T.ok('Meu pet shop: a promoção com o resumo e os botões de divulgar', /Semana do banho/.test(await cartao.innerText()) && /Todos os dias: 10% de desconto em banho\./.test(await cartao.innerText()) && (await cartao.locator('button', { hasText: 'Copiar o texto' }).count()) === 1, await cartao.innerText());
  const zap = await cartao.locator('a', { hasText: 'Abrir no WhatsApp' }).getAttribute('href');
  T.ok('"Abrir no WhatsApp" abre só com o texto (sem número, ninguém recebe sozinho)', zap.startsWith('https://wa.me/?text=') && /tem 10% de desconto em banho/.test(decodeURIComponent(zap)) && !/só hoje/i.test(decodeURIComponent(zap)), zap);
  await cartao.locator('button', { hasText: 'Nova promoção' }).click();
  const fp = page.locator('.g-folha').last();
  await fp.locator('input').first().fill('Manhã de terça');
  await fp.locator('button.g-chip', { hasText: 'Ter' }).click(); // já vinha marcada: desmarca
  await fp.locator('button.g-chip', { hasText: 'Ter' }).click(); // marca de novo
  await fp.locator('button', { hasText: 'Só numa faixa' }).click();
  await fp.locator('button', { hasText: 'Em reais' }).click();
  await fp.locator('input[aria-label="Desconto em reais"]').fill('10');
  await foto(page, '390-nova-promocao');
  await semRolagem(page, 'nova promoção');
  await fp.locator('button.g-btn.pri', { hasText: 'Salvar' }).click();
  await cartao.locator('.g-promo-item', { hasText: 'Manhã de terça' }).waitFor({ timeout: 10000 });
  T.ok('a promoção nova entra na lista ("Terça, antes das 11h: R$ 10 de desconto")', /Terça, antes das 11h: R\$ 10 de desconto em banho e tosa\./.test(await cartao.innerText()), await cartao.innerText());
  T.ok('… e no banco', B.num(`select count(*) from promocoes where petshop_id='${P}' and nome='Manhã de terça' and tipo='reais' and valor=10 and hora_ate='11:00' and dias='{2}'`) === 1);
  // desliga a nova (o link e a agenda daqui para a frente ficam só com a Semana do banho)
  await cartao.locator('.g-promo-item', { hasText: 'Manhã de terça' }).locator('button', { hasText: 'Desligar' }).click();
  await cartao.locator('.g-promo-item', { hasText: 'Manhã de terça' }).locator('.g-tag', { hasText: 'desligada' }).waitFor({ timeout: 10000 });
  T.ok('"Desligar": a promoção fica desligada', B.num(`select count(*) from promocoes where petshop_id='${P}' and nome='Manhã de terça' and not ativa`) === 1);
  await foto(page, '390-meu-petshop');
  await semRolagem(page, 'Meu pet shop');

  // o horário do Thor: a linha da promoção e o aviso do pacote
  await N.ir(page, `/gestao/app/agenda?dia=${L.hoje}`);
  await page.locator('.g-hora-grupo, .g-ag', { hasText: 'Thor' }).first().click();
  const det = page.locator('.g-folha').last();
  await det.locator('.g-promo-linha').waitFor({ timeout: 15000 });
  T.ok('horário: "Promoção Semana do banho" com − R$ 6,00 (a dona vê o dinheiro)', /Promoção Semana do banho/.test(await det.locator('.g-promo-linha').innerText()) && /R\$\s?6,00/.test(await det.locator('.g-promo-linha').innerText()), await det.locator('.g-promo-linha').innerText());
  await det.locator('.g-pac-aviso').waitFor({ timeout: 15000 });
  T.ok('… e o aviso do pacote: falta 1 uso, com "Oferecer renovar"', /falta 1 uso/.test(await det.locator('.g-pac-aviso').innerText()) && (await det.locator('.g-pac-aviso a', { hasText: 'Oferecer renovar' }).count()) === 1);
  T.ok('… o botão Fechar a conta já mostra o valor com a promoção (R$ 54)', /Fechar a conta · R\$\s?54,00/.test(await det.innerText()) || /Cobrar à parte, sem usar o pacote · R\$\s?54,00/.test(await det.innerText()), await det.locator('button.g-btn.cheio').allInnerTexts());
  await foto(page, '390-horario');
  await semRolagem(page, 'horário');
  await det.locator('button', { hasText: /Fechar a conta|Cobrar à parte/ }).first().click();
  const conta = page.locator('.g-folha').last();
  await conta.locator('.g-promo-conta').waitFor({ timeout: 15000 });
  T.ok('Fechar a conta: a linha "Promoção Semana do banho −10%" com − R$ 6,00 e o total R$ 54,00', /Promoção Semana do banho −10%/.test(await conta.locator('.g-promo-conta').innerText()) && /54,00/.test(await conta.locator('.g-vd-total').innerText()), await conta.locator('.g-vd-total').innerText());
  await foto(page, '390-conta');
  await semRolagem(page, 'Fechar a conta');
  await conta.locator('.g-promo-conta button', { hasText: 'Tirar' }).click();
  await page.getByRole('button', { name: 'Tirar a promoção', exact: true }).click();
  await conta.locator('.g-promo-conta').waitFor({ state: 'detached', timeout: 10000 });
  T.ok('tirou: a conta volta para R$ 60,00 e o horário fica com a promoção tirada', /60,00/.test(await conta.locator('.g-vd-total').innerText()) && JSON.parse(B.sql(`select promo from agendamentos where id='${agThor.id}'`)).tirada === true);
  await conta.locator('button.g-link', { hasText: 'Pôr de volta' }).click();
  await conta.locator('.g-promo-conta').waitFor({ timeout: 10000 });
  T.ok('"Pôr de volta": a promoção volta para a conta', /54,00/.test(await conta.locator('.g-vd-total').innerText()));

  // a ficha da Ana: aniversário e o pacote acabando
  await N.ir(page, `/gestao/app/clientes?cliente=${L.tutores.Ana}`, '.gc-ficha');
  const ficha = page.locator('.gc-ficha');
  await ficha.locator('.g-pac-aviso').waitFor({ timeout: 15000 });
  T.ok('ficha da Ana: "Aniversário hoje" e o aniversário sem o ano', /Aniversário hoje/.test(await ficha.innerText()) && new RegExp(`Aniversário\\s*${Number(L.hoje.slice(8))} de `).test(await ficha.innerText()), (await ficha.innerText()).slice(0, 600));
  T.ok('… e o pacote do Thor acabando', /Pacote 4 banhos: falta 1 uso/.test(await ficha.locator('.g-pac-aviso').innerText()));
  await foto(page, '390-ficha');
  await semRolagem(page, 'ficha');

  // Aniversariantes do mês
  await N.ir(page, '/gestao/app/clientes');
  await N.doAlto(page, 'Aniversariantes do mês');
  const niver = page.locator('.g-folha').last();
  await niver.locator('.g-niver-linha').first().waitFor({ timeout: 15000 });
  const parabens = niver.locator('.g-niver-linha', { hasText: 'Ana Souza' }).locator('a', { hasText: 'Dar parabéns' });
  const hrefNiver = await parabens.getAttribute('href');
  T.ok('Aniversariantes do mês: Ana hoje, com "Dar parabéns" no WhatsApp dela e o texto padrão', hrefNiver.startsWith('https://wa.me/5511988880001?text=') && /Hoje é o seu aniversário!/.test(decodeURIComponent(hrefNiver)), hrefNiver);
  await foto(page, '390-aniversariantes');
  await semRolagem(page, 'aniversariantes');
  T.ok('390: sem erro na página', !erros.length, erros);
  await ctx.close();

  T.secao('link do cliente (390)');
  ({ ctx, page, erros } = await N.contexto(390, 844));
  await N.ir(page, `/gestao/agendar/${L.codigo}`, '.g-lk');
  await page.locator('.g-lk-serv', { hasText: 'Banho' }).first().waitFor({ timeout: 30000 });
  const cartaoBanho = page.locator('.g-lk-serv').filter({ has: page.locator('b', { hasText: /^Banho$/ }) });
  await cartaoBanho.locator('.g-lk-promo-serv').first().waitFor({ timeout: 10000 });
  T.ok('o serviço Banho mostra "10% off · todos os dias" (a promoção desligada não aparece)', /10% off · todos os dias/.test(await cartaoBanho.innerText()) && (await cartaoBanho.locator('.g-lk-promo-serv').count()) === 1, await cartaoBanho.innerText());
  await cartaoBanho.click();
  await page.locator('[data-teste=escolha-servicos] button').click();
  await page.locator('.g-lk-hora').first().waitFor({ timeout: 30000 });
  const comPromo = page.locator('.g-lk-hora.com-promo');
  T.ok('os horários mostram "10% off"', (await comPromo.count()) > 0 && /10% off/.test(await comPromo.first().innerText()));
  await comPromo.first().click();
  await page.locator('.g-lk-promo').waitFor();
  T.ok('escolhido: "Promoção Semana do banho: 10% off" (o preço muda com o porte: sem "de/por" inventado)', /Promoção Semana do banho: 10% off/.test(await page.locator('.g-lk-promo').innerText()) && !/De R\$/.test(await page.locator('.g-lk-promo').innerText()));
  await foto(page, '390-link-horarios');
  await semRolagem(page, 'link');
  await page.locator('button', { hasText: 'Continuar' }).click();
  await page.locator('.g-lk-opcao.porte', { hasText: 'M' }).first().click();
  // rodada 9 (N7): no passo dos dados, o valor vem numa linha por pet ("porte M · 10% off: R$ 60,00 riscado, R$ 54,00"), não mais na frase "De X por Y"
  const valorNoLink = await page.locator('[data-teste=valor-do-pedido]').innerText();
  T.ok('porte M: de R$ 60,00 por R$ 54,00 (60 é o preço da lista do porte M)', /porte M/.test(valorNoLink) && /R\$\s?60,00/.test(valorNoLink) && /R\$\s?54,00/.test(valorNoLink) && /Semana do banho/.test(valorNoLink), valorNoLink);
  await foto(page, '390-link-dados');
  await semRolagem(page, 'link, seus dados');
  T.ok('link: sem erro na página', !erros.length, erros);
  await ctx.close();

  T.secao('computador (1366)');
  ({ ctx, page, erros } = await N.contexto(1366, 900));
  await N.entrar(page, L.emails.dono, L.senha);
  await N.ir(page, '/gestao/app/pacotes');
  const acabando = page.locator('.g-pac-acabando');
  await acabando.waitFor({ timeout: 30000 });
  T.ok('Pacotes: "Pacotes acabando (1)" com o Thor', /Pacotes acabando \(1\)/.test(await acabando.innerText()) && /Thor · Pacote 4 banhos: falta 1 uso/.test(await acabando.innerText()), await acabando.innerText());
  await foto(page, '1366-pacotes');
  await semRolagem(page, 'Pacotes');
  await acabando.locator('button', { hasText: 'Vender de novo' }).click();
  T.ok('"Vender de novo" abre a renovação já preenchida', /Renovar pacote/.test(await page.locator('.g-folha').last().innerText()));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  await N.ir(page, '/gestao/app/relatorios');
  const rel = page.locator('section[aria-label="Promoções"]');
  await rel.waitFor({ timeout: 30000 });
  T.ok('Relatórios: bloco Promoções com a Semana do banho (1 horário marcado)', /Semana do banho/.test(await rel.innerText()) && /1 horário marcado/.test(await rel.innerText()), await rel.innerText());
  await foto(page, '1366-relatorios');
  await semRolagem(page, 'Relatórios');

  await N.ir(page, '/gestao/app/mensagens');
  await page.locator('.g-me-tipos').waitFor({ timeout: 30000 });
  T.ok('Mandar mensagens: "Aniversário do tutor hoje"', (await page.locator('.g-me-chave[aria-label^="Aniversário do tutor"]').count()) === 1, await page.locator('.g-me-tipos').innerText());
  await foto(page, '1366-mensagens');

  await N.ir(page, `/gestao/app/clientes?cliente=${L.tutores.Ana}`, '.gc-ficha');
  await page.locator('.gc-ficha button', { hasText: 'Editar' }).click();
  const form = page.locator('.g-folha').last();
  T.ok('Editar o tutor: o campo Aniversário com o dia e o mês, ano em branco', (await form.locator('select[aria-label="Dia do aniversário"]').inputValue()) === String(Number(L.hoje.slice(8)))
    && (await form.locator('select[aria-label="Mês do aniversário"]').inputValue()) === String(Number(L.hoje.slice(5, 7))) && (await form.locator('input[aria-label="Ano de nascimento (opcional)"]').inputValue()) === '');
  await form.locator('input[aria-label="Ano de nascimento (opcional)"]').fill('1985');
  await form.locator('button.g-btn.pri', { hasText: 'Salvar' }).click();
  await page.waitForTimeout(1200);
  T.ok('… salvar com o ano grava a data completa', B.sql(`select nascimento from clientes where id='${L.tutores.Ana}'`) === `1985-${L.hoje.slice(5)}`);
  await foto(page, '1366-ficha');
  await semRolagem(page, 'ficha');
  T.ok('1366: sem erro na página', !erros.length, erros);
  await ctx.close();
  await N.fecharNavegador();
}))();
