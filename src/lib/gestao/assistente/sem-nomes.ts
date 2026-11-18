/**
 * O Mozart às vezes escreve o nome interno de uma consulta ("eu puxo o total com resumo_financeiro") ou de um campo
 * ("creche_por_dia"). A pessoa nunca deve ler isso: cada nome conhecido vira palavras simples e qualquer outra palavra com
 * sublinhado vira palavras separadas. Puro e sem importações: a rota usa no texto final e a bolha ao vivo usa no navegador.
 */

/** [artigo, nome] de cada consulta e ação do Mozart, em palavras de gente. */
const NOMES: Record<string, [string, string]> = {
  buscar_pets: ["a", "busca de pets"],
  ver_agenda: ["a", "agenda"],
  horarios_livres: ["os", "horários livres"],
  clientes_sumidos: ["a", "lista de quem está sumido"],
  ver_estoque: ["o", "estoque"],
  resumo_financeiro: ["o", "resumo do dinheiro"],
  contas_em_aberto: ["as", "contas em aberto"],
  quem_me_deve: ["a", "lista de quem está devendo"],
  ver_hospedes: ["a", "lista da creche e do hotel"],
  ver_sinais: ["a", "conta dos sinais"],
  ver_pacotes: ["os", "pacotes"],
  ver_caixa: ["o", "caixa"],
  ver_saude: ["os", "cuidados de saúde"],
  preparar_mensagens: ["as", "mensagens prontas"],
  ver_planos_creche: ["os", "planos da creche"],
  ver_comissao: ["a", "conta da comissão"],
  o_que_comprar: ["a", "lista do que comprar"],
  mensagens_para_mandar: ["as", "mensagens para mandar"],
  ver_lucro: ["a", "conta de quanto sobrou"],
  ver_contas_fixas: ["as", "contas fixas"],
  ver_contas_a_pagar: ["as", "contas a pagar"],
  ver_maquininha: ["a", "conta da maquininha"],
  ver_descontos: ["a", "soma dos descontos"],
  cadastrar_pet: ["o", "cadastro do pet"],
  marcar_horario: ["a", "marcação do horário"],
  alterar_horario: ["a", "mudança do horário"],
  bloquear_horario: ["o", "bloqueio da agenda"],
  remover_bloqueio: ["a", "retirada do bloqueio"],
  reservar_estadia: ["a", "reserva"],
  ver_cuidados: ["a", "lista de comida e remédio"],
  marcar_cuidado: ["a", "marcação da dose"],
  mover_no_quadro: ["a", "troca de etapa no quadro"],
  registrar_ocorrencia: ["o", "registro da ocorrência"],
  fazer_checkin: ["o", "check-in"],
  fazer_checkout: ["o", "check-out"],
  vender_pacote: ["a", "venda do pacote"],
  usar_pacote: ["o", "uso do pacote"],
  registrar_saude: ["a", "anotação de saúde"],
  anotar_no_pet: ["a", "anotação na ficha do pet"],
  abrir_caixa: ["a", "abertura do caixa"],
  fechar_caixa: ["o", "fechamento do caixa"],
  lancar_dinheiro: ["o", "lançamento"],
  criar_conta: ["a", "conta"],
  anotar_divida: ["a", "anotação da dívida"],
  receber_de_cliente: ["o", "recebimento"],
  movimentar_estoque: ["o", "movimento do estoque"],
  criar_conta_fixa: ["o", "cadastro da conta fixa"],
  valor_conta_fixa: ["o", "valor da conta fixa"],
  pagar_conta: ["a", "baixa da conta a pagar"],
};

const ARTIGO = /(?:^|\s)(o|a|os|as|do|da|dos|das|no|na|nos|nas|pelo|pela|pelos|pelas|ao|à|aos|às|um|uma)\s*$/i;
/** Palavra com sublinhado, fora de link, e-mail ou caminho; com ou sem crase de código em volta. */
const SUBLINHADO = /`?(?<![\w@/.\-])([a-zà-ú][a-zà-ú0-9]*(?:_[a-zà-ú0-9]+)+)(?![\w@/\-])`?/gi;

export function semNomesDeFerramenta(texto: string): string {
  if (!texto || !texto.includes("_")) return texto;
  return texto.replace(SUBLINHADO, (_todo, nome: string, pos: number, inteiro: string) => {
    const conhecido = NOMES[nome.toLowerCase()];
    if (!conhecido) return nome.replace(/_+/g, " ");
    const antes = inteiro.slice(Math.max(0, pos - 12), pos);
    return ARTIGO.test(antes) ? conhecido[1] : `${conhecido[0]} ${conhecido[1]}`;
  });
}

/** Os nomes que têm palavras próprias (o teste confere que toda ferramenta do Mozart está aqui). */
export const NOMES_COM_PALAVRAS = Object.keys(NOMES);
