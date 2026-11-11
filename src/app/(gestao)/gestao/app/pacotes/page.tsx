"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Check, Layers, Plus, RotateCcw, Sparkles, Ticket, Undo2 } from "lucide-react";
import { useGestao } from "@/components/gestao/contexto";
import FormPet from "@/components/gestao/form-pet";
import { Anel, Kpi, Tile } from "@/components/gestao/painel";
import { AvatarPet, avisarMudanca, Campo, CampoValor, EscolherPet, Esqueleto, Folha, ok, useAvisos, useDados, useSomenteLeitura, Vazio } from "@/components/gestao/ui";
import { Chips, ChipsForma, ErroTela, type Forma } from "@/components/gestao/loja/pecas";
import { lancarPago } from "@/lib/gestao/dinheiro";
import type { Cliente, Pacote, PacoteCliente, Pet } from "@/lib/gestao/tipos";
import { brl, dataCurta, deIsoDia, inicioDoDia, isoDia, somaDias } from "@/lib/gestao/util";
import "./pacotes.css";

type PetDoPacote = Pick<Pet, "id" | "nome" | "foto" | "especie"> & { clientes: Pick<Cliente, "id" | "nome" | "telefone"> | null };
type PacoteDoPet = PacoteCliente & { pets: PetDoPacote | null };

const FILTROS = [
  { id: "ativos", rotulo: "Ativos" },
  { id: "vencendo", rotulo: "Vencendo em 7 dias" },
  { id: "encerrados", rotulo: "Encerrados" },
] as const;
type Filtro = (typeof FILTROS)[number]["id"];

/** Dias até vencer (negativo = já venceu). null quando não tem validade. */
function diasParaVencer(vence: string | null) {
  if (!vence) return null;
  return Math.round((deIsoDia(vence).getTime() - inicioDoDia(new Date()).getTime()) / 864e5);
}
function etiquetaValidade(vence: string | null) {
  const d = diasParaVencer(vence);
  if (d == null) return null;
  if (d < 0) return { texto: "vencido", tom: "vermelho" };
  if (d === 0) return { texto: "vence hoje", tom: "laranja" };
  if (d === 1) return { texto: "vence amanhã", tom: "laranja" };
  if (d <= 7) return { texto: `vence em ${d} dias`, tom: "laranja" };
  return { texto: `até ${dataCurta(vence!)}`, tom: "" };
}

/** Indicador que também é botão: toca e a tela mostra aquele recorte. */
function KpiAcao({ ativo, aoTocar, children }: { ativo: boolean; aoTocar: () => void; children: React.ReactNode }) {
  return (
    <div className="g-pac-kpi-acao" role="button" tabIndex={0} aria-pressed={ativo} onClick={aoTocar}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); aoTocar(); } }}>
      {children}
    </div>
  );
}

type Venda = { pet?: PetDoPacote; base?: Pick<PacoteCliente, "pacote_id" | "nome" | "servico_id" | "total" | "preco"> & { validade: number | null } };

export default function Pacotes() {
  const { sb, petshop, vejoFinanceiro } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [aba, setAba] = useState<"clientes" | "modelos">("clientes");
  const [filtro, setFiltro] = useState<Filtro>("ativos");
  const [venda, setVenda] = useState<Venda | null>(null);
  const [modelo, setModelo] = useState<Pacote | "novo" | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const { dados, carregando, erro, recarregar } = useDados(async () => {
    const [modelos, vendidos] = await Promise.all([
      sb.from("pacotes").select("*").eq("petshop_id", petshop.id).order("ativo", { ascending: false }).order("nome"),
      sb.from("pacotes_clientes").select("*, pets(id, nome, foto, especie, clientes(id, nome, telefone))").eq("petshop_id", petshop.id)
        .order("criado_em", { ascending: false }).limit(1000),
    ]);
    return { modelos: ok(modelos) as Pacote[], vendidos: ok(vendidos) as unknown as PacoteDoPet[] };
  }, [petshop.id]);

  const modelos = useMemo(() => dados?.modelos ?? [], [dados]);
  const vendidos = useMemo(() => dados?.vendidos ?? [], [dados]);
  const ativos = vendidos.filter((p) => p.ativo);
  const vencendo = ativos.filter((p) => { const d = diasParaVencer(p.vence_em); return d != null && d >= 0 && d <= 7; });
  const lista = filtro === "ativos" ? ativos : filtro === "vencendo" ? vencendo : vendidos.filter((p) => !p.ativo).slice(0, 100);

  // números do topo: saem dos pacotes ativos que a tela já carregou
  const aUsar = ativos.reduce((t, p) => t + Math.max(0, p.total - p.usados), 0);
  const totalAtivos = ativos.reduce((t, p) => t + p.total, 0);
  const petsComPacote = new Set(ativos.map((p) => p.pet_id)).size;
  const modelosAVenda = modelos.filter((m) => m.ativo).length;
  const verClientes = (f: Filtro) => { setAba("clientes"); setFiltro(f); };

  const mudou = () => { void recarregar(); avisarMudanca(); };

  async function mudarUso(p: PacoteDoPet, passo: 1 | -1) {
    if (somenteLeitura()) return;
    const usados = p.usados + passo;
    if (usados < 0 || usados > p.total) return;
    setOcupado(p.id);
    try {
      // só grava se ninguém mexeu no meio do caminho
      const r = ok(await sb.from("pacotes_clientes").update({ usados, ativo: usados < p.total })
        .eq("id", p.id).eq("petshop_id", petshop.id).eq("usados", p.usados).select("id"));
      if (!r.length) { avisar("Esse pacote acabou de ser alterado. Atualizei a lista."); void recarregar(); return; }
      const nome = p.pets?.nome ?? "pet";
      avisar(passo < 0 ? "Uso desfeito." : usados >= p.total ? `Pacote concluído. ${nome} usou os ${p.total}.` : `Anotado: ${usados} de ${p.total} usados.`);
      mudou();
    } catch (e) { avisarErro(e); } finally { setOcupado(null); }
  }

  async function encerrar(p: PacoteDoPet) {
    if (somenteLeitura()) return;
    const resta = p.total - p.usados;
    if (!(await confirmar({ titulo: "Encerrar este pacote?", texto: `${p.pets?.nome ?? "O pet"} ainda tem ${resta} de ${p.total} para usar. O pacote vai para os encerrados.`, confirmar: "Encerrar", perigo: true }))) return;
    try {
      ok(await sb.from("pacotes_clientes").update({ ativo: false }).eq("id", p.id).eq("petshop_id", petshop.id).select("id"));
      avisar("Pacote encerrado.");
      mudou();
    } catch (e) { avisarErro(e); }
  }

  function renovar(p: PacoteDoPet) {
    if (somenteLeitura() || !p.pets) return;
    const doModelo = modelos.find((m) => m.id === p.pacote_id);
    const validade = doModelo?.validade_dias
      ?? (p.vence_em ? Math.max(1, Math.round((deIsoDia(p.vence_em).getTime() - deIsoDia(p.comprado_em).getTime()) / 864e5)) : null);
    setVenda({ pet: p.pets, base: { pacote_id: doModelo?.ativo ? doModelo.id : null, nome: p.nome, servico_id: p.servico_id, total: p.total, preco: p.preco, validade } });
  }

  async function ativarModelo(m: Pacote, ativo: boolean) {
    if (somenteLeitura()) return;
    if (!ativo && !(await confirmar({ titulo: `Desativar "${m.nome}"?`, texto: "Ele some da hora de vender. Quem já comprou continua com o pacote.", confirmar: "Desativar", perigo: true }))) return;
    try {
      ok(await sb.from("pacotes").update({ ativo }).eq("id", m.id).eq("petshop_id", petshop.id).select("id"));
      avisar(ativo ? "Modelo de volta à venda." : "Modelo desativado.");
      mudou();
    } catch (e) { avisarErro(e); }
  }

  return (
    <>
      <header className="g-topo">
        <div>
          <h1>Pacotes</h1>
          <p className="g-muted">{ativos.length ? `${ativos.length} ${ativos.length === 1 ? "pacote em uso" : "pacotes em uso"}` : "Banhos do mês e mensalistas, com a conta de quantos já foram."}</p>
        </div>
        <div className="g-acoes">
          <button className="g-btn pri" onClick={() => { if (!somenteLeitura()) setVenda({}); }}><Plus /> Vender pacote</button>
        </div>
      </header>

      <div className="g-pilha">
        {dados && (vendidos.length > 0 || modelos.length > 0) && (
          <div className="g-grade kpis">
            <KpiAcao ativo={aba === "clientes" && filtro === "ativos"} aoTocar={() => verClientes("ativos")}>
              <Kpi icone={Ticket} tom="lilas" rotulo="Pacotes ativos" valor={ativos.length}
                apoio={!ativos.length ? "nenhum em uso" : petsComPacote === 1 ? "de 1 pet" : `de ${petsComPacote} pets`} />
            </KpiAcao>
            <KpiAcao ativo={aba === "clientes" && filtro === "vencendo"} aoTocar={() => verClientes("vencendo")}>
              <Kpi icone={CalendarClock} tom="manteiga" rotulo="Vencendo em 7 dias" valor={vencendo.length} apoio={vencendo.length ? "vale avisar o tutor" : "nenhum por agora"} />
            </KpiAcao>
            <Kpi icone={Sparkles} tom="menta" rotulo="Ainda a usar" valor={aUsar}
              apoio={!totalAtivos ? "nada em aberto" : `de ${totalAtivos} nos pacotes ativos`}
              lado={totalAtivos > 0 ? <Anel parte={(totalAtivos - aUsar) / totalAtivos} tamanho={52} cor="#7c62c0">{Math.round(((totalAtivos - aUsar) / totalAtivos) * 100)}%</Anel> : undefined} />
            <KpiAcao ativo={aba === "modelos"} aoTocar={() => setAba("modelos")}>
              <Kpi icone={Layers} tom="pessego" rotulo="Modelos à venda" valor={modelosAVenda} apoio={modelos.length > modelosAVenda ? `${modelos.length - modelosAVenda} ${modelos.length - modelosAVenda === 1 ? "desativado" : "desativados"}` : "prontos para vender"} />
            </KpiAcao>
          </div>
        )}

        <div className="g-seg ge-abas" style={{ justifySelf: "start" }}>
          <button aria-pressed={aba === "clientes"} onClick={() => setAba("clientes")}>Clientes com pacote</button>
          <button aria-pressed={aba === "modelos"} onClick={() => setAba("modelos")}>Modelos de pacote</button>
        </div>

        {erro && <ErroTela erro={erro} aoTentar={() => void recarregar()} />}

        {carregando && !dados ? <Esqueleto linhas={4} /> : !dados ? null : aba === "clientes" ? (
          !vendidos.length ? (
            <Vazio titulo="Nenhum pacote vendido ainda" texto="Quando um cliente fechar um pacote de banhos, venda por aqui e vá marcando cada uso.">
              <button className="g-btn sec" onClick={() => { if (!somenteLeitura()) setVenda({}); }}>Vender o primeiro pacote</button>
            </Vazio>
          ) : (
            <>
              <div className="g-chips">
                {FILTROS.map((f) => (
                  <button key={f.id} className="g-chip" aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>
                    {f.rotulo}{f.id === "vencendo" && vencendo.length ? ` (${vencendo.length})` : ""}
                  </button>
                ))}
              </div>
              {!lista.length ? (
                <p className="g-muted g-centro" style={{ padding: "28px 8px" }}>
                  {filtro === "ativos" ? "Nenhum pacote em uso agora." : filtro === "vencendo" ? "Nenhum pacote vence nos próximos 7 dias." : "Nenhum pacote encerrado."}
                </p>
              ) : (
                <div className="g-pac-grade">
                  {lista.map((p) => {
                    const val = etiquetaValidade(p.vence_em);
                    const pet = p.pets;
                    const resta = Math.max(0, p.total - p.usados);
                    const ultimo = p.ativo && resta === 1;
                    return (
                      <div key={p.id} className={`g-pac-cartao${p.ativo ? "" : " fim"}`}>
                        <div className="g-pac-topo">
                          <AvatarPet pet={pet ?? { nome: "?" }} tamanho="g" />
                          <div className="t">
                            <b>{pet?.nome ?? "Pet removido"}</b>
                            <span>{pet?.clientes?.nome ?? (pet ? "Sem tutor" : " ")}</span>
                          </div>
                          <Anel parte={p.total ? p.usados / p.total : 0} tamanho={60} cor={!p.ativo ? "#a89cc4" : ultimo ? "var(--g-laranja)" : "#7c62c0"}>{p.usados}/{p.total}</Anel>
                        </div>
                        <div className="g-pac-nome">
                          <span className="n"><Ticket aria-hidden />{p.nome}</span>
                          {!p.ativo ? <span className="g-tag">{p.usados >= p.total ? "concluído" : "encerrado"}</span>
                            : val && <span className={`g-tag ${val.tom}`}>{val.texto}</span>}
                        </div>
                        <div className="g-pac-uso">
                          {p.total <= 12 ? (
                            <div className={`g-pac-pips${ultimo ? " ultimo" : ""}`} role="img" aria-label={`${p.usados} de ${p.total} usados`}>
                              {Array.from({ length: p.total }, (_, i) => <i key={i} className={i < p.usados ? "usado" : undefined}>{i < p.usados && <Check />}</i>)}
                            </div>
                          ) : (
                            <div className={`g-prog g-pac-barra${ultimo ? " laranja" : ""}`}><i style={{ width: `${Math.min(100, (p.usados / p.total) * 100)}%` }} /></div>
                          )}
                          <div className="g-fila entre g-p">
                            <span><b>{p.usados} de {p.total}</b> usados{p.ativo && resta > 0 ? <span className={ultimo ? "g-pac-falta" : "g-muted"}> · {resta === 1 ? "falta 1" : `faltam ${resta}`}</span> : null}</span>
                            {vejoFinanceiro && Number(p.preco) > 0 && <span className="g-muted g-tab">{brl(p.preco)}</span>}
                          </div>
                        </div>
                        <div className="g-fila g-pac-acoes">
                          {p.ativo && <button className="g-btn verde p" disabled={ocupado === p.id} onClick={() => mudarUso(p, 1)}><Check /> Usar 1</button>}
                          {p.usados > 0 && <button className="g-btn fantasma p" disabled={ocupado === p.id} onClick={() => mudarUso(p, -1)}><Undo2 /> Desfazer uso</button>}
                          {pet && <button className="g-btn sec p" style={{ marginLeft: "auto" }} onClick={() => renovar(p)}><RotateCcw /> Renovar</button>}
                          {p.ativo && val?.tom === "vermelho" && <button className="g-btn fantasma p" onClick={() => encerrar(p)}>Encerrar</button>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )
        ) : !modelos.length ? (
          <Vazio titulo="Nenhum modelo de pacote" texto="Monte os pacotes que você costuma vender, como 4 banhos no mês. Na hora da venda é só escolher.">
            <button className="g-btn sec" onClick={() => { if (!somenteLeitura()) setModelo("novo"); }}>Criar um modelo</button>
          </Vazio>
        ) : (
          <>
            <div className="g-pac-grade">
              {modelos.map((m) => (
                <div key={m.id} className={`g-pac-modelo${m.ativo ? "" : " fim"}`}>
                  <button type="button" className="corpo" onClick={() => { if (!somenteLeitura()) setModelo(m); }}>
                    <Tile icone={Ticket} tom="lilas" tamanho="g" />
                    <span className="t">
                      <b>{m.nome}</b>
                      <span className="g-pac-etqs">
                        <span className="g-pac-etq">{m.quantidade}x</span>
                        <span className="g-pac-etq">vale {m.validade_dias} dias</span>
                        {!m.ativo && <span className="g-tag">desativado</span>}
                      </span>
                    </span>
                    <b className="preco g-tab">{brl(m.preco)}</b>
                  </button>
                  <div className="pe">
                    {m.ativo
                      ? <button className="g-btn fantasma p" onClick={() => ativarModelo(m, false)}>Desativar</button>
                      : <button className="g-btn sec p" onClick={() => ativarModelo(m, true)}>Reativar</button>}
                  </div>
                </div>
              ))}
            </div>
            <button className="g-btn sec" style={{ justifySelf: "start" }} onClick={() => { if (!somenteLeitura()) setModelo("novo"); }}><Plus /> Modelo novo</button>
          </>
        )}
      </div>

      {venda && <VenderPacote inicio={venda} modelos={modelos.filter((m) => m.ativo)} aoFechar={() => setVenda(null)}
        aoGravar={() => { setVenda(null); setAba("clientes"); setFiltro("ativos"); mudou(); }} />}
      {modelo && <FormModelo modelo={modelo === "novo" ? null : modelo} aoFechar={() => setModelo(null)} aoGravar={() => { setModelo(null); mudou(); }} />}
    </>
  );
}

/* ---------- modelo de pacote ---------- */

function FormModelo({ modelo, aoFechar, aoGravar }: { modelo: Pacote | null; aoFechar: () => void; aoGravar: () => void }) {
  const { sb, petshop, servicos } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const [nome, setNome] = useState(modelo?.nome ?? "");
  const [servico, setServico] = useState(modelo?.servico_id ?? "");
  const [quantidade, setQuantidade] = useState(String(modelo?.quantidade ?? 4));
  const [validade, setValidade] = useState(String(modelo?.validade_dias ?? 30));
  const [preco, setPreco] = useState<number | null>(modelo ? Number(modelo.preco) : null);
  const [salvando, setSalvando] = useState(false);
  const opcoes = servicos.filter((s) => s.ativo || s.id === modelo?.servico_id);

  async function salvar() {
    const q = Number(quantidade), v = Number(validade);
    if (!nome.trim()) { avisarErro("Dê um nome ao pacote."); return; }
    if (!Number.isInteger(q) || q < 1) { avisarErro("A quantidade precisa ser 1 ou mais."); return; }
    if (!Number.isInteger(v) || v < 1) { avisarErro("A validade precisa ser de 1 dia ou mais."); return; }
    setSalvando(true);
    try {
      const campos = { nome: nome.trim(), servico_id: servico || null, quantidade: q, validade_dias: v, preco: preco ?? 0 };
      if (modelo) ok(await sb.from("pacotes").update(campos).eq("id", modelo.id).eq("petshop_id", petshop.id).select("id").single());
      else ok(await sb.from("pacotes").insert({ ...campos, petshop_id: petshop.id }).select("id").single());
      avisar(modelo ? "Modelo atualizado." : "Modelo criado.");
      aoGravar();
    } catch (e) { avisarErro(e); } finally { setSalvando(false); }
  }

  return (
    <Folha titulo={modelo ? "Modelo de pacote" : "Modelo novo"} aoFechar={aoFechar}
      rodape={<>
        <button className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button className="g-btn pri" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
      </>}>
      <div className="g-form">
        <Campo rotulo="Nome"><input className="g-input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: 4 banhos no mês" autoFocus={!modelo} /></Campo>
        <Campo rotulo="Serviço">
          <select className="g-select" value={servico} onChange={(e) => setServico(e.target.value)}>
            <option value="">Qualquer serviço</option>
            {opcoes.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </Campo>
        <div className="dupla">
          <Campo rotulo="Quantidade"><input className="g-input g-tab" inputMode="numeric" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} /></Campo>
          <Campo rotulo="Validade (dias)"><input className="g-input g-tab" inputMode="numeric" value={validade} onChange={(e) => setValidade(e.target.value)} /></Campo>
        </div>
        <Campo rotulo="Preço"><CampoValor valor={preco} aoMudar={setPreco} /></Campo>
      </div>
    </Folha>
  );
}

/* ---------- vender pacote ---------- */

function VenderPacote({ inicio, modelos, aoFechar, aoGravar }: { inicio: Venda; modelos: Pacote[]; aoFechar: () => void; aoGravar: () => void }) {
  const { sb, petshop, servicos, vejoFinanceiro } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const [pet, setPet] = useState<PetDoPacote | null>(inicio.pet ?? null);
  const [criando, setCriando] = useState<string | null>(null);
  const [escolhido, setEscolhido] = useState(Boolean(inicio.base));
  const [pacoteId, setPacoteId] = useState<string | null>(inicio.base?.pacote_id ?? null);
  const [nome, setNome] = useState(inicio.base?.nome ?? "");
  const [servico, setServico] = useState(inicio.base?.servico_id ?? "");
  const [total, setTotal] = useState(String(inicio.base?.total ?? 4));
  const [validade, setValidade] = useState(inicio.base ? (inicio.base.validade ? String(inicio.base.validade) : "") : "30");
  const [preco, setPreco] = useState<number | null>(inicio.base ? Number(inicio.base.preco) : null);
  const [compra, setCompra] = useState(isoDia(new Date()));
  const [recebido, setRecebido] = useState<"sim" | "nao">("sim");
  const [forma, setForma] = useState<Forma>("pix");
  const [salvando, setSalvando] = useState(false);

  function escolherModelo(m: Pacote | null) {
    setPacoteId(m?.id ?? null);
    setNome(m?.nome ?? "");
    setServico(m?.servico_id ?? "");
    setTotal(String(m?.quantidade ?? 4));
    setValidade(String(m?.validade_dias ?? 30));
    setPreco(m ? Number(m.preco) : null);
    setEscolhido(true);
  }

  const dias = validade.trim() ? Number(validade) : null;
  const venceEm = dias && Number.isInteger(dias) && dias > 0 && compra ? isoDia(somaDias(deIsoDia(compra), dias)) : null;
  const lanca = vejoFinanceiro && recebido === "sim" && Boolean(preco);

  async function salvar() {
    if (!pet) return;
    const t = Number(total);
    if (!nome.trim()) { avisarErro("Dê um nome ao pacote."); return; }
    if (!Number.isInteger(t) || t < 1) { avisarErro("A quantidade precisa ser 1 ou mais."); return; }
    if (dias != null && (!Number.isInteger(dias) || dias < 1)) { avisarErro("A validade precisa ser de 1 dia ou mais, ou fique em branco."); return; }
    if (!compra) { avisarErro("Escolha a data da compra."); return; }
    setSalvando(true);
    try {
      ok(await sb.from("pacotes_clientes").insert({
        petshop_id: petshop.id, pet_id: pet.id, pacote_id: pacoteId, nome: nome.trim(), servico_id: servico || null,
        total: t, comprado_em: compra, vence_em: venceEm, preco: preco ?? 0,
      }).select("id").single());
      if (lanca && preco) {
        try {
          await lancarPago(sb, petshop.id, {
            tipo: "entrada", valor: preco, forma, categoria: "Pacotes", descricao: `Pacote ${nome.trim()} · ${pet.nome}`,
            clienteId: pet.clientes?.id ?? null, data: compra,
          });
          avisar(`Pacote vendido para ${pet.nome}. ${brl(preco)} no financeiro.`);
        } catch (e) {
          avisarErro(`O pacote foi criado, mas o pagamento não foi lançado. Lance pelo Financeiro. (${e instanceof Error ? e.message : "erro"})`);
        }
      } else avisar(`Pacote vendido para ${pet.nome}.`);
      aoGravar();
    } catch (e) { avisarErro(e); } finally { setSalvando(false); }
  }

  if (criando !== null) {
    return <FormPet nomeInicial={criando} aoFechar={() => setCriando(null)} aoSalvar={(p) => { setPet(p); setCriando(null); avisarMudanca(); }} />;
  }

  if (!pet) {
    return (
      <Folha titulo="Vender pacote: para qual pet?" aoFechar={aoFechar}>
        <EscolherPet aoEscolher={setPet} aoCriar={setCriando} autoFocus />
      </Folha>
    );
  }

  const cabecalho = (
    <div className="g-fila" style={{ flexWrap: "nowrap" }}>
      <AvatarPet pet={pet} />
      <div className="g-cresce"><b style={{ display: "block" }}>{pet.nome}</b><span className="g-muted g-p">{pet.clientes?.nome ?? "Sem tutor"}</span></div>
      {!inicio.pet && <button type="button" className="g-btn fantasma p" onClick={() => setPet(null)}>Trocar</button>}
    </div>
  );

  if (!escolhido) {
    return (
      <Folha titulo="Qual pacote?" aoFechar={aoFechar}>
        <div className="g-pilha">
          {cabecalho}
          <div className="g-lista">
            {modelos.map((m) => (
              <button key={m.id} type="button" className="g-linha" onClick={() => escolherModelo(m)}>
                <span className="t"><b>{m.nome}</b><span>{m.quantidade}x · vale {m.validade_dias} dias</span></span>
                <span className="d"><b>{brl(m.preco)}</b></span>
              </button>
            ))}
          </div>
          {!modelos.length && <p className="g-muted g-p">Você ainda não tem modelos de pacote. Monte um só para este cliente.</p>}
          <button type="button" className="g-btn sec" onClick={() => escolherModelo(null)}>Montar um avulso</button>
        </div>
      </Folha>
    );
  }

  return (
    <Folha titulo={inicio.base ? "Renovar pacote" : "Confirmar a venda"} aoFechar={aoFechar}
      rodape={<>
        <button className="g-btn sec" onClick={inicio.base ? aoFechar : () => setEscolhido(false)}>Voltar</button>
        <button className="g-btn pri" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : inicio.base ? "Renovar" : "Vender pacote"}</button>
      </>}>
      <div className="g-form">
        {cabecalho}
        <Campo rotulo="Pacote"><input className="g-input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: 4 banhos no mês" /></Campo>
        <Campo rotulo="Serviço">
          <select className="g-select" value={servico} onChange={(e) => setServico(e.target.value)}>
            <option value="">Qualquer serviço</option>
            {servicos.filter((s) => s.ativo || s.id === servico).map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </Campo>
        <div className="dupla">
          <Campo rotulo="Quantidade"><input className="g-input g-tab" inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} /></Campo>
          <Campo rotulo="Validade (dias)" dica={venceEm ? `Vence em ${dataCurta(venceEm)}` : "Sem data para vencer"}>
            <input className="g-input g-tab" inputMode="numeric" value={validade} onChange={(e) => setValidade(e.target.value)} />
          </Campo>
        </div>
        <div className="dupla">
          <Campo rotulo="Preço"><CampoValor valor={preco} aoMudar={setPreco} /></Campo>
          <Campo rotulo="Data da compra"><input type="date" className="g-input" value={compra} max={isoDia(new Date())} onChange={(e) => setCompra(e.target.value)} /></Campo>
        </div>
        {vejoFinanceiro && Boolean(preco) && (
          <>
            <div className="g-campo">
              <span>O cliente já pagou?</span>
              <Chips opcoes={[{ id: "sim", rotulo: "Já pagou" }, { id: "nao", rotulo: "Ainda não" }] as const} valor={recebido} aoMudar={setRecebido} />
            </div>
            {lanca ? <ChipsForma valor={forma} aoMudar={setForma} /> : <p className="g-muted g-p">Nada entra no financeiro agora. Quando receber, lance pelo Financeiro.</p>}
          </>
        )}
      </div>
    </Folha>
  );
}
