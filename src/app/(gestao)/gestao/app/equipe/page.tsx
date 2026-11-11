"use client";

import { useState } from "react";
import { Copy, UserPlus } from "lucide-react";
import { useGestao } from "@/components/gestao/contexto";
import { AvatarPessoa, Campo, Folha, Vazio, avisarMudanca, ok, useAvisos, useSomenteLeitura } from "@/components/gestao/ui";
import { CORES, EscolherCor, GradeHorario, NOME_DIAS, ORDEM_DIAS, erroDoHorario, lerHorario } from "@/components/gestao/ajustes/grade-horario";
import type { Horario, Papel, Profissional } from "@/lib/gestao/tipos";
import "@/components/gestao/ajustes/ajustes.css";

const PAPEL: Record<Papel, string> = { dono: "Dono", gerente: "Gerente", funcionario: "Funcionário" };
const pct = (n: number) => `${String(Number(n)).replace(".", ",")}%`;

export default function Equipe() {
  const { souDono, equipe, eu, sb, recarregarBase } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [editando, setEditando] = useState<Profissional | "novo" | null>(null);
  if (!souDono) return <Vazio titulo="Só o dono do pet shop mexe aqui." />;

  const ativos = equipe.filter((p) => p.ativo);
  const inativos = equipe.filter((p) => !p.ativo);
  const abrir = (p: Profissional | "novo") => { if (!somenteLeitura()) setEditando(p); };

  async function reativar(p: Profissional) {
    if (somenteLeitura()) return;
    try {
      ok(await sb.from("profissionais").update({ ativo: true }).eq("id", p.id).eq("petshop_id", p.petshop_id).select("id"));
      await recarregarBase();
      avisarMudanca();
      avisar(`${p.nome} voltou para a equipe.`);
    } catch (x) { avisarErro(x); }
  }

  return (
    <>
      <header className="g-topo">
        <div><h1>Equipe</h1><p className="g-muted">Quem trabalha com você, o que cada um vê e em que dias.</p></div>
        <div className="g-acoes"><button className="g-btn pri" onClick={() => abrir("novo")}><UserPlus />Adicionar pessoa</button></div>
      </header>
      <div className="g-grade c2" style={{ alignItems: "start" }}>
        <section className="g-card">
          <div className="g-lista">
            {ativos.map((p) => (
              <button key={p.id} type="button" className="g-linha" onClick={() => abrir(p)}>
                <AvatarPessoa nome={p.nome} cor={p.cor} />
                <span className="t">
                  <b>{p.nome}{p.id === eu.id ? " (você)" : ""}</b>
                  <span>{PAPEL[p.papel]}{Number(p.comissao_pct) > 0 ? ` · comissão de ${pct(p.comissao_pct)}` : ""}</span>
                  <small className="gj-tags">
                    {p.atende && <small className="g-tag verde">atende na agenda</small>}
                    {(p.papel !== "funcionario" || p.ve_financeiro) && <small className="g-tag azul">vê o financeiro</small>}
                    {p.user_id ? <small className="g-tag">com login</small> : p.email_convite ? <small className="g-tag amarelo">convite enviado</small> : null}
                  </small>
                </span>
              </button>
            ))}
          </div>
          {ativos.length === 1 && (
            <p className="g-muted g-p" style={{ marginTop: 10 }}>Por enquanto é só você. Adicione quem dá banho, tosa ou atende no balcão.</p>
          )}
          {inativos.length > 0 && (
            <details className="gj-recolhe" style={{ marginTop: 12 }}>
              <summary>{inativos.length === 1 ? "1 pessoa desativada" : `${inativos.length} pessoas desativadas`}</summary>
              <div className="g-lista">
                {inativos.map((p) => (
                  <div key={p.id} className="g-linha">
                    <AvatarPessoa nome={p.nome} cor="#a39a90" tamanho="p" />
                    <span className="t"><b className="g-muted">{p.nome}</b><span>{PAPEL[p.papel]}</span></span>
                    <button className="g-btn p sec" onClick={() => reativar(p)}>Reativar</button>
                  </div>
                ))}
              </div>
            </details>
          )}
        </section>
        <EscalaDaSemana />
      </div>
      {editando && <FolhaPessoa pessoa={editando === "novo" ? null : editando} aoFechar={() => setEditando(null)} />}
    </>
  );
}

/* ---------- escala da semana ---------- */

function EscalaDaSemana() {
  const { petshop, equipe } = useGestao();
  const loja = lerHorario(petshop.horario);
  const quem = equipe.filter((p) => p.ativo && (p.atende || p.escala));
  return (
    <section className="g-card">
      <div className="g-card-t"><h2>Escala da semana</h2></div>
      <div className="gj-escala">
        {ORDEM_DIAS.map((d) => {
          const doDia = quem
            .map((p) => ({ p, h: p.escala ? lerHorario(p.escala)[d] : loja[d] }))
            .filter((x): x is { p: Profissional; h: NonNullable<Horario[string]> } => !!x.h);
          return (
            <div key={d}>
              <b>{NOME_DIAS[d]}</b>
              <div className="g-chips">
                {!loja[d] && <span className="g-tag">Fechado</span>}
                {doDia.map(({ p, h }) => (
                  <span key={p.id} className="gj-quem"><i style={{ background: p.cor }} aria-hidden />{p.nome.split(" ")[0]} <span>{h.abre}–{h.fecha}</span></span>
                ))}
                {loja[d] && !doDia.length && <span className="g-muted g-p">Ninguém escalado</span>}
              </div>
            </div>
          );
        })}
      </div>
      <p className="g-muted g-pp" style={{ marginTop: 10 }}>Para mudar os dias de alguém, toque no nome da pessoa.</p>
    </section>
  );
}

/* ---------- adicionar ou editar ---------- */

function FolhaPessoa({ pessoa, aoFechar }: { pessoa: Profissional | null; aoFechar: () => void }) {
  const { sb, petshop, equipe, recarregarBase } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const ehDono = pessoa?.papel === "dono";
  const loja = lerHorario(petshop.horario);
  const [nome, setNome] = useState(pessoa?.nome ?? "");
  const [papel, setPapel] = useState<Papel>(pessoa?.papel ?? "funcionario");
  const [atende, setAtende] = useState(pessoa?.atende ?? true);
  const [veFinanceiro, setVeFinanceiro] = useState(pessoa?.ve_financeiro ?? false);
  const [comissao, setComissao] = useState(pessoa && Number(pessoa.comissao_pct) > 0 ? String(Number(pessoa.comissao_pct)).replace(".", ",") : "");
  const [cor, setCor] = useState(pessoa?.cor ?? CORES[equipe.length % CORES.length]);
  const [email, setEmail] = useState(pessoa?.email_convite ?? "");
  const [segueLoja, setSegueLoja] = useState(!pessoa?.escala);
  const [escala, setEscala] = useState<Horario>(() => (pessoa?.escala ? lerHorario(pessoa.escala) : loja));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const semprVe = papel !== "funcionario";

  async function copiarConvite() {
    const link = `${location.origin}/gestao/criar-conta`;
    const e = email.trim().toLowerCase();
    const texto = `Oi${nome.trim() ? `, ${nome.trim().split(" ")[0]}` : ""}! Você agora faz parte da equipe do ${petshop.nome} no Maestro Pet. Crie a sua conta em ${link}${e ? ` usando o e-mail ${e}` : ""} e você já entra direto na equipe.`;
    try {
      await navigator.clipboard.writeText(texto);
      avisar("Convite copiado. Agora é só colar no WhatsApp.");
    } catch { avisarErro(new Error("Não consegui copiar. Copie o endereço: " + link)); }
  }

  async function salvar() {
    const n = nome.trim();
    const e = email.trim().toLowerCase();
    const c = comissao.trim() ? Number(comissao.replace(",", ".")) : 0;
    if (!n) return setErro("Escreva o nome da pessoa.");
    if (!Number.isFinite(c) || c < 0 || c > 100) return setErro("A comissão fica entre 0 e 100%.");
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return setErro("Confira o e-mail.");
    if (e && equipe.some((p) => p.id !== pessoa?.id && p.email_convite?.toLowerCase() === e)) return setErro("Esse e-mail já está em outra pessoa da equipe.");
    const problema = segueLoja ? null : erroDoHorario(escala);
    if (problema) return setErro(problema);
    setErro(null);
    setSalvando(true);
    const campos = {
      nome: n.slice(0, 80),
      // o dono continua dono; ninguém vira dono por aqui
      papel: ehDono ? ("dono" as const) : papel === "gerente" ? ("gerente" as const) : ("funcionario" as const),
      atende,
      ve_financeiro: ehDono || papel === "gerente" ? true : veFinanceiro,
      comissao_pct: Math.round(c * 100) / 100,
      cor,
      escala: segueLoja ? null : escala,
      // quem já tem login não troca de e-mail por aqui
      ...(pessoa?.user_id ? {} : { email_convite: e || null }),
    };
    try {
      if (pessoa) ok(await sb.from("profissionais").update(campos).eq("id", pessoa.id).eq("petshop_id", petshop.id).select("id"));
      else ok(await sb.from("profissionais").insert({ ...campos, petshop_id: petshop.id }).select("id"));
      await recarregarBase();
      avisarMudanca();
      avisar(pessoa ? "Salvo." : `${n.split(" ")[0]} entrou na equipe.`);
      aoFechar();
    } catch (x) { avisarErro(x); setSalvando(false); }
  }

  async function desativar() {
    if (!pessoa || ehDono) return;
    const sim = await confirmar({
      titulo: `Desativar ${pessoa.nome}?`,
      texto: "A pessoa perde o acesso e some da agenda. O histórico dela continua guardado e você pode reativar quando quiser.",
      confirmar: "Desativar", perigo: true,
    });
    if (!sim) return;
    setSalvando(true);
    try {
      ok(await sb.from("profissionais").update({ ativo: false }).eq("id", pessoa.id).eq("petshop_id", petshop.id).neq("papel", "dono").select("id"));
      await recarregarBase();
      avisarMudanca();
      avisar(`${pessoa.nome} não tem mais acesso.`);
      aoFechar();
    } catch (x) { avisarErro(x); setSalvando(false); }
  }

  return (
    <Folha titulo={pessoa ? pessoa.nome : "Adicionar pessoa"} aoFechar={aoFechar}
      rodape={<>
        <button className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button className="g-btn pri" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
      </>}>
      <div className="g-form">
        <Campo rotulo="Nome"><input className="g-input" value={nome} maxLength={80} autoFocus={!pessoa} onChange={(e) => setNome(e.target.value)} /></Campo>

        <div className="g-campo">
          <span>Papel</span>
          {ehDono ? <p className="g-muted g-p">Dono. Vê e mexe em tudo.</p> : (
            <>
              <div className="g-chips">
                <button type="button" className="g-chip" aria-pressed={papel === "funcionario"} onClick={() => setPapel("funcionario")}>Funcionário</button>
                <button type="button" className="g-chip" aria-pressed={papel === "gerente"} onClick={() => setPapel("gerente")}>Gerente</button>
              </div>
              <small>{papel === "gerente" ? "Gerente vê o caixa e o financeiro, mas não mexe na equipe nem na assinatura." : "Funcionário cuida da agenda, dos clientes e dos pets."}</small>
            </>
          )}
        </div>

        <label className="g-check">
          <input type="checkbox" checked={atende} onChange={(e) => setAtende(e.target.checked)} />
          <span>Atende na agenda <span className="g-muted">(aparece para escolher em cada horário)</span></span>
        </label>
        <label className="g-check">
          <input type="checkbox" checked={semprVe || veFinanceiro} disabled={semprVe} onChange={(e) => setVeFinanceiro(e.target.checked)} />
          <span>Vê o caixa e o financeiro{semprVe && <span className="g-muted"> ({ehDono ? "dono" : "gerente"} sempre vê)</span>}</span>
        </label>

        <Campo rotulo="Comissão (%)" dica="De 0 a 100. Deixe em branco se a pessoa não ganha comissão.">
          <input className="g-input g-tab" inputMode="decimal" placeholder="0" style={{ maxWidth: "8rem" }} value={comissao}
            onChange={(e) => setComissao(e.target.value.replace(/[^\d,.]/g, "").slice(0, 6))} />
        </Campo>

        <div className="g-campo"><span>Cor na agenda</span><EscolherCor valor={cor} aoMudar={setCor} /></div>

        <hr className="g-sep" />
        {pessoa?.user_id ? (
          <p className="g-muted g-p">{ehDono ? "Esta é a conta que criou o pet shop." : "Esta pessoa já entra com o próprio login."}</p>
        ) : (
          <div className="g-pilha p">
            <Campo rotulo="E-mail para login (opcional)"
              dica="Peça para a pessoa criar a conta em maestropet.com/gestao/criar-conta com este e-mail. Ela entra direto na equipe.">
              <input className="g-input" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" placeholder="nome@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Campo>
            <div><button type="button" className="g-btn p sec" onClick={copiarConvite}><Copy />Copiar convite</button></div>
          </div>
        )}

        <hr className="g-sep" />
        <div className="g-pilha p">
          <h3>Escala</h3>
          <label className="g-check">
            <input type="checkbox" checked={segueLoja} onChange={(e) => setSegueLoja(e.target.checked)} />
            Segue o horário do pet shop
          </label>
          {!segueLoja && <GradeHorario valor={escala} aoMudar={(h) => { setEscala(h); setErro(null); }} aberto="Trabalha" fechado="Folga" base={loja} />}
        </div>

        {erro && <p className="g-erro" role="alert">{erro}</p>}

        {pessoa && !ehDono && (
          <>
            <hr className="g-sep" />
            <div><button type="button" className="g-btn p perigo" onClick={desativar} disabled={salvando}>Desativar pessoa</button></div>
          </>
        )}
      </div>
    </Folha>
  );
}
