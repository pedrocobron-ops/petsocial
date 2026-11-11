"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, MessageCircle, Pencil, Plus } from "lucide-react";
import type { Cliente, Lancamento, Pet } from "@/lib/gestao/tipos";
import { brl, dataCompleta, fmtTelefone, linkWhatsApp } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import FormPet from "../form-pet";
import { AvatarPessoa, AvatarPet, avisarMudanca, Esqueleto, ok, useAvisos, useDados, useSomenteLeitura, Vazio } from "../ui";
import { linkPet, nomePorte, primeiroNome } from "./comum";
import FormTutor from "./form-tutor";

type Entrada = Pick<Lancamento, "id" | "valor" | "data" | "categoria" | "descricao" | "pago">;

export default function FichaTutor({ id, voltar, aoExcluir }: { id: string; voltar: () => void; aoExcluir: () => void }) {
  const { sb, petshop, vejoFinanceiro } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [editando, setEditando] = useState(false);
  const [petNovo, setPetNovo] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  const { dados, carregando, erro, recarregar } = useDados(async () => {
    const [cliente, pets, entradas] = await Promise.all([
      sb.from("clientes").select("*").eq("petshop_id", petshop.id).eq("id", id).maybeSingle(),
      sb.from("pets").select("*").eq("petshop_id", petshop.id).eq("cliente_id", id).order("ativo", { ascending: false }).order("nome"),
      vejoFinanceiro
        ? sb.from("lancamentos").select("id, valor, data, categoria, descricao, pago").eq("petshop_id", petshop.id).eq("cliente_id", id).eq("tipo", "entrada")
          .order("data", { ascending: false }).order("criado_em", { ascending: false }).limit(1000)
        : null,
    ]);
    if (cliente.error) throw new Error(cliente.error.message);
    if (pets.error) throw new Error(pets.error.message);
    if (entradas?.error) throw new Error(entradas.error.message);
    return { cliente: cliente.data as Cliente | null, pets: (pets.data ?? []) as Pet[], entradas: (entradas?.data ?? []) as Entrada[] };
  }, [petshop.id, id, vejoFinanceiro]);

  const botaoVoltar = <button className="g-voltar" onClick={voltar}><ArrowLeft />Voltar</button>;

  if (excluindo) return <Esqueleto linhas={3} />;
  if (erro && !dados) {
    return <>{botaoVoltar}<Vazio titulo="Não consegui abrir a ficha" texto={erro}><button className="g-btn verde" onClick={() => void recarregar()}>Tentar de novo</button></Vazio></>;
  }
  if (carregando && !dados) return <>{botaoVoltar}<Esqueleto linhas={5} /></>;
  if (!dados?.cliente) {
    return <>{botaoVoltar}<Vazio titulo="Não achei esse cliente" texto="Pode ser que a ficha tenha sido apagada."><button className="g-btn verde" onClick={voltar}>Ver a lista</button></Vazio></>;
  }

  const { cliente, pets, entradas } = dados;
  const zap = linkWhatsApp(cliente.telefone, `Oi, ${primeiroNome(cliente.nome)}! Aqui é do ${petshop.nome}. `);
  const pagas = entradas.filter((l) => l.pago);
  const total = pagas.reduce((s, l) => s + Number(l.valor), 0);

  async function excluir() {
    if (somenteLeitura()) return;
    const nomes = pets.map((p) => p.nome).join(", ");
    const sim = await confirmar({
      titulo: `Excluir ${cliente.nome}?`,
      texto: `Apaga de vez os dados de contato${pets.length ? `, ${pets.length === 1 ? "o pet" : "os pets"} (${nomes})` : ""}, fotos, agendamentos, pacotes e estadias. `
        + "O que já entrou no financeiro continua lá, sem ligação com o cliente. Não dá para desfazer.",
      confirmar: "Excluir de vez", perigo: true,
    });
    if (!sim) return;
    setExcluindo(true);
    try {
      const apagados = ok(await sb.from("clientes").delete().eq("id", cliente.id).eq("petshop_id", petshop.id).select("id"));
      if (!apagados.length) throw new Error("Não consegui excluir. Sua conta pode estar só para consulta.");
      const fotos = pets.map((p) => p.foto).filter((f): f is string => !!f);
      if (fotos.length) await sb.storage.from("pets").remove(fotos).catch(() => null); // as fichas já foram; a foto é limpeza
      avisar(`${cliente.nome} foi excluído.`);
      aoExcluir();
      avisarMudanca();
    } catch (e) { avisarErro(e); setExcluindo(false); }
  }

  return (
    <div className="gc-ficha">
      <div>
        {botaoVoltar}
        <div className="gc-cab">
          <AvatarPessoa nome={cliente.nome} tamanho="g" />
          <div>
            <h1>{cliente.nome}</h1>
            <p className="g-muted g-p">{[fmtTelefone(cliente.telefone) || "Sem telefone", pets.length === 1 ? "1 pet" : `${pets.length} pets`].join(" · ")}</p>
          </div>
        </div>
      </div>

      <div className="gc-botoes">
        {zap && <a className="g-btn zap" href={zap} target="_blank" rel="noopener noreferrer"><MessageCircle />WhatsApp</a>}
        <button className="g-btn sec" onClick={() => { if (!somenteLeitura()) setEditando(true); }}><Pencil />Editar</button>
      </div>

      <div className="gc-colunas">
        <div>
          <section className="g-card">
            <div className="g-card-t">
              <h3>Pets</h3>
              <button className="g-btn pri p" onClick={() => { if (!somenteLeitura()) setPetNovo(true); }}><Plus />Adicionar pet</button>
            </div>
            {!pets.length ? <p className="g-muted g-p">Nenhum pet na ficha ainda.</p> : (
              <div className="g-lista">
                {pets.map((p) => (
                  <Link key={p.id} href={linkPet(p.id)} scroll={false} className="g-linha" style={{ textDecoration: "none" }}>
                    <AvatarPet pet={p} />
                    <span className="t">
                      <b>{p.nome}</b>
                      <span>{[p.raca, p.porte ? nomePorte(p.porte) : null].filter(Boolean).join(" · ") || " "}</span>
                    </span>
                    {!p.ativo && <span className="d"><span className="g-tag">Desativado</span></span>}
                  </Link>
                ))}
              </div>
            )}
          </section>

          {vejoFinanceiro && (
            <section className="g-card">
              <div className="g-card-t"><h3>Quanto já gastou aqui</h3></div>
              <p className="g-num m">{brl(total)}</p>
              <p className="g-pp g-muted" style={{ marginTop: 4 }}>
                {!pagas.length ? "Nenhuma entrada ligada a este cliente." : pagas.length === 1 ? "Em 1 entrada recebida." : `Em ${pagas.length} entradas recebidas.`}
              </p>
              {entradas.length > 0 && (
                <div className="g-lista" style={{ marginTop: 8 }}>
                  {entradas.slice(0, 8).map((l) => (
                    <div key={l.id} className="g-linha">
                      <span className="t">
                        <b>{l.descricao?.trim() || l.categoria}</b>
                        <span>{dataCompleta(l.data)}{l.descricao?.trim() ? ` · ${l.categoria}` : ""}</span>
                      </span>
                      <span className="d gc-linha-tags">
                        <span>{brl(l.valor)}</span>
                        {!l.pago && <span className="g-tag amarelo">A receber</span>}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>

        <div>
          <section className="g-card">
            <div className="g-card-t"><h3>Contato</h3></div>
            <dl className="gc-dados">
              <div><dt>Telefone</dt><dd>{fmtTelefone(cliente.telefone) || <span className="g-muted">Não informado</span>}</dd></div>
              <div><dt>E-mail</dt><dd>{cliente.email ? <a className="g-link" href={`mailto:${cliente.email}`}>{cliente.email}</a> : <span className="g-muted">Não informado</span>}</dd></div>
              <div><dt>Endereço</dt><dd>{cliente.endereco || <span className="g-muted">Não informado</span>}</dd></div>
              {cliente.obs?.trim() && <div><dt>Observações</dt><dd className="gc-texto">{cliente.obs}</dd></div>}
              <div><dt>Cliente desde</dt><dd>{dataCompleta(cliente.criado_em)}</dd></div>
            </dl>
          </section>

          <div className="g-pilha p">
            <div><button className="g-btn perigo p" onClick={() => void excluir()}>Excluir cliente</button></div>
            <p className="g-pp g-muted">Se o cliente pedir para sair do seu cadastro, é por aqui. Apaga os pets e o histórico dele.</p>
          </div>
        </div>
      </div>

      {editando && <FormTutor cliente={cliente} aoFechar={() => setEditando(false)} aoSalvar={() => { setEditando(false); avisarMudanca(); }} />}
      {petNovo && (
        <FormPet clienteFixo={{ id: cliente.id, nome: cliente.nome, telefone: cliente.telefone }} aoFechar={() => setPetNovo(false)}
          aoSalvar={() => { setPetNovo(false); avisarMudanca(); }} />
      )}
    </div>
  );
}
