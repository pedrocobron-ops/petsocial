// Mozart cadastra e muda pelo banco de verdade (assistente/ferramenta-cadastros.ts), com o login de cada papel e um modelo de
// mentira (roteiro fixo, sem chamar a API):
//  - o dono manda a tabela de preços (banho P e M R$ 100, G e GG R$ 130; corte de unhas R$ 30; escovação R$ 20; hidratação
//    P/M R$ 60, G/GG R$ 80): quatro cartões numa resposta, Confirmar tudo grava os quatro (a escovação é criada).
//  - leva com falha no meio: o primeiro grava, o segundo falha e o terceiro não é feito.
//  - "chegaram 100 mordedores de plástico, vendo a R$ 100, paguei R$ 80": o produto novo entra com o preço de venda.
//  - produto pelo Edu (só Estoque): cria com preço e mínimo; custo é recusado (ele não vê o custo).
//  - tutor pelo Tito (Agenda e Clientes): WhatsApp, e-mail, aniversário e observação no fim; o Edu nem recebe a ferramenta.
//  - modelo de pacote pela Rita (Pacotes): cria com preço por porte e muda a validade.
//  - horário e diárias pelo dono; o cartão forjado pela Rita é recusado (só o dono) e nada muda.
//  - lembrete para tutor sem telefone: o Mozart pede o número; com ele, um cartão salva o telefone na ficha e o botão do WhatsApp
//    já vem com o número e o texto; sem querer salvar, o botão sem número (wa.me/?text=…) para escolher o contato.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('mozart-cadastros');
const F = lib('assistente/ferramentas');
const C = lib('assistente/conversa');
const R = lib('reservado');
const A = lib('acessos');
const LZ = lib('lembrete-zap');

let seq = 0;
const nb = (s) => String(s).replace(/ /g, ' ');
const uso = (name, input) => ({ type: 'tool_use', id: `toolu_cad${Date.now().toString(36)}${++seq}`, name, input });

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Mozart cadastros' });
  const P = L.P;

  async function contexto(papel) {
    const sb = L.sb[papel];
    const u = (await sb.auth.getUser()).data.user;
    const [p, e, s] = await Promise.all([R.lerPetshop(sb, P), R.lerEquipe(sb, P), R.lerServicos(sb, P)]);
    const eu = (e.data || []).find((x) => x.user_id === u.id && x.ativo);
    return {
      sb, userId: u.id, petshop: p.data, eu, equipe: e.data || [], servicos: s.data || [],
      vejoFinanceiro: A.podeArea(eu, 'caixa') || A.podeArea(eu, 'financeiro') || A.podeArea(eu, 'relatorios'),
      cuidoDoFinanceiro: A.podeArea(eu, 'financeiro') || A.podeArea(eu, 'relatorios'),
      areas: A.areasDe(eu), dono: eu.papel === 'dono', fusoMin: -180, agora: `${L.hoje}T10:00`,
    };
  }
  /** Uma volta do "modelo" que pede `usos` de uma vez; devolve a saída de `voltas` (os cartões). */
  const pedir = async (c, texto, usos) => {
    let n = 0, vistos = [];
    const r = await C.voltas({ c, mensagens: [{ role: 'user', content: texto }], liberado: true, contar: async () => true,
      chamar: async (msgs) => { if (n++ === 0) return { content: usos, stop_reason: 'tool_use' }; vistos = msgs[msgs.length - 1].content; return { content: [{ type: 'text', text: 'Pronto.' }], stop_reason: 'end_turn' }; } });
    // o que as consultas devolveram ao "modelo" (quando não houve cartão)
    return { ...r, vistos };
  };
  /** Confirmar tudo: grava os cartões em ordem. */
  const confirmar = (c, s, decisoes) => C.responderCartoes({ c, pendentes: s.mensagens[s.mensagens.length - 1].content, liberado: true, parciais: s.parciais,
    decisoes: decisoes ?? s.propostas.map((p) => ({ id: p.id, ok: true })) });
  const servico = (nome) => B.sql(`select coalesce(preco_p::text,'-')||'/'||coalesce(preco_m::text,'-')||'/'||coalesce(preco_g::text,'-')||'/'||coalesce(preco_gg::text,'-') from servicos where petshop_id='${P}' and nome='${nome}'`);

  T.secao('Dono: a tabela de preços dos quatro serviços numa leva só');
  const cDono = await contexto('dono');
  const S = L.S;
  const s1 = await pedir(cDono, 'banho P e M R$100, G e GG R$130; corte de unha R$30 qualquer porte; escovação R$20; hidratação P/M R$60, G/GG R$80', [
    uso('alterar_servico', { servico_id: S.Banho, preco_p: 100, preco_m: 100, preco_g: 130, preco_gg: 130 }),
    uso('alterar_servico', { servico_id: S['Corte de unhas'], preco: 30 }),
    uso('criar_servico', { nome: 'Escovação', duracao_min: 15, preco: 20 }),
    uso('alterar_servico', { servico_id: S['Hidratação'], preco_p: 60, preco_m: 60, preco_g: 80, preco_gg: 80 }),
  ]);
  T.ok('quatro cartões juntos, nada gravado ainda', s1.propostas.length === 4 && servico('Banho') === '50.00/60.00/70.00/80.00' && !servico('Escovação'), { propostas: s1.propostas.length, parciais: s1.parciais, banho: servico('Banho') });
  const linhasBanho = (s1.propostas[0]?.resumo.linhas || []).map(([k, v]) => `${k}: ${nb(v)}`);
  T.ok('o cartão do banho mostra antes e depois', linhasBanho.includes('Preço antes: P R$ 50,00 · M R$ 60,00 · G R$ 70,00 · GG R$ 80,00') && linhasBanho.includes('Preço fica: P R$ 100,00 · M R$ 100,00 · G R$ 130,00 · GG R$ 130,00'), linhasBanho);
  const r1 = await confirmar(cDono, s1);
  T.ok('Confirmar tudo: os quatro gravaram', r1.mudou && r1.resultados.every((x) => !x.is_error), r1.resultados);
  T.ok('banho 100/100/130/130', servico('Banho') === '100.00/100.00/130.00/130.00', servico('Banho'));
  T.ok('corte de unhas 30 em todos os portes', servico('Corte de unhas') === '30.00/30.00/30.00/30.00', servico('Corte de unhas'));
  T.ok('escovação criada com 20 e 15 min, ativa', servico('Escovação') === '20.00/20.00/20.00/20.00' && B.sql(`select duracao_min||'/'||ativo from servicos where petshop_id='${P}' and nome='Escovação'`) === '15/true');
  T.ok('hidratação 60/60/80/80', servico('Hidratação') === '60.00/60.00/80.00/80.00', servico('Hidratação'));

  T.secao('Leva com falha no meio: para ali');
  const c2 = await contexto('dono');
  const s2 = await pedir(c2, 'cadastra tosa bebê duas vezes e muda o banho', [
    uso('criar_servico', { nome: 'Tosa bebê', duracao_min: 45, preco: 70 }),
    uso('criar_servico', { nome: 'Tosa bebê', duracao_min: 45, preco: 75 }),
    uso('alterar_servico', { servico_id: S.Banho, preco: 999 }),
  ]);
  T.ok('três cartões', s2.propostas.length === 3, s2.parciais);
  const r2 = await confirmar(c2, s2);
  T.ok('o primeiro grava, o segundo falha (já existe), o terceiro não é feito', !r2.resultados[0].is_error && r2.resultados[1].is_error && /Já existe/.test(r2.resultados[1].content) && r2.resultados[2].content === C.PAROU_ANTES, r2.resultados);
  T.ok('uma Tosa bebê só, a de R$ 70; o banho ficou como estava', B.num(`select count(*) from servicos where petshop_id='${P}' and nome='Tosa bebê'`) === 1 && servico('Tosa bebê') === '70.00/70.00/70.00/70.00' && servico('Banho') === '100.00/100.00/130.00/130.00');

  T.secao('Produto novo que chegou com quantidade: o preço de venda vai junto');
  const s3 = await pedir(cDono, 'chegaram 100 mordedores de plástico, vendo a 100 cada, paguei 80 cada', [
    uso('movimentar_estoque', { produto_nome: 'Mordedor de plástico', unidade: 'un', tipo: 'entrada', quantidade: 100, custo_unitario: 80, preco_venda: 100 }),
  ]);
  const card3 = (s3.propostas[0]?.resumo.linhas || []).map(([k, v]) => `${k}: ${nb(v)}`);
  T.ok('o cartão mostra o custo e o preço de venda', card3.includes('Preço de venda: R$ 100,00 cada') && card3.some((l) => l.startsWith('Custo: R$ 80,00')), card3);
  await confirmar(cDono, s3);
  T.ok('o produto ficou com preço de venda 100, custo 80 e 100 no estoque', B.sql(`select preco_venda||'/'||custo||'/'||estoque::int from produtos where petshop_id='${P}' and nome='Mordedor de plástico'`) === '100.00/80.00/100', B.sql(`select preco_venda||'/'||custo||'/'||estoque from produtos where petshop_id='${P}' and nome='Mordedor de plástico'`));
  const s3b = await pedir(cDono, 'chegaram mais shampoo a 35', [uso('movimentar_estoque', { produto_id: L.prod, tipo: 'entrada', quantidade: 2, preco_venda: 35 })]);
  T.ok('produto que já existe: o preço muda com alterar_produto (sem cartão de entrada)', !s3b.propostas.length && s3b.vistos[0]?.is_error && /alterar_produto/.test(s3b.vistos[0].content), s3b.vistos);

  T.secao('Produto pelo Edu (só Estoque)');
  const cEdu = await contexto('estoque');
  const s4 = await pedir(cEdu, 'cadastra a bolinha de tênis a 15 reais, mínimo 5', [uso('criar_produto', { nome: 'Bolinha de tênis', preco_venda: 15, estoque_minimo: 5 })]);
  await confirmar(cEdu, s4);
  const bolinha = B.sql(`select id from produtos where petshop_id='${P}' and nome='Bolinha de tênis'`);
  T.ok('a bolinha entrou com R$ 15 e mínimo 5, saldo 0', B.sql(`select preco_venda||'/'||estoque_minimo::int||'/'||estoque::int from produtos where id='${bolinha}'`) === '15.00/5/0');
  const s5 = await pedir(cEdu, 'a bolinha custa 6', [uso('alterar_produto', { produto_id: bolinha, custo: 6 })]);
  T.ok('custo pelo Edu é recusado (ele não vê o custo)', !s5.propostas.length && /custo/.test(s5.vistos[0]?.content || ''), s5.vistos);
  const s6 = await pedir(cEdu, 'muda o mínimo da bolinha para 8', [uso('alterar_produto', { produto_id: bolinha, estoque_minimo: 8 })]);
  await confirmar(cEdu, s6);
  T.ok('o mínimo mudou para 8', B.num(`select estoque_minimo from produtos where id='${bolinha}'`) === 8);
  T.ok('o Edu não recebe alterar_tutor, criar_pacote nem criar_servico', !F.ferramentasPara(cEdu).some((f) => ['alterar_tutor', 'criar_pacote', 'criar_servico'].includes(f.name)));

  T.secao('Tutor pelo Tito (Agenda e Clientes)');
  const cTito = await contexto('tosador');
  const ana = L.tutores.Ana;
  const obsAntes = B.sql(`select coalesce(obs,'') from clientes where id='${ana}'`);
  const s7 = await pedir(cTito, 'o whats da ana mudou, anota e o aniversario dela é 14/03', [uso('alterar_tutor', { cliente_id: ana, telefone: '(11) 98888-7777', email: 'ana@exemplo.com', aniversario: '14/03', obs: 'Prefere horário de manhã' })]);
  T.ok('cartão de mudar os dados', s7.propostas.length === 1 && /Mudar dados de/.test(s7.propostas[0].resumo.titulo), s7.parciais);
  await confirmar(cTito, s7);
  T.ok('telefone, e-mail e aniversário gravados', B.sql(`select telefone||'/'||email||'/'||nascimento from clientes where id='${ana}'`) === '11988887777/ana@exemplo.com/1904-03-14', B.sql(`select telefone||'/'||email||'/'||nascimento from clientes where id='${ana}'`));
  T.ok('a observação entrou no fim, sem apagar a de antes', B.sql(`select obs from clientes where id='${ana}'`).endsWith('Prefere horário de manhã') && B.sql(`select obs from clientes where id='${ana}'`).startsWith(obsAntes));

  T.secao('Modelo de pacote pela Rita (Pacotes)');
  const cRita = await contexto('caixa');
  const s8 = await pedir(cRita, 'cria o pacote 4 banhos por 180, P 160 e G 200, vale 45 dias', [uso('criar_pacote', { nome: '4 banhos', servico_id: S.Banho, quantidade: 4, validade_dias: 45, preco: 180, preco_p: 160, preco_g: 200 })]);
  T.ok('cartão de criar modelo de pacote', s8.propostas[0]?.resumo.titulo === 'Criar modelo de pacote', s8.parciais);
  await confirmar(cRita, s8);
  const pac = B.sql(`select id from pacotes where petshop_id='${P}' and nome='4 banhos'`);
  T.ok('pacote com 4 usos, 45 dias, R$ 180 e P 160 / G 200', B.sql(`select quantidade||'/'||validade_dias||'/'||preco||'/'||(precos_porte->>'P')||'/'||(precos_porte->>'G') from pacotes where id='${pac}'`) === '4/45/180.00/160/200');
  const s9 = await pedir(cRita, 'o pacote de 4 banhos agora vale 60 dias', [uso('alterar_pacote', { pacote_id: pac, validade_dias: 60 })]);
  await confirmar(cRita, s9);
  T.ok('a validade mudou para 60 e o preço por porte ficou', B.sql(`select validade_dias||'/'||(precos_porte->>'P') from pacotes where id='${pac}'`) === '60/160');

  T.secao('Horário e diárias: só o dono');
  const s10 = await pedir(cDono, 'sábado fecha às 15h e a diária do hotel é 130', [
    uso('alterar_funcionamento', { dias: [{ dia: 'sabado', fecha: '15:00' }] }),
    uso('alterar_diarias', { hotel: 130 }),
  ]);
  T.ok('dois cartões', s10.propostas.length === 2, s10.parciais);
  await confirmar(cDono, s10);
  T.ok('sábado fecha às 15h', B.sql(`select horario->'6'->>'fecha' from petshops where id='${P}'`) === '15:00');
  T.ok('diária do hotel 130', B.num(`select diaria_hotel from petshops where id='${P}'`) === 130);
  const forjado = [uso('alterar_diarias', { hotel: 1 })];
  const r11 = await C.responderCartoes({ c: cRita, pendentes: forjado, liberado: true, decisoes: [{ id: forjado[0].id, ok: true }] });
  T.ok('cartão forjado pela Rita: recusado, a diária continua 130', r11.resultados[0].is_error && /só o dono/.test(r11.resultados[0].content) && B.num(`select diaria_hotel from petshops where id='${P}'`) === 130, r11.resultados);
  const r12 = await L.sb.caixa.from('servicos').update({ preco_p: 1 }).eq('id', S.Banho).select('id');
  T.ok('e o banco também não deixa a Rita mudar o preço do serviço', !r12.error && !r12.data.length && servico('Banho') === '100.00/100.00/130.00/130.00');

  T.secao('Lembrete para tutor sem telefone: salva o número e prepara a mensagem numa confirmação só');
  const valeria = B.must(await L.sb.dono.from('clientes').insert({ petshop_id: P, nome: 'Valeria Teste' }).select('id').single(), 'Valeria').id;
  const tobias = B.must(await L.sb.dono.from('pets').insert({ petshop_id: P, cliente_id: valeria, nome: 'Tobias', especie: 'cao', porte: 'M' }).select('id').single(), 'Tobias').id;
  // o horário do Tobias daqui a 6 dias, 15h às 16h15 (Brasília), banho + corte de unhas: o texto sai do modelo aprovado
  const dia6 = L.dia(6);
  const ag = B.must(await L.sb.dono.from('agendamentos').insert({ petshop_id: P, pet_id: tobias, servico_id: S.Banho, inicio: `${dia6}T18:00:00Z`, fim: `${dia6}T19:15:00Z`, preco: 100 }).select('id').single(), 'horário do Tobias').id;
  B.must(await L.sb.dono.from('agendamento_servicos').insert({ petshop_id: P, agendamento_id: ag, servico_id: S['Corte de unhas'], preco: 30, ordem: 1 }).select('id'), 'corte de unhas');
  const petshopAgora = (await R.lerPetshop(L.sb.dono, P)).data;
  const lembrete = LZ.lembreteDoHorario({ tutor: 'Valeria Teste', petshop: { nome: petshopAgora.nome, endereco: petshopAgora.endereco, bairro: petshopAgora.bairro }, hoje: L.hoje,
    horarios: [{ inicio: `${dia6}T15:00`, fim: `${dia6}T16:15`, pets: [{ nome: 'Tobias', servicos: ['Banho', 'Corte de unhas'] }] }] });
  T.ok('o modelo do lembrete: término às 16h15 e Banho + corte de unhas', /🕒 \*15h\* \(término previsto às 16h15\)\n✂️ Banho \+ corte de unhas/.test(lembrete), lembrete);
  const sem = await pedir(cDono, 'manda o lembrete do tobias', [uso('preparar_mensagens', { mensagens: [{ agendamento_ids: [ag] }] })]);
  const semR = JSON.parse(sem.vistos[0].content);
  T.ok('sem telefone: nenhum botão, e a ferramenta manda pedir o número na conversa', !sem.links.length && semR.sem_telefone[0] === 'Tobias' && /Peça o número na conversa/.test(semR.sem_telefone_o_que_fazer), semR);
  const com = await pedir(cDono, 'o whats dela é 11 97777-6666', [
    uso('alterar_tutor', { cliente_id: valeria, telefone: '11 97777-6666' }),
    uso('preparar_mensagens', { mensagens: [{ agendamento_ids: [ag], telefone: '11 97777-6666' }] }),
  ]);
  T.ok('um cartão (salvar o WhatsApp na ficha) e o botão do WhatsApp com o número e o texto prontos', com.propostas.length === 1 && com.propostas[0].ferramenta === 'alterar_tutor'
    && com.links.length === 1 && com.links[0].url === `https://wa.me/5511977776666?text=${encodeURIComponent(lembrete)}`, { propostas: com.propostas.map((x) => x.resumo), links: com.links });
  T.ok('nada salvo antes de confirmar', B.sql(`select coalesce(telefone,'') from clientes where id='${valeria}'`) === '');
  await confirmar(cDono, com);
  T.ok('confirmado: o WhatsApp ficou na ficha da Valeria', B.sql(`select telefone from clientes where id='${valeria}'`) === '11977776666');
  const outra = B.must(await L.sb.dono.from('clientes').insert({ petshop_id: P, nome: 'Sem Numero' }).select('id').single(), 'tutor sem número').id;
  const bob2 = B.must(await L.sb.dono.from('pets').insert({ petshop_id: P, cliente_id: outra, nome: 'Bidu', especie: 'cao' }).select('id').single(), 'Bidu').id;
  const semNumero = await pedir(cDono, 'não quero salvar o número, só prepara', [uso('preparar_mensagens', { mensagens: [{ pet_id: bob2, texto: 'Oi! Lembrete do banho do Bidu.', sem_numero: true }] })]);
  T.ok('sem salvar o número: botão que abre o WhatsApp com o texto, para escolher o contato', semNumero.links.length === 1 && semNumero.links[0].url === `https://wa.me/?text=${encodeURIComponent('Oi! Lembrete do banho do Bidu.')}` && /escolha o contato/.test(semNumero.links[0].nome), semNumero.links);
  T.ok('e nada foi gravado', !semNumero.propostas.length && B.sql(`select coalesce(telefone,'') from clientes where id='${outra}'`) === '');

  T.secao('Modo envio: o lembrete de amanhã vem com o término (migração 20261238)');
  const amanha = L.dia(1);
  const agAmanha = B.must(await L.sb.dono.from('agendamentos').insert({ petshop_id: P, pet_id: tobias, servico_id: S.Banho, inicio: `${amanha}T13:00:00Z`, fim: `${amanha}T14:15:00Z`, preco: 100 }).select('id').single(), 'horário de amanhã').id;
  const me = B.must(await L.sb.dono.rpc('gestao_modo_envio', { p: P, p_dias: 15 }), 'gestao_modo_envio');
  const item = (me.itens.lembrete || []).find((x) => x.id === agAmanha);
  T.ok('gestao_modo_envio devolve o fim do horário', item && new Date(item.fim).toISOString() === new Date(`${amanha}T14:15:00Z`).toISOString(), item || JSON.stringify(me).slice(0, 600));
  const ME = lib('modo-envio');
  const fila = ME.montarFila({ itens: { lembrete: (me.itens.lembrete || []).filter((x) => x.id === agAmanha) } }, (await R.lerPetshop(L.sb.dono, P)).data);
  T.ok('e o texto do Modo envio diz "término previsto às 11h15"', /🕒 \*10h\* \(término previsto às 11h15\)\n✂️ Banho/.test(fila.mensagens[0]?.texto || ''), fila.mensagens[0]?.texto);
}))();
