/**
 * Dados da empresa exibidos no rodapé, nos termos, na política e no contato
 * (Decreto 7.962/2013). Campo vazio = não aparece. Preencha quando tiver.
 */
export const EMPRESA = {
  marca: "Maestro Pet",
  razaoSocial: "",
  cnpj: "",
  endereco: "",
  email: "contato@maestropet.com",
  /** Só números, com DDI e DDD: ex. "5511999999999". */
  whatsapp: "",
  instagram: "maestro_pet_",
  /** Quem está por trás da marca (aparece em "Quem somos"). Foto em /public, ex. "/equipe/fundador.webp". */
  fundador: { nome: "", papel: "fundador do Maestro Pet e tutor do Mozart", foto: "", texto: "" },
  /** Data da última revisão dos termos e da política. */
  atualizadoEm: "25 de outubro de 2026",
};

export const linkWhatsapp = (texto = "Olá! Tenho uma dúvida sobre o Maestro Pet.") =>
  EMPRESA.whatsapp ? `https://wa.me/${EMPRESA.whatsapp}?text=${encodeURIComponent(texto)}` : "";

export const linkInstagram = () => (EMPRESA.instagram ? `https://www.instagram.com/${EMPRESA.instagram.replace(/^@/, "")}/` : "");

/** "Razão social · CNPJ … · Endereço", só com o que estiver preenchido. */
export const identificacao = () =>
  [EMPRESA.razaoSocial, EMPRESA.cnpj && `CNPJ ${EMPRESA.cnpj}`, EMPRESA.endereco].filter(Boolean).join(" · ");
