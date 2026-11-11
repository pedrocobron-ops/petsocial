"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Sparkles, User } from "lucide-react";
import { fmtTelefone, soDigitos } from "@/lib/gestao/util";
import { useGestao } from "./contexto";
import { AvatarPet, Folha, abrirAssistente } from "./ui";

type Achado =
  | { tipo: "pet"; id: string; nome: string; apoio: string; foto: string | null; especie: string | null }
  | { tipo: "tutor"; id: string; nome: string; apoio: string }
  | { tipo: "mozart"; id: "mozart"; nome: string; apoio: string };

/** Busca do aplicativo inteiro: acha pet e tutor pelo nome ou telefone, ou manda a pergunta para o Mozart. */
export default function BuscaGeral() {
  const { sb, petshop } = useGestao();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [aberta, setAberta] = useState(false);
  const [folha, setFolha] = useState(false);
  const [achados, setAchados] = useState<Achado[]>([]);
  const [ativo, setAtivo] = useState(0);
  const campo = useRef<HTMLInputElement>(null);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const termo = q.trim();
    if (termo.length < 2) { setAchados([]); return; }
    let vale = true;
    const t = setTimeout(async () => {
      const limpo = termo.replace(/[%,()]/g, " ");
      const fone = soDigitos(termo);
      const [pets, tutores] = await Promise.all([
        sb.from("pets").select("id, nome, foto, especie, raca, clientes(nome)").eq("petshop_id", petshop.id).eq("ativo", true).ilike("nome", `%${limpo}%`).order("nome").limit(6),
        sb.from("clientes").select("id, nome, telefone").eq("petshop_id", petshop.id).or(fone.length >= 4 ? `nome.ilike.%${limpo}%,telefone.ilike.%${fone}%` : `nome.ilike.%${limpo}%`).order("nome").limit(5),
      ]);
      if (!vale) return;
      setAchados([
        ...(pets.data ?? []).map((p): Achado => ({ tipo: "pet", id: p.id, nome: p.nome, foto: p.foto, especie: p.especie, apoio: [(p.clientes as { nome: string } | null)?.nome, p.raca].filter(Boolean).join(" · ") })),
        ...(tutores.data ?? []).map((c): Achado => ({ tipo: "tutor", id: c.id, nome: c.nome, apoio: fmtTelefone(c.telefone) || "Tutor" })),
        { tipo: "mozart", id: "mozart", nome: `Pedir ao Mozart: "${termo}"`, apoio: "O assistente responde ou faz para você" },
      ]);
      setAtivo(0);
    }, 180);
    return () => { vale = false; clearTimeout(t); };
  }, [q, sb, petshop.id]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); campo.current?.focus(); }
    };
    const fora = (e: MouseEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) setAberta(false); };
    document.addEventListener("keydown", tecla);
    document.addEventListener("mousedown", fora);
    return () => { document.removeEventListener("keydown", tecla); document.removeEventListener("mousedown", fora); };
  }, []);

  const ir = (a: Achado) => {
    setAberta(false); setFolha(false); setQ("");
    campo.current?.blur();
    if (a.tipo === "mozart") abrirAssistente(q.trim());
    else router.push(`/gestao/app/clientes?${a.tipo === "pet" ? "pet" : "cliente"}=${a.id}`);
  };

  const lista = achados.length > 0 && (
    <div className="g-buscar-lista" role="listbox">
      {achados.map((a, i) => (
        <button key={`${a.tipo}-${a.id}`} type="button" role="option" aria-selected={i === ativo} className={`g-linha${i === ativo ? " ativo" : ""}`} onMouseEnter={() => setAtivo(i)} onClick={() => ir(a)}>
          {a.tipo === "pet" ? <AvatarPet pet={{ nome: a.nome, foto: a.foto, especie: a.especie }} tamanho="p" />
            : <span className={`g-tile p ${a.tipo === "tutor" ? "ceu" : "pessego"}`} aria-hidden>{a.tipo === "tutor" ? <User /> : <Sparkles />}</span>}
          <span className="t"><b>{a.nome}</b><span>{a.apoio}</span></span>
        </button>
      ))}
    </div>
  );

  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setAtivo((i) => Math.min(achados.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAtivo((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter" && achados[ativo]) { e.preventDefault(); ir(achados[ativo]); }
    else if (e.key === "Escape") { setAberta(false); campo.current?.blur(); }
  };

  return (
    <div className="g-buscar" ref={caixa}>
      <div className="g-buscar-campo">
        <Search />
        <input ref={campo} value={q} placeholder="Buscar pet, tutor ou telefone" aria-label="Buscar pet, tutor ou telefone"
          onChange={(e) => { setQ(e.target.value); setAberta(true); }} onFocus={() => setAberta(true)} onKeyDown={teclas} />
        <kbd>Ctrl K</kbd>
        {aberta && lista}
      </div>
      <button className="g-ico g-buscar-botao" aria-label="Buscar" onClick={() => setFolha(true)}><Search /></button>
      {folha && (
        <Folha titulo="Buscar" aoFechar={() => { setFolha(false); setQ(""); }}>
          <div className="g-pilha p g-buscar-folha">
            <div className="g-busca"><Search /><input className="g-input" autoFocus value={q} placeholder="Pet, tutor ou telefone" onChange={(e) => setQ(e.target.value)} onKeyDown={teclas} /></div>
            {lista || <p className="g-muted g-p" style={{ padding: "8px 4px" }}>Digite pelo menos duas letras.</p>}
          </div>
        </Folha>
      )}
    </div>
  );
}
