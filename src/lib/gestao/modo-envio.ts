import { saudacaoZap, textoPronto } from "./agenda";
import { mensagemDeDivida } from "./dinheiro-opcoes";
import { corpoDaMensagem } from "./hotel";
import { CHAVE_NO_BANCO, juntarNomes, mensagemDoLembrete, mensagemSaude, montarMensagem } from "./mensagens-prontas";
import { servicosPorExtenso } from "./servicos-do-horario";
import type { Banco } from "./supabase";
import type { Petshop } from "./tipos";
import { brl, centavos, dataAmigavel, dataCompleta, deIsoDia, fmtTelefone, hora, lerTelefone, linkWhatsApp, soDigitos } from "./util";

/**
 * Modo envio: uma fila só de mensagens prontas, para mandar muitas mensagens de WhatsApp rápido, um toque cada.
 * Não há API de WhatsApp: cada mensagem abre no WhatsApp do aparelho da loja (link wa.me) e quem aperta enviar é a pessoa.
 *
 * O banco (função `gestao_modo_envio`) diz o que está esperando mensagem, já filtrado pelas áreas de quem pede.
 * Aqui só se agrupa (uma mensagem por tutor e por tipo), se escreve o texto (os mesmos das outras telas) e se separa
 * quem não pode receber (sem telefone, telefone incompleto, "não quer receber mensagens").
 * "Enviou? Sim" grava pela função `modo_envio_marcar`: a mesma marca que as outras telas usam (lembrete_em, pronto_avisado_em,
 * avisos da estadia, cobrado_em) e o registro em `mensagens_enviadas`.
 */

export type TipoEnvio = "pronto" | "lembrete" | "chegada" | "cobranca" | "saude" | "pacote" | "niver" | "niver_tutor" | "volta";

/** Ordem da fila: o que é do dia (pet pronto, amanhã) primeiro; depois o resto. */
export const TIPOS_ENVIO: { id: TipoEnvio; rotulo: string; curto: string }[] = [
  { id: "pronto", rotulo: "Pet pronto para buscar", curto: "Pronto" },
  { id: "lembrete", rotulo: "Lembrete dos horários de amanhã", curto: "Lembrete" },
  { id: "chegada", rotulo: "Aviso de chegada de amanhã (creche e hotel)", curto: "Chegada" },
  { id: "cobranca", rotulo: "Cobrança gentil (contas em aberto)", curto: "Cobrança" },
  { id: "saude", rotulo: "Vacina e cuidados vencendo", curto: "Saúde" },
  { id: "pacote", rotulo: "Renovar pacote (última vez)", curto: "Pacote" },
  { id: "niver", rotulo: "Aniversário do pet hoje", curto: "Aniversário" },
  { id: "niver_tutor", rotulo: "Aniversário do tutor hoje", curto: "Aniversário do tutor" },
  { id: "volta", rotulo: "Chamar de volta (60 dias ou mais sem vir)", curto: "Chamar de volta" },
];
export const rotuloDoTipo = (t: TipoEnvio) => TIPOS_ENVIO.find((x) => x.id === t)!.rotulo;

/** Quantos dias para a frente olhar a vacina e os cuidados. */
export const DIAS_SAUDE = 15;

type Tutor = { id: string | null; nome: string | null; telefone: string | null; nao_quer: boolean | null } | null;
type Pet = { id: string; nome: string; sexo: string | null };
type Servicos = { servicos: { nome: string } | null; agendamento_servicos: { ordem: number; servicos: { nome: string } | null }[] | null };
type ItemHorario = Servicos & { id: string; inicio: string; pet: Pet; tutor: Tutor };
type ItemChegada = { id: string; tipo: string; entrada: string; saida_prevista: string | null; pet: Pet; tutor: Tutor };
type ItemSaude = { id: string; pet_id: string; tipo: string; nome: string; vence_em: string; pet: Pet; tutor: Tutor };
type ItemNiver = { id: string; nome: string; nascimento: string; pet: Pet; tutor: Tutor };
type ItemNiverTutor = { id: string; nome: string; nascimento: string; pets: Pet[] | null; tutor: Tutor };
type ItemPacote = { id: string; nome: string; total: number; usados: number; pet: Pet; tutor: Tutor };
type Conta = { id: string; valor: number; valor_original: number | null; descricao: string | null; categoria: string; vencimento: string | null; multa_recebida: number | null; multa_recebida_em: string | null };
type ItemCobranca = { cliente_id: string; total: number; tutor: Tutor; contas: Conta[] };
type ItemVolta = { id: string; ultima: string; servico: string | null; pet: Pet; tutor: Tutor };

/** O que `gestao_modo_envio` devolve. Só vêm os tipos das áreas de quem pediu. */
export type DadosDoEnvio = {
  dia: string;
  modelos: Record<string, string>;
  itens: Partial<{ lembrete: ItemHorario[]; pronto: ItemHorario[]; chegada: ItemChegada[]; saude: ItemSaude[]; niver: ItemNiver[]; niver_tutor: ItemNiverTutor[]; pacote: ItemPacote[]; cobranca: ItemCobranca[]; volta: ItemVolta[] }>;
};

/** Uma mensagem da fila. `refs` vão para `modo_envio_marcar` quando a pessoa diz que mandou. */
export type MensagemDaFila = {
  chave: string;
  tipo: TipoEnvio;
  refs: string[];
  tutorId: string | null;
  /** Para quem: o tutor (e o telefone formatado) */
  quem: string;
  telefone: string;
  /** Por quê: "Banho de Thor amanhã às 09:00" */
  porque: string;
  texto: string;
};
export type Pulado = { chave: string; tipo: TipoEnvio; quem: string; porque: string; motivo: "sem telefone" | "telefone incompleto" | "não quer receber mensagens"; tutorId: string | null; petId: string | null };
export type Fila = { mensagens: MensagemDaFila[]; pulados: Pulado[] };

/** Abre o WhatsApp do aparelho com o texto (o telefone já vem conferido pela fila). */
export const linkDaMensagem = (m: Pick<MensagemDaFila, "telefone">, texto: string) => linkWhatsApp(m.telefone, texto);

/** Texto para oferecer a renovação do pacote no último uso. */
export function textoRenovacao(p: { tutor: string | null; petshop: string; pets: string[]; pacote: string; acabou: boolean }) {
  const nome = p.pacote.replace(/^pacote\s+(de\s+)?/i, "").trim().toLowerCase() || "de banhos";
  const pets = juntarNomes(p.pets) || "seu pet";
  return `${saudacaoZap(p.tutor, p.petshop)} ${p.acabou ? `O pacote ${nome} de ${pets} chegou ao fim.` : `Hoje ${pets} usa a última vez do pacote ${nome}.`} Quer renovar para continuar? É só responder aqui que a gente já deixa separado.`;
}

const doPet = (p: Pet) => `${p.sexo === "F" ? "da" : p.sexo === "M" ? "do" : "de"} ${p.nome}`;

/** Agrupa por tutor (sem tutor: por pet), na ordem em que vieram. */
function porTutor<T extends { tutor: Tutor; pet?: Pet }>(lista: T[]): T[][] {
  const grupos = new Map<string, T[]>();
  lista.forEach((x, i) => {
    const k = x.tutor?.id ?? x.pet?.id ?? String(i);
    grupos.set(k, [...(grupos.get(k) ?? []), x]);
  });
  return [...grupos.values()];
}

/**
 * Monta a fila: uma mensagem por tutor e por tipo, com o texto pronto, e a lista dos que ficam de fora (e por quê).
 * `petshop` precisa do nome e das opções (textos do hotel, Pix da cobrança).
 */
export function montarFila(d: DadosDoEnvio, petshop: Petshop, agora = new Date()): Fila {
  const mensagens: MensagemDaFila[] = [];
  const pulados: Pulado[] = [];
  const hoje = d.dia ?? agora.toISOString().slice(0, 10);
  const loja = petshop.nome;

  function entrar(tipo: TipoEnvio, refs: string[], tutor: Tutor, petId: string | null, porque: string, texto: (nome: string | null) => string) {
    const chave = `${tipo}:${refs[0]}`;
    const quem = tutor?.nome?.trim() || "Sem tutor";
    if (tutor?.nao_quer) { pulados.push({ chave, tipo, quem, porque, motivo: "não quer receber mensagens", tutorId: tutor.id, petId }); return; }
    const bruto = tutor?.telefone ?? "";
    if (!soDigitos(bruto)) { pulados.push({ chave, tipo, quem, porque, motivo: "sem telefone", tutorId: tutor?.id ?? null, petId }); return; }
    const fone = lerTelefone(bruto).fone;
    if (!fone) { pulados.push({ chave, tipo, quem, porque, motivo: "telefone incompleto", tutorId: tutor?.id ?? null, petId }); return; }
    mensagens.push({ chave, tipo, refs, tutorId: tutor?.id ?? null, quem, telefone: fone, porque, texto: texto(tutor?.nome ?? null) });
  }
  const nomes = (l: { pet: Pet }[]) => juntarNomes([...new Set(l.map((x) => x.pet.nome))]);
  const comoHorario = (a: ItemHorario, tutor: string | null) => ({ inicio: a.inicio, servicos: a.servicos, agendamento_servicos: a.agendamento_servicos, pets: { nome: a.pet.nome, clientes: tutor ? { nome: tutor } : null } });

  // pet pronto: um tutor com dois pets prontos recebe uma mensagem só
  for (const g of porTutor(d.itens.pronto ?? [])) {
    const servico = g.length === 1 ? servicosPorExtenso(g[0]) : null;
    entrar("pronto", g.map((a) => a.id), g[0].tutor, g[0].pet.id, `${servico ?? "Atendimento"} de ${nomes(g)} concluído hoje`,
      (t) => textoPronto({ tutor: t, pet: nomes(g), petshop: loja, servico }));
  }
  for (const g of porTutor(d.itens.lembrete ?? [])) {
    const quando = g.map((a) => `${servicosPorExtenso(a) ?? "Horário"} de ${a.pet.nome} ${dataAmigavel(a.inicio)} às ${hora(a.inicio)}`).join("; ");
    entrar("lembrete", g.map((a) => a.id), g[0].tutor, g[0].pet.id, quando, (t) => mensagemDoLembrete(g.map((a) => comoHorario(a, t)), loja));
  }
  for (const g of porTutor(d.itens.chegada ?? [])) {
    const lugar = (e: ItemChegada) => (e.tipo === "hotel" ? "Hotel" : "Creche");
    const quando = g.map((e) => `${lugar(e)} de ${e.pet.nome} ${dataAmigavel(e.entrada)} às ${hora(e.entrada)}`).join("; ");
    // dois pets que chegam juntos (mesmo lugar, mesma hora): uma frase só, com os dois nomes (igual ao "Avisar quem chega amanhã")
    const juntos = g.length > 1 && g.every((e) => e.tipo === g[0].tipo && e.entrada === g[0].entrada);
    entrar("chegada", g.map((e) => e.id), g[0].tutor, g[0].pet.id, quando, (t) => {
      const corpo = juntos
        ? corpoDaMensagem("chegada", { petshop, pet: { nome: nomes(g), sexo: null }, estadia: g[0] })
        : g.map((e) => corpoDaMensagem("chegada", { petshop, pet: e.pet, estadia: e })).join(" ");
      return `${saudacaoZap(t, loja)} ${corpo}`;
    });
  }
  for (const c of d.itens.cobranca ?? []) {
    const total = centavos(c.contas.reduce((s, x) => s + Number(x.valor), 0));
    const venceu = c.contas.map((x) => x.vencimento).filter((x): x is string => Boolean(x)).sort()[0];
    entrar("cobranca", c.contas.map((x) => x.id), c.tutor, null,
      `Deve ${brl(total)}${c.contas.length > 1 ? ` em ${c.contas.length} contas` : ""}${venceu ? `, desde ${dataCompleta(venceu)}` : ""}`,
      (t) => mensagemDeDivida(petshop, t, c.contas, hoje));
  }
  // saúde: uma mensagem por pet, com todos os cuidados dele que vencem
  const porPet = new Map<string, ItemSaude[]>();
  for (const s of d.itens.saude ?? []) porPet.set(s.pet_id, [...(porPet.get(s.pet_id) ?? []), s]);
  for (const g of porPet.values()) {
    const v = g[0].vence_em;
    const quando = v < hoje ? `venceu em ${dataCompleta(v)}` : v === hoje ? "vence hoje" : `vence em ${dataCompleta(v)}`;
    entrar("saude", g.map((s) => s.id), g[0].tutor, g[0].pet.id, `${g.map((s) => s.nome).join(", ")} ${doPet(g[0].pet)}: ${quando}`,
      (t) => mensagemSaude(t ?? "", g[0].pet.nome, loja, g, deIsoDia(hoje)));
  }
  for (const g of porTutor(d.itens.pacote ?? [])) {
    const acabou = g.every((p) => p.usados >= p.total);
    entrar("pacote", g.map((p) => p.id), g[0].tutor, g[0].pet.id, `${g.map((p) => `${p.nome} de ${p.pet.nome}`).join("; ")}: ${acabou ? "acabou" : "última vez hoje"}`,
      (t) => textoRenovacao({ tutor: t, petshop: loja, pets: [...new Set(g.map((p) => p.pet.nome))], pacote: g[0].nome, acabou }));
  }
  const modeloNiver = d.modelos?.[CHAVE_NO_BANCO.niver] ?? "", modeloVolta = d.modelos?.[CHAVE_NO_BANCO.volta] ?? "";
  for (const g of porTutor(d.itens.niver ?? [])) {
    entrar("niver", g.map((p) => p.id), g[0].tutor, g[0].pet.id, `Aniversário ${g.length === 1 ? doPet(g[0].pet) : `de ${nomes(g)}`} hoje`,
      (t) => montarMensagem("niver", modeloNiver, { tutor: t, pets: [...new Set(g.map((p) => p.pet.nome))], petshop: loja }));
  }
  // aniversário do tutor: a ref é o tutor (uma vez por ano); [pet] vira o nome dos pets dele
  const modeloNiverTutor = d.modelos?.[CHAVE_NO_BANCO.niver_tutor] ?? "";
  for (const c of d.itens.niver_tutor ?? []) {
    const pets = (c.pets ?? []).map((p) => p.nome);
    entrar("niver_tutor", c.tutor?.id ? [c.tutor.id] : [c.id], c.tutor, c.pets?.[0]?.id ?? null, `Aniversário de ${c.tutor?.nome?.trim() || c.nome} hoje`,
      (t) => montarMensagem("niver_tutor", modeloNiverTutor, { tutor: t, pets, petshop: loja }));
  }
  for (const g of porTutor(d.itens.volta ?? [])) {
    const dias = Math.round((deIsoDia(hoje).getTime() - deIsoDia(isoDoDia(g[0].ultima)).getTime()) / 864e5);
    // a ref é o tutor: chamado uma vez, vale para todos os pets dele
    const tutorId = g[0].tutor?.id;
    entrar("volta", tutorId ? [tutorId] : [], g[0].tutor, g[0].pet.id, `${nomes(g)} não ${g.length > 1 ? "vêm" : "vem"} há ${dias} dias${g[0].servico ? ` (último: ${g[0].servico})` : ""}`,
      (t) => montarMensagem("volta", modeloVolta, { tutor: t, pets: [...new Set(g.map((p) => p.pet.nome))], petshop: loja }));
  }
  return { mensagens: mensagens.filter((m) => m.refs.length), pulados };
}

const isoDoDia = (iso: string) => { const x = new Date(iso); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };

/** Quantas mensagens de cada tipo (só as que dá para mandar). */
export function contarPorTipo(f: Fila): Partial<Record<TipoEnvio, number>> {
  const n: Partial<Record<TipoEnvio, number>> = {};
  for (const m of f.mensagens) n[m.tipo] = (n[m.tipo] ?? 0) + 1;
  return n;
}

/** Lê a fila do banco. Banco antes da migração (função não existe): null. */
export async function lerModoEnvio(sb: Banco, petshopId: string, dias = DIAS_SAUDE): Promise<DadosDoEnvio | null> {
  const r = await sb.rpc("gestao_modo_envio", { p: petshopId, p_dias: dias });
  if (r.error) {
    if (r.error.code === "PGRST202" || r.error.code === "42883") return null;
    throw new Error(r.error.message);
  }
  return (r.data as unknown as DadosDoEnvio | null) ?? null;
}

/** "Enviou? Sim": grava a marca e o registro. Devolve a hora gravada. */
export async function marcarEnviada(sb: Banco, petshopId: string, m: Pick<MensagemDaFila, "tipo" | "refs">): Promise<string> {
  const r = await sb.rpc("modo_envio_marcar", { p: petshopId, p_tipo: m.tipo, p_refs: m.refs });
  if (r.error) throw new Error(r.error.message);
  return String((r.data as { enviado_em?: string } | null)?.enviado_em ?? new Date().toISOString());
}

/** "3 lembretes, 2 cobranças…" para a tela Hoje e o Mozart. */
export function resumoDaFila(f: Fila) {
  const n = contarPorTipo(f);
  return TIPOS_ENVIO.filter((t) => n[t.id]).map((t) => ({ tipo: t.id, rotulo: t.rotulo, quantas: n[t.id]! }));
}

/** Telefone formatado para mostrar na fila. */
export const foneDaFila = (m: Pick<MensagemDaFila, "telefone">) => fmtTelefone(m.telefone);
