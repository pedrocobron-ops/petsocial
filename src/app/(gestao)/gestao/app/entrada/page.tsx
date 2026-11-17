"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { COLS_ENTRADA, enderecosDosArquivos, resumoDaEntrada, type Entrada } from "@/lib/gestao/entrada";
import { dataCurta, fmtTelefone, hora } from "@/lib/gestao/util";
import { useGestao } from "@/components/gestao/contexto";
import { Esqueleto, ok, useDados } from "@/components/gestao/ui";
import { CabecalhoDoPapel, ControlesDoPapel, Papel, useTituloDoPapel } from "@/components/gestao/papel";
import "@/components/gestao/entrada/entrada.css";

/**
 * Comprovante da entrada, para imprimir ou salvar em PDF: como o pet chegou, as fotos, o texto aceito e o aceite do tutor
 * (assinatura, ou o link com a hora, o IP e o aparelho). `id=<entrada>`. Não mostra valores.
 */
type Visita = { pet: string; especie: string | null; tutor: string | null; telefone: string | null; quando: string; tipo: string; voltar: string };

function Comprovante() {
  const { sb, petshop } = useGestao();
  const id = useSearchParams().get("id") ?? "";
  const { dados, carregando, erro } = useDados(async () => {
    if (!/^[0-9a-f-]{36}$/.test(id)) return null;
    const e = ok(await sb.from("entradas").select(COLS_ENTRADA).eq("petshop_id", petshop.id).eq("id", id).maybeSingle()) as unknown as Entrada | null;
    if (!e) return null;
    const pet = ok(await sb.from("pets").select("nome, especie, clientes(nome, telefone)").eq("id", e.pet_id).maybeSingle()) as unknown as { nome: string; especie: string | null; clientes: { nome: string; telefone: string | null } | null } | null;
    let quando = e.criado_em, tipo = "Banho e tosa";
    if (e.agendamento_id) {
      const a = await sb.from("agendamentos").select("inicio").eq("id", e.agendamento_id).maybeSingle();
      quando = a.data?.inicio ?? quando;
    } else if (e.estadia_id) {
      const s = await sb.from("estadias").select("entrada, tipo").eq("id", e.estadia_id).maybeSingle();
      quando = s.data?.entrada ?? quando; tipo = s.data?.tipo === "hotel" ? "Hotel" : "Creche";
    }
    // o código do aceite (SHA-256 do texto e das fotos, migração 20261210); banco antes da atualização: segue sem ele
    const h = e.aceito_em ? await sb.from("entradas").select("aceite_hash").eq("id", e.id).maybeSingle().then((r) => (r.error ? null : r.data?.aceite_hash ?? null), () => null) : null;
    const urls = await enderecosDosArquivos(sb, [...e.fotos, ...(e.aceite_assinatura ? [e.aceite_assinatura] : [])]);
    const visita: Visita = { pet: pet?.nome ?? "Pet", especie: pet?.especie ?? null, tutor: pet?.clientes?.nome ?? null, telefone: pet?.clientes?.telefone ?? null, quando, tipo,
      voltar: e.agendamento_id ? "/gestao/app/agenda" : "/gestao/app/creche-hotel?ver=casa" };
    return { e, visita, urls, hash: h };
  }, [petshop.id, id]);
  useTituloDoPapel(dados ? `Entrada ${dados.visita.pet} ${dataCurta(new Date(dados.visita.quando)).replace(/\//g, "-")} · ${petshop.nome}` : `Entrada · ${petshop.nome}`);
  const e = dados?.e, v = dados?.visita;

  return (
    <div className="g-imp">
      <ControlesDoPapel voltar={v?.voltar ?? "/gestao/app"} rotuloVoltar="Voltar" dica="O comprovante não mostra valores." />
      <Papel pe="Comprovante de entrada">
        <CabecalhoDoPapel titulo="Comprovante de entrada" apoio={v ? `${v.pet} · ${v.tipo} · ${dataCurta(new Date(v.quando))} às ${hora(v.quando)}` : undefined} />
        {erro && <p className="g-erro" role="alert">{erro}</p>}
        {carregando && !dados ? <Esqueleto linhas={6} /> : !e || !v ? <p className="g-pa-vazio">Não achei esta entrada.</p> : (
          <div className="g-pilha" data-teste="comprovante-entrada">
            <dl className="g-ent-resumo g-ent-comp">
              {[
                { nome: "Pet", valor: v.pet },
                { nome: "Tutor", valor: [v.tutor, v.telefone ? fmtTelefone(v.telefone) : null].filter(Boolean).join(" · ") || "—" },
                { nome: "Conferido em", valor: `${dataCurta(new Date(e.criado_em))} às ${hora(e.criado_em)}` },
                ...resumoDaEntrada(e).map((l) => ({ nome: l.rotulo, valor: l.texto })),
              ].map((l) => <div key={l.nome}><dt>{l.nome}</dt><dd>{l.valor}</dd></div>)}
            </dl>
            {e.fotos.length > 0 && (
              <div className="g-pa-caixa larga">
                <h3>Fotos do que já existia</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {e.fotos.map((f, i) => dados.urls.get(f) ? <img key={f} src={dados.urls.get(f)} alt={`Foto ${i + 1}`} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 8 }} /> : null)}
                </div>
              </div>
            )}
            <div className="g-pa-caixa larga">
              <h3>Texto aceito pelo tutor</h3>
              {e.termo.split("\n").filter((x) => x.trim()).map((p, i) => <p key={i}>{p}</p>)}
            </div>
            <div className="g-pa-caixa larga">
              <h3>Aceite do tutor</h3>
              {!e.aceito_em ? <p className="vazio">Pendente. O tutor ainda não aceitou.</p> : (
                <>
                  <p><b>{e.aceite_nome}</b>, {e.aceite === "link" ? "pelo link no celular" : "com assinatura no aparelho da loja"}, em {dataCurta(new Date(e.aceito_em))} às {hora(e.aceito_em)}.</p>
                  {e.aceite_assinatura && dados.urls.get(e.aceite_assinatura) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={dados.urls.get(e.aceite_assinatura)} alt={`Assinatura de ${e.aceite_nome ?? "tutor"}`} data-teste="assinatura-impressa" style={{ display: "block", maxWidth: 360, width: "100%", height: "auto", borderBottom: "1px solid #999" }} />
                  )}
                  {(e.aceite_ip || e.aceite_navegador) && <p style={{ fontSize: ".75rem", color: "#666", overflowWrap: "anywhere" }}>{e.aceite_ip ? `IP ${e.aceite_ip}` : ""}{e.aceite_ip && e.aceite_navegador ? " · " : ""}{e.aceite_navegador ?? ""}</p>}
                  {dados.hash && <p style={{ fontSize: ".75rem", color: "#666", overflowWrap: "anywhere" }} data-teste="aceite-hash">Código do aceite (SHA-256 do texto aceito e das fotos): {dados.hash}</p>}
                </>
              )}
            </div>
            {e.devolvido_em && <p className="g-pp">Pertences devolvidos em {dataCurta(new Date(e.devolvido_em))} às {hora(e.devolvido_em)}.</p>}
          </div>
        )}
      </Papel>
    </div>
  );
}

export default function Pagina() {
  return <Suspense fallback={null}><Comprovante /></Suspense>;
}
