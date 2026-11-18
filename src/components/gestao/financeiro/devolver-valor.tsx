"use client";

import { useState } from "react";
import { conferirCaixa } from "@/lib/gestao/dinheiro";
import { nomeDeQuemAtende, textoComprovanteDevolucao } from "@/lib/gestao/comprovante";
import { useOperacao } from "@/lib/gestao/uma-vez";
import type { Lancamento } from "@/lib/gestao/tipos";
import { brl, dataCurta, centavos } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { AvisoCaixaFechado, CampoDinheiro, ChipsForma, useCaixaAberto, type Forma } from "../loja/pecas";
import { FolhaVendaFeita } from "../loja/comprovante-venda";
import { avisarMudanca, Campo, Esqueleto, Folha, useAvisos, useDados, useSomenteLeitura } from "../ui";


/** Quanto já voltou de cada entrada (devolução ligada à entrada e troca ou devolução de produto). Só quem mexe com dinheiro lê. */
export async function lerDevolvido(sb: ReturnType<typeof useGestao>["sb"], petshopId: string, ids: string[]): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  if (!ids.length) return m;
  for (let i = 0; i < ids.length; i += 500) {
    const r = await sb.rpc("entradas_devolvidas", { p_petshop: petshopId, p_ids: ids.slice(i, i + 500) });
    if (r.error) throw new Error(r.error.message);
    for (const x of (r.data ?? []) as { entrada_id: string; devolvido: number }[]) m.set(x.entrada_id, Number(x.devolvido));
  }
  return m;
}

/**
 * "Devolver ao cliente" numa entrada já recebida (serviço, estadia, qualquer valor sem produto): lança a saída "Devolução"
 * de hoje, na forma escolhida, ligada à entrada (migração 20261231, `entrada_devolver`). O recebimento de antes não é apagado,
 * a devolução aparece em Alterações em valores e o banco não deixa devolver mais do que entrou. Produto vendido volta por
 * "Troca ou devolução" (que também devolve o estoque).
 */
export default function FolhaDevolverValor({ entrada, aoFechar, aoPronto }: {
  entrada: Pick<Lancamento, "id" | "valor" | "forma" | "descricao" | "categoria" | "data" | "cliente_id">; aoFechar: () => void; aoPronto: () => void;
}) {
  const { sb, petshop, eu } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const op = useOperacao();
  const caixa = useCaixaAberto();
  const recebido = Number(entrada.valor);
  const { dados: ja, erro } = useDados(async () => (await lerDevolvido(sb, petshop.id, [entrada.id])).get(entrada.id) ?? 0, [petshop.id, entrada.id]);
  const sobra = ja == null ? null : Math.max(0, centavos(recebido - ja));
  const [valor, setValor] = useState<number | null | undefined>(undefined);
  const quanto = valor === undefined ? sobra : valor;
  const [forma, setForma] = useState<Forma | null>(["dinheiro", "pix", "debito", "credito", "outro"].includes(entrada.forma ?? "") ? (entrada.forma as Forma) : null);
  const [motivo, setMotivo] = useState("");
  const [erroForma, setErroForma] = useState<string | null>(null);
  const [feita, setFeita] = useState<{ valor: number; texto: string; tutor: { nome: string; telefone: string | null } | null } | null>(null);
  const nome = entrada.descricao?.trim() || entrada.categoria;
  const erroValor = quanto != null && sobra != null && quanto > sobra + 0.005 ? `Desta entrada dá para devolver até ${brl(sobra)}.` : null;

  const gravar = () => op.fazer(async (chave) => {
    if (somenteLeitura()) return false;
    if (!(quanto && quanto > 0)) { avisarErro("Escreva quanto volta para o cliente."); return false; }
    if (erroValor) { avisarErro(erroValor); return false; }
    if (!forma) { setErroForma("Escolha como o dinheiro volta."); return false; }
    if (!(await conferirCaixa(sb, petshop.id, confirmar))) return false;
    const r = await sb.rpc("entrada_devolver", { p_petshop: petshop.id, p_entrada: entrada.id, p_valor: quanto, p_forma: forma, p_chave: chave, ...(motivo.trim() ? { p_motivo: motivo.trim().slice(0, 80) } : {}) });
    if (r.error) { avisarErro(r.error.message); return false; }
    avisar(`Devolução anotada: ${brl(quanto)} voltaram para o cliente. O recebimento de ${dataCurta(entrada.data)} continua no histórico.`);
    avisarMudanca();
    const t = entrada.cliente_id ? (await sb.from("clientes").select("nome, telefone").eq("petshop_id", petshop.id).eq("id", entrada.cliente_id).maybeSingle()).data : null;
    setFeita({ valor: quanto, tutor: t ?? null, texto: textoComprovanteDevolucao({
      petshop: petshop.nome, tutor: t?.nome, modo: "dinheiro", itens: [{ nome, qtd: 1, valor: quanto }], valor: quanto, forma, hora: new Date(), quem: nomeDeQuemAtende(eu),
    }) });
    return true;
  });

  if (feita) {
    return <FolhaVendaFeita titulo="Valor devolvido" rotulo="Devolvido ao cliente" valor={feita.valor} frase="A saída de hoje ficou ligada a este recebimento e aparece em Alterações em valores."
      texto={feita.texto} telefone={feita.tutor?.telefone} tutor={feita.tutor?.nome} tituloImpresso="Comprovante de devolução" aoFechar={() => { aoPronto(); aoFechar(); }} />;
  }

  return (
    <Folha titulo="Devolver ao cliente" aoFechar={aoFechar}
      rodape={<>
        <button type="button" className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button type="button" className="g-btn pri" onClick={() => void gravar()} disabled={op.ocupado || sobra == null || !(sobra > 0) || Boolean(erroValor)}>{quanto && quanto > 0 && !erroValor ? `Devolver ${brl(quanto)}` : "Devolver"}</button>
      </>}>
      <div className="g-form">
        <p className="g-p" style={{ margin: 0 }}><b>{nome}</b> · recebido em {dataCurta(entrada.data)}: <b className="g-tab">{brl(recebido)}</b>{ja ? <> · já voltaram <b className="g-tab">{brl(ja)}</b></> : null}</p>
        {erro ? <p className="g-erro" role="alert">Não consegui ver o que já foi devolvido desta entrada. Feche e abra de novo.</p>
          : sobra == null ? <Esqueleto />
          : sobra <= 0 ? <p className="g-muted g-p">Tudo o que entrou aqui já foi devolvido.</p>
          : <>
            <Campo rotulo="Quanto volta para o cliente" erro={erroValor} dica={`Até ${brl(sobra)}.`}>
              <CampoDinheiro valor={quanto ?? null} aoMudar={(v) => setValor(v)} rotulo="Quanto volta para o cliente" />
            </Campo>
            <ChipsForma valor={forma} aoMudar={(f) => { setForma(f); setErroForma(null); }} erro={erroForma} />
            {forma === "dinheiro" && <AvisoCaixaFechado aberto={caixa} saida />}
            <Campo rotulo="Motivo" dica="Opcional. Ex.: o cliente desistiu do serviço.">
              <input className="g-input" value={motivo} maxLength={80} onChange={(e) => setMotivo(e.target.value)} />
            </Campo>
            <p className="g-muted g-pp">Lança uma saída de hoje (Devolução), ligada a este recebimento. O recebimento não é apagado, e a devolução aparece para o dono em Alterações em valores.</p>
          </>}
      </div>
    </Folha>
  );
}
