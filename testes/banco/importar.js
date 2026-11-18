// Planilha de clientes numa operação só, no banco (achado da Juliana: sair da tela parou a importação em 7 de 10 e o resumo
// dizia "7 tutores e 6 pets" com 7 pets na lista; migração 20261217, `importar_clientes`). Confere: tudo ou nada, o resumo
// contado na mesma gravação (bate com o que entrou), a mesma chave não grava duas vezes, juntar com quem já existe, "Luna, Bob"
// em dois pets, observação de alergia vira alerta, desfazer pela importação guardada, quem pode e quem não pode.
// Também os rascunhos (`rascunhos`): cada pessoa só vê os seus.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('importar');
const PL = lib('planilha');

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Importar' });
  const { dono, caixa, estoque } = L.sb;
  const P = L.P;
  const n = (q) => B.num(q);

  // 10 linhas, como a planilha da Juliana: 7 tutores novos, um deles com "Luna, Bob" na mesma célula, um que já existe (Ana,
  // pelo telefone), um com observação de alergia, uma linha repetida e um homônimo do Beto com outro telefone
  const planilha = [
    { tutor: 'Tutor Um', telefone: '(11) 97000-0001', pet: 'Mel', especie: 'cão', porte: 'P' },
    { tutor: 'Tutor Dois', telefone: '11970000002', pet: 'Luna, Bob', especie: 'cachorro', porte: 'M' },
    { tutor: 'Tutor Três', telefone: '11 97000-0003', pet: 'Nina', especie: 'gato', obs: 'Alergia a shampoo comum' },
    { tutor: 'Tutor Quatro', telefone: '11970000004', pet: 'Thor', obs: 'Gosta de laço' },
    { tutor: 'Tutor Cinco', telefone: '11970000005', pet: 'Fred', obs: 'Bravo com outros machos' },
    { tutor: 'Tutor Seis', telefone: '1197000', pet: 'Pipoca' },
    { tutor: 'Ana S.', telefone: '11988880001', pet: 'Pipa', raca: 'Poodle' },
    { tutor: 'Ana S.', telefone: '11988880001', pet: 'Thor', raca: 'Labrador' },
    { tutor: 'Tutor Um', telefone: '11970000001', pet: 'Mel', porte: 'P' },
    { tutor: 'Beto Lima', telefone: '11970000099', pet: 'Zeca' },
  ];
  const { linhas, extra } = PL.linhasParaOBanco(planilha, true);
  T.secao('a tela prepara as linhas');
  T.ok('"Luna, Bob" vira duas linhas (11 ao todo)', linhas.length === 11 && extra.separados === 1, linhas.length);
  T.ok('telefone incompleto fica em branco e entra na lista para conferir', extra.fone_ruim.includes('Tutor Seis') && linhas.find((l) => l.tutor === 'Tutor Seis').fone === null);
  T.ok('alergia e "bravo" vão para os alertas; "gosta de laço" fica em observações',
    linhas.find((l) => l.pet === 'Nina').alertas === 'Alergia a shampoo comum' && linhas.find((l) => l.pet === 'Nina').obs === ''
    && /Bravo/.test(linhas.find((l) => l.pet === 'Fred').alertas) && linhas.find((l) => l.pet === 'Thor' && l.tutor === 'Tutor Quatro').obs === 'Gosta de laço');

  T.secao('importar numa operação só');
  const antes = { c: n(`select count(*) from clientes where petshop_id='${P}'`), p: n(`select count(*) from pets where petshop_id='${P}'`) };
  const chave = B.uuid();
  const r = await dono.rpc('importar_clientes', { p_petshop: P, p_chave: chave, p_linhas: linhas, p_extra: extra });
  T.passa('a dona importa', r);
  const res = r.data?.resumo ?? {};
  const depois = { c: n(`select count(*) from clientes where petshop_id='${P}'`), p: n(`select count(*) from pets where petshop_id='${P}'`) };
  T.ok('o resumo bate com o que entrou no banco (tutores)', res.tutores_novos === depois.c - antes.c && res.tutores_novos === 7, { res, antes, depois });
  T.ok('o resumo bate com o que entrou no banco (pets)', res.pets_novos === depois.p - antes.p && res.pets_novos === 9, { res, antes, depois });
  T.ok('ids criados = os que o resumo conta', r.data.clientes.length === 7 && r.data.pets.length === 9);
  T.ok('Ana (mesmo telefone) não duplicou: ganhou a Pipa', n(`select count(*) from clientes where petshop_id='${P}' and telefone='11988880001'`) === 1
    && n(`select count(*) from pets where cliente_id='${L.tutores.Ana}' and nome='Pipa' and raca='Poodle'`) === 1);
  T.ok('o Thor da Ana já existia: ganhou a raça (completou), sem outro Thor', n(`select count(*) from pets where cliente_id='${L.tutores.Ana}' and nome='Thor'`) === 1
    && B.sql(`select raca from pets where id='${L.pets.Thor}'`) === 'Labrador' && res.pets_completados === 1, res);
  T.ok('Luna e Bob do Tutor Dois, dois pets', n(`select count(*) from pets p join clientes c on c.id=p.cliente_id where c.petshop_id='${P}' and c.nome='Tutor Dois' and p.nome in ('Luna','Bob')`) === 2);
  T.ok('Nina com o alerta de alergia; Fred bravo', n(`select count(*) from pets where petshop_id='${P}' and nome='Nina' and alertas='Alergia a shampoo comum' and especie='gato'`) === 1
    && n(`select count(*) from pets where petshop_id='${P}' and nome='Fred' and alertas ilike '%bravo%'`) === 1 && res.com_alerta === 2, res);
  T.ok('a linha repetida do Mel foi pulada', res.linhas_repetidas === 1 && n(`select count(*) from pets p join clientes c on c.id=p.cliente_id where c.petshop_id='${P}' and c.nome='Tutor Um'`) === 1, res);
  T.ok('Beto com outro telefone entrou como outra pessoa (homônimo)', res.homonimos === 1 && n(`select count(*) from clientes where petshop_id='${P}' and nome='Beto Lima'`) === 2, res);
  const frases = PL.frasesDoResumo(res);
  T.ok('a primeira frase diz o que entrou: "7 tutores novos e 9 pets novos"', frases[0] === '7 tutores novos e 9 pets novos no cadastro.', frases);
  T.ok('e fala do pet separado, dos alertas e do telefone incompleto', frases.some((f) => /mais de um pet na mesma célula/.test(f)) && frases.some((f) => /2 pets ficaram com alerta/.test(f)) && frases.some((f) => /Tutor Seis/.test(f)), frases);

  T.secao('a mesma chave de novo (toque duplo, a internet caiu)');
  const r2 = await dono.rpc('importar_clientes', { p_petshop: P, p_chave: chave, p_linhas: linhas, p_extra: extra });
  T.passa('devolve o que já entrou, marcado como repetida', r2, r2.data?.repetida === true && r2.data?.resumo?.tutores_novos === 7);
  T.ok('nada gravado de novo', n(`select count(*) from clientes where petshop_id='${P}'`) === depois.c && n(`select count(*) from pets where petshop_id='${P}'`) === depois.p);
  const r3 = await dono.rpc('importar_clientes', { p_petshop: P, p_chave: B.uuid(), p_linhas: linhas, p_extra: extra });
  T.passa('a mesma planilha com outra chave: tudo já estava, nada novo', r3, r3.data?.resumo?.tutores_novos === 0 && r3.data?.resumo?.pets_novos === 0);
  T.ok('e diz "Nada novo"', PL.frasesDoResumo(r3.data.resumo)[0].startsWith('Nada novo'), PL.frasesDoResumo(r3.data.resumo));

  T.secao('tudo ou nada');
  const quebra = await dono.rpc('importar_clientes', { p_petshop: P, p_chave: B.uuid(), p_linhas: [
    { tutor: 'Linha Boa Um', fone: '11970000777', pet: 'Ok' }, 'texto solto', { tutor: '   ', pet: 'Sem tutor' }, { tutor: 'Linha Boa Dois', fone: '11970000778', pet: 'Ok2' },
  ], p_extra: {} });
  T.passa('linha estranha (texto solto, sem tutor) é pulada, o resto entra', quebra, quebra.data?.resumo?.tutores_novos === 2);
  // erro de verdade: um gatilho de teste que recusa o 2º cliente desta importação → nada da importação fica
  B.sql(`create or replace function public.t_imp_recusa() returns trigger language plpgsql as $$ begin if new.nome = 'Recusado No Meio' then raise exception 'recusado no meio'; end if; return new; end $$;
    create trigger t_imp_recusa before insert on public.clientes for each row execute function public.t_imp_recusa();`);
  T.depois(() => B.sql(`drop trigger if exists t_imp_recusa on public.clientes; drop function if exists public.t_imp_recusa();`));
  const antesTudo = n(`select count(*) from clientes where petshop_id='${P}'`);
  const chaveErro = B.uuid();
  const comErro = await dono.rpc('importar_clientes', { p_petshop: P, p_chave: chaveErro, p_linhas: [
    { tutor: 'Entraria Antes', fone: '11970000801', pet: 'Um' }, { tutor: 'Recusado No Meio', fone: '11970000802', pet: 'Dois' }, { tutor: 'Entraria Depois', fone: '11970000803', pet: 'Tres' },
  ], p_extra: {} });
  T.recusa('erro no meio: a importação inteira é recusada', comErro, /recusado no meio/);
  T.ok('nada entrou (nem o que vinha antes do erro)', n(`select count(*) from clientes where petshop_id='${P}'`) === antesTudo && n(`select count(*) from clientes where petshop_id='${P}' and nome='Entraria Antes'`) === 0);
  T.ok('e a chave não ficou gasta (tentar de novo depois funciona)', n(`select count(*) from importacoes where petshop_id='${P}' and chave='${chaveErro}'`) === 0);
  B.sql(`drop trigger if exists t_imp_recusa on public.clientes; drop function if exists public.t_imp_recusa();`);

  T.secao('quem pode');
  const ok1 = await caixa.rpc('importar_clientes', { p_petshop: P, p_chave: B.uuid(), p_linhas: [{ tutor: 'Da Recepção', fone: '11970000901', pet: 'Rec' }], p_extra: {} });
  T.passa('a recepção (área de clientes) importa', ok1, ok1.data?.resumo?.tutores_novos === 1);
  T.recusa('quem só cuida do estoque não importa clientes', await estoque.rpc('importar_clientes', { p_petshop: P, p_chave: B.uuid(), p_linhas: [{ tutor: 'Nao', pet: 'Nao' }], p_extra: {} }), /permissão/);
  const outra = await criarLoja(T, { nome: 'Importar outra', equipe: false, dados: false });
  T.recusa('outro pet shop não importa neste', await outra.sb.dono.rpc('importar_clientes', { p_petshop: P, p_chave: B.uuid(), p_linhas: [{ tutor: 'Intruso', pet: 'X' }], p_extra: {} }), /não encontrado/);
  const lidas = await outra.sb.dono.from('importacoes').select('id').eq('petshop_id', P);
  T.ok('e não lê as importações deste', !lidas.error && lidas.data.length === 0);
  T.recusa('ninguém grava na tabela de importações direto', await dono.from('importacoes').insert({ petshop_id: P, chave: 'x'.repeat(10) }).select('id'));

  T.secao('a última importação, de qualquer aparelho, e desfazer');
  const ultima = await caixa.from('importacoes').select('id, resumo, clientes, pets').eq('petshop_id', P).order('criado_em', { ascending: false }).limit(1).single();
  T.passa('a recepção lê a última importação guardada', ultima, ultima.data?.resumo?.tutores_novos === 1);
  const des = await dono.rpc('importacao_desfazer_registro', { p_petshop: P, p_id: r.data.id });
  T.passa('desfazer a importação grande pelo registro', des, des.data?.tutores >= 6, des.data);
  T.ok('os tutores e pets que ela criou saíram', n(`select count(*) from clientes where id = any('{${r.data.clientes.join(',')}}'::uuid[])`) === 0);
  T.ok('o que já existia ficou (Ana, a raça que ganhou continua)', n(`select count(*) from clientes where id='${L.tutores.Ana}'`) === 1);
  T.ok('fica anotado como desfeita', B.sql(`select desfeita_em is not null from importacoes where id='${r.data.id}'`) === 't');
  const des2 = await dono.rpc('importacao_desfazer_registro', { p_petshop: P, p_id: r.data.id });
  T.passa('desfazer de novo não desfaz duas vezes', des2, des2.data?.ja_desfeita === true);
  T.ok('a frase do desfazer', /^Importação desfeita: \d+ tutores saíram e \d+ pets saíram do cadastro\./.test(PL.fraseDesfeita(des.data)), PL.fraseDesfeita(des.data));

  T.secao('2.000 linhas cabem no tempo do banco');
  const muitas = Array.from({ length: 2000 }, (_, i) => ({ tutor: `Massa ${i}`, fone: `1197${String(1000000 + i).padStart(7, '0')}`, pet: `Pet ${i}`, especie: 'cao', especie_dada: true, raca: '', porte: 'M', obs: '', alertas: '', email: '', endereco: '' }));
  const t0 = Date.now();
  const grande = await dono.rpc('importar_clientes', { p_petshop: P, p_chave: B.uuid(), p_linhas: muitas, p_extra: {} });
  const ms = Date.now() - t0;
  T.passa(`2.000 tutores e pets numa operação (${ms} ms)`, grande, grande.data?.resumo?.tutores_novos === 2000 && grande.data?.resumo?.pets_novos === 2000);
  T.ok('dentro do limite do banco (8 s; aqui costuma levar 0,6 a 1,5 s)', ms < 7500, ms);

  T.secao('rascunhos: cada pessoa só vê os seus');
  T.passa('a dona guarda um rascunho', await dono.from('rascunhos').upsert({ petshop_id: P, tipo: 'caderno', dados: { versao: 1, x: 1 } }, { onConflict: 'petshop_id,user_id,tipo' }).select('tipo'));
  T.passa('e guarda de novo (atualiza, não duplica)', await dono.from('rascunhos').upsert({ petshop_id: P, tipo: 'caderno', dados: { versao: 1, x: 2 } }, { onConflict: 'petshop_id,user_id,tipo' }).select('tipo'));
  T.ok('um só, com o valor novo', n(`select count(*) from rascunhos where petshop_id='${P}'`) === 1 && B.sql(`select dados->>'x' from rascunhos where petshop_id='${P}'`) === '2');
  const daRecepcao = await caixa.from('rascunhos').select('tipo').eq('petshop_id', P);
  T.ok('a recepção não vê o rascunho da dona', !daRecepcao.error && daRecepcao.data.length === 0);
  T.recusa('outro pet shop não grava rascunho aqui', await outra.sb.dono.from('rascunhos').insert({ petshop_id: P, tipo: 'caderno', dados: {} }).select('tipo'));
  T.recusa('tipo estranho é recusado', await dono.from('rascunhos').insert({ petshop_id: P, tipo: 'DROP TABLE', dados: {} }).select('tipo'));
  T.passa('descartar apaga', await dono.from('rascunhos').delete().eq('petshop_id', P).eq('tipo', 'caderno').select('tipo'));
  B.sql(`insert into rascunhos (petshop_id, user_id, tipo, dados, atualizado_em) values ('${P}', (select user_id from profissionais where id='${L.ids.dono}'), 'velho', '{}', now() - interval '8 days')`);
  T.ok('rascunho de mais de 7 dias sai na faxina', Number(B.sql(`select public.rascunhos_faxina()`)) >= 1 && n(`select count(*) from rascunhos where petshop_id='${P}'`) === 0);
}))();
