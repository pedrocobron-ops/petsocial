"use client";

import { useState } from "react";
import { Check, EyeOff, Link2 } from "lucide-react";
import { CAMPO_DO_LINK, PERGUNTA_DO_LINK, SERVICOS_BANHO_TOSA, linkPergunta, modulosDe, principalDe, principalPara, telasDoMenu, type AreaDoLink, type Modulo, type Principal } from "@/lib/gestao/modulos";
import { corLivre } from "@/lib/gestao/cores";
import { useGestao } from "./contexto";
import EscolherModulos from "./modulos";
import { Folha, avisarMudanca, ok, useAvisos, useSomenteLeitura } from "./ui";

export { linkPergunta, type AreaDoLink };

/** "A, B e C". */
export const emLista = (l: string[]) => (l.length < 2 ? l.join("") : `${l.slice(0, -1).join(", ")} e ${l[l.length - 1]}`);

/**
 * Grava o que o negócio faz (`petshops.modulos`) e a área principal. Usado pelo cartão O que você usa (Meu pet shop) e pela
 * folha Personalizar do menu. Ligar creche ou hotel não mexe no link do cliente: só as áreas de `noLink` (que a pessoa
 * marcou em "Ligar no link") passam a receber pedido pelo link. Banho e tosa traz os serviços mais comuns quando a lista
 * está vazia (cada um com uma cor que nenhum outro serviço usa). Desligar só esconde.
 * Devolve as áreas da casa ligadas agora e as que entraram no link.
 */
export function useSalvarModulos() {
  const { sb, petshop, servicos, recarregarBase } = useGestao();
  return async function salvarModulos(valor: Modulo[], principal: Principal | null, noLink: AreaDoLink[] = []) {
    const salvo = modulosDe(petshop);
    const novas = (["creche", "hotel"] as const).filter((m) => valor.includes(m) && !salvo.includes(m));
    const entram = petshop.link_ativo ? noLink.filter((m) => valor.includes(m) && !petshop[CAMPO_DO_LINK[m]]) : [];
    const link = Object.fromEntries(entram.map((m) => [CAMPO_DO_LINK[m], true]));
    ok(await sb.from("petshops").update({ modulos: valor, principal, ...link }).eq("id", petshop.id).select("id"));
    // passou a fazer banho e tosa e a lista de serviços está vazia: entram os mais comuns, sem preço
    if (valor.includes("banho_tosa") && !servicos.some((s) => !["creche", "hotel"].includes(s.categoria))) {
      const cores = servicos.filter((s) => s.ativo).map((s) => s.cor);
      const linhas = SERVICOS_BANHO_TOSA.map((s) => {
        const cor = cores.some((c) => c?.toLowerCase() === s.cor) ? corLivre(cores) : s.cor;
        cores.push(cor);
        return { ...s, cor, petshop_id: petshop.id };
      });
      ok(await sb.from("servicos").insert(linhas).select("id"));
    }
    await recarregarBase();
    avisarMudanca();
    return { novas, noLink: entram };
  };
}

/** A pergunta do link, com um botão por área: aparece só quando ligar creche ou hotel poderia mudar o link. */
export function PerguntaDoLink({ areas, marcadas, aoMudar }: { areas: AreaDoLink[]; marcadas: AreaDoLink[]; aoMudar: (v: AreaDoLink[]) => void }) {
  if (!areas.length) return null;
  return (
    <div className="g-mod-link" role="group" aria-label="Link do cliente">
      {areas.map((a) => {
        const on = marcadas.includes(a);
        return (
          <div key={a} className="g-pilha p">
            <p>{PERGUNTA_DO_LINK[a]}</p>
            <div className="g-chips">
              <button type="button" className="g-chip" aria-pressed={on} onClick={() => aoMudar(on ? marcadas.filter((x) => x !== a) : [...marcadas, a])}>
                {on ? <><Check aria-hidden />Vai ligar no link</> : <><Link2 aria-hidden />Ligar no link</>}
              </button>
            </div>
          </div>
        );
      })}
      <small>Sem tocar, o link do cliente continua como está. Dá para mudar depois em Link do cliente.</small>
    </div>
  );
}

/** Folha "O que o seu negócio faz?": aberta pelo Personalizar ao lado de Dia a dia, no menu. Só o dono. */
export default function PersonalizarMenu({ aoFechar }: { aoFechar: () => void }) {
  const { petshop } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const salvarModulos = useSalvarModulos();
  const salvo = modulosDe(petshop);
  const [valor, setValor] = useState<Modulo[]>(salvo);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const mudou = valor.length !== salvo.length || valor.some((m) => !salvo.includes(m));
  // creche ou hotel ligados agora, com o link do cliente ligado: pergunta antes de mudar o link
  const perguntaLink = linkPergunta(petshop, valor);
  const [noLink, setNoLink] = useState<AreaDoLink[]>([]);

  async function salvar() {
    if (somenteLeitura() || salvando) return;
    if (!valor.length) return setErro("Marque pelo menos uma coisa que o seu negócio faz.");
    if (!mudou) return aoFechar();
    setErro(null);
    setSalvando(true);
    try {
      // a área principal continua a mesma enquanto estiver ligada; com uma área só, é ela
      const principal = principalPara(valor, principalDe(petshop));
      const { novas, noLink: entraram } = await salvarModulos(valor, principal, noLink.filter((a) => perguntaLink.includes(a)));
      const telas = telasDoMenu({ modulos: valor, principal });
      const nomes = (l: readonly string[]) => (l.length > 1 ? "creche e hotel" : l[0] === "creche" ? "creche" : "hotel");
      const fora = perguntaLink.filter((a) => !entraram.includes(a));
      avisar(`Pronto: o menu agora mostra ${emLista(telas)}.${novas.length ? ` A diária e as vagas ${novas.length > 1 ? "da creche e do hotel" : novas[0] === "creche" ? "da creche" : "do hotel"} ficam em Meu pet shop.` : ""}${entraram.length ? ` O link do cliente passou a receber pedido de ${nomes(entraram)}.` : ""}${fora.length ? ` O link do cliente continua sem ${nomes(fora)}.` : ""}`);
      aoFechar();
    } catch (x) { avisarErro(x); setSalvando(false); }
  }

  return (
    <Folha titulo="O que o seu negócio faz?" aoFechar={aoFechar}
      rodape={<>
        <button className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button className="g-btn pri" onClick={() => void salvar()} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
      </>}>
      <div className="g-pilha">
        <p className="g-muted g-p">Toque para ligar ou desligar. O menu Dia a dia mostra só o que estiver ligado. Cada opção diz em que item do menu ela fica.</p>
        <EscolherModulos valor={valor} aoMudar={(v) => { setValor(v); setErro(null); }} comApoio comMenu />
        <PerguntaDoLink areas={perguntaLink} marcadas={noLink} aoMudar={setNoLink} />
        <p className="g-mod-nota"><EyeOff aria-hidden />Desligar só esconde; nada é apagado. A tela desligada fica em Outras áreas, no fim do menu, e volta quando você ligar de novo.</p>
        {erro && <p className="g-erro" role="alert">{erro}</p>}
      </div>
    </Folha>
  );
}
