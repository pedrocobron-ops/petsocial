"use client";

import { lerBase } from "@/lib/gestao/reservado";
import { temCheckout, usarLinksDoBanco } from "@/lib/gestao/planos";
import { Selo } from "./marca";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { banco, configurado, type Banco } from "@/lib/gestao/supabase";
import type { Petshop, Profissional, Servico } from "@/lib/gestao/tipos";
import { podeArea, type Area } from "@/lib/gestao/acessos";
import { definirLoja } from "@/lib/gestao/erros-navegador";
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
  /** A pessoa abre esta área do aplicativo? (o dono libera área por área em Equipe) */
  posso: (area: Area) => boolean;
  /** false = teste vencido ou assinatura cancelada: a conta fica só para consulta. */
  liberado: boolean;
  /** Dias que faltam de teste (null quando não está em teste). */
  diasDeTeste: number | null;
  /**
   * A assinatura já abriu (dá para pagar)? Enquanto não abriu, o teste vencido não bloqueia nada (o banco segue a mesma
   * regra, em `acesso_liberado`) e os botões de assinar ficam como "Disponível em breve".
   */
  assinaturaAberta: boolean;
  /** Recarrega pet shop, equipe e serviços depois de uma alteração. */
  recarregarBase: () => Promise<void>;
  sair: () => Promise<void>;
};

const Ctx = createContext<Gestao | null>(null);

export function useGestao(): Gestao {
  const v = useContext(Ctx);
  if (!v) throw new Error("useGestao fora do GestaoProvider");
  return v;
}

const CHAVE_LOJA = "maestro-gestao-petshop";
/** Último pet shop aberto neste aparelho (conta:pet shop): só para adiantar a leitura, não decide qual abre. */
const CHAVE_ULTIMA = "maestro-gestao-ultima-loja";

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
  /** Documentos com versão nova que esta pessoa ainda não aceitou: com algum, o aplicativo mostra a tela de aceite. */
  const [faltam, setFaltam] = useState<Documento[]>([]);

  const buscarBase = useCallback(async (petshopId: string) => {
    // pet shop, equipe e serviços numa ida só ao banco (com o banco antes da atualização, um pedido por parte, como antes)
    const b = await lerBase(sb, petshopId);
    if (b.erro || !b.petshop) throw b.erro ?? new Error("pet shop");
    return { petshop: b.petshop, equipe: b.equipe, servicos: b.servicos };
  }, [sb]);
  const aplicarBase = useCallback((b: Awaited<ReturnType<typeof buscarBase>>) => {
    setPetshop(b.petshop);
    setEquipe(b.equipe);
    setServicos(b.servicos);
    return b.equipe;
  }, []);
  const carregarBase = useCallback(async (petshopId: string) => aplicarBase(await buscarBase(petshopId)), [buscarBase, aplicarBase]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!configurado) { setErro("O banco de dados ainda não foi configurado neste endereço."); return; }
      const { data } = await sb.auth.getSession();
      if (!vivo) return;
      if (!data.session) { router.replace("/gestao/entrar"); return; }
      const u = data.session.user;
      let preferido: string | null = null, ultimo: string | null = null;
      try { preferido = localStorage.getItem(CHAVE_LOJA); ultimo = localStorage.getItem(CHAVE_ULTIMA); } catch { /* sem armazenamento: segue */ }
      // o pet shop aberto da última vez neste aparelho já começa a carregar junto com a conta (uma ida ao banco a menos no
      // celular). Só vale se for o mesmo que a conta abre agora; senão (ou se a conta não estiver mais nele) é descartado.
      const palpite = ultimo && ultimo.startsWith(`${u.id}:`) ? ultimo.slice(u.id.length + 1) : null;
      const adiantado = palpite ? buscarBase(palpite).catch(() => null) : null;
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
      if (error) { setErro("Não consegui carregar a sua conta. Tente de novo em instantes."); return; }
      if (!vinculos?.length) { router.replace("/gestao/comecar"); return; }
      const meu = vinculos.find((v) => v.petshop_id === preferido) ?? vinculos[0];
      try {
        const base = (meu.petshop_id === palpite ? await adiantado : null) ?? await buscarBase(meu.petshop_id);
        try { localStorage.setItem(CHAVE_ULTIMA, `${u.id}:${meu.petshop_id}`); } catch { /* sem armazenamento: segue */ }
        const [todos, , falta] = await Promise.all([aplicarBase(base), assinatura, aceites]);
        if (!vivo) return;
        setFaltam(falta);
        setEu(todos.find((x) => x.id === meu.id) ?? meu);
        setUser(u);
      } catch {
        setErro("Não consegui carregar o pet shop. Tente de novo em instantes.");
      }
    })();
    const { data: sub } = sb.auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_OUT") router.replace("/gestao/entrar");
    });
    return () => { vivo = false; sub.subscription.unsubscribe(); };
  }, [sb, router, buscarBase, aplicarBase]);

  const valor = useMemo<Gestao | null>(() => {
    if (!user || !eu || !petshop) return null;
    const emTeste = petshop.status === "teste";
    const resta = new Date(petshop.teste_ate).getTime() - Date.now();
    // quem cancelou continua usando até o fim do período que já pagou
    const pagoAinda = petshop.status === "cancelada" && petshop.pago_ate != null && new Date(petshop.pago_ate).getTime() > Date.now();
    // enquanto a assinatura não abriu, o teste não bloqueia ninguém: a pessoa não teria como pagar (mesma regra do banco)
    const aberto = aberta ?? temCheckout();
    const liberado = ["ativa", "atrasada", "cortesia"].includes(petshop.status) || (emTeste && (resta > 0 || !aberto)) || pagoAinda;
    // as mensagens de erro só falam em "conta só para consulta" quando a conta está mesmo assim
    soConsulta = !liberado;
    definirLoja(petshop.id, !liberado); // o registro de erros leva o pet shop aberto
    return {
      sb, user, petshop, eu, equipe, servicos,
      souDono: eu.papel === "dono",
      vejoFinanceiro: podeArea(eu, "caixa") || podeArea(eu, "financeiro") || podeArea(eu, "relatorios"),
      cuidoDoFinanceiro: podeArea(eu, "financeiro") || podeArea(eu, "relatorios"),
      posso: (area: Area) => podeArea(eu, area),
      liberado,
      diasDeTeste: emTeste ? Math.max(0, Math.ceil(resta / 864e5)) : null,
      assinaturaAberta: aberto,
      recarregarBase: async () => {
        const todos = await carregarBase(petshop.id);
        const novo = todos.find((x) => x.id === eu.id);
        if (novo) setEu(novo);
      },
      sair: async () => { await sb.auth.signOut(); router.replace("/gestao/entrar"); },
    };
  }, [sb, user, eu, petshop, equipe, servicos, carregarBase, router, aberta]);

  if (erro) {
    return (
      <div className="g g-raiz"><div className="g-vazio" style={{ minHeight: "100dvh", alignContent: "center" }}>
        <Selo tamanho={72} tom="suave" />
        <b>Opa, algo não carregou</b>
        <p>{erro}</p>
        <button className="g-btn verde" onClick={() => location.reload()}>Tentar de novo</button>
      </div></div>
    );
  }
  if (!valor) {
    return (
      <div className="g g-raiz"><div className="g-vazio" style={{ minHeight: "100dvh", alignContent: "center" }}>
        <Selo tamanho={72} tom="suave" />
        <p>Abrindo o seu pet shop…</p>
      </div></div>
    );
  }
  if (faltam.length) {
    return <Reaceite sb={sb} faltam={faltam} nome={valor.eu.nome} aoAceitar={() => setFaltam([])} aoSair={() => void valor.sair()} />;
  }
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}
