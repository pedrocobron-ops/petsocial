// Banco: rodada 8 (agente L), migração 20261226.
//   - nome com HTML (pet shop, tutor, pet, equipe, serviço, produto) é limpo pelo banco, igual à tela;
//   - nome só de marcação é recusado com frase em português;
//   - estadia com saída prevista a mais de 366 dias da entrada é recusada; estadia antiga com outra mudança passa;
//   - duas abas fechando o mesmo caixa: vale a primeira, e a segunda recebe "ja_fechado" com a hora e o valor contado.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const T = require('../lib/teste')('robustez');

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Robustez' });
  const { dono, caixa } = L.sb;
  const P = L.P;

  T.secao('nomes sem marcação');
  B.must(await dono.from('petshops').update({ nome: 'Loja <b>"V3"</b> & Cia' }).eq('id', P).select('id'), 'nome da loja');
  T.ok('nome da loja: "<b>" sai e o resto fica', B.sql(`select nome from petshops where id='${P}'`) === 'Loja "V3" & Cia', B.sql(`select nome from petshops where id='${P}'`));
  const tutor = await dono.from('clientes').insert({ petshop_id: P, nome: '<i>Joana</i> Silva' }).select('id, nome').single();
  T.passa('tutor com <i> entra limpo', tutor, tutor.data?.nome === 'Joana Silva');
  const pet = await dono.from('pets').insert({ petshop_id: P, cliente_id: tutor.data.id, nome: 'Rex <3 <script>x</script>' }).select('id, nome').single();
  T.passa('pet: "Rex <3 <script>x</script>" vira "Rex 3 x"', pet, pet.data?.nome === 'Rex 3 x');
  const prof = await dono.from('profissionais').update({ nome: 'Ana <u>Banho</u>' }).eq('id', L.ids.tosador).select('nome').single();
  T.passa('equipe: nome limpo', prof, prof.data?.nome === 'Ana Banho');
  T.recusa('nome só de marcação é recusado em português', await dono.from('pets').insert({ petshop_id: P, cliente_id: tutor.data.id, nome: '<b></b>' }).select('id'), /Escreva o nome com letras/);
  const normal = await dono.from('pets').update({ nome: 'Mel & Thor' }).eq('id', pet.data.id).select('nome').single();
  T.passa('nome comum (com &) fica como está', normal, normal.data?.nome === 'Mel & Thor');

  T.secao('saída prevista longe demais');
  const entrada = B.instante(L.hoje, '09:00', L.fuso);
  const longe = new Date(+entrada + 731 * 864e5);
  T.recusa('check-in de creche com saída daqui a 2 anos: recusado ("Confira o dia e o ano")',
    await dono.from('estadias').insert({ petshop_id: P, pet_id: L.pets.Thor, tipo: 'creche', entrada: entrada.toISOString(), saida_prevista: longe.toISOString(), status: 'em_casa' }).select('id'), /mais de um ano.*Confira o dia e o ano/);
  const boa = await dono.from('estadias').insert({ petshop_id: P, pet_id: L.pets.Thor, tipo: 'hotel', entrada: entrada.toISOString(), saida_prevista: new Date(+entrada + 5 * 864e5).toISOString(), status: 'reservada' }).select('id').single();
  T.passa('hotel de 5 diárias entra', boa);
  T.recusa('editar a saída para 400 dias depois: recusado',
    await dono.from('estadias').update({ saida_prevista: new Date(+entrada + 400 * 864e5).toISOString() }).eq('id', boa.data.id).select('id'), /mais de um ano/);
  // uma estadia antiga já gravada com a data longe (antes desta regra): mudar outra coisa continua valendo
  B.sql(`alter table estadias disable trigger a_saida_razoavel; update estadias set saida_prevista = entrada + interval '700 days' where id='${boa.data.id}'; alter table estadias enable trigger a_saida_razoavel;`);
  T.passa('estadia antiga com a data longe: mudar a observação passa (as datas não mudaram)',
    await dono.from('estadias').update({ obs: 'ração própria', entrada: entrada.toISOString() }).eq('id', boa.data.id).select('id'));

  T.secao('duas abas fechando o mesmo caixa');
  const cx = B.must(await dono.from('caixas').insert({ petshop_id: P, valor_inicial: 100 }).select('id').single(), 'caixa').id;
  const [a, b] = await Promise.all([
    dono.rpc('fechar_caixa', { p_caixa: cx, p_contado: 100, p_esperado: 100 }),
    caixa.rpc('fechar_caixa', { p_caixa: cx, p_contado: 90, p_esperado: 100 }),
  ]);
  const respostas = [a.data, b.data];
  const fechou = respostas.filter((r) => r && r.fechado === true), perdeu = respostas.filter((r) => r && r.motivo === 'ja_fechado');
  T.ok('uma aba fecha e a outra recebe "ja_fechado"', fechou.length === 1 && perdeu.length === 1, respostas);
  const contado = Number(B.sql(`select valor_contado from caixas where id='${cx}'`));
  T.ok('a resposta da aba que perdeu diz a hora e o valor contado na outra', perdeu[0] && perdeu[0].fechado_em && Number(perdeu[0].contado) === contado, perdeu[0]);
  const de_novo = await dono.rpc('fechar_caixa', { p_caixa: cx, p_contado: 50 });
  T.ok('tocar de novo na aba velha: "ja_fechado" e a contagem não muda', de_novo.data?.motivo === 'ja_fechado' && Number(B.sql(`select valor_contado from caixas where id='${cx}'`)) === contado, de_novo.data);
}))();
