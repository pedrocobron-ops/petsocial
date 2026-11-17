"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import {
  experienciaDe, extratoDoPetLigado, OPCAO_DESCONTO_IRMAO, OPCAO_EXPERIENCIA, OPCAO_EXPERIENCIA_PRECO, OPCAO_EXTRATO_PET, OPCAO_PLANOS_NO_LINK, planosNoLink, precoDaExperiencia, regraIrmaoDe,
  type RegraIrmao,
} from "@/lib/gestao/creche";
import { AVISO_VALOR_RUIM, lerValor } from "@/lib/gestao/util";
import { usaModulo } from "@/lib/gestao/modulos";
import { salvarOpcoes } from "@/lib/gestao/opcoes";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { avisarMudanca, Campo, CampoValor, useAvisos, useSomenteLeitura } from "../ui";
import { AvisoDeRascunho, useRascunho } from "../rascunho";
import { useSalvarJunto } from "./salvar-junto";
import "../hotel/hotel.css";

/**
 * Opções da creche (só o dono): dia de experiência, desconto para irmãos e extrato do mês por cachorro.
 * Tudo começa desligado e, desligado, nada muda nas telas. Chaves "creche.*" em `petshops.opcoes`; o preço do dia de experiência e o
 * valor do desconto ficam fora do que a equipe sem dinheiro lê (função `opcoes_sem_valores`, migração 20261173).
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
const lerNumero = (s: string) => { const n = lerValor(s); return n != null && n > 0 ? n : null; };

export default function OpcoesCreche() {
  const { sb, petshop, souDono, recarregarBase } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [exp, setExp] = useState(() => experienciaDe(petshop));
  const [preco, setPreco] = useState<number | null>(() => precoDaExperiencia(petshop));
  const [irmao, setIrmao] = useState<RegraIrmao>(() => regraIrmaoDe(petshop));
  const [textoIrmao, setTextoIrmao] = useState(() => { const v = regraIrmaoDe(petshop).valor; return v == null ? "" : String(v).replace(".", ","); });
  const [extrato, setExtrato] = useState(() => extratoDoPetLigado(petshop));
  const [planosLink, setPlanosLink] = useState(() => planosNoLink(petshop));
  const [mexeu, setMexeu] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  // o que foi mudado e não salvo fica no aparelho: recarregar a tela não perde
  type Valores = { exp: typeof exp; preco: number | null; irmao: RegraIrmao; textoIrmao: string; extrato: boolean; planosLink?: boolean };
  const aplicar = (v: Valores) => { setExp(v.exp); setPreco(v.preco); setIrmao(v.irmao); setTextoIrmao(v.textoIrmao); setExtrato(v.extrato); setPlanosLink(Boolean(v.planosLink)); };
  const rascunho = useRascunho<Valores>("opcoes-creche", { exp, preco, irmao, textoIrmao, extrato, planosLink }, mexeu, (v) => { aplicar(v); setMexeu(true); });
  const descartar = () => {
    const r = regraIrmaoDe(petshop);
    aplicar({ exp: experienciaDe(petshop), preco: precoDaExperiencia(petshop), irmao: r, textoIrmao: r.valor == null ? "" : String(r.valor).replace(".", ","), extrato: extratoDoPetLigado(petshop), planosLink: planosNoLink(petshop) });
    setMexeu(false); setErro(null);
  };
  const junto = useSalvarJunto("opcoes-creche", { nome: "Mais opções da creche", mexeu, salvar });
  if (!souDono || !usaModulo(petshop, "creche")) return null;
  const m = <T,>(f: (v: T) => void) => (v: T) => { f(v); setMexeu(true); setErro(null); };

  async function salvarAqui() { const r = await salvar(); if (r) avisar(r); }
  async function salvar(): Promise<string | false> {
    if (somenteLeitura() || salvando) return false;
    const falha = (t: string) => { setErro(t); return false as const; };
    if (irmao.ativo && (irmao.valor == null || (irmao.tipo === "pct" && irmao.valor > 100))) {
      return falha(irmao.tipo === "pct" ? "Escreva o desconto para irmãos, de 1 a 100%." : "Escreva o valor do desconto para irmãos.");
    }
    if (exp.ativo && preco != null && preco > 99999) return falha("Confira o preço do dia de experiência.");
    setErro(null); setSalvando(true);
    const antes = regraIrmaoDe(petshop);
    const mudouIrmao = antes.ativo !== irmao.ativo || antes.tipo !== irmao.tipo || antes.valor !== irmao.valor || antes.qual !== irmao.qual;
    try {
      await salvarOpcoes(sb, petshop.id, {
        [OPCAO_EXPERIENCIA]: exp,
        [OPCAO_EXPERIENCIA_PRECO]: exp.ativo ? preco ?? 0 : precoDaExperiencia(petshop) ?? 0,
        [OPCAO_DESCONTO_IRMAO]: irmao,
        [OPCAO_EXTRATO_PET]: extrato,
        [OPCAO_PLANOS_NO_LINK]: planosLink,
      });
      // a regra do irmão mudou: as mensalidades em aberto (sem nenhum recebimento) deste mês em diante acompanham
      let refeitas = 0;
      if (mudouIrmao && (antes.ativo || irmao.ativo)) {
        const r = await sb.rpc("creche_irmaos_aplicar", { p_petshop: petshop.id });
        if (!r.error) refeitas = Number(r.data ?? 0);
      }
      await recarregarBase();
      avisarMudanca();
      setMexeu(false);
      return `Mais opções da creche salvas.${refeitas ? ` ${refeitas === 1 ? "1 mensalidade em aberto foi refeita" : `${refeitas} mensalidades em aberto foram refeitas`} com a regra nova do desconto para irmãos.` : ""}`;
    } catch (x) { avisarErro(x); return false; } finally { setSalvando(false); }
  }

  return (
    <section className="g-card g-pilha" id="opcoes-creche">
      <div className="g-mp-t">
        <Tile icone={Sparkles} tom="manteiga" />
        <div><h2>Mais opções da creche</h2><p className="g-muted g-p">Ligue só o que você usa: desligado, nada aparece nas telas.</p></div>
      </div>
      {rascunho.recuperado && mexeu && <AvisoDeRascunho aoDescartar={descartar} />}
      <div>
        <Opcao titulo="Dia de experiência" frase="Um dia avulso para o cão novo conhecer a creche, com preço próprio ou gratuito. Fica anotado como dia de experiência (não como dia de mensalista) e, depois dele, a tela traz a mensagem pronta para perguntar ao tutor como foi e oferecer os planos."
          ligada={exp.ativo} aoMudar={(v) => m(setExp)({ ...exp, ativo: v })}>
          <div className="dupla">
            <Campo rotulo="Preço do dia de experiência" dica="Em branco ou zero, é gratuito.">
              <CampoValor valor={preco} aoMudar={m(setPreco)} placeholder="Gratuito" />
            </Campo>
            <label className="g-campo"><span>Quantos por cão</span>
              <select className="g-select" value={exp.max} onChange={(e) => m(setExp)({ ...exp, max: Number(e.target.value) })}>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n === 1 ? "1 dia" : `${n} dias`}</option>)}
              </select>
            </label>
          </div>
          <label className="g-check"><input type="checkbox" checked={exp.link} onChange={(e) => m(setExp)({ ...exp, link: e.target.checked })} /><span>No link do cliente, deixar o tutor pedir o dia de experiência</span></label>
          <p className="g-muted g-pp">O dia de experiência é para cão que ainda não é mensalista. A equipe marca no check-in (ou pela Chamada, em Dia de experiência) e vê o dia sem preço. O pedido pelo link só vira reserva quando alguém aceitar.</p>
        </Opcao>

        <Opcao titulo="Desconto para irmãos" frase="Quando o mesmo tutor tem mais de um cão com plano no mês, um paga a mensalidade cheia e cada um dos outros tem desconto na mensalidade. A cobrança, a mensagem e o extrato mostram a linha Desconto irmão."
          ligada={irmao.ativo} aoMudar={(v) => m(setIrmao)({ ...irmao, ativo: v })}>
          <div className="g-seg g-ht-seg" role="group" aria-label="Tipo do desconto para irmãos">
            <button type="button" aria-pressed={irmao.tipo === "pct"} onClick={() => m(setIrmao)({ ...irmao, tipo: "pct" })}>Em %</button>
            <button type="button" aria-pressed={irmao.tipo === "reais"} onClick={() => m(setIrmao)({ ...irmao, tipo: "reais" })}>Em R$</button>
          </div>
          <div className="dupla">
            <Campo rotulo={irmao.tipo === "pct" ? "Desconto (%)" : "Desconto (R$ por mês)"} erro={textoIrmao.trim() && lerValor(textoIrmao) == null ? (irmao.tipo === "pct" ? "Confira: use só números, ex.: 10" : AVISO_VALOR_RUIM) : null}>
              <input className="g-input g-tab" inputMode="decimal" value={textoIrmao} data-valor-ruim={textoIrmao.trim() && lerValor(textoIrmao) == null ? "1" : undefined} placeholder={irmao.tipo === "pct" ? "%" : "0,00"} aria-label="Valor do desconto para irmãos"
                onChange={(e) => { setTextoIrmao(e.target.value); m(setIrmao)({ ...irmao, valor: lerNumero(e.target.value) }); }} />
            </Campo>
            <label className="g-campo"><span>Quem paga a mensalidade cheia</span>
              <select className="g-select" value={irmao.qual} onChange={(e) => m(setIrmao)({ ...irmao, qual: e.target.value === "segundo" ? "segundo" : "mais_barato" })}>
                <option value="mais_barato">O plano mais caro (o desconto vai para os mais baratos)</option>
                <option value="segundo">O primeiro cão a entrar (o desconto vai para quem entrou depois)</option>
              </select>
            </label>
          </div>
          <p className="g-muted g-pp">O desconto vale só sobre a mensalidade, não sobre dias extras nem taxas. Em mês proporcional (começo, saída ou pausa), o desconto em R$ acompanha a proporção. Conta como irmão o cão com plano em algum dia do mês. Mensalidade já paga, ou com parte recebida, não muda. Ao salvar, as mensalidades em aberto deste mês em diante acompanham a regra.</p>
        </Opcao>

        <Opcao titulo="Mostrar os planos mensais no link" frase="No link do cliente, quem pede a creche vê os seus modelos de plano (2x, 3x por semana…) com o preço por mês e a chave Pix, se você preencheu. O tutor novo sabe o preço do plano antes do dia de experiência. Os modelos ficam em Creche, Mensalistas, Modelos de plano."
          ligada={planosLink} aoMudar={m(setPlanosLink)} />

        <Opcao titulo="Extrato do mês por cachorro" frase="Na ficha do pet, o extrato do mês de cada cão: presenças, faltas, reposições, dias extras e taxas, para imprimir ou mandar pelo WhatsApp. Quem não vê o financeiro vê só as presenças, sem valores."
          ligada={extrato} aoMudar={m(setExtrato)} />
      </div>
      {erro && <p className="g-erro" role="alert">{erro}</p>}
      {junto ? (mexeu && <p className="g-muted g-pp">Você mudou estas opções: salve no botão Salvar opções, no pé do grupo.</p>) : (
        <div className="g-fila">
          <button type="button" className="g-btn verde" onClick={() => void salvarAqui()} disabled={salvando || !mexeu}>{salvando ? "Salvando…" : "Salvar opções"}</button>
          {mexeu && <span className="g-muted g-pp">Você mudou as opções. Elas só valem depois de salvar.</span>}
        </div>
      )}
    </section>
  );
}
