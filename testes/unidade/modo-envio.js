// Unidade: a fila do Modo envio (src/lib/gestao/modo-envio.ts) montada a partir do que gestao_modo_envio devolve.
// Uma mensagem por tutor e por tipo, o texto igual ao das outras telas (lembrete, pronto, saúde, chamar de volta, aniversário,
// cobrança, chegada), a renovação do pacote, o aniversário do tutor (texto padrão), e quem fica de fora: sem telefone, telefone incompleto, "não quer receber mensagens".
const assert = require('node:assert/strict');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('unidade-modo-envio');
const ME = lib('modo-envio');
const MP = lib('mensagens-prontas');
const AG = lib('agenda');
const DO = lib('dinheiro-opcoes');
const t = (nome, f) => { try { f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };

const petshop = { id: 'p', nome: 'Banho da Neide', opcoes: {} };
const ana = { id: 'c-ana', nome: 'Ana Souza', telefone: '11988880001', nao_quer: false };
const beto = { id: 'c-beto', nome: 'Beto Lima', telefone: null, nao_quer: false };
const clara = { id: 'c-clara', nome: 'Clara Dias', telefone: '11988880003', nao_quer: true };
const davi = { id: 'c-davi', nome: 'Davi Reis', telefone: '1198', nao_quer: false };
const thor = { id: 'p-thor', nome: 'Thor', sexo: 'M' }, mel = { id: 'p-mel', nome: 'Mel', sexo: 'F' }, bob = { id: 'p-bob', nome: 'Bob', sexo: 'M' };
const luna = { id: 'p-luna', nome: 'Luna', sexo: 'F' }, rex = { id: 'p-rex', nome: 'Rex', sexo: 'M' };
// datas a partir de hoje (o "amanhã" do texto do lembrete sai do relógio da máquina)
const H = new Date(); const Y = H.getFullYear(), M = H.getMonth(), D = H.getDate();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const HOJE = iso(H), mais = (n) => iso(new Date(Y, M, D + n));
const ddmmaaaa = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
const amanha = (h) => new Date(Y, M, D + 1, h, 0).toISOString();
const hoje = (h) => new Date(Y, M, D, h, 0).toISOString();
const banho = { servicos: { nome: 'Banho' }, agendamento_servicos: [] };
const dados = {
  dia: HOJE,
  modelos: { 'chamar.niver': 'Parabéns para [pet]!' },
  itens: {
    lembrete: [
      { id: 'a1', inicio: amanha(9), pet: thor, tutor: ana, ...banho },
      { id: 'a2', inicio: amanha(10), pet: mel, tutor: ana, servicos: { nome: 'Banho' }, agendamento_servicos: [{ ordem: 1, servicos: { nome: 'Hidratação' } }] },
      { id: 'a3', inicio: amanha(11), pet: bob, tutor: beto, ...banho },
      { id: 'a4', inicio: amanha(14), pet: luna, tutor: clara, ...banho },
      { id: 'a5', inicio: amanha(15), pet: rex, tutor: davi, ...banho },
    ],
    pronto: [{ id: 'a6', inicio: hoje(9), pet: thor, tutor: ana, ...banho }],
    saude: [
      { id: 's1', pet_id: thor.id, tipo: 'vacina', nome: 'V10', vence_em: mais(3), pet: thor, tutor: ana },
      { id: 's2', pet_id: thor.id, tipo: 'vermifugo', nome: 'Drontal', vence_em: mais(8), pet: thor, tutor: ana },
    ],
    niver: [{ id: mel.id, nome: 'Mel', nascimento: '2020-11-17', pet: mel, tutor: ana }],
    niver_tutor: [
      { id: ana.id, nome: 'Ana Souza', nascimento: '1904-11-17', pets: [thor, mel], tutor: ana },
      { id: clara.id, nome: 'Clara Dias', nascimento: '1980-11-17', pets: [luna], tutor: clara },
    ],
    pacote: [{ id: 'pc1', nome: 'Pacote de 4 banhos', total: 4, usados: 4, pet: thor, tutor: ana }],
    cobranca: [{ cliente_id: ana.id, total: 75, tutor: ana, contas: [
      { id: 'l1', valor: 35, valor_original: null, descricao: 'Banho', categoria: 'Banho e tosa', vencimento: mais(-7), multa_recebida: null, multa_recebida_em: null },
      { id: 'l2', valor: 40, valor_original: null, descricao: null, categoria: 'Outros', vencimento: null, multa_recebida: null, multa_recebida_em: null },
    ] }],
    volta: [{ id: thor.id, ultima: new Date(Y, M, D - 100, 10).toISOString(), servico: 'Banho', pet: thor, tutor: ana }, { id: mel.id, ultima: new Date(Y, M, D - 130, 10).toISOString(), servico: null, pet: mel, tutor: ana }],
    chegada: [{ id: 'e1', tipo: 'hotel', entrada: amanha(8), saida_prevista: null, pet: bob, tutor: { ...beto, telefone: '11988880002' } }],
  },
};
const fila = ME.montarFila(dados, petshop);
const de = (tipo) => fila.mensagens.filter((m) => m.tipo === tipo);

T.secao('quem entra e quem fica de fora');
t('lembrete: Ana recebe uma mensagem só para Thor e Mel (dois horários)', () => { const l = de('lembrete'); assert.equal(l.length, 1); assert.deepEqual(l[0].refs, ['a1', 'a2']); assert.equal(l[0].telefone, '11988880001'); });
t('sem telefone (Beto), não quer receber (Clara), telefone incompleto (Davi): de fora, com o motivo', () => {
  const m = Object.fromEntries(fila.pulados.filter((p) => p.tipo === 'lembrete').map((p) => [p.quem, p.motivo]));
  assert.deepEqual(m, { 'Beto Lima': 'sem telefone', 'Clara Dias': 'não quer receber mensagens', 'Davi Reis': 'telefone incompleto' });
});
t('ordem da fila: pronto, lembrete, chegada, cobrança, saúde, pacote, aniversário, aniversário do tutor, chamar de volta', () =>
  assert.deepEqual([...new Set(fila.mensagens.map((m) => m.tipo))], ['pronto', 'lembrete', 'chegada', 'cobranca', 'saude', 'pacote', 'niver', 'niver_tutor', 'volta']));
t('contagem por tipo', () => assert.deepEqual(ME.contarPorTipo(fila), { pronto: 1, lembrete: 1, chegada: 1, cobranca: 1, saude: 1, pacote: 1, niver: 1, niver_tutor: 1, volta: 1 }));
t('aniversário do tutor: a Clara (não quer receber) fica de fora', () =>
  assert.deepEqual(fila.pulados.filter((p) => p.tipo === 'niver_tutor').map((p) => [p.quem, p.motivo]), [['Clara Dias', 'não quer receber mensagens']]));

T.secao('o texto é o mesmo das outras telas');
t('lembrete = mensagemDoLembrete (Agenda, "Mandar os lembretes")', () => {
  const l = de('lembrete')[0];
  const esperado = MP.mensagemDoLembrete([
    { inicio: amanha(9), pets: { nome: 'Thor', sexo: 'M', clientes: { nome: 'Ana Souza' } }, ...banho },
    { inicio: amanha(10), pets: { nome: 'Mel', sexo: 'F', clientes: { nome: 'Ana Souza' } }, servicos: { nome: 'Banho' }, agendamento_servicos: [{ ordem: 1, servicos: { nome: 'Hidratação' } }] },
  ], 'Banho da Neide');
  assert.equal(l.texto, esperado);
  // o modelo aprovado (lembrete-zap.ts): dois horários da Ana amanhã, cada pet com o seu serviço
  const ddmm = String(new Date(Y, M, D + 1).getDate()).padStart(2, '0') + '/' + String(new Date(Y, M, D + 1).getMonth() + 1).padStart(2, '0');
  assert.equal(l.texto, `Olá, Ana! 🐾\nAqui é do *Banho da Neide*. Passando para lembrar dos horários do *Thor* e do *Mel*:\n\n📅 *Amanhã, ${ddmm}*\n🕒 *9h*\n✂️ Thor: Banho\n🕒 *10h*\n✂️ Mel: Banho + hidratação\n\nPode confirmar respondendo esta mensagem? Se precisar remarcar, é só avisar.\nAté lá!`);
});
t('pet pronto = textoPronto ("O banho do Thor terminou. Já pode vir buscar.", do/da pelo sexo)', () => {
  assert.equal(de('pronto')[0].texto, AG.textoPronto({ tutor: 'Ana Souza', pet: 'Thor', sexo: 'M', petshop: 'Banho da Neide', servico: 'Banho' }));
  assert.match(de('pronto')[0].texto, /O banho do Thor terminou\. Já pode vir buscar\.$/);
});
t('saúde: uma mensagem com os dois cuidados do Thor (mensagemSaude)', () => {
  const s = de('saude')[0];
  assert.deepEqual(s.refs, ['s1', 's2']);
  assert.equal(s.texto, MP.mensagemSaude('Ana Souza', 'Thor', 'Banho da Neide', dados.itens.saude, new Date(Y, M, D)));
  assert.match(s.texto, new RegExp(`- Vacina V10: vence em ${ddmmaaaa(mais(3))}\\n- Vermífugo Drontal: vence em ${ddmmaaaa(mais(8))}`));
});
t('aniversário com o texto do pet shop (modelos_mensagem)', () => assert.equal(de('niver')[0].texto, 'Oi, Ana! Aqui é Banho da Neide. Parabéns para Mel!'));
t('aniversário do tutor: a ref é o tutor e vai o texto padrão, com os pets dele', () => {
  const n = de('niver_tutor')[0];
  assert.deepEqual(n.refs, ['c-ana']);
  assert.equal(n.texto, 'Oi, Ana! Aqui é Banho da Neide. Hoje é o seu aniversário! Toda a equipe deseja um dia muito feliz para você. Um abraço também para Thor e Mel.');
  assert.match(n.porque, /^Aniversário de Ana Souza hoje$/);
});
t('aniversário do tutor com o texto do pet shop', () => {
  const f2 = ME.montarFila({ dia: HOJE, modelos: { 'chamar.niver_tutor': 'Feliz aniversário! Beijo do [pet].' }, itens: { niver_tutor: dados.itens.niver_tutor } }, petshop);
  assert.equal(f2.mensagens[0].texto, 'Oi, Ana! Aqui é Banho da Neide. Feliz aniversário! Beijo do Thor e Mel.');
});
t('chamar de volta: uma mensagem para os dois pets, a ref é o tutor, texto padrão', () => {
  const v = de('volta')[0];
  assert.deepEqual(v.refs, ['c-ana']);
  assert.equal(v.texto, MP.montarMensagem('volta', '', { tutor: 'Ana Souza', pets: ['Thor', 'Mel'], petshop: 'Banho da Neide' }));
  assert.match(v.porque, /^Thor e Mel não vêm há 100 dias/);
});
t('cobrança = mensagemDeDivida (o que está em aberto e o total)', () => {
  const c = de('cobranca')[0];
  assert.deepEqual(c.refs, ['l1', 'l2']);
  assert.equal(c.texto, DO.mensagemDeDivida(petshop, 'Ana Souza', dados.itens.cobranca[0].contas, HOJE));
  assert.match(c.texto.replace(/ /g, ' '), /Total: R\$ 75,00/);
});
t('chegada do hotel com o texto do hotel', () => assert.match(de('chegada')[0].texto, /^Oi, Beto! Aqui é Banho da Neide\. Passando para lembrar: a chegada do Bob no hotel está marcada para amanhã, às 08:00\./));
t('pacote que acabou: oferece a renovação', () =>
  assert.equal(de('pacote')[0].texto, 'Oi, Ana! Aqui é Banho da Neide. O pacote 4 banhos de Thor chegou ao fim. Quer renovar para continuar? É só responder aqui que a gente já deixa separado.'));
t('pacote na última vez hoje', () =>
  assert.match(ME.textoRenovacao({ tutor: null, petshop: 'Banho da Neide', pets: ['Mel'], pacote: 'Pacote mensal', acabou: false }), /^Oi! Aqui é Banho da Neide\. Hoje Mel usa a última vez do pacote mensal\./));
t('link do WhatsApp com o texto que a pessoa mudou', () => {
  const l = de('lembrete')[0];
  assert.equal(ME.linkDaMensagem(l, 'Oi, Ana!'), 'https://wa.me/5511988880001?text=Oi%2C%20Ana!');
});
t('sem nada: fila vazia', () => assert.deepEqual(ME.montarFila({ dia: HOJE, modelos: {}, itens: {} }, petshop), { mensagens: [], pulados: [] }));

T.rodar(async () => {});
