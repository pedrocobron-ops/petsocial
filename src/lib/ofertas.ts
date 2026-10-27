/**
 * Ofertas pós-compra (upsell de 1 clique da Cakto). A Cakto manda o cliente para /oferta/<slug>
 * depois do pagamento do produto de origem. Os botões são os do Gerador de Upsell da Cakto
 * (<cakto-upsell-accept offer-id=...>); `oferta` é o id da "Oferta pós-compra" criada na Cakto.
 */
export type Oferta = {
  slug: string;
  origem: string; // produto comprado
  alvo: string; // slug do produto oferecido (em PRODUTOS)
  titulo: string;
  porque: string;
  pontos: string[];
  preco: number;
  precoNormal: number;
  oferta: string;
};

export const OFERTAS: Oferta[] = [
  {
    slug: "xixi", origem: "Xixi no Lugar Certo", alvo: "tedio",
    titulo: "Cão Sem Tédio: 100 atividades para gastar a energia dele em casa",
    porque: "Enquanto você ensina o lugar certo, ajuda muito ter o que fazer com a energia dele. Faro, brincadeira e calma, quase tudo com o que você já tem em casa.",
    pontos: ["100 atividades, uma por página", "Faro, quebra-cabeças caseiros, truques e calma", "Passo a passo, materiais e o cuidado de segurança em cada uma"],
    preco: 19.9, precoNormal: 27.9, oferta: "37ne7uf",
  },
  {
    slug: "sozinho", origem: "Sozinho Sem Drama", alvo: "tedio",
    titulo: "Cão Sem Tédio: 100 atividades para cansar a cabeça dele",
    porque: "Um cão que gastou energia antes de você sair fica mais tranquilo. Aqui estão 100 atividades de faro, quebra-cabeça e calma para a rotina de vocês.",
    pontos: ["100 atividades, uma por página", "Brinquedos recheados e caça ao petisco para a hora da saída", "Quase tudo com o que você já tem em casa"],
    preco: 19.9, precoNormal: 27.9, oferta: "aewvd9b",
  },
  {
    slug: "filhote", origem: "Filhote Sem Caos", alvo: "xixi",
    titulo: "Xixi no Lugar Certo: o guia completo do xixi e do cocô",
    porque: "O Filhote Sem Caos dá o começo. Este guia vai até o fim: o plano dia a dia da primeira semana, os horários-chave e o que fazer nas recaídas.",
    pontos: ["Plano dia a dia para a primeira semana", "Como limpar para tirar o cheiro", "Sem bronca e sem castigo, só reforço positivo"],
    preco: 14.9, precoNormal: 19.9, oferta: "tyti6mz",
  },
  {
    slug: "tedio", origem: "Cão Sem Tédio", alvo: "tedio",
    titulo: "Leve o Kit Completo: mais 4 guias práticos por R$ 9,90",
    porque: "Você já tem as 100 atividades. O Kit Completo junta 4 guias para o dia a dia, com planos prontos para os problemas mais comuns.",
    pontos: ["Cão que Rói Tudo", "Calendário de 30 Dias", "Atividades Relâmpago e Brinquedos Seguros"],
    preco: 9.9, precoNormal: 10, oferta: "me6iktv",
  },
  {
    slug: "gato", origem: "Gato Feliz em Casa", alvo: "normal",
    titulo: "Isso É Normal?: 40 dúvidas do dia a dia com cães e gatos",
    porque: "Vômito de bola de pelo, dormir demais, beber muita água: para cada situação, o semáforo diz o que observar em casa e quando ir ao veterinário.",
    pontos: ["40 situações, uma por página", "O que fazer em casa enquanto observa", "Sinais de emergência e diário de sintomas"],
    preco: 14.9, precoNormal: 19.9, oferta: "tj2tr8p",
  },
];

export const oferta = (slug: string) => OFERTAS.find((o) => o.slug === slug);
