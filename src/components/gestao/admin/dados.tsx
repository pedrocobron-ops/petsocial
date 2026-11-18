"use client";

import { useCallback, useEffect, useState } from "react";
import { DatabaseBackup, TriangleAlert } from "lucide-react";
import { Esqueleto, mensagemDeErro, ok, useAvisos } from "@/components/gestao/ui";
import { banco } from "@/lib/gestao/supabase";
import { dataCompleta, haQuanto, hora } from "@/lib/gestao/util";

type Copia = { quando: string; quem: string | null; tabelas: number | null; linhas: number | null };
type Exclusao = {
  id: number; petshop_id: string; petshop: string; pedido_nome: string | null; pedido_email: string | null; pedido_em: string; apagar_em: string;
  cancelado_em: string | null; apagado_em: string | null; usuarios: number | null;
  /** migração 20261229: andamento da exclusão em lotes e atraso (prazo vencido há mais de 2 dias) */
  comecou_em?: string | null; tentativas?: number; tentou_em?: string | null; erro?: string | null; linhas_apagadas?: number; atrasada?: boolean;
};
/** Uma rotina agendada (a faxina diária da Vercel e as tarefas do banco) e a última vez que rodou. */
export type Rotina = {
  nome: string; onde: "servidor" | "banco"; ultima_em: string | null; ultima_ok_em: string | null; ultimo_erro: string | null;
  ultimo_erro_em: string | null; falhas_seguidas: number | null; resultado: Record<string, number> | null; atrasada: boolean;
};
export type Rotinas = { agora: string; rotinas: Rotina[]; exclusoes_atrasadas: number };
const NOME_DA_ROTINA: Record<string, string> = {
  faxina: "Faxina diária (apaga contas com o prazo vencido e arquivos que sobraram)",
  "gestao-faxina-diaria": "Faxina do banco (álbuns vencidos, reservas velhas)",
  "gestao-rascunhos-velhos": "Rascunhos com mais de 7 dias",
};
export const nomeDaRotina = (r: Rotina) => NOME_DA_ROTINA[r.nome] ?? r.nome;

/** Depois de quantos dias sem cópia completa o painel lembra de baixar uma. */
export const DIAS_SEM_COPIA = 7;
const quando = (d: string) => `${dataCompleta(d)} às ${hora(d)}`;
export const copiaVelha = (ultima: string | null | undefined) => !ultima || Date.now() - new Date(ultima).getTime() > DIAS_SEM_COPIA * 864e5;

/** A frase de cada rotina: quando rodou bem pela última vez, e o que falhou depois disso. */
export function situacaoDaRotina(r: Rotina): string {
  const bem = r.ultima_ok_em ? `Rodou bem pela última vez ${haQuanto(r.ultima_ok_em)} (${quando(r.ultima_ok_em)}).` : r.ultima_em ? "Ainda não rodou bem nenhuma vez." : "Ainda não rodou nenhuma vez.";
  const falhou = r.ultimo_erro_em && (!r.ultima_ok_em || new Date(r.ultimo_erro_em) > new Date(r.ultima_ok_em));
  return falhou ? `${bem} A última tentativa falhou em ${quando(r.ultimo_erro_em!)}${r.ultimo_erro ? `: ${r.ultimo_erro}` : "."}` : bem;
}

/** Lê as rotinas (função admin_rotinas); null em banco de antes da migração 20261229. */
export async function lerRotinas(): Promise<Rotinas | null> {
  const r = await (banco() as unknown as { rpc: (f: string) => PromiseLike<{ data: unknown; error: unknown }> }).rpc("admin_rotinas");
  return r.error || !r.data ? null : (r.data as Rotinas);
}

/** Lembrete do alto do painel: rotina que não roda bem há mais de um dia e meio, ou conta com a exclusão atrasada. */
export function LembreteDasRotinas({ aoAbrir }: { aoAbrir: () => void }) {
  const [r, setR] = useState<Rotinas | null>(null);
  useEffect(() => { lerRotinas().then(setR, () => setR(null)); }, []);
  const atrasadas = r?.rotinas.filter((x) => x.atrasada) ?? [];
  if (!r || (!atrasadas.length && !r.exclusoes_atrasadas)) return null;
  return (
    <div className="g-aviso vermelho" role="alert" style={{ marginBottom: 14 }} data-teste="lembrete-rotinas">
      <TriangleAlert />
      <span>
        {atrasadas.length > 0 && <>{atrasadas.length === 1 ? "Uma rotina automática não roda bem" : `${atrasadas.length} rotinas automáticas não rodam bem`} há mais de um dia e meio. </>}
        {r.exclusoes_atrasadas > 0 && <>{r.exclusoes_atrasadas === 1 ? "Uma conta já devia ter sido apagada" : `${r.exclusoes_atrasadas} contas já deviam ter sido apagadas`} (prazo vencido há mais de 2 dias).</>}
      </span>
      <button className="g-btn p sec" onClick={aoAbrir}>Ver</button>
    </div>
  );
}

/** Lê as últimas cópias completas (função admin_copias). */
export async function lerCopias(): Promise<Copia[]> {
  const r = ok(await banco().rpc("admin_copias")) as unknown as { lista: Copia[] };
  return r?.lista ?? [];
}

/** Lembrete do alto do painel: sem cópia completa há mais de 7 dias. */
export function LembreteDaCopia({ aoAbrir }: { aoAbrir: () => void }) {
  const [ultima, setUltima] = useState<string | null | undefined>(undefined);
  useEffect(() => { lerCopias().then((l) => setUltima(l[0]?.quando ?? null), () => setUltima(undefined)); }, []);
  if (ultima === undefined || !copiaVelha(ultima)) return null;
  return (
    <div className="g-aviso" role="status" style={{ marginBottom: 14 }}>
      <TriangleAlert />
      <span>{ultima ? `A última cópia completa foi baixada ${haQuanto(ultima)} (${dataCompleta(ultima)}).` : "Nenhuma cópia completa baixada ainda."} Baixe uma por semana.</span>
      <button className="g-btn p verde" onClick={aoAbrir}>Ver</button>
    </div>
  );
}

/** Aba "Dados" do painel: cópia completa do banco e contas marcadas para serem apagadas. */
export default function AbaDados() {
  const { avisar, avisarErro } = useAvisos();
  const [copias, setCopias] = useState<Copia[] | null>(null);
  const [exclusoes, setExclusoes] = useState<Exclusao[]>([]);
  const [rotinas, setRotinas] = useState<Rotinas | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [baixando, setBaixando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [c, x, ro] = await Promise.all([lerCopias(), banco().rpc("admin_exclusoes"), lerRotinas().catch(() => null)]);
      setCopias(c);
      setRotinas(ro);
      setExclusoes((ok(x) as unknown as Exclusao[]) ?? []);
      setErro(null);
    } catch (e) { setErro(mensagemDeErro(e)); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  async function baixar() {
    if (baixando) return;
    setBaixando(true);
    try {
      const { data } = await banco().auth.getSession();
      const r = await fetch("/api/gestao/admin/copia", { headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` }, cache: "no-store" });
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { mensagem?: string } | null;
        throw new Error(j?.mensagem ?? "Não consegui montar a cópia agora.");
      }
      const arquivo = await r.blob();
      const nome = /filename="([^"]+)"/.exec(r.headers.get("content-disposition") ?? "")?.[1] ?? "maestro-copia-completa.zip";
      const url = URL.createObjectURL(arquivo);
      const a = document.createElement("a");
      a.href = url; a.download = nome;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      avisar("Cópia completa baixada. Guarde criptografada, em lugar seguro.");
      await carregar();
    } catch (e) { avisarErro(e); } finally { setBaixando(false); }
  }

  if (erro) return <p className="g-aviso vermelho" role="alert">{erro}</p>;
  if (!copias) return <Esqueleto linhas={4} />;
  const ultima = copias[0];
  const marcadas = exclusoes.filter((x) => !x.cancelado_em && !x.apagado_em);
  const antigas = exclusoes.filter((x) => x.cancelado_em || x.apagado_em);

  return (
    <div className="g-pilha g">
      <section className="g-pilha">
        <h2>Cópia completa</h2>
        <div className="g-card g-pilha p">
          <p className="g-p">
            Um .zip com todas as tabelas do banco em JSON e um manifesto (data e quantas linhas tem cada tabela). Ficam de fora os logins e senhas,
            os arquivos (fotos, PDFs) e os códigos de acesso das páginas públicas. Tem dados pessoais de clientes de todos os pet shops: guarde criptografado.
          </p>
          <p className={copiaVelha(ultima?.quando) ? "g-aviso" : "g-muted g-p"} role="status">
            {ultima ? `Última cópia baixada em ${quando(ultima.quando)}${ultima.quem ? ` por ${ultima.quem}` : ""} (${ultima.tabelas ?? "?"} tabelas, ${ultima.linhas ?? "?"} linhas).` : "Nenhuma cópia completa baixada ainda."}
            {copiaVelha(ultima?.quando) ? ` Faz mais de ${DIAS_SEM_COPIA} dias: baixe uma agora.` : ""}
          </p>
          <div><button className="g-btn verde" onClick={() => void baixar()} disabled={baixando}><DatabaseBackup />{baixando ? "Montando a cópia…" : "Baixar cópia completa"}</button></div>
        </div>
      </section>

      {rotinas && (
        <section className="g-pilha" data-teste="rotinas">
          <h2>Rotinas automáticas</h2>
          <p className="g-muted g-p">O que roda sozinho todo dia. Se uma delas passar de um dia e meio sem rodar bem, aparece aqui e no alto do painel.</p>
          <div className="g-card g-lista" style={{ paddingBlock: 6 }}>
            {rotinas.rotinas.map((r) => (
              <div key={`${r.onde}-${r.nome}`} className="g-linha" data-teste="rotina">
                <span className="t">
                  <b style={{ overflowWrap: "anywhere", whiteSpace: "normal" }}>{nomeDaRotina(r)}</b>
                  <span style={{ overflowWrap: "anywhere", whiteSpace: "normal" }}>{situacaoDaRotina(r)}</span>
                  {r.nome === "faxina" && r.atrasada && (
                    <span className="g-pp" style={{ overflowWrap: "anywhere", whiteSpace: "normal" }}>
                      Confira no servidor (Vercel): as variáveis CRON_SECRET e SUPABASE_SERVICE_ROLE_KEY e se a tarefa agendada está ligada. O motivo costuma aparecer na aba Erros.
                    </span>
                  )}
                </span>
                <span className={`g-tag ${r.atrasada ? "vermelho" : r.ultima_ok_em ? "verde" : ""}`}>{r.atrasada ? "atrasada" : r.ultima_ok_em ? "em dia" : "aguardando"}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="g-pilha">
        <h2>Contas para apagar</h2>
        <p className="g-muted g-p">Pedidos de &quot;Encerrar e apagar a conta&quot;. A conta fica só para consulta e a faxina diária apaga no dia marcado. O dono pode cancelar até lá.</p>
        <div className="g-card g-lista" style={{ paddingBlock: 6 }}>
          {!marcadas.length ? <p className="g-muted g-p">Nenhuma conta marcada para apagar.</p> : marcadas.map((x) => (
            <div key={x.id} className="g-linha">
              <span className="t">
                <b style={{ overflowWrap: "anywhere" }}>{x.petshop}</b>
                <span style={{ overflowWrap: "anywhere" }}>Apaga em {dataCompleta(x.apagar_em)} · pedido em {dataCompleta(x.pedido_em)}{x.pedido_nome ? ` por ${x.pedido_nome}` : ""}{x.pedido_email ? ` (${x.pedido_email})` : ""}</span>
                {x.atrasada && <span role="alert" style={{ overflowWrap: "anywhere", whiteSpace: "normal" }}><strong>Já devia ter sido apagada:</strong> o prazo venceu {haQuanto(x.apagar_em)}. Veja se a faxina diária está rodando (Rotinas automáticas, acima).</span>}
                {x.comecou_em && <span style={{ overflowWrap: "anywhere", whiteSpace: "normal" }}>Apagando desde {quando(x.comecou_em)}{x.linhas_apagadas ? ` · ${Number(x.linhas_apagadas).toLocaleString("pt-BR")} linhas já saíram` : ""}. Continua na próxima faxina.</span>}
                {x.erro && <span style={{ overflowWrap: "anywhere", whiteSpace: "normal" }}>A última tentativa{x.tentou_em ? ` (${quando(x.tentou_em)})` : ""} falhou{x.tentativas ? `, ${x.tentativas} ${x.tentativas === 1 ? "vez" : "vezes"}` : ""}: {x.erro}</span>}
              </span>
              <span className={`g-tag ${x.atrasada ? "vermelho" : "amarelo"}`} data-teste={x.atrasada ? "exclusao-atrasada" : undefined}>{x.atrasada ? "atrasada" : x.comecou_em ? "apagando" : "marcada"}</span>
            </div>
          ))}
        </div>
        {antigas.length > 0 && (
          <div className="g-card g-lista" style={{ paddingBlock: 6 }}>
            {antigas.map((x) => (
              <div key={x.id} className="g-linha">
                <span className="t">
                  <b style={{ overflowWrap: "anywhere" }}>{x.petshop}</b>
                  <span>{x.apagado_em ? `Apagada em ${quando(x.apagado_em)}${x.usuarios ? ` · ${x.usuarios} ${x.usuarios === 1 ? "login apagado" : "logins apagados"}` : ""}` : `Cancelada em ${quando(x.cancelado_em!)}`}</span>
                </span>
                <span className={`g-tag ${x.apagado_em ? "" : "verde"}`}>{x.apagado_em ? "apagada" : "cancelada"}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
