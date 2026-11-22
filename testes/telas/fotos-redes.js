// Fotos nas redes, pela tela (390 e 1366), migração 20261196.
// Página do boletim: "Pode postar a foto do Thor nas redes …", nada marcado (Autorizar apagado até escolher), a prévia do texto
// com o @, "Pode postar desde dd/mm" e "Não quero mais" (confirma e tira). Equipe: a ficha do pet e o álbum mostram
// "Pode postar ✓ (desde dd/mm)" e, depois de retirada, "Sem autorização". Sem rolagem para o lado, sem erro.
// O cartão "Bom dia" da tela Hoje, que este arquivo também conferia, virou a folha do Resumo do dia (telas/resumo-do-dia.js).
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
  // rodada 9 (N7): uma pergunta ("Pode postar a foto do Thor nas redes …?") e um botão de escolha ("Quero autorizar"), não um botão com cara de aviso
  const pergunta = ((await page.locator('[data-teste=pergunta-das-fotos]').textContent()) ?? '').trim();
  T.ok('a página pergunta "Pode postar a foto do Thor nas redes …?"', /^Pode postar a foto do Thor nas redes (do|da) .+\?$/.test(pergunta), pergunta);
  T.ok('o botão é uma escolha: "Quero autorizar"', (await pode.textContent()).trim() === 'Quero autorizar', await pode.textContent());
  await pode.click();
  const autorizar = page.locator('.g-bo-redes button.g-btn', { hasText: 'Autorizar' });
  T.ok('nada vem marcado: nenhuma opção escolhida e Autorizar apagado', (await page.locator('.g-bo-redes-op[aria-checked=true]').count()) === 0 && await autorizar.isDisabled());
  await page.locator('.g-bo-redes-op', { hasText: 'Também as das próximas visitas' }).click();
  await page.locator('.g-bo-redes input').fill('instagram.com/ana.pets');
  const previa = (await page.locator('[data-teste=texto-da-autorizacao] p').textContent()).trim();
  T.ok('a prévia é o texto que vai ser guardado, com o @', /^Autorizo .* as fotos do Thor deste boletim e das próximas visitas, para mostrar o trabalho da loja\. .* Pode marcar o meu perfil @ana\.pets\. Posso tirar/.test(previa), previa);
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
  // (o cartão "Bom dia" da tela Hoje virou a folha do Resumo do dia: telas/resumo-do-dia.js)
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
  let tituloAntes = '', tituloDepois = '';
  const codigo = await (async () => { const p2 = await ctx.newPage(); await p2.goto(`${B.BASE_URL}/gestao/boletim/${bol.token}`); const h = await p2.locator('.g-bo-redes-sair').getAttribute('href'); await p2.goto(B.BASE_URL + h); tituloAntes = (await p2.locator('[data-teste=titulo-da-autorizacao]').textContent()).trim(); await p2.locator('[data-teste=nao-quero-mais]').click(); await p2.locator('[data-teste=confirmar-retirar]').click(); await p2.locator('[data-teste=retirada]').waitFor({ timeout: 15000 }); tituloDepois = (await p2.locator('[data-teste=titulo-da-autorizacao]').textContent()).trim(); if (process.env.FOTOS) await p2.screenshot({ path: path.join(SAIDA, 'fotos-redes-1366-retirada.png'), fullPage: true }); await p2.close(); return h; })();
  // rodada 9 (N7): o título muda na hora (antes continuava "A autorização está valendo" até recarregar)
  T.ok('o título da página acompanha: "A autorização está valendo" vira "Autorização retirada" sem recarregar', tituloAntes === 'A autorização está valendo' && tituloDepois === 'Autorização retirada', `${tituloAntes} → ${tituloDepois}`);
  T.ok('"Não quero mais" pediu confirmação e tirou', Boolean(codigo) && B.sql(`select count(*) from fotos_autorizacoes where pet_id = '${L.pets.Thor}' and retirado_em is null`) === '0');
  await page.reload();
  linha = page.locator('[data-teste=fotos-nas-redes]');
  await linha.waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  T.ok('depois de retirada, a ficha mostra "Sem autorização"', /Sem autorização/.test(await linha.textContent()), await linha.textContent());
  T.ok('nenhum erro nas telas da equipe (1366)', erros.length === 0, erros);
  await ctx.close();

  await N.fecharNavegador();
}))();
