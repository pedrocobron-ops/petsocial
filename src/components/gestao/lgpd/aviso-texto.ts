/** O aviso de privacidade pronto, com o nome do pet shop, para o link, o balcão e a ficha de cadastro em papel. */
export function avisoDePrivacidadeDaLoja(loja: string) {
  return [
    `${loja}: como cuidamos dos seus dados`,
    "",
    `Para atender você e o seu pet, guardamos o seu nome, telefone e endereço, os dados do pet (inclusive vacinas e cuidados) e as fotos do atendimento. Usamos o sistema Maestro Pet Gestão para guardar tudo isso com segurança.`,
    "",
    "Usamos esses dados só para marcar e fazer os atendimentos, avisar você e cuidar do pet. Não vendemos nem passamos os seus dados para propaganda de terceiros.",
    "",
    "Fotos do seu pet só vão para as nossas redes sociais se você autorizar, e você pode tirar a autorização quando quiser.",
    "",
    `Você pode pedir para ver, corrigir, receber uma cópia ou apagar os seus dados a qualquer momento: é só falar com a gente, ${loja}. Respondemos em até 15 dias.`,
  ].join("\n");
}
