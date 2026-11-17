// Caixa, fiado, comprovante, descontos e pacotes (migração 20261216; achados da Neide e da Bia na rodada final).
// - comprovante_do_agendamento: a conta da Luna (R$ 95) fechada com o fiado de antes (R$ 55) e o pagamento dividido
//   (Dinheiro 100 + Pix 20, como a tela faz): devolve o que foi para o fiado (R$ 25, Dinheiro 5 + Pix 20) e o que falta (R$ 30);
//   o dinheiro entregue (troco) fica guardado por comprovante_guardar_entregue; quem não recebe não lê nada.
// - partes_do_lancamento (o mesmo de "De onde veio"): 260 + taxa 40 − sinal 78 = 222 → taxa R$ 40,00.
// - promoção de aniversário: só no horário perto do aniversário do pet; o link não mostra; a de dias fracos segue igual.
// - pacote com preço por porte: a equipe sem dinheiro não lê; com o preço travado, a recepção vende pelo preço do porte do pet.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('caixa-fiado');
const D = lib('dinheiro');

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Caixa fiado', modulos: ['banho_tosa', 'loja', 'pacotes'] });
  const { dono, caixa: cx, tosador: tos } = L.sb;
  const P = L.P;
  B.must(await dono.from('caixas').insert({ petshop_id: P, valor_inicial: 50 }).select('id'), 'abrir o caixa');

  T.secao('comprovante com o fiado pago junto (Neide M1)');
  // fiado do caderno da Clara (tutora da Luna): R$ 55, devido desde 15 dias atrás
  const fiado = B.must(await cx.from('lancamentos').insert({ petshop_id: P, tipo: 'entrada', valor: 55, categoria: 'Outros', descricao: 'fiado (banho)', pago: false, forma: null,
    data: L.dia(-15), vencimento: L.dia(-15), devido_desde: L.dia(-15), cliente_id: L.tutores.Clara, origem: 'tela' }).select('id').single(), 'fiado').id;
  const ini = B.instante(L.hoje, '16:30', L.fuso);
  const ag = B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets.Luna, servico_id: L.S.Banho, inicio: ini.toISOString(), fim: new Date(+ini + 36e5).toISOString(), preco: 70 }).select('id').single(), 'horário').id;
  // a mesma lista de passos da comanda (gravarConta com "Incluir nesta conta?" e "Pagou só isso"): a conta de hoje paga inteira
  // (Dinheiro 95) e o fiado recebe R$ 25 (Dinheiro 5 + Pix 20)
  const chave = D.novaChaveDeOperacao();
  const itens = [{ tipo: 'servico', nome: 'Banho', qtd: 1, valor: 70 }, { tipo: 'servico', nome: 'Hidratação', qtd: 1, valor: 25, servico_id: L.S['Hidratação'] }];
  const passos = [
    { t: 'sem_recebimento', agendamento: ag },
    { t: 'servicos', agendamento: ag, servicos: [{ servico_id: L.S['Hidratação'], preco: 25 }] },
    { t: 'lancamento', nome: 'principal', chave, linha: { tipo: 'entrada', valor: 95, forma: 'dinheiro', pagamentos: null, pago: true, data: L.hoje, categoria: 'Banho e tosa', agendamento_id: ag, cliente_id: L.tutores.Clara, descricao: 'Banho + Hidratação · Luna', itens } },
    { t: 'receber', conta: fiado, valor: 25, forma: 'pix', pagamentos: [{ forma: 'dinheiro', valor: 5 }, { forma: 'pix', valor: 20 }], chave: D.parteDaChave(chave, 'antiga', fiado) },
    { t: 'agendamento', id: ag, status: 'concluido' },
  ];
  const feito = await cx.rpc('agendamento_fechar_conta', { p_petshop: P, p_agendamento: ag, p_chave: chave, p_passos: passos });
  T.passa('a recepção fecha a conta com o fiado junto, pagamento dividido', feito);
  const principal = feito.data?.ids?.principal;
  const comp = await cx.rpc('comprovante_do_agendamento', { p_agendamento: ag });
  const a0 = comp.data?.antigas?.[0];
  T.passa('o comprovante (pelo horário, depois) sabe que R$ 25 foram para o fiado e que faltam R$ 30', comp,
    comp.data?.antigas?.length === 1 && Number(a0.recebido) === 25 && Number(a0.falta) === 30 && a0.conta === fiado && a0.descricao === 'fiado (banho)');
  T.ok('… e como: Dinheiro 5 + Pix 20', Array.isArray(a0?.pagamentos) && a0.pagamentos.some((x) => x.forma === 'dinheiro' && Number(x.valor) === 5) && a0.pagamentos.some((x) => x.forma === 'pix' && Number(x.valor) === 20), a0);
  T.ok('sem troco guardado: entregue vazio', comp.data?.entregue === null, comp.data);
  const tx = lib('comprovante').textoComprovante({ petshop: 'Loja', tutor: 'Clara Dias', pet: 'Luna', quando: ini, recebidos: [feito.data.passos.find((x) => x.t === 'lancamento').linha], antigas: comp.data.antigas });
  T.ok('o texto do comprovante: Pagamento Dinheiro R$ 100,00 + Pix R$ 20,00, ainda deve R$ 30,00', /Dinheiro R\$\s100,00 \+ Pix R\$\s20,00/.test(tx) && /ainda deve R\$\s30,00/.test(tx) && /Total pago agora: R\$\s120,00/.test(tx), tx);
  const semDinheiro = await tos.rpc('comprovante_do_agendamento', { p_agendamento: ag });
  T.ok('o tosador (sem dinheiro) não lê nada', !semDinheiro.error && semDinheiro.data === null, semDinheiro);

  T.secao('troco guardado para o comprovante');
  T.passa('a recepção guarda que o cliente entregou R$ 150 (troco R$ 50)', await cx.rpc('comprovante_guardar_entregue', { p_lancamento: principal, p_entregue: 150 }));
  T.passa('a segunda vez não muda nada', await cx.rpc('comprovante_guardar_entregue', { p_lancamento: principal, p_entregue: 999 }));
  T.ok('o comprovante devolve R$ 150 entregues', Number((await dono.rpc('comprovante_do_agendamento', { p_agendamento: ag })).data?.entregue) === 150);
  T.recusa('o tosador não guarda', await tos.rpc('comprovante_guardar_entregue', { p_lancamento: principal, p_entregue: 10 }));
  T.recusa('ninguém lê a tabela direto', await dono.from('lancamentos_entregue').select('*'));

  T.secao('De onde veio: o sinal abate as diárias (Bia M3)');
  const partes = B.sql(`select servico || '|' || produto || '|' || extra from public.partes_do_lancamento(222, '[{"tipo":"servico","qtd":1,"valor":260},{"tipo":"extra","qtd":1,"valor":40},{"tipo":"extra","qtd":1,"valor":-78}]')`);
  T.ok('260 + 40 − 78 = 222: diárias 182, taxa 40', partes === '182.00|0.00|40.00', partes);
  const semNegativo = B.sql(`select servico || '|' || produto || '|' || extra from public.partes_do_lancamento(90, '[{"tipo":"servico","qtd":1,"valor":80},{"tipo":"produto","qtd":1,"valor":20}]')`);
  T.ok('sem linha negativa: igual a antes (desconto rateado)', semNegativo === '72.00|18.00|0.00', semNegativo);

  T.secao('promoção de aniversário do pet');
  // Thor faz aniversário daqui a 3 dias; Mel daqui a 40
  const niver = (n) => { const d = L.dia(n); return `2020-${d.slice(5)}`.replace('2020-02-29', '2020-02-28'); };
  B.must(await dono.from('pets').update({ nascimento: niver(3) }).eq('id', L.pets.Thor).select('id'), 'nascimento do Thor');
  B.must(await dono.from('pets').update({ nascimento: niver(40) }).eq('id', L.pets.Mel).select('id'), 'nascimento da Mel');
  const base = { nome: 'Aniversário do pet', dias: [0, 1, 2, 3, 4, 5, 6], hora_de: null, hora_ate: null, servicos: [], tipo: 'pct', valor: 10, comeca_em: null, termina_em: null, ativa: true, aniversario: true, casa: ['creche'] };
  const pr = await dono.rpc('promocao_salvar', { p: P, p_id: null, p_dados: base });
  T.passa('o dono cria a promoção de aniversário (10%)', pr);
  const gravada = JSON.parse(B.sql(`select row_to_json(x) from (select aniversario, banho_tosa, casa from promocoes where id='${pr.data}') x`));
  T.ok('fica só no banho e tosa (creche e hotel não entram)', gravada.aniversario === true && gravada.banho_tosa === true && gravada.casa.length === 0, gravada);
  const marca = async (pet, dia) => { const i = B.instante(dia, '10:00', L.fuso); return B.must(await tos.from('agendamentos').insert({ petshop_id: P, pet_id: pet, servico_id: L.S.Banho, inicio: i.toISOString(), fim: new Date(+i + 36e5).toISOString() }).select('id, promo').single(), 'marcar'); };
  const thor = await marca(L.pets.Thor, L.dia(1));
  T.ok('Thor, 2 dias antes do aniversário: o horário vem com a promoção', thor.promo?.nome === 'Aniversário do pet' && Number(thor.promo.valor) === 10, thor.promo);
  const mel = await marca(L.pets.Mel, L.dia(1));
  T.ok('Mel, aniversário longe: sem promoção', mel.promo === null, mel.promo);
  const bob = await marca(L.pets.Bob, L.dia(1));
  T.ok('Bob, sem data de nascimento: sem promoção', bob.promo === null, bob.promo);
  const link = await B.cliente().rpc('link_promocoes', { p_codigo: L.codigo });
  T.passa('o link do cliente não mostra a promoção de aniversário', link, Array.isArray(link.data) && !link.data.some((x) => x.nome === 'Aniversário do pet'));
  B.must(await dono.rpc('agendamento_promo_usar', { p_id: mel.id, p_usar: true }), 'pôr de volta na Mel');
  T.ok('pôr de volta num horário longe do aniversário não dá a promoção', JSON.parse(B.sql(`select coalesce(promo, 'null'::jsonb) from agendamentos where id='${mel.id}'`)) === null);

  T.secao('pacote com preço por porte');
  const mod = B.must(await dono.from('pacotes').insert({ petshop_id: P, nome: '4 banhos', servico_id: L.S.Banho, quantidade: 4, validade_dias: 30, preco: 170, precos_porte: { P: 160, M: 180, G: 200 } }).select('id').single(), 'modelo').id;
  T.recusa('porte que não existe: recusado', await dono.from('pacotes').insert({ petshop_id: P, nome: 'Errado', quantidade: 4, validade_dias: 30, preco: 10, precos_porte: { XL: 5 } }).select('id'));
  T.recusa('o tosador não lê os preços por porte pela tabela', await tos.from('pacotes').select('precos_porte').eq('id', mod));
  const lidoTos = await tos.rpc('precos_porte_dos_pacotes', { p: P });
  T.ok('… nem pela função', !lidoTos.error && lidoTos.data.length === 0, lidoTos);
  const lidoCx = await cx.rpc('precos_porte_dos_pacotes', { p: P });
  T.ok('a recepção (área Pacotes) lê', !lidoCx.error && lidoCx.data.some((x) => x.id === mod && Number(x.precos_porte.M) === 180), lidoCx);
  B.sql(`update petshops set opcoes = coalesce(opcoes, '{}'::jsonb) || '{"dinheiro.preco_travado": true}'::jsonb where id='${P}'`);
  const vende = (pet, preco) => cx.from('pacotes_clientes').insert({ petshop_id: P, pet_id: pet, pacote_id: mod, nome: '4 banhos', servico_id: L.S.Banho, total: 4, vence_em: L.dia(30), preco }).select('id');
  T.passa('preço travado: Mel (P) pelo preço do porte P (R$ 160)', await vende(L.pets.Mel, 160));
  T.passa('Thor (M) pelo do porte M (R$ 180)', await vende(L.pets.Thor, 180));
  T.recusa('Bob (G) pelo preço único (R$ 170): recusado, o do porte é R$ 200', await vende(L.pets.Bob, 170), /200,00/);
  T.passa('Rex (GG, sem preço no modelo) pelo preço único (R$ 170)', await vende(L.pets.Rex, 170));

  T.secao('fiado do caderno: as contas antigas voltam para o dia anotado');
  // o que a importação gravava antes (vencimento = importação + 7, chave "<op>:divida:<linha>")
  const velha = B.must(await dono.from('lancamentos').insert({ petshop_id: P, tipo: 'entrada', valor: 40, categoria: 'Outros', descricao: 'Trazido do caderno', pago: false, forma: null,
    data: L.dia(7), vencimento: L.dia(7), devido_desde: L.dia(-20), cliente_id: L.tutores.Beto, origem: 'tela', chave: `${D.novaChaveDeOperacao()}:divida:x1` }).select('id').single(), 'fiado antigo').id;
  B.sql(require('fs').readFileSync(require('path').join(B.RAIZ, 'supabase/migrations/20261216000000_gestao_caixa_fiado_pacotes.sql'), 'utf8').match(/do \$\$\nbegin\n  perform set_config\('maestro\.creche', '1', true\);\n  update public\.lancamentos l[\s\S]*?end \$\$;/)[0]);
  T.ok('a conta do caderno vence no dia em que começou (deve desde)', B.sql(`select vencimento || '|' || data from lancamentos where id='${velha}'`) === `${L.dia(-20)}|${L.dia(-20)}`);
}))();
