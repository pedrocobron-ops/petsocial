"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import {
  experienciaDe, extratoDoPetLigado, OPCAO_DESCONTO_IRMAO, OPCAO_EXPERIENCIA, OPCAO_EXPERIENCIA_PRECO, OPCAO_EXTRATO_PET, precoDaExperiencia, regraIrmaoDe,
  type RegraIrmao,
} from "@/lib/gestao/creche";
import { usaModulo } from "@/lib/gestao/modulos";
import { salvarOpcoes } from "@/lib/gestao/opcoes";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { avisarMudanca, Campo, CampoValor, useAvisos, useSomenteLeitura } from "../ui";
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
const lerNumero = (s: string) => { const n = Number(s.replace(",", ".")); return s.trim() && Number.isFinite(n) && n > 0 ? n : null; };

export default function OpcoesCreche() {
  const { sb, petshop, souDono, recarregarBase } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [exp, setExp] = useState(() => experienciaDe(petshop));
  const [preco, setPreco] = useState<number | null>(() => precoDaExperiencia(petshop));
  const [irmao, setIrmao] = useState<RegraIrmao>(() => regraIrmaoDe(petshop));
  const [textoIrmao, setTextoIrmao] = useState(() => { const v = regraIrmaoDe(petshop).valor; return v == null ? "" : String(v).replace(".", ","); });
  const [extrato, setExtrato] = useState(() => extratoDoPetLigado(petshop));
  const [mexeu, setMexeu] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  if (!souDono || !usaModulo(petshop, "creche")) return null;
  const m = <T,>(f: (v: T) => void) => (v: T) => { f(v); setMexeu(true); setErro(null); };

  async function salvar() {
    if (somenteLeitura() || salvando) return;
    if (irmao.ativo && (irmao.valor == null || (irmao.tipo === "pct" && irmao.valor > 100))) {
      return setErro(irmao.tipo === "pct" ? "Escreva o desconto para irmãos, de 1 a 100%." : "Escreva o valor do desconto para irmãos.");
    }
    if (exp.ativo && preco != null && preco > 99999) return setErro("Confira o preço do dia de experiência.");
    setErro(null); setSalvando(true);
    const antes = regraIrmaoDe(petshop);
    const mudouIrmao = antes.ativo !== irmao.ativo || antes.tipo !== irmao.tipo || antes.valor !== irmao.valor || antes.qual !== irmao.qual;
    try {
      await salvarOpcoes(sb, petshop.id, {
        [OPCAO_EXPERIENCIA]: exp,
        [OPCAO_EXPERIENCIA_PRECO]: exp.ativo ? preco ?? 0 : precoDaExperiencia(petshop) ?? 0,
        [OPCAO_DESCONTO_IRMAO]: irmao,
        [OPCAO_EXTRATO_PET]: extrato,
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
      avisar(`Opções da creche salvas.${refeitas ? ` ${refeitas === 1 ? "1 mensalidade em aberto foi refeita" : `${refeitas} mensalidades em aberto foram refeitas`} com a regra nova do desconto para irmãos.` : ""}`);
    } catch (x) { avisarErro(x); } finally { setSalvando(false); }
  }

  return (
    <section className="g-card g-pilha" id="opcoes-creche">
      <div className="g-mp-t">
        <Tile icone={Sparkles} tom="manteiga" />
        <div><h2>Mais opções da creche</h2><p className="g-muted g-p">Ligue só o que você usa: desligado, nada aparece nas telas.</p></div>
      </div>
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
            <Campo rotulo={irmao.tipo === "pct" ? "Desconto (%)" : "Desconto (R$ por mês)"}>
              <input className="g-input g-tab" inputMode="decimal" value={textoIrmao} placeholder={irmao.tipo === "pct" ? "%" : "0,00"} aria-label="Valor do desconto para irmãos"
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

        <Opcao titulo="Extrato do mês por cachorro" frase="Na ficha do pet, o extrato do mês de cada cão: presenças, faltas, reposições, dias extras e taxas, para imprimir ou mandar pelo WhatsApp. Quem não vê o financeiro vê só as presenças, sem valores."
          ligada={extrato} aoMudar={m(setExtrato)} />
      </div>
      {erro && <p className="g-erro" role="alert">{erro}</p>}
      <div className="g-fila">
        <button type="button" className="g-btn verde" onClick={() => void salvar()} disabled={salvando || !mexeu}>{salvando ? "Salvando…" : "Salvar opções"}</button>
        {mexeu && <span className="g-muted g-pp">Você mudou as opções. Elas só valem depois de salvar.</span>}
      </div>
    </section>
  );
}
