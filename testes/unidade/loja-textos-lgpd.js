// Unidade: achados da 2ª rodada (Camila, Neide e Juliana) na loja, nos textos e na LGPD.
//   - mensagens com do/da pelo sexo do pet e com o verbo concordando ("Pipoca marcada", "O banho e a hidratação da Luna
//     ficaram marcados"), sem mudar o texto de quem não tem sexo na ficha (agenda.ts);
//   - equipe com o mesmo primeiro nome ("Banhista Ana" e "Banhista Beto") aparece com o nome que diferencia (util.ts);
//   - valor em estoque sem o custo médio arredondado: 5 × 142 + 4 × 150 = R$ 1.310,00, não 9 × 145,56 = 1.310,04 (compra.ts);
//   - planilha de produtos: unidade "unidade" vira "un", validade em vários formatos (planilha-produtos.ts);
//   - boletim: selo com os serviços feitos e "Comportada" para fêmea (boletim.ts);
//   - aniversário do pet sem o ano (1904): sem idade, sem "idoso" (util.ts, entrada.ts, aniversario.ts).
const assert = require('node:assert/strict');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('unidade-loja-textos-lgpd');
const A = lib('agenda');
const U = lib('util');
const C = lib('compra');
const P = lib('planilha-produtos');
const B = lib('boletim');
const E = lib('entrada');
const N = lib('aniversario');
const MP = lib('mensagens-prontas');
const t = (nome, f) => { try { f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };
const base = { tutor: 'Neide Teste', petshop: 'Banho da Neide', quando: 'sexta, 20/11', hora: '10:00' };

T.secao('do/da e concordância (Neide)');
t('"Pipoca marcado" → "Pipoca marcada" (fêmea); sem sexo fica como antes', () => {
  assert.equal(A.marcadoPara('Pipoca', 'F'), 'Pipoca marcada');
  assert.equal(A.marcadoPara('Thor', 'M'), 'Thor marcado');
  assert.equal(A.marcadoPara('Bidu', null), 'Bidu marcado');
});
t('confirmação: "O banho e a hidratação da Luna ficaram marcados" (antes: "O banho e hidratação de Luna ficou marcado")', () => {
  const s = A.textoConfirmacao({ ...base, pet: 'Luna', sexo: 'F', servico: 'Banho e Hidratação' });
  assert.match(s, /O banho e a hidratação da Luna ficaram marcados para sexta, 20\/11 às 10:00\./);
});
t('confirmação de um serviço feminino: "A tosa da Pipoca ficou marcada"', () =>
  assert.match(A.textoConfirmacao({ ...base, pet: 'Pipoca', sexo: 'F', servico: 'Tosa' }), /A tosa da Pipoca ficou marcada/));
t('pronto: "O banho e a hidratação da Luna terminaram"; um serviço: "O banho do Thor terminou"', () => {
  assert.match(A.textoPronto({ ...base, pet: 'Luna', sexo: 'F', servico: 'Banho e Hidratação' }), /O banho e a hidratação da Luna terminaram\. Já pode vir buscar\./);
  assert.match(A.textoPronto({ ...base, pet: 'Thor', sexo: 'M', servico: 'Banho' }), /O banho do Thor terminou\./);
});
t('lembrete: "lembrar do banho e da hidratação da Luna"', () =>
  assert.match(A.textoLembrete({ ...base, pet: 'Luna', sexo: 'F', servico: 'Banho e Hidratação' }), /Passando para lembrar do banho e da hidratação da Luna sexta, 20\/11 às 10:00\./));
t('remarcado: "A tosa e a hidratação do Rex foram remarcadas"', () =>
  assert.match(A.textoRemarcado({ ...base, pet: 'Rex', sexo: 'M', servico: 'Tosa e Hidratação' }), /A tosa e a hidratação do Rex foram remarcadas/));
t('cancelado: "O horário da Mel de ..."', () => assert.match(A.textoCancelado({ ...base, pet: 'Mel', sexo: 'F' }), /O horário da Mel de sexta/));
t('serviço com nome que o sistema não conhece: "O horário do Rex ficou marcado"', () =>
  assert.match(A.textoConfirmacao({ ...base, pet: 'Rex', sexo: 'M', servico: 'Pacote mensal' }), /O horário do Rex ficou marcado/));
t('sem sexo na ficha: "de Luna", como antes', () => assert.match(A.textoPronto({ ...base, pet: 'Luna', servico: 'Banho' }), /O banho de Luna terminou/));
t('lembrete de dois horários do mesmo tutor: "o banho do Thor às 09:00 e o banho e a hidratação da Mel às 10:00"', () => {
  const dia = new Date(); dia.setDate(dia.getDate() + 1);
  const as = (h) => { const d = new Date(dia); d.setHours(h, 0, 0, 0); return d.toISOString(); };
  const s = MP.mensagemDoLembrete([
    { inicio: as(9), pets: { nome: 'Thor', sexo: 'M', clientes: { nome: 'Ana' } }, servicos: { nome: 'Banho' } },
    { inicio: as(10), pets: { nome: 'Mel', sexo: 'F', clientes: { nome: 'Ana' } }, servicos: { nome: 'Banho' }, agendamento_servicos: [{ ordem: 1, servicos: { nome: 'Hidratação' } }] },
  ], 'Banho da Neide');
  assert.match(s, /o banho do Thor às 09:00 e o banho e a hidratação da Mel às 10:00/);
});

T.secao('equipe com o mesmo primeiro nome (Camila)');
t('"Banhista Ana" e "Banhista Beto" não viram os dois "Banhista"', () => {
  const todos = ['Banhista Ana', 'Banhista Beto', 'Camila Souza'];
  assert.equal(U.nomeNaEquipe('Banhista Ana', todos), 'Banhista Ana');
  assert.equal(U.nomeNaEquipe('Banhista Beto', todos), 'Banhista Beto');
  assert.equal(U.nomeNaEquipe('Camila Souza', todos), 'Camila');
});
t('três palavras: para na que diferencia; nomes iguais: o nome inteiro', () => {
  assert.equal(U.nomeNaEquipe('Ana Paula Souza', ['Ana Paula Souza', 'Ana Lima']), 'Ana Paula');
  assert.equal(U.nomeNaEquipe('Kátia', ['Kátia', 'Neide']), 'Kátia');
});

T.secao('valor em estoque sem arredondar o custo médio (Camila)');
t('5 × 142 + 4 × 150 = R$ 1.310,00 com o custo exato (com o arredondado daria 1.310,04)', () => {
  const golden = { estoque: 9, custo: 145.56, custo_exato: 1310 / 9, tipo: 'produto' };
  assert.equal(C.valorEmEstoque([golden]), 1310);
  assert.equal(C.valorEmEstoque([{ ...golden, custo_exato: null }]), 1310.04);
});
t('kit e produto sem custo ficam de fora; soma e arredonda só no fim', () =>
  assert.equal(C.valorEmEstoque([{ estoque: 3, custo: 1.25, custo_exato: 1.2533, tipo: 'produto' }, { estoque: 2, custo: 10, tipo: 'kit' }, { estoque: 5, custo: null, tipo: 'produto' }]), 3.76));

T.secao('planilha de produtos (Camila)');
t('unidade: "unidade", "Unid." e vazio viram "un"; "Litros" vira "L"; desconhecida fica como veio', () => {
  assert.equal(P.unidadeDaPlanilha('unidade'), 'un');
  assert.equal(P.unidadeDaPlanilha('Unid.'), 'un');
  assert.equal(P.unidadeDaPlanilha(''), 'un');
  assert.equal(P.unidadeDaPlanilha('Litros'), 'L');
  assert.equal(P.unidadeDaPlanilha('Sacos'), 'saco');
  assert.equal(P.unidadeDaPlanilha('frasco'), 'frasco');
});
t('validade: 10/02/2027, 10-02-27, 2027-02-10, 02/2027 (último dia) e o número do Excel', () => {
  assert.equal(P.validadeDaPlanilha('10/02/2027'), '2027-02-10');
  assert.equal(P.validadeDaPlanilha('10-02-27'), '2027-02-10');
  assert.equal(P.validadeDaPlanilha('2027-02-10'), '2027-02-10');
  assert.equal(P.validadeDaPlanilha('02/2028'), '2028-02-29');
  assert.equal(P.validadeDaPlanilha('46428'), '2027-02-10');
  assert.equal(P.validadeDaPlanilha(''), null);
  assert.equal(P.validadeDaPlanilha('31/02/2027'), undefined);
  assert.equal(P.validadeDaPlanilha('logo'), undefined);
});

T.secao('boletim (Neide)');
t('selo do banho: os serviços feitos ("Banho e hidratação"), sem serviço "Banho e tosa"', () => {
  assert.equal(B.seloDoBanho(['Banho', 'Hidratação']), 'Banho e hidratação');
  assert.equal(B.seloDoBanho(['Banho']), 'Banho');
  assert.equal(B.seloDoBanho(['Banho', 'Tosa', 'Hidratação']), 'Banho e mais 2');
  assert.equal(B.seloDoBanho([]), 'Banho e tosa');
});
t('"Comportado" vira "Comportada" para fêmea; macho e sem sexo ficam', () => {
  assert.equal(B.recadoNoSexo('Comportado', 'F'), 'Comportada');
  assert.equal(B.recadoNoSexo('Comportado', 'M'), 'Comportado');
  assert.equal(B.recadoNoSexo('Comportado', null), 'Comportado');
  assert.equal(B.recadoNoSexo('Perfume', 'F'), 'Perfume');
});

T.secao('aniversário do pet sem o ano (Neide)');
t('dia e mês sem o ano: guarda 1904 e a idade não aparece', () => {
  const m = N.montarNascimento(20, 11, null);
  assert.equal(m.valor, '1904-11-20');
  assert.equal(U.idade(m.valor), null);
  assert.equal(E.anosDe(m.valor), null);
  assert.equal(E.ehIdoso(m.valor), false);
  assert.equal(N.diaNoMes(m.valor, 11, 2026), 20);
});
t('com o ano, a idade continua', () => {
  const hoje = new Date();
  const m = N.montarNascimento(1, 1, hoje.getFullYear() - 9);
  assert.equal(E.anosDe(m.valor, hoje), 9);
  assert.equal(E.ehIdoso(m.valor, hoje), true);
  assert.match(U.idade(m.valor), /^9 anos$/);
});

(async () => T.rodar(async () => {}))();
