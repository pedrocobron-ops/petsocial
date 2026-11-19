/**
 * Os materiais pagos da Escola de Gestão estão à venda (no aplicativo e no site)? Desligado (false) enquanto falta o PDF
 * de cada um e o aviso de pagamento da Cakto ("Escola e outros produtos"): sem isso, quem comprasse não receberia nada.
 * Com false, nenhum material pago aparece para o cliente no aplicativo (tela Escola, manual, Ajuda); o painel do
 * administrador continua mostrando todos. Os manuais pagos da linha de negócios do site são os mesmos produtos da Cakto,
 * então a mesma chave os tira do site também: vitrine /negocios (que passa a levar para a página inicial), páginas de
 * venda, sitemap, menus, rodapé e página inicial (veja `foraDoSite` em src/lib/produtos.ts). Os guias para tutores e a
 * assinatura do Maestro Pet Gestão não mudam. Para voltar a vender: troque para true (é a única chave). Arquivo pequeno
 * de propósito: o manual e o topo do site leem daqui sem carregar a lista dos produtos.
 */
export const MATERIAIS_PAGOS_A_VENDA: boolean = false;
