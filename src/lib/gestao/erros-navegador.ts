/**
 * Envio dos erros do navegador para o banco (`erro_registrar`). Nunca atrapalha a tela: tudo em try/catch, sem esperar
 * resposta, no máximo 30 envios por página aberta. Sem internet, só conta. Antes da migração 20261180 o envio falha calado.
 * Quem chama: `VigiaDeErros` (erros soltos e promessas recusadas), `error.tsx` (tela que quebrou) e os avisos de erro
 * (`avisarErro` e `useDados`, em ui.tsx) quando o erro é técnico (ver `classificar`).
 */
import { configurado } from "./supabase-config";
import { bancoDepois as banco } from "./supabase-depois";
import { VERSAO_APP, classificar, ehDeRede, ignorar, mensagemDe, montarErro, type TipoErro } from "./erros";

let loja: string | null = null;
let soConsulta = false;
let enviados = 0, semRede = 0;
const recentes = new Map<string, number>();
const MAX_POR_PAGINA = 30;

/** O pet shop aberto (o banco confere e tira o papel e as áreas de quem está logado). */
export function definirLoja(petshopId: string | null, contaSoConsulta = false) {
  loja = petshopId;
  soConsulta = contaSoConsulta;
}

const CHAVE_APARELHO = "maestro-gestao-aparelho";
let aparelhoDaSessao: string | null = null;
/** Número aleatório deste navegador (não identifica a pessoa): conta quantos aparelhos viram o erro e freia excesso. */
function aparelho(): string {
  if (aparelhoDaSessao) return aparelhoDaSessao;
  const novo = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
  try {
    let a = localStorage.getItem(CHAVE_APARELHO);
    if (!a || !/^[0-9a-f]{16}$/.test(a)) { a = novo(); localStorage.setItem(CHAVE_APARELHO, a); }
    aparelhoDaSessao = a;
  } catch { aparelhoDaSessao = novo(); }
  return aparelhoDaSessao;
}

function enviar(p: Record<string, unknown>) {
  if (!configurado) return;
  void banco().rpc("erro_registrar", p as never).then(() => undefined, () => undefined);
}

/** Registra um erro. `tipo`: erro solto, promessa recusada, tela quebrada ou erro do banco mostrado num aviso. */
export function registrarErro(erro: unknown, tipo: TipoErro) {
  try {
    if (typeof window === "undefined") return;
    const msg = mensagemDe(erro) || (typeof erro === "string" ? erro : "");
    // sem internet: só conta (uma por página a cada 10 s, até 5)
    if (ehDeRede(msg) && navigator.onLine === false) {
      const agora = Date.now();
      if (semRede >= 5 || agora - (recentes.get("__rede") ?? 0) < 10000) return;
      recentes.set("__rede", agora); semRede++;
      enviar({ p_origem: "navegador", p_tipo: tipo, p_mensagem: "sem internet", p_aparelho: aparelho(), p_sem_internet: true });
      return;
    }
    const nome = erro instanceof Error ? erro.name : "";
    if (ignorar(msg, nome, erro instanceof Error ? erro.stack ?? "" : "")) return;
    if (enviados >= MAX_POR_PAGINA) return;
    const p = montarErro({
      erro, tipo, rota: location.pathname, versao: VERSAO_APP, ua: navigator.userAgent,
      largura: window.innerWidth, altura: window.innerHeight, petshop: loja, aparelho: aparelho(),
    });
    // o mesmo erro em laço (renderização que repete) vai uma vez a cada 2 s; o banco soma as repetições
    const chave = `${p.p_tipo}|${p.p_mensagem}|${(p.p_pilha ?? "").split("\n")[0]}`;
    const antes = recentes.get(chave);
    if (antes && Date.now() - antes < 2000) return;
    recentes.set(chave, Date.now());
    enviados++;
    enviar(p);
  } catch { /* nunca atrapalha a tela */ }
}

/** Erro que a tela mostrou num aviso: registra só se for técnico (banco ou código), nunca as frases feitas para a pessoa. */
export function registrarErroMostrado(e: unknown) {
  try {
    if (typeof window === "undefined") return;
    const c = classificar(e, navigator.onLine !== false);
    if (!c) return;
    // conta só para consulta: o banco recusa gravar de propósito
    if (soConsulta && /row-level security|permission denied/i.test(mensagemDe(e))) return;
    registrarErro(e, c === "erro" ? "erro" : "banco");
  } catch { /* nunca atrapalha a tela */ }
}

/** Liga a escuta de erros soltos e promessas recusadas. Devolve a função que desliga. */
export function instalarVigia(): () => void {
  const solto = (ev: ErrorEvent) => registrarErro(ev.error ?? ev.message, "erro");
  const promessa = (ev: PromiseRejectionEvent) => registrarErro(ev.reason, "promessa");
  window.addEventListener("error", solto);
  window.addEventListener("unhandledrejection", promessa);
  return () => { window.removeEventListener("error", solto); window.removeEventListener("unhandledrejection", promessa); };
}
