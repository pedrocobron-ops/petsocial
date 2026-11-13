"use client";

import { useState } from "react";
import { Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { MARCAS_DAS_MENSAGENS, MENSAGENS, MODELOS_PADRAO } from "@/lib/gestao/hotel";
import {
  acomodacoesDe, CHAVES_HOTEL, cuidadosLigados, modelosDe, novoCodigo, pixDe, porteDe, segundoPetDe, sinalDe, taxasDe, temporadasDe,
  type Acomodacao, type ModelosDeMensagem, type Taxa, type Temporada,
} from "@/lib/gestao/hotel-opcoes";
import { usaCasa, usaModulo } from "@/lib/gestao/modulos";
import { salvarOpcoes } from "@/lib/gestao/opcoes";
import { PORTES } from "@/lib/gestao/tipos";
import { isoDia } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { Campo, CampoValor, avisarMudanca, useAvisos, useSomenteLeitura } from "../ui";
import "../hotel/hotel.css";

/**
 * Opções do hotel e da creche: o dono liga só o que usa. Tudo começa desligado, e desligado o sistema fica como sempre foi.
 * As opções ficam em `petshops.opcoes` (chaves "hotel.*"); as regras de preço estão em src/lib/gestao/hotel.ts.
 */
function Chave({ ligada, aoMudar, rotulo }: { ligada: boolean; aoMudar: (v: boolean) => void; rotulo: string }) {
  return <button type="button" role="switch" aria-checked={ligada} aria-label={rotulo} className="g-ht-chave" onClick={() => aoMudar(!ligada)}><i /></button>;
}
function Opcao({ titulo, frase, ligada, aoMudar, children }: { titulo: string; frase: string; ligada: boolean; aoMudar: (v: boolean) => void; children?: React.ReactNode }) {
  return (
    <div className="g-ht-op">
      <div className="g-ht-op-t">
        <div><b>{titulo}</b><p>{frase}</p></div>
        <Chave ligada={ligada} aoMudar={aoMudar} rotulo={titulo} />
      </div>
      {ligada && children && <div className="g-ht-op-c">{children}</div>}
    </div>
  );
}
const lerNumero = (s: string) => { const n = Number(s.replace(",", ".")); return s.trim() && Number.isFinite(n) && n >= 0 ? n : null; };

export default function OpcoesHotel() {
  const { sb, petshop, souDono, recarregarBase } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [sinal, setSinal] = useState(() => sinalDe(petshop));
  const [pix, setPix] = useState(() => pixDe(petshop));
  const [porte, setPorte] = useState(() => porteDe(petshop));
  const [temporadas, setTemporadas] = useState(() => temporadasDe(petshop));
  const [segundo, setSegundo] = useState(() => segundoPetDe(petshop));
  const [taxas, setTaxas] = useState(() => taxasDe(petshop));
  const [cuidados, setCuidados] = useState(() => cuidadosLigados(petshop));
  const [quartos, setQuartos] = useState(() => acomodacoesDe(petshop));
  const [modelos, setModelos] = useState<ModelosDeMensagem>(() => modelosDe(petshop));
  const [mexeu, setMexeu] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  if (!souDono || !usaCasa(petshop)) return null;
  const temHotel = usaModulo(petshop, "hotel"), temCreche = usaModulo(petshop, "creche");
  const m = <T,>(f: (v: T) => void) => (v: T) => { f(v); setMexeu(true); setErro(null); };

  async function salvar() {
    if (somenteLeitura() || salvando) return;
    if (sinal.ativo && sinal.modo === "pct" && sinal.valor != null && sinal.valor > 100) return setErro("O sinal em porcentagem vai até 100%.");
    if (segundo.ativo && (!segundo.pct || segundo.pct > 100)) return setErro("Escreva o desconto do segundo pet, de 1 a 100%.");
    const temporadaRuim = temporadas.ativo ? temporadas.lista.find((t) => !t.nome.trim() || !t.de || !t.ate || t.ate < t.de) : null;
    if (temporadaRuim) return setErro(`Confira a temporada ${temporadaRuim.nome.trim() ? `"${temporadaRuim.nome.trim()}"` : "sem nome"}: ela precisa de nome e de um período em que o fim vem depois do começo.`);
    if (taxas.ativo && taxas.lista.some((t) => !t.nome.trim())) return setErro("Dê um nome para cada taxa, ou tire a que está em branco.");
    if (quartos.ativo && quartos.lista.some((a) => !a.nome.trim())) return setErro("Dê um nome para cada acomodação, ou tire a que está em branco.");
    setErro(null); setSalvando(true);
    try {
      await salvarOpcoes(sb, petshop.id, {
        [CHAVES_HOTEL.sinal]: { ...sinal, politica: sinal.politica.trim() },
        [CHAVES_HOTEL.pix]: pix.trim(),
        [CHAVES_HOTEL.porte]: porte,
        [CHAVES_HOTEL.temporadas]: { ativo: temporadas.ativo, lista: temporadas.lista.map((t) => ({ ...t, nome: t.nome.trim() })) },
        [CHAVES_HOTEL.segundoPet]: segundo,
        [CHAVES_HOTEL.taxas]: { ativo: taxas.ativo, lista: taxas.lista.map((t) => ({ ...t, nome: t.nome.trim() })) },
        [CHAVES_HOTEL.cuidados]: cuidados,
        [CHAVES_HOTEL.acomodacoes]: { ativo: quartos.ativo, lista: quartos.lista.map((a) => ({ ...a, nome: a.nome.trim() })) },
        [CHAVES_HOTEL.mensagens]: Object.fromEntries(Object.entries(modelos).filter(([k, v]) => v && v.trim() && v.trim() !== MODELOS_PADRAO[k as keyof typeof MODELOS_PADRAO])),
      });
      await recarregarBase();
      avisarMudanca();
      setMexeu(false);
      avisar("Opções do hotel e da creche salvas.");
    } catch (x) { avisarErro(x); } finally { setSalvando(false); }
  }

  const mudaTemporada = (id: string, x: Partial<Temporada>) => m(setTemporadas)({ ...temporadas, lista: temporadas.lista.map((t) => (t.id === id ? { ...t, ...x } : t)) });
  const mudaTaxa = (id: string, x: Partial<Taxa>) => m(setTaxas)({ ...taxas, lista: taxas.lista.map((t) => (t.id === id ? { ...t, ...x } : t)) });
  const mudaQuarto = (id: string, x: Partial<Acomodacao>) => m(setQuartos)({ ...quartos, lista: quartos.lista.map((a) => (a.id === id ? { ...a, ...x } : a)) });
  const hoje = isoDia(new Date());

  return (
    <section className="g-card g-pilha" id="opcoes-hotel">
      <div className="g-mp-t">
        <Tile icone={SlidersHorizontal} tom="ceu" />
        <div><h2>Opções do hotel e da creche</h2><p className="g-muted g-p">Ligue só o que você usa. Desligado, nada muda nas telas nem na conta.</p></div>
      </div>
      <div>
        <Opcao titulo="Sinal na reserva" frase="A reserva pode ter um sinal: recebido na hora ou a receber. No check-out ele é descontado da conta." ligada={sinal.ativo} aoMudar={(v) => m(setSinal)({ ...sinal, ativo: v })}>
          <div className="g-campo">
            <span>Valor sugerido</span>
            <div className="g-seg" role="group" aria-label="Como sugerir o sinal">
              <button type="button" aria-pressed={sinal.modo === "pct"} onClick={() => m(setSinal)({ ...sinal, modo: "pct", valor: null })}>Porcentagem do total</button>
              <button type="button" aria-pressed={sinal.modo === "valor"} onClick={() => m(setSinal)({ ...sinal, modo: "valor", valor: null })}>Valor fixo</button>
            </div>
          </div>
          {sinal.modo === "pct"
            ? <Campo rotulo="Porcentagem do total previsto" dica="Ex.: 30. O valor aparece preenchido na reserva e dá para mudar."><input className="g-input g-tab" inputMode="decimal" value={sinal.valor ?? ""} placeholder="%" onChange={(e) => m(setSinal)({ ...sinal, valor: lerNumero(e.target.value) })} /></Campo>
            : <Campo rotulo="Valor do sinal" dica="O valor aparece preenchido na reserva e dá para mudar."><CampoValor valor={sinal.valor} aoMudar={(v) => m(setSinal)({ ...sinal, valor: v })} /></Campo>}
          <Campo rotulo="O que você combina sobre o sinal" dica="Escreva com as suas palavras (por exemplo, o que acontece se o tutor cancelar). Este texto vai na mensagem que pede o sinal e no link do cliente. Em branco, não aparece nada.">
            <textarea className="g-textarea" value={sinal.politica} maxLength={400} onChange={(e) => m(setSinal)({ ...sinal, politica: e.target.value })} />
          </Campo>
          <Campo rotulo="Chave Pix para o sinal" dica="Opcional. Se preencher, a chave vai junto na mensagem Pedir o sinal. O sistema não recebe pagamento: só mostra a chave.">
            <input className="g-input" value={pix} maxLength={120} onChange={(e) => m(setPix)(e.target.value)} />
          </Campo>
          {temCreche && <label className="g-check"><input type="checkbox" checked={sinal.creche} onChange={(e) => m(setSinal)({ ...sinal, creche: e.target.checked })} /><span>Oferecer o sinal também nas reservas da creche</span></label>}
        </Opcao>

        {temHotel && (
          <Opcao titulo="Diária do hotel por porte" frase="Cada porte tem a sua diária. Porte em branco, ou pet sem porte na ficha, usa a diária do hotel de sempre." ligada={porte.ativo} aoMudar={(v) => m(setPorte)({ ...porte, ativo: v })}>
            <div className="g-ht-portes">
              {PORTES.map((p) => <Campo key={p.id} rotulo={`${p.id} · ${p.rotulo}`}><CampoValor valor={porte[p.id]} aoMudar={(v) => m(setPorte)({ ...porte, [p.id]: v })} /></Campo>)}
            </div>
          </Opcao>
        )}

        {temHotel && (
          <Opcao titulo="Temporadas" frase="Períodos com preço diferente no hotel (feriado, férias). A estadia que cruza uma temporada é cobrada noite por noite." ligada={temporadas.ativo} aoMudar={(v) => m(setTemporadas)({ ...temporadas, ativo: v })}>
            {temporadas.lista.map((t) => (
              <div key={t.id} className="g-ht-op-l">
                <div className="campos">
                  <Campo rotulo="Nome"><input className="g-input" value={t.nome} maxLength={40} placeholder="Ex.: Réveillon" onChange={(e) => mudaTemporada(t.id, { nome: e.target.value })} /></Campo>
                  <Campo rotulo="De"><input type="date" className="g-input" value={t.de} onChange={(e) => mudaTemporada(t.id, { de: e.target.value })} /></Campo>
                  <Campo rotulo="Até (última noite)"><input type="date" className="g-input" value={t.ate} min={t.de} onChange={(e) => mudaTemporada(t.id, { ate: e.target.value })} /></Campo>
                  <Campo rotulo="Como muda o preço">
                    <select className="g-select" value={t.modo} onChange={(e) => mudaTemporada(t.id, { modo: e.target.value as Temporada["modo"] })}>
                      <option value="pct">Acréscimo em %</option><option value="mais">Acréscimo em R$ por noite</option><option value="valor">Diária própria</option>
                    </select>
                  </Campo>
                  <Campo rotulo={t.modo === "pct" ? "Quanto (%)" : t.modo === "mais" ? "Quanto a mais por noite" : "Diária da temporada"}>
                    {t.modo === "pct" ? <input className="g-input g-tab" inputMode="decimal" value={t.valor || ""} onChange={(e) => mudaTemporada(t.id, { valor: lerNumero(e.target.value) ?? 0 })} />
                      : <CampoValor valor={t.valor} aoMudar={(v) => mudaTemporada(t.id, { valor: v ?? 0 })} />}
                  </Campo>
                </div>
                <button type="button" className="g-ico" aria-label={`Tirar a temporada ${t.nome}`} onClick={() => m(setTemporadas)({ ...temporadas, lista: temporadas.lista.filter((x) => x.id !== t.id) })}><Trash2 /></button>
              </div>
            ))}
            <div><button type="button" className="g-btn sec p" onClick={() => m(setTemporadas)({ ...temporadas, lista: [...temporadas.lista, { id: novoCodigo(), nome: "", de: hoje, ate: hoje, modo: "pct", valor: 0 }] })}><Plus />Nova temporada</button></div>
            <p className="g-muted g-pp">A noite conta pelo dia em que começa: a noite de 31/12 para 01/01 é a de 31/12. Se duas temporadas pegarem a mesma noite, vale a que começa primeiro.</p>
          </Opcao>
        )}

        {temHotel && (
          <Opcao titulo="Desconto para o segundo pet" frase="Quando o mesmo tutor hospeda mais de um pet nas mesmas noites, o segundo em diante tem desconto na diária dessas noites." ligada={segundo.ativo} aoMudar={(v) => m(setSegundo)({ ...segundo, ativo: v })}>
            <Campo rotulo="Desconto (%)" dica="O primeiro pet (o que entrou antes) paga a diária cheia."><input className="g-input g-tab" inputMode="decimal" value={segundo.pct ?? ""} placeholder="%" onChange={(e) => m(setSegundo)({ ...segundo, pct: lerNumero(e.target.value) })} /></Campo>
          </Opcao>
        )}

        <Opcao titulo="Taxas opcionais" frase="Uma lista de taxas com o nome e o valor que você define. Na reserva ou no check-out, alguém marca as que valem: nenhuma entra sozinha." ligada={taxas.ativo} aoMudar={(v) => m(setTaxas)({ ...taxas, ativo: v })}>
          {taxas.lista.map((t) => (
            <div key={t.id} className="g-ht-op-l">
              <div className="campos">
                <Campo rotulo="Nome"><input className="g-input" value={t.nome} maxLength={40} placeholder="Ex.: Táxi dog" onChange={(e) => mudaTaxa(t.id, { nome: e.target.value })} /></Campo>
                <Campo rotulo="Valor"><CampoValor valor={t.valor} aoMudar={(v) => mudaTaxa(t.id, { valor: v ?? 0 })} /></Campo>
                <Campo rotulo="Como cobra">
                  <select className="g-select" value={t.por} onChange={(e) => mudaTaxa(t.id, { por: e.target.value as Taxa["por"] })}><option value="fixa">Uma vez na conta</option><option value="noite">Por noite (ou por dia)</option></select>
                </Campo>
              </div>
              <button type="button" className="g-ico" aria-label={`Tirar a taxa ${t.nome}`} onClick={() => m(setTaxas)({ ...taxas, lista: taxas.lista.filter((x) => x.id !== t.id) })}><Trash2 /></button>
            </div>
          ))}
          <div><button type="button" className="g-btn sec p" onClick={() => m(setTaxas)({ ...taxas, lista: [...taxas.lista, { id: novoCodigo(), nome: "", valor: 0, por: "fixa" }] })}><Plus />Nova taxa</button></div>
        </Opcao>

        <Opcao titulo="Ficha de cuidados" frase="Comida e remédio de cada estadia, com horários, e uma lista do dia para a equipe marcar o que já foi feito." ligada={cuidados} aoMudar={m(setCuidados)} />

        {temHotel && (
          <Opcao titulo="Acomodações" frase="Liste os canis, baias ou quartos. A reserva pode ficar com uma acomodação, e o sistema avisa quando ela já está cheia nas datas." ligada={quartos.ativo} aoMudar={(v) => m(setQuartos)({ ...quartos, ativo: v })}>
            {quartos.lista.map((a) => (
              <div key={a.id} className="g-ht-op-l">
                <div className="campos">
                  <Campo rotulo="Nome"><input className="g-input" value={a.nome} maxLength={30} placeholder="Ex.: Canil 1" onChange={(e) => mudaQuarto(a.id, { nome: e.target.value })} /></Campo>
                  <Campo rotulo="Quantos pets cabem"><input className="g-input g-tab" inputMode="numeric" value={a.vagas || ""} onChange={(e) => mudaQuarto(a.id, { vagas: Math.min(50, Math.max(0, Math.round(lerNumero(e.target.value) ?? 0))) })} onBlur={() => { if (!a.vagas) mudaQuarto(a.id, { vagas: 1 }); }} /></Campo>
                </div>
                <button type="button" className="g-ico" aria-label={`Tirar a acomodação ${a.nome}`} onClick={() => m(setQuartos)({ ...quartos, lista: quartos.lista.filter((x) => x.id !== a.id) })}><Trash2 /></button>
              </div>
            ))}
            <div><button type="button" className="g-btn sec p" onClick={() => m(setQuartos)({ ...quartos, lista: [...quartos.lista, { id: novoCodigo(), nome: "", vagas: 1 }] })}><Plus />Nova acomodação</button></div>
          </Opcao>
        )}

        <div className="g-ht-op">
          <div className="g-ht-op-t"><div><b>Textos das mensagens</b><p>O texto de cada mensagem de WhatsApp do hotel e da creche, igual em todos os aparelhos. A saudação (Oi, nome! Aqui é {petshop.nome}.) entra sozinha na frente.</p></div></div>
          <details className="g-ht-det">
            <summary>Mudar os textos</summary>
            <div className="g-ht-op-c" style={{ marginTop: 8 }}>
              {MENSAGENS.map((x) => (
                <Campo key={x.id} rotulo={x.rotulo}>
                  <textarea className="g-textarea" rows={3} maxLength={600} value={modelos[x.id] ?? MODELOS_PADRAO[x.id]} onChange={(e) => m(setModelos)({ ...modelos, [x.id]: e.target.value })} />
                  {modelos[x.id] != null && modelos[x.id] !== MODELOS_PADRAO[x.id] && <button type="button" className="g-btn fantasma p" style={{ justifySelf: "start" }} onClick={() => { const n = { ...modelos }; delete n[x.id]; m(setModelos)(n); }}>Voltar ao texto padrão</button>}
                </Campo>
              ))}
              <p className="g-muted g-pp">Palavras que o sistema troca na hora: {MARCAS_DAS_MENSAGENS.map((x) => `${x.marca} (${x.vira})`).join("; ")}. Antes de mandar, ainda dá para mudar o texto de cada mensagem.</p>
            </div>
          </details>
        </div>
      </div>
      {erro && <p className="g-erro" role="alert">{erro}</p>}
      <div className="g-fila">
        <button type="button" className="g-btn verde" onClick={() => void salvar()} disabled={salvando || !mexeu}>{salvando ? "Salvando…" : "Salvar opções"}</button>
        {mexeu && <span className="g-muted g-pp">Você mudou as opções. Elas só valem depois de salvar.</span>}
      </div>
    </section>
  );
}
