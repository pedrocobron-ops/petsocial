// Dívida trazida do caderno (achado da Neide; migração 20261186): "Anotar o que X deve" aceita, se quiser, o dia em que a
// dívida começou (`lancamentos.devido_desde`). Só muda o "desde" que aparece; o dinheiro segue as regras de sempre:
// a conta é um valor a receber (data = vencimento) e entra no caixa no dia em que for paga, nunca na data do caderno.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('divida-caderno');
const D = lib('dinheiro');

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Divida caderno' });
  const { dono, caixa: cx, tosador } = L.sb;
  const P = L.P;
  B.must(await dono.from('caixas').insert({ petshop_id: P, valor_inicial: 0 }).select('id'), 'caixa');
  const antigo = L.dia(-200), venc = L.dia(7);
  const conta = (sb, extra = {}) => sb.from('lancamentos').insert({ petshop_id: P, tipo: 'entrada', valor: 75, categoria: 'Outros', descricao: 'Fiado do caderno', pago: false, forma: null,
    data: venc, vencimento: venc, cliente_id: L.tutores.Beto, origem: 'tela', devido_desde: antigo, ...extra }).select('id, data, vencimento, devido_desde').single();

  T.secao('anotar com o dia em que começou');
  const r1 = await conta(dono);
  T.passa('o dono anota R$ 75 devidos desde 200 dias atrás', r1, r1.data?.devido_desde === antigo && r1.data?.data === venc && r1.data?.vencimento === venc);
  const r2 = await conta(cx, { valor: 20, descricao: 'Taxa antiga' });
  T.passa('a recepção (Caixa) também anota, com o dia', r2, r2.data?.devido_desde === antigo);
  T.passa('sem o dia continua igual a antes (nulo)', await conta(dono, { devido_desde: null, valor: 10, descricao: 'Sem data' }));

  T.secao('o banco recusa o que não faz sentido');
  T.recusa('dia depois de hoje', await conta(dono, { devido_desde: L.dia(5) }), /depois de hoje/);
  T.recusa('em valor já recebido (é só para conta a receber)', await conta(dono, { pago: true, forma: 'pix', data: L.hoje, vencimento: null }), /conta a receber/);
  T.recusa('em saída', await dono.from('lancamentos').insert({ petshop_id: P, tipo: 'saida', valor: 5, categoria: 'Outros', descricao: 'x', pago: false, data: venc, vencimento: venc, devido_desde: antigo }).select('id'));
  T.recusa('antes de 2000', await conta(dono, { devido_desde: '1999-12-31' }));
  T.recusa('o tosador não anota conta nenhuma', await conta(tosador));

  T.secao('o dinheiro segue as regras de sempre');
  const entrouAntes = Number(B.sql(`select coalesce(sum(valor), 0) from lancamentos where petshop_id='${P}' and tipo='entrada' and pago`));
  T.ok('anotar não entra como dinheiro em dia nenhum', entrouAntes === 0, entrouAntes);
  T.ok('nada lançado no dia do caderno', Number(B.sql(`select count(*) from lancamentos where petshop_id='${P}' and data='${antigo}'`)) === 0);
  const parte = await D.receberConta(cx, r1.data.id, { valor: 40, forma: 'dinheiro', chave: B.uuid() });
  T.ok('recebeu R$ 40 dos 75: a parte entra hoje, no caixa', !!parte, parte);
  const linhas = JSON.parse(B.sql(`select json_agg(json_build_object('valor', valor, 'pago', pago, 'data', data, 'caixa', caixa_id is not null, 'desde', devido_desde) order by pago) from lancamentos where petshop_id='${P}' and (id='${r1.data.id}' or conta_id='${r1.data.id}')`));
  const aberta = linhas.find((l) => !l.pago), paga = linhas.find((l) => l.pago);
  T.ok('a conta fica com R$ 35 em aberto e continua "desde" o dia do caderno', aberta && Number(aberta.valor) === 35 && aberta.desde === antigo, linhas);
  T.ok('a parte recebida é de hoje, no caixa (não da data do caderno)', paga && Number(paga.valor) === 40 && paga.data === L.hoje && paga.caixa, linhas);
  T.ok('a dona muda o dia depois (corrigir o caderno)', !(await dono.from('lancamentos').update({ devido_desde: L.dia(-100) }).eq('id', r1.data.id).select('id')).error
    && B.sql(`select devido_desde from lancamentos where id='${r1.data.id}'`) === L.dia(-100));
}))();
