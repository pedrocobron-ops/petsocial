"use client";

import { useState } from "react";
import { CircleCheck, History, Trash2, Undo2 } from "lucide-react";
import { useGestao } from "@/components/gestao/contexto";
import { Tile } from "@/components/gestao/painel";
import { Campo, Folha, ok, useAvisos, useDados } from "@/components/gestao/ui";
import { dataCompleta, hora, semAcento } from "@/lib/gestao/util";
import "./lgpd.css";

/** Prazo entre o pedido e a exclusão de verdade (o mesmo do banco, conta_exclusao_pedir). */
export const DIAS_PARA_APAGAR = 30;
const igual = (a: string, b: string) => semAcento(a.replace(/\s+/g, " ").trim()) === semAcento(b.replace(/\s+/g, " ").trim());

/**
 * "Encerrar e apagar a conta" (Meu pet shop). O titular digita o nome do pet shop e a conta fica marcada para ser apagada em
 * 30 dias; até lá fica só para consulta (dá para baixar os dados) e qualquer dono cancela. Passado o prazo, a faxina diária
 * apaga o pet shop, os arquivos e os logins que não estão em outro pet shop. O aviso é aqui mesmo, sem e-mail.
 */
export default function EncerrarConta() {
  const { sb, petshop, exclusao, souTitular, recarregarBase } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const [abrindo, setAbrindo] = useState(false);
  const [indo, setIndo] = useState(false);

  async function cancelar() {
    if (indo) return;
    if (!(await confirmar({ titulo: "Cancelar a exclusão da conta?", texto: "A conta volta ao normal agora: a equipe volta a lançar e o link volta a receber pedidos.", confirmar: "Cancelar a exclusão" }))) return;
    setIndo(true);
    try {
      ok(await sb.rpc("conta_exclusao_cancelar", { p_petshop: petshop.id }));
      await recarregarBase();
      avisar("Exclusão cancelada. A conta voltou ao normal.");
    } catch (e) { avisarErro(e); } finally { setIndo(false); }
  }

  return (
    <section className="g-card gl-cartao" id="encerrar-conta">
      <div className="g-card-t"><h3><Tile icone={Trash2} tom="rosa" tamanho="p" />Encerrar e apagar a conta</h3></div>
      {exclusao ? (
        <div className="g-pilha p">
          <div className="gl-marcada" role="status">
            <CircleCheck aria-hidden />
            <div>
              <b>Pedido registrado. A conta vai ser apagada em {dataCompleta(exclusao.apagar_em)}.</b>
              <p className="g-pp">Pedido em {dataCompleta(exclusao.pedido_em)} às {hora(exclusao.pedido_em)}{exclusao.pedido_nome ? `, por ${exclusao.pedido_nome}` : ""}. Até lá, a conta fica só para consulta: baixe todos os dados no cartão Baixar todos os dados.</p>
            </div>
          </div>
          <div><button type="button" className="g-btn verde" onClick={() => void cancelar()} disabled={indo}><Undo2 />{indo ? "Cancelando…" : "Cancelar a exclusão"}</button></div>
          <p className="g-pp g-muted">Mudou de ideia? Cancele até o dia {dataCompleta(exclusao.apagar_em)} e tudo continua como estava.</p>
        </div>
      ) : (
        <div className="g-pilha p">
          <p className="g-muted g-p">Para fechar o pet shop no Maestro e apagar os dados. Veja o que acontece:</p>
          <ol className="gl-passos">
            <li><b>Antes, baixe todos os dados</b> no cartão Baixar todos os dados. Depois de apagada, a conta não volta.</li>
            <li>Por {DIAS_PARA_APAGAR} dias a conta fica <b>só para consulta</b>: ninguém da equipe lança nada e o link de agendamento para de receber pedidos.</li>
            <li>Dentro desses {DIAS_PARA_APAGAR} dias, dá para <b>cancelar</b> aqui mesmo, e tudo volta como estava.</li>
            <li>Depois, <b>apagamos tudo</b>: clientes, pets, agenda, financeiro, estoque, fotos e arquivos, e os logins da equipe que não estão em outro pet shop.</li>
            <li>A assinatura <b>não</b> é cancelada por aqui. Se você paga, cancele também na tela Assinatura.</li>
          </ol>
          <p className="g-pp g-muted">Registros que a lei manda guardar (pagamentos da assinatura e aceites dos termos) ficam pelo prazo da lei. As cópias de segurança automáticas do banco são substituídas no ciclo do fornecedor.</p>
          {souTitular
            ? <div><button type="button" className="g-btn perigo" onClick={() => setAbrindo(true)}><Trash2 />Encerrar e apagar a conta</button></div>
            : <p className="g-pp g-muted">Só o titular da conta (quem criou o pet shop) pode pedir para apagar.</p>}
        </div>
      )}
      {abrindo && <FolhaEncerrar aoFechar={() => setAbrindo(false)} />}
    </section>
  );
}

function FolhaEncerrar({ aoFechar }: { aoFechar: () => void }) {
  const { sb, petshop, recarregarBase } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const [nome, setNome] = useState("");
  const [indo, setIndo] = useState(false);
  const certo = igual(nome, petshop.nome);

  async function pedir() {
    if (!certo || indo) return;
    setIndo(true);
    try {
      ok(await sb.rpc("conta_exclusao_pedir", { p_petshop: petshop.id, p_nome: nome }));
      await recarregarBase();
      avisar("Pedido registrado. A conta fica só para consulta até a data.");
      aoFechar();
    } catch (e) { avisarErro(e); setIndo(false); }
  }

  return (
    <Folha titulo="Encerrar e apagar a conta" aoFechar={aoFechar}
      rodape={<>
        <button type="button" className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button type="button" className="g-btn perigo" onClick={() => void pedir()} disabled={!certo || indo}><Trash2 />{indo ? "Registrando…" : `Apagar em ${DIAS_PARA_APAGAR} dias`}</button>
      </>}>
      <form className="g-pilha" onSubmit={(e) => { e.preventDefault(); void pedir(); }}>
        <p className="g-p">
          A conta de <b>{petshop.nome}</b> fica só para consulta agora e será apagada em {DIAS_PARA_APAGAR} dias, com todos os clientes, pets, agenda,
          financeiro, estoque, fotos e arquivos. Até lá, dá para cancelar em Meu pet shop.
        </p>
        <Campo rotulo={`Para confirmar, digite o nome do pet shop: ${petshop.nome}`}>
          <input className="g-input" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} aria-label="Nome do pet shop" />
        </Campo>
      </form>
    </Folha>
  );
}

type Registro = { acao: string; quem: string | null; quando: string; detalhe: Record<string, unknown>; protocolo?: string | null; cliente?: string | null };
const ACAO: Record<string, string> = {
  baixou_dados: "Baixou todos os dados", baixou_tutor: "Baixou os dados de um tutor", apagou_tutor: "Apagou os dados de um tutor",
  pediu_exclusao: "Pediu para apagar a conta", cancelou_exclusao: "Cancelou a exclusão da conta", saiu_da_equipe: "Saiu da equipe",
};

/** O que foi pedido de dados neste pet shop (baixar, apagar tutor, encerrar a conta, sair da equipe): quem e quando. */
export function RegistroDeDados() {
  const { sb, petshop } = useGestao();
  const { dados, erro } = useDados(async () => (ok(await sb.rpc("lgpd_registros_ver", { p_petshop: petshop.id })) as unknown as Registro[]) ?? [], [petshop.id]);
  return (
    <section className="g-card gl-cartao">
      <div className="g-card-t"><h3><Tile icone={History} tom="lilas" tamanho="p" />Registro de pedidos de dados</h3></div>
      <p className="g-muted g-pp">Fica anotado quem baixou ou apagou dados, de qual cliente e quando, com um protocolo para você dar ao cliente e mostrar, se precisar, que atendeu o pedido. Depois de apagar, o cliente aparece só como &quot;Cliente removido&quot;.</p>
      {erro ? <p className="g-erro">{erro}</p> : !dados ? <p className="g-muted g-pp">Carregando…</p> : !dados.length ? <p className="g-muted g-pp">Nada ainda.</p> : (
        <ul className="gl-registro">
          {dados.slice(0, 10).map((r, i) => (
            <li key={i}>
              <b>{ACAO[r.acao] ?? r.acao}{r.cliente ? `: ${r.cliente}` : ""}</b>
              <span>{dataCompleta(r.quando)} às {hora(r.quando)}{r.quem ? ` · ${r.quem}` : ""}</span>
              {r.protocolo && <span className="gl-protocolo">Protocolo <b className="g-tab">{r.protocolo}</b></span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
