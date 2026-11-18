"use client";

import { useState } from "react";
import { conferirCaixa, conferirValorAlto, parteDaChave, quitarConta, receberConta, type PartePagamento } from "@/lib/gestao/dinheiro";
import { casoDoErro, fazerTudoOuNada, partesOuNada, ref, type Passo } from "@/lib/gestao/tudo-ou-nada";
import { useOperacao } from "@/lib/gestao/uma-vez";
import type { ValoresDaEstadia } from "@/lib/gestao/hotel";
import { destinoPelaRegra, sinalDe, textoDaRegra } from "@/lib/gestao/hotel-opcoes";
import type { Banco } from "@/lib/gestao/supabase";
import { brl, dataCompleta, dataCurta, isoDia, somaDias } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Campo, Folha, ok, useAvisos } from "../ui";
import { AvisoCaixaFechado, CampoDinheiro, ChipsForma, erroDeValor, EscolhaPagamento, fecharPagamento, pagamentoInicial, ParcelasNaTela, useAnotarParcelas, useCaixaAberto, type EstadoPagamento, type Forma } from "../loja/pecas";
import { idsDaOperacao } from "@/lib/gestao/maquininha";
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

/** `parcelas`: crédito em quantas vezes (anote depois de gravar, com os ids que `lancarSinal` devolve). */
type SinalPronto = { modo: "sem" } | { modo: "agora"; valor: number; forma: Forma; pagamentos: PartePagamento[] | null; parcelas?: number | null } | { modo: "depois"; valor: number; quando: string };
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
  return { modo: "agora", valor: s.valor, ...pg, parcelas: s.pagamento.parcelas ?? null };
}

/** Antes de receber: valor alto e caixa fechado, como nas outras telas que recebem. */
export async function conferirSinal(sb: Banco, petshopId: string, s: SinalPronto, perguntar: Perguntar) {
  if (s.modo === "sem") return true;
  if (!(await conferirValorAlto(s.valor, perguntar))) return false;
  if (s.modo === "agora" && !(await conferirCaixa(sb, petshopId, perguntar))) return false;
  return true;
}

/**
 * Lança o sinal (recebido ou a receber) e liga à reserva, numa chamada só: ou os dois ficam gravados, ou nenhum.
 * Com a mesma chave de novo (a resposta não chegou, toque de novo), o banco devolve o que já foi feito, sem lançar outra vez.
 * Devolve os ids dos lançamentos pagos agora (para anotar em quantas vezes foi o crédito).
 */
export async function lancarSinal(sb: Banco, petshopId: string, e: { id: string; tipo: string; entrada: string; pet: string; clienteId: string | null }, s: SinalPronto, chave: string,
  /** pago adiantado no check-in de quem chegou agora (sem reserva): entra como o sinal, com outro nome */
  adiantado?: boolean): Promise<string[]> {
  if (s.modo === "sem") return [];
  const descricao = `${adiantado ? "Pago adiantado" : "Sinal da reserva"}: ${nomeTipo(e.tipo).toLowerCase()} de ${e.pet}, ${dataCurta(e.entrada)}`;
  const hoje = isoDia(new Date());
  const passos: Passo[] = s.modo === "agora" ? [
    { t: "lancamento", nome: "sinal", chave: parteDaChave(chave, "sinal"), linha: { tipo: "entrada", valor: s.valor, forma: s.forma, pagamentos: partesOuNada(s.pagamentos), categoria: CATEGORIA_SINAL, descricao, cliente_id: e.clienteId, pago: true, data: hoje } },
    { t: "estadia_valores", estadia: e.id, modo: "upsert", campos: {
      sinal: s.valor, sinal_estado: "pago", sinal_lancamento_id: ref("sinal"), sinal_pago_em: hoje,
      sinal_pagamento: { forma: s.forma, pagamentos: s.pagamentos, ...(adiantado ? { adiantado: true } : {}) }, sinal_devolucao_id: null, sinal_devolvido_em: null,
    } },
  ] : [
    { t: "lancamento", nome: "sinal", chave: parteDaChave(chave, "sinal"), linha: { tipo: "entrada", valor: s.valor, forma: null, categoria: CATEGORIA_SINAL, descricao, cliente_id: e.clienteId, pago: false, data: s.quando, vencimento: s.quando } },
    { t: "estadia_valores", estadia: e.id, modo: "upsert", campos: {
      sinal: s.valor, sinal_estado: "a_receber", sinal_lancamento_id: ref("sinal"), sinal_pago_em: null, sinal_pagamento: null, sinal_devolucao_id: null, sinal_devolvido_em: null,
    } },
  ];
  const feito = await fazerTudoOuNada(sb, petshopId, parteDaChave(chave, "sinal")!, { funcao: "estadia_sinal", estadia: e.id }, passos);
  return s.modo === "agora" ? idsDaOperacao(feito, passos) : [];
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
              <ParcelasNaTela.Provider value>
                <EscolhaPagamento valor={s.pagamento} aoMudar={(pagamento) => aoMudar({ ...s, pagamento })} total={s.valor} rotulo="Como o tutor pagou o sinal" />
              </ParcelasNaTela.Provider>
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

/** O "sinal" é o que o tutor pagou adiantado no check-in de quem chegou agora (não uma reserva com sinal)? */
export const ehAdiantado = (v: Pick<ValoresDaEstadia, "sinal_pagamento"> | null | undefined) =>
  Boolean(v?.sinal_pagamento && typeof v.sinal_pagamento === "object" && !Array.isArray(v.sinal_pagamento) && (v.sinal_pagamento as { adiantado?: unknown }).adiantado === true);

/**
 * "Recebeu adiantado?" no check-in de quem chegou agora (Bia, item 8): o tutor paga uma parte (ou tudo) na entrada.
 * Fica guardado como o sinal da estadia, pago: entra no caixa de hoje e o check-out desconta, como o sinal de uma reserva.
 */
export function CamposAdiantado({ estado: s, aoMudar, erro }: { estado: EstadoSinal; aoMudar: (s: EstadoSinal) => void; erro?: string | null }) {
  const caixa = useCaixaAberto();
  return (
    <div className="g-campo">
      <span>Recebeu adiantado?</span>
      <div className="g-seg g-ht-seg" role="group" aria-label="Recebeu adiantado?">
        <button type="button" aria-pressed={s.modo !== "agora"} onClick={() => aoMudar({ ...s, modo: "sem" })}>Não</button>
        <button type="button" aria-pressed={s.modo === "agora"} onClick={() => aoMudar({ ...s, modo: "agora" })}>Sim, recebi agora</button>
      </div>
      {s.modo === "agora" && (
        <div className="g-pilha p" style={{ marginTop: 8 }}>
          <Campo rotulo="Valor recebido" dica="Entra no caixa de hoje. No check-out, é descontado da conta, como um sinal.">
            <CampoDinheiro valor={s.valor} aoMudar={(valor) => aoMudar({ ...s, valor })} rotulo="Valor recebido adiantado" />
          </Campo>
          {s.valor ? (
            <>
              <ParcelasNaTela.Provider value>
                <EscolhaPagamento valor={s.pagamento} aoMudar={(pagamento) => aoMudar({ ...s, pagamento })} total={s.valor} rotulo="Forma de pagamento" />
              </ParcelasNaTela.Provider>
              <AvisoCaixaFechado aberto={caixa} />
            </>
          ) : null}
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
  if (estado === "pago") return <span className="g-tag verde g-tab">{vejoFinanceiro && ehAdiantado(valores) ? `Pago adiantado${valor}` : `Sinal${valor} pago`}</span>;
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
  // o tutor pode pagar só uma parte do que falta: o resto continua em A receber
  const [agora, setAgora] = useState<number | null>(falta > 0 ? falta : null);
  const centavos = (n: number) => Math.round(n * 100) / 100;
  const recebeAgora = agora != null && agora > 0 && agora <= falta ? centavos(agora) : null;
  const emParte = recebeAgora != null && recebeAgora < falta;
  const anotarParcelas = useAnotarParcelas();

  const op = useOperacao();
  const salvar = () => op.fazer(gravar);
  async function gravar(chave: string): Promise<boolean | void> {
    if (salvando) return;
    setErro(null);
    try {
      if (pendente) {
        if (recebeAgora == null) return setErro(`Escreva quanto o tutor pagou agora, até ${brl(falta)}.`);
        const pg = fecharPagamento(pagamento, recebeAgora);
        if ("erro" in pg) return setErro(pagamento.dividido ? pg.erro : "Escolha como o tutor pagou o sinal.");
        // outra tela (ou outro aparelho) pode ter recebido este sinal enquanto esta estava aberta: diz isso em vez de ficar parada
        const atual = await sb.from("lancamentos").select("pago, valor").eq("id", pendente.sinal_lancamento_id!).eq("petshop_id", petshop.id).maybeSingle();
        if (!atual.error && (!atual.data || atual.data.pago)) { avisar(`O sinal de ${nome} já foi recebido, em outra tela ou aparelho. Nada foi lançado de novo.`); aoGravar(); return; }
        if (atual.data && centavos(Number(atual.data.valor)) !== centavos(falta)) return setErro(`Este sinal mudou enquanto a tela estava aberta: agora faltam ${brl(Number(atual.data.valor))}. Feche e abra de novo.`);
        if (!(await conferirCaixa(sb, petshop.id, confirmar))) return;
        setSalvando(true);
        if (emParte) {
          // só uma parte: entra no caixa de hoje e a conta do sinal fica com o que falta (a reserva segue com o sinal a receber)
          const r = await receberConta(sb, pendente.sinal_lancamento_id!, { valor: recebeAgora, forma: pg.forma, pagamentos: pg.pagamentos, chave });
          avisar(`Sinal de ${nome}: ${brl(recebeAgora)} recebidos agora. Faltam ${brl(centavos(falta - recebeAgora))}, que continuam em A receber.`);
          await anotarParcelas(r.ids ?? [], pagamento.parcelas);
        } else {
          await quitarConta(sb, petshop.id, pendente.sinal_lancamento_id!, pg, falta, chave);
          avisar(jaEntrou > 0 ? `Sinal de ${nome} completo: ${brl(falta)} recebidos agora, ${brl(pendente.sinal)} no total.` : `Sinal de ${nome} recebido: ${brl(pendente.sinal)}.`);
          await anotarParcelas([pendente.sinal_lancamento_id], pagamento.parcelas);
        }
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
        const pagos = await lancarSinal(sb, petshop.id, { id: e.id, tipo: e.tipo, entrada: e.entrada, pet: nome, clienteId: e.pets?.clientes?.id ?? null }, pronto, chave);
        avisar(pronto.modo === "agora" ? `Sinal de ${nome} recebido: ${brl(pronto.valor)}.` : `Sinal de ${brl(pronto.valor)} anotado em A receber, para ${dataCurta(pronto.quando)}.`);
        if (pronto.modo === "agora") await anotarParcelas(pagos, pronto.parcelas);
      }
      aoGravar();
    } catch (x) {
      // nada ficou pela metade; se a resposta não chegou, a mesma chave na nova tentativa não lança de novo
      avisarErro(x); setSalvando(false); return false;
    }
  }

  return (
    <Folha titulo={pendente ? `Receber o sinal de ${nome}` : `Sinal da reserva de ${nome}`} aoFechar={aoFechar}
      rodape={<>
        <button type="button" className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button type="button" className="g-btn pri" onClick={() => void salvar()} disabled={salvando}>
          {salvando ? "Salvando…" : pendente ? `Receber ${brl(recebeAgora ?? falta)}` : estado.modo === "agora" && estado.valor ? `Receber ${brl(estado.valor)}` : estado.modo === "depois" && estado.valor ? `Anotar ${brl(estado.valor)} a receber` : "Salvar"}
        </button>
      </>}>
      <div className="g-form">
        {pendente ? (
          <>
            <div className="g-card areia"><b className="g-tab">Sinal de {brl(pendente.sinal)}{jaEntrou > 0 ? ` · falta ${brl(falta)}` : ""}</b><p className="g-muted g-p">{jaEntrou > 0 ? `O tutor já pagou ${brl(jaEntrou)} deste sinal. Ao receber o que falta, entra no caixa de hoje e a reserva fica com o sinal pago.` : "Estava em A receber. Ao receber, entra no caixa de hoje e a reserva fica com o sinal pago."}</p></div>
            <Campo rotulo="Quanto o tutor pagou agora" dica={emParte ? `Faltam ${brl(centavos(falta - recebeAgora!))}: continuam em A receber, e a reserva segue com o sinal a receber.` : `Até ${brl(falta)}. Se ele pagou só uma parte, escreva a parte: o resto continua em A receber.`}>
              <CampoDinheiro valor={agora} aoMudar={(v) => { setAgora(v); setErro(null); }} rotulo="Quanto o tutor pagou agora" maximo={falta} />
            </Campo>
            <ParcelasNaTela.Provider value>
              <EscolhaPagamento valor={pagamento} aoMudar={(p) => { setPagamento(p); setErro(null); }} total={recebeAgora ?? falta} rotulo="Como o tutor pagou o sinal" erro={erro} />
            </ParcelasNaTela.Provider>
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
type Escolha = "ficar" | "devolver" | "cobrar" | "credito";
export function CancelarComSinal({ estadia: e, valores, aoFechar, aoGravar }: { estadia: EstadiaCompleta; valores: ValoresDaEstadia; aoFechar: () => void; aoGravar: () => void }) {
  const { sb, petshop } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const pago = valores.sinal_estado === "pago";
  const recebido = sinalRecebidoDe(valores), falta = faltaDoSinal(valores);
  const parcial = !pago && recebido > 0;
  const entrou = pago || parcial;
  const nomeTutor = e.pets?.clientes?.nome?.split(/\s+/)[0] ?? null;
  const clienteId = e.pets?.clientes?.id ?? null;
  // a regra de cancelamento de Meu pet shop (em campos): pelo tempo até a entrada, a escolha já vem marcada. Sem regra, nada vem marcado.
  const regraCampos = sinalDe(petshop).cancela;
  const faltam = Math.round((new Date(isoDia(new Date(e.entrada)) + "T12:00:00").getTime() - new Date(isoDia(new Date()) + "T12:00:00").getTime()) / 864e5);
  const pelaRegra = entrou ? destinoPelaRegra(regraCampos, faltam) : null;
  const sugerida: Escolha | null = pelaRegra === "credito" ? (clienteId ? "credito" : null) : pelaRegra;
  const [escolha, setEscolha] = useState<Escolha | null>(sugerida);
  const [valor, setValor] = useState<number | null>(recebido > 0 ? recebido : Number(valores.sinal));
  const [forma, setForma] = useState<Forma | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const caixa = useCaixaAberto();
  const nome = e.pets?.nome ?? "o pet";
  const regra = sinalDe(petshop).politica.trim();

  const op = useOperacao();
  const salvar = () => op.fazer(gravar);
  async function gravar(chave: string): Promise<boolean | void> {
    if (salvando) return;
    if (!escolha) return setErro(entrou ? "Escolha se o sinal fica ou é devolvido." : "Escolha o que fazer com a conta do sinal.");
    setErro(null);
    try {
      const devolve = entrou && escolha === "devolver";
      const credito = entrou && escolha === "credito";
      if (credito && !clienteId) return setErro("Este pet não tem tutor na ficha: não dá para deixar crédito.");
      if (devolve) {
        if (!valor || valor <= 0 || valor > recebido) return setErro(`O valor devolvido vai até ${brl(recebido)}.`);
        if (!forma) return setErro("Escolha como o sinal foi devolvido.");
        if (!(await conferirCaixa(sb, petshop.id, confirmar))) return;
      }
      setSalvando(true);
      // tudo numa chamada só: tirar a conta, a devolução, o sinal da reserva e o cancelamento entram juntos, ou nada entra
      const passos: Passo[] = [];
      // tira a conta do que ainda não foi pago (não é dinheiro recebido). Se já tinha entrado uma parte,
      // o banco passa a reserva para "sinal pago" com o que entrou, e as partes seguem no financeiro como recebidas.
      if ((parcial && escolha !== "cobrar") || (!entrou && escolha === "devolver")) passos.push({ t: "apagar_aberto", id: valores.sinal_lancamento_id!, exige: true });
      if (devolve) {
        // a devolução é uma saída de hoje; o recebimento do sinal fica como está, no dia em que entrou
        passos.push({ t: "lancamento", nome: "devolucao", chave: parteDaChave(chave, "devolucao"), linha: { tipo: "saida", valor: valor!, forma: forma!, categoria: CATEGORIA_DEVOLUCAO, descricao: `Devolução do sinal: ${nomeTipo(e.tipo).toLowerCase()} de ${nome}, ${dataCurta(e.entrada)}`, cliente_id: e.pets?.clientes?.id ?? null, pago: true, data: isoDia(new Date()) } });
        passos.push({ t: "estadia_valores", estadia: e.id, modo: "update", campos: { sinal_estado: "devolvido", sinal_devolucao_id: ref("devolucao"), sinal_devolvido_em: isoDia(new Date()) } });
      } else if (credito) {
        // o que entrou fica recebido e vira crédito do tutor (para a próxima conta); nada sai do caixa
        passos.push({ t: "credito", cliente: clienteId!, valor: recebido, estadia: e.id, motivo: `Sinal da reserva cancelada: ${nomeTipo(e.tipo).toLowerCase()} de ${nome}, ${dataCurta(e.entrada)}`, chave: parteDaChave(chave, "credito") });
        passos.push({ t: "estadia_valores", estadia: e.id, modo: "update", campos: { sinal_estado: "mantido" } });
      } else if (entrou || escolha === "ficar") {
        passos.push({ t: "estadia_valores", estadia: e.id, modo: "update", campos: { sinal_estado: "mantido" } });
      }
      passos.push({ t: "estadia_cancelar", id: e.id });
      try {
        await fazerTudoOuNada(sb, petshop.id, chave, { funcao: "estadia_sinal", estadia: e.id }, passos);
      } catch (x) {
        setSalvando(false);
        if (casoDoErro(x) === "maestro:estadia_ja") { avisar("Essa reserva já tinha sido alterada. Atualizei a lista. Nada foi lançado."); aoGravar(); return; }
        if (casoDoErro(x) === "maestro:apagar") { setErro(`Não consegui tirar essa conta: ela pode já ter sido paga, ou foi anotada por outra pessoa. Escolha ${parcial ? "continuar cobrando o que falta" : "deixar em A receber"}, ou peça para quem cuida do financeiro. Nada foi lançado.`); return false; }
        throw x;
      }
      avisar(credito ? `Reserva cancelada. ${brl(recebido)} ficaram de crédito para ${nomeTutor ?? "o tutor"}: a próxima conta dele (balcão, atendimento, mensalidade ou check-out) oferece usar.${parcial ? " A conta do que faltava saiu de A receber." : ""}`
        : devolve ? `Reserva cancelada. ${brl(valor)} devolvidos, lançados como saída de hoje.${parcial ? " A conta do que faltava saiu de A receber." : ""}`
        : pago ? `Reserva cancelada. O sinal de ${brl(valores.sinal)} continua como recebido.`
        : parcial && escolha === "cobrar" ? `Reserva cancelada. Os ${brl(recebido)} recebidos ficam, e os ${brl(falta)} que faltam continuam em A receber.`
        : parcial ? `Reserva cancelada. Os ${brl(recebido)} recebidos ficam, e a conta do que faltava saiu de A receber.`
        : escolha === "devolver" ? "Reserva cancelada. A conta do sinal saiu de A receber." : "Reserva cancelada. A conta do sinal continua em A receber.");
      aoGravar();
    } catch (x) {
      // nada ficou pela metade: a reserva segue como estava. A mesma chave na nova tentativa não devolve duas vezes
      avisarErro(x); setSalvando(false); return false;
    }
  }

  const opcao = (id: Escolha, titulo: string, apoio: string) => (
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
          {sugerida && <p className="g-p" role="status"><b>Pela sua regra</b> ({textoDaRegra(regraCampos)}), {faltam > 0 ? `faltam ${faltam === 1 ? "1 dia" : `${faltam} dias`} para a entrada` : faltam === 0 ? "a entrada é hoje" : "a entrada já passou"}: a escolha já vem marcada. Dá para mudar.</p>}
        </div>
        <div className="g-campo">
          <span>{entrou ? "O que fazer com o sinal?" : "O que fazer com a conta do sinal?"}</span>
          <div className="g-ht-marcar">
            {pago ? (<>
              {opcao("ficar", "Ficar com o sinal", "O valor continua como recebido. Nada muda no financeiro.")}
              {opcao("devolver", "Devolver o sinal", "Lança uma saída de hoje com o valor devolvido. O recebimento do sinal não é apagado.")}
              {clienteId && opcao("credito", "Virar crédito do tutor", `${brl(recebido)} ficam de crédito para ${nomeTutor ?? "o tutor"} usar na próxima conta (balcão, atendimento, mensalidade ou check-out). Nada sai do caixa.`)}
            </>) : parcial ? (<>
              {opcao("ficar", `Ficar com os ${brl(recebido)} recebidos`, `O que entrou continua como recebido. A conta dos ${brl(falta)} que faltavam sai de A receber.`)}
              {opcao("devolver", "Devolver o que foi recebido", `Lança uma saída de hoje com o valor devolvido. A conta dos ${brl(falta)} que faltavam sai de A receber.`)}
              {clienteId && opcao("credito", `Os ${brl(recebido)} recebidos viram crédito do tutor`, `Ficam de crédito para ${nomeTutor ?? "o tutor"} usar numa próxima reserva. A conta dos ${brl(falta)} que faltavam sai de A receber.`)}
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

/**
 * O total da reserva mudou depois que o sinal foi anotado (outro pet do mesmo tutor entrou nas mesmas noites e esta ficou
 * com o desconto do segundo pet, ou mudaram as datas): o sinal em A receber, sem nada pago ainda, ficou fora da regra.
 * Mostra a diferença e deixa acertar com um toque, ou deixar como está (fica lembrado neste aparelho). Nada muda sozinho.
 */
export function AjusteDoSinal({ estadiaId, valores, total, aoGravar }: { estadiaId: string; valores: ValoresDaEstadia | null | undefined; total: number | null; aoGravar: () => void }) {
  const { sb, petshop, vejoFinanceiro } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const [salvando, setSalvando] = useState(false);
  const regra = sinalDe(petshop);
  const chave = `maestro-sinal-assim:${estadiaId}:${valores?.sinal ?? ""}`;
  const [deixou, setDeixou] = useState(() => { try { return typeof window !== "undefined" && localStorage.getItem(chave) === "1"; } catch { return false; } });
  if (!vejoFinanceiro || !valores || deixou || !regra.ativo || regra.modo !== "pct" || !regra.valor || !total) return null;
  if (valores.sinal_estado !== "a_receber" || !valores.sinal_lancamento_id || valores.sinal == null || Number(valores.sinal_recebido ?? 0) > 0) return null;
  const pela = Math.round(Number((total * regra.valor).toPrecision(12))) / 100;
  if (Math.abs(pela - Number(valores.sinal)) < 0.005 || pela <= 0) return null;
  async function acertar() {
    if (salvando) return;
    setSalvando(true);
    try {
      // só a conta ainda a receber e sem parte paga; o banco leva o valor novo para o sinal da reserva
      ok(await sb.from("lancamentos").update({ valor: pela }).eq("id", valores!.sinal_lancamento_id!).eq("petshop_id", petshop.id).eq("pago", false).is("valor_original", null).select("id"));
      avisar(`Sinal acertado: ${brl(pela)} (${regra.valor}% de ${brl(total!)}).`);
      aoGravar();
    } catch (x) { avisarErro(x); } finally { setSalvando(false); }
  }
  return (
    <span className="g-ht-sinal-ajuste" role="status">
      O total mudou para {brl(total)}: pela sua regra ({regra.valor}%) o sinal fica {brl(pela)}, e está anotado {brl(valores.sinal)}.{" "}
      <button type="button" className="g-btn sec p" onClick={() => void acertar()} disabled={salvando}>{salvando ? "Acertando…" : `Acertar para ${brl(pela)}`}</button>{" "}
      <button type="button" className="g-btn fantasma p" onClick={() => { try { localStorage.setItem(chave, "1"); } catch { /* sem armazenamento */ } setDeixou(true); }}>Deixar assim</button>
    </span>
  );
}
