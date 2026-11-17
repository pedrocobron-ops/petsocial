/**
 * Dados da empresa exibidos no rodapé, nos termos, na política e no contato
 * (Decreto 7.962/2013). Campo vazio = não aparece. Preencha quando tiver.
 */
export const EMPRESA = {
  marca: "Maestro Pet",
  /** Enquanto não houver empresa, quem responde é o fundador como pessoa física (CPF). Ao abrir a empresa: false e preencha razão social e CNPJ. */
  pessoaFisica: true,
  /** Nome de quem responde como pessoa física. */
  nome: "Pedro Amaral Martin",
  /** Só números ou com pontos: aparece nos termos e na política. Vazio = [CPF]. */
  cpf: "412.538.738-95",
  razaoSocial: "",
  cnpj: "",
  endereco: "",
  email: "contato@maestropet.com",
  /** E-mail para privacidade (encarregado/LGPD) e assuntos jurídicos. Vazio = aparece [E-MAIL DE CONTATO] nos documentos do Gestão. */
  emailJuridico: "contato@maestropet.com",
  /** Nome do encarregado pelo tratamento de dados (DPO). Vazio = [NOME DO ENCARREGADO]. */
  encarregado: "Pedro Amaral Martin",
  /** Comarca escolhida nos Termos do Gestão, ex. "Santos/SP". Vazio = [FORO]. */
  foro: "",
  /** Só números, com DDI e DDD: ex. "5511999999999". */
  whatsapp: "5513991376169",
  instagram: "maestro_pet_",
  /** Quem está por trás da marca (aparece em "Quem somos"). Foto em /public, ex. "/equipe/fundador.webp". */
  fundador: { nome: "", papel: "fundador do Maestro Pet e tutor do Mozart", foto: "", texto: "" },
  /** Data da última revisão dos termos e da política. */
  atualizadoEm: "25 de outubro de 2026",
};

export const linkWhatsapp = (texto = "Olá! Tenho uma dúvida sobre o Maestro Pet.") =>
  EMPRESA.whatsapp ? `https://wa.me/${EMPRESA.whatsapp}?text=${encodeURIComponent(texto)}` : "";

/** As outras redes da marca, na ordem em que aparecem. `url` vazio = não aparece. */
export const REDES: { nome: string; url: string }[] = [
  { nome: "TikTok", url: "https://www.tiktok.com/@maestropet" },
  { nome: "YouTube", url: "https://www.youtube.com/@maestropet" },
  { nome: "Pinterest", url: "https://br.pinterest.com/maestropet/" },
  { nome: "Facebook", url: "" },
];
export const redes = () => REDES.filter((r) => r.url);

export const linkInstagram = () => (EMPRESA.instagram ? `https://www.instagram.com/${EMPRESA.instagram.replace(/^@/, "")}/` : "");

/** "Razão social · CNPJ … · Endereço", só com o que estiver preenchido. */
export const identificacao = () =>
  EMPRESA.pessoaFisica
    ? [EMPRESA.nome, EMPRESA.cpf && `CPF ${EMPRESA.cpf}`, EMPRESA.endereco].filter(Boolean).join(" · ")
    : [EMPRESA.razaoSocial, EMPRESA.cnpj && `CNPJ ${EMPRESA.cnpj}`, EMPRESA.endereco].filter(Boolean).join(" · ");
