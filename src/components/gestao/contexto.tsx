"use client";

import { enderecoEmLinha } from "@/lib/gestao/endereco";
import { lerBase } from "@/lib/gestao/reservado";
import { temCheckout, usarLinksDoBanco } from "@/lib/gestao/planos";
import { Selo } from "./marca";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { banco, configurado, type Banco } from "@/lib/gestao/supabase";
import type { Petshop, Profissional, Servico } from "@/lib/gestao/tipos";
import { podeArea, veCusto, type Area } from "@/lib/gestao/acessos";
import { registrarAcesso } from "@/lib/gestao/registro-acesso";
import { definirLoja } from "@/lib/gestao/erros-navegador";
import { fmtTelefone } from "@/lib/gestao/util";
import { comPrazo, definirDonoDaMemoria, esquecerTudo } from "@/lib/gestao/dados-memoria";
import { definirImpressaoDoComprovante, papelDoComprovante } from "@/lib/gestao/comprovante-papel";
import { pendentes, type Documento } from "@/lib/gestao/documentos";
import Reaceite from "./reaceite";

export type Gestao = {
  sb: Banco;
  user: User;
  petshop: Petshop;
  /** Quem está logado, dentro da equipe deste pet shop. */
  eu: Profissional;
  equipe: Profissional[];
  servicos: Servico[];
  souDono: boolean;
  /** Mexe com dinheiro: tem Caixa, Financeiro ou Relatórios. Recebe, vende e vê o que entrou hoje. */
  vejoFinanceiro: boolean;
  /** Dono, ou quem tem Financeiro ou Relatórios: vê todo o dinheiro (despesas, contas, histórico, meta) e corrige valor já recebido. */
  cuidoDoFinanceiro: boolean;
  /** Vê o custo e a margem dos produtos: dono, quem cuida do financeiro ou quem tem "Ver custo e margem" (o banco confere de novo). */
  vejoCusto: boolean;
  /** A pessoa abre esta área do aplicativo? (o dono libera área por área em Equipe) */
  posso: (area: Area) => boolean;
  /** false = teste vencido, assinatura cancelada ou conta marcada para ser apagada: a conta fica só para consulta. */
  liberado: boolean;
  /** A conta está marcada para ser apagada ("Encerrar e apagar a conta", em Meu pet shop)? Até a data, fica só para consulta. */
  exclusao: Exclusao | null;
  /** Quem está logado é o titular da conta (o primeiro dono)? Só ele pede para apagar a conta e não sai da equipe. */
  souTitular: boolean;
  /** Dias que faltam de teste (null quando não está em teste). */
  diasDeTeste: number | null;
  /**
   * O botão Assinar leva direto à página de pagamento (o administrador ligou e existe link)? Sem isso, a pessoa assina
   * falando com a equipe pelo WhatsApp. O fim do teste vale nos dois casos (mesma regra do banco, em `acesso_liberado`).
   */
  assinaturaAberta: boolean;
  /** Assinatura atrasada: o dia em que a conta fica só para consulta e quantos dias de tolerância são (null = não está atrasada). */
  atraso: { travaEm: Date; dias: number } | null;
  /** Recarrega pet shop, equipe e serviços depois de uma alteração. */
  recarregarBase: () => Promise<void>;
  sair: () => Promise<void>;
};

export type Exclusao = { pedido_em: string; apagar_em: string; pedido_nome: string | null };

const Ctx = createContext<Gestao | null>(null);

export function useGestao(): Gestao {
  const v = useContext(Ctx);
  if (!v) throw new Error("useGestao fora do GestaoProvider");
  return v;
}

const CHAVE_LOJA = "maestro-gestao-petshop";
/** Último pet shop aberto neste aparelho (conta:pet shop): só para adiantar a leitura, não decide qual abre. */
const CHAVE_ULTIMA = "maestro-gestao-ultima-loja";
/**
 * Nome do último pet shop aberto neste aparelho: só para a tela de abertura dizer "Abrindo o Banho e Tosa da Cida…" já no
 * HTML, antes do JavaScript baixar (no celular com internet fraca, são vários segundos). Um script pequeno lê e escreve o
 * texto (textContent, nunca HTML); sem o nome guardado, fica "Abrindo o seu pet shop…".
 */
const CHAVE_NOME = "maestro-gestao-nome-loja";
const SCRIPT_DO_NOME = `try{var n=localStorage.getItem(${JSON.stringify(CHAVE_NOME)}),e=document.getElementById("g-abrindo");if(n&&e)e.textContent="Abrindo "+n.slice(0,80)+"\u2026"}catch(x){}`;
/** Depois de quanto tempo a tela de abertura explica a demora e oferece "Tentar de novo". */
export const DEMORA_DA_ABERTURA_MS = 8000;
/** Depois de quanto tempo sem conseguir abrir a tela desiste de esperar e mostra o erro (com "Tentar de novo"). */
const LIMITE_DA_ABERTURA_MS = 45_000;
/** Prazo para o aparelho dizer se há login guardado (se outra aba travou essa conferência, não fica esperando para sempre). */
const PRAZO_DO_LOGIN_MS = 15_000;
/**
 * A saída da tela de abertura também vale antes de o aplicativo baixar (internet fraca): um script pequeno mostra o aviso
 * depois de 8 segundos e liga o botão, que recarrega a página.
 */
const SCRIPT_DA_DEMORA = `setTimeout(function(){try{var d=document.getElementById("g-abrindo-demora");if(d){d.style.display="";var b=d.querySelector("button");if(b&&!b.onclick)b.onclick=function(){location.reload()}}}catch(x){}},${DEMORA_DA_ABERTURA_MS});`;
const ETAPAS = {
  baixando: "O aplicativo ainda está baixando. A internet parece fraca.",
  login: "Ainda conferindo o seu login. A internet parece fraca ou o servidor demorou para responder.",
  conta: "Ainda buscando a sua conta. O servidor está demorando para responder.",
  loja: "Ainda buscando os dados do pet shop. O servidor está demorando para responder.",
} as const;

const SEM_BANCO = "O banco de dados ainda não foi configurado neste endereço.";

let soConsulta = false;
/** A conta está só para consulta (teste vencido ou assinatura cancelada)? Para as mensagens de erro, fora dos componentes. */
export const contaSoConsulta = () => soConsulta;

export function GestaoProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const sb = banco();
  const [user, setUser] = useState<User | null>(null);
  const [eu, setEu] = useState<Profissional | null>(null);
  const [petshop, setPetshop] = useState<Petshop | null>(null);
  const [equipe, setEquipe] = useState<Profissional[]>([]);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  /** A assinatura abriu (o fim do teste vale)? null = não deu para ler do banco: segue a regra antiga, pelos links. */
  const [aberta, setAberta] = useState<boolean | null>(null);
  /** Assinatura atrasada: quando trava (função `assinatura_situacao`). null = não está atrasada ou o banco ainda não diz. */
  const [atraso, setAtraso] = useState<{ loja: string; travaEm: Date; dias: number } | null>(null);
  /** Documentos com versão nova que esta pessoa ainda não aceitou: com algum, o aplicativo mostra a tela de aceite. */
  const [faltam, setFaltam] = useState<Documento[]>([]);
  const [exclusao, setExclusao] = useState<Exclusao | null>(null);
  /** Em que passo a abertura está (para dizer o que está acontecendo quando demora) e quantas vezes a pessoa pediu de novo. */
  const [etapa, setEtapa] = useState<keyof typeof ETAPAS>("baixando");
  const [tentativa, setTentativa] = useState(0);
  const [demorou, setDemorou] = useState(false);
  /** A conta está marcada para ser apagada? (banco antes da atualização ou falha na leitura: segue como não marcada) */
  const lerExclusao = useCallback((petshopId: string) => sb.rpc("conta_exclusao_ver", { p_petshop: petshopId }).then(
    (r) => (r.error || !r.data ? null : (r.data as unknown as Exclusao)), () => null), [sb]);

  const buscarBase = useCallback(async (petshopId: string) => {
    // pet shop, equipe e serviços numa ida só ao banco (com o banco antes da atualização, um pedido por parte, como antes)
    const b = await lerBase(sb, petshopId);
    if (b.erro || !b.petshop) throw b.erro ?? new Error("pet shop");
    return { petshop: b.petshop, equipe: b.equipe, servicos: b.servicos };
  }, [sb]);
  const aplicarBase = useCallback((b: Awaited<ReturnType<typeof buscarBase>>) => {
    setPetshop(b.petshop);
    try { localStorage.setItem(CHAVE_NOME, b.petshop.nome); } catch { /* sem armazenamento: a abertura fica com o texto geral */ }
    setEquipe(b.equipe);
    setServicos(b.servicos);
    return b.equipe;
  }, []);
  const carregarBase = useCallback(async (petshopId: string) => aplicarBase(await buscarBase(petshopId)), [buscarBase, aplicarBase]);

  useEffect(() => {
    let vivo = true;
    // abertura que não termina: aos 8 s a tela explica e oferece "Tentar de novo"; aos 45 s desiste de esperar e mostra o erro
    setDemorou(false);
    const desde = tentativa === 0 && typeof performance !== "undefined" ? performance.now() : 0;
    const tDemora = setTimeout(() => { if (vivo) setDemorou(true); }, Math.max(0, DEMORA_DA_ABERTURA_MS - desde));
    const tLimite = setTimeout(() => { if (vivo) setErro("A abertura demorou demais. A internet pode estar fraca, ou o servidor não respondeu. Tente de novo."); }, LIMITE_DA_ABERTURA_MS);
    const terminou = () => { clearTimeout(tDemora); clearTimeout(tLimite); };
    (async () => {
      if (!configurado) { terminou(); setErro(SEM_BANCO); return; }
      setEtapa("login");
      let data: Awaited<ReturnType<typeof sb.auth.getSession>>["data"];
      try { data = (await comPrazo(sb.auth.getSession(), PRAZO_DO_LOGIN_MS)).data; }
      catch { if (vivo) { terminou(); setErro("Não consegui conferir o seu login neste aparelho. Tente de novo; se continuar, feche as outras abas do aplicativo e abra outra vez."); } return; }
      if (!vivo) return;
      setEtapa("conta");
      if (!data.session) { router.replace("/gestao/entrar"); return; }
      const u = data.session.user;
      // registro de acesso (Marco Civil): uma vez por dia, sem esperar (não atrasa a abertura)
      registrarAcesso(sb, "abertura", u.id);
      let preferido: string | null = null, ultimo: string | null = null;
      try { preferido = localStorage.getItem(CHAVE_LOJA); ultimo = localStorage.getItem(CHAVE_ULTIMA); } catch { /* sem armazenamento: segue */ }
      // o pet shop aberto da última vez neste aparelho já começa a carregar junto com a conta (uma ida ao banco a menos no
      // celular). Só vale se for o mesmo que a conta abre agora; senão (ou se a conta não estiver mais nele) é descartado.
      const palpite = ultimo && ultimo.startsWith(`${u.id}:`) ? ultimo.slice(u.id.length + 1) : null;
      const adiantado = palpite ? buscarBase(palpite).catch(() => null) : null;
      // a marca de "conta para apagar" do mesmo pet shop também sai já (era uma ida ao banco a mais, depois de tudo)
      const exclusaoAdiantada = palpite ? lerExclusao(palpite) : null;
      // links de pagamento e se a assinatura abriu: vêm do banco (junto com a conta), para trocar um link sem publicar o site de novo
      const assinatura = sb.rpc("gestao_assinatura").then((r) => {
        if (r.error || !r.data) return;
        const a = r.data as { aberta?: boolean; links?: Record<string, string> };
        usarLinksDoBanco(a.links);
        if (vivo) setAberta(Boolean(a.aberta));
      }, () => undefined);
      // aceites desta pessoa (versão dos Termos e da Política). Se a leitura falhar (banco sem a tabela, rede), não trava:
      // a tela de aceite volta a ser conferida na próxima vez que o aplicativo abrir.
      const aceites = sb.from("aceites").select("documento, versao").eq("user_id", u.id).then(
        (r) => (r.error ? [] : pendentes(r.data ?? [])), () => [] as Documento[]);
      const { data: vinculos, error } = await sb.rpc("entrar");
      if (!vivo) return;
      if (error) { terminou(); setErro("Não consegui carregar a sua conta. Tente de novo em instantes."); return; }
      if (!vinculos?.length) { router.replace("/gestao/comecar"); return; }
      const meu = vinculos.find((v) => v.petshop_id === preferido) ?? vinculos[0];
      setEtapa("loja");
      try {
        const base = (meu.petshop_id === palpite ? await adiantado : null) ?? await buscarBase(meu.petshop_id);
        try { localStorage.setItem(CHAVE_ULTIMA, `${u.id}:${meu.petshop_id}`); } catch { /* sem armazenamento: segue */ }
        const [todos, , falta, marcada] = await Promise.all([aplicarBase(base), assinatura, aceites, (meu.petshop_id === palpite && exclusaoAdiantada) || lerExclusao(meu.petshop_id)]);
        if (!vivo) return;
        terminou();
        // a memória curta das telas é desta conta neste pet shop (trocou: esquece)
        definirDonoDaMemoria(`${u.id}:${meu.petshop_id}`);
        setFaltam(falta);
        setExclusao(marcada);
        setEu(todos.find((x) => x.id === meu.id) ?? meu);
        setUser(u);
        setErro(null); // chegou depois do limite: abre assim mesmo
      } catch {
        if (vivo) { terminou(); setErro("Não consegui carregar o pet shop. Tente de novo em instantes."); }
      }
    })();
    const { data: sub } = sb.auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_OUT") { esquecerTudo(); router.replace("/gestao/entrar"); }
    });
    return () => { vivo = false; terminou(); sub.subscription.unsubscribe(); };
  }, [sb, router, buscarBase, aplicarBase, lerExclusao, tentativa]);

  // assinatura atrasada: pergunta ao banco quando a conta trava (banco de antes da migração 20261237: segue liberada)
  const lojaAtrasada = petshop?.status === "atrasada" ? petshop.id : null;
  useEffect(() => {
    if (!lojaAtrasada) return;
    let vivo = true;
    void sb.rpc("assinatura_situacao", { p: lojaAtrasada }).then((r) => {
      const s = r.data as { trava_em?: string | null; atraso_dias?: number } | null;
      if (!vivo || r.error || !s?.trava_em) return;
      setAtraso({ loja: lojaAtrasada, travaEm: new Date(s.trava_em), dias: Number(s.atraso_dias) || 10 });
    }, () => undefined);
    return () => { vivo = false; };
  }, [sb, lojaAtrasada]);

  const valor = useMemo<Gestao | null>(() => {
    if (!user || !eu || !petshop) return null;
    const emTeste = petshop.status === "teste";
    const resta = new Date(petshop.teste_ate).getTime() - Date.now();
    // quem cancelou continua usando até o fim do período que já pagou
    const pagoAinda = petshop.status === "cancelada" && petshop.pago_ate != null && new Date(petshop.pago_ate).getTime() > Date.now();
    const aberto = aberta ?? temCheckout();
    // atrasada: liberada até a data da trava (10 dias depois da cobrança recusada, por padrão)
    const meuAtraso = petshop.status === "atrasada" && atraso?.loja === petshop.id ? { travaEm: atraso.travaEm, dias: atraso.dias } : null;
    const atrasadaLiberada = petshop.status === "atrasada" && (!meuAtraso || meuAtraso.travaEm.getTime() > Date.now());
    // conta marcada para ser apagada: só para consulta até a data (mesma regra do banco, em acesso_liberado)
    const liberado = !exclusao && (["ativa", "cortesia"].includes(petshop.status) || atrasadaLiberada || (emTeste && resta > 0) || pagoAinda);
    const titular = equipe.filter((x) => x.papel === "dono").sort((a, b) => a.criado_em.localeCompare(b.criado_em) || a.id.localeCompare(b.id))[0];
    // as mensagens de erro só falam em "conta só para consulta" quando a conta está mesmo assim
    soConsulta = !liberado;
    definirLoja(petshop.id, !liberado); // o registro de erros leva o pet shop aberto
    // o comprovante impresso sai no papel escolhido em Meu pet shop, com o telefone e a cidade embaixo do nome
    definirImpressaoDoComprovante({ papel: papelDoComprovante(petshop), contato: [petshop.telefone ? fmtTelefone(petshop.telefone) : "", enderecoEmLinha(petshop) ?? [petshop.cidade, petshop.uf].filter(Boolean).join("/")].filter(Boolean).join(" · ") });
    return {
      sb, user, petshop, eu, equipe, servicos,
      souDono: eu.papel === "dono",
      vejoFinanceiro: podeArea(eu, "caixa") || podeArea(eu, "financeiro") || podeArea(eu, "relatorios"),
      cuidoDoFinanceiro: podeArea(eu, "financeiro") || podeArea(eu, "relatorios"),
      vejoCusto: veCusto(eu),
      posso: (area: Area) => podeArea(eu, area),
      liberado,
      exclusao,
      souTitular: titular?.id === eu.id,
      diasDeTeste: emTeste ? Math.max(0, Math.ceil(resta / 864e5)) : null,
      assinaturaAberta: aberto,
      atraso: meuAtraso,
      recarregarBase: async () => {
        const [todos, marcada] = await Promise.all([carregarBase(petshop.id), lerExclusao(petshop.id)]);
        setExclusao(marcada);
        const novo = todos.find((x) => x.id === eu.id);
        if (novo) setEu(novo);
      },
      sair: async () => { try { localStorage.removeItem(CHAVE_NOME); } catch { /* sem armazenamento */ } esquecerTudo(); await sb.auth.signOut(); router.replace("/gestao/entrar"); },
    };
  }, [sb, user, eu, petshop, equipe, servicos, carregarBase, router, aberta, atraso, exclusao, lerExclusao]);

  /** "Tentar de novo" na abertura: refaz a abertura aqui mesmo (sem baixar o aplicativo outra vez). */
  const tentarDeNovo = () => { setErro(null); setEtapa("login"); setTentativa((n) => n + 1); };
  if (erro) {
    return (
      <div className="g g-raiz"><div className="g-vazio" style={{ minHeight: "100dvh", alignContent: "center" }}>
        <Selo tamanho={72} tom="suave" />
        <b>Opa, algo não carregou</b>
        <p>{erro}</p>
        <button className="g-btn verde" onClick={() => { if (erro === SEM_BANCO) location.reload(); else tentarDeNovo(); }}>Tentar de novo</button>
      </div></div>
    );
  }
  if (!valor) {
    return (
      <div className="g g-raiz"><div className="g-vazio" style={{ minHeight: "100dvh", alignContent: "center" }}>
        <Selo tamanho={72} tom="suave" />
        <p id="g-abrindo" suppressHydrationWarning>Abrindo o seu pet shop…</p>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_DO_NOME }} />
        {/* abertura que demora: diz o que está acontecendo e dá uma saída (nunca fica só "Abrindo…" sem botão) */}
        <div id="g-abrindo-demora" className="g-pilha p" style={{ justifyItems: "center", maxWidth: 420, display: demorou ? undefined : "none" }} suppressHydrationWarning role="status">
          <p className="g-muted" suppressHydrationWarning>{ETAPAS[etapa]} Nada do que você salvou se perdeu.</p>
          <button type="button" className="g-btn verde" onClick={tentarDeNovo}>Tentar de novo</button>
        </div>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_DA_DEMORA }} />
      </div></div>
    );
  }
  if (faltam.length) {
    return <Reaceite sb={sb} faltam={faltam} nome={valor.eu.nome} aoAceitar={() => setFaltam([])} aoSair={() => void valor.sair()} />;
  }
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}
