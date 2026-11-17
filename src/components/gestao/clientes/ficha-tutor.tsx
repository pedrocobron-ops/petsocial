"use client";

import { saudacaoZap } from "@/lib/gestao/agenda";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarHeart, ChevronRight, HandCoins, Mail, MapPin, Merge, MessageCircle, NotebookPen, PawPrint, Pencil, Phone, Plus, Receipt, Users, Wallet } from "lucide-react";
import type { Cliente, Lancamento, Pet } from "@/lib/gestao/tipos";
import { brl, dataCompleta, fmtTelefone, haQuanto, linkWhatsApp, telefoneValido } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { CartaoFidelidade } from "../fidelidade";
import CartaoPaginaDoTutor from "../casa/pagina-do-tutor";
import { DividaDoTutor } from "../financeiro/contas-clientes";
import { CreditoDoTutor } from "../hotel/credito";
import { categoriaAtual, FolhaLancamento } from "../financeiro/comum";
import { descricaoAtual } from "@/lib/gestao/dinheiro";
import FormPet from "../form-pet";
import { Tile } from "../painel";
import { AvatarPessoa, AvatarPet, avisarMudanca, Esqueleto, ok, useAvisos, useDados, useSomenteLeitura, Vazio } from "../ui";
import { linkPet, nomePorte } from "./comum";
import FormTutor from "./form-tutor";
import { FolhaJuntarTutor } from "./juntar";
import { EtiquetaEspecie } from "./lista";
import DadosDoTutor from "../lgpd/dados-do-tutor";

type Entrada = Pick<Lancamento, "id" | "valor" | "data" | "categoria" | "descricao" | "pago">;

export default function FichaTutor({ id, voltar, aoExcluir, aoAbrir }: { id: string; voltar: () => void; aoExcluir: () => void; /** a ficha terminou de carregar */ aoAbrir?: () => void }) {
  // `vejoFinanceiro` (Caixa, Financeiro ou Relatórios): vê e recebe o que o tutor deve. `cuidoDoFinanceiro`: vê também quanto ele já gastou.
  const { sb, petshop, vejoFinanceiro, cuidoDoFinanceiro, souDono, posso } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [editando, setEditando] = useState(false);
  const [petNovo, setPetNovo] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [juntando, setJuntando] = useState(false);
  // "deve R$ 20" solto: taxa de falta, diferença esquecida (vira conta a receber deste tutor)
  const [anotando, setAnotando] = useState(false);

  const { dados, carregando, erro, recarregar } = useDados(async () => {
    const [cliente, pets, entradas, devolucoes] = await Promise.all([
      sb.from("clientes").select("*").eq("petshop_id", petshop.id).eq("id", id).maybeSingle(),
      sb.from("pets").select("*").eq("petshop_id", petshop.id).eq("cliente_id", id).order("ativo", { ascending: false }).order("nome"),
      cuidoDoFinanceiro
        ? sb.from("lancamentos").select("id, valor, data, categoria, descricao, pago").eq("petshop_id", petshop.id).eq("cliente_id", id).eq("tipo", "entrada").is("movimento", null)
          .order("data", { ascending: false }).order("criado_em", { ascending: false }).limit(1000)
        : null,
      // o que foi devolvido ao tutor (pagou a mais, sinal devolvido) sai do que ele gastou
      cuidoDoFinanceiro
        ? sb.from("lancamentos").select("valor").eq("petshop_id", petshop.id).eq("cliente_id", id).eq("tipo", "saida").eq("pago", true).in("categoria", ["Devolução", "Devolução de sinal"]).limit(1000)
        : null,
    ]);
    if (cliente.error) throw new Error(cliente.error.message);
    if (pets.error) throw new Error(pets.error.message);
    if (entradas?.error) throw new Error(entradas.error.message);
    const devolvido = Math.round(((devolucoes?.data ?? []) as { valor: number }[]).reduce((s, l) => s + Number(l.valor), 0) * 100) / 100;
    // crédito do tutor (a mesma regra do faturamento): o que ficou com ele ainda é dele; o usado no check-out (fora de uma entrada) conta
    const creditos = cuidoDoFinanceiro ? await sb.from("clientes_creditos").select("valor, lancamento_id").eq("petshop_id", petshop.id).eq("cliente_id", id).limit(1000) : null;
    const ajusteCredito = Math.round(((creditos?.data ?? []) as { valor: number; lancamento_id: string | null }[])
      .reduce((s, c) => s + (Number(c.valor) > 0 ? -Number(c.valor) : c.lancamento_id ? 0 : -Number(c.valor)), 0) * 100) / 100;
    return { cliente: cliente.data as Cliente | null, pets: (pets.data ?? []) as Pet[], entradas: (entradas?.data ?? []) as Entrada[], devolvido, ajusteCredito };
  }, [petshop.id, id, cuidoDoFinanceiro]);
  useEffect(() => { if (!carregando) aoAbrir?.(); }, [carregando]); // eslint-disable-line react-hooks/exhaustive-deps

  const botaoVoltar = <button className="g-voltar" onClick={voltar}><ArrowLeft />Voltar</button>;

  if (excluindo) return <Esqueleto linhas={3} />;
  if (erro && !dados) {
    return <>{botaoVoltar}<Vazio titulo="Não consegui abrir a ficha" texto={erro}><button className="g-btn verde" onClick={() => void recarregar()}>Tentar de novo</button></Vazio></>;
  }
  if (carregando && !dados) return <>{botaoVoltar}<Esqueleto linhas={5} /></>;
  if (!dados?.cliente) {
    return <>{botaoVoltar}<Vazio titulo="Não achei esse cliente" texto="Pode ser que a ficha tenha sido apagada."><button className="g-btn verde" onClick={voltar}>Ver a lista</button></Vazio></>;
  }

  const { cliente, pets, entradas, devolvido, ajusteCredito } = dados;
  const zap = linkWhatsApp(cliente.telefone, `${saudacaoZap(cliente.nome, petshop.nome)} `);
  const pagas = entradas.filter((l) => l.pago);
  const total = Math.max(0, Math.round((pagas.reduce((s, l) => s + Number(l.valor), 0) - devolvido + ajusteCredito) * 100) / 100);
  const emAberto = entradas.filter((l) => !l.pago);
  const aReceber = emAberto.reduce((s, l) => s + Number(l.valor), 0);
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
              <p className="tutor"><Phone aria-hidden />{!cliente.telefone ? "Sem telefone" : telefoneValido(cliente.telefone) ? fmtTelefone(cliente.telefone) : <span className="g-vermelho-t">Telefone incompleto: {cliente.telefone}</span>}</p>
              <div className="g-cli-etqs">
                <span className="g-cli-etq pessego"><PawPrint aria-hidden />{pets.length === 1 ? "1 pet" : `${pets.length} pets`}</span>
                <span className="g-cli-etq">Cliente desde {dataCompleta(cliente.criado_em)}</span>
                {cliente.nao_quer_mensagens && <span className="g-cli-etq rosa">Não quer receber mensagens</span>}
              </div>
            </div>
          </div>
          <div className="gc-botoes">
            {zap && <a className="g-btn zap" href={zap} target="_blank" rel="noopener noreferrer"><MessageCircle />WhatsApp</a>}
            <button className="g-btn sec" onClick={() => { if (!somenteLeitura()) setEditando(true); }}><Pencil />Editar</button>
          </div>
        </section>
      </div>

      <div className={`g-cli-nums${cuidoDoFinanceiro ? "" : " dois"}`}>
        <div className="g-cli-num">
          <Tile icone={PawPrint} tom="pessego" />
          <div><span className="g-rotulo">Pets</span><b className="g-tab">{pets.length}</b><small>{ativos === pets.length ? (pets.length === 1 ? "na lista" : "todos na lista") : `${ativos} na lista, ${pets.length - ativos} ${pets.length - ativos === 1 ? "desativado" : "desativados"}`}</small></div>
        </div>
        <div className="g-cli-num">
          <Tile icone={CalendarHeart} tom="ceu" />
          <div><span className="g-rotulo">Cliente</span><b>{haQuanto(cliente.criado_em)}</b><small>desde {dataCompleta(cliente.criado_em)}</small></div>
        </div>
        {cuidoDoFinanceiro && (
          <>
            <div className="g-cli-num">
              <Tile icone={Wallet} tom="menta" />
              <div><span className="g-rotulo">Já gastou aqui</span><b className="g-tab">{brl(total)}</b><small>{!pagas.length ? "nenhuma entrada" : pagas.length === 1 ? "em 1 entrada recebida" : `em ${pagas.length} entradas recebidas`}</small></div>
            </div>
            <div className="g-cli-num">
              <Tile icone={HandCoins} tom="manteiga" />
              <div><span className="g-rotulo">Deve</span><b className="g-tab">{brl(aReceber)}</b><small>{!emAberto.length ? "nada em aberto" : emAberto.length === 1 ? "1 conta em aberto" : `${emAberto.length} contas em aberto`}</small></div>
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

          {vejoFinanceiro && <DividaDoTutor tutor={cliente} aoMudar={recarregar} />}
          {vejoFinanceiro && <CreditoDoTutor clienteId={cliente.id} nome={cliente.nome} />}
          {vejoFinanceiro && (
            <div className="g-fila" style={{ flexWrap: "wrap", gap: 8 }}>
              <button type="button" className="g-btn sec p" onClick={() => { if (!somenteLeitura()) setAnotando(true); }}><HandCoins />Anotar o que {cliente.nome.split(" ")[0]} deve</button>
              <span className="g-pp g-muted">Taxa de falta, diferença esquecida: fica na ficha e em A receber.</span>
            </div>
          )}
          {anotando && <FolhaLancamento modo="conta" tipo="entrada" tutor={{ id: cliente.id, nome: cliente.nome }} aoFechar={() => setAnotando(false)} aoSalvo={recarregar} />}

          {cuidoDoFinanceiro && (
            <section className="g-card">
              <div className="g-card-t"><h3><Tile icone={Wallet} tom="menta" tamanho="p" />Quanto já gastou aqui</h3></div>
              <p className="g-num m">{brl(total)}</p>
              <p className="g-pp g-muted" style={{ marginTop: 4 }}>
                {!pagas.length ? "Nenhuma entrada ligada a este cliente." : pagas.length === 1 ? "Em 1 entrada recebida." : `Em ${pagas.length} entradas recebidas.`}{devolvido > 0 ? ` Já sem ${brl(devolvido)} devolvidos a ${cliente.nome.split(" ")[0]}.` : ""}{ajusteCredito < 0 ? ` O que ficou de crédito para ele não conta duas vezes (${brl(-ajusteCredito)} a menos aqui; conta quando ele usa).` : ""}
              </p>
              {entradas.length > 0 && (
                <div className="g-lista" style={{ marginTop: 8 }}>
                  {entradas.slice(0, 8).map((l) => (
                    <div key={l.id} className="g-linha">
                      <Tile icone={Receipt} tom={l.pago ? "menta" : "manteiga"} tamanho="p" />
                      <span className="t">
                        <b>{descricaoAtual(l.descricao) || categoriaAtual(l.categoria, petshop)}</b>
                        <span>{dataCompleta(l.data)}{l.descricao?.trim() ? ` · ${categoriaAtual(l.categoria, petshop, l.descricao)}` : ""}</span>
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

          <CartaoFidelidade clienteId={cliente.id} nome={cliente.nome} />
          <CartaoPaginaDoTutor cliente={cliente} pets={pets} />

          {(souDono || posso("clientes")) && (
            <div className="g-pilha p">
              <div><button className="g-btn sec" onClick={() => { if (!somenteLeitura()) setJuntando(true); }}><Merge />Juntar com outro tutor</button></div>
              <p className="g-pp g-muted">A mesma pessoa foi cadastrada duas vezes? Junte as fichas: os pets e o histórico da outra vêm para esta.</p>
            </div>
          )}

          {souDono && <DadosDoTutor cliente={cliente} pets={pets} aoApagar={() => void recarregar()} />}

          {souDono ? (
            <div className="g-pilha p">
              <div><button className="g-btn perigo" onClick={() => void excluir()}>Excluir cliente de vez</button></div>
              <p className="g-pp g-muted">Apaga os pets, os horários, os pacotes e o histórico dele, e os relatórios de meses passados mudam. Se o cliente pediu para sair do cadastro, prefira Apagar dados deste tutor: os dados pessoais somem e os relatórios ficam iguais. Para só tirar da lista, desative o pet na ficha do pet.</p>
            </div>
          ) : (
            <p className="g-pp g-muted">Só o dono pode excluir de vez. Para tirar um pet da lista sem apagar o histórico, abra a ficha do pet e toque em Desativar pet.</p>
          )}
        </div>
      </div>

      {juntando && <FolhaJuntarTutor cliente={cliente} aoFechar={() => setJuntando(false)} aoJuntar={() => { setJuntando(false); void recarregar(); }} />}
      {editando && <FormTutor cliente={cliente} aoFechar={() => setEditando(false)} aoSalvar={() => { setEditando(false); avisarMudanca(); }} />}
      {petNovo && (
        <FormPet clienteFixo={{ id: cliente.id, nome: cliente.nome, telefone: cliente.telefone }} aoFechar={() => setPetNovo(false)}
          aoSalvar={() => { setPetNovo(false); avisarMudanca(); }} />
      )}
    </div>
  );
}
