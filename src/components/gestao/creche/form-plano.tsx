"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  abreNoDia, DIAS_SEMANA, diasEmOrdem, isoMes, planoAtivo, podeMudarPlano, proporcionalDesde, vencimentoDoMes,
  type PetDoPlano, type PlanoCompleto, type PrimeiraCobranca,
} from "@/lib/gestao/creche";
import type { PetComTutor } from "@/lib/gestao/tipos";
import { brl, dataCompleta, dataCurta, isoDia, nomeMes, somaDias } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import FormPet from "../form-pet";
import { AvatarPet, avisarMudanca, Campo, CampoValor, EscolherPet, Folha, ok, useAvisos, useDados } from "../ui";
import { lerModelos, type ModeloDePlano } from "./modelos";
import "./creche.css";
import "@/components/gestao/hotel/hotel.css";

/** Quantos mensalistas (com plano que ainda vale) vêm em cada dia da semana. Índice = dia do banco (0 = domingo). */
export function mensalistasPorDia(planos: PlanoCompleto[], hoje: string, semPlano?: string): number[] {
  const n = [0, 0, 0, 0, 0, 0, 0];
  for (const p of planos) {
    if (p.id === semPlano || !planoAtivo(p, hoje) || (p.pets && !p.pets.ativo)) continue;
    for (const d of p.dias) n[d]++;
  }
  return n;
}

/** Um dia qualquer que caia nesse dia da semana (para conferir o horário do pet shop). */
const umDia = (dow: number) => isoDia(somaDias(new Date(2024, 0, 7), dow));

/**
 * Cadastrar, alterar ou encerrar o plano de um mensalista: dias fixos da semana, vencimento, começo e (para quem cuida do financeiro)
 * a mensalidade e o preço do dia extra. Abre da tela Mensalistas e da ficha do pet.
 * Só o dono e quem cuida do financeiro mexem no plano (a equipe, se o dono liberou em Meu pet shop): o banco confere.
 * Quando o mês já começou, quem recebe escolhe como fica a primeira cobrança: nada vem marcado e nenhuma cobrança nasce vencida sozinha.
 */
export default function FormPlano({ plano, pet: petInicial, planos, aoFechar, aoSalvo }: {
  plano?: PlanoCompleto; pet?: PetDoPlano | null; planos: PlanoCompleto[]; aoFechar: () => void; aoSalvo: () => void;
}) {
  const { sb, petshop, cuidoDoFinanceiro: vejoFinanceiro, souDono } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const agora = new Date(), hoje = isoDia(agora);
  const pode = podeMudarPlano({ petshop, souDono, cuidoDoFinanceiro: vejoFinanceiro });
  const [pet, setPet] = useState<PetDoPlano | null>(plano?.pets ?? petInicial ?? null);
  const [criando, setCriando] = useState<string | null>(null);
  const [dias, setDias] = useState<number[]>(plano?.dias ?? []);
  const [venceDia, setVenceDia] = useState(plano?.vence_dia ?? 5);
  const [inicio, setInicio] = useState(plano?.inicio ?? hoje);
  const [fim, setFim] = useState(plano?.fim ?? "");
  const [mensal, setMensal] = useState<number | null>(plano?.valor_mensal ?? null);
  const [extra, setExtra] = useState<number | null>(plano?.valor_extra ?? null);
  const [modeloId, setModeloId] = useState<string | null>(plano?.modelo_id ?? null);
  const [obs, setObs] = useState(plano?.obs ?? "");
  const [pausaDe, setPausaDe] = useState(plano?.pausa_de ?? "");
  const [pausaAte, setPausaAte] = useState(plano?.pausa_ate ?? "");
  const [comPausa, setComPausa] = useState(Boolean(plano?.pausa_de));
  const [primeira, setPrimeira] = useState<PrimeiraCobranca | null>(null);
  const [vencPrimeira, setVencPrimeira] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // modelos de plano (2x, 3x, 5x por semana com preço) e se este plano já teve alguma cobrança: só para quem cuida do financeiro
  const { dados: apoio } = useDados(async () => {
    if (!vejoFinanceiro) return { modelos: [] as ModeloDePlano[], jaCobrou: false };
    const [modelos, cobrancas] = await Promise.all([
      lerModelos(sb, petshop.id).catch(() => [] as ModeloDePlano[]),
      plano ? sb.from("creche_cobrancas").select("id", { count: "exact", head: true }).eq("plano_id", plano.id) : Promise.resolve({ count: 0 }),
    ]);
    return { modelos: modelos.filter((m) => m.ativo), jaCobrou: (cobrancas.count ?? 0) > 0 };
  }, [petshop.id, plano?.id, vejoFinanceiro]);
  const modelos = apoio?.modelos ?? [];

  const diaria = petshop.diaria_creche == null ? null : Number(petshop.diaria_creche);
  const vagas = petshop.vagas_creche;
  const porDia = mensalistasPorDia(planos, hoje, plano?.id);
  const cheios = vagas == null ? [] : diasEmOrdem(dias).filter((d) => porDia[d] >= vagas);
  const fechados = diasEmOrdem(dias).filter((d) => !abreNoDia(petshop.horario, umDia(d)));
  const outro = pet && !plano ? planos.find((p) => p.pet_id === pet.id && planoAtivo(p, hoje)) : undefined;

  const limpar = () => setErro(null);
  const alternar = (d: number) => { setDias((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d])); limpar(); };
  function usarModelo(m: ModeloDePlano) {
    if (modeloId === m.id) { setModeloId(null); return; }
    setModeloId(m.id); setMensal(Number(m.valor_mensal)); setExtra(m.valor_extra == null ? null : Number(m.valor_extra)); limpar();
  }

  // a primeira cobrança: só quando o plano já cobraria o mês corrente, ainda não teve cobrança e ninguém escolheu
  const mesAtual = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const fimDoMes = isoDia(new Date(agora.getFullYear(), agora.getMonth() + 1, 0));
  const proximoMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 1);
  const perguntaPrimeira = vejoFinanceiro && Boolean(apoio) && !apoio!.jaCobrou && !plano?.primeira_cobranca && Boolean(inicio) && inicio <= fimDoMes && (!fim || fim >= isoMes(mesAtual));
  const vigencia = { inicio, fim: fim || null, dias, pausa_de: comPausa ? pausaDe || null : null, pausa_ate: comPausa ? pausaAte || null : null };
  const desde = inicio > hoje ? inicio : hoje;
  const prop = mensal != null && dias.length ? proporcionalDesde(vigencia, mesAtual, mensal, petshop.horario, desde) : null;
  const vencPadrao = (() => { const v = inicio ? vencimentoDoMes({ inicio, vence_dia: venceDia }, mesAtual) : hoje; return v < hoje ? hoje : v; })();
  const vencDaPrimeira = vencPrimeira || vencPadrao;

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
    if (perguntaPrimeira && !primeira) return falha("Escolha como fica a primeira cobrança.");
    if (perguntaPrimeira && primeira === "proporcional" && !(prop && prop.restam > 0)) return falha("Não há mais dias do plano neste mês. Escolha outra opção para a primeira cobrança.");
    if (perguntaPrimeira && primeira !== "fora" && vencDaPrimeira < hoje) return falha("O vencimento da primeira cobrança não pode ser antes de hoje.");
    setErro(null);
    setSalvando(true);
    try {
      const campos = {
        dias: diasEmOrdem(dias), vence_dia: venceDia, inicio, fim: fim || null, obs: obs.trim() || null, pausa_de: comPausa ? pausaDe : null, pausa_ate: comPausa ? pausaAte : null,
        ...(perguntaPrimeira && primeira ? { primeira_cobranca: isoMes(primeira === "fora" ? proximoMes : mesAtual) } : {}),
      };
      let id = plano?.id;
      if (plano) ok(await sb.from("creche_planos").update(campos).eq("id", plano.id).eq("petshop_id", petshop.id).select("id").single());
      else id = ok(await sb.from("creche_planos").insert({ ...campos, petshop_id: petshop.id, pet_id: pet.id }).select("id").single()).id;
      if (vejoFinanceiro && mensal != null && id) {
        const modelo = modelos.find((m) => m.id === modeloId && Number(m.valor_mensal) === mensal) ? modeloId : null;
        ok(await sb.from("creche_planos_valores").upsert({ plano_id: id, petshop_id: petshop.id, valor_mensal: mensal, valor_extra: extra, modelo_id: modelo, atualizado_em: new Date().toISOString() }).select("plano_id"));
      }
      let cobrou = "";
      if (perguntaPrimeira && id && mensal != null && (primeira === "proporcional" || primeira === "inteiro")) {
        const valor = primeira === "proporcional" ? prop!.valor : mensal;
        const r = await sb.rpc("creche_cobranca_criar", { p_plano: id, p_mes: isoMes(mesAtual), p_valor: valor, p_vencimento: vencDaPrimeira });
        if (r.error) avisarErro(`O plano foi salvo, mas a primeira cobrança não foi criada (${r.error.message}). Gere em Cobranças.`);
        else cobrou = ` A cobrança de ${nomeMes(mesAtual)} (${brl(valor)}) vence em ${dataCurta(vencDaPrimeira)}.`;
      } else if (perguntaPrimeira && primeira === "fora") cobrou = ` A primeira cobrança é a de ${nomeMes(proximoMes)}.`;
      avisar((plano ? "Plano salvo." : `${pet.nome} agora é mensalista da creche.`) + cobrou);
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

  if (!pode) {
    return (
      <Folha titulo="Plano do mensalista" aoFechar={aoFechar} rodape={<button className="g-btn sec" onClick={aoFechar}>Fechar</button>}>
        <p className="g-p">Só o dono ou quem cuida do financeiro cadastra, muda, pausa ou encerra o plano de um mensalista, porque o plano decide o que é cobrado. Fale com quem cuida do financeiro.</p>
      </Folha>
    );
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
  const nomeDoDia = (d: number) => DIAS_SEMANA.find((x) => x.id === d)!.nome;
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
        {fechados.length > 0 && (
          <div className="g-aviso" role="status" style={{ marginBottom: 0 }}>
            <AlertTriangle /><span className="g-cresce">Pelo horário de Meu pet shop, vocês não abrem {fechados.length === 1 ? `no dia marcado (${nomeDoDia(fechados[0])})` : `em ${fechados.map(nomeDoDia).join(" e ")}`}. Dia fechado não entra na chamada nem na conta da mensalidade: desmarque, ou abra esse dia em Meu pet shop.</span>
          </div>
        )}
        {cheios.length > 0 && (
          <div className="g-aviso" role="status" style={{ marginBottom: 0 }}>
            <AlertTriangle /><span className="g-cresce">Casa cheia: {cheios.map((d) => `${nomeDoDia(d)} já tem ${porDia[d]} de ${vagas}`).join(", ")}. Dá para salvar mesmo assim.</span>
          </div>
        )}

        <div className="dupla">
          <Campo rotulo="Começa em"><input type="date" className="g-input" value={inicio} onChange={(e) => { setInicio(e.target.value); limpar(); }} /></Campo>
          <Campo rotulo="Termina em (opcional)"><input type="date" className="g-input" value={fim} min={inicio} onChange={(e) => { setFim(e.target.value); limpar(); }} /></Campo>
        </div>
        <Campo rotulo="Dia do vencimento" dica="Todo mês, neste dia.">
          <select className="g-select" value={venceDia} onChange={(e) => setVenceDia(Number(e.target.value))}>
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>Dia {d}</option>)}
          </select>
        </Campo>

        {vejoFinanceiro ? (
          <>
            {modelos.length > 0 && (
              <div className="g-campo">
                <span>Modelo de plano</span>
                <div className="g-chips" role="group" aria-label="Modelo de plano">
                  {[...modelos].sort((a, b) => Number(b.vezes === dias.length) - Number(a.vezes === dias.length)).map((m) => (
                    <button key={m.id} type="button" className="g-chip" aria-pressed={modeloId === m.id} onClick={() => usarModelo(m)}>{m.nome} · {brl(m.valor_mensal)}</button>
                  ))}
                </div>
                <small>Toque num modelo para preencher os valores. Dá para mudar depois, só para este pet.</small>
              </div>
            )}
            <div className="dupla">
              <Campo rotulo="Mensalidade"><CampoValor valor={mensal} aoMudar={(v) => { setMensal(v); limpar(); }} /></Campo>
              <Campo rotulo="Preço do dia extra" dica={diaria == null ? "Em branco, o dia extra entra na cobrança sem valor." : `Em branco, vale a diária da creche: ${brl(diaria)}.`}>
                <CampoValor valor={extra} aoMudar={setExtra} placeholder={diaria == null ? "0,00" : brl(diaria).replace("R$", "").trim()} />
              </Campo>
            </div>
            {perguntaPrimeira && (
              <div className={`g-ht-atraso${primeira ? " ok" : ""}`} role="radiogroup" aria-label="Primeira cobrança">
                <p><b>Primeira cobrança.</b> {nomeMes(mesAtual)[0].toUpperCase() + nomeMes(mesAtual).slice(1)} já começou. Como fica a mensalidade deste mês?</p>
                <label className="g-check"><input type="radio" name="primeira" checked={primeira === "fora"} onChange={() => { setPrimeira("fora"); limpar(); }} />
                  <span>Este mês já foi pago por fora: a primeira cobrança é a de {nomeMes(proximoMes)}</span></label>
                <label className="g-check"><input type="radio" name="primeira" checked={primeira === "proporcional"} disabled={Boolean(prop && prop.restam === 0)} onChange={() => { setPrimeira("proporcional"); limpar(); }} />
                  <span>Cobrar este mês, proporcional {desde === hoje ? "a partir de hoje" : `a partir de ${dataCurta(desde)}`}{prop ? (prop.restam > 0 ? `: ${brl(prop.valor)} (${prop.restam} de ${prop.todos} dias do plano no mês)` : " (não há mais dias do plano neste mês)") : ""}</span></label>
                <label className="g-check"><input type="radio" name="primeira" checked={primeira === "inteiro"} onChange={() => { setPrimeira("inteiro"); limpar(); }} />
                  <span>Cobrar o mês inteiro{mensal != null ? `: ${brl(mensal)}` : ""}</span></label>
                {(primeira === "proporcional" || primeira === "inteiro") && (
                  <Campo rotulo="Vencimento desta primeira cobrança" dica="As próximas vencem no dia combinado acima.">
                    <input type="date" className="g-input" value={vencDaPrimeira} min={hoje} onChange={(e) => { setVencPrimeira(e.target.value); limpar(); }} />
                  </Campo>
                )}
                <p className="g-pp">{primeira === "fora" ? `Nada é cobrado em ${nomeMes(mesAtual)} por aqui. Em ${nomeMes(proximoMes)} a cobrança é gerada como as outras.`
                  : primeira ? "A cobrança é criada agora, em Cobranças e em A receber, com esse vencimento."
                  : "Nada vem marcado: sem a sua escolha, nenhuma cobrança é criada."}</p>
              </div>
            )}
          </>
        ) : (
          <p className="g-muted g-p">Os valores do plano ficam com quem cuida do financeiro: sem o valor, a cobrança do mês não é gerada. Quem cuida do financeiro é avisado na tela Hoje.</p>
        )}
        {plano && (
          <div className="g-campo">
            <label className="g-check">
              <input type="checkbox" checked={comPausa} onChange={(e) => setComPausa(e.target.checked)} />
              <span>Pausar o plano por uns dias (viagem, doença)</span>
            </label>
            {comPausa && (
              <div className="dupla">
                <Campo rotulo="Primeiro dia da pausa"><input type="date" className="g-input" value={pausaDe} min={inicio} onChange={(e) => { setPausaDe(e.target.value); limpar(); }} /></Campo>
                <Campo rotulo="Último dia da pausa"><input type="date" className="g-input" value={pausaAte} min={pausaDe || inicio} onChange={(e) => { setPausaAte(e.target.value); limpar(); }} /></Campo>
              </div>
            )}
            <small>{comPausa ? "Na pausa o pet não entra na chamada, não leva falta e não ocupa vaga. A cobrança do mês sugere a mensalidade proporcional. Cobrança que já foi gerada não muda sozinha: se combinou desconto, altere em Cobranças." : "Sem pausa marcada."}</small>
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
