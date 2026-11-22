"use client";

import { Selo } from "./marca";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "@/components/gestao/link-depois";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3, BedDouble, BookOpen, CalendarDays, CalendarClock, ChevronDown, CreditCard, GraduationCap, Landmark, LifeBuoy, LogOut, Menu, Mic, Pencil, ShieldCheck, Package, PawPrint, Send, Store, Sun, Ticket, TriangleAlert, Users, Wallet,
} from "lucide-react";
import { useGestao } from "./contexto";
import { planoPorId } from "@/lib/gestao/planos";
import { DIAS_DE_AVISO, fimDoTeste } from "./fim-do-teste";
import { dataCompleta, dataLonga } from "@/lib/gestao/util";
import SairDaEquipe from "./lgpd/sair-da-equipe";
import { BaixarMeusDados } from "./lgpd/meus-dados";
import { LeiturasComErro, AvatarPessoa, EVENTO_ASSISTENTE, EVENTO_MUDOU, Folha } from "./ui";
import BuscaGeral from "./busca-geral";
import { areaDaRota } from "@/lib/gestao/acessos";
import { TELA_DA_AREA, nomeDaCasa, principalDe, rotaForaDoMenu, usaModulo, type Principal } from "@/lib/gestao/modulos";
import { guardarLembrado, lerLembrado } from "./lembrado";
import type { Tom } from "./painel";
import dynamic from "next/dynamic";
import { EVENTO_GUIA, EVENTO_PERSONALIZAR_MENU, quandoATelaAbrir } from "./ui";
import LogoLoja from "./logo-loja";
import AvisoDeFuso from "./aviso-fuso";
import { aplicarTema } from "@/lib/gestao/identidade";
import { foraNoModoSimples } from "@/lib/gestao/modo-simples";
import { abrirDepoisDeRecarregar, chaveDaConversa } from "@/lib/gestao/assistente/guardada";

// O que só abre com um toque (Mozart, Ajuda, guia inicial) e o botão Ajuda do alto (o manual inteiro) vêm à parte, depois
// da tela: no celular com internet fraca, a tela não espera baixar o que a pessoa talvez nem abra.
const carregarAssistente = () => import("./assistente");
const Assistente = dynamic(carregarAssistente, { ssr: false });
const Ajuda = dynamic(() => import("./ajuda"), { ssr: false });
const AjudaDaTela = dynamic(() => import("./manual/ajuda-da-tela"), { ssr: false });
const GuiaInicial = dynamic(() => import("./guia-inicial"), { ssr: false });
const PersonalizarMenu = dynamic(() => import("./personalizar-menu"), { ssr: false });

type Item = { href: string; rotulo: string; icone: React.ComponentType; tom: Tom; so?: "financeiro" | "dono" };
const GRUPOS: { titulo: string; itens: Item[] }[] = [
  { titulo: "Dia a dia", itens: [
    { href: "/gestao/app", rotulo: "Hoje", icone: Sun, tom: "pessego" },
    { href: "/gestao/app/agenda", rotulo: "Agenda", icone: CalendarDays, tom: "pessego" },
    { href: "/gestao/app/clientes", rotulo: "Clientes e pets", icone: PawPrint, tom: "menta" },
    { href: "/gestao/app/creche-hotel", rotulo: "Creche e hotel", icone: BedDouble, tom: "ceu" },
    { href: "/gestao/app/pacotes", rotulo: "Pacotes", icone: Ticket, tom: "lilas" },
    { href: "/gestao/app/mensagens", rotulo: "Mandar mensagens", icone: Send, tom: "menta" },
  ] },
  { titulo: "Dinheiro", itens: [
    { href: "/gestao/app/caixa", rotulo: "Caixa", icone: Wallet, tom: "manteiga", so: "financeiro" },
    { href: "/gestao/app/financeiro", rotulo: "Financeiro", icone: Landmark, tom: "menta", so: "financeiro" },
    { href: "/gestao/app/relatorios", rotulo: "Relatórios", icone: BarChart3, tom: "ceu", so: "financeiro" },
    { href: "/gestao/app/estoque", rotulo: "Estoque", icone: Package, tom: "rosa" },
  ] },
  { titulo: "Ajustes", itens: [
    { href: "/gestao/app/equipe", rotulo: "Equipe", icone: Users, tom: "lilas", so: "dono" },
    { href: "/gestao/app/meu-petshop", rotulo: "Meu pet shop", icone: Store, tom: "pessego", so: "dono" },
    { href: "/gestao/app/assinatura", rotulo: "Assinatura", icone: CreditCard, tom: "manteiga", so: "dono" },
  ] },
  { titulo: "Aprender", itens: [
    { href: "/gestao/app/manual", rotulo: "Manual", icone: BookOpen, tom: "ceu" },
    { href: "/gestao/app/escola", rotulo: "Escola de Gestão", icone: GraduationCap, tom: "manteiga", so: "dono" },
  ] },
];

const AGENDA = "/gestao/app/agenda", CASA = "/gestao/app/creche-hotel", ESTOQUE = "/gestao/app/estoque", CAIXA = "/gestao/app/caixa";
/** As telas de cada área principal, na ordem em que sobem para logo depois de Hoje. */
const TELAS_DA_PRINCIPAL: Record<Principal, string[]> = { banho_tosa: [AGENDA], creche: [CASA], hotel: [CASA], loja: [ESTOQUE, CAIXA] };
const CHAVE_OUTRAS = "maestro-gestao-outras-areas";
type ComMenu = Parameters<typeof rotaForaDoMenu>[0] & { opcoes?: unknown };

/**
 * O menu do pet shop. A área principal vem primeiro no dia a dia, logo depois de Hoje; as outras áreas marcadas seguem.
 * O que o pet shop não marcou não some: vai para "Outras áreas", um grupo fechado no fim do menu.
 * Sem área principal (pet shops de antes), a ordem é a de sempre.
 */
function montarMenu(petshop: ComMenu, semAgenda: boolean) {
  const principal = principalDe(petshop);
  // quem não faz banho e tosa não precisa da Agenda na frente: com área principal escolhida, ou sem nenhum horário marcado até hoje
  // no modo simples, o que é avançado (Relatórios, Escola, Caixa sem loja) também vai para "Outras áreas"
  const fora = (i: Item) => rotaForaDoMenu(petshop, i.href) || foraNoModoSimples(petshop, i.href) || (i.href === AGENDA && !usaModulo(petshop, "banho_tosa") && (principal != null || semAgenda));
  const rotulo = (i: Item): Item => (i.href === CASA && !fora(i) ? { ...i, rotulo: nomeDaCasa(petshop) } : i);
  const todos = GRUPOS.flatMap((g) => g.itens);
  const sobem = principal ? TELAS_DA_PRINCIPAL[principal].map((h) => todos.find((i) => i.href === h)!).filter((i) => !fora(i)) : [];
  const grupos = GRUPOS.map((g) => {
    const itens = g.itens.filter((i) => !fora(i) && !sobem.includes(i));
    if (g.titulo !== "Dia a dia" || !principal) return { ...g, itens: itens.map(rotulo) };
    // Hoje, a área principal, as outras áreas marcadas e, depois, o resto
    const areas = itens.filter((i) => i.href === AGENDA || i.href === CASA);
    return { ...g, itens: [itens[0], ...sobem, ...areas, ...itens.slice(1).filter((i) => !areas.includes(i))].map(rotulo) };
  });
  // na barra de baixo do celular, a tela da área principal fica ao lado de Hoje
  // sem Agenda no menu, o lugar dela na barra fica com a primeira tela de trabalho que o pet shop usa (creche e hotel, estoque…)
  const agenda = todos.find((i) => i.href === AGENDA)!;
  const semAgendaNoMenu = fora(agenda) ? [CASA, ESTOQUE, CAIXA].map((h) => todos.find((i) => i.href === h)!).find((i) => !fora(i)) : undefined;
  const aba = sobem[0] ? { ...sobem[0], rotulo: principal ? TELA_DA_AREA[principal].menu : sobem[0].rotulo } : semAgendaNoMenu ? rotulo(semAgendaNoMenu) : agenda;
  return { grupos, outras: todos.filter(fora), aba };
}

/** Navegação, avisos de assinatura e o botão da assistente em volta de todas as telas do aplicativo. */
export default function Casca({ children }: { children: React.ReactNode }) {
  const toqueNaFolha = useRef(0);
  useEffect(() => {
    const tocou = (e: PointerEvent) => { if ((e.target as Element | null)?.closest?.('[role="dialog"], [role="alertdialog"]')) toqueNaFolha.current = Date.now(); };
    document.addEventListener("pointerdown", tocou, true);
    return () => document.removeEventListener("pointerdown", tocou, true);
  }, []);
  const caminho = usePathname();
  const { sb, user, petshop, eu, souDono, posso, liberado, exclusao, souTitular, diasDeTeste, atraso, sair } = useGestao();
  const [pedidos, setPedidos] = useState(0);
  const [assistente, setAssistente] = useState<{ aberta: boolean; pedido: string }>({ aberta: false, pedido: "" });
  // a página recarregou com a conversa do Mozart aberta (ou no meio de um "Pode fazer"): ela volta aberta, como estava
  useEffect(() => { if (abrirDepoisDeRecarregar(chaveDaConversa(petshop.id, user.id))) setAssistente({ aberta: true, pedido: "" }); }, [petshop.id, user.id]);
  const [mais, setMais] = useState(false);
  const [ajuda, setAjuda] = useState(false);
  // a Ajuda: um lugar só (botão no alto de cada tela e Ajuda no menu) que leva ao passo a passo da tela, à conversa, ao Mozart e ao manual
  const [central, setCentral] = useState(false);
  const fecharCentral = useCallback(() => setCentral(false), []);
  const perguntarNaAjuda = useCallback(() => { setAssistente({ aberta: false, pedido: "" }); setAjuda(true); }, []);
  const [admin, setAdmin] = useState(false);
  // o guia inicial só carrega quando vai abrir: na primeira entrada (guia ainda não feito) ou pelo botão em Meu pet shop
  const [guia, setGuia] = useState<"fechado" | "inicio" | "botao">(() => (petshop.guia_feito_em ? "fechado" : "inicio"));
  useEffect(() => {
    const abrir = () => setGuia((g) => (g === "fechado" ? "botao" : g));
    window.addEventListener(EVENTO_GUIA, abrir);
    return () => window.removeEventListener(EVENTO_GUIA, abrir);
  }, []);
  // Personalizar, ao lado de Dia a dia (e pelo guia, pelos Primeiros passos): a folha "O que o seu negócio faz?". Só o dono.
  const [personalizar, setPersonalizar] = useState(false);
  useEffect(() => {
    const abrir = () => { setMais(false); setPersonalizar(true); };
    window.addEventListener(EVENTO_PERSONALIZAR_MENU, abrir);
    return () => window.removeEventListener(EVENTO_PERSONALIZAR_MENU, abrir);
  }, []);
  // o "Como usar esta tela" (o manual inteiro) entra depois que a tela abriu; o Mozart baixa junto, para abrir na hora do toque
  const [depois, setDepois] = useState(false);
  useEffect(() => quandoATelaAbrir(() => { setDepois(true); void carregarAssistente().catch(() => undefined); }), []);
  const [outrasAbertas, setOutrasAbertas] = useState(() => lerLembrado(CHAVE_OUTRAS) === "1");
  const abrirOutras = () => setOutrasAbertas((a) => { guardarLembrado(CHAVE_OUTRAS, a ? "0" : "1"); return !a; });

  // pet shop que não faz banho e tosa e nunca marcou horário: a Agenda vai para "Outras áreas" (continua abrindo por lá)
  const semBanho = !usaModulo(petshop, "banho_tosa");
  const [semAgenda, setSemAgenda] = useState(false);
  useEffect(() => {
    if (!semBanho) { setSemAgenda(false); return; }
    let vale = true;
    const olhar = () => void sb.from("agendamentos").select("id", { count: "exact", head: true }).eq("petshop_id", petshop.id).then((r) => { if (vale && !r.error) setSemAgenda((r.count ?? 0) === 0); });
    olhar();
    window.addEventListener(EVENTO_MUDOU, olhar);
    return () => { vale = false; window.removeEventListener(EVENTO_MUDOU, olhar); };
  }, [sb, petshop.id, semBanho]);

  // só a equipe Maestro Pet vê o item "Administrador" no menu
  // (pergunta depois que a tela abriu: não disputa a rede com o que a tela precisa para aparecer)
  // a resposta fica guardada nesta aba (por login): não pergunta de novo a cada recarga da página
  useEffect(() => {
    const chave = `maestro-gestao-admin:${eu.user_id ?? ""}`;
    let guardado: string | null = null;
    try { guardado = sessionStorage.getItem(chave); } catch { /* sem armazenamento: pergunta */ }
    if (guardado === "0" || guardado === "1") { setAdmin(guardado === "1"); return; }
    let vale = true;
    // admin_situacao: é da equipe, mesmo antes do código do segundo fator (sou_admin só diz sim depois dele).
    // Banco sem a função (antes da migração 20261245): pergunta como antes.
    const parar = quandoATelaAbrir(() => void sb.rpc("admin_situacao").then(async (r) => {
      let sim = (r.data as { admin?: boolean } | null)?.admin === true, erro = r.error;
      if (erro && (erro.code === "PGRST202" || erro.code === "42883")) { const v = await sb.rpc("sou_admin"); sim = v.data === true; erro = v.error; }
      if (!vale) return;
      setAdmin(sim);
      if (!erro) { try { sessionStorage.setItem(chave, sim ? "1" : "0"); } catch { /* segue */ } }
    }));
    return () => { vale = false; parar(); };
  }, [sb, eu.user_id]);

  // marca de uso: a cada minuto com a tela aberta, diz em que parte do sistema a pessoa está
  useEffect(() => {
    const area = caminho.replace(/^\/gestao\/app\/?/, "").split("/")[0] || "hoje";
    const marcar = () => { if (document.visibilityState === "visible") void sb.rpc("marcar_uso", { p_petshop: petshop.id, p_area: area }).then(() => {}, () => {}); };
    // a primeira marca sai depois que a tela abriu (não disputa a rede com os dados da tela)
    const parar = quandoATelaAbrir(marcar);
    const t = setInterval(marcar, 60000);
    document.addEventListener("visibilitychange", marcar);
    return () => { parar(); clearInterval(t); document.removeEventListener("visibilitychange", marcar); };
  }, [sb, petshop.id, caminho]);

  useEffect(() => {
    const abrir = (e: Event) => { setAjuda(false); setAssistente({ aberta: true, pedido: String((e as CustomEvent).detail ?? "") }); };
    window.addEventListener(EVENTO_ASSISTENTE, abrir);
    return () => window.removeEventListener(EVENTO_ASSISTENTE, abrir);
  }, []);
  useEffect(() => { setMais(false); }, [caminho]);
  // lembra em qual pet shop esta conta entrou neste aparelho: se o acesso for retirado, a tela de entrada consegue explicar
  useEffect(() => {
    try { localStorage.setItem("maestro-gestao-ultimo-acesso", JSON.stringify({ user: user.id, nome: petshop.nome, dono: souDono })); } catch { /* sem armazenamento: segue */ }
  }, [user.id, petshop.nome, souDono]);
  // as cores do pet shop valem no aplicativo inteiro; ao sair do aplicativo, volta o padrão
  useEffect(() => { aplicarTema(petshop.tema); return () => aplicarTema(null); }, [petshop.tema]);

  // pedidos pelo link esperando resposta: bolinha com o número no menu, atualizada a cada minuto
  useEffect(() => {
    if (!petshop.link_ativo) { setPedidos(0); return; }
    let vale = true;
    const contar = async () => {
      if (document.visibilityState !== "visible") return;
      const { count } = await sb.from("pedidos_agendamento").select("id", { count: "exact", head: true }).eq("petshop_id", petshop.id).eq("status", "pendente");
      if (vale) setPedidos(count ?? 0);
    };
    void contar();
    const t = setInterval(() => void contar(), 60000);
    const ouvir = () => void contar();
    window.addEventListener(EVENTO_MUDOU, ouvir);
    document.addEventListener("visibilitychange", ouvir);
    return () => { vale = false; clearInterval(t); window.removeEventListener(EVENTO_MUDOU, ouvir); document.removeEventListener("visibilitychange", ouvir); };
  }, [sb, petshop.id, petshop.link_ativo]);

  const podeRota = (href: string) => { const area = areaDaRota(href); return area ? posso(area) : true; };
  // as permissões de cada pessoa valem por cima da ordem do menu
  // Mandar mensagens (Modo envio) só para quem tem alguma área com mensagem para o tutor
  const pode = (i: Item) => (i.so === "dono" ? souDono
    : i.href === "/gestao/app/mensagens" ? (["agenda", "clientes", "creche_hotel", "pacotes", "caixa", "financeiro", "relatorios"] as const).some((a) => posso(a))
    : podeRota(i.href));
  const menu = montarMenu(petshop, semAgenda);
  // tela aberta pelo endereço sem ter acesso: mostra o aviso no lugar da tela
  const soDeDono = ["/gestao/app/equipe", "/gestao/app/meu-petshop", "/gestao/app/assinatura", "/gestao/app/escola"].some((r) => caminho.startsWith(r));
  const semAcesso = (soDeDono && !souDono) || !podeRota(caminho);
  const atual = (href: string) => (href === "/gestao/app" ? caminho === href : caminho.startsWith(href));
  const grupos = menu.grupos.map((g) => ({ ...g, itens: g.itens.filter(pode) })).filter((g) => g.itens.length);
  // o que o pet shop não marcou: fica a um toque, num grupo fechado no fim do menu
  const outras = menu.outras.filter(pode);
  const outrasVisiveis = outrasAbertas || outras.some((i) => atual(i.href));
  // quem não abre a tela da área principal fica, na barra de baixo, com a primeira tela que é dele
  // (a monitora da creche vê Creche e hotel, e não uma Agenda apagada). Hoje e Clientes já têm o lugar deles na barra.
  const minhaPrimeira = grupos.flatMap((g) => g.itens).find((i) => areaDaRota(i.href) != null && i.href !== "/gestao/app/clientes");
  // a função da pessoa diz qual é o trabalho dela: o monitor da creche fica com Creche e hotel do lado de Hoje, mesmo vendo a Agenda
  const daFuncao = souDono ? undefined : (() => {
    const f = (eu.funcao ?? "").toLowerCase();
    const h = /creche|hotel|monitor|hosped/.test(f) ? CASA : /banh|tos/.test(f) ? AGENDA : /estoque|loja|vend/.test(f) ? ESTOQUE : null;
    return h && h !== menu.aba.href ? grupos.flatMap((g) => g.itens).find((i) => i.href === h) : undefined;
  })();
  const aba = daFuncao ?? (podeRota(menu.aba.href) ? menu.aba : minhaPrimeira ?? menu.aba), podeAba = podeRota(aba.href);

  // Antes, cada link do menu baixava a sua tela junto com a primeira (o menu inteiro, no computador), e a tela que a pessoa
  // abriu esperava na fila. Agora as telas da barra de baixo (Hoje, a área principal e Clientes) baixam depois que a tela
  // aberta apareceu; as outras do menu, quando o mouse passa por cima (ou o dedo encosta), um instante antes do clique.
  const router = useRouter();
  const adiantar = [...new Set([aba.href, "/gestao/app", ...(posso("clientes") ? ["/gestao/app/clientes"] : [])])].filter((h) => podeRota(h)).join(" ");
  useEffect(() => {
    let vivo = true;
    const parar = quandoATelaAbrir(() => {
      for (const h of adiantar.split(" ")) if (vivo) { try { router.prefetch(h); } catch { /* sem adiantar: abre no toque */ } }
    });
    return () => { vivo = false; parar(); };
  }, [router, adiantar]);
  const perto = (href: string) => () => { try { router.prefetch(href); } catch { /* sem adiantar: abre no clique */ } };

  // na tela Hoje, o dono vê o cartão de fim de teste (com os números da conta): a faixa de cima não repete o recado
  const teste = fimDoTeste(petshop);
  const cartaoNoHoje = souDono && caminho === "/gestao/app" && teste != null && teste.dias <= DIAS_DE_AVISO;

  const aqui = [...menu.grupos, { titulo: "Outras áreas", itens: menu.outras }].flatMap((g) => g.itens.map((item) => ({ grupo: g.titulo, item }))).find((x) => atual(x.item.href));

  const botaoPersonalizar = (classe: string) => (
    <button type="button" className={classe} aria-label="Personalizar o menu Dia a dia" title="Escolher o que aparece no menu"
      onClick={() => { setMais(false); setPersonalizar(true); }}><Pencil aria-hidden />Personalizar</button>
  );

  const nav = (
    <nav className="g-nav" aria-label="Menu">
      {grupos.map((g) => (
        <div key={g.titulo}>
          {g.titulo === "Dia a dia" && souDono ? (
            <div className="g-nav-t com-botao"><span>{g.titulo}</span>{botaoPersonalizar("g-nav-personalizar")}</div>
          ) : <div className="g-nav-t">{g.titulo}</div>}
          {g.itens.map((i) => (
            <Link prefetch={false} onMouseEnter={perto(i.href)} onTouchStart={perto(i.href)} onFocus={perto(i.href)} key={i.href} href={i.href} aria-current={atual(i.href) ? "page" : undefined}><i.icone />{i.rotulo}{i.href.endsWith("/agenda") && pedidos > 0 && <span className="g-nav-n" aria-label={`${pedidos} pedidos pelo link esperando resposta`}>{pedidos}</span>}</Link>
          ))}
        </div>
      ))}
      {outras.length > 0 && (
        <div>
          <button type="button" className="g-nav-outras" aria-expanded={outrasVisiveis} onClick={abrirOutras}>Outras áreas<ChevronDown /></button>
          {outrasVisiveis && outras.map((i) => (
            <Link prefetch={false} onMouseEnter={perto(i.href)} onTouchStart={perto(i.href)} onFocus={perto(i.href)} key={i.href} href={i.href} aria-current={atual(i.href) ? "page" : undefined}><i.icone />{i.rotulo}</Link>
          ))}
        </div>
      )}
      {admin && (
        <div>
          <div className="g-nav-t">Maestro Pet</div>
          <Link prefetch={false} href="/gestao/admin"><ShieldCheck />Administrador</Link>
        </div>
      )}
    </nav>
  );

  return (
    <div className="g-app">
      {/* teclado: o primeiro Tab da página oferece pular o menu e ir direto ao conteúdo */}
      <a className="g-pular" href="#conteudo" onClick={(e) => { e.preventDefault(); document.getElementById("conteudo")?.focus(); }}>Pular para o conteúdo</a>
      <aside className="g-lado" aria-label="Menu do aplicativo">
        <div className="g-marca">
          <LogoLoja nome={petshop.nome} logo={petshop.logo} tamanho={38} padrao="selo" />
          <div><b title={petshop.nome}>{petshop.nome}</b><span>Maestro Pet Gestão</span></div>
        </div>
        {nav}
        <div className="g-lado-pe">
          {souDono && diasDeTeste !== null && (
            <div className="g-lado-plano">
              <b>Teste grátis</b>
              <span>{!teste || teste.vencido ? "Terminou. A conta está só para consulta." : teste.dias === 0 ? "Termina hoje." : teste.dias === 1 ? "Termina amanhã." : `Faltam ${teste.dias} dias.`}</span>
              <div className="g-prog"><i style={{ width: `${Math.max(4, Math.min(100, ((7 - diasDeTeste) / 7) * 100))}%` }} /></div>
              <Link prefetch={false} href="/gestao/app/assinatura">Ver assinatura</Link>
            </div>
          )}
          <div className="g-nav" style={{ marginTop: 10 }}>
            <button onClick={() => { setAssistente({ aberta: false, pedido: "" }); setCentral(true); }}><LifeBuoy />Ajuda</button>
            <BaixarMeusDados lateral />
            {!souTitular && <SairDaEquipe lateral />}
          </div>
          <div className="g-lado-eu">
            <AvatarPessoa nome={eu.nome} cor={eu.cor} tamanho="p" />
            <div className="t"><b>{eu.nome}</b><span>{souDono ? "Dono" : eu.funcao?.trim() || (eu.papel === "gerente" ? "Gerente" : "Equipe")}{petshop.status === "ativa" ? ` · plano ${planoPorId(petshop.plano)?.nome ?? ""}` : ""}</span></div>
            <button className="g-ico" onClick={() => void sair()} aria-label="Sair" title="Sair"><LogOut /></button>
          </div>
        </div>
      </aside>

      {/* leitura que falhou e a tela não tratou: nunca fica parecendo "nada cadastrado" */}
      <LeiturasComErro />
      <main className="g-main" id="conteudo" tabIndex={-1}>
        <div className="g-barra">
          <div className="g-barra-marca"><LogoLoja nome={petshop.nome} logo={petshop.logo} tamanho={34} padrao="selo" tomSelo="verde" /><span>{petshop.nome}</span></div>
          {aqui && <div className="g-barra-onde"><span className={`g-tile p ${aqui.item.tom}`} aria-hidden><aqui.item.icone /></span><span>{aqui.grupo} / <b>{aqui.item.rotulo}</b></span></div>}
          {/* no Manual, a busca é a do manual: duas caixas de busca na mesma tela confundiam */}
          {posso("clientes") && !caminho.startsWith("/gestao/app/manual") ? <BuscaGeral /> : <span style={{ flex: 1 }} />}
          <button type="button" className="g-man-botao" onClick={() => setCentral(true)} aria-label="Ajuda" title="Ajuda: como usar esta tela, dúvidas, Mozart e manual" data-teste="botao-ajuda">
            <LifeBuoy aria-hidden /><span>Ajuda</span>
          </button>
          {(depois || central) && <AjudaDaTela aberta={central} aoFechar={fecharCentral} aoPerguntar={perguntarNaAjuda} />}
          <div className="g-barra-data"><CalendarClock />{dataLonga(new Date())}</div>
        </div>
        <AvisoDeFuso />
        {exclusao && (
          <div className="g-aviso vermelho" role="alert">
            <TriangleAlert />
            <span>Esta conta vai ser apagada em {dataCompleta(exclusao.apagar_em)}. Até lá, fica só para consulta: dá para ver e baixar os dados, mas não lançar.</span>
            {souDono && !caminho.endsWith("/meu-petshop") && <Link className="g-btn p verde" href="/gestao/app/meu-petshop#encerrar-conta">Ver ou cancelar</Link>}
          </div>
        )}
        {!liberado && !exclusao && !cartaoNoHoje && !caminho.endsWith("/assinatura") && (
          <div className="g-aviso vermelho" role="alert">
            <TriangleAlert />
            <span>{petshop.status === "teste" ? "Seu teste grátis terminou. Seus dados estão guardados e a conta fica só para consulta até você assinar."
              : petshop.status === "atrasada" ? "O pagamento da assinatura não foi aprovado e o prazo para acertar passou. Seus dados estão guardados e a conta fica só para consulta até o pagamento entrar."
                : "Sua assinatura está inativa. Seus dados estão guardados e a conta fica só para consulta até você assinar."}</span>
            {souDono && <Link className="g-btn p verde" href="/gestao/app/assinatura">Ver assinatura</Link>}
          </div>
        )}
        {liberado && petshop.status === "atrasada" && (
          <div className="g-aviso" role="alert">
            <TriangleAlert />
            <span>{atraso
              ? `O pagamento da assinatura não foi aprovado. Acerte até ${dataCompleta(atraso.travaEm)}: depois desse dia, a conta fica só para consulta.`
              : "O pagamento da assinatura não foi aprovado. Acerte para a conta não ficar só para consulta."}</span>
            {souDono && <Link className="g-btn p verde" href="/gestao/app/assinatura">Resolver</Link>}
          </div>
        )}
        {liberado && diasDeTeste !== null && diasDeTeste <= 3 && !teste?.vencido && souDono && !caminho.endsWith("/assinatura") && !cartaoNoHoje && (
          <div className="g-aviso">
            <span>{teste && teste.dias <= 1 ? `Seu teste grátis termina ${teste.quando}.` : `Faltam ${teste?.dias ?? diasDeTeste} dias do seu teste grátis.`}</span>
            <Link className="g-btn p verde" href="/gestao/app/assinatura">Assinar</Link>
          </div>
        )}
        {semAcesso ? (
          <div className="g-card"><div className="g-vazio">
            <Selo tamanho={72} tom="suave" />
            <b>Esta área não está liberada para você</b>
            <p>{soDeDono && !souDono ? "Esta tela é só do dono e dos sócios. Se precisar de alguma coisa daqui, fale com o dono do pet shop." : "Quem libera é o dono do pet shop, em Equipe. Se precisar dela para trabalhar, peça para ele ligar o seu acesso."}</p>
            <Link className="g-btn verde" href="/gestao/app">Voltar para o início</Link>
          </div></div>
        ) : children}
      </main>

      {/* toque duplo no botão de uma folha: ela fecha no primeiro toque e o segundo cairia na aba que fica embaixo */}
      <nav className="g-abas" aria-label="Atalhos" onClickCapture={(e) => { if (Date.now() - toqueNaFolha.current < 500) { e.preventDefault(); e.stopPropagation(); } }}>
        <Link prefetch={false} href="/gestao/app" aria-current={atual("/gestao/app") ? "page" : undefined}><Sun />Hoje</Link>
        <Link prefetch={false} href={podeAba ? aba.href : "/gestao/app"} aria-current={atual(aba.href) ? "page" : undefined} style={{ position: "relative", opacity: podeAba ? 1 : .35 }}><aba.icone />{aba.rotulo}{aba.href === AGENDA && pedidos > 0 && <span className="g-nav-n aba">{pedidos}</span>}</Link>
        <button className="g-aba-mic" onClick={() => setAssistente({ aberta: true, pedido: "" })} aria-label="Falar com o Mozart, o assistente">
          <span className="b"><Mic /></span>
        </button>
        <Link prefetch={false} href={posso("clientes") ? "/gestao/app/clientes" : "/gestao/app"} aria-current={atual("/gestao/app/clientes") ? "page" : undefined} style={{ opacity: posso("clientes") ? 1 : .35 }}><PawPrint />Clientes</Link>
        <button onClick={() => setMais(true)}><Menu />Mais</button>
      </nav>

      <button className={`g-fab${assistente.aberta ? " aberta" : ""}`} onClick={() => { setAjuda(false); setAssistente((a) => ({ aberta: !a.aberta, pedido: "" })); }} aria-expanded={assistente.aberta}
        title={assistente.aberta ? "Fechar a conversa com o Mozart" : "Falar com o Mozart, o assistente"}>
        <span className="foto"><Selo tamanho={40} /><i aria-hidden /></span>
        {/* em tela mais estreita o texto some da vista, mas continua sendo o nome do botão para o leitor de tela (gestao.css) */}
        <span className="txt"><b>Mozart</b> <span>{assistente.aberta ? "fechar a conversa" : "fala comigo"}</span></span>
      </button>

      {mais && (
        <Folha titulo={petshop.nome} aoFechar={() => setMais(false)}>
          <div className="g-pilha">
            {grupos.map((g) => (
              <div key={g.titulo}>
                {g.titulo === "Dia a dia" && souDono ? (
                  <div className="g-mais-t"><span className="g-rotulo">{g.titulo}</span>{botaoPersonalizar("g-btn fantasma p")}</div>
                ) : <div className="g-rotulo" style={{ marginBottom: 4 }}>{g.titulo}</div>}
                <div className="g-lista">
                  {g.itens.map((i) => (
                    <Link key={i.href} href={i.href} className="g-linha"><span className="g-ico" aria-hidden><i.icone /></span><span className="t"><b>{i.rotulo}</b></span></Link>
                  ))}
                </div>
              </div>
            ))}
            {outras.length > 0 && (
              <div>
                <button type="button" className="g-mais-outras" aria-expanded={outrasVisiveis} onClick={abrirOutras}><span className="g-rotulo">Outras áreas</span><ChevronDown /></button>
                {outrasVisiveis && (
                  <div className="g-lista">
                    {outras.map((i) => (
                      <Link key={i.href} href={i.href} className="g-linha"><span className="g-ico" aria-hidden><i.icone /></span><span className="t"><b>{i.rotulo}</b></span></Link>
                    ))}
                  </div>
                )}
              </div>
            )}
            {admin && (
              <div>
                <div className="g-rotulo" style={{ marginBottom: 4 }}>Maestro Pet</div>
                <div className="g-lista"><Link href="/gestao/admin" className="g-linha"><span className="g-ico" aria-hidden><ShieldCheck /></span><span className="t"><b>Administrador</b></span></Link></div>
              </div>
            )}
            <button className="g-btn verde" onClick={() => { setMais(false); setCentral(true); }}><LifeBuoy />Ajuda</button>
            <button className="g-btn sec" onClick={() => void sair()}><LogOut />Sair</button>
            <BaixarMeusDados />
            {!souTitular && <SairDaEquipe />}
          </div>
        </Folha>
      )}

      {personalizar && souDono && <PersonalizarMenu aoFechar={() => setPersonalizar(false)} />}
      {guia !== "fechado" && <GuiaInicial abrirAgora={guia === "botao"} />}
      {ajuda && <Ajuda aoFechar={() => setAjuda(false)} />}
      {assistente.aberta && <Assistente pedidoInicial={assistente.pedido} aoFechar={() => setAssistente({ aberta: false, pedido: "" })} />}
    </div>
  );
}
