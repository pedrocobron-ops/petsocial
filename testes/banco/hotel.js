// Preço do hotel: a regra mora em dois lugares e tem de dar o mesmo centavo: no banco (hotel_noite, hotel_previsto) e no
// aplicativo (precoDasNoites, diasDeSegundoPet, contaDasDiarias em src/lib/gestao/hotel.ts). Compara centenas de noites:
// temporadas (% / R$ a mais / diária própria, sobrepostas e empatadas), feriado nos três modos, diária por porte e segundo pet.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('hotel');
const H = lib('hotel'), HO = lib('hotel-opcoes'), FE = lib('feriados');

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Hotel' });
  const { dono } = L.sb;
  const P = L.P;
  const X = L.dia(40); // tudo bem longe de hoje
  const d = (n) => B.somaDias(X, n);
  const temporadas = [
    { id: 'ferias', nome: 'Férias', de: d(0), ate: d(20), modo: 'pct', valor: 20 },
    { id: 'reveillon', nome: 'Réveillon', de: d(10), ate: d(12), modo: 'valor', valor: 180 },
    { id: 'feriadao', nome: 'Feriadão', de: d(15), ate: d(17), modo: 'mais', valor: 15 },
    { id: 'empate-a', nome: 'Empate A', de: d(25), ate: d(27), modo: 'pct', valor: 10 },
    { id: 'empate-b', nome: 'Empate B', de: d(25), ate: d(27), modo: 'pct', valor: 50 },
    { id: 'antes', nome: 'Antes', de: d(30), ate: d(32), modo: 'pct', valor: 5 },
    { id: 'depois', nome: 'Depois', de: d(31), ate: d(33), modo: 'mais', valor: 7.5 },
  ];
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: {
    'hotel.temporadas': { ativo: true, lista: temporadas },
    'hotel.desconto_segundo_pet': { ativo: true, pct: 25 },
    'hotel.diaria_por_porte': { ativo: true, P: 90, M: 110, G: 130, GG: 150 },
  } }), 'opções do hotel');
  const feriados = [[d(5), 'Dia A'], [d(11), 'Ano Novo'], [d(16), 'Dia B'], [d(35), 'Sozinho'], [d(36), '']];
  for (const [dia, nome] of feriados) B.must(await dono.from('dias_especiais').insert({ petshop_id: P, dia, nome, feriado: true, fechado: false }).select('id'), 'feriado ' + dia);
  const opcoes = B.must(await dono.rpc('petshop_opcoes', { p: P }), 'opções');
  const petshop = { id: P, opcoes, diaria_hotel: 120, diaria_creche: 70 };
  const lista = HO.temporadasDe(petshop).lista;
  T.ok('o aplicativo lê as 7 temporadas', lista.length === 7, lista.map((t) => t.id));
  const nomeDe = (dia) => { const f = feriados.find((x) => x[0] === dia); return f ? (f[1] ? `Feriado: ${f[1]}` : 'Feriado') : null; };

  T.secao('uma noite: banco × aplicativo');
  const dias = Array.from({ length: 41 }, (_, i) => d(i - 2));
  const bases = [80, 110.55, 99.99];
  for (const regra of [{ ativo: true, modo: 'pct', valor: 30 }, { ativo: true, modo: 'valor', valor: 200 }, { ativo: true, modo: 'mais', valor: 25 }]) {
    B.must(await dono.from('hotel_precos').upsert({ petshop_id: P, feriado: regra, atraso: { ativo: false } }, { onConflict: 'petshop_id' }).select('petshop_id'), 'regra de feriado');
    const doBanco = JSON.parse(B.sql(`select json_agg(json_build_object('dia', d.dia, 'base', b.base, 'seg', s.seg, 'valor', n.valor, 'cheia', n.cheia, 'marca', n.marca))
      from unnest(array[${dias.map((x) => `'${x}'::date`).join(',')}]) d(dia), unnest(array[${bases.join(',')}]::numeric[]) b(base), unnest(array[false, true]) s(seg),
      lateral public.hotel_noite('${P}', d.dia, b.base, s.seg) n`));
    let iguais = 0; const dif = [];
    for (const r of doBanco) {
      const [n] = H.precoDasNoites({ dias: [r.dia], base: Number(r.base), temporadas: lista, segundoPct: 25, diasDeSegundo: new Set(r.seg ? [r.dia] : []), feriado: { regra, nomeDe } });
      if (B.centavos(n.valor) === B.centavos(r.valor) && B.centavos(n.cheia) === B.centavos(r.cheia) && (n.temporada ?? null) === (r.marca ?? null)) iguais++;
      else dif.push({ dia: r.dia, base: r.base, seg: r.seg, banco: [r.cheia, r.valor, r.marca], app: [n.cheia, n.valor, n.temporada] });
    }
    T.ok(`feriado em "${regra.modo}": ${doBanco.length} noites, banco = aplicativo ao centavo (e o mesmo nome na conta)`, dif.length === 0 && doBanco.length === dias.length * 6, dif.slice(0, 3));
  }
  // casos à mão (feriado em %: 30)
  B.must(await dono.from('hotel_precos').upsert({ petshop_id: P, feriado: { ativo: true, modo: 'pct', valor: 30 }, atraso: { ativo: false } }, { onConflict: 'petshop_id' }).select('petshop_id'), 'regra de feriado');
  const noite = (dia, base, seg = false) => JSON.parse(B.sql(`select row_to_json(n) from public.hotel_noite('${P}', '${dia}', ${base}, ${seg}) n`));
  T.ok('noite comum: a diária combinada (R$ 100,00)', noite(d(-1), 100).valor == 100);
  T.ok('Férias (+20%): R$ 120,00', noite(d(1), 100).valor == 120 && noite(d(1), 100).marca === 'Férias');
  T.ok('feriado dentro das Férias: vale o feriado (+30%), "Feriado: Dia A"', noite(d(5), 100).valor == 130 && noite(d(5), 100).marca === 'Feriado: Dia A');
  T.ok('feriado dentro do Réveillon (diária própria): vale o Réveillon, R$ 180,00', noite(d(11), 100).valor == 180 && noite(d(11), 100).marca === 'Réveillon');
  T.ok('Réveillon (mais curto) vence as Férias: R$ 180,00', noite(d(10), 100).valor == 180);
  T.ok('Feriadão (R$ 15 a mais): R$ 115,00; feriado dentro dele vale o feriado', noite(d(15), 100).valor == 115 && noite(d(16), 100).valor == 130);
  T.ok('empate de tamanho e começo: vale a primeira da lista (Empate A, +10%)', noite(d(26), 100).valor == 110 && noite(d(26), 100).marca === 'Empate A');
  T.ok('mesmo tamanho, começos diferentes: vale a que começa depois', noite(d(32), 100).valor == 107.5 && noite(d(32), 100).marca === 'Depois');
  T.ok('segundo pet: 25% de desconto sobre a noite (R$ 120,00 → 90,00)', noite(d(1), 100, true).valor == 90 && noite(d(1), 100, true).desconto == 30);
  T.ok('feriado sem nome: "Feriado"', noite(d(36), 100).marca === 'Feriado');

  T.secao('estadia inteira: hotel_previsto × contaDasDiarias (porte e segundo pet)');
  await FE.lerCalendario(dono, P, true);
  T.ok('diária sugerida por porte: P 90, M 110, GG 150', H.diariaSugerida(petshop, 'hotel', 'P') === 90 && H.diariaSugerida(petshop, 'hotel', 'M') === 110 && H.diariaSugerida(petshop, 'hotel', 'GG') === 150);
  const reserva = async (pet, porte, de, ate) => B.must(await dono.from('estadias').insert({ petshop_id: P, pet_id: L.pets[pet], tipo: 'hotel', status: 'reservada', entrada: B.instante(de, '12:00', L.fuso).toISOString(), saida_prevista: B.instante(ate, '12:00', L.fuso).toISOString(), valor_diaria: H.diariaSugerida(petshop, 'hotel', porte) }).select('id').single(), 'reserva ' + pet).id;
  const eThor = await reserva('Thor', 'M', d(8), d(14)); // 6 noites: Férias, Réveillon (com feriado), Férias
  const eMel = await reserva('Mel', 'P', d(9), d(12)); // 3 noites junto com o Thor: a Mel (diária mais baixa) tem o desconto
  const eRex = await reserva('Rex', 'GG', d(34), d(38)); // outro tutor, feriados soltos
  const estadias = JSON.parse(B.sql(`select json_agg(json_build_object('id', id, 'pet_id', pet_id, 'tipo', tipo, 'status', status, 'entrada', entrada, 'saida_prevista', saida_prevista, 'saida', saida, 'diarias_cobradas', diarias_cobradas, 'valor_diaria', valor_diaria, 'criado_em', criado_em)) from estadias where petshop_id='${P}'`));
  const hoje = new Date();
  for (const [nome, id, pet] of [['Thor (M, 6 noites)', eThor, 'Thor'], ['Mel (P, segundo pet)', eMel, 'Mel'], ['Rex (GG, feriados soltos)', eRex, 'Rex']]) {
    const e = estadias.find((x) => x.id === id);
    const outras = estadias.filter((x) => x.id !== id && B.sql(`select cliente_id from pets where id='${x.pet_id}'`) === L.petsDe[pet]);
    const n = Math.round((new Date(e.saida_prevista) - new Date(e.entrada)) / 864e5);
    const app = H.contaDasDiarias(petshop, e, n, Number(e.valor_diaria), outras, hoje);
    const banco = Number(B.sql(`select public.hotel_previsto('${id}')`));
    T.ok(`${nome}: banco R$ ${banco.toFixed(2)} = aplicativo`, B.centavos(app.total) === B.centavos(banco), { app: app.total, banco, noites: app.noites?.map((x) => `${x.dia}:${x.valor}`) });
  }
  // à mão: Mel 90/noite, noites d9 (Férias 108), d10 (Réveillon 180), d11 (Réveillon 180), todas com 25% de segundo pet
  T.ok('Mel à mão: (108 + 180 + 180) × 75% = R$ 351,00', Number(B.sql(`select public.hotel_previsto('${eMel}')`)) === 351);
  const doLink = B.must(await B.cliente(B.ipAleatorio()).rpc('link_hotel_opcoes', { p_codigo: L.codigo }), 'link_hotel_opcoes');
  T.ok('o link do cliente mostra a faixa da diária por porte (R$ 90 a R$ 150, varia)', doLink.preco?.de === 90 && doLink.preco?.ate === 150 && doLink.preco?.varia === true && doLink.preco?.mostrar === true, doLink);
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'hotel.link_sem_preco': true } }), 'esconde o preço');
  const semPreco = B.must(await B.cliente(B.ipAleatorio()).rpc('link_hotel_opcoes', { p_codigo: L.codigo }), 'link sem preço');
  T.ok('com "Esconder o preço", o link não recebe valor', !semPreco.preco || semPreco.preco.mostrar === false && semPreco.preco.de == null, semPreco);
  T.recusa('hotel_noite não é chamável pela API', await dono.rpc('hotel_noite', { p_petshop: P, p_dia: d(1), p_base: 100, p_segundo: false }));
}))();
