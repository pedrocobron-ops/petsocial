// Fotos nas redes e Bom dia, pela tela (390 e 1366), migração 20261196.
// Página do boletim: "Pode postar a foto do Thor nas redes …", nada marcado (Autorizar apagado até escolher), a prévia do texto
// com o @, "Pode postar desde dd/mm" e "Não quero mais" (confirma e tira). Equipe: a ficha do pet e o álbum mostram
// "Pode postar ✓ (desde dd/mm)" e, depois de retirada, "Sem autorização". Hoje: o cartão "Bom dia" com até 3 linhas, sem valor
// para o tosador, "Perguntar ao Mozart" e "Dispensar por hoje" (não volta ao recarregar). Sem rolagem para o lado, sem erro.
const fs = require('fs');
const path = require('path');
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('fotos-redes-tela');

const JPG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');
const SAIDA = path.join(__dirname, '..', 'saida');

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Redes tela' });
  const { dono, tosador } = L.sb;
  const P = L.P;
  B.sql(`update pets set sexo = 'M' where id = '${L.pets.Thor}'`);
  fs.mkdirSync(SAIDA, { recursive: true });
  const foto = async (page, nome) => { if (process.env.FOTOS) await page.screenshot({ path: path.join(SAIDA, `fotos-redes-${nome}.png`), fullPage: true }); };

  // o banho do Thor de hoje com um boletim de uma foto; a Ana deve 40 (o Bom dia do dono mostra, o do tosador não)
  const ini = B.instante(L.hoje, '09:00', L.fuso);
  const ag = B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets.Thor, servico_id: L.S.Banho, profissional_id: L.ids.tosador, inicio: ini.toISOString(), fim: new Date(+ini + 36e5).toISOString(), preco: 60 }).select('id').single(), 'horário').id;
  const c = `${P}/${B.uuid()}.jpg`;
  B.must(await tosador.storage.from('boletim').upload(c, JPG, { contentType: 'image/jpeg' }), 'foto');
  const s = B.must(await tosador.storage.from('boletim').createSignedUrl(c, 61 * 86400), 'assinar');
  const bol = B.must(await tosador.rpc('boletim_salvar', { p_petshop: P, p_id: null, p_pet: L.pets.Thor, p_agendamento: ag, p_estadia: null, p_texto: 'Thor foi ótimo.', p_chips: [], p_nota: '', p_atencao: '', p_fotos: [{ caminho: c, assinatura: new URL(s.signedUrl).searchParams.get('token') }] }), 'boletim');
  B.sql(`insert into lancamentos (petshop_id, tipo, valor, categoria, descricao, data, vencimento, pago, cliente_id, origem) values ('${P}', 'entrada', 40, 'Banho e tosa', 'Banho', '${L.hoje}', '${L.hoje}', false, '${L.tutores.Ana}', 'tela')`);

  T.secao('celular: o tutor autoriza na página do boletim');
  let { ctx, page, erros } = await N.contexto(390, 844);
  await page.goto(`${B.BASE_URL}/gestao/boletim/${bol.token}`);
  const pode = page.locator('[data-teste=pode-postar]');
  await pode.waitFor({ timeout: 30000 });
  T.ok('o botão diz "Pode postar a foto do Thor nas redes …"', /^Pode postar a foto do Thor nas redes (do|da) /.test((await pode.textContent()).trim()), await pode.textContent());
  await pode.click();
  const autorizar = page.locator('.g-bo-redes button.g-btn', { hasText: 'Autorizar' });
  T.ok('nada vem marcado: nenhuma opção escolhida e Autorizar apagado', (await page.locator('.g-bo-redes-op[aria-checked=true]').count()) === 0 && await autorizar.isDisabled());
  await page.locator('.g-bo-redes-op', { hasText: 'Também as das próximas visitas' }).click();
  await page.locator('.g-bo-redes input').fill('instagram.com/ana.pets');
  const previa = (await page.locator('[data-teste=texto-da-autorizacao] p').textContent()).trim();
  T.ok('a prévia é o texto que vai ser guardado, com o @', /^Autorizo .* as fotos do Thor deste boletim e das próximas visitas\. Pode marcar o meu perfil @ana\.pets\. Posso tirar/.test(previa), previa);
  T.ok('sem rolagem para o lado (390)', (await N.rolagemLateral(page)) <= 0);
  await foto(page, '390-escolha');
  await autorizar.click();
  await page.locator('[data-teste=autorizacao-feita]').waitFor({ timeout: 15000 });
  const guardado = B.sql(`select texto from fotos_autorizacoes where pet_id = '${L.pets.Thor}' and retirado_em is null`);
  T.ok('o banco guardou exatamente o texto da prévia', guardado === previa, guardado);
  T.ok('a página mostra "Pode postar desde" e "Não quero mais"', /Pode postar\s*desde \d\d\/\d\d/.test(await page.locator('[data-teste=autorizacao-feita]').textContent()) && await page.locator('.g-bo-redes-sair').isVisible());
  await foto(page, '390-autorizado');
  T.ok('nenhum erro na página do boletim (390)', erros.length === 0, erros);
  await ctx.close();

  T.secao('computador: a equipe vê na ficha e no álbum');
  ({ ctx, page, erros } = await N.contexto(1366, 900));
  await N.entrar(page, L.emails.dono, L.senha);
  const bomdia = page.locator('[data-teste=bom-dia]');
  await bomdia.waitFor({ timeout: 20000 }).catch(() => {});
  const linhas = await bomdia.locator('li').allTextContents();
  T.ok('Hoje: o Bom dia aparece com 1 a 3 linhas', linhas.length >= 1 && linhas.length <= 3, linhas);
  T.ok('dono: a linha de quem deve (Ana, R$ 40,00) aparece', linhas.some((l) => /Ana Souza deve R\$\s40,00/.test(l)), linhas);
  T.ok('a linha do dia diz quantos horários', /1 horário na agenda/.test(linhas[0] || ''), linhas);
  await foto(page, '1366-hoje');
  // o pedido vai para o Mozart pelo evento da tela (sem abrir a conversa: o servidor de teste não tem modelo)
  await page.evaluate(() => { window.__pedido = null; window.addEventListener('gestao:assistente', (e) => { window.__pedido = e.detail; e.stopImmediatePropagation(); }, { capture: true }); });
  await bomdia.locator('button', { hasText: 'Perguntar ao Mozart' }).click();
  T.ok('"Perguntar ao Mozart" manda o pedido do dia ao Mozart', /O que tenho de mais importante hoje/.test(await page.evaluate(() => window.__pedido) || ''));
  await N.ir(page, `/gestao/app/clientes?pet=${L.pets.Thor}`);
  let linha = page.locator('[data-teste=fotos-nas-redes]');
  await linha.waitFor({ timeout: 20000 }).catch(() => {});
  if (!(await linha.count())) { await page.locator('.g-linha', { hasText: 'Thor' }).first().click(); await linha.waitFor({ timeout: 20000 }); }
  await page.waitForTimeout(800);
  T.ok('ficha do pet: "Pode postar ✓ (desde dd/mm)" e o @', /Pode postar ✓ \(desde \d\d\/\d\d\)/.test(await linha.textContent()) && /@ana\.pets/.test(await linha.textContent()), await linha.textContent());
  const album = page.locator('.g-bol-album');
  T.ok('álbum: a visita do boletim com "Pode postar ✓"', /Pode postar ✓/.test(await album.textContent().catch(() => '')), await album.textContent().catch(() => ''));
  T.ok('sem rolagem para o lado (1366)', (await N.rolagemLateral(page)) <= 0);
  await foto(page, '1366-ficha');

  // o tutor tira pelo link "Não quero mais"
  const codigo = await (async () => { const p2 = await ctx.newPage(); await p2.goto(`${B.BASE_URL}/gestao/boletim/${bol.token}`); const h = await p2.locator('.g-bo-redes-sair').getAttribute('href'); await p2.goto(B.BASE_URL + h); await p2.locator('[data-teste=nao-quero-mais]').click(); await p2.locator('[data-teste=confirmar-retirar]').click(); await p2.locator('[data-teste=retirada]').waitFor({ timeout: 15000 }); if (process.env.FOTOS) await p2.screenshot({ path: path.join(SAIDA, 'fotos-redes-1366-retirada.png'), fullPage: true }); await p2.close(); return h; })();
  T.ok('"Não quero mais" pediu confirmação e tirou', Boolean(codigo) && B.sql(`select count(*) from fotos_autorizacoes where pet_id = '${L.pets.Thor}' and retirado_em is null`) === '0');
  await page.reload();
  linha = page.locator('[data-teste=fotos-nas-redes]');
  await linha.waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  T.ok('depois de retirada, a ficha mostra "Sem autorização"', /Sem autorização/.test(await linha.textContent()), await linha.textContent());
  T.ok('nenhum erro nas telas da equipe (1366)', erros.length === 0, erros);
  await ctx.close();

  T.secao('celular: o tosador não vê dinheiro e dispensa por hoje');
  ({ ctx, page, erros } = await N.contexto(390, 844));
  await N.entrar(page, L.emails.tosador, L.senha);
  const bd2 = page.locator('[data-teste=bom-dia]');
  await bd2.waitFor({ timeout: 20000 }).catch(() => {});
  const l2 = await bd2.locator('li').allTextContents();
  T.ok('tosador: o Bom dia aparece, sem valor nem quem deve', l2.length >= 1 && !l2.some((l) => /R\$|deve/.test(l)), l2);
  T.ok('sem rolagem para o lado (390, Hoje)', (await N.rolagemLateral(page)) <= 0);
  await foto(page, '390-hoje-tosador');
  await bd2.locator('button[aria-label="Dispensar o resumo por hoje"]').click();
  T.ok('"Dispensar por hoje" fecha o cartão', (await page.locator('[data-teste=bom-dia]').count()) === 0);
  await page.reload();
  await page.waitForSelector('.g-main');
  await page.waitForTimeout(1500);
  T.ok('recarregando no mesmo dia, não volta', (await page.locator('[data-teste=bom-dia]').count()) === 0);
  T.ok('nenhum erro (390)', erros.length === 0, erros);
  await ctx.close();
  await N.fecharNavegador();
}))();
