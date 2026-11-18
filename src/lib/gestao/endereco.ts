/**
 * Endereço do pet shop (Meu pet shop › Dados): rua e número, complemento, bairro, cidade e UF. Tudo opcional.
 * Sem importações: dá para testar sozinho. Usado no link do cliente, na página do pedido, nas mensagens e nos comprovantes.
 */
export type Onde = { endereco?: string | null; bairro?: string | null; complemento?: string | null; cidade?: string | null; uf?: string | null };

const limpo = (s: string | null | undefined) => String(s ?? "").replace(/\s+/g, " ").trim();

/** O pet shop escreveu a rua? (só cidade e UF não é endereço: não dá para chegar lá) */
export const temEndereco = (o: Onde | null | undefined) => limpo(o?.endereco).length > 0;

/** "Rua das Flores, 120, sala 2 · Vila Nova · São Paulo/SP" (só o que foi preenchido); sem a rua, null. */
export function enderecoDaLoja(o: Onde | null | undefined): string | null {
  if (!o || !temEndereco(o)) return null;
  const rua = [limpo(o.endereco), limpo(o.complemento)].filter(Boolean).join(", ");
  const cidade = [limpo(o.cidade), limpo(o.uf)].filter(Boolean).join("/");
  return [rua, limpo(o.bairro), cidade].filter(Boolean).join(" · ");
}

/** O mesmo endereço numa linha só, com vírgulas (para mensagem e para a busca do mapa). */
export function enderecoEmLinha(o: Onde | null | undefined): string | null {
  if (!o || !temEndereco(o)) return null;
  const cidade = [limpo(o.cidade), limpo(o.uf)].filter(Boolean).join("/");
  return [limpo(o.endereco), limpo(o.complemento), limpo(o.bairro), cidade].filter(Boolean).join(", ");
}

/** Link de busca no mapa (abre o aplicativo de mapas do celular ou o Google Maps no navegador). Sem a rua, null. */
export function linkDoMapa(o: Onde | null | undefined, nome?: string | null): string | null {
  if (!o || !temEndereco(o)) return null;
  // o complemento (sala, fundos) atrapalha a busca: fica de fora
  const busca = [limpo(nome), limpo(o.endereco), limpo(o.bairro), limpo(o.cidade), limpo(o.uf)].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(busca)}`;
}

/** " Nosso endereço: Rua das Flores, 120, Vila Nova, São Paulo/SP." (com o espaço na frente; vazio sem a rua). */
export function fraseDoEndereco(o: Onde | null | undefined): string {
  const e = enderecoEmLinha(o);
  return e ? ` Nosso endereço: ${e}${/[.!?]$/.test(e) ? "" : "."}` : "";
}
