// Privacidade, rodada 9: peças sem banco.
//  - Quem oferece (vendedor-documentos.ts, em cima do vendedor.ts da página de vendas): o nome e o documento vêm do painel;
//    faltando um dos dois, vale a identificação geral do site (um contrato não pode ficar sem dizer quem responde).
//    Nenhum nome ou CPF escrito nos documentos nem neste teste (os valores aqui são inventados).
//  - Documentos: versão 2.4, com o resumo do que mudou; nenhum nome ou CPF fixo nas páginas dos Termos e da Política.
//  - O aviso de privacidade pronto do pet shop e o LEIA-ME de "Baixar os meus dados".
const fs = require('fs');
const path = require('path');
const B = require('../lib/base');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('lgpd-rodada9-unidade');
const V = lib('vendedor-documentos');
const VV = lib('vendedor');
const DOC = lib('documentos');
const ler = (rel) => fs.readFileSync(path.join(B.RAIZ, rel), 'utf8');

(async () => T.rodar(async () => {
  T.secao('quem vende: do painel, com volta para a identificação do site');
  const site = V.quemOfereceDoSite();
  const pf = V.montarQuemOferece(VV.vendedorDe({ nome: ' Fulana de Teste ', documento: '123.456.789-09', endereco: 'Rua de Teste, 1' }));
  T.ok('nome, CPF e endereço do painel', pf.nome === 'Fulana de Teste' && pf.documento === '123.456.789-09' && pf.pessoaFisica === true && pf.endereco === 'Rua de Teste, 1' && pf.origem === 'painel', pf);
  const pj = V.montarQuemOferece(VV.vendedorDe({ nome: 'Empresa de Teste Ltda', documento: '12.345.678/0001-95' }));
  T.ok('CNPJ: empresa; sem endereço no painel, o do site', pj.pessoaFisica === false && pj.origem === 'painel' && pj.endereco === site.endereco, pj);
  T.ok('só o nome (sem documento): vale a identificação do site', V.montarQuemOferece(VV.vendedorDe({ nome: 'Fulana', documento: '' })).origem === 'site');
  T.ok('só o documento: vale a identificação do site', V.montarQuemOferece(VV.vendedorDe({ nome: null, documento: '123.456.789-09' })).origem === 'site');
  T.ok('painel vazio ou sem resposta: a identificação do site, a mesma do rodapé', JSON.stringify(V.montarQuemOferece(null)) === JSON.stringify(site) && site.origem === 'site');
  const fonte = ler('src/lib/gestao/vendedor-documentos.ts');
  T.ok('vendedor-documentos.ts não tem nome nem CPF escrito', !/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(fonte) && !/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/.test(fonte));

  T.secao('documentos: versão, resumo e nada fixo');
  T.ok('Termos e Política na 2.4 ou mais nova, com a data', ['termos', 'privacidade'].every((d) => Number(DOC.DOCUMENTOS[d].versao) >= 2.4 && /^\d{4}-\d{2}-\d{2}$/.test(DOC.DOCUMENTOS[d].vigenteDesde)), DOC.DOCUMENTOS);
  T.ok('o resumo do que mudou fala das conversas, da IA, da nota fiscal e do incidente', /motivo/.test(DOC.MUDANCAS.join(' ')) && /Anthropic/.test(DOC.MUDANCAS.join(' ')) && /nota fiscal/.test(DOC.MUDANCAS.join(' ')) && /48 horas/.test(DOC.MUDANCAS.join(' ')));
  T.ok('cada linha do resumo cabe na tela de aceite (até 330 letras)', DOC.MUDANCAS.every((m) => m.length <= 330), DOC.MUDANCAS.map((m) => m.length));
  for (const pagina of ['src/app/(gestao)/gestao/termos/page.tsx', 'src/app/(gestao)/gestao/privacidade/page.tsx', 'src/app/(gestao)/gestao/para-o-tutor/page.tsx', 'src/components/gestao/legal.tsx']) {
    const t = ler(pagina);
    T.ok(`${path.basename(path.dirname(pagina))}/${path.basename(pagina)}: sem CPF, CNPJ nem EMPRESA.nome/cpf no texto`, !/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(t) && !/EMPRESA\.(nome|cpf|cnpj|razaoSocial)\b/.test(t));
  }
  const termos = ler('src/app/(gestao)/gestao/termos/page.tsx'), politica = ler('src/app/(gestao)/gestao/privacidade/page.tsx');
  T.ok('os dois documentos leem quem oferece pela função', /await quemOferece\(\)/.test(termos) && /await quemOferece\(\)/.test(politica));
  T.ok('nenhum travessão de enfeite nem promessa de resultado nos trechos novos', !/100% seguro|garantimos que/.test(politica));

  T.secao('aviso de privacidade pronto do pet shop');
  const { avisoDePrivacidadeDaLoja } = require(path.join(B.RAIZ, 'src', 'components', 'gestao', 'lgpd', 'aviso-texto.ts'));
  const aviso = avisoDePrivacidadeDaLoja('Banho & Cia');
  T.ok('leva o nome do pet shop, o que guarda, para quê e como pedir', aviso.includes('Banho & Cia') && /nome, telefone e endereço/.test(aviso) && /ver, corrigir, receber uma cópia ou apagar/.test(aviso) && /Maestro Pet Gestão/.test(aviso), aviso);
  T.ok('fala da autorização de fotos e não promete o que o sistema não faz', /só vão para as nossas redes sociais se você autorizar/.test(aviso) && !/criptograf|100%/.test(aviso));
}))();
