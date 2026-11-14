"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import { AvisoCaixaFechado, ChipsForma, useCaixaAberto, useFormaLembrada } from "@/components/gestao/loja/pecas";
import { conferirCaixa, lancarPago } from "@/lib/gestao/dinheiro";
import { useOperacao } from "@/lib/gestao/uma-vez";
import { NOME_TAXA_ATRASO } from "@/lib/gestao/feriados";
import type { Banco } from "@/lib/gestao/supabase";
import type { Cliente, Pet } from "@/lib/gestao/tipos";
import { brl, dataAmigavel, isoDia } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { AvatarPet, Folha, ok, useAvisos } from "../ui";
import "@/components/gestao/hotel/hotel.css";

/**
 * Taxa de busca fora do horário do mensalista.
 *
 * A saída de um toque (cartão do hóspede, chamada, Encerrar a chamada) nunca cobra: quando a regra está ligada em
 * Meu pet shop e o pet sai depois da hora, o banco anota o atraso, sem valor (tabela `creche_atrasos`). Quem recebe
 * decide aqui, na hora ou depois (a lista fica em Check-outs para cobrar): cobrar na próxima mensalidade, receber agora
 * ou não cobrar. Quem não mexe com dinheiro não lê a tabela nem vê valor: só fica sabendo que a saída ficou anotada.
 */
export type AtrasoPendente = {
  estadia_id: string; dia: string; saiu_em: string; limite: string;
  pets: (Pick<Pet, "id" | "nome" | "foto" | "especie"> & { clientes: Pick<Cliente, "id" | "nome"> | null }) | null;
};
const SELECT_ATRASO = "estadia_id, dia, saiu_em, limite, estado, lancamento_id, pets(id, nome, foto, especie, clientes(id, nome))";

const hhmm = (d: string | Date) => { const x = new Date(d); return `${x.getHours()}h${String(x.getMinutes()).padStart(2, "0")}`; };
/** "saiu às 19h10, depois das 18h30" (com o dia, quando não foi hoje) */
export function fraseDoAtraso(a: Pick<AtrasoPendente, "saiu_em" | "limite">) {
  const dia = isoDia(new Date(a.saiu_em)) === isoDia(new Date()) ? "" : `${dataAmigavel(new Date(a.saiu_em))}, `;
  return `saiu ${dia}às ${hhmm(a.saiu_em)}${a.limite ? `, depois das ${a.limite.replace(":", "h")}` : ", fora do horário"}`;
}

/**
 * As saídas de mensalista fora do horário que ainda pedem decisão (pendentes, ou recebidas cujo recebimento foi apagado).
 * Só quem recebe lê. Banco ainda sem a tabela ou qualquer falha: lista vazia.
 */
export async function lerAtrasosPendentes(sb: Banco, petshopId: string): Promise<AtrasoPendente[]> {
  const r = await sb.from("creche_atrasos").select(SELECT_ATRASO).eq("petshop_id", petshopId)
    .or("estado.eq.pendente,and(estado.eq.recebida,lancamento_id.is.null)").order("saiu_em", { ascending: false }).limit(200);
  return r.error ? [] : ((r.data ?? []) as unknown as AtrasoPendente[]);
}
/** Quantas pedem decisão (para a tela Hoje). */
export async function contarAtrasosPendentes(sb: Banco, petshopId: string): Promise<number> {
  const r = await sb.from("creche_atrasos").select("estadia_id", { count: "exact", head: true }).eq("petshop_id", petshopId)
    .or("estado.eq.pendente,and(estado.eq.recebida,lancamento_id.is.null)");
  return r.error ? 0 : r.count ?? 0;
}
/** Uma saída só (logo depois do toque em Saiu), para abrir a pergunta. */
export async function lerAtraso(sb: Banco, estadiaId: string): Promise<AtrasoPendente | null> {
  const r = await sb.from("creche_atrasos").select(SELECT_ATRASO).eq("estadia_id", estadiaId).maybeSingle();
  return r.error || !r.data ? null : (r.data as unknown as AtrasoPendente);
}

type Decisao = "mensalidade" | "recebida" | "dispensada" | "pendente";
export async function decidirAtraso(sb: Banco, estadiaId: string, decisao: Decisao, valor?: number | null, lancamentoId?: string | null) {
  ok(await sb.rpc("creche_atraso_decidir", { p_estadia: estadiaId, p_decisao: decisao, p_valor: valor ?? undefined, p_lancamento: lancamentoId ?? undefined }));
}

/**
 * A pergunta para quem recebe: "Cobrar R$ X" ou "Não cobrar". Cobrando, escolhe se entra na próxima mensalidade
 * (junto com os dias extras) ou se recebe agora. Fechar sem escolher não cobra nada: a saída continua na lista
 * Check-outs para cobrar, esperando a decisão.
 */
export function FolhaTaxaDeAtraso({ atraso, valor, aoFechar, aoDecidir }: {
  atraso: AtrasoPendente; valor: number; aoFechar: () => void; aoDecidir: () => void;
}) {
  const { sb, petshop } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const [cobra, setCobra] = useState<boolean | null>(null);
  const [como, setComo] = useState<"mensalidade" | "agora">("mensalidade");
  const [forma, setForma] = useFormaLembrada();
  const [erroForma, setErroForma] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const caixa = useCaixaAberto();
  const nome = atraso.pets?.nome ?? "O pet";

  const op = useOperacao();
  const salvar = () => op.fazer(gravar);
  async function gravar(chave: string): Promise<boolean | void> {
    if (cobra === null || salvando) return;
    if (cobra && como === "agora" && !forma) { setErroForma("Escolha como o cliente pagou."); return; }
    if (cobra && como === "agora" && !(await conferirCaixa(sb, petshop.id, confirmar))) return;
    setSalvando(true);
    try {
      if (!cobra) {
        await decidirAtraso(sb, atraso.estadia_id, "dispensada");
        avisar(`${nome}: sem taxa desta vez.`);
      } else if (como === "mensalidade") {
        await decidirAtraso(sb, atraso.estadia_id, "mensalidade", valor);
        avisar(`${nome}: ${brl(valor)} de taxa entram na próxima cobrança do mês.`);
      } else {
        // reserva a taxa (para duas pessoas não receberem a mesma), lança o pagamento e liga os dois
        await decidirAtraso(sb, atraso.estadia_id, "recebida", valor);
        let lanc: { id: string };
        try {
          lanc = await lancarPago(sb, petshop.id, {
            tipo: "entrada", valor, forma: forma!, categoria: "Creche e hotel", clienteId: atraso.pets?.clientes?.id ?? null,
            descricao: `Creche: ${NOME_TAXA_ATRASO.toLowerCase()} · ${nome}`, itens: [{ tipo: "extra", nome: NOME_TAXA_ATRASO, qtd: 1, valor }], chave,
          });
        } catch (e) {
          await decidirAtraso(sb, atraso.estadia_id, "pendente").catch(() => undefined);
          throw e;
        }
        await decidirAtraso(sb, atraso.estadia_id, "recebida", valor, lanc.id);
        avisar(`${nome}: ${brl(valor)} de taxa no financeiro.`);
      }
      aoDecidir();
    } catch (e) { avisarErro(e); setSalvando(false); }
  }

  return (
    <Folha titulo="Busca fora do horário" aoFechar={aoFechar}
      rodape={<>
        <button className="g-btn sec" onClick={aoFechar} disabled={salvando}>Decidir depois</button>
        <button className="g-btn pri" onClick={() => void salvar()} disabled={salvando || cobra === null}>
          {salvando ? "Salvando…" : cobra === null ? "Confirmar" : !cobra ? "Não cobrar" : como === "agora" ? `Receber ${brl(valor)}` : "Pôr na mensalidade"}
        </button>
      </>}>
      <div className="g-form">
        <div className="g-fila" style={{ flexWrap: "nowrap" }}>
          <AvatarPet pet={atraso.pets ?? { nome: "?" }} />
          <div className="g-cresce"><b style={{ display: "block" }}>{nome}</b><span className="g-muted g-p">{atraso.pets?.clientes?.nome ?? "Sem tutor"} · mensalista</span></div>
        </div>
        <div className={`g-ht-atraso${cobra === null ? "" : " ok"}`} role="group" aria-label="Taxa de busca fora do horário">
          <p><Clock aria-hidden style={{ width: 16, height: 16, verticalAlign: "-3px", marginRight: 6 }} /><b>{nome} {fraseDoAtraso(atraso)}.</b> A taxa de busca fora do horário é de {brl(valor)}. Cobrar?</p>
          <div className="g-seg g-ht-seg" role="group">
            <button type="button" aria-pressed={cobra === true} onClick={() => setCobra(true)}>Cobrar {brl(valor)}</button>
            <button type="button" aria-pressed={cobra === false} onClick={() => setCobra(false)}>Não cobrar</button>
          </div>
        </div>
        {cobra && (
          <>
            <div className="g-campo">
              <span>Como cobrar</span>
              <div className="g-seg" role="group" aria-label="Como cobrar a taxa">
                <button type="button" aria-pressed={como === "mensalidade"} onClick={() => setComo("mensalidade")}>Na próxima mensalidade</button>
                <button type="button" aria-pressed={como === "agora"} onClick={() => setComo("agora")}>Receber agora</button>
              </div>
            </div>
            {como === "mensalidade"
              ? <p className="g-muted g-p">A taxa entra na cobrança do mês que vem, junto com os dias extras, e aparece na mensagem de cobrança com a data.</p>
              : <>
                <ChipsForma valor={forma} aoMudar={(f) => { setForma(f); setErroForma(null); }} erro={erroForma} />
                <AvisoCaixaFechado aberto={caixa} />
              </>}
          </>
        )}
        {cobra === null && <p className="g-muted g-p">Nada é cobrado sem a sua escolha. Se fechar agora, a saída fica em Check-outs para cobrar, esperando a decisão.</p>}
      </div>
    </Folha>
  );
}
