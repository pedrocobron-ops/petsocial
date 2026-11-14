"use client";

import { useState } from "react";
import { ChevronRight, HandCoins } from "lucide-react";
import { nomeDosServicos, valorDoHorario, servicosAMais } from "@/lib/gestao/servicos-do-horario";
import { COLS_PACOTE_CLIENTE } from "@/lib/gestao/reservado";
import { SELECT_AGENDAMENTO, type AgendamentoCompleto, type PacoteCliente } from "@/lib/gestao/tipos";
import { brl, dataAmigavel, hora, isoDia } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { AvatarPet, avisarMudanca, useAvisos, useDados, useSomenteLeitura } from "../ui";
import Comanda from "./comanda";

/**
 * Atendimento concluído que ninguém cobrou: o tosador concluiu no celular e o cliente foi embora sem passar no caixa.
 * O banco diz QUAIS são (função `agendamentos_para_cobrar`: concluído, com valor, sem conta recebida nem "paga depois",
 * sem pacote que cubra tudo e sem a marca "não vou cobrar"). Não traz valor nenhum: a agenda de quem não mexe com dinheiro
 * usa a mesma lista para a marca "Falta cobrar".
 * Pet shop que nunca fechou a conta de um atendimento pelo sistema recebe a lista vazia.
 */
export function useParaCobrar(de?: Date, ate?: Date) {
  const { sb, petshop, posso, vejoFinanceiro } = useGestao();
  const vale = posso("agenda") || vejoFinanceiro;
  const deIso = de ? isoDia(de) : null, ateIso = ate ? isoDia(ate) : null;
  const { dados, recarregar } = useDados(async () => {
    if (!vale) return [] as { id: string; inicio: string }[];
    const r = await sb.rpc("agendamentos_para_cobrar", { p: petshop.id, ...(deIso ? { p_de: deIso } : {}), ...(ateIso ? { p_ate: ateIso } : {}) });
    // banco ainda sem a função (atualização a caminho): segue como antes, sem a marca
    if (r.error) return [];
    return r.data ?? [];
  }, [petshop.id, vale, deIso, ateIso]);
  const lista = dados ?? [];
  return { ids: new Set(lista.map((x) => x.id)), lista, recarregar };
}

/** O que a conta deste horário ainda cobra: tudo, ou só os outros serviços quando o principal foi (ou vai) pelo pacote. */
const aCobrarDe = (a: AgendamentoCompleto, comPacote = false) => (a.pacote_cliente_id || comPacote
  ? Math.round(servicosAMais(a).reduce((t, o) => t + Number(o.preco ?? 0), 0) * 100) / 100
  : valorDoHorario(a) ?? 0);

/**
 * Lista "Atendimentos para cobrar", para quem recebe (Caixa ou Financeiro): um toque abre a conta do atendimento.
 * Some quando não há nada. `aoMudar`: a tela que mostra a lista recarrega o que depende dela.
 */
export function AtendimentosParaCobrar({ aoMudar }: { aoMudar?: () => void }) {
  const { sb, petshop, vejoFinanceiro } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const { lista, recarregar } = useParaCobrar();
  const ids = lista.map((x) => x.id).join(",");
  const { dados } = useDados(async () => {
    if (!vejoFinanceiro || !ids) return { lista: [] as AgendamentoCompleto[], pacotes: new Map<string, PacoteCliente>() };
    const r = await sb.from("agendamentos").select(SELECT_AGENDAMENTO).eq("petshop_id", petshop.id).in("id", ids.split(",").slice(0, 200)).order("inicio");
    if (r.error) throw new Error(r.error.message);
    const lista = (r.data ?? []) as unknown as AgendamentoCompleto[];
    // pet com pacote que cobre o serviço principal (a mesma regra do cartão do horário): a conta oferece o pacote primeiro,
    // para ninguém cobrar de novo o que o cliente já pagou no pacote
    const pacotes = new Map<string, PacoteCliente>();
    const pets = [...new Set(lista.filter((a) => !a.pacote_cliente_id).map((a) => a.pet_id))];
    if (pets.length) {
      const pc = await sb.from("pacotes_clientes").select(COLS_PACOTE_CLIENTE).eq("petshop_id", petshop.id).in("pet_id", pets).eq("ativo", true);
      const hoje = isoDia(new Date());
      const validos = ((pc.data ?? []) as PacoteCliente[]).filter((p) => p.usados < p.total && (!p.vence_em || p.vence_em >= hoje));
      for (const a of lista) {
        if (a.pacote_cliente_id) continue;
        const v = validos.find((p) => p.pet_id === a.pet_id && (!p.servico_id || p.servico_id === a.servico_id));
        if (v) pacotes.set(a.id, v);
      }
    }
    return { lista, pacotes };
  }, [petshop.id, ids, vejoFinanceiro]);
  const [aberta, setAberta] = useState<{ a: AgendamentoCompleto; pacote: PacoteCliente | null } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  if (!vejoFinanceiro || !dados?.lista.length) return null;
  const pacoteDe = (a: AgendamentoCompleto) => dados.pacotes.get(a.id) ?? null;
  const total = Math.round(dados.lista.reduce((t, a) => t + aCobrarDe(a, Boolean(pacoteDe(a))), 0) * 100) / 100;
  const mudou = () => { void recarregar(); avisarMudanca(); aoMudar?.(); };

  async function naoCobrar(a: AgendamentoCompleto) {
    if (ocupado || somenteLeitura()) return;
    if (!(await confirmar({ titulo: "Não cobrar este atendimento?", texto: `${a.pets?.nome ?? "O pet"}, ${dataAmigavel(a.inicio)} às ${hora(a.inicio)}. Ele sai desta lista e fica anotado como não cobrado. Para a comissão, continua valendo o preço da agenda.`, confirmar: "Não cobrar" }))) return;
    setOcupado(true);
    try {
      const r = await sb.from("agendamentos").update({ sem_cobranca: true }).eq("id", a.id).eq("petshop_id", petshop.id).select("id");
      if (r.error) throw new Error(r.error.message);
      avisar("Anotado: este atendimento não vai ser cobrado.");
      mudou();
    } catch (e) { avisarErro(e); } finally { setOcupado(false); }
  }

  return (
    <section className="g-card g-ag-cobrar" id="atendimentos-para-cobrar" aria-label="Atendimentos para cobrar">
      <div className="g-card-t">
        <h3><HandCoins aria-hidden style={{ width: 18, height: 18 }} />Atendimentos para cobrar</h3>
        <span className="g-muted g-pp">{dados.lista.length === 1 ? "1 concluído sem conta fechada" : `${dados.lista.length} concluídos sem conta fechada`} · {brl(total)}</span>
      </div>
      <div className="g-lista">
        {dados.lista.map((a) => { const pacote = pacoteDe(a); return (
          <div className="g-ag-cobrar-linha" key={a.id}>
            <button type="button" className="g-linha" onClick={() => { if (!somenteLeitura()) setAberta({ a, pacote }); }}>
              {a.pets && <AvatarPet pet={a.pets} />}
              <span className="t">
                <b>{a.pets?.nome ?? "Pet"}</b>
                <span>{[nomeDosServicos(a) ?? "Atendimento", `${dataAmigavel(a.inicio)} às ${hora(a.inicio)}`, a.profissionais?.nome ? `com ${a.profissionais.nome.split(" ")[0]}` : null, a.pets?.clientes?.nome].filter(Boolean).join(" · ")}</span>
                {pacote && <span>Tem pacote para {a.servicos?.nome ?? "este serviço"} ({pacote.nome}: {pacote.total - pacote.usados === 1 ? "sobra 1 uso" : `sobram ${pacote.total - pacote.usados} usos`})</span>}
              </span>
              <span className="d"><b className="g-tab">{brl(aCobrarDe(a, Boolean(pacote)))}</b><span>{pacote ? (aCobrarDe(a, true) > 0 ? "Usar o pacote e cobrar o resto" : "Usar o pacote") : "Fechar a conta"}</span></span>
              <ChevronRight size={18} className="g-muted" aria-hidden />
            </button>
            {pacote && <button type="button" className="g-btn fantasma p" disabled={ocupado} onClick={() => { if (!somenteLeitura()) setAberta({ a, pacote: null }); }}>Cobrar sem usar o pacote</button>}
            <button type="button" className="g-btn fantasma p" disabled={ocupado} onClick={() => void naoCobrar(a)}>Não cobrar</button>
          </div>
        ); })}
      </div>
      <p className="g-muted g-pp">O atendimento foi concluído, mas a conta não foi fechada: nada entrou no caixa nem ficou em A receber. Toque para receber agora ou anotar para o cliente pagar depois.</p>
      {aberta && <Comanda agendamento={aberta.a} pacote={aberta.pacote} aoFechar={() => setAberta(null)} aoPronto={() => { setAberta(null); mudou(); }} />}
    </section>
  );
}
