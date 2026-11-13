"use client";

import { ERRO_TELEFONE, mascaraTelefone, telefoneValido } from "@/lib/gestao/util";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Porta from "@/components/gestao/porta";
import { banco } from "@/lib/gestao/supabase";
import EscolherModulos from "@/components/gestao/modulos";
import { MODULOS, areasParaPrincipal, principalPara, type Modulo, type Principal } from "@/lib/gestao/modulos";
import { ArrowLeft, ArrowRight, ChevronDown, X } from "lucide-react";
import { EscolherPrincipal, FalaMozart, TrilhoBoasVindas, chaveBoasVindas } from "@/components/gestao/boas-vindas";
import { guardarLembrado } from "@/components/gestao/lembrado";
import "@/components/gestao/guia-inicial.css";

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

/** O que a pessoa já respondeu fica guardado enquanto a aba está aberta: recarregar a página não perde nada. */
const RASCUNHO = "maestro-gestao-comecar";
type Rascunho = { user: string; passo: 0 | 1; nome: string; seuNome: string; telefone: string; cidade: string; uf: string; modulos: Modulo[]; principal: Principal | null };

/**
 * Primeiro acesso: o Mozart pergunta o nome do negócio e o que ele faz, cria o pet shop e começa o teste de 7 dias.
 * A conversa continua dentro do aplicativo (cor e logo), nos primeiros passos do guia.
 */
export default function Comecar() {
  const router = useRouter();
  const [pronto, setPronto] = useState(false);
  // por que a pessoa caiu aqui sem pet shop: perdeu o acesso, o convite não foi achado ou é conta nova mesmo
  const [motivo, setMotivo] = useState<{ tipo: "retirado" | "sem-convite"; loja?: string; email?: string } | null>(null);
  const [conferindo, setConferindo] = useState(false);
  const [nome, setNome] = useState("");
  const [seuNome, setSeuNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  // o mais comum já vem marcado; cada opção é um toque
  const [modulos, setModulos] = useState<Modulo[]>(["banho_tosa"]);
  const [principal, setPrincipal] = useState<Principal | null>(null);
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
        const r = JSON.parse(sessionStorage.getItem(RASCUNHO) ?? "null") as Rascunho | null;
        if (r && r.user === u.id) {
          setNome(r.nome); setSeuNome(r.seuNome); setTelefone(r.telefone); setCidade(r.cidade); setUf(r.uf);
          setModulos(r.modulos.filter((m) => MODULOS.some((x) => x.id === m))); setPrincipal(r.principal); setPasso(r.passo === 1 ? 1 : 0);
        }
      } catch { /* sem rascunho: começa do zero */ }
      // esta conta já entrou num pet shop neste aparelho e agora não tem nenhum: o acesso foi retirado
      let antes: { user?: string; nome?: string } | null = null;
      try { antes = JSON.parse(localStorage.getItem("maestro-gestao-ultimo-acesso") ?? "null"); } catch { antes = null; }
      if (antes?.user === u.id) setMotivo({ tipo: "retirado", loja: antes.nome });
      // criou a conta pelo link de um convite, mas nenhum convite bate com este e-mail
      else if (u.user_metadata?.convidado) setMotivo({ tipo: "sem-convite", email: u.email });
      setPronto(true);
    })();
  }, [router]);

  useEffect(() => {
    if (!pronto || !userId) return;
    const r: Rascunho = { user: userId, passo, nome, seuNome, telefone, cidade, uf, modulos, principal };
    try { sessionStorage.setItem(RASCUNHO, JSON.stringify(r)); } catch { /* sem armazenamento: só não lembra */ }
  }, [pronto, userId, passo, nome, seuNome, telefone, cidade, uf, modulos, principal]);

  const areas = areasParaPrincipal(modulos);
  const primeiro = seuNome.trim().split(/\s+/)[0] ?? "";

  function seguir(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (nome.trim().length < 2) { setErro("Me diga o nome do seu negócio para eu continuar."); return; }
    if (telefone.trim() && !telefoneValido(telefone)) { setErro(ERRO_TELEFONE); return; }
    setPasso(1);
  }

  /** Cria o pet shop. `depois`: a pessoa deixou a pergunta para depois; o sistema abre com tudo, na ordem de sempre. */
  async function criar(depois: boolean) {
    setErro(null);
    if (!depois && !modulos.length) { setErro("Marque pelo menos uma coisa que o seu negócio faz."); return; }
    const escolhida = depois ? null : principalPara(modulos, principal);
    if (!depois && areas.length > 1 && !escolhida) { setErro("Toque em qual delas é a atividade principal."); return; }
    setIndo(true);
    const { data: id, error } = await banco().rpc("criar_petshop", {
      p_nome: nome, p_seu_nome: seuNome, p_telefone: telefone.replace(/\D/g, ""), p_cidade: cidade, p_uf: uf,
      ...(depois ? {} : { p_modulos: modulos, ...(escolhida ? { p_principal: escolhida } : {}) }),
    });
    if (error || !id) { setIndo(false); setErro("Não consegui criar o pet shop. Confira os dados e tente de novo."); return; }
    // a conversa continua dentro do aplicativo, pela cor
    guardarLembrado(chaveBoasVindas(id), "cor");
    guardarLembrado("maestro-gestao-petshop", id);
    try { sessionStorage.removeItem(RASCUNHO); } catch { /* tudo bem */ }
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
    await banco().auth.signOut();
    router.replace("/gestao/entrar");
  }

  if (!pronto) return <Porta titulo="Só um instante…"><span /></Porta>;

  if (motivo) {
    const retirado = motivo.tipo === "retirado";
    return (
      <Porta titulo={retirado ? "Seu acesso a este pet shop foi retirado" : "Não achei o seu convite"}
        texto={retirado
          ? `Esta conta não está mais ligada ${motivo.loja ? `ao ${motivo.loja}` : "ao pet shop"}. Fale com o dono para ele liberar de novo, em Equipe.`
          : `Nenhum pet shop convidou o e-mail ${motivo.email ?? "desta conta"}. Peça ao dono para conferir se o convite foi feito para este mesmo e-mail e se você já confirmou o e-mail pelo link que enviamos.`}>
        <div className="g-pilha p">
          {erro && <p className="g-erro" role="alert">{erro}</p>}
          <button type="button" className="g-btn pri cheio" onClick={() => void conferirDeNovo()} disabled={conferindo}>{conferindo ? "Conferindo…" : "O dono já liberou: tentar de novo"}</button>
          <button type="button" className="g-btn sec cheio" onClick={() => void sair()}>Sair desta conta</button>
          <p className="g-muted g-p">Quer abrir um pet shop seu, separado desse? <button type="button" className="g-link" onClick={() => { setErro(null); setMotivo(null); }}>Criar um pet shop novo</button></p>
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
              <details className="g-bv-mais" open={Boolean(telefone || cidade || uf) || undefined}>
                <summary>WhatsApp e cidade (se quiser)<ChevronDown /></summary>
                <div className="dentro">
                  <label className="g-campo"><span>WhatsApp do pet shop</span>
                    <input className="g-input" type="tel" inputMode="tel" placeholder="(11) 99999-9999" value={telefone} onChange={(e) => { setTelefone(mascaraTelefone(e.target.value)); setErro(null); }} />
                  </label>
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
              <p className="g-bv-nota">Aqui você cria um pet shop novo, com 7 dias grátis. Foi convidado para a equipe de um pet shop que já existe? Então não crie outro: peça ao dono para conferir o e-mail do convite.</p>
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
              <EscolherModulos valor={modulos} aoMudar={(v) => { setModulos(v); setErro(null); }} />
              {areas.length > 1 && (
                <div className="g-bv-qual">
                  <h3>E qual é a atividade principal?</h3>
                  <EscolherPrincipal modulos={modulos} valor={principalPara(modulos, principal)} aoMudar={(v) => { setPrincipal(v); setErro(null); }} />
                  <p>Ela aparece primeiro no menu e na tela inicial. As outras continuam à mão.</p>
                </div>
              )}
            </div>
            {erro && <p className="g-erro g-guia-erro" role="alert">{erro}</p>}
            <footer className="g-guia-pe">
              <button type="button" className="g-btn fantasma g-guia-volta" onClick={() => { setErro(null); setPasso(0); }} disabled={indo} aria-label="Voltar à pergunta anterior"><ArrowLeft /></button>
              <button type="button" className="g-btn fantasma g-guia-depois" onClick={() => void criar(true)} disabled={indo}>Faço depois</button>
              <button type="button" className="g-btn pri" onClick={() => void criar(false)} disabled={indo}>{indo ? "Criando…" : "Criar meu pet shop"}<ArrowRight /></button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
