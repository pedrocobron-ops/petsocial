"use client";

import { useState } from "react";
import { Plus, Tag } from "lucide-react";
import { useGestao } from "@/components/gestao/contexto";
import { Campo, CampoValor, Folha, Vazio, avisarMudanca, ok, useAvisos, useSomenteLeitura } from "@/components/gestao/ui";
import { EscolherCor, GradeHorario, erroDoHorario, lerHorario } from "@/components/gestao/ajustes/grade-horario";
import { PORTES, type Horario, type Porte, type Servico } from "@/lib/gestao/tipos";
import { brlCurto, fmtTelefone, soDigitos } from "@/lib/gestao/util";
import "@/components/gestao/ajustes/ajustes.css";

const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
const CATEGORIAS = [
  { id: "banho", rotulo: "Banho" },
  { id: "tosa", rotulo: "Tosa" },
  { id: "banho_tosa", rotulo: "Banho e tosa" },
  { id: "creche", rotulo: "Creche" },
  { id: "hotel", rotulo: "Hotel" },
  { id: "outro", rotulo: "Outro" },
];
const DURACOES = [15, 30, 45, 60, 90, 120];
const CAMPO_PRECO = { P: "preco_p", M: "preco_m", G: "preco_g", GG: "preco_gg" } as const;

function duracao(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}
const precos = (s: Servico) => PORTES.map((p) => ({ porte: p.id, valor: s[CAMPO_PRECO[p.id]] })).filter((x) => x.valor != null);

export default function MeuPetshop() {
  const { souDono, servicos } = useGestao();
  if (!souDono) return <Vazio titulo="Só o dono do pet shop mexe aqui." />;
  const semPreco = servicos.some((s) => s.ativo && !precos(s).length);
  return (
    <>
      <header className="g-topo">
        <div><h1>Meu pet shop</h1><p className="g-muted">Dados, horário e os serviços que você oferece.</p></div>
      </header>
      {semPreco && (
        <div className="g-aviso"><Tag /><span className="g-cresce">Coloque os preços dos serviços para o Mozart e a agenda já sugerirem o valor certo.</span></div>
      )}
      <div className="g-grade c2" style={{ alignItems: "start" }}>
        <div className="g-pilha">
          <Dados />
          <HorarioDaLoja />
        </div>
        <Servicos />
      </div>
    </>
  );
}

/* ---------- dados ---------- */

function Dados() {
  const { sb, petshop, recarregarBase } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [nome, setNome] = useState(petshop.nome);
  const [telefone, setTelefone] = useState(fmtTelefone(petshop.telefone));
  const [cidade, setCidade] = useState(petshop.cidade ?? "");
  const [uf, setUf] = useState(petshop.uf ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (somenteLeitura()) return;
    const n = nome.trim();
    const tel = soDigitos(telefone);
    if (n.length < 2) return setErro("Escreva o nome do pet shop.");
    if (tel && tel.length !== 10 && tel.length !== 11) return setErro("Confira o WhatsApp: DDD e número.");
    setErro(null);
    setSalvando(true);
    try {
      ok(await sb.from("petshops").update({ nome: n.slice(0, 80), telefone: tel || null, cidade: cidade.trim() || null, uf: uf || null }).eq("id", petshop.id).select("id"));
      await recarregarBase();
      setTelefone(fmtTelefone(tel));
      avisar("Dados salvos.");
    } catch (x) { avisarErro(x); } finally { setSalvando(false); }
  }

  return (
    <form className="g-card g-form" onSubmit={salvar}>
      <h2>Dados</h2>
      <Campo rotulo="Nome do pet shop"><input className="g-input" value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} /></Campo>
      <Campo rotulo="WhatsApp" dica="O número que os clientes usam para falar com vocês.">
        <input className="g-input" type="tel" inputMode="tel" autoComplete="tel" placeholder="(11) 91234-5678" value={telefone}
          onChange={(e) => setTelefone(e.target.value)} onBlur={() => setTelefone(fmtTelefone(telefone))} />
      </Campo>
      <div className="dupla" style={{ gridTemplateColumns: "1fr 6.5rem" }}>
        <Campo rotulo="Cidade"><input className="g-input" value={cidade} maxLength={80} onChange={(e) => setCidade(e.target.value)} /></Campo>
        <Campo rotulo="UF">
          <select className="g-select" value={uf} onChange={(e) => setUf(e.target.value)}>
            <option value="">—</option>
            {uf && !UFS.includes(uf) && <option value={uf}>{uf}</option>}
            {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </Campo>
      </div>
      {erro && <p className="g-erro" role="alert">{erro}</p>}
      <div><button className="g-btn verde" disabled={salvando}>{salvando ? "Salvando…" : "Salvar dados"}</button></div>
    </form>
  );
}

/* ---------- horário ---------- */

function HorarioDaLoja() {
  const { sb, petshop, recarregarBase } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [horario, setHorario] = useState<Horario>(() => lerHorario(petshop.horario));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (somenteLeitura()) return;
    const problema = erroDoHorario(horario);
    setErro(problema);
    if (problema) return;
    setSalvando(true);
    try {
      ok(await sb.from("petshops").update({ horario }).eq("id", petshop.id).select("id"));
      await recarregarBase();
      avisarMudanca();
      avisar("Horário salvo.");
    } catch (x) { avisarErro(x); } finally { setSalvando(false); }
  }

  return (
    <section className="g-card g-pilha">
      <div><h2>Horário de funcionamento</h2><p className="g-muted g-p">A agenda mostra só as horas em que vocês estão abertos.</p></div>
      <GradeHorario valor={horario} aoMudar={(h) => { setHorario(h); setErro(null); }} />
      {erro && <p className="g-erro" role="alert">{erro}</p>}
      <div><button className="g-btn verde" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar horário"}</button></div>
    </section>
  );
}

/* ---------- serviços e preços ---------- */

function Servicos() {
  const { sb, servicos, recarregarBase } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [editando, setEditando] = useState<Servico | "novo" | null>(null);
  const ativos = servicos.filter((s) => s.ativo);
  const inativos = servicos.filter((s) => !s.ativo);
  const abrir = (s: Servico | "novo") => { if (!somenteLeitura()) setEditando(s); };

  async function reativar(s: Servico) {
    if (somenteLeitura()) return;
    try {
      ok(await sb.from("servicos").update({ ativo: true }).eq("id", s.id).eq("petshop_id", s.petshop_id).select("id"));
      await recarregarBase();
      avisarMudanca();
      avisar(`${s.nome} voltou para a lista.`);
    } catch (x) { avisarErro(x); }
  }

  return (
    <section className="g-card">
      <div className="g-card-t">
        <h2>Serviços e preços</h2>
        <button className="g-btn p pri" onClick={() => abrir("novo")}><Plus />Serviço novo</button>
      </div>
      {!ativos.length ? (
        <Vazio titulo="Nenhum serviço na lista" texto="Coloque o primeiro: banho, tosa, creche, o que vocês fazem." />
      ) : (
        <div className="g-lista">
          {ativos.map((s) => {
            const p = precos(s);
            return (
              <button key={s.id} type="button" className="g-linha" onClick={() => abrir(s)}>
                <i className="gj-bola" style={{ background: s.cor }} aria-hidden />
                <span className="t">
                  <b>{s.nome}</b>
                  <span className="gj-quebra g-tab">
                    {duracao(s.duracao_min)}{p.length ? ` · ${p.map((x) => `${x.porte} ${brlCurto(x.valor)}`).join(" · ")}` : ""}
                  </span>
                </span>
                {!p.length && <span className="g-tag amarelo">sem preço</span>}
              </button>
            );
          })}
        </div>
      )}
      {inativos.length > 0 && (
        <details className="gj-recolhe" style={{ marginTop: 12 }}>
          <summary>{inativos.length === 1 ? "1 serviço desativado" : `${inativos.length} serviços desativados`}</summary>
          <div className="g-lista">
            {inativos.map((s) => (
              <div key={s.id} className="g-linha">
                <i className="gj-bola" style={{ background: s.cor, opacity: .45 }} aria-hidden />
                <span className="t"><b className="g-muted">{s.nome}</b><span>{duracao(s.duracao_min)}</span></span>
                <button className="g-btn p sec" onClick={() => reativar(s)}>Reativar</button>
              </div>
            ))}
          </div>
        </details>
      )}
      {editando && <FolhaServico servico={editando === "novo" ? null : editando} aoFechar={() => setEditando(null)} />}
    </section>
  );
}

function FolhaServico({ servico, aoFechar }: { servico: Servico | null; aoFechar: () => void }) {
  const { sb, petshop, servicos, recarregarBase } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const [nome, setNome] = useState(servico?.nome ?? "");
  const [categoria, setCategoria] = useState(servico?.categoria ?? "banho");
  const [minutos, setMinutos] = useState(String(servico?.duracao_min ?? 60));
  const [valores, setValores] = useState<Record<Porte, number | null>>({
    P: servico?.preco_p ?? null, M: servico?.preco_m ?? null, G: servico?.preco_g ?? null, GG: servico?.preco_gg ?? null,
  });
  const [cor, setCor] = useState(servico?.cor ?? "#f97316");
  const [ativo, setAtivo] = useState(servico?.ativo ?? true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const primeiro = valores.P ?? valores.M ?? valores.G ?? valores.GG;

  async function salvar() {
    const n = nome.trim();
    const min = Number(minutos);
    if (!n) return setErro("Dê um nome ao serviço.");
    if (!Number.isInteger(min) || min < 5 || min > 1440) return setErro("A duração fica entre 5 minutos e 24 horas.");
    if (PORTES.some((p) => (valores[p.id] ?? 0) < 0 || (valores[p.id] ?? 0) > 99999)) return setErro("Confira os preços.");
    setErro(null);
    setSalvando(true);
    const campos = {
      nome: n.slice(0, 80), categoria, duracao_min: min, cor, ativo,
      preco_p: valores.P, preco_m: valores.M, preco_g: valores.G, preco_gg: valores.GG,
    };
    try {
      if (servico) {
        ok(await sb.from("servicos").update(campos).eq("id", servico.id).eq("petshop_id", petshop.id).select("id"));
      } else {
        const ordem = servicos.reduce((m, s) => Math.max(m, s.ordem), 0) + 1;
        ok(await sb.from("servicos").insert({ ...campos, petshop_id: petshop.id, ordem }).select("id"));
      }
      await recarregarBase();
      avisarMudanca();
      avisar(servico ? (ativo ? "Serviço salvo." : "Serviço desativado.") : "Serviço criado.");
      aoFechar();
    } catch (x) { avisarErro(x); setSalvando(false); }
  }

  return (
    <Folha titulo={servico ? "Editar serviço" : "Serviço novo"} aoFechar={aoFechar}
      rodape={<>
        <button className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button className="g-btn pri" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
      </>}>
      <div className="g-form">
        <Campo rotulo="Nome"><input className="g-input" value={nome} maxLength={80} placeholder="Banho, Tosa higiênica…" autoFocus={!servico} onChange={(e) => setNome(e.target.value)} /></Campo>
        <Campo rotulo="Tipo">
          <select className="g-select" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {CATEGORIAS.map((c) => <option key={c.id} value={c.id}>{c.rotulo}</option>)}
          </select>
        </Campo>
        <div className="g-campo">
          <span>Quanto tempo leva</span>
          <div className="g-chips">
            {DURACOES.map((d) => (
              <button key={d} type="button" className="g-chip" aria-pressed={Number(minutos) === d} onClick={() => setMinutos(String(d))}>{duracao(d)}</button>
            ))}
          </div>
          <div className="gj-min">
            <input className="g-input g-tab" inputMode="numeric" aria-label="Duração em minutos" value={minutos} onChange={(e) => setMinutos(e.target.value.replace(/\D/g, "").slice(0, 4))} />
            <span className="g-muted g-p">minutos</span>
          </div>
        </div>
        <div className="g-campo">
          <span>Preço por porte</span>
          <div className="dupla">
            {PORTES.map((p) => (
              <Campo key={p.id} rotulo={`${p.id} · ${p.rotulo}`}>
                <CampoValor valor={valores[p.id]} aoMudar={(v) => setValores((a) => ({ ...a, [p.id]: v }))} />
              </Campo>
            ))}
          </div>
          <div>
            <button type="button" className="g-link g-p" disabled={primeiro == null}
              onClick={() => setValores({ P: primeiro, M: primeiro, G: primeiro, GG: primeiro })}>
              Usar o mesmo preço para todos
            </button>
          </div>
          <small>Pode deixar em branco o porte que vocês não atendem.</small>
        </div>
        <div className="g-campo"><span>Cor na agenda</span><EscolherCor valor={cor} aoMudar={setCor} /></div>
        {servico && (
          <label className="g-check">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
            <span>Ativo <span className="g-muted">(desmarque para tirar da agenda sem apagar o histórico)</span></span>
          </label>
        )}
        {erro && <p className="g-erro" role="alert">{erro}</p>}
      </div>
    </Folha>
  );
}
