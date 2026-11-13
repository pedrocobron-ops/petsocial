"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { DIAS_SEMANA, diasEmOrdem, planoAtivo, type PetDoPlano, type PlanoCompleto } from "@/lib/gestao/creche";
import type { PetComTutor } from "@/lib/gestao/tipos";
import { brl, dataCompleta, isoDia } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import FormPet from "../form-pet";
import { AvatarPet, avisarMudanca, Campo, CampoValor, EscolherPet, Folha, ok, useAvisos } from "../ui";
import "./creche.css";

/** Quantos mensalistas (com plano que ainda vale) vêm em cada dia da semana. Índice = dia do banco (0 = domingo). */
export function mensalistasPorDia(planos: PlanoCompleto[], hoje: string, semPlano?: string): number[] {
  const n = [0, 0, 0, 0, 0, 0, 0];
  for (const p of planos) {
    if (p.id === semPlano || !planoAtivo(p, hoje) || (p.pets && !p.pets.ativo)) continue;
    for (const d of p.dias) n[d]++;
  }
  return n;
}

/**
 * Cadastrar, alterar ou encerrar o plano de um mensalista: dias fixos da semana, vencimento, começo e (para quem vê o financeiro)
 * a mensalidade e o preço do dia extra. Abre da tela Mensalistas e da ficha do pet.
 */
export default function FormPlano({ plano, pet: petInicial, planos, aoFechar, aoSalvo }: {
  plano?: PlanoCompleto; pet?: PetDoPlano | null; planos: PlanoCompleto[]; aoFechar: () => void; aoSalvo: () => void;
}) {
  const { sb, petshop, cuidoDoFinanceiro: vejoFinanceiro } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const hoje = isoDia(new Date());
  const [pet, setPet] = useState<PetDoPlano | null>(plano?.pets ?? petInicial ?? null);
  const [criando, setCriando] = useState<string | null>(null);
  const [dias, setDias] = useState<number[]>(plano?.dias ?? []);
  const [venceDia, setVenceDia] = useState(plano?.vence_dia ?? 5);
  const [inicio, setInicio] = useState(plano?.inicio ?? hoje);
  const [fim, setFim] = useState(plano?.fim ?? "");
  const [mensal, setMensal] = useState<number | null>(plano?.valor_mensal ?? null);
  const [extra, setExtra] = useState<number | null>(plano?.valor_extra ?? null);
  const [obs, setObs] = useState(plano?.obs ?? "");
  const [pausaDe, setPausaDe] = useState(plano?.pausa_de ?? "");
  const [pausaAte, setPausaAte] = useState(plano?.pausa_ate ?? "");
  const [comPausa, setComPausa] = useState(Boolean(plano?.pausa_de));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const diaria = petshop.diaria_creche == null ? null : Number(petshop.diaria_creche);
  const vagas = petshop.vagas_creche;
  const porDia = mensalistasPorDia(planos, hoje, plano?.id);
  const cheios = vagas == null ? [] : diasEmOrdem(dias).filter((d) => porDia[d] >= vagas);
  const outro = pet && !plano ? planos.find((p) => p.pet_id === pet.id && planoAtivo(p, hoje)) : undefined;

  const alternar = (d: number) => setDias((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]));

  async function salvar() {
    if (!pet || salvando) return;
    const falha = (m: string) => { setErro(m); avisarErro(m); };
    if (outro) return falha(`${pet.nome} já tem um plano. Altere o plano que já existe.`);
    if (!dias.length) return falha("Marque pelo menos um dia da semana.");
    if (!inicio) return falha("Escolha o dia em que o plano começa.");
    if (fim && fim < inicio) return falha("O fim do plano precisa ser depois do começo.");
    if (comPausa && (!pausaDe || !pausaAte || pausaAte < pausaDe)) return falha("Preencha o primeiro e o último dia da pausa.");
    if (vejoFinanceiro && mensal == null) return falha("Preencha o valor da mensalidade.");
    if ([mensal, extra].some((v) => v != null && (v < 0 || v > 99999))) return falha("Confira os valores.");
    setErro(null);
    setSalvando(true);
    try {
      const campos = { dias: diasEmOrdem(dias), vence_dia: venceDia, inicio, fim: fim || null, obs: obs.trim() || null, pausa_de: comPausa ? pausaDe : null, pausa_ate: comPausa ? pausaAte : null };
      let id = plano?.id;
      if (plano) ok(await sb.from("creche_planos").update(campos).eq("id", plano.id).eq("petshop_id", petshop.id).select("id").single());
      else id = ok(await sb.from("creche_planos").insert({ ...campos, petshop_id: petshop.id, pet_id: pet.id }).select("id").single()).id;
      if (vejoFinanceiro && mensal != null && id) {
        ok(await sb.from("creche_planos_valores").upsert({ plano_id: id, petshop_id: petshop.id, valor_mensal: mensal, valor_extra: extra, atualizado_em: new Date().toISOString() }).select("plano_id"));
      }
      avisar(plano ? "Plano salvo." : `${pet.nome} agora é mensalista da creche.`);
      avisarMudanca();
      aoSalvo();
    } catch (e) { avisarErro(e); } finally { setSalvando(false); }
  }

  async function encerrar() {
    if (!plano || !pet || salvando) return;
    const naoComecou = plano.inicio > hoje;
    if (!(await confirmar({
      titulo: naoComecou ? `Apagar o plano de ${pet.nome}?` : `Encerrar o plano de ${pet.nome}?`,
      texto: naoComecou ? "O plano ainda não começou: ele some da lista." : "Hoje é o último dia do plano. A chamada deixa de esperar o pet e as cobranças dos próximos meses não são geradas. O histórico fica guardado.",
      confirmar: naoComecou ? "Apagar o plano" : "Encerrar hoje", perigo: true,
    }))) return;
    setSalvando(true);
    try {
      if (naoComecou) ok(await sb.from("creche_planos").delete().eq("id", plano.id).eq("petshop_id", petshop.id).select("id"));
      else ok(await sb.from("creche_planos").update({ fim: hoje }).eq("id", plano.id).eq("petshop_id", petshop.id).select("id").single());
      avisar(naoComecou ? "Plano apagado." : `Plano de ${pet.nome} encerrado.`);
      avisarMudanca();
      aoSalvo();
    } catch (e) { avisarErro(e); } finally { setSalvando(false); }
  }

  if (criando !== null) {
    return <FormPet nomeInicial={criando} aoFechar={() => setCriando(null)} aoSalvar={(p) => { setPet({ ...p, ativo: true } as PetDoPlano); setCriando(null); avisarMudanca(); }} />;
  }
  if (!pet) {
    return (
      <Folha titulo="Quem vai ser mensalista?" aoFechar={aoFechar}>
        <EscolherPet aoEscolher={(p: PetComTutor) => setPet(p)} aoCriar={setCriando} autoFocus />
      </Folha>
    );
  }

  const encerrado = Boolean(plano?.fim && plano.fim < hoje);
  return (
    <Folha titulo={plano ? "Plano do mensalista" : "Novo mensalista"} aoFechar={aoFechar}
      rodape={<>
        <button className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button className="g-btn pri" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : plano ? "Salvar plano" : "Cadastrar mensalista"}</button>
      </>}>
      <div className="g-form">
        <div className="g-fila" style={{ flexWrap: "nowrap" }}>
          <AvatarPet pet={pet} />
          <div className="g-cresce"><b style={{ display: "block" }}>{pet.nome}</b><span className="g-muted g-p">{pet.clientes?.nome ?? "Sem tutor"}</span></div>
          {!plano && !petInicial && <button type="button" className="g-btn fantasma p" onClick={() => { setPet(null); setErro(null); }}>Trocar</button>}
        </div>
        {outro && <div className="g-aviso vermelho" role="alert" style={{ marginBottom: 0 }}><AlertTriangle /><span className="g-cresce"><b>{pet.nome} já é mensalista.</b> Abra o plano que já existe para alterar os dias ou o valor.</span></div>}

        <div className="g-campo">
          <span>Dias da semana em que vem</span>
          <div className="g-chips g-cm-dias" role="group" aria-label="Dias da semana">
            {DIAS_SEMANA.map((d) => (
              <button key={d.id} type="button" className="g-chip" aria-pressed={dias.includes(d.id)} onClick={() => alternar(d.id)} title={d.nome}>{d.curto}</button>
            ))}
          </div>
          <small>{dias.length ? `${dias.length === 1 ? "1 dia" : `${dias.length} dias`} por semana.` : "Toque nos dias fixos do pet."}{vagas != null && dias.length ? ` Mensalistas já nesses dias: ${diasEmOrdem(dias).map((d) => `${DIAS_SEMANA.find((x) => x.id === d)!.curto} ${porDia[d]} de ${vagas}`).join(", ")}.` : ""}</small>
        </div>
        {cheios.length > 0 && (
          <div className="g-aviso" role="status" style={{ marginBottom: 0 }}>
            <AlertTriangle /><span className="g-cresce">Casa cheia: {cheios.map((d) => `${DIAS_SEMANA.find((x) => x.id === d)!.nome} já tem ${porDia[d]} de ${vagas}`).join(", ")}. Dá para salvar mesmo assim.</span>
          </div>
        )}

        <div className="dupla">
          <Campo rotulo="Começa em"><input type="date" className="g-input" value={inicio} onChange={(e) => setInicio(e.target.value)} /></Campo>
          <Campo rotulo="Termina em" dica="Opcional"><input type="date" className="g-input" value={fim} min={inicio} onChange={(e) => setFim(e.target.value)} /></Campo>
        </div>
        <Campo rotulo="Dia do vencimento" dica="Todo mês, neste dia.">
          <select className="g-select" value={venceDia} onChange={(e) => setVenceDia(Number(e.target.value))}>
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>Dia {d}</option>)}
          </select>
        </Campo>

        {vejoFinanceiro ? (
          <div className="dupla">
            <Campo rotulo="Mensalidade"><CampoValor valor={mensal} aoMudar={setMensal} /></Campo>
            <Campo rotulo="Preço do dia extra" dica={diaria == null ? "Em branco, o dia extra entra na cobrança sem valor." : `Em branco, vale a diária da creche: ${brl(diaria)}.`}>
              <CampoValor valor={extra} aoMudar={setExtra} placeholder={diaria == null ? "0,00" : brl(diaria).replace("R$", "").trim()} />
            </Campo>
          </div>
        ) : (
          <p className="g-muted g-p">Os valores do plano ficam com quem cuida do financeiro.</p>
        )}
        {plano && (
          <div className="g-campo">
            <label className="g-check">
              <input type="checkbox" checked={comPausa} onChange={(e) => setComPausa(e.target.checked)} />
              <span>Pausar o plano por uns dias (viagem, doença)</span>
            </label>
            {comPausa && (
              <div className="dupla">
                <Campo rotulo="Primeiro dia da pausa"><input type="date" className="g-input" value={pausaDe} min={inicio} onChange={(e) => setPausaDe(e.target.value)} /></Campo>
                <Campo rotulo="Último dia da pausa"><input type="date" className="g-input" value={pausaAte} min={pausaDe || inicio} onChange={(e) => setPausaAte(e.target.value)} /></Campo>
              </div>
            )}
            <small>{comPausa ? "Na pausa o pet não entra na chamada, não leva falta e não ocupa vaga. A cobrança do mês sugere a mensalidade proporcional." : "Sem pausa marcada."}</small>
          </div>
        )}
        <Campo rotulo="Observações">
          <textarea className="g-textarea" value={obs} maxLength={600} onChange={(e) => setObs(e.target.value)} placeholder="Horário que costuma chegar, quem busca, combinados com o tutor…" />
        </Campo>
        {erro && <p className="g-erro" role="alert">{erro}</p>}
        {plano && !encerrado && (
          <div><button type="button" className="g-btn fantasma p g-vermelho-t" onClick={encerrar} disabled={salvando}>{plano.inicio > hoje ? "Apagar este plano" : "Encerrar o plano hoje"}</button></div>
        )}
        {plano?.fim && <p className="g-muted g-pp">{encerrado ? `Plano encerrado em ${dataCompleta(plano.fim)}.` : `O plano vale até ${dataCompleta(plano.fim)}.`}{encerrado ? " Para o pet voltar, cadastre um plano novo." : ""}</p>}
      </div>
    </Folha>
  );
}
