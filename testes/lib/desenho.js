// Peças dos testes de desenho e acessibilidade (rodada 9): uma loja com nomes compridos de propósito, a medida do que
// passa da largura da tela (ou da folha) e a contagem de problemas do axe-core, quando ele está instalado na máquina.
const fs = require('fs');
const path = require('path');
const B = require('./base');
const { criarLoja } = require('./semente');

const PET_LONGO = 'Maximiliano Bartolomeu Von Schnauzer III';                       // 40 letras
const TUTOR_LONGO = 'Tutor Teste Sobrenome Comprido de Albuquerque Cavalcanti Neto'; // 61 letras
const PRODUTO_LONGO = 'Ração Super Premium Cães Adultos Raças Grandes Frango e Arroz 15 kg'; // 67 letras
const LOJA_LONGA = 'Pet Shop Estrela do Bairro Banho Tosa e Hotel';

/** Loja de teste com nome comprido em tudo: pet, tutor, produto caro, horários de hoje, venda, fiado e hotel. */
async function lojaDeNomesLongos(T, o = {}) {
  const L = await criarLoja(T, { nome: LOJA_LONGA, ...o });
  const P = L.P, dono = L.sb.dono;
  B.must(await dono.from('clientes').update({ nome: TUTOR_LONGO }).eq('id', L.tutores.Ana).select('id'), 'tutor comprido');
  B.must(await dono.from('pets').update({ nome: PET_LONGO }).eq('id', L.pets.Thor).select('id'), 'pet comprido');
  L.prodLongo = B.must(await dono.from('produtos').insert({ petshop_id: P, nome: PRODUTO_LONGO, unidade: 'un', preco_venda: 12345.67, custo: 9876.54, estoque: 3, estoque_minimo: 5 }).select('id').single(), 'produto comprido').id;
  // horários de hoje do pet de nome comprido e de outro pet
  const horas = [['09:00', 'Banho e tosa', L.pets.Thor], ['15:00', 'Banho', L.pets.Thor], ['16:00', 'Banho', L.pets.Bob]];
  L.ags = [];
  for (const [h, serv, pet] of horas) {
    const ini = B.instante(L.hoje, h, L.fuso);
    L.ags.push(B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: pet, servico_id: L.S[serv], profissional_id: L.ids.tosador ?? L.ids.dono, inicio: ini.toISOString(), fim: new Date(+ini + 60 * 6e4).toISOString() }).select('id').single(), 'horário ' + h).id);
  }
  // venda do produto caro, fiado do tutor comprido e uma saída
  const venda = B.must(await dono.from('lancamentos').insert({ petshop_id: P, tipo: 'entrada', valor: 12345.67, forma: 'credito', categoria: 'Venda de produtos', descricao: `Venda: ${PRODUTO_LONGO}`, data: L.hoje, pago: true, origem: 'tela', cliente_id: L.tutores.Ana, itens: [{ tipo: 'produto', nome: PRODUTO_LONGO, qtd: 1, valor: 12345.67, produto_id: L.prodLongo }] }).select('id'), 'venda')[0].id;
  B.must(await dono.from('movimentos_estoque').insert({ petshop_id: P, produto_id: L.prodLongo, tipo: 'saida', quantidade: 1, motivo: 'Venda', lancamento_id: venda }).select('id'), 'saída do estoque');
  // o primeiro horário já foi atendido e pago (aparece nos relatórios: serviços, pets e tutores que mais vieram)
  B.must(await dono.from('lancamentos').insert({ petshop_id: P, tipo: 'entrada', valor: 90, forma: 'pix', categoria: 'Banho e tosa', descricao: `Banho e tosa · ${PET_LONGO}`, data: L.hoje, pago: true, origem: 'tela', cliente_id: L.tutores.Ana, agendamento_id: L.ags[0], itens: [{ tipo: 'servico', nome: 'Banho e tosa', qtd: 1, valor: 90, servico_id: L.S['Banho e tosa'] }] }).select('id'), 'conta do atendimento');
  B.must(await dono.from('agendamentos').update({ status: 'concluido' }).eq('id', L.ags[0]).select('id'), 'concluir');
  B.must(await dono.from('lancamentos').insert({ petshop_id: P, tipo: 'entrada', valor: 35.5, categoria: 'Banho e tosa', descricao: `Banho e tosa de ${PET_LONGO}`, data: L.hoje, vencimento: L.dia(-3), pago: false, cliente_id: L.tutores.Ana, origem: 'tela' }).select('id'), 'fiado');
  B.must(await dono.from('lancamentos').insert({ petshop_id: P, tipo: 'saida', valor: 1234.56, forma: 'pix', categoria: 'Fornecedores', descricao: 'Compra de ração do fornecedor Distribuidora Pet Brasil Central Ltda.', data: L.hoje, pago: true, origem: 'tela' }).select('id'), 'saída');
  // hotel: o pet de nome comprido está na casa
  const ent = B.instante(L.dia(-1), '09:00', L.fuso);
  B.must(await dono.from('estadias').insert({ petshop_id: P, pet_id: L.pets.Thor, tipo: 'hotel', status: 'em_casa', entrada: ent.toISOString(), saida_prevista: B.instante(L.dia(2), '17:00', L.fuso).toISOString(), valor_diaria: 120 }).select('id'), 'hotel');
  return L;
}

/**
 * O que passa da largura da tela dentro do conteúdo (ou da folha aberta por cima): conta os elementos visíveis cuja borda
 * direita fica depois do limite, fora de uma área que rola de lado ou corta de propósito (reticências).
 */
const medirCortes = (page) => page.evaluate(() => {
  const folhas = [...document.querySelectorAll('.g-folha')];
  const folha = folhas[folhas.length - 1] || null;
  const raiz = folha || document.querySelector('.g-main') || document.body;
  const larg = document.documentElement.clientWidth;
  const rf = raiz.getBoundingClientRect();
  const limite = Math.min(larg, folha ? rf.right : larg) + 1;
  const fora = [];
  if (folha && (rf.right > larg + 1 || rf.left < -1)) fora.push({ o: 'a folha inteira', t: '', r: Math.round(rf.right) });
  const cortaDeProposito = (el) => {
    for (let p = el.parentElement; p && p !== raiz; p = p.parentElement) {
      if (p.classList.contains('g-folha-corpo')) continue;
      const s = getComputedStyle(p);
      if (s.overflowX !== 'visible' || s.position === 'fixed') return true;
    }
    return false;
  };
  for (const el of raiz.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.position === 'fixed') continue;
    if (r.right <= limite && r.left >= -1) continue;
    if (cortaDeProposito(el)) continue;
    const classe = typeof el.className === 'string' ? el.className : (el.className && el.className.baseVal) || '';
    fora.push({ o: `${el.tagName.toLowerCase()}.${classe.split(' ').slice(0, 2).join('.')}`, t: (el.innerText || '').trim().slice(0, 40), r: Math.round(r.right) });
  }
  return { n: fora.length, larg, amostra: fora.slice(0, 5) };
});

/** Caminho do axe-core, se houver na máquina (AXE=/caminho/axe.min.js, o pacote instalado ou as ferramentas de /opt). */
function caminhoDoAxe() {
  const tentativas = [process.env.AXE, path.join(B.RAIZ, 'node_modules', 'axe-core', 'axe.min.js'), '/opt/node-tools/node_modules/axe-core/axe.min.js'].filter(Boolean);
  return tentativas.find((p) => fs.existsSync(p)) || null;
}
/** Roda o axe-core (WCAG 2.0/2.1/2.2 A e AA + boas práticas) e devolve as regras quebradas com a contagem. */
async function axe(page, arquivo = caminhoDoAxe()) {
  if (!arquivo) return null;
  // o aplicativo tem a regra de conteúdo que vale (20261245): um <script> posto na página seria barrado; roda pelo Playwright
  await page.evaluate(`${require('fs').readFileSync(arquivo, 'utf8')}\n;void 0`);
  return page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } });
    return r.violations.map((v) => ({ id: v.id, impacto: v.impact, n: v.nodes.length, onde: v.nodes.slice(0, 3).map((n) => n.target.join(' ').slice(0, 90)) }));
  });
}

module.exports = { lojaDeNomesLongos, medirCortes, axe, caminhoDoAxe, PET_LONGO, TUTOR_LONGO, PRODUTO_LONGO, LOJA_LONGA };
