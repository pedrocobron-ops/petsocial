"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { Database } from "@/lib/gestao/banco";
import type { Banco } from "@/lib/gestao/supabase";
import { brl } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { avisarMudanca, Campo, CampoValor, Esqueleto, Folha, ok, useAvisos, useDados, useSomenteLeitura } from "../ui";

/**
 * Modelos de plano da creche ("2x por semana · R$ 480"): o dono monta uma vez e escolhe no cadastro do mensalista.
 * Têm preço: só quem cuida do financeiro lê e grava (o banco confere). O plano guarda de qual modelo veio o preço,
 * para o reajuste do modelo poder acompanhar os mensalistas dele.
 */
export type ModeloDePlano = Database["public"]["Tables"]["creche_modelos"]["Row"];

export async function lerModelos(sb: Banco, petshopId: string): Promise<ModeloDePlano[]> {
  const r = await sb.from("creche_modelos").select("*").eq("petshop_id", petshopId).order("vezes", { nullsFirst: false }).order("valor_mensal").order("id").limit(100);
  if (r.error) throw new Error(r.error.message);
  return r.data ?? [];
}

type Rascunho = { id: string | null; nome: string; vezes: number | null; mensal: number | null; extra: number | null };
const NOVO: Rascunho = { id: null, nome: "", vezes: null, mensal: null, extra: null };

export default function ModelosDePlano({ aoFechar, aoMudar }: { aoFechar: () => void; aoMudar: () => void }) {
  const { sb, petshop } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [r, setR] = useState<Rascunho | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const { dados, carregando, recarregar } = useDados(async () => {
    const [modelos, usos] = await Promise.all([
      lerModelos(sb, petshop.id),
      sb.from("creche_planos_valores").select("plano_id, modelo_id, valor_mensal").eq("petshop_id", petshop.id).not("modelo_id", "is", null).limit(5000),
    ]);
    const porModelo = new Map<string, number>();
    for (const u of usos.data ?? []) if (u.modelo_id) porModelo.set(u.modelo_id, (porModelo.get(u.modelo_id) ?? 0) + 1);
    return { modelos, porModelo };
  }, [petshop.id]);

  const sugerirNome = (x: Rascunho) => (x.nome.trim() ? x.nome : x.vezes ? `${x.vezes}x por semana` : "");

  async function salvar() {
    if (!r || salvando || somenteLeitura()) return;
    const nome = sugerirNome(r).trim();
    if (!nome) return setErro("Dê um nome ao modelo. Ex.: 3x por semana.");
    if (r.mensal == null || r.mensal < 0 || r.mensal > 99999) return setErro("Preencha o valor da mensalidade.");
    if (r.extra != null && (r.extra < 0 || r.extra > 99999)) return setErro("Confira o preço do dia extra.");
    setErro(null);
    const antes = r.id ? dados?.modelos.find((m) => m.id === r.id) : undefined;
    const usam = r.id ? dados?.porModelo.get(r.id) ?? 0 : 0;
    const mudouPreco = antes && (Number(antes.valor_mensal) !== r.mensal || (antes.valor_extra == null ? null : Number(antes.valor_extra)) !== r.extra);
    // reajuste: o dono decide se os mensalistas deste modelo acompanham (nada muda sozinho)
    let acompanhar = false;
    if (mudouPreco && usam > 0) {
      acompanhar = await confirmar({
        titulo: `Mudar também ${usam === 1 ? "o mensalista" : `os ${usam} mensalistas`} deste modelo?`,
        texto: `A mensalidade do modelo passa de ${brl(antes!.valor_mensal)} para ${brl(r.mensal)}. Se você confirmar, ${usam === 1 ? "o plano que usa este modelo passa" : `os ${usam} planos que usam este modelo passam`} a valer o preço novo nas próximas cobranças. Cobrança que já foi gerada não muda. Se voltar, só o modelo muda e os planos atuais ficam como estão.`,
        confirmar: "Mudar os planos também",
      });
    }
    setSalvando(true);
    try {
      const campos = { nome: nome.slice(0, 60), vezes: r.vezes, valor_mensal: r.mensal, valor_extra: r.extra };
      if (r.id) ok(await sb.from("creche_modelos").update(campos).eq("id", r.id).eq("petshop_id", petshop.id).select("id").single());
      else ok(await sb.from("creche_modelos").insert({ ...campos, petshop_id: petshop.id }).select("id").single());
      if (acompanhar && r.id) {
        const n = ok(await sb.from("creche_planos_valores").update({ valor_mensal: r.mensal, valor_extra: r.extra, atualizado_em: new Date().toISOString() }).eq("modelo_id", r.id).eq("petshop_id", petshop.id).select("plano_id"));
        avisar(`Modelo salvo. ${n.length === 1 ? "1 plano passou" : `${n.length} planos passaram`} para o preço novo.`);
      } else avisar("Modelo salvo.");
      setR(null);
      await recarregar();
      aoMudar(); avisarMudanca();
    } catch (e) { avisarErro(e); } finally { setSalvando(false); }
  }

  async function apagar(id: string, nome: string) {
    if (somenteLeitura()) return;
    const usam = dados?.porModelo.get(id) ?? 0;
    if (!(await confirmar({ titulo: `Apagar o modelo ${nome}?`, texto: usam ? `${usam === 1 ? "1 mensalista usa" : `${usam} mensalistas usam`} este modelo: o plano e o preço deles continuam como estão, só deixam de acompanhar o modelo.` : "Nenhum mensalista usa este modelo.", confirmar: "Apagar modelo", perigo: true }))) return;
    try { ok(await sb.from("creche_modelos").delete().eq("id", id).eq("petshop_id", petshop.id).select("id")); avisar("Modelo apagado."); await recarregar(); aoMudar(); } catch (e) { avisarErro(e); }
  }

  if (r) {
    return (
      <Folha titulo={r.id ? "Alterar modelo de plano" : "Novo modelo de plano"} aoFechar={() => { setR(null); setErro(null); }}
        rodape={<>
          <button className="g-btn sec" onClick={() => { setR(null); setErro(null); }}>Voltar</button>
          <button className="g-btn pri" onClick={() => void salvar()} disabled={salvando}>{salvando ? "Salvando…" : "Salvar modelo"}</button>
        </>}>
        <div className="g-form">
          <Campo rotulo="Quantos dias por semana" dica="Só para o modelo certo aparecer primeiro quando você marca os dias do pet.">
            <select className="g-select" value={r.vezes ?? ""} onChange={(e) => { setR({ ...r, vezes: e.target.value ? Number(e.target.value) : null }); setErro(null); }}>
              <option value="">Qualquer quantidade</option>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}x por semana</option>)}
            </select>
          </Campo>
          <Campo rotulo="Nome do modelo"><input className="g-input" value={r.nome} maxLength={60} placeholder={r.vezes ? `${r.vezes}x por semana` : "Ex.: 3x por semana, meio período"} onChange={(e) => { setR({ ...r, nome: e.target.value }); setErro(null); }} /></Campo>
          <div className="dupla">
            <Campo rotulo="Mensalidade"><CampoValor valor={r.mensal} aoMudar={(v) => { setR({ ...r, mensal: v }); setErro(null); }} /></Campo>
            <Campo rotulo="Preço do dia extra" dica="Opcional. Em branco, vale a diária da creche."><CampoValor valor={r.extra} aoMudar={(v) => setR({ ...r, extra: v })} /></Campo>
          </div>
          {erro && <p className="g-erro" role="alert">{erro}</p>}
        </div>
      </Folha>
    );
  }

  return (
    <Folha titulo="Modelos de plano" aoFechar={aoFechar}
      rodape={<>
        <button className="g-btn sec" onClick={aoFechar}>Fechar</button>
        <button className="g-btn pri" onClick={() => { if (!somenteLeitura()) setR(NOVO); }}><Plus />Novo modelo</button>
      </>}>
      <div className="g-pilha p">
        <p className="g-muted g-p">Monte os planos que você vende (2x, 3x, 5x por semana) com o preço de cada um. No cadastro do mensalista, um toque no modelo preenche a mensalidade. Quando o preço subir, você muda aqui e escolhe se os mensalistas do modelo acompanham.</p>
        {carregando && !dados ? <Esqueleto linhas={2} /> : !dados?.modelos.length ? <p className="g-muted g-centro" style={{ padding: "20px 8px" }}>Nenhum modelo ainda.</p> : (
          <div className="g-lista">
            {dados.modelos.map((m) => {
              const usam = dados.porModelo.get(m.id) ?? 0;
              return (
                <div key={m.id} className="g-linha">
                  <span className="t">
                    <b>{m.nome} <span className="g-tab">· {brl(m.valor_mensal)}</span></b>
                    <span>{[m.valor_extra != null ? `dia extra ${brl(m.valor_extra)}` : "dia extra pela diária da creche", usam ? (usam === 1 ? "1 mensalista" : `${usam} mensalistas`) : "nenhum mensalista ainda"].join(" · ")}</span>
                  </span>
                  <button className="g-btn fantasma p" onClick={() => { if (!somenteLeitura()) setR({ id: m.id, nome: m.nome, vezes: m.vezes, mensal: Number(m.valor_mensal), extra: m.valor_extra == null ? null : Number(m.valor_extra) }); }} aria-label={`Alterar o modelo ${m.nome}`}><Pencil />Alterar</button>
                  <button className="g-ico" onClick={() => void apagar(m.id, m.nome)} aria-label={`Apagar o modelo ${m.nome}`}><Trash2 /></button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Folha>
  );
}
