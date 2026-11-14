"use client";

import { useState } from "react";
import { HeartHandshake, Plus, Trash2 } from "lucide-react";
import { CHAVES_CASA, diarioDe, esperaDe, ITENS_DO_DIARIO, MAX_ITENS_DO_DIARIO, ocorrenciasLigadas, portariaLigada } from "@/lib/gestao/casa-opcoes";
import { equipeMudaPlano, OPCAO_EQUIPE_MUDA_PLANO, OPCAO_REPOSICAO_PRAZO, OPCAO_REPOSICAO_SO_AVISOU, type PrazoDeReposicao } from "@/lib/gestao/creche";
import { usaCasa, usaModulo } from "@/lib/gestao/modulos";
import { opcao, salvarOpcoes } from "@/lib/gestao/opcoes";
import { CHAVE_TUTOR, paginaDoTutorLigada } from "@/lib/gestao/tutor";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { avisarMudanca, useAvisos, useSomenteLeitura } from "../ui";
import "../hotel/hotel.css";

/**
 * Opções de cuidado com o tutor na creche e no hotel: diário do dia, quem pode buscar, lista de espera e ocorrências.
 * Tudo começa desligado e, desligado, nada aparece nas telas. Ficam em `petshops.opcoes` (chaves "casa.*").
 */
function Opcao({ titulo, frase, ligada, aoMudar, children }: { titulo: string; frase: string; ligada: boolean; aoMudar: (v: boolean) => void; children?: React.ReactNode }) {
  return (
    <div className="g-ht-op">
      <div className="g-ht-op-t">
        <div><b>{titulo}</b><p>{frase}</p></div>
        <button type="button" role="switch" aria-checked={ligada} aria-label={titulo} className="g-ht-chave" onClick={() => aoMudar(!ligada)}><i /></button>
      </div>
      {ligada && children && <div className="g-ht-op-c">{children}</div>}
    </div>
  );
}

export default function OpcoesCasa() {
  const { sb, petshop, souDono, recarregarBase } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [diario, setDiario] = useState(() => diarioDe(petshop));
  const [portaria, setPortaria] = useState(() => portariaLigada(petshop));
  const [espera, setEspera] = useState(() => esperaDe(petshop));
  const [ocorrencias, setOcorrencias] = useState(() => ocorrenciasLigadas(petshop));
  const [tutor, setTutor] = useState(() => paginaDoTutorLigada(petshop));
  const [equipePlano, setEquipePlano] = useState(() => equipeMudaPlano(petshop));
  // regra de reposição de falta: desligada, qualquer falta do plano pode ser reposta, sem prazo
  const [prazo, setPrazo] = useState<PrazoDeReposicao>(() => { const v = opcao<string>(petshop, OPCAO_REPOSICAO_PRAZO, ""); return v === "mes" || v === "mes_seguinte" ? v : ""; });
  const [soAvisou, setSoAvisou] = useState(() => opcao<boolean>(petshop, OPCAO_REPOSICAO_SO_AVISOU, false) === true);
  const [mexeu, setMexeu] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  if (!souDono || !usaCasa(petshop)) return null;
  const m = <T,>(f: (v: T) => void) => (v: T) => { f(v); setMexeu(true); setErro(null); };
  const mudaItem = (i: number, v: string) => m(setDiario)({ ...diario, itens: diario.itens.map((x, j) => (j === i ? v : x)) });

  async function salvar() {
    if (somenteLeitura() || salvando) return;
    const itens = [...new Set(diario.itens.map((x) => x.trim()).filter(Boolean))];
    if (diario.ativo && !itens.length) return setErro("O diário precisa de pelo menos um item para marcar.");
    setErro(null); setSalvando(true);
    try {
      await salvarOpcoes(sb, petshop.id, {
        [CHAVES_CASA.diario]: { ativo: diario.ativo, itens },
        [CHAVES_CASA.portaria]: portaria,
        [CHAVES_CASA.espera]: { ativo: espera.ativo, link: espera.ativo && espera.link },
        [CHAVES_CASA.ocorrencias]: ocorrencias,
        [CHAVE_TUTOR]: { ativo: tutor },
        ...(usaModulo(petshop, "creche") ? { [OPCAO_EQUIPE_MUDA_PLANO]: equipePlano, [OPCAO_REPOSICAO_PRAZO]: prazo, [OPCAO_REPOSICAO_SO_AVISOU]: soAvisou } : {}),
      });
      await recarregarBase();
      avisarMudanca();
      setDiario((d) => ({ ...d, itens: itens.length ? itens : ITENS_DO_DIARIO }));
      setMexeu(false);
      avisar("Opções de cuidado com o tutor salvas.");
    } catch (x) { avisarErro(x); } finally { setSalvando(false); }
  }

  return (
    <section className="g-card g-pilha" id="opcoes-casa">
      <div className="g-mp-t">
        <Tile icone={HeartHandshake} tom="ceu" />
        <div><h2>Cuidado com o tutor</h2><p className="g-muted g-p">Para a creche e o hotel. Ligue só o que você usa: desligado, nada aparece nas telas.</p></div>
      </div>
      <div>
        <Opcao titulo="Diário do dia" frase="Para cada pet na casa, a equipe marca em um toque o que ele fez e manda um resumo pronto para o WhatsApp do tutor." ligada={diario.ativo} aoMudar={(v) => m(setDiario)({ ...diario, ativo: v })}>
          <div className="g-campo">
            <span>O que a equipe marca</span>
            {diario.itens.map((item, i) => (
              <div key={i} className="g-fila" style={{ flexWrap: "nowrap" }}>
                <input className="g-input g-cresce" value={item} maxLength={40} aria-label={`Item ${i + 1} do diário`} placeholder="Ex.: Passeou" onChange={(e) => mudaItem(i, e.target.value)} />
                <button type="button" className="g-ico" aria-label={`Tirar o item ${item || i + 1}`} onClick={() => m(setDiario)({ ...diario, itens: diario.itens.filter((_, j) => j !== i) })}><Trash2 /></button>
              </div>
            ))}
            {diario.itens.length < MAX_ITENS_DO_DIARIO && <div><button type="button" className="g-btn sec p" onClick={() => m(setDiario)({ ...diario, itens: [...diario.itens, ""] })}><Plus />Novo item</button></div>}
            <small>Escreva como você quer que o tutor leia. Só o que for marcado entra na mensagem, e ela só sai quando alguém aperta enviar no WhatsApp.</small>
          </div>
        </Opcao>

        <Opcao titulo="Quem pode buscar o pet" frase="A ficha do pet guarda as pessoas autorizadas a buscar e o veterinário de emergência. Na saída, a equipe confere e marca quem levou." ligada={portaria} aoMudar={m(setPortaria)} />

        <Opcao titulo="Lista de espera" frase="Em dia cheio, dá para deixar o pet na lista de espera. Quando abre vaga, a tela mostra quem estava esperando, com a mensagem pronta." ligada={espera.ativo} aoMudar={(v) => m(setEspera)({ ...espera, ativo: v })}>
          <label className="g-check"><input type="checkbox" checked={espera.link} onChange={(e) => m(setEspera)({ ...espera, link: e.target.checked })} /><span>No link do cliente, deixar o tutor pedir para entrar na lista quando o dia estiver cheio</span></label>
          <p className="g-muted g-pp">Entrar na lista não reserva nada: o pedido só vira reserva quando você marcar.</p>
        </Opcao>

        <Opcao titulo="Ocorrências" frase="Briga, machucado, fuga ou vômito: a equipe anota na estadia com a hora e o nome de quem escreveu. Você vê no Hoje e na ficha do pet." ligada={ocorrencias} aoMudar={m(setOcorrencias)} />

        <Opcao titulo="Página do tutor" frase="A equipe põe fotos no dia de cada pet. Cada tutor ganha um link só dele, sem senha, com o diário, as fotos, o que está marcado e os avisos de vacina, sem preços." ligada={tutor} aoMudar={m(setTutor)}>
          <p className="g-muted g-pp">As fotos ficam guardadas só para a equipe e para o tutor do pet (até 10 por pet por dia). O link do tutor sai pelo botão Mandar a página do tutor, na ficha do tutor e nos cartões da creche e do hotel. Desligando esta opção, todos os links param de abrir na hora.</p>
        </Opcao>

        {usaModulo(petshop, "creche") && (
          <Opcao titulo="A equipe pode mexer nos planos de mensalista" frase="Desligado, só você e quem cuida do financeiro cadastram um mensalista, mudam os dias, pausam ou encerram o plano, porque o plano decide o que é cobrado. Ligado, quem trabalha na creche também pode (sem ver nem preencher valores)." ligada={equipePlano} aoMudar={m(setEquipePlano)}>
            <p className="g-muted g-pp">Plano cadastrado pela equipe fica sem valor até você preencher: a tela Hoje avisa. A reposição de falta (dia sem cobrança) marcada pela equipe sempre passa pela sua conferência, com esta opção ligada ou não.</p>
          </Opcao>
        )}
        {usaModulo(petshop, "creche") && (
          <Opcao titulo="Regra para repor falta" frase="Toda reposição (dia sem cobrança) precisa de uma falta para repor. Desligado, vale qualquer falta do plano, sem prazo. Ligado, você escolhe até quando e quais faltas valem."
            ligada={Boolean(prazo) || soAvisou} aoMudar={(v) => { m(setPrazo)(v ? "mes_seguinte" : ""); setSoAvisou(false); }}>
            <label className="g-campo"><span>Até quando dá para repor</span>
              <select className="g-select" value={prazo} onChange={(e) => m(setPrazo)(e.target.value as PrazoDeReposicao)}>
                <option value="">Sem prazo</option>
                <option value="mes">No mesmo mês da falta</option>
                <option value="mes_seguinte">Até o fim do mês seguinte à falta</option>
              </select>
            </label>
            <label className="g-check"><input type="checkbox" checked={soAvisou} onChange={(e) => m(setSoAvisou)(e.target.checked)} /><span>Só repõe falta que o tutor avisou</span></label>
            <p className="g-muted g-pp">Sem falta para repor, a equipe marca o dia como dia extra. Você pode liberar um dia sem cobrança assim mesmo: fica anotado.</p>
          </Opcao>
        )}
      </div>
      {erro && <p className="g-erro" role="alert">{erro}</p>}
      <div className="g-fila">
        <button type="button" className="g-btn verde" onClick={() => void salvar()} disabled={salvando || !mexeu}>{salvando ? "Salvando…" : "Salvar opções"}</button>
        {mexeu && <span className="g-muted g-pp">Você mudou as opções. Elas só valem depois de salvar.</span>}
      </div>
    </section>
  );
}
