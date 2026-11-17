"use client";

import { useState } from "react";
import { Copy, MessageCircle, Pencil, Percent, Plus, Trash2 } from "lucide-react";
import {
  COLS_PROMOCAO, ORDEM_SEMANA, lerPromocao, valeNoBanho, type CasaPromo, resumoDaPromo, situacaoDaPromo, textoDaPromocao, validadePorExtenso, type Promocao, type TipoPromo,
} from "@/lib/gestao/promocoes";
import { areaDoServico, usaModulo } from "@/lib/gestao/modulos";
import { brlCurto, isoDia } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { CampoDinheiro } from "../loja/pecas";
import { Campo, Folha, avisarMudanca, useAvisos, useDados, useSomenteLeitura } from "../ui";
import "../agenda/promo.css";

/**
 * Promoções em dias fracos (Meu pet shop, só o dono): "Terça e quarta, 10% no banho", "antes das 11h, R$ 10 off",
 * "Segunda tem 15% na diária da creche". Vale no banho e tosa, na diária da creche e/ou na diária do hotel (no hotel, nas
 * noites que caem nos dias escolhidos). O link do cliente mostra o desconto; ao marcar, o horário ou a reserva já vem com a
 * promoção (a equipe pode tirar).
 * Nada é enviado sozinho: "Copiar o texto" e "Abrir no WhatsApp" deixam a mensagem pronta para o dono mandar ou postar.
 */

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
type Rascunho = Omit<Promocao, "id" | "valor"> & { id: string | null; valor: number | null; faixa: boolean };
const ONDE: { id: "banho" | CasaPromo; rotulo: string }[] = [{ id: "banho", rotulo: "Banho e tosa" }, { id: "creche", rotulo: "Creche (diária)" }, { id: "hotel", rotulo: "Hotel (diária)" }];

const SITUACAO: Record<ReturnType<typeof situacaoDaPromo>, { texto: string; tom: string }> = {
  valendo: { texto: "valendo", tom: "verde" },
  "ainda-nao": { texto: "ainda vai começar", tom: "azul" },
  acabou: { texto: "já acabou", tom: "" },
  desligada: { texto: "desligada", tom: "" },
};

export default function Promocoes() {
  const { sb, petshop, souDono, servicos } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [editando, setEditando] = useState<Rascunho | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const { dados, recarregar } = useDados(async () => {
    const r = await sb.from("promocoes").select(COLS_PROMOCAO).eq("petshop_id", petshop.id).order("criado_em");
    if (r.error) return null; // banco antes da atualização: o cartão fica escondido
    return (r.data ?? []).map((x) => lerPromocao(x as unknown as Record<string, unknown>));
  }, [petshop.id]);
  if (!souDono || dados === null) return null;
  const lista = dados ?? [];
  const nomeDe = (id: string) => servicos.find((s) => s.id === id)?.nome;
  const hoje = isoDia(new Date());

  const rpc = sb as unknown as { rpc: (f: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };
  async function gravar(id: string | null, p: Omit<Promocao, "id" | "criado_em">) {
    const r = await rpc.rpc("promocao_salvar", { p: petshop.id, p_id: id, p_dados: p });
    if (r.error) throw new Error(r.error.message);
  }
  async function ligar(p: Promocao, ativa: boolean) {
    if (somenteLeitura() || ocupado) return;
    setOcupado(true);
    try { await gravar(p.id, { ...p, ativa }); avisar(ativa ? `${p.nome} ligada.` : `${p.nome} desligada. Os horários já marcados continuam com ela.`); await recarregar(); avisarMudanca(); }
    catch (e) { avisarErro(e); } finally { setOcupado(false); }
  }
  async function apagar(p: Promocao) {
    if (somenteLeitura() || ocupado) return;
    if (!(await confirmar({ titulo: `Apagar a promoção ${p.nome}?`, texto: "Ela some do link e dos horários novos. Os horários já marcados continuam com ela, e o relatório guarda o que já foi dado de desconto.", confirmar: "Apagar", perigo: true }))) return;
    setOcupado(true);
    try {
      const r = await rpc.rpc("promocao_apagar", { p: petshop.id, p_id: p.id });
      if (r.error) throw new Error(r.error.message);
      avisar("Promoção apagada."); await recarregar(); avisarMudanca();
    } catch (e) { avisarErro(e); } finally { setOcupado(false); }
  }
  async function copiar(p: Promocao) {
    const texto = textoDaPromocao(p, petshop.nome, nomeDe);
    try { await navigator.clipboard.writeText(texto); avisar("Texto copiado. É só colar no WhatsApp ou nas redes."); }
    catch { avisarErro(`Não consegui copiar. O texto é: ${texto}`); }
  }
  // quem não tem banho e tosa começa pela creche (ou pelo hotel)
  const comBanho = usaModulo(petshop, "banho_tosa") || (!usaModulo(petshop, "creche") && !usaModulo(petshop, "hotel"));
  const nova = (): Rascunho => ({ id: null, nome: "", dias: [2], hora_de: null, hora_ate: null, faixa: false, servicos: [], tipo: "pct", valor: 10, comeca_em: null, termina_em: null, ativa: true,
    banho_tosa: comBanho, casa: comBanho ? [] : [usaModulo(petshop, "creche") ? "creche" : "hotel"] });

  return (
    <section className="g-card g-pilha" id="promocoes">
      <div className="g-mp-t">
        <Tile icone={Percent} tom="menta" />
        <div>
          <h2>Promoções em dias fracos</h2>
          <p className="g-muted g-p">Um desconto nos dias e horários com menos movimento, no banho e tosa{usaModulo(petshop, "creche") || usaModulo(petshop, "hotel") ? ", na creche ou no hotel" : ""}. O link do cliente mostra o desconto, e o que for marcado já vem com a promoção.</p>
        </div>
      </div>
      {!lista.length ? <p className="g-muted g-p">Nenhuma promoção ainda. Exemplo: terça e quarta, 10% no banho.</p> : (
        <div className="g-lista">
          {lista.map((p) => {
            const sit = SITUACAO[situacaoDaPromo(p, hoje)];
            const validade = validadePorExtenso(p);
            return (
              <div key={p.id} className="g-promo-item">
                <div className="t">
                  <b>{p.nome} <span className={`g-tag ${sit.tom}`}>{sit.texto}</span></b>
                  <span>{resumoDaPromo(p, nomeDe)}{validade ? ` Vale ${validade}.` : ""}</span>
                </div>
                <div className="g-promo-acoes">
                  <button type="button" className="g-btn sec p" onClick={() => void copiar(p)}><Copy />Copiar o texto</button>
                  <a className="g-btn sec p" href={`https://wa.me/?text=${encodeURIComponent(textoDaPromocao(p, petshop.nome, nomeDe))}`} target="_blank" rel="noopener noreferrer"><MessageCircle />Abrir no WhatsApp</a>
                  <button type="button" className="g-btn fantasma p" disabled={ocupado} onClick={() => { if (!somenteLeitura()) setEditando({ ...p, faixa: Boolean(p.hora_de || p.hora_ate) }); }}><Pencil />Mudar</button>
                  <button type="button" className="g-btn fantasma p" disabled={ocupado} onClick={() => void ligar(p, !p.ativa)}>{p.ativa ? "Desligar" : "Ligar"}</button>
                  <button type="button" className="g-ico" disabled={ocupado} aria-label={`Apagar a promoção ${p.nome}`} onClick={() => void apagar(p)}><Trash2 /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div><button type="button" className="g-btn verde p" onClick={() => { if (!somenteLeitura()) setEditando(nova()); }}><Plus />Nova promoção</button></div>
      <p className="g-pp g-muted">Mudar ou apagar uma promoção não mexe nos horários já marcados. O texto pronto só diz o que está aqui (dias, horas e até quando vale).</p>
      {editando && <FormPromocao inicial={editando} aoFechar={() => setEditando(null)} aoSalvar={async (r) => {
        const banho = valeNoBanho(r);
        await gravar(r.id, { nome: r.nome.trim(), dias: r.dias, hora_de: banho && r.faixa ? r.hora_de : null, hora_ate: banho && r.faixa ? r.hora_ate : null, servicos: banho ? r.servicos : [],
          tipo: r.tipo, valor: r.valor ?? 0, comeca_em: r.comeca_em || null, termina_em: r.termina_em || null, ativa: r.ativa, banho_tosa: banho, casa: r.casa ?? [] });
        avisar(r.id ? "Promoção atualizada." : "Promoção criada. Ela já aparece no link e nos horários novos.");
        setEditando(null); await recarregar(); avisarMudanca();
      }} />}
    </section>
  );
}

function FormPromocao({ inicial, aoFechar, aoSalvar }: { inicial: Rascunho; aoFechar: () => void; aoSalvar: (r: Rascunho) => Promise<void> }) {
  const { servicos, petshop } = useGestao();
  const { avisarErro } = useAvisos();
  const [r, setR] = useState<Rascunho>(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const mudar = (m: Partial<Rascunho>) => { setR((x) => ({ ...x, ...m })); setErro(null); };
  // só os serviços da agenda (banho e tosa): creche e hotel têm o preço deles
  const doBanho = servicos.filter((s) => (s.ativo || r.servicos.includes(s.id)) && areaDoServico(s.categoria) === "banho_tosa");
  const alternarDia = (d: number) => mudar({ dias: r.dias.includes(d) ? r.dias.filter((x) => x !== d) : [...r.dias, d] });
  const alternarServico = (id: string) => mudar({ servicos: r.servicos.includes(id) ? r.servicos.filter((x) => x !== id) : [...r.servicos, id] });
  const banho = valeNoBanho(r), casa = r.casa ?? [];
  // só o que o pet shop usa (o que já estava marcado aparece mesmo que a área tenha sido desligada)
  const onde = ONDE.filter((o) => (o.id === "banho" ? usaModulo(petshop, "banho_tosa") || banho : usaModulo(petshop, o.id) || casa.includes(o.id)));
  const ondeMarcado = (id: "banho" | CasaPromo) => (id === "banho" ? banho : casa.includes(id));
  const alternarOnde = (id: "banho" | CasaPromo) => (id === "banho" ? mudar({ banho_tosa: !banho }) : mudar({ casa: casa.includes(id) ? casa.filter((x) => x !== id) : [...casa, id] }));

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (r.nome.trim().length < 2) return setErro("Dê um nome à promoção. É o nome que o cliente vê, como Terça do banho.");
    if (!r.dias.length) return setErro("Escolha pelo menos um dia da semana.");
    if (!banho && !casa.length) return setErro("Escolha onde a promoção vale: banho e tosa, creche ou hotel.");
    if (!(r.valor && r.valor > 0)) return setErro("Escreva o valor do desconto.");
    if (r.tipo === "pct" && r.valor > 90) return setErro("O desconto pode ser de até 90%.");
    if (banho && r.faixa && !r.hora_de && !r.hora_ate) return setErro("Escreva a hora de começo, a de fim, ou as duas.");
    if (banho && r.faixa && r.hora_de && r.hora_ate && r.hora_de >= r.hora_ate) return setErro("A hora de começo precisa ser antes da hora de fim.");
    if (r.comeca_em && r.termina_em && r.comeca_em > r.termina_em) return setErro("A data de começo precisa ser antes da data de fim.");
    setSalvando(true);
    try { await aoSalvar(r); } catch (x) { avisarErro(x); } finally { setSalvando(false); }
  }

  return (
    <Folha titulo={r.id ? "Mudar a promoção" : "Nova promoção"} aoFechar={aoFechar}
      rodape={<><button type="button" className="g-btn sec" onClick={aoFechar}>Cancelar</button><button className="g-btn pri" form="form-promo" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button></>}>
      <form id="form-promo" className="g-form" onSubmit={salvar}>
        <Campo rotulo="Nome que o cliente vê" dica="Ex.: Terça do banho, Manhã com desconto.">
          <input className="g-input" value={r.nome} maxLength={60} autoFocus={!r.id} onChange={(e) => mudar({ nome: e.target.value })} />
        </Campo>
        <div className="g-campo">
          <span id="promo-dias">Em quais dias</span>
          <div className="g-chips" role="group" aria-labelledby="promo-dias">
            {ORDEM_SEMANA.map((d) => <button key={d} type="button" className="g-chip" aria-pressed={r.dias.includes(d)} onClick={() => alternarDia(d)}>{DIAS[d]}</button>)}
          </div>
        </div>
        {onde.length > 1 && (
          <div className="g-campo">
            <span id="promo-onde">Onde vale</span>
            <div className="g-chips" role="group" aria-labelledby="promo-onde">
              {onde.map((o) => <button key={o.id} type="button" className="g-chip" aria-pressed={ondeMarcado(o.id)} onClick={() => alternarOnde(o.id)}>{o.rotulo}</button>)}
            </div>
            {casa.length > 0 && <small className="g-muted">{casa.includes("hotel") ? "No hotel, o desconto vale em cada noite que cai nos dias escolhidos. " : ""}{casa.includes("creche") ? "Na creche, vale no dia. " : ""}Mensalista e dia de experiência não entram.</small>}
          </div>
        )}
        {banho && <div className="g-campo">
          <span>{casa.length ? "Em que horário (só no banho e tosa)" : "Em que horário"}</span>
          <div className="g-seg" role="group" aria-label="Em que horário" style={{ justifySelf: "start" }}>
            <button type="button" aria-pressed={!r.faixa} onClick={() => mudar({ faixa: false })}>O dia todo</button>
            <button type="button" aria-pressed={r.faixa} onClick={() => mudar({ faixa: true, hora_ate: r.hora_ate ?? (r.hora_de ? null : "11:00") })}>Só numa faixa</button>
          </div>
          {r.faixa && (
            <div className="dupla">
              <Campo rotulo="A partir de (opcional)"><input type="time" className="g-input" step={300} value={r.hora_de ?? ""} onChange={(e) => mudar({ hora_de: e.target.value || null })} /></Campo>
              <Campo rotulo="Antes das (opcional)"><input type="time" className="g-input" step={300} value={r.hora_ate ?? ""} onChange={(e) => mudar({ hora_ate: e.target.value || null })} /></Campo>
            </div>
          )}
          {r.faixa && <small className="g-muted">Vale pela hora em que o atendimento começa. Ex.: antes das 11h.</small>}
        </div>}
        {banho && <div className="g-campo">
          <span id="promo-serv">Em quais serviços</span>
          <div className="g-chips" role="group" aria-labelledby="promo-serv">
            <button type="button" className="g-chip" aria-pressed={!r.servicos.length} onClick={() => mudar({ servicos: [] })}>Todos do banho e tosa</button>
            {doBanho.map((s) => <button key={s.id} type="button" className="g-chip" aria-pressed={r.servicos.includes(s.id)} onClick={() => alternarServico(s.id)}><i style={{ background: s.cor }} />{s.nome}</button>)}
          </div>
        </div>}
        <div className="g-campo">
          <span>Desconto</span>
          <div className="g-seg" role="group" aria-label="Tipo de desconto" style={{ justifySelf: "start" }}>
            <button type="button" aria-pressed={r.tipo === "pct"} onClick={() => mudar({ tipo: "pct" as TipoPromo })}>Em %</button>
            <button type="button" aria-pressed={r.tipo === "reais"} onClick={() => mudar({ tipo: "reais" as TipoPromo })}>Em reais</button>
          </div>
          {r.tipo === "pct"
            ? <input className="g-input g-tab" inputMode="numeric" aria-label="Desconto em %" value={r.valor ?? ""} maxLength={2} onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, "")); mudar({ valor: e.target.value.trim() ? n : null }); }} />
            : <CampoDinheiro valor={r.valor} aoMudar={(v) => mudar({ valor: v })} rotulo="Desconto em reais" />}
          <small className="g-muted">{r.valor ? (r.tipo === "pct"
            ? `${r.valor}% de desconto ${[banho ? "em cada serviço da promoção" : null, casa.includes("creche") ? "na diária da creche" : null, casa.includes("hotel") ? "em cada noite do hotel nos dias escolhidos" : null].filter(Boolean).join(", ")}.`
            : `${brlCurto(r.valor)} de desconto ${[banho ? "no horário" : null, casa.includes("creche") ? "na diária da creche" : null, casa.includes("hotel") ? "em cada noite do hotel nos dias escolhidos" : null].filter(Boolean).join(", ")}.`) : " "}</small>
        </div>
        <div className="dupla">
          <Campo rotulo="Começa em (opcional)"><input type="date" className="g-input" value={r.comeca_em ?? ""} onChange={(e) => mudar({ comeca_em: e.target.value || null })} /></Campo>
          <Campo rotulo="Termina em (opcional)"><input type="date" className="g-input" value={r.termina_em ?? ""} onChange={(e) => mudar({ termina_em: e.target.value || null })} /></Campo>
        </div>
        <label className="g-check"><input type="checkbox" checked={r.ativa} onChange={(e) => mudar({ ativa: e.target.checked })} /><span>Ligada</span></label>
        {erro && <p className="g-erro" role="alert">{erro}</p>}
        <p className="g-pp g-muted">{banho ? "O link mostra o desconto e o preço com desconto (o de antes é o preço da lista)." : "O link mostra o desconto da diária."} Sem data de fim, a promoção vale até você desligar. Reservas já marcadas não mudam.</p>
      </form>
    </Folha>
  );
}
