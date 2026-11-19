"use client";

import AlbumDoPet from "../boletim/album";
import CartaoPaginaDoTutor from "../casa/pagina-do-tutor";
import { saudacaoZap } from "@/lib/gestao/agenda";
import { COLS_ESTADIA, COLS_PACOTE_CLIENTE, comPrecosDeAgendamento } from "@/lib/gestao/reservado";
import { Fragment, useEffect, useState } from "react";
import Link from "@/components/gestao/link-depois";
import { AlertTriangle, ArrowLeft, ArrowLeftRight, BedDouble, CalendarClock, CalendarPlus, History, MessageCircle, NotebookPen, PawPrint, Pencil, Scissors, Ticket, UserPen, UserRound, Wallet } from "lucide-react";
import type { Agendamento, Cliente, Estadia, PacoteCliente, Pet } from "@/lib/gestao/tipos";
import { STATUS_AGENDAMENTO } from "@/lib/gestao/tipos";
import { colsDoTutor, tutorLido } from "@/lib/gestao/reservado";
type PetComTutorInteiro = Pet & { clientes: Cliente | null };
import { brl, dataAmigavel, dataCompleta, dataCurta, deIsoDia, fmtTelefone, haQuanto, hora, idade, inicioDoDia, linkWhatsApp, nomeDiaCurto, telefoneValido, centavos } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import FormPet from "../form-pet";
import { Anel, Tile, type Tom } from "../painel";
import { FotosNasRedes } from "../boletim/autorizacao";
import { AvatarPet, avisarMudanca, Esqueleto, ok, useAvisos, useDados, useSomenteLeitura, Vazio } from "../ui";
import { linkTutor, nomePorte } from "./comum";
import FormTutor from "./form-tutor";
import { FolhaTrocarTutor } from "./juntar";
import { EtiquetaEspecie, tomDaVisita } from "./lista";
import { CartaoSaude, EtiquetaSaude, resumoSaude, type CuidadoSaude } from "./saude";
import { CartaoMensalista } from "../creche/resumo-mes";
import { OcorrenciasDoPet } from "../casa/ocorrencias";
import { QuemPodeBuscar } from "../casa/portaria";
import { portariaLigada } from "@/lib/gestao/casa-opcoes";
import { nomeDaCasa, usaCasa, usaModulo } from "@/lib/gestao/modulos";
import { CATEGORIAS_DEVOLUCAO, lancamentoDoPet } from "@/lib/gestao/faturamento";

type PetDaFicha = Pet & { clientes: Cliente | null };
type Atendimento = Pick<Agendamento, "id" | "inicio" | "status" | "preco" | "servico_id"> & { obs?: string | null } & { agendamento_servicos?: { id: string; servico_id: string; preco: number | null; ordem: number }[] | null };

const mesDoAno = (d: string) => new Date(d).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
const TOM_VISITA: Record<string, Tom> = { verde: "menta", amarelo: "manteiga", vermelho: "rosa" };

const STATUS_ESTADIA: Record<string, { rotulo: string; tom: string }> = {
  reservada: { rotulo: "Reservada", tom: "azul" },
  em_casa: { rotulo: "Está aqui", tom: "laranja" },
  encerrada: { rotulo: "Encerrada", tom: "verde" },
  cancelada: { rotulo: "Cancelada", tom: "vermelho" },
};

export default function FichaPet({ id, voltar, aoAbrir }: { id: string; voltar: () => void; /** a ficha terminou de carregar */ aoAbrir?: () => void }) {
  // o gasto do pet é histórico de dinheiro: só para o dono e quem cuida do financeiro (quem só opera o caixa não lê esse histórico)
  const { sb, petshop, servicos, cuidoDoFinanceiro: vejoFinanceiro, posso } = useGestao();
  // a ficha fala do que o negócio faz: sem banho e tosa (ou sem a agenda liberada), nada de "Agendar" nem de "atendimentos"
  const comBanho = usaModulo(petshop, "banho_tosa");
  const comAgenda = comBanho && posso("agenda");
  const casa = usaCasa(petshop);
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [editando, setEditando] = useState(false);
  const [editandoTutor, setEditandoTutor] = useState(false);
  const [trocandoTutor, setTrocandoTutor] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const { dados, carregando, erro, recarregar } = useDados(async () => {
    const [pet, atendimentos, pacotes, estadias, concluidos, saude, hospedagens] = await Promise.all([
      // do tutor, e-mail e endereço só para quem tem a área Clientes
      sb.from("pets").select(`*, clientes(${colsDoTutor(posso("clientes"))})`).eq("petshop_id", petshop.id).eq("id", id).maybeSingle()
        .then((r) => ({ ...r, data: r.data ? { ...(r.data as unknown as PetComTutorInteiro), clientes: (r.data as unknown as PetComTutorInteiro).clientes ? tutorLido((r.data as unknown as PetComTutorInteiro).clientes!) : null } : null })),
      sb.from("agendamentos").select("id, inicio, status, servico_id, obs, agendamento_servicos(id, servico_id, ordem)").eq("petshop_id", petshop.id).eq("pet_id", id).order("inicio", { ascending: false }).limit(60),
      sb.from("pacotes_clientes").select(COLS_PACOTE_CLIENTE).eq("petshop_id", petshop.id).eq("pet_id", id).eq("ativo", true).order("comprado_em", { ascending: false }),
      sb.from("estadias").select(COLS_ESTADIA).eq("petshop_id", petshop.id).eq("pet_id", id).order("entrada", { ascending: false }).limit(8),
      // visitas concluídas: a conta exata, a mais recente e os valores para somar
      sb.from("agendamentos").select("id, inicio, agendamento_servicos(id)", { count: "exact" }).eq("petshop_id", petshop.id).eq("pet_id", id).eq("status", "concluido").order("inicio", { ascending: false }).limit(1000),
      sb.from("pets_saude").select("*").eq("petshop_id", petshop.id).eq("pet_id", id).order("vence_em").order("criado_em").limit(500),
      // creche e hotel também é visita: estadias encerradas e a que está acontecendo agora
      sb.from("estadias").select("entrada, saida, status", { count: "exact" }).eq("petshop_id", petshop.id).eq("pet_id", id).in("status", ["encerrada", "em_casa"]).order("entrada", { ascending: false }).limit(1000),
    ]);
    for (const r of [pet, atendimentos, pacotes, estadias, concluidos, hospedagens]) if (r.error) throw new Error(r.error.message);
    // os valores vêm à parte, só para quem cuida do financeiro
    type Feito = { inicio: string; preco: number | null; agendamento_servicos?: { preco: number | null }[] | null };
    const ficou = (hospedagens.data ?? []) as { entrada: string; saida: string | null; status: string }[];
    const nEstadias = hospedagens.count ?? ficou.length;
    // o check-out lança a estadia no financeiro ligada ao tutor, com o nome do pet na descrição
    const petLido = pet.data as unknown as PetDaFicha | null;
    // os preços dos atendimentos e o que o tutor pagou de estadias: ao mesmo tempo (no celular, cada espera soma)
    const [feitos, historico, gastoEstadias] = await Promise.all([
      comPrecosDeAgendamento(sb, petshop.id, (concluidos.data ?? []) as { id: string; inicio: string; agendamento_servicos?: { id: string }[] | null }[], vejoFinanceiro) as Promise<Feito[]>,
      comPrecosDeAgendamento(sb, petshop.id, (atendimentos.data ?? []) as unknown as Atendimento[], vejoFinanceiro),
      (async () => {
        // num pet shop com creche ou hotel, sempre: o sinal pago entra antes da primeira estadia (e a reserva pode ter sido apagada)
        if (!(vejoFinanceiro && petLido?.cliente_id && (nEstadias > 0 || (estadias.data ?? []).length > 0 || usaCasa(petshop)))) return 0;
        // a mesma conta da ficha do tutor, só com o que é deste pet: o que entrou (diárias, mensalidades e o sinal da reserva),
        // menos o que foi devolvido e o que ficou de crédito; o crédito usado num check-out deste pet (fora de uma entrada) conta
        const [entradas, devolucoes, creditos] = await Promise.all([
          sb.from("lancamentos").select("valor, descricao").eq("petshop_id", petshop.id).eq("cliente_id", petLido.cliente_id)
            .eq("tipo", "entrada").eq("pago", true).in("categoria", ["Creche e hotel", "Creche: mensalidade"]).limit(1000),
          sb.from("lancamentos").select("valor, descricao").eq("petshop_id", petshop.id).eq("cliente_id", petLido.cliente_id)
            .eq("tipo", "saida").eq("pago", true).in("categoria", CATEGORIAS_DEVOLUCAO).limit(1000),
          sb.from("clientes_creditos").select("valor, lancamento_id, estadias!inner(pet_id)").eq("petshop_id", petshop.id).eq("cliente_id", petLido.cliente_id)
            .eq("estadias.pet_id", id).limit(1000),
        ]);
        const doPet = (d: string | null) => lancamentoDoPet(d, petLido.nome);
        const entrou = (entradas.data ?? []).filter((x) => doPet(x.descricao)).reduce((t, x) => t + Number(x.valor), 0);
        const devolvido = (devolucoes.data ?? []).filter((x) => doPet(x.descricao)).reduce((t, x) => t + Number(x.valor), 0);
        const credito = ((creditos.data ?? []) as { valor: number; lancamento_id: string | null }[])
          .reduce((t, c) => t + (Number(c.valor) > 0 ? -Number(c.valor) : c.lancamento_id ? 0 : -Number(c.valor)), 0);
        return Math.max(0, centavos((entrou - devolvido + credito)));
      })(),
    ]);
    // quem está na casa agora veio hoje; estadia encerrada conta pelo dia em que saiu
    const ultimaEstadia = ficou.map((e) => (e.status === "em_casa" ? new Date().toISOString() : e.saida ?? e.entrada)).sort().pop() ?? null;
    const ultimoAtendimento = feitos[0]?.inicio ?? null;
    return {
      pet: pet.data as unknown as PetDaFicha | null,
      atendimentos: historico as unknown as Atendimento[],
      pacotes: (pacotes.data ?? []) as PacoteCliente[],
      estadias: (estadias.data ?? []) as unknown as Estadia[],
      visitas: (concluidos.count ?? feitos.length) + nEstadias,
      nEstadias,
      ultimaVisita: ultimaEstadia && (!ultimoAtendimento || new Date(ultimaEstadia) > new Date(ultimoAtendimento)) ? ultimaEstadia : ultimoAtendimento,
      gasto: feitos.reduce((t, a) => t + Number(a.preco ?? 0) + (a.agendamento_servicos ?? []).reduce((x, o) => x + Number(o.preco ?? 0), 0), 0) + gastoEstadias,
      gastoEstadias,
      gastoParcial: (concluidos.count ?? 0) > feitos.length,
      // se a saúde falhar, o resto da ficha abre do mesmo jeito
      saude: saude.error ? null : (saude.data ?? []) as CuidadoSaude[],
      erroSaude: saude.error?.message ?? null,
    };
  }, [petshop.id, id, vejoFinanceiro]);
  useEffect(() => { if (!carregando) aoAbrir?.(); }, [carregando]); // eslint-disable-line react-hooks/exhaustive-deps

  const botaoVoltar = <button className="g-voltar" onClick={voltar}><ArrowLeft />Voltar</button>;

  if (erro && !dados) {
    return <>{botaoVoltar}<Vazio titulo="Não consegui abrir a ficha" texto={erro}><button className="g-btn verde" onClick={() => void recarregar()}>Tentar de novo</button></Vazio></>;
  }
  if (carregando && !dados) return <>{botaoVoltar}<Esqueleto linhas={5} /></>;
  if (!dados?.pet) {
    return <>{botaoVoltar}<Vazio titulo="Não achei esse pet" texto="Pode ser que a ficha tenha sido apagada."><button className="g-btn verde" onClick={voltar}>Ver a lista</button></Vazio></>;
  }

  const { pet, atendimentos, pacotes, estadias, visitas, nEstadias, ultimaVisita, gasto, gastoEstadias, gastoParcial, saude, erroSaude } = dados;
  const tutor = pet.clientes;
  const zap = tutor ? linkWhatsApp(tutor.telefone, `${saudacaoZap(tutor.nome, petshop.nome)} `) : null;
  const etiquetas = [pet.raca, pet.porte ? `Porte ${nomePorte(pet.porte).toLowerCase()}` : null, pet.sexo === "M" ? "Macho" : pet.sexo === "F" ? "Fêmea" : null, idade(pet.nascimento),
    // aniversário sem o ano: só o dia ("Aniversário 20/11")
    pet.nascimento?.startsWith("1904-") ? `Aniversário ${pet.nascimento.slice(8, 10)}/${pet.nascimento.slice(5, 7)}` : null]
    .filter((x): x is string => !!x);
  const agora = new Date();
  const hoje = inicioDoDia(agora);
  const servicoDe = (sid: string | null) => servicos.find((s) => s.id === sid);
  // horário com mais de um serviço: os nomes juntos e o valor somado
  const outrosDe = (a: Atendimento) => [...(a.agendamento_servicos ?? [])].sort((x, y) => x.ordem - y.ordem);
  const nomesDe = (a: Atendimento) => [servicoDe(a.servico_id)?.nome, ...outrosDe(a).map((o) => servicoDe(o.servico_id)?.nome)].filter(Boolean).join(" + ") || "Atendimento";
  const valorDe = (a: Atendimento) => (a.preco == null && !outrosDe(a).some((o) => o.preco != null) ? null : Number(a.preco ?? 0) + outrosDe(a).reduce((t, o) => t + Number(o.preco ?? 0), 0));
  // o histórico vem do mais novo para o mais antigo: o próximo horário é o último que ainda está por vir
  const porVir = atendimentos.filter((a) => new Date(a.inicio) > agora && !["cancelado", "faltou", "concluido"].includes(a.status));
  const proximo = porVir[porVir.length - 1] ?? null;
  const proximaReserva = estadias.filter((e) => e.status === "reservada" && new Date(e.saida_prevista ?? e.entrada) >= agora).sort((a, b) => a.entrada.localeCompare(b.entrada))[0] ?? null;
  const tomHeroi = pet.especie === "gato" ? "lilas" : pet.especie === "cao" ? "pessego" : "menta";
  const tomVisita = TOM_VISITA[tomDaVisita(ultimaVisita, agora.getTime())] ?? "ceu";

  async function mudarAtivo(ativo: boolean) {
    if (somenteLeitura() || ocupado) return;
    if (!ativo && !(await confirmar({
      titulo: `Desativar ${pet.nome}?`,
      texto: "Ele sai da lista e da busca da agenda. O histórico fica guardado e dá para reativar quando quiser.",
      confirmar: "Desativar", perigo: true,
    }))) return;
    setOcupado(true);
    try {
      ok(await sb.from("pets").update({ ativo }).eq("id", pet.id).eq("petshop_id", petshop.id).select("id").single());
      avisar(ativo ? `${pet.nome} voltou para a lista.` : `${pet.nome} foi desativado.`);
      avisarMudanca(); // recarrega esta ficha e a lista
    } catch (e) { avisarErro(e); }
    setOcupado(false);
  }

  return (
    <div className="gc-ficha">
      <div>
        {botaoVoltar}
        <section className={`g-cli-heroi ${tomHeroi}`}>
          <PawPrint className="fundo" aria-hidden />
          <div className="quem">
            <AvatarPet pet={pet} tamanho="gg" />
            <div>
              <h1>{pet.nome}</h1>
              {tutor && <p className="tutor"><UserRound aria-hidden />Tutor: <Link className="g-link" href={linkTutor(tutor.id)} scroll={false}>{tutor.nome}</Link></p>}
              {tutor && (
                <p className="tutor gc-fone">
                  {tutor.telefone ? (telefoneValido(tutor.telefone) ? fmtTelefone(tutor.telefone) : <span className="g-vermelho-t">Telefone incompleto: {tutor.telefone}. Toque em Editar tutor para corrigir.</span>) : <span>Sem telefone</span>}
                </p>
              )}
              <div className="g-cli-etqs">
                <EtiquetaEspecie especie={pet.especie} />
                {etiquetas.map((e) => <span key={e} className="g-cli-etq">{e}</span>)}
                <EtiquetaSaude resumo={saude ? resumoSaude(saude) : null} />
                {!pet.ativo && <span className="g-cli-etq rosa">Desativado</span>}
              </div>
            </div>
          </div>
          <div className="gc-botoes">
            {pet.ativo && comAgenda && <Link className="g-btn pri" href={`/gestao/app/agenda?novo=1&pet=${pet.id}`}><CalendarPlus />Agendar</Link>}
            {zap && <a className="g-btn zap" href={zap} target="_blank" rel="noopener noreferrer"><MessageCircle />WhatsApp</a>}
            <button className="g-btn sec" onClick={() => { if (!somenteLeitura()) setEditando(true); }}><Pencil />Editar pet</button>
            {tutor && <button className="g-btn sec" onClick={() => { if (!somenteLeitura()) setEditandoTutor(true); }}><UserPen />Editar tutor</button>}
            <button className="g-btn sec" onClick={() => { if (!somenteLeitura()) setTrocandoTutor(true); }}><ArrowLeftRight />Trocar tutor</button>
          </div>
        </section>
      </div>

      {!pet.ativo && (
        <div className="g-aviso">
          <span className="g-cresce">Este pet está desativado. Ele não aparece na lista nem na agenda.</span>
          <button className="g-btn sec p" onClick={() => void mudarAtivo(true)} disabled={ocupado}>Reativar</button>
        </div>
      )}
      {pet.alertas?.trim() && (
        <div className="g-cli-alerta" role="note">
          <Tile icone={AlertTriangle} tom="rosa" />
          <div className="g-cresce">
            <b>Cuidados e alertas</b>
            <p className="gc-texto">{pet.alertas}</p>
          </div>
        </div>
      )}

      <FotosNasRedes petId={pet.id} />

      <div className="g-cli-nums">
        <div className="g-cli-num">
          <Tile icone={comBanho ? Scissors : PawPrint} tom="pessego" />
          <div><span className="g-rotulo">Visitas</span><b className="g-tab">{visitas}</b><small>{nEstadias > 0 ? (comBanho ? `${visitas - nEstadias} na agenda + ${nEstadias} ${usaModulo(petshop, "hotel") && !usaModulo(petshop, "creche") ? "no hotel" : usaModulo(petshop, "creche") && !usaModulo(petshop, "hotel") ? "na creche" : "na creche ou hotel"}` : `${nEstadias === 1 ? "1 dia ou estadia" : `${nEstadias} dias e estadias`}`) : !comBanho ? "ainda não veio" : visitas === 1 ? "atendimento concluído" : "atendimentos concluídos"}</small></div>
        </div>
        <div className="g-cli-num">
          <Tile icone={History} tom={tomVisita} />
          <div><span className="g-rotulo">Última visita</span><b>{ultimaVisita ? haQuanto(ultimaVisita) : "ainda não veio"}</b>{ultimaVisita && <small>{dataCompleta(ultimaVisita)}</small>}</div>
        </div>
        <div className="g-cli-num">
          <Tile icone={CalendarClock} tom="ceu" />
          {comBanho || !casa
            ? <div><span className="g-rotulo">Próximo horário</span><b>{proximo ? dataAmigavel(proximo.inicio) : "nada marcado"}</b>{proximo && <small>às {hora(proximo.inicio)} · {nomesDe(proximo)}</small>}</div>
            : <div><span className="g-rotulo">Próxima reserva</span><b>{proximaReserva ? dataAmigavel(proximaReserva.entrada) : "nada marcado"}</b>{proximaReserva && <small>{proximaReserva.tipo === "hotel" ? "hotel" : "creche"}</small>}</div>}
        </div>
        {vejoFinanceiro ? (
          <div className="g-cli-num">
            <Tile icone={Wallet} tom="menta" />
            <div><span className="g-rotulo">{gastoEstadias > 0 || !comBanho ? "Gasto aqui" : "Gasto em atendimentos"}</span><b className="g-tab">{brl(gasto)}</b><small>{gastoParcial ? "nos 1.000 mais recentes" : gastoEstadias > 0 ? (comBanho ? `${brl(gastoEstadias)} de ${nomeDaCasa(petshop).toLowerCase()}` : usaModulo(petshop, "creche") ? "diárias, sinais e mensalidades" : "diárias e sinais pagos") : comBanho ? "soma dos concluídos" : "nada pago ainda"}</small></div>
          </div>
        ) : !usaModulo(petshop, "pacotes") && casa ? (
          <div className="g-cli-num">
            <Tile icone={BedDouble} tom="ceu" />
            <div><span className="g-rotulo">{nomeDaCasa(petshop)}</span><b className="g-tab">{nEstadias}</b><small>{nEstadias === 1 ? "dia ou estadia" : "dias e estadias"}</small></div>
          </div>
        ) : (
          <div className="g-cli-num">
            <Tile icone={Ticket} tom="lilas" />
            <div><span className="g-rotulo">Pacotes ativos</span><b className="g-tab">{pacotes.length}</b><small>{pacotes.length === 1 ? "em uso" : "em uso agora"}</small></div>
          </div>
        )}
      </div>

      <div className="gc-colunas">
        <div>
          <CartaoSaude pet={pet} tutor={tutor} itens={saude} erro={erroSaude} aoMudar={() => void recarregar()} />
          <CartaoMensalista pet={pet} />
          <AlbumDoPet pet={{ id: pet.id, nome: pet.nome, sexo: pet.sexo }} tutor={tutor ? { nome: tutor.nome, telefone: tutor.telefone } : null} />

          {(comBanho || atendimentos.length > 0) && <section className="g-card">
            <div className="g-card-t"><h3><Tile icone={History} tom="pessego" tamanho="p" />Histórico de atendimentos</h3>{atendimentos.length > 0 && <span className="g-muted g-pp" style={{ whiteSpace: "nowrap" }}>{atendimentos.length === 60 ? "60 mais recentes" : atendimentos.length === 1 ? "1 horário" : `${atendimentos.length} horários`}</span>}</div>
            {!atendimentos.length ? <p className="g-muted g-p">{pet.nome} ainda não tem atendimento marcado.</p> : (
              <ol className="g-cli-tempo">
                {atendimentos.map((a, i) => {
                  const st = STATUS_AGENDAMENTO[a.status];
                  const mes = mesDoAno(a.inicio);
                  const fora = ["cancelado", "faltou"].includes(a.status);
                  const futuro = !fora && a.status !== "concluido" && new Date(a.inicio) > agora;
                  return (
                    <Fragment key={a.id}>
                      {(i === 0 || mes !== mesDoAno(atendimentos[i - 1].inicio)) && <li className="mes"><span className="g-rotulo">{mes}</span></li>}
                      <li className={fora ? "fora" : futuro ? "futuro" : undefined} style={{ "--cor": servicoDe(a.servico_id)?.cor ?? "#f97316" } as React.CSSProperties}>
                        <span className="ponto" aria-hidden />
                        <div className="c">
                          <div className="l">
                            <b>{nomesDe(a)}</b>
                            <span className={`g-tag ${st.tom}`}>{st.rotulo}</span>
                          </div>
                          <span className="q">
                            {nomeDiaCurto(new Date(a.inicio))}, {dataCurta(a.inicio)} às {hora(a.inicio)}
                            {vejoFinanceiro && valorDe(a) != null && <> · <b className="g-tab">{brl(valorDe(a)!)}</b></>}
                          </span>
                          {/* a anotação do atendimento (lâmina, shampoo, comportamento): o próximo tosador vê como foi */}
                          {a.obs?.trim() && !fora && <span className="q" style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>Anotação: {a.obs.trim()}</span>}
                        </div>
                      </li>
                    </Fragment>
                  );
                })}
              </ol>
            )}
            {atendimentos.length === 60 && <p className="g-pp g-muted" style={{ marginTop: 8 }}>Aqui aparecem os 60 mais recentes.</p>}
          </section>}
        </div>

        <div>
          {pet.obs?.trim() && (
            <section className="g-card">
              <div className="g-card-t"><h3><Tile icone={NotebookPen} tom="manteiga" tamanho="p" />Observações</h3></div>
              <p className="gc-texto">{pet.obs}</p>
            </section>
          )}

          {(usaModulo(petshop, "pacotes") || pacotes.length > 0) && <section className="g-card">
            <div className="g-card-t"><h3><Tile icone={Ticket} tom="lilas" tamanho="p" />Pacotes ativos</h3></div>
            {!pacotes.length ? <p className="g-muted g-p">Nenhum pacote em uso.</p> : pacotes.map((p) => {
              const venceu = !!p.vence_em && deIsoDia(p.vence_em) < hoje;
              const acabou = p.usados >= p.total;
              return (
                <div key={p.id} className="gc-pacote g-cli-pacote">
                  <Anel parte={p.total ? p.usados / p.total : 0} tamanho={52} cor={venceu || acabou ? "var(--g-laranja)" : "#7c62c0"}>{p.usados}/{p.total}</Anel>
                  <div>
                    <b>{p.nome}</b>
                    <div className={`g-prog${venceu || acabou ? " laranja" : ""}`} role="progressbar" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={Math.min(p.usados, p.total)}>
                      <i style={{ width: `${Math.min(100, (p.usados / p.total) * 100)}%` }} />
                    </div>
                    <span className="g-pp g-muted">
                      {acabou ? "Todos usados" : p.total - p.usados === 1 ? "Falta 1" : `Faltam ${p.total - p.usados}`}
                      {p.vence_em ? ` · ${venceu ? "venceu em" : "vale até"} ${dataCompleta(p.vence_em)}` : " · sem validade"}
                    </span>
                  </div>
                </div>
              );
            })}
          </section>}

          {(casa || estadias.length > 0) && <section className="g-card">
            <div className="g-card-t"><h3><Tile icone={BedDouble} tom="ceu" tamanho="p" />{nomeDaCasa(petshop)}</h3></div>
            {!estadias.length ? <p className="g-muted g-p">Nenhuma estadia por enquanto.</p> : (
              <div className="g-lista">
                {estadias.map((e) => {
                  const st = STATUS_ESTADIA[e.status] ?? { rotulo: e.status, tom: "" };
                  const ate = e.saida ?? e.saida_prevista;
                  return (
                    <div key={e.id} className="g-linha">
                      <span className="t">
                        <b>{e.tipo === "hotel" ? "Hotel" : "Creche"}</b>
                        <span>{dataCompleta(e.entrada)}{ate && dataCompleta(ate) !== dataCompleta(e.entrada) ? ` a ${dataCurta(ate)}` : ""}</span>
                      </span>
                      <span className="d"><span className={`g-tag ${st.tom}`}>{st.rotulo}</span></span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>}

          {usaCasa(petshop) && portariaLigada(petshop) && <QuemPodeBuscar pet={{ ...pet, clientes: tutor }} />}
          {usaCasa(petshop) && tutor && <CartaoPaginaDoTutor cliente={tutor} pets={[pet]} />}
          <OcorrenciasDoPet petId={pet.id} />

          {pet.ativo && (
            <div><button className="g-btn perigo p" onClick={() => void mudarAtivo(false)} disabled={ocupado}>Desativar pet</button></div>
          )}
        </div>
      </div>

      {editando && <FormPet pet={pet} aoFechar={() => setEditando(false)} aoSalvar={() => { setEditando(false); avisarMudanca(); }} />}
      {trocandoTutor && <FolhaTrocarTutor pet={pet} tutorAtual={tutor} aoFechar={() => setTrocandoTutor(false)} aoTrocar={() => setTrocandoTutor(false)} />}
      {editandoTutor && tutor && <FormTutor cliente={tutor} aoFechar={() => setEditandoTutor(false)} aoSalvar={() => { setEditandoTutor(false); avisarMudanca(); }} />}
    </div>
  );
}
