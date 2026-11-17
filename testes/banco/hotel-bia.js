// Achados da Bia no hotel (teste no site, 16/11/2026), pelo banco e pelo mesmo código das telas:
//  - item 9: o pedido do link com dois pets vira duas reservas, cada uma com o seu sinal. Um Pix só quita os dois juntos
//    (`receberSinaisJuntos`, src/lib/gestao/sinal-junto.ts → estadia_sinal com um passo "receber" por sinal): tudo ou nada,
//    ao centavo, toque duplo recebe uma vez, pagamento dividido repartido entre os sinais, sinal mudado em outra tela recusa tudo.
//  - item 8: "Recebeu adiantado?" no check-in de quem chegou agora grava como o sinal pago da estadia (mesmos passos de
//    `lancarSinal` em src/components/gestao/hotel/sinal.tsx, com `adiantado` no pagamento): o check-out desconta, e receber o
//    total sem descontar é recusado pela conferência de 20261181 (`maestro:passa_do_devido`).
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('hotel-bia');

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Hotel Bia' });
  const { dono, caixa } = L.sb;
  const P = L.P;
  const J = lib('sinal-junto');
  const ch = (s) => `t-${s}-${B.sufixo()}`;
  const somaEntradas = () => B.centavos(Number(B.sql(`select coalesce(sum(valor),0) from lancamentos where petshop_id='${P}' and tipo='entrada' and pago`)));
  const nLanc = () => B.num(`select count(*) from lancamentos where petshop_id='${P}'`);
  B.must(await dono.from('caixas').insert({ petshop_id: P, valor_inicial: 100 }).select('id'), 'caixa');

  // uma reserva com o sinal em A receber (como o aceite do link: pedido_criar_sinal)
  async function reserva(pet, dia, sinal) {
    const id = B.must(await dono.from('estadias').insert({ petshop_id: P, pet_id: L.pets[pet], tipo: 'hotel', status: 'reservada', entrada: B.instante(dia, '09:00', L.fuso).toISOString(),
      saida_prevista: B.instante(B.somaDias(dia, 3), '17:00', L.fuso).toISOString(), valor_diaria: 110 }).select('id').single(), pet).id;
    B.must(await caixa.rpc('estadia_sinal', { p_petshop: P, p_estadia: id, p_chave: ch('sinal'), p_passos: [
      { t: 'lancamento', nome: 'sinal', linha: { tipo: 'entrada', valor: sinal, forma: null, categoria: 'Creche e hotel', descricao: `Sinal da reserva: hotel de ${pet}`, cliente_id: L.tutores.Ana, pago: false, data: L.hoje, vencimento: L.hoje } },
      { t: 'estadia_valores', estadia: id, modo: 'upsert', campos: { sinal, sinal_estado: 'a_receber', sinal_lancamento_id: '$ref:sinal', sinal_pago_em: null } },
    ] }), 'sinal ' + pet);
    return id;
  }
  // o que a tela lê (estadias + estadias_valores), no formato de gruposDeSinal
  async function lidas(ids) {
    const e = B.must(await caixa.from('estadias').select('id, entrada, status, criado_em, pets(nome, clientes(id, nome))').in('id', ids), 'estadias');
    const v = B.must(await caixa.from('estadias_valores').select('*').in('estadia_id', ids), 'valores');
    return e.map((x) => { const y = v.find((w) => w.estadia_id === x.id) ?? {}; return { id: x.id, entrada: x.entrada, status: x.status, criado: x.criado_em, pet: x.pets.nome, tutorId: x.pets.clientes?.id ?? null, tutor: x.pets.clientes?.nome ?? null,
      sinal: y.sinal ?? null, sinalEstado: y.sinal_estado ?? null, contaId: y.sinal_lancamento_id ?? null, sinalRecebido: y.sinal_recebido ?? null }; })
      .sort(() => Math.random() - 0.5); // a ordem da leitura não importa: o grupo segue a ordem em que as reservas foram feitas
  }
  const estado = (id) => B.sql(`select sinal_estado from estadias_valores where estadia_id='${id}'`);

  T.secao('item 9: Thor e Mel, um Pix só para os dois sinais');
  const d1 = L.dia(3);
  const thor = await reserva('Thor', d1, 107.25), mel = await reserva('Mel', d1, 62.40);
  // Thor já pagou R$ 100,00 do sinal (como a Bia fez): faltam 7,25 + 62,40 = 69,65
  const contaThor = B.sql(`select sinal_lancamento_id from estadias_valores where estadia_id='${thor}'`);
  B.must(await caixa.rpc('receber_conta', { p_conta: contaThor, p_valor: 100, p_forma: 'pix', p_chave: ch('parte') }), 'parte do sinal');
  let grupos = J.gruposDeSinal(await lidas([thor, mel]));
  T.ok('as duas reservas viram um grupo: "Thor e Mel · sinal R$ 69,65"', grupos.length === 1 && grupos[0].nomes === 'Thor e Mel' && B.centavos(grupos[0].total) === 6965
    && grupos[0].itens.map((x) => B.centavos(x.falta)).join('+') === '725+6240', grupos);
  // outro tutor ou outro dia não entra no grupo
  const bob = await reserva('Bob', d1, 50);
  T.ok('o Bob (outro tutor, mesmo dia) fica fora do grupo da Ana', J.gruposDeSinal(await lidas([thor, mel, bob])).every((g) => g.itens.every((x) => x.estadiaId !== bob)));
  let s0 = somaEntradas(), n0 = nLanc();
  // toque duplo: a mesma chave duas vezes ao mesmo tempo
  const chave = ch('junto');
  const [r1, r2] = await Promise.allSettled([J.receberSinaisJuntos(caixa, P, grupos[0].itens, { forma: 'pix' }, chave), J.receberSinaisJuntos(caixa, P, grupos[0].itens, { forma: 'pix' }, chave)]);
  T.ok('os dois toques respondem sem erro', r1.status === 'fulfilled' && r2.status === 'fulfilled', [r1.reason?.message, r2.reason?.message]);
  T.ok('entrou R$ 69,65 uma vez só (não 139,30)', somaEntradas() - s0 === 6965, somaEntradas() - s0);
  T.ok('nenhum lançamento novo (as contas dos sinais foram recebidas)', nLanc() === n0);
  T.ok('os dois sinais ficaram pagos', estado(thor) === 'pago' && estado(mel) === 'pago', [estado(thor), estado(mel)]);
  T.ok('Thor: sinal de R$ 107,25 pago (100,00 antes + 7,25 agora); Mel: R$ 62,40', B.sql(`select string_agg(sinal::text, '/' order by sinal desc) from estadias_valores where estadia_id in ('${thor}','${mel}')`) === '107.25/62.40');
  T.ok('nenhum sinal sobrou em A receber', B.num(`select count(*) from lancamentos where petshop_id='${P}' and not pago and id in (select sinal_lancamento_id from estadias_valores where estadia_id in ('${thor}','${mel}'))`) === 0);
  const r3 = await J.receberSinaisJuntos(caixa, P, grupos[0].itens, { forma: 'pix' }, chave).catch((e) => e);
  T.ok('a mesma chave depois: devolve o que já foi feito (repetido), sem receber de novo', r3?.repetido === true && somaEntradas() - s0 === 6965, r3?.message ?? r3);
  const r4 = await J.receberSinaisJuntos(caixa, P, grupos[0].itens, { forma: 'pix' }, ch('outra')).catch((e) => e);
  T.ok('outra chave com os sinais já pagos: recusado (conta mudou), nada entra', r4 instanceof Error && r4.dica === 'maestro:conta_mudou' && somaEntradas() - s0 === 6965, r4?.message);

  T.secao('pagamento dividido: Pix R$ 60,00 + dinheiro R$ 20,00 para sinais de 50 e 30');
  const d2 = L.dia(10);
  const thor2 = await reserva('Thor', d2, 50), mel2 = await reserva('Mel', d2, 30);
  grupos = J.gruposDeSinal(await lidas([thor2, mel2]));
  s0 = somaEntradas();
  await J.receberSinaisJuntos(caixa, P, grupos[0].itens, { forma: 'pix', pagamentos: [{ forma: 'pix', valor: 60 }, { forma: 'dinheiro', valor: 20 }] }, ch('dividido'));
  const pg = JSON.parse(B.sql(`select json_agg(json_build_object('v', l.valor, 'f', l.forma, 'p', l.pagamentos) order by l.valor desc) from lancamentos l where l.petshop_id='${P}' and l.pago and l.id in (select sinal_lancamento_id from estadias_valores where estadia_id in ('${thor2}','${mel2}'))`));
  T.ok('entrou R$ 80,00; Thor 50 no Pix; Mel 30 = Pix 10 + dinheiro 20', somaEntradas() - s0 === 8000 && pg.length === 2 && B.centavos(pg[0].v) === 5000 && pg[0].f === 'pix' && !pg[0].p
    && B.centavos(pg[1].v) === 3000 && JSON.stringify(pg[1].p) === JSON.stringify([{ forma: 'pix', valor: 10 }, { forma: 'dinheiro', valor: 20 }]), pg);
  T.ok('repartir: cada conta fecha ao centavo e a soma é o pagamento', JSON.stringify(J.repartirPagamento({ forma: 'pix', pagamentos: [{ forma: 'pix', valor: 33.33 }, { forma: 'cartao_credito', valor: 36.32 }] }, [7.25, 62.40]))
    === JSON.stringify([{ forma: 'pix', pagamentos: null }, { forma: 'cartao_credito', pagamentos: [{ forma: 'pix', valor: 26.08 }, { forma: 'cartao_credito', valor: 36.32 }] }]));

  T.secao('um dos sinais recebido em outra tela: nada é lançado');
  const d3 = L.dia(20);
  const thor3 = await reserva('Thor', d3, 40), mel3 = await reserva('Mel', d3, 25);
  grupos = J.gruposDeSinal(await lidas([thor3, mel3]));
  B.must(await caixa.rpc('receber_conta', { p_conta: B.sql(`select sinal_lancamento_id from estadias_valores where estadia_id='${mel3}'`), p_valor: 25, p_forma: 'dinheiro', p_chave: ch('fora') }), 'Mel recebido por fora');
  s0 = somaEntradas();
  const r5 = await J.receberSinaisJuntos(caixa, P, grupos[0].itens, { forma: 'pix' }, ch('tarde')).catch((e) => e);
  T.ok('recusado com maestro:conta_mudou', r5 instanceof Error && r5.dica === 'maestro:conta_mudou', r5?.message);
  T.ok('o sinal do Thor continua a receber e nada entrou', estado(thor3) === 'a_receber' && somaEntradas() === s0);
  T.recusa('o tosador não recebe sinal', await L.sb.tosador.rpc('estadia_sinal', { p_petshop: P, p_estadia: thor3, p_chave: ch('tos'), p_passos: J.passosDoSinalJunto([grupos[0].itens[0]], { forma: 'pix' }, ch('tos')) }));
  T.ok('o tosador não mudou nada', estado(thor3) === 'a_receber');

  T.secao('item 8: chegou agora com R$ 100,00 adiantado no Pix');
  const ontem = B.instante(B.somaDias(L.hoje, -1), '12:00', L.fuso).toISOString();
  const luna = B.must(await dono.from('estadias').insert({ petshop_id: P, pet_id: L.pets.Luna, tipo: 'hotel', status: 'em_casa', entrada: ontem, valor_diaria: 110 }).select('id').single(), 'Luna').id;
  const clienteLuna = B.sql(`select cliente_id from pets where id='${L.pets.Luna}'`);
  const chaveAd = ch('adiantado');
  const passosAd = [
    { t: 'lancamento', nome: 'sinal', chave: `${chaveAd}:sinal`, linha: { tipo: 'entrada', valor: 100, forma: 'pix', pagamentos: null, categoria: 'Creche e hotel', descricao: 'Pago adiantado: hotel de Luna', cliente_id: clienteLuna, pago: true, data: L.hoje } },
    { t: 'estadia_valores', estadia: luna, modo: 'upsert', campos: { sinal: 100, sinal_estado: 'pago', sinal_lancamento_id: '$ref:sinal', sinal_pago_em: L.hoje, sinal_pagamento: { forma: 'pix', pagamentos: null, adiantado: true }, sinal_devolucao_id: null, sinal_devolvido_em: null } },
  ];
  s0 = somaEntradas();
  const [a1, a2] = await Promise.all([1, 2].map(() => caixa.rpc('estadia_sinal', { p_petshop: P, p_estadia: luna, p_chave: `${chaveAd}:sinal`, p_passos: passosAd })));
  T.ok('dois toques: os dois respondem, R$ 100,00 entra uma vez', !a1.error && !a2.error && somaEntradas() - s0 === 10000, [a1.error, a2.error]);
  T.ok('a estadia fica com R$ 100,00 pagos adiantado', B.sql(`select sinal||' '||sinal_estado||' '||(sinal_pagamento->>'adiantado') from estadias_valores where estadia_id='${luna}'`) === '100.00 pago true');
  const checkout = (receber) => caixa.rpc('estadia_checkout', { p_petshop: P, p_estadia: luna, p_chave: ch('co'), p_passos: [
    { t: 'estadia_fechar', id: luna, saida: new Date().toISOString(), diarias: 1, valor_cobrado: 110 },
    { t: 'lancamento', nome: 'principal', linha: { tipo: 'entrada', valor: receber, forma: 'dinheiro', categoria: 'Creche e hotel', descricao: 'Hotel: 1 diária', cliente_id: clienteLuna, pago: true, data: L.hoje } },
  ] });
  let r = await checkout(110);
  T.recusa('check-out recebendo R$ 110,00 sem descontar o adiantado: recusado', r, /falta receber R\$ 10,00/);
  T.ok('a recusa é a da conferência (maestro:passa_do_devido)', r.error?.hint === 'maestro:passa_do_devido', r.error);
  s0 = somaEntradas();
  r = await checkout(10);
  T.passa('check-out recebendo R$ 10,00 (110,00 − 100,00 adiantado): passa', r);
  T.ok('entrou R$ 10,00 na saída; a estadia custou R$ 110,00', somaEntradas() - s0 === 1000 && B.centavos(Number(B.sql(`select valor_cobrado from estadias where id='${luna}'`))) === 11000);
}))();
