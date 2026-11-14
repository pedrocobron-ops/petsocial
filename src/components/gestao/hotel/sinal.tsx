"use client";

import { useState } from "react";
import { conferirCaixa, conferirValorAlto, lancarAReceber, lancarPago, quitarConta, type PartePagamento } from "@/lib/gestao/dinheiro";
import type { ValoresDaEstadia } from "@/lib/gestao/hotel";
import { sinalDe } from "@/lib/gestao/hotel-opcoes";
import type { Banco } from "@/lib/gestao/supabase";
import { brl, dataCompleta, dataCurta, isoDia, somaDias } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Campo, Folha, ok, useAvisos } from "../ui";
import { AvisoCaixaFechado, CampoDinheiro, ChipsForma, erroDeValor, EscolhaPagamento, fecharPagamento, pagamentoInicial, useCaixaAberto, type EstadoPagamento, type Forma } from "../loja/pecas";
import { nomeTipo, type EstadiaCompleta } from "./tipos";

/**
 * Sinal da reserva (opção "hotel.sinal"). O sinal é um lançamento comum: recebido agora (entra no caixa de hoje) ou
 * a receber (fica em Financeiro, A receber). A reserva guarda o valor e a situação em `estadias_valores`.
 * No check-out o sinal é descontado da conta. Ao cancelar, alguém decide: fica ou é devolvido.
 */
export const CATEGORIA_SINAL = "Creche e hotel";
export const CATEGORIA_DEVOLUCAO = "Devolução de sinal";
type Perguntar = Parameters<typeof conferirCaixa>[2];

export type EstadoSinal = { modo: "sem" | "agora" | "depois"; valor: number | null; quando: string; pagamento: EstadoPagamento };
export const sinalInicial = (valor: number | null, entrada?: string | Date): EstadoSinal => {
  const hoje = isoDia(new Date()), chegada = entrada ? isoDia(new Date(entrada)) : hoje;
  const prazo = isoDia(somaDias(new Date(), 2));
  return { modo: valor ? "depois" : "sem", valor, quando: chegada > hoje && chegada < prazo ? chegada : prazo, pagamento: pagamentoInicial() };
};

type SinalPronto = { modo: "sem" } | { modo: "agora"; valor: number; forma: Forma; pagamentos: PartePagamento[] | null } | { modo: "depois"; valor: number; quando: string };
/** Confere o sinal antes de gravar a reserva. Devolve o erro em português ou o que lançar. */
export function prepararSinal(s: EstadoSinal): { erro: string } | SinalPronto {
  if (s.modo === "sem") return { modo: "sem" };
  if (!s.valor || s.valor <= 0) return { erro: "Escreva o valor do sinal, ou escolha Sem sinal." };
  const ruim = erroDeValor(s.valor, "O sinal");
  if (ruim) return { erro: ruim };
  if (s.modo === "depois") {
    if (!s.quando || s.quando < isoDia(new Date())) return { erro: "Escolha até quando o tutor paga o sinal (de hoje em diante)." };
    return { modo: "depois", valor: s.valor, quando: s.quando };
  }
  const pg = fecharPagamento(s.pagamento, s.valor);
  if ("erro" in pg) return { erro: s.pagamento.dividido ? pg.erro : "Escolha como o tutor pagou o sinal." };
  return { modo: "agora", valor: s.valor, ...pg };
}

/** Antes de receber: valor alto e caixa fechado, como nas outras telas que recebem. */
export async function conferirSinal(sb: Banco, petshopId: string, s: SinalPronto, perguntar: Perguntar) {
  if (s.modo === "sem") return true;
  if (!(await conferirValorAlto(s.valor, perguntar))) return false;
  if (s.modo === "agora" && !(await conferirCaixa(sb, petshopId, perguntar))) return false;
  return true;
}

/** Lança o sinal (recebido ou a receber) e liga à reserva. */
export async function lancarSinal(sb: Banco, petshopId: string, e: { id: string; tipo: string; entrada: string; pet: string; clienteId: string | null }, s: SinalPronto) {
  if (s.modo === "sem") return;
  const descricao = `Sinal da reserva: ${nomeTipo(e.tipo).toLowerCase()} de ${e.pet}, ${dataCurta(e.entrada)}`;
  const hoje = isoDia(new Date());
  if (s.modo === "agora") {
    const l = await lancarPago(sb, petshopId, { tipo: "entrada", valor: s.valor, forma: s.forma, pagamentos: s.pagamentos, categoria: CATEGORIA_SINAL, descricao, clienteId: e.clienteId });
    ok(await sb.from("estadias_valores").upsert({
      estadia_id: e.id, petshop_id: petshopId, sinal: s.valor, sinal_estado: "pago", sinal_lancamento_id: l.id, sinal_pago_em: hoje,
      sinal_pagamento: { forma: s.forma, pagamentos: s.pagamentos }, sinal_devolucao_id: null, sinal_devolvido_em: null,
    }, { onConflict: "estadia_id" }).select("estadia_id"));
  } else {
    const l = await lancarAReceber(sb, petshopId, { valor: s.valor, vencimento: s.quando, categoria: CATEGORIA_SINAL, descricao, clienteId: e.clienteId });
    ok(await sb.from("estadias_valores").upsert({
      estadia_id: e.id, petshop_id: petshopId, sinal: s.valor, sinal_estado: "a_receber", sinal_lancamento_id: l.id, sinal_pago_em: null, sinal_pagamento: null,
      sinal_devolucao_id: null, sinal_devolvido_em: null,
    }, { onConflict: "estadia_id" }).select("estadia_id"));
  }
}

/** Os campos do sinal dentro de um formulário: sem sinal, recebi agora ou vai pagar depois. */
export function CamposSinal({ estado: s, aoMudar, sugerido, erro, semTutor }: {
  estado: EstadoSinal; aoMudar: (s: EstadoSinal) => void; sugerido: number | null; erro?: string | null; semTutor?: boolean;
}) {
  const { petshop } = useGestao();
  const regra = sinalDe(petshop);
  const caixa = useCaixaAberto();
  return (
    <div className="g-campo">
      <span>Sinal da reserva</span>
      <div className="g-seg g-ht-seg" role="group" aria-label="Sinal da reserva">
        <button type="button" aria-pressed={s.modo === "sem"} onClick={() => aoMudar({ ...s, modo: "sem" })}>Sem sinal</button>
        <button type="button" aria-pressed={s.modo === "depois"} onClick={() => aoMudar({ ...s, modo: "depois", valor: s.valor ?? sugerido })}>Vai pagar depois</button>
        <button type="button" aria-pressed={s.modo === "agora"} onClick={() => aoMudar({ ...s, modo: "agora", valor: s.valor ?? sugerido })}>Recebi agora</button>
      </div>
      {s.modo !== "sem" && (
        <div className="g-pilha p" style={{ marginTop: 8 }}>
          <Campo rotulo="Valor do sinal" dica={sugerido != null ? `Pela sua regra: ${regra.modo === "pct" ? `${regra.valor}% do total previsto, ` : ""}${brl(sugerido)}. Dá para mudar.` : regra.modo === "pct" ? "Sua regra é uma porcentagem do total: preencha a saída prevista e a diária, ou escreva o valor." : undefined}>
            <CampoDinheiro valor={s.valor} aoMudar={(valor) => aoMudar({ ...s, valor })} rotulo="Valor do sinal" />
          </Campo>
          {s.modo === "depois" ? (
            <Campo rotulo="Paga o sinal até" dica={semTutor ? "Este pet está sem tutor na ficha: a conta a receber precisa de um tutor." : "Fica em Financeiro, A receber. Quando o tutor pagar, toque em Receber o sinal no cartão da reserva."}>
              <input type="date" className="g-input" value={s.quando} min={isoDia(new Date())} onChange={(e) => aoMudar({ ...s, quando: e.target.value })} />
            </Campo>
          ) : s.valor ? (
            <>
              <EscolhaPagamento valor={s.pagamento} aoMudar={(pagamento) => aoMudar({ ...s, pagamento })} total={s.valor} rotulo="Como o tutor pagou o sinal" />
              <AvisoCaixaFechado aberto={caixa} />
            </>
          ) : null}
          {regra.politica.trim() && <p className="g-muted g-pp">O que você combinou sobre o sinal: {regra.politica.trim()}</p>}
        </div>
      )}
      {erro && <small className="erro" role="alert">{erro}</small>}
    </div>
  );
}

/** Quanto do sinal já entrou de verdade (o sinal pago inteiro, ou as partes já recebidas da conta dele). */
export const sinalRecebidoDe = (v: Pick<ValoresDaEstadia, "sinal" | "sinal_estado" | "sinal_recebido">) =>
  v.sinal_estado === "pago" ? Number(v.sinal ?? 0) : Math.min(Number(v.sinal ?? 0), Number(v.sinal_recebido ?? 0));
/** Quanto do sinal ainda falta receber (só o sinal "a receber" tem falta). */
export const faltaDoSinal = (v: Pick<ValoresDaEstadia, "sinal" | "sinal_estado" | "sinal_recebido">) =>
  v.sinal_estado === "a_receber" ? Math.max(0, Math.round((Number(v.sinal ?? 0) - sinalRecebidoDe(v)) * 100) / 100) : 0;

/** Etiqueta do sinal no cartão: com valor para quem recebe, só a situação para os outros. */
export function EtiquetaSinal({ e, valores }: { e: Pick<EstadiaCompleta, "sinal_estado">; valores?: ValoresDaEstadia | null }) {
  const { vejoFinanceiro } = useGestao();
  const estado = (vejoFinanceiro ? valores?.sinal_estado : null) ?? e.sinal_estado;
  if (!estado) return null;
  const valor = vejoFinanceiro && valores?.sinal != null ? ` ${brl(valores.sinal)}` : "";
  if (estado === "pago") return <span className="g-tag verde g-tab">Sinal{valor} pago</span>;
  const falta = vejoFinanceiro && valores ? faltaDoSinal(valores) : 0;
  if (estado === "a_receber") return <span className="g-tag amarelo g-tab">{falta > 0 && falta < Number(valores?.sinal) ? `Sinal${valor} · falta ${brl(falta)}` : `Sinal${valor} a receber`}</span>;
  if (estado === "devolvido") return <span className="g-tag g-tab">Sinal{valor} devolvido</span>;
  return <span className="g-tag g-tab">Sinal{valor} mantido</span>;
}

/** No cartão da reserva: combinar o sinal (quando ainda não tem) ou receber o que ficou para depois. */
export function FolhaSinal({ estadia: e, valores, sugerido, totalPrevisto, aoFechar, aoGravar }: {
  estadia: EstadiaCompleta; valores: ValoresDaEstadia | null; sugerido: number | null; aoFechar: () => void; aoGravar: () => void;
  /** total previsto da reserva, para avisar quando o sinal digitado passa dele */
  totalPrevisto?: number | null;
}) {
  const { sb, petshop } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const pendente = valores?.sinal_estado === "a_receber" && valores.sinal_lancamento_id ? valores : null;
  const [estado, setEstado] = useState<EstadoSinal>(() => ({ ...sinalInicial(sugerido, e.entrada), modo: "agora" }));
  const [pagamento, setPagamento] = useState<EstadoPagamento>(() => pagamentoInicial());
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const caixa = useCaixaAberto();
  const nome = e.pets?.nome ?? "o pet";
  // o sinal pode já ter tido uma parte recebida (pelo Financeiro ou pelo Caixa): aqui entra só o que falta
  const falta = pendente ? faltaDoSinal(pendente) : 0, jaEntrou = pendente ? sinalRecebidoDe(pendente) : 0;

  async function salvar() {
    if (salvando) return;
    setErro(null);
    try {
      if (pendente) {
        const pg = fecharPagamento(pagamento, falta);
        if ("erro" in pg) return setErro(pagamento.dividido ? pg.erro : "Escolha como o tutor pagou o sinal.");
        if (!(await conferirCaixa(sb, petshop.id, confirmar))) return;
        setSalvando(true);
        await quitarConta(sb, petshop.id, pendente.sinal_lancamento_id!, pg, falta);
        avisar(jaEntrou > 0 ? `Sinal de ${nome} completo: ${brl(falta)} recebidos agora, ${brl(pendente.sinal)} no total.` : `Sinal de ${nome} recebido: ${brl(pendente.sinal)}.`);
      } else {
        const pronto = prepararSinal(estado);
        if ("erro" in pronto) return setErro(pronto.erro);
        if (pronto.modo === "sem") return aoFechar();
        // sinal maior do que a reserva inteira costuma ser erro de digitação (1080 no lugar de 108)
        if (totalPrevisto && pronto.valor > totalPrevisto && !(await confirmar({
          titulo: "O sinal é maior do que a reserva",
          texto: `O sinal está em ${brl(pronto.valor)} e o total previsto da reserva é ${brl(totalPrevisto)}. Confira se não sobrou um número a mais.`,
          confirmar: "Está certo, continuar",
        }))) return;
        if (!(await conferirSinal(sb, petshop.id, pronto, confirmar))) return;
        setSalvando(true);
        await lancarSinal(sb, petshop.id, { id: e.id, tipo: e.tipo, entrada: e.entrada, pet: nome, clienteId: e.pets?.clientes?.id ?? null }, pronto);
        avisar(pronto.modo === "agora" ? `Sinal de ${nome} recebido: ${brl(pronto.valor)}.` : `Sinal de ${brl(pronto.valor)} anotado em A receber, para ${dataCurta(pronto.quando)}.`);
      }
      aoGravar();
    } catch (x) { avisarErro(x); setSalvando(false); }
  }

  return (
    <Folha titulo={pendente ? `Receber o sinal de ${nome}` : `Sinal da reserva de ${nome}`} aoFechar={aoFechar}
      rodape={<>
        <button type="button" className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button type="button" className="g-btn pri" onClick={() => void salvar()} disabled={salvando}>
          {salvando ? "Salvando…" : pendente ? `Receber ${brl(falta)}` : estado.modo === "agora" && estado.valor ? `Receber ${brl(estado.valor)}` : estado.modo === "depois" && estado.valor ? `Anotar ${brl(estado.valor)} a receber` : "Salvar"}
        </button>
      </>}>
      <div className="g-form">
        {pendente ? (
          <>
            <div className="g-card areia"><b className="g-tab">Sinal de {brl(pendente.sinal)}{jaEntrou > 0 ? ` · falta ${brl(falta)}` : ""}</b><p className="g-muted g-p">{jaEntrou > 0 ? `O tutor já pagou ${brl(jaEntrou)} deste sinal. Ao receber o que falta, entra no caixa de hoje e a reserva fica com o sinal pago.` : "Estava em A receber. Ao receber, entra no caixa de hoje e a reserva fica com o sinal pago."}</p></div>
            <EscolhaPagamento valor={pagamento} aoMudar={(p) => { setPagamento(p); setErro(null); }} total={falta} rotulo="Como o tutor pagou o sinal" erro={erro} />
            <AvisoCaixaFechado aberto={caixa} />
          </>
        ) : <CamposSinal estado={estado} aoMudar={(s) => { setEstado(s); setErro(null); }} sugerido={sugerido} erro={erro} semTutor={!e.pets?.clientes?.id} />}
      </div>
    </Folha>
  );
}

/**
 * Cancelar uma reserva que tem sinal: quem recebe decide se o sinal fica ou é devolvido. Nada some sem decisão.
 * O sinal pode estar pago, a receber, ou a receber com uma parte já paga (recebida pelo Financeiro ou pelo Caixa):
 * nesse caso a decisão é sobre o que já entrou, e a conta do que falta sai de A receber (ou continua, se a pessoa quiser cobrar).
 */
export function CancelarComSinal({ estadia: e, valores, aoFechar, aoGravar }: { estadia: EstadiaCompleta; valores: ValoresDaEstadia; aoFechar: () => void; aoGravar: () => void }) {
  const { sb, petshop } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const pago = valores.sinal_estado === "pago";
  const recebido = sinalRecebidoDe(valores), falta = faltaDoSinal(valores);
  const parcial = !pago && recebido > 0;
  const entrou = pago || parcial;
  const [escolha, setEscolha] = useState<"ficar" | "devolver" | "cobrar" | null>(null);
  const [valor, setValor] = useState<number | null>(recebido > 0 ? recebido : Number(valores.sinal));
  const [forma, setForma] = useState<Forma | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const caixa = useCaixaAberto();
  const nome = e.pets?.nome ?? "o pet";
  const regra = sinalDe(petshop).politica.trim();

  async function salvar() {
    if (salvando) return;
    if (!escolha) return setErro(entrou ? "Escolha se o sinal fica ou é devolvido." : "Escolha o que fazer com a conta do sinal.");
    setErro(null);
    try {
      const devolve = entrou && escolha === "devolver";
      if (devolve) {
        if (!valor || valor <= 0 || valor > recebido) return setErro(`O valor devolvido vai até ${brl(recebido)}.`);
        if (!forma) return setErro("Escolha como o sinal foi devolvido.");
        if (!(await conferirCaixa(sb, petshop.id, confirmar))) return;
      }
      setSalvando(true);
      if ((parcial && escolha !== "cobrar") || (!entrou && escolha === "devolver")) {
        // tira a conta do que ainda não foi pago (não é dinheiro recebido). Se já tinha entrado uma parte,
        // o banco passa a reserva para "sinal pago" com o que entrou, e as partes seguem no financeiro como recebidas.
        const r = ok(await sb.from("lancamentos").delete().eq("id", valores.sinal_lancamento_id!).eq("petshop_id", petshop.id).eq("pago", false).select("id"));
        if (!r.length) { setSalvando(false); return setErro(`Não consegui tirar essa conta: ela pode já ter sido paga, ou foi anotada por outra pessoa. Escolha ${parcial ? "continuar cobrando o que falta" : "deixar em A receber"}, ou peça para quem cuida do financeiro.`); }
      }
      if (devolve) {
        // a devolução é uma saída de hoje; o recebimento do sinal fica como está, no dia em que entrou
        const l = await lancarPago(sb, petshop.id, { tipo: "saida", valor: valor!, forma: forma!, categoria: CATEGORIA_DEVOLUCAO, descricao: `Devolução do sinal: ${nomeTipo(e.tipo).toLowerCase()} de ${nome}, ${dataCurta(e.entrada)}`, clienteId: e.pets?.clientes?.id ?? null });
        ok(await sb.from("estadias_valores").update({ sinal_estado: "devolvido", sinal_devolucao_id: l.id, sinal_devolvido_em: isoDia(new Date()) }).eq("estadia_id", e.id).select("estadia_id"));
      } else if (entrou || escolha === "ficar") {
        ok(await sb.from("estadias_valores").update({ sinal_estado: "mantido" }).eq("estadia_id", e.id).select("estadia_id"));
      }
      const c = ok(await sb.from("estadias").update({ status: "cancelada" }).eq("id", e.id).eq("petshop_id", petshop.id).eq("status", "reservada").select("id"));
      avisar(!c.length ? "Essa reserva já tinha sido alterada. Atualizei a lista."
        : devolve ? `Reserva cancelada. ${brl(valor)} devolvidos, lançados como saída de hoje.${parcial ? " A conta do que faltava saiu de A receber." : ""}`
        : pago ? `Reserva cancelada. O sinal de ${brl(valores.sinal)} continua como recebido.`
        : parcial && escolha === "cobrar" ? `Reserva cancelada. Os ${brl(recebido)} recebidos ficam, e os ${brl(falta)} que faltam continuam em A receber.`
        : parcial ? `Reserva cancelada. Os ${brl(recebido)} recebidos ficam, e a conta do que faltava saiu de A receber.`
        : escolha === "devolver" ? "Reserva cancelada. A conta do sinal saiu de A receber." : "Reserva cancelada. A conta do sinal continua em A receber.");
      aoGravar();
    } catch (x) { avisarErro(x); setSalvando(false); }
  }

  const opcao = (id: "ficar" | "devolver" | "cobrar", titulo: string, apoio: string) => (
    <label className={escolha === id ? "on" : ""}>
      <input type="radio" name="sinal" checked={escolha === id} onChange={() => { setEscolha(id); setErro(null); }} />
      <span className="t"><b>{titulo}</b><small>{apoio}</small></span>
    </label>
  );

  return (
    <Folha titulo={`Cancelar a reserva de ${nome}`} aoFechar={aoFechar}
      rodape={<>
        <button type="button" className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button type="button" className="g-btn perigo" onClick={() => void salvar()} disabled={salvando}>{salvando ? "Cancelando…" : "Cancelar reserva"}</button>
      </>}>
      <div className="g-form">
        <div className="g-card areia">
          <b className="g-tab">{pago ? `Esta reserva tem sinal pago: ${brl(valores.sinal)}` : parcial ? `Esta reserva tem sinal de ${brl(valores.sinal)}: ${brl(recebido)} já recebidos, ${brl(falta)} a receber` : `Esta reserva tem sinal a receber: ${brl(valores.sinal)}`}</b>
          <p className="g-muted g-p">{nomeTipo(e.tipo)}, {dataCompleta(e.entrada)}{valores.sinal_pago_em ? ` · sinal recebido em ${dataCompleta(valores.sinal_pago_em)}` : ""}.{regra ? ` O que você combinou: ${regra}` : ""}</p>
        </div>
        <div className="g-campo">
          <span>{entrou ? "O que fazer com o sinal?" : "O que fazer com a conta do sinal?"}</span>
          <div className="g-ht-marcar">
            {pago ? (<>
              {opcao("ficar", "Ficar com o sinal", "O valor continua como recebido. Nada muda no financeiro.")}
              {opcao("devolver", "Devolver o sinal", "Lança uma saída de hoje com o valor devolvido. O recebimento do sinal não é apagado.")}
            </>) : parcial ? (<>
              {opcao("ficar", `Ficar com os ${brl(recebido)} recebidos`, `O que entrou continua como recebido. A conta dos ${brl(falta)} que faltavam sai de A receber.`)}
              {opcao("devolver", "Devolver o que foi recebido", `Lança uma saída de hoje com o valor devolvido. A conta dos ${brl(falta)} que faltavam sai de A receber.`)}
              {opcao("cobrar", "Continuar cobrando o que falta", `O que entrou continua como recebido e o tutor segue devendo ${brl(falta)}, em Financeiro, A receber.`)}
            </>) : (<>
              {opcao("ficar", "Deixar em A receber", "O tutor continua devendo o sinal. A conta segue em Financeiro, A receber.")}
              {opcao("devolver", "Tirar a conta a receber", "O sinal não foi pago: a conta sai de A receber.")}
            </>)}
          </div>
        </div>
        {entrou && escolha === "devolver" && (
          <>
            <Campo rotulo="Valor devolvido" dica={`Até ${brl(recebido)}.`}><CampoDinheiro valor={valor} aoMudar={setValor} rotulo="Valor devolvido" maximo={recebido} /></Campo>
            <ChipsForma valor={forma} aoMudar={(f) => { setForma(f); setErro(null); }} />
            <AvisoCaixaFechado aberto={caixa} />
          </>
        )}
        {erro && <p className="g-erro" role="alert">{erro}</p>}
      </div>
    </Folha>
  );
}
