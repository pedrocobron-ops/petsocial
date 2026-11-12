"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarHeart, ChevronRight, HandCoins, Mail, MapPin, MessageCircle, NotebookPen, PawPrint, Pencil, Phone, Plus, Receipt, Users, Wallet } from "lucide-react";
import type { Cliente, Lancamento, Pet } from "@/lib/gestao/tipos";
import { brl, dataCompleta, fmtTelefone, haQuanto, linkWhatsApp } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import FormPet from "../form-pet";
import { Tile } from "../painel";
import { AvatarPessoa, AvatarPet, avisarMudanca, Esqueleto, ok, useAvisos, useDados, useSomenteLeitura, Vazio } from "../ui";
import { linkPet, nomePorte, primeiroNome } from "./comum";
import FormTutor from "./form-tutor";
import { EtiquetaEspecie } from "./lista";

type Entrada = Pick<Lancamento, "id" | "valor" | "data" | "categoria" | "descricao" | "pago">;

export default function FichaTutor({ id, voltar, aoExcluir }: { id: string; voltar: () => void; aoExcluir: () => void }) {
  const { sb, petshop, vejoFinanceiro, souDono } = useGestao();
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
  const aReceber = entradas.filter((l) => !l.pago).reduce((s, l) => s + Number(l.valor), 0);
  const ativos = pets.filter((p) => p.ativo).length;

  async function excluir() {
    if (!souDono || somenteLeitura()) return;
    const nomes = pets.map((p) => p.nome).join(", ");
    const sim = await confirmar({
      titulo: `Excluir ${cliente.nome} de vez?`,
      texto: `Isso apaga ${pets.length ? `${pets.length === 1 ? "o pet" : "os pets"} (${nomes}), ` : ""}os horários marcados e já atendidos, os pacotes, as estadias de creche e hotel e todo o histórico. `
        + "Os relatórios e a comissão de meses passados mudam, porque esses atendimentos deixam de existir. O dinheiro já lançado continua no financeiro, sem o nome do cliente. "
        + `Não dá para desfazer. ${pets.some((p) => p.ativo) ? "Se a ideia é só tirar da lista, volte e use Desativar pet na ficha de cada pet: o histórico fica guardado." : "Os pets já estão desativados e fora da lista; se não precisa apagar, é só voltar."}`,
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
        <section className="g-cli-heroi menta">
          <Users className="fundo" aria-hidden />
          <div className="quem">
            <AvatarPessoa nome={cliente.nome} tamanho="g" />
            <div>
              <h1>{cliente.nome}</h1>
              <p className="tutor"><Phone aria-hidden />{fmtTelefone(cliente.telefone) || "Sem telefone"}</p>
              <div className="g-cli-etqs">
                <span className="g-cli-etq pessego"><PawPrint aria-hidden />{pets.length === 1 ? "1 pet" : `${pets.length} pets`}</span>
                <span className="g-cli-etq">Cliente desde {dataCompleta(cliente.criado_em)}</span>
              </div>
            </div>
          </div>
          <div className="gc-botoes">
            {zap && <a className="g-btn zap" href={zap} target="_blank" rel="noopener noreferrer"><MessageCircle />WhatsApp</a>}
            <button className="g-btn sec" onClick={() => { if (!somenteLeitura()) setEditando(true); }}><Pencil />Editar</button>
          </div>
        </section>
      </div>

      <div className={`g-cli-nums${vejoFinanceiro ? "" : " dois"}`}>
        <div className="g-cli-num">
          <Tile icone={PawPrint} tom="pessego" />
          <div><span className="g-rotulo">Pets</span><b className="g-tab">{pets.length}</b><small>{ativos === pets.length ? (pets.length === 1 ? "na lista" : "todos na lista") : `${ativos} na lista, ${pets.length - ativos} ${pets.length - ativos === 1 ? "desativado" : "desativados"}`}</small></div>
        </div>
        <div className="g-cli-num">
          <Tile icone={CalendarHeart} tom="ceu" />
          <div><span className="g-rotulo">Cliente</span><b>{haQuanto(cliente.criado_em)}</b><small>desde {dataCompleta(cliente.criado_em)}</small></div>
        </div>
        {vejoFinanceiro && (
          <>
            <div className="g-cli-num">
              <Tile icone={Wallet} tom="menta" />
              <div><span className="g-rotulo">Já gastou aqui</span><b className="g-tab">{brl(total)}</b><small>{!pagas.length ? "nenhuma entrada" : pagas.length === 1 ? "em 1 entrada recebida" : `em ${pagas.length} entradas recebidas`}</small></div>
            </div>
            <div className="g-cli-num">
              <Tile icone={HandCoins} tom="manteiga" />
              <div><span className="g-rotulo">A receber</span><b className="g-tab">{brl(aReceber)}</b><small>{pagas.length ? `última entrada em ${dataCompleta(pagas[0].data)}` : "nada recebido ainda"}</small></div>
            </div>
          </>
        )}
      </div>

      <div className="gc-colunas">
        <div>
          <section className="g-card">
            <div className="g-card-t">
              <h3><Tile icone={PawPrint} tom="pessego" tamanho="p" />Pets</h3>
              <button className="g-btn pri p" onClick={() => { if (!somenteLeitura()) setPetNovo(true); }}><Plus />Adicionar pet</button>
            </div>
            {!pets.length ? <p className="g-muted g-p">Nenhum pet na ficha ainda.</p> : (
              <div className="g-cli-grade dentro">
                {pets.map((p) => (
                  <Link key={p.id} href={linkPet(p.id)} scroll={false} className={`g-cli-pet${p.ativo ? "" : " apagado"}`}>
                    <span className="cab">
                      <AvatarPet pet={p} tamanho="g" />
                      <span className="t">
                        <b>{p.nome}</b>
                        <span>{p.raca || " "}</span>
                      </span>
                      <ChevronRight className="seta" aria-hidden />
                    </span>
                    <span className="pe">
                      <span className="g-cli-etqs">
                        <EtiquetaEspecie especie={p.especie} />
                        {p.porte && <span className="g-cli-etq">{nomePorte(p.porte)}</span>}
                        {!p.ativo && <span className="g-cli-etq">Desativado</span>}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {vejoFinanceiro && (
            <section className="g-card">
              <div className="g-card-t"><h3><Tile icone={Wallet} tom="menta" tamanho="p" />Quanto já gastou aqui</h3></div>
              <p className="g-num m">{brl(total)}</p>
              <p className="g-pp g-muted" style={{ marginTop: 4 }}>
                {!pagas.length ? "Nenhuma entrada ligada a este cliente." : pagas.length === 1 ? "Em 1 entrada recebida." : `Em ${pagas.length} entradas recebidas.`}
              </p>
              {entradas.length > 0 && (
                <div className="g-lista" style={{ marginTop: 8 }}>
                  {entradas.slice(0, 8).map((l) => (
                    <div key={l.id} className="g-linha">
                      <Tile icone={Receipt} tom={l.pago ? "menta" : "manteiga"} tamanho="p" />
                      <span className="t">
                        <b>{l.descricao?.trim() || l.categoria}</b>
                        <span>{dataCompleta(l.data)}{l.descricao?.trim() ? ` · ${l.categoria}` : ""}</span>
                      </span>
                      <span className="d gc-linha-tags">
                        <b>{brl(l.valor)}</b>
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
            <div className="g-card-t"><h3><Tile icone={Phone} tom="ceu" tamanho="p" />Contato</h3></div>
            <div className="g-cli-contato">
              <div><Tile icone={Phone} tom="ceu" tamanho="p" /><div><span>Telefone</span><p>{fmtTelefone(cliente.telefone) || <span className="g-muted">Não informado</span>}</p></div></div>
              <div><Tile icone={Mail} tom="lilas" tamanho="p" /><div><span>E-mail</span><p>{cliente.email ? <a className="g-link" href={`mailto:${cliente.email}`}>{cliente.email}</a> : <span className="g-muted">Não informado</span>}</p></div></div>
              <div><Tile icone={MapPin} tom="pessego" tamanho="p" /><div><span>Endereço</span><p>{cliente.endereco || <span className="g-muted">Não informado</span>}</p></div></div>
              {cliente.obs?.trim() && <div><Tile icone={NotebookPen} tom="manteiga" tamanho="p" /><div><span>Observações</span><p className="gc-texto">{cliente.obs}</p></div></div>}
              <div><Tile icone={CalendarHeart} tom="menta" tamanho="p" /><div><span>Cliente desde</span><p>{dataCompleta(cliente.criado_em)}</p></div></div>
            </div>
          </section>

          {souDono ? (
            <div className="g-pilha p">
              <div><button className="g-btn perigo" onClick={() => void excluir()}>Excluir cliente de vez</button></div>
              <p className="g-pp g-muted">Se o cliente pedir para sair do seu cadastro, é por aqui. Apaga os pets, os horários, os pacotes e o histórico dele. Para só tirar da lista, desative o pet na ficha do pet.</p>
            </div>
          ) : (
            <p className="g-pp g-muted">Só o dono pode excluir de vez. Para tirar um pet da lista sem apagar o histórico, abra a ficha do pet e toque em Desativar pet.</p>
          )}
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
