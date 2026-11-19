/**
 * Os materiais pagos da Escola de Gestão estão à venda dentro do aplicativo? Desligado (false) enquanto falta o PDF de cada
 * um e o aviso de pagamento da Cakto ("Escola e outros produtos"): sem isso, quem comprasse não receberia nada aqui. Com
 * false, nenhum material pago aparece para o cliente (tela Escola, manual, Ajuda); o painel do administrador continua
 * mostrando todos. Para voltar a vender: troque para true (é a única chave). Arquivo pequeno de propósito: o manual lê daqui
 * sem carregar a lista dos materiais.
 */
export const MATERIAIS_PAGOS_A_VENDA: boolean = false;
