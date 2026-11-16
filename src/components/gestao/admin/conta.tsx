"use client";

import { useEffect, useState } from "react";
import { Mail, MessageCircle } from "lucide-react";
import { Esqueleto, mensagemDeErro, ok } from "@/components/gestao/ui";
import { banco } from "@/lib/gestao/supabase";
import { PERIODOS } from "@/lib/gestao/planos";
import { dataCompleta, fmtTelefone, hora, linkWhatsApp } from "@/lib/gestao/util";

/** O que `admin_conta` devolve: dados da assinatura e o histórico do status. Nada de clientes, pets ou valores. */
type Conta = {
  id: string; status: string; plano: string; periodo_meses: number; teste_ate: string; pago_ate: string | null; assinatura_desde: string | null; criado_em: string;
  historico: { tipo: "status" | "cakto"; em: string; de: string | null; para: string | null; evento: string | null }[];
};
export type LojaContato = { id: string; nome: string; telefone: string | null; dono_nome: string | null; dono_email: string | null; status: string; teste_ate: string };

const STATUS: Record<string, string> = { teste: "teste", ativa: "ativa", atrasada: "atrasada", cancelada: "cancelada", cortesia: "cortesia" };
const EVENTOS: Record<string, string> = {
  purchase_approved: "Compra aprovada", purchase_refused: "Compra recusada", subscription_created: "Assinatura criada",
  subscription_renewed: "Renovação paga", subscription_late: "Cobrança atrasada", subscription_late_recovered: "Atraso pago",
  subscription_renewal_refused: "Renovação recusada", subscription_canceled: "Assinatura cancelada", subscription_paused: "Assinatura pausada",
  subscription_resumed: "Assinatura retomada", refund: "Devolução do pagamento", refund_requested: "Pedido de devolução", chargeback: "Contestação no cartão",
};
const quando = (d: string) => `${dataCompleta(new Date(d))} às ${hora(d)}`;
const nomePeriodo = (m: number) => PERIODOS.find((p) => p.meses === m)?.nome ?? `${m} meses`;

type Modelo = "boas_vindas" | "fim_teste" | "sumido" | "atrasada";
const MODELOS: { id: Modelo; rotulo: string }[] = [
  { id: "boas_vindas", rotulo: "Boas-vindas" },
  { id: "fim_teste", rotulo: "Teste acabando" },
  { id: "sumido", rotulo: "Sem entrar" },
  { id: "atrasada", rotulo: "Pagamento atrasado" },
];

/** Textos prontos. Sem promessa de resultado, sem pressa inventada: dizem o que acontece e oferecem ajuda. */
export function textoDe(m: Modelo, loja: LojaContato, abriu: boolean) {
  const nome = (loja.dono_nome ?? "").trim().split(/\s+/)[0];
  const oi = `Oi${nome ? `, ${nome}` : ""}! Aqui é da Maestro Pet.`;
  if (m === "boas_vindas") return `${oi} Vi que você criou a conta do ${loja.nome} no Maestro Pet Gestão. Se quiser ajuda para cadastrar os primeiros clientes, os serviços ou montar a agenda, é só me responder aqui.`;
  if (m === "fim_teste") {
    const ate = dataCompleta(new Date(loja.teste_ate));
    return abriu
      ? `${oi} O teste do ${loja.nome} no Maestro Pet Gestão vai até ${ate}. Para continuar marcando e lançando depois disso, é preciso escolher um plano na tela Assinatura. Se não assinar, a conta fica só para consulta e o que você já cadastrou continua guardado. Se tiver alguma dúvida antes de decidir, me chama aqui.`
      : `${oi} O teste do ${loja.nome} no Maestro Pet Gestão vai até ${ate}. Como os planos ainda não abriram, você continua usando normalmente depois disso, sem pagar nada, e avisamos quando abrirem. Se tiver alguma dúvida, me chama aqui.`;
  }
  if (m === "sumido") return `${oi} Faz alguns dias que o ${loja.nome} não entra no Maestro Pet Gestão. Ficou alguma dúvida ou alguma coisa não funcionou como você esperava? Se quiser, me conta aqui que eu te ajudo.`;
  return `${oi} A última cobrança da assinatura do ${loja.nome} não foi confirmada pela Cakto. Às vezes é cartão vencido ou sem limite. Para conferir ou trocar a forma de pagamento, abra a tela Assinatura no sistema. Se você já pagou, me avisa aqui que eu confiro.`;
}

export function modeloSugerido(loja: LojaContato, sumido: boolean): Modelo {
  if (loja.status === "atrasada") return "atrasada";
  const resta = new Date(loja.teste_ate).getTime() - Date.now();
  if (loja.status === "teste" && resta > 0 && resta <= 3 * 864e5) return "fim_teste";
  if (sumido) return "sumido";
  return "boas_vindas";
}

export default function ContaAssinatura({ loja, sumido }: { loja: LojaContato; sumido: boolean }) {
  const [conta, setConta] = useState<Conta | null>(null);
  const [abriu, setAbriu] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [modelo, setModelo] = useState<Modelo>(() => modeloSugerido(loja, sumido));
  const [texto, setTexto] = useState("");

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [c, a] = await Promise.all([banco().rpc("admin_conta", { p_petshop: loja.id }), banco().rpc("gestao_assinatura")]);
        if (!vivo) return;
        setConta(ok(c) as unknown as Conta);
        setAbriu(Boolean((a.data as { aberta?: boolean } | null)?.aberta));
      } catch (e) {
        if (vivo) setErro(mensagemDeErro(e));
      }
    })();
    return () => { vivo = false; };
  }, [loja.id]);

  useEffect(() => { setTexto(textoDe(modelo, loja, abriu)); }, [modelo, loja, abriu]);

  const zap = linkWhatsApp(loja.telefone, texto);
  const assunto = MODELOS.find((m) => m.id === modelo)?.rotulo ?? "Maestro Pet";

  return (
    <div className="g-pilha">
      <div className="g-pilha p">
        <h3>Mensagem pronta</h3>
        <p className="g-pp g-muted">Escolha o motivo, confira o texto e envie pelo WhatsApp ou pelo e-mail. Nada é enviado sozinho.</p>
        <div className="g-chips" role="group" aria-label="Motivo da mensagem">
          {MODELOS.map((m) => <button key={m.id} className="g-chip" aria-pressed={modelo === m.id} onClick={() => setModelo(m.id)}>{m.rotulo}</button>)}
        </div>
        <textarea className="g-textarea" rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Texto da mensagem" />
        <div className="g-fila">
          {zap
            ? <a className="g-btn zap" href={zap} target="_blank" rel="noopener noreferrer"><MessageCircle /> Abrir no WhatsApp</a>
            : <span className="g-pp g-muted">Sem telefone do pet shop para o WhatsApp.</span>}
          {loja.dono_email && <a className="g-btn sec" href={`mailto:${loja.dono_email}?subject=${encodeURIComponent(`Maestro Pet Gestão: ${assunto.toLowerCase()}`)}&body=${encodeURIComponent(texto)}`}><Mail /> Mandar por e-mail</a>}
        </div>
        {loja.telefone && <p className="g-pp g-muted">WhatsApp para {fmtTelefone(loja.telefone)} (telefone cadastrado do pet shop).</p>}
      </div>

      <div className="g-pilha p">
        <h3>Assinatura e histórico</h3>
        {erro ? <p className="g-erro" role="alert">{erro}</p> : !conta ? <Esqueleto /> : (
          <>
            <dl className="g-card liso" style={{ display: "grid", gridTemplateColumns: "minmax(0, auto) minmax(0, 1fr)", gap: "8px 16px", margin: 0, fontSize: ".9375rem" }}>
              {([
                ["Período de cobrança", nomePeriodo(conta.periodo_meses)],
                ["Teste até", quando(conta.teste_ate)],
                ["Pago até", conta.pago_ate ? dataCompleta(new Date(conta.pago_ate)) : "nenhum pagamento registrado"],
                ["Assinante desde", conta.assinatura_desde ? dataCompleta(new Date(conta.assinatura_desde)) : "não assinou"],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} style={{ display: "contents" }}>
                  <dt className="g-muted">{k}</dt>
                  <dd style={{ margin: 0, fontWeight: 500, overflowWrap: "anywhere" }}>{v}</dd>
                </div>
              ))}
            </dl>
            {!conta.historico.length ? <p className="g-pp g-muted">Nenhuma troca de status nem aviso da Cakto registrado. A conta foi criada em {quando(conta.criado_em)}.</p> : (
              <div className="g-lista">
                {conta.historico.map((h, i) => (
                  <div key={i} className="g-linha">
                    <span className="t">
                      <b>{h.tipo === "status" ? `Status: ${STATUS[h.de ?? ""] ?? h.de ?? "?"} → ${STATUS[h.para ?? ""] ?? h.para}` : `Cakto: ${EVENTOS[h.evento ?? ""] ?? h.evento ?? "aviso sem nome"}`}</b>
                      <span className="g-tab">{quando(h.em)}</span>
                    </span>
                  </div>
                ))}
                <div className="g-linha"><span className="t"><b>Conta criada</b><span className="g-tab">{quando(conta.criado_em)}</span></span></div>
              </div>
            )}
            <p className="g-pp g-muted">As trocas de status passaram a ser registradas com esta versão do painel; antes disso só aparecem os avisos da Cakto.</p>
          </>
        )}
      </div>
    </div>
  );
}
