"use client";

import { Check, MessageCircle, Printer } from "lucide-react";
import { imprimirComprovante, textoComprovante } from "@/lib/gestao/comprovante";
import { brl, linkWhatsApp, soDigitos } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { Folha, useDados } from "../ui";
import "./venda.css";

/**
 * Comprovante da venda no balcão e da venda de pacote (Sandra, M5): o mesmo texto dos outros comprovantes (o que foi vendido,
 * total, desconto, como foi pago), para o WhatsApp do tutor ou para imprimir. Não é nota fiscal.
 */
type Recebido = { valor: number; forma?: string | null; pagamentos?: unknown; itens?: unknown; data?: string | null; criado_em?: string | null; descricao?: string | null; categoria?: string | null; credito_usado?: number | null };

/** "da compra" para a venda de produtos; "do pacote" para o pacote. */
export const assuntoDoLancamento = (l: { categoria?: string | null }) => (l.categoria === "Pacotes" ? "do pacote" : "da compra");

/** O texto do comprovante de um lançamento de venda (sem pet: é uma compra). */
export function textoDaVenda(petshop: string, tutor: string | null | undefined, l: Recebido, entregue?: number | null) {
  // pacote sem itens: o nome do pacote vira a linha (a descrição é "Pacote 4 banhos · Thor")
  return textoComprovante({
    petshop, tutor, servico: l.descricao?.trim() || l.categoria || "Venda", quando: l.criado_em ?? new Date(), pagoEm: l.data ?? null,
    recebidos: [l], entregue, assunto: assuntoDoLancamento(l),
  });
}

/** A folha que aparece logo depois de vender: valor, Mandar comprovante (WhatsApp do tutor) e Imprimir. */
export function FolhaVendaFeita({ titulo, valor, frase, texto, telefone, tutor, aoFechar }: {
  titulo: string; valor: number; frase: string; texto: string; telefone?: string | null; tutor?: string | null; aoFechar: () => void;
}) {
  const zap = soDigitos(telefone).length >= 8 ? linkWhatsApp(telefone, texto) : null;
  return (
    <Folha titulo={titulo} aoFechar={aoFechar} rodape={<button type="button" className="g-btn sec" onClick={aoFechar}>Pronto</button>}>
      <div className="g-vd-recibo">
        <Tile icone={Check} tom="menta" tamanho="g" />
        <p className="g-num">{brl(valor)}</p>
        <p className="g-p">{frase}</p>
        {zap
          ? <a className="g-btn zap cheio" href={zap} target="_blank" rel="noopener noreferrer"><MessageCircle />Mandar comprovante</a>
          : <p className="g-pp g-muted">{tutor ? `${tutor} está sem WhatsApp na ficha: dá para imprimir o comprovante.` : "Sem o tutor na venda, não dá para mandar pelo WhatsApp: dá para imprimir o comprovante."}</p>}
        <button type="button" className="g-btn fantasma cheio" onClick={() => imprimirComprovante(texto, "Comprovante de venda")}><Printer />Imprimir comprovante</button>
        <p className="g-pp g-muted">{zap ? `O WhatsApp de ${tutor ?? "quem comprou"} abre com o comprovante pronto e você só aperta enviar. ` : ""}Não é nota fiscal.</p>
      </div>
    </Folha>
  );
}

/** No lançamento já gravado (Caixa, Financeiro): os botões do comprovante de uma venda paga ou de um pacote pago. */
export function ComprovanteDoLancamento({ lancamento: l }: { lancamento: Recebido & { id: string; cliente_id?: string | null; tipo?: string; pago?: boolean } }) {
  const { sb, petshop, vejoFinanceiro } = useGestao();
  const { dados: tutor } = useDados(async () => {
    if (!l.cliente_id) return null;
    const r = await sb.from("clientes").select("nome, telefone").eq("petshop_id", petshop.id).eq("id", l.cliente_id).maybeSingle();
    return r.data ?? null;
  }, [petshop.id, l.cliente_id ?? ""]);
  if (!vejoFinanceiro || l.tipo !== "entrada" || !l.pago) return null;
  const texto = textoDaVenda(petshop.nome, tutor?.nome, l);
  const zap = tutor && soDigitos(tutor.telefone).length >= 8 ? linkWhatsApp(tutor.telefone, texto) : null;
  return (
    <div className="g-fila" style={{ flexWrap: "wrap", gap: 8 }}>
      {zap && <a className="g-btn zap p" href={zap} target="_blank" rel="noopener noreferrer"><MessageCircle />Mandar comprovante</a>}
      <button type="button" className="g-btn sec p" onClick={() => imprimirComprovante(texto, "Comprovante de venda")}><Printer />Imprimir comprovante</button>
    </div>
  );
}
