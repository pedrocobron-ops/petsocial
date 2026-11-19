"use client";

import { ERRO_TELEFONE, mascaraTelefone, telefoneValido } from "@/lib/gestao/util";
import { esquecerOrigem, origemGuardada } from "@/lib/gestao/origem";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Porta from "@/components/gestao/porta";
import { ApagarMeuLogin, BaixarMeusDados } from "@/components/gestao/lgpd/meus-dados";
import { banco } from "@/lib/gestao/supabase";
import EscolherModulos from "@/components/gestao/modulos";
import { MODULOS, areasParaPrincipal, principalPara, type Modulo, type Principal } from "@/lib/gestao/modulos";
import { ArrowLeft, ArrowRight, ChevronDown, X } from "lucide-react";
import { EscolherPrincipal, FalaMozart, TrilhoBoasVindas, chaveBoasVindas } from "@/components/gestao/boas-vindas";
import { guardarLembrado } from "@/components/gestao/lembrado";
import { salvarOpcoes } from "@/lib/gestao/opcoes";
import { CHAVE_MODO_SIMPLES } from "@/lib/gestao/modo-simples";
import "@/components/gestao/guia-inicial.css";
import { limparNome } from "@/lib/gestao/validacao";

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

/** O que a pessoa já respondeu fica guardado no aparelho (por conta): recarregar a página ou voltar depois não perde nada. */
const RASCUNHO = "maestro-gestao-comecar";
/** Uma chave por conta: duas pessoas no mesmo aparelho não misturam as respostas. A chave antiga (uma só) ainda é lida. */
const rascunhoDe = (user: string) => `${RASCUNHO}-${user}`;
type Rascunho = { user: string; passo: 0 | 1; nome: string; seuNome: string; telefone: string; cidade: string; uf: string; modulos: Modulo[]; principal: Principal | null; simples?: boolean; ajuda?: boolean };

/**
 * Primeiro acesso: o Mozart pergunta o nome do negócio e o que ele faz, cria o pet shop e começa o teste de 7 dias.
 * A conversa continua dentro do aplicativo (cor e logo), nos primeiros passos do guia.
 */
export default function Comecar() {
  const router = useRouter();
  const [pronto, setPronto] = useState(false);
  // por que a pessoa caiu aqui sem pet shop: perdeu o acesso, o convite não foi achado ou é conta nova mesmo
  const [motivo, setMotivo] = useState<{ tipo: "retirado" | "saiu" | "sem-convite"; loja?: string; email?: string } | null>(null);
  const [conferindo, setConferindo] = useState(false);
  const [nome, setNome] = useState("");
  const [seuNome, setSeuNome] = useState("");
  const [telefone, setTelefone] = useState("");
  // "quero ajuda da equipe no WhatsApp durante o teste": só vale com o telefone preenchido; começa desmarcado
  const [ajuda, setAjuda] = useState(false);
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  // o mais comum já vem marcado; cada opção é um toque
  // nada vem marcado: cada negócio marca o que faz (uma creche não começa com banho e tosa ligado)
  const [modulos, setModulos] = useState<Modulo[]>([]);
  const [principal, setPrincipal] = useState<Principal | null>(null);
  // modo simples já vem marcado para quem cria o pet shop agora (dá para desmarcar aqui ou desligar em Meu pet shop)
  const [simples, setSimples] = useState(true);
  const [passo, setPasso] = useState<0 | 1>(0);
  const [userId, setUserId] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [indo, setIndo] = useState(false);

  useEffect(() => {
    const sb = banco();
    void (async () => {
      const { data } = await sb.auth.getSession();
      if (!data.session) { router.replace("/gestao/entrar"); return; }
      // quem foi convidado para uma equipe, ou já tem pet shop, vai direto para o aplicativo
      const { data: vinculos } = await sb.rpc("entrar");
      if (vinculos?.length) { router.replace("/gestao/app"); return; }
      const u = data.session.user;
      setSeuNome(String(u.user_metadata?.nome ?? ""));
      setUserId(u.id);
      // recarregou no meio da conversa: volta para onde estava, com o que já tinha respondido
      try {
        const r = JSON.parse(localStorage.getItem(rascunhoDe(u.id)) ?? localStorage.getItem(RASCUNHO) ?? sessionStorage.getItem(RASCUNHO) ?? "null") as Rascunho | null;
        if (r && r.user === u.id) {
          setNome(r.nome); setSeuNome(r.seuNome); setTelefone(r.telefone); setCidade(r.cidade); setUf(r.uf);
          setModulos(r.modulos.filter((m) => MODULOS.some((x) => x.id === m))); setPrincipal(r.principal); setPasso(r.passo === 1 ? 1 : 0);
          if (typeof r.simples === "boolean") setSimples(r.simples);
          setAjuda(r.ajuda === true);
        }
      } catch { /* sem rascunho: começa do zero */ }
      // esta conta já entrou num pet shop neste aparelho e agora não tem nenhum: o acesso foi retirado
      let antes: { user?: string; nome?: string } | null = null;
      try { antes = JSON.parse(localStorage.getItem("maestro-gestao-ultimo-acesso") ?? "null"); } catch { antes = null; }
      // saiu por vontade própria ("Sair desta equipe" deixa o nome do pet shop anotado nesta aba): a frase é outra
      let saiu: string | null = null;
      try { saiu = sessionStorage.getItem("maestro-gestao-saiu"); } catch { saiu = null; }
      if (saiu) setMotivo({ tipo: "saiu", loja: saiu });
      else if (antes?.user === u.id) setMotivo({ tipo: "retirado", loja: antes.nome });
      // criou a conta pelo link de um convite, mas o convite não entrou (link antigo sem código, vencido ou de outro e-mail)
      else if (u.user_metadata?.convidado) setMotivo({ tipo: "sem-convite", email: u.email });
      setPronto(true);
    })();
  }, [router]);

  useEffect(() => {
    if (!pronto || !userId) return;
    const r: Rascunho = { user: userId, passo, nome, seuNome, telefone, cidade, uf, modulos, principal, simples, ajuda };
    try { localStorage.setItem(rascunhoDe(userId), JSON.stringify(r)); localStorage.removeItem(RASCUNHO); } catch { /* sem armazenamento: só não lembra */ }
  }, [pronto, userId, passo, nome, seuNome, telefone, cidade, uf, modulos, principal, simples, ajuda]);

  const areas = areasParaPrincipal(modulos);
  const primeiro = seuNome.trim().split(/\s+/)[0] ?? "";

  function seguir(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (limparNome(nome).length < 2) { setErro("Me diga o nome do seu negócio para eu continuar."); return; }
    if (telefone.trim() && !telefoneValido(telefone)) { setErro(ERRO_TELEFONE); return; }
    setPasso(1);
  }

  /** Cria o pet shop (com o modo simples, se a pessoa deixou marcado) e segue para a cor, já dentro do aplicativo. */
  async function criar() {
    setErro(null);
    if (!modulos.length) { setErro("Marque pelo menos uma coisa que o seu negócio faz."); return; }
    const escolhida = principalPara(modulos, principal);
    if (areas.length > 1 && !escolhida) { setErro("Toque no que vocês mais fazem."); return; }
    setIndo(true);
    const { data: id, error } = await banco().rpc("criar_petshop", {
      p_nome: limparNome(nome), p_seu_nome: limparNome(seuNome), p_telefone: telefone.replace(/\D/g, ""), p_cidade: cidade, p_uf: uf,
      p_modulos: modulos, ...(escolhida ? { p_principal: escolhida } : {}),
    });
    if (error || !id) { setIndo(false); setErro("Não consegui criar o pet shop. Confira os dados e tente de novo."); return; }
    // modo simples: menos menus para começar (muda em Meu pet shop). Se não gravar agora, o pet shop abre completo, como sempre.
    if (simples) await salvarOpcoes(banco(), id, { [CHAVE_MODO_SIMPLES]: true }).catch(() => undefined);
    // de onde a pessoa veio (link do vendedor, campanha) e se pediu a ajuda da equipe: uma vez só, sem travar o começo
    const origem = origemGuardada();
    const querAjuda = ajuda && telefoneValido(telefone);
    if (origem || querAjuda) {
      await Promise.resolve(banco().rpc("origem_registrar", { p: id, p_vendedor: origem?.vendedor || undefined, p_utm: origem?.utm ?? {}, p_quer_ajuda: querAjuda })).then(() => esquecerOrigem(), () => undefined);
    }
    // a conversa continua dentro do aplicativo, pela cor
    guardarLembrado(chaveBoasVindas(id), "cor");
    guardarLembrado("maestro-gestao-petshop", id);
    try { localStorage.removeItem(rascunhoDe(userId)); localStorage.removeItem(RASCUNHO); sessionStorage.removeItem(RASCUNHO); } catch { /* tudo bem */ }
    router.replace("/gestao/app");
  }

  async function conferirDeNovo() {
    setConferindo(true);
    const { data: vinculos } = await banco().rpc("entrar");
    setConferindo(false);
    if (vinculos?.length) router.replace("/gestao/app");
    else setErro("Ainda não achei nenhum pet shop ligado a esta conta.");
  }
  async function sair() {
    try { sessionStorage.removeItem("maestro-gestao-saiu"); } catch { /* segue */ }
    await banco().auth.signOut();
    router.replace("/gestao/entrar");
  }

  if (!pronto) return <Porta titulo="Só um instante…"><span /></Porta>;

  if (motivo) {
    const retirado = motivo.tipo === "retirado";
    const saiu = motivo.tipo === "saiu";
    return (
      <Porta titulo={saiu ? `Você saiu da equipe${motivo.loja ? ` de ${motivo.loja}` : ""}` : retirado ? "Seu acesso a este pet shop foi retirado" : "Não achei o seu convite"}
        texto={saiu
          ? "O seu nome continua no histórico de lá. Este login não abre mais nenhum pet shop. Se não vai mais usar, você pode apagar o login."
          : retirado
          ? `Esta conta não está mais ligada ${motivo.loja ? `ao ${motivo.loja}` : "ao pet shop"}. Fale com o dono para ele liberar de novo, em Equipe.`
          : `A conta ${motivo.email ?? ""} foi criada, mas ainda não entrou em nenhuma equipe. Peça ao dono do pet shop para mandar o convite de novo, em Equipe, e abra o link novo: ele vale por 7 dias e é feito para o e-mail ${motivo.email ?? "desta conta"}.`}>
        <div className="g-pilha p">
          {erro && <p className="g-erro" role="alert">{erro}</p>}
          {!saiu && <button type="button" className="g-btn pri cheio" onClick={() => void conferirDeNovo()} disabled={conferindo}>{conferindo ? "Conferindo…" : "O dono já liberou: tentar de novo"}</button>}
          <button type="button" className={`g-btn ${saiu ? "pri" : "sec"} cheio`} onClick={() => void sair()}>Sair desta conta</button>
          {/* quem ficou sem pet shop: baixa o que guardamos dele e, se quiser, apaga o próprio login */}
          <BaixarMeusDados className="g-btn fantasma cheio" />
          <ApagarMeuLogin aoApagar={() => { try { sessionStorage.removeItem("maestro-gestao-saiu"); localStorage.removeItem("maestro-gestao-ultimo-acesso"); } catch { /* segue */ } router.replace("/gestao/entrar"); }} />
          <p className="g-muted g-p">Quer abrir um pet shop seu, separado desse? <button type="button" className="g-link" onClick={() => { setErro(null); setMotivo(null); try { sessionStorage.removeItem("maestro-gestao-saiu"); } catch { /* segue */ } }}>Criar um pet shop novo</button></p>
        </div>
      </Porta>
    );
  }

  return (
    <div className="g-bv-pagina">
      <div className="g-guia-caixa">
        <header className="g-guia-topo">
          <TrilhoBoasVindas agora={passo + 1} />
          <button type="button" className="g-ico" onClick={() => void sair()} aria-label="Sair desta conta" title="Sair desta conta"><X /></button>
        </header>

        {passo === 0 ? (
          <form onSubmit={seguir}>
            <div className="g-guia-corpo">
              <FalaMozart>Oi! Eu sou o Mozart. Quero te conhecer melhor para deixar o sistema com a sua cara.</FalaMozart>
              <div>
                <p className="g-rotulo">Pergunta 1 de 4</p>
                <h1 className="g-guia-h">Como se chama o seu negócio?</h1>
              </div>
              <label className="g-campo"><span>Nome do pet shop, banho e tosa, creche ou hotel</span>
                <input className="g-input" required minLength={2} maxLength={80} placeholder="Ex.: Banho & Cia ou Creche Patinhas" value={nome} onChange={(e) => { setNome(e.target.value); setErro(null); }} autoFocus enterKeyHint="next" />
                <small>É o nome que aparece no painel e no que o cliente recebe.</small>
              </label>
              <label className="g-campo"><span>E como eu chamo você?</span>
                <input className="g-input" required maxLength={80} value={seuNome} onChange={(e) => setSeuNome(e.target.value)} enterKeyHint="next" />
              </label>
              <label className="g-campo"><span>WhatsApp do pet shop (se quiser)</span>
                <input className="g-input" name="whatsapp" type="tel" inputMode="tel" autoComplete="tel" placeholder="(11) 99999-9999" value={telefone} onChange={(e) => { setTelefone(mascaraTelefone(e.target.value)); setErro(null); }} enterKeyHint="next" />
                <small>Aparece nas mensagens que você manda aos clientes e no seu link. Não mandamos propaganda.</small>
              </label>
              <label className="g-check" data-teste="quero-ajuda">
                <input type="checkbox" name="quero_ajuda" checked={ajuda && telefone.trim() !== ""} disabled={telefone.trim() === ""} onChange={(e) => setAjuda(e.target.checked)} />
                <span>Quero ajuda da equipe Maestro Pet pelo WhatsApp durante o teste.
                  <small className="g-muted" style={{ display: "block", marginTop: 2 }}>{telefone.trim() === "" ? "Para marcar, escreva o WhatsApp acima." : "Marcando, a nossa equipe pode te chamar nesse número para ajudar durante o teste: mostrar como marcar, trazer o caderno, tirar dúvida. Não mandamos propaganda."}</small>
                </span>
              </label>
              <details className="g-bv-mais">
                <summary>Cidade e estado (se quiser)<ChevronDown /></summary>
                <div className="dentro">
                  <div className="dupla">
                    <label className="g-campo"><span>Cidade</span>
                      <input className="g-input" value={cidade} onChange={(e) => setCidade(e.target.value)} />
                    </label>
                    <label className="g-campo"><span>Estado</span>
                      <select className="g-select" value={uf} onChange={(e) => setUf(e.target.value)}>
                        <option value="">Escolha</option>
                        {UFS.map((u) => <option key={u}>{u}</option>)}
                      </select>
                    </label>
                  </div>
                </div>
              </details>
              <p className="g-bv-nota">Aqui você cria um pet shop novo, com 7 dias grátis. Foi convidado para a equipe de um pet shop que já existe? Então não crie outro: abra o link do convite que o dono mandou (ou peça para ele mandar de novo).</p>
            </div>
            {erro && <p className="g-erro g-guia-erro" role="alert">{erro}</p>}
            <footer className="g-guia-pe">
              <button className="g-btn pri">Continuar<ArrowRight /></button>
            </footer>
          </form>
        ) : (
          <>
            <div className="g-guia-corpo">
              <FalaMozart>{primeiro ? `Prazer, ${primeiro}! ` : "Prazer! "}Agora me conta o que o seu negócio faz. Eu deixo na frente só o que você usa.</FalaMozart>
              <div>
                <p className="g-rotulo">Pergunta 2 de 4</p>
                <h1 className="g-guia-h">O que o seu negócio faz?</h1>
                <p className="g-muted g-p">Marque tudo o que vale. Dá para mudar depois.</p>
              </div>
              <EscolherModulos valor={modulos} aoMudar={(v) => { setModulos(v); setErro(null); }} comApoio />
              {areas.length > 1 && (
                <div className="g-bv-qual">
                  <h3>E o que vocês mais fazem?</h3>
                  <EscolherPrincipal modulos={modulos} valor={principalPara(modulos, principal)} aoMudar={(v) => { setPrincipal(v); setErro(null); }} />
                  <p>Isso aparece primeiro no menu e na tela inicial. O resto continua à mão.</p>
                </div>
              )}
              <label className="g-bv-simples">
                <input type="checkbox" checked={simples} onChange={(e) => setSimples(e.target.checked)} />
                <span><b>Começar no modo simples</b><small>Menos botões e menus no começo. Nada fica de fora: o resto vai para Outras áreas, e dá para desligar em Meu pet shop.</small></span>
              </label>
            </div>
            {erro && <p className="g-erro g-guia-erro" role="alert">{erro}</p>}
            {/* esta pergunta não fica para depois: sem marcar o que o negócio faz, o pet shop não nasce (era "Faço depois" que dava erro) */}
            <footer className="g-guia-pe">
              <button type="button" className="g-btn fantasma g-guia-volta" onClick={() => { setErro(null); setPasso(0); }} disabled={indo} aria-label="Voltar à pergunta anterior"><ArrowLeft /></button>
              <button type="button" className="g-btn pri" onClick={() => void criar()} disabled={indo}>{indo ? "Um instante…" : "Continuar"}<ArrowRight /></button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
