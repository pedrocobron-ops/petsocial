"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { dataAmigavel, dataCurta, hora } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Esqueleto, useDados } from "../ui";
import { Tile } from "../painel";
import { fraseDaAlteracao, type AlteracaoDeValor } from "./alteracoes-de-valores";
import "./financeiro.css";

/** Uma linha de `alteracoes_do_periodo`: a mesma de Hoje, mais "foi você" e o lançamento. */
export type AlteracaoDoPeriodo = Omit<AlteracaoDeValor, "nova"> & { minha: boolean; lancamento_id: string | null };

type Periodo = "hoje" | "semana" | "mes" | "caixa";
type Quem = "equipe" | "todas";

/** Início do dia local (o aplicativo usa o fuso do aparelho, como no resto das telas). */
const inicioDoDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * Financeiro › Alterações: lugar fixo para conferir, num período, tudo o que mexeu em dinheiro (valor recebido alterado ou
 * apagado, forma de pagamento trocada, desconto e preço mudado na venda, atendimento tirado de concluído, estoque…).
 * "Só da equipe" é o que o aviso da tela Hoje mostra; "Todas" inclui o que a própria pessoa mudou (dono que trabalha sozinho).
 * Com `?caixa=<id>` (vindo do fechamento do caixa) abre no período em que aquele caixa esteve aberto, com todas.
 */
export default function AlteracoesDoPeriodo({ inicio, fim, tituloMes }: { inicio: string; fim: string; tituloMes: string }) {
  const { sb, petshop, equipe, user } = useGestao();
  const [caixaId] = useState(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("caixa")));
  // ninguém mais com login: as alterações são todas da própria pessoa, então "Todas" já abre marcado
  const sozinho = !equipe.some((p) => p.ativo && p.user_id && p.user_id !== user.id);
  const [periodo, setPeriodo] = useState<Periodo>(caixaId ? "caixa" : "mes");
  const [quem, setQuem] = useState<Quem>(caixaId || sozinho ? "todas" : "equipe");
  useEffect(() => { if (sozinho) setQuem("todas"); }, [sozinho]);

  const { dados: caixa } = useDados(async () => {
    if (!caixaId) return null;
    const r = await sb.from("caixas").select("id, aberto_em, fechado_em").eq("petshop_id", petshop.id).eq("id", caixaId).maybeSingle();
    return r.data ?? null;
  }, [petshop.id, caixaId]);

  const agora = new Date();
  const janela: { desde: Date; ate: Date; titulo: string } | null =
    periodo === "caixa" ? (caixa ? { desde: new Date(caixa.aberto_em), ate: caixa.fechado_em ? new Date(caixa.fechado_em) : agora,
      titulo: `enquanto o caixa de ${dataCurta(caixa.aberto_em)} esteve aberto (${hora(caixa.aberto_em)} às ${caixa.fechado_em ? hora(caixa.fechado_em) : "agora"})` } : null)
    : periodo === "hoje" ? { desde: inicioDoDia(agora), ate: agora, titulo: "hoje" }
    : periodo === "semana" ? { desde: inicioDoDia(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 6)), ate: agora, titulo: "nos últimos 7 dias" }
    : { desde: new Date(`${inicio}T00:00:00`), ate: new Date(new Date(`${fim}T00:00:00`).getTime() + 864e5 - 1), titulo: `em ${tituloMes}` };

  const desdeIso = janela?.desde.toISOString() ?? "", ateIso = janela?.ate.toISOString() ?? "";
  const { dados, carregando, erro } = useDados(async () => {
    if (!desdeIso) return null;
    const r = await sb.rpc("alteracoes_do_periodo", { p: petshop.id, p_desde: desdeIso, p_ate: ateIso, p_minhas: true });
    if (r.error) throw new Error(r.error.message);
    return (r.data ?? []) as AlteracaoDoPeriodo[];
    // o período "hoje"/"7 dias" usa a hora de agora: só recarrega quando o período ou o mês mudam
  }, [petshop.id, periodo, inicio, desdeIso.slice(0, 13), periodo === "caixa" ? ateIso : ""]);

  const todas = dados ?? [];
  const daEquipe = todas.filter((x) => !x.minha);
  const lista = quem === "todas" ? todas : daEquipe;
  const minhas = todas.length - daEquipe.length;

  return (
    <section className="g-card" aria-label="Alterações em valores">
      <div className="g-card-t">
        <h3><Tile icone={History} tom="manteiga" tamanho="p" />Alterações em valores</h3>
        {dados && <span className="g-tag g-tab">{lista.length}</span>}
      </div>
      <p className="g-muted g-p">
        Valor recebido que foi alterado ou apagado, forma de pagamento trocada, desconto e preço diferente da lista na venda, horário marcado abaixo
        da lista, serviço tirado da conta, atendimento não cobrado ou que voltou de concluído, pacote fora do modelo, preço de produto mudado e
        saída de estoque por perda. Cada linha diz quem fez e quando.
      </p>
      <div className="gf-alt-filtros">
        <div className="g-seg" role="group" aria-label="Período">
          {caixaId && <button type="button" aria-pressed={periodo === "caixa"} onClick={() => setPeriodo("caixa")}>Este caixa</button>}
          <button type="button" aria-pressed={periodo === "hoje"} onClick={() => setPeriodo("hoje")}>Hoje</button>
          <button type="button" aria-pressed={periodo === "semana"} onClick={() => setPeriodo("semana")}>7 dias</button>
          <button type="button" aria-pressed={periodo === "mes"} onClick={() => setPeriodo("mes")}>{tituloMes.replace(/ de \d{4}$/, "")}</button>
        </div>
        <div className="g-seg" role="group" aria-label="De quem">
          <button type="button" aria-pressed={quem === "equipe"} onClick={() => setQuem("equipe")}>Só da equipe</button>
          <button type="button" aria-pressed={quem === "todas"} onClick={() => setQuem("todas")}>Todas (inclui as minhas)</button>
        </div>
      </div>
      {erro ? <p className="g-erro" role="alert">{erro}</p> : !dados || carregando && !dados ? <Esqueleto linhas={3} /> : (
        <>
          <p className="g-pp" role="status">
            <b>{lista.length === 0 ? "Nenhuma alteração" : lista.length === 1 ? "1 alteração" : `${lista.length} alterações`}</b> {janela?.titulo}
            {quem === "equipe" && minhas > 0 ? `. Mais ${minhas === 1 ? "1 feita" : `${minhas} feitas`} por você: toque em Todas para ver.` : quem === "todas" && minhas > 0 ? ` (${minhas === 1 ? "1 sua" : `${minhas} suas`}).` : "."}
          </p>
          {lista.length > 0 && (
            <ul className="gf-alt-lista">
              {lista.map((x) => (
                <li key={x.id}>
                  <span>{fraseDaAlteracao({ ...x, nova: false })}.</span>
                  <small className="g-muted">{dataAmigavel(x.quando)} às {hora(x.quando)}{x.minha ? " · feita por você" : ""}</small>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <p className="g-muted g-pp" style={{ marginTop: 10 }}>
        O aviso da tela Hoje mostra só o que outras pessoas da equipe mudaram, desde a última vez que você olhou. Aqui fica tudo, inclusive o que
        você mesmo fez. O valor de antes e quem mudou também ficam dentro de cada lançamento.
      </p>
    </section>
  );
}
