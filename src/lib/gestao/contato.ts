/** WhatsApp de dúvidas e suporte do Maestro Pet Gestão. */
export const WHATSAPP_SUPORTE = "5513991376169";
export const WHATSAPP_SUPORTE_TEXTO = "(13) 99137-6169";
export const linkSuporte = (texto = "Oi! Tenho uma dúvida sobre o Maestro Pet Gestão.") =>
  `https://wa.me/${WHATSAPP_SUPORTE}?text=${encodeURIComponent(texto)}`;
