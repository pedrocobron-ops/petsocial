import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { podeArea } from "@/lib/gestao/acessos";
import { bancoDoUsuario, configurado } from "@/lib/gestao/supabase";
import { comRegistro, erroDoBanco, registrarErroServidor } from "@/lib/gestao/erros-servidor";
import { BUCKET_CADERNO_TMP, MAX_BYTES_IMAGEM, MAX_BYTES_PDF, MAX_IMAGENS, MAX_PAGINAS_PDF, MAX_PDFS, caminhoTemporarioValido, limparLeitura, type Leitura, type TipoDaPagina } from "@/lib/gestao/caderno";
import { ESQUEMA_CADERNO, INSTRUCOES_CADERNO, leituraDeTeste, paginasDoPdf, pedidoDaLeitura, tipoDoArquivo, type TipoArquivo } from "@/lib/gestao/caderno-ia";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Leitura de letra à mão e de tabela: o modelo mais capaz (variável na Vercel). */
const MODELO = process.env.GESTAO_CADERNO_MODELO ?? "claude-opus-5-5";
/** Só para testes automáticos: devolve uma leitura fixa sem chamar o modelo. Nunca vale na Vercel. */
const DE_TESTE = process.env.GESTAO_CADERNO_FALSO === "1" && !process.env.VERCEL;
const TIPOS: TipoDaPagina[] = ["clientes", "dividas", "agenda", "precos", "vacinas", "auto"];

const erro = (status: number, codigo: string, mensagem: string, extra?: Record<string, unknown>) => NextResponse.json({ erro: codigo, mensagem, ...extra }, { status });
const FORA = "A leitura não está funcionando agora. Tente de novo mais tarde; enquanto isso, dá para cadastrar pela tela ou trazer de uma planilha.";
const LIMITE = (limite: number, restam: number) => restam > 0
  ? `Hoje ainda dá para ler ${restam === 1 ? "1 página" : `${restam} páginas`} (o limite é ${limite} por dia). Mande menos fotos ou páginas, ou continue amanhã.`
  : `Hoje já foram lidas as ${limite} páginas do dia. Amanhã dá para ler mais; o que já foi lido e salvo continua aqui.`;

function hojeNoFuso(fuso: string) {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: fuso }).format(new Date()); } catch { return new Date().toISOString().slice(0, 10); }
}

type Arquivo = { tipo: TipoArquivo; dados: string; paginas: number };

/**
 * Lê fotos do caderno, prints e PDFs do sistema que o pet shop usava. Recebe multipart/form-data:
 * petshopId, tipo (clientes | dividas | agenda | auto), arquivo (até 5 imagens e 2 PDFs) e paginas (as páginas de cada PDF,
 * contadas no aparelho, na ordem). Devolve { leitura, restam, limite, paginas } ou { erro, mensagem }.
 * PDF grande (a Vercel recusa pedidos acima de ~4,5 MB) sobe antes para o bucket privado caderno-tmp, em <petshop>/<aleatório>.pdf:
 * aqui chega só o caminho (caminho, com as páginas em paginas_caminho); a rota baixa com o login da pessoa e apaga na hora.
 * Os arquivos ficam só na memória deste pedido: não são gravados nem vão para o registro de erros.
 * O limite do dia é reservado antes de ler e devolvido se a leitura falhar (erro do modelo, demora, recusa).
 */
async function tratar(req: Request) {
  if (!configurado) return erro(503, "sem_banco", "O sistema ainda não está ligado neste endereço.");
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return erro(401, "sem_login", "Entre de novo para usar a leitura.");
  const form = await req.formData().catch(() => null);
  if (!form) return erro(400, "pedido_invalido", "Não deu para receber os arquivos. Tente de novo.");
  const petshopId = String(form.get("petshopId") ?? "");
  const tipo = String(form.get("tipo") ?? "") as TipoDaPagina;
  if (!/^[0-9a-f-]{36}$/i.test(petshopId) || !TIPOS.includes(tipo)) return erro(400, "pedido_invalido", "Pedido incompleto.");

  // quem pede e o que pode trazer (as regras do banco conferem de novo ao salvar)
  const sb = bancoDoUsuario(token);
  const { data: u } = await sb.auth.getUser(token);
  if (!u.user) return erro(401, "sem_login", "Entre de novo para usar a leitura.");
  const [{ data: eu }, { data: loja }] = await Promise.all([
    sb.from("profissionais").select("papel, ve_financeiro, acessos").eq("petshop_id", petshopId).eq("user_id", u.user.id).eq("ativo", true).maybeSingle(),
    sb.from("petshops").select("fuso").eq("id", petshopId).maybeSingle(),
  ]);
  if (!eu || !loja) return erro(403, "sem_acesso", "Você não faz parte deste pet shop.");
  if (!podeArea(eu, "clientes")) return erro(403, "sem_acesso", "Trazer do caderno é para quem cuida dos clientes. Peça ao dono do pet shop.");
  const dinheiro = podeArea(eu, "caixa") || podeArea(eu, "financeiro") || podeArea(eu, "relatorios");
  const agenda = podeArea(eu, "agenda");
  if (tipo === "dividas" && !dinheiro) return erro(403, "sem_dinheiro", "Quem me deve é com quem cuida do dinheiro. Peça ao dono do pet shop.");
  if (tipo === "agenda" && !agenda) return erro(403, "sem_agenda", "A agenda é com quem marca os horários. Peça ao dono do pet shop.");
  // serviços e preços só o dono muda (a mesma regra do banco)
  const dono = eu.papel === "dono";
  if (tipo === "precos" && !dono) return erro(403, "sem_precos", "A tabela de preços é com o dono do pet shop.");

  // os arquivos: tipo pelos primeiros bytes, tamanho e páginas
  const brutos = form.getAll("arquivo").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f);
  const lerPaginas = (campo: string) => String(form.get(campo) ?? "").split(",").map((n) => Math.max(0, Math.min(1000, Math.floor(Number(n) || 0))));
  const paginasDoAparelho = lerPaginas("paginas");
  // PDFs grandes que subiram antes para a pasta temporária: baixa com o login da pessoa (as regras do bucket conferem a área)
  // e apaga logo depois de ler, dê certo ou não. O que sobrar (pedido que caiu no meio) sai na faxina, depois de uma hora.
  const caminhos = form.getAll("caminho").map(String);
  const paginasDosCaminhos = lerPaginas("paginas_caminho");
  if (caminhos.length > MAX_PDFS || caminhos.some((c) => !caminhoTemporarioValido(c, petshopId))) return erro(400, "pedido_invalido", "Pedido incompleto.");
  const temporarios: { b: Uint8Array; paginas: number }[] = [];
  if (caminhos.length) {
    const baixados = await Promise.all(caminhos.map((c) => sb.storage.from(BUCKET_CADERNO_TMP).download(c)));
    await sb.storage.from(BUCKET_CADERNO_TMP).remove(caminhos).catch(() => null);
    for (let i = 0; i < baixados.length; i++) {
      const d = baixados[i];
      if (d.error || !d.data) return erro(400, "sem_arquivo", "O PDF não chegou. Tente de novo.");
      if (d.data.size > MAX_BYTES_PDF) return erro(413, "grande", "Um dos arquivos passa de 10 MB. Divida o PDF em partes menores ou mande prints das telas.");
      temporarios.push({ b: new Uint8Array(await d.data.arrayBuffer()), paginas: paginasDosCaminhos[i] ?? 0 });
    }
  }
  if (!brutos.length && !temporarios.length) return erro(400, "sem_arquivo", "Escolha pelo menos uma foto, print ou PDF.");
  const arquivos: Arquivo[] = [];
  let pdfs = 0;
  const entradas: { b: Uint8Array; paginas: number | null; tamanho: number }[] = [];
  for (const f of brutos) {
    if (f.size > MAX_BYTES_PDF) return erro(413, "grande", "Um dos arquivos passa de 10 MB. Divida o PDF em partes menores ou mande prints das telas.");
    entradas.push({ b: new Uint8Array(await f.arrayBuffer()), paginas: null, tamanho: f.size });
  }
  for (const t of temporarios) entradas.push({ b: t.b, paginas: t.paginas, tamanho: t.b.length });
  for (const { b, paginas: doAparelho } of entradas) {
    const t = tipoDoArquivo(b);
    if (!t || (doAparelho != null && t !== "application/pdf")) return erro(415, "tipo", "Só dá para ler fotos (JPG, PNG, WEBP) e PDF. Tire um print da tela ou salve como PDF e tente de novo.");
    if (t === "application/pdf") {
      const paginas = Math.max(paginasDoPdf(b), (doAparelho ?? paginasDoAparelho[pdfs]) ?? 0, 1);
      pdfs++;
      if (paginas > MAX_PAGINAS_PDF) return erro(413, "paginas", `Um dos PDFs tem ${paginas} páginas. Mande até ${MAX_PAGINAS_PDF} páginas por PDF: divida em partes.`);
      arquivos.push({ tipo: t, dados: Buffer.from(b).toString("base64"), paginas });
    } else {
      if (b.length > MAX_BYTES_IMAGEM) return erro(413, "grande", "Uma das fotos é grande demais. Tire a foto de novo ou mande um print.");
      arquivos.push({ tipo: t, dados: Buffer.from(b).toString("base64"), paginas: 1 });
    }
  }
  if (pdfs > MAX_PDFS || arquivos.length - pdfs > MAX_IMAGENS) return erro(400, "muitos", `Mande até ${MAX_IMAGENS} fotos ou prints e até ${MAX_PDFS} PDFs de cada vez.`);
  const paginas = arquivos.reduce((s, a) => s + a.paginas, 0);

  if (!DE_TESTE && !process.env.ANTHROPIC_API_KEY) { console.error("[caderno] sem ANTHROPIC_API_KEY"); return erro(503, "fora", FORA); }

  // o freio do dia (por pet shop e geral) reserva as páginas antes de ler, numa trava só (duas leituras ao mesmo tempo não
  // passam do limite juntas); se a leitura falhar, a reserva volta. Banco antes da atualização: conta como antes, sem devolver.
  let conta = await sb.rpc("caderno_reservar", { p_petshop: petshopId, p_paginas: paginas });
  if (conta.error && /caderno_reservar|PGRST202|42883/.test(`${conta.error.code ?? ""} ${conta.error.message}`)) conta = await sb.rpc("caderno_contar", { p_petshop: petshopId, p_paginas: paginas });
  if (conta.error) { await registrarErroServidor("/api/gestao/caderno", erroDoBanco(conta.error, "caderno_reservar"), { petshop: petshopId }); return erro(503, "fora", FORA); }
  const c = (conta.data ?? {}) as { ok?: boolean; motivo?: string; restam?: number; limite?: number; reserva?: string };
  if (!c.ok) {
    if (c.motivo === "limite") return erro(429, "limite", LIMITE(c.limite ?? 0, c.restam ?? 0), { restam: c.restam, limite: c.limite });
    if (c.motivo === "geral") return erro(429, "ocupado", "A leitura está com muitos pedidos hoje. Tente de novo amanhã.", { restam: c.restam, limite: c.limite });
    if (c.motivo === "fechado") return erro(403, "fechado", "A conta está só para consulta: a leitura volta quando a assinatura estiver em dia.");
    return erro(403, "sem_acesso", "Trazer do caderno é para quem cuida dos clientes. Peça ao dono do pet shop.");
  }

  const hoje = hojeNoFuso(loja.fuso || "America/Sao_Paulo");
  let leu = false;
  try {
    const r = await lerAsPaginas(arquivos, tipo, hoje, petshopId, pdfs > 0, { dinheiro, agenda, dono }, DE_TESTE ? String(form.get("teste_falha") ?? "") : "");
    if (r instanceof Response) return r;
    leu = true;
    return NextResponse.json({ leitura: r, restam: c.restam ?? 0, limite: c.limite ?? 0, paginas });
  } finally {
    // não leu (erro do modelo, demora, recusa, ou quebrou no meio): as páginas voltam para o limite do dia
    if (!leu && c.reserva) await sb.rpc("caderno_devolver", { p_reserva: c.reserva }).then(() => null, () => null);
  }
}

/** A leitura em si: a leitura limpa, ou a resposta de erro (recusa, demora, erro do modelo). */
async function lerAsPaginas(arquivos: Arquivo[], tipo: TipoDaPagina, hoje: string, petshopId: string, temPdf: boolean,
  { dinheiro, agenda, dono }: { dinheiro: boolean; agenda: boolean; dono: boolean }, falhaDeTeste: string): Promise<Leitura | Response> {
  let bruto: unknown;
  if (DE_TESTE && !falhaDeTeste) {
    bruto = leituraDeTeste(tipo, hoje, temPdf);
  } else {
    try {
      // só nos testes (GESTAO_CADERNO_FALSO=1): finge a falha do modelo pedida, sem chamar nada
      if (DE_TESTE && falhaDeTeste === "recusa") return erro(422, "recusa", "Não deu para ler estas páginas. Confira se as fotos são do caderno ou da lista de clientes e tente de novo.");
      if (DE_TESTE) return erro(502, "ia_fora", "Não deu para ler agora. Tente de novo em instantes.");
      const r = await lerComOModelo(arquivos, tipo, hoje);
      if ("erro" in r) return erro(422, r.erro, r.mensagem);
      bruto = r.dados;
    } catch (err) {
      // só o tipo do erro vai para o registro: nada do conteúdo das páginas
      if (err instanceof Anthropic.RateLimitError) return erro(429, "ocupado", "A leitura está com muitos pedidos agora. Tente de novo em um minuto.");
      if (err instanceof Anthropic.AuthenticationError) { console.error("[caderno] chave recusada pela Anthropic"); return erro(503, "fora", FORA); }
      if (err instanceof Anthropic.APIError) await registrarErroServidor("/api/gestao/caderno", Object.assign(new Error(`Anthropic respondeu ${err.status ?? "sem status"}`), { name: "ErroDaIA" }), { petshop: petshopId });
      else await registrarErroServidor("/api/gestao/caderno", Object.assign(new Error("falha na leitura"), { name: err instanceof Error ? err.name : "Erro" }), { petshop: petshopId });
      return erro(502, "ia_fora", "Não deu para ler agora. Tente de novo em instantes.");
    }
  }

  const leitura = limparLeitura(bruto, hoje);
  // o que a pessoa não pode trazer não volta para a tela
  if (!dinheiro && leitura.dividas.length) { leitura.dividas = []; leitura.duvidas.push("Tem uma lista de quem deve: só quem cuida do dinheiro pode trazer."); }
  if (!agenda && leitura.agenda.length) { leitura.agenda = []; leitura.duvidas.push("Tem horários de agenda: só quem marca horários pode trazer."); }
  if (!dono && leitura.servicos.length) { leitura.servicos = []; leitura.duvidas.push("Tem uma tabela de preços: só o dono do pet shop pode trazer."); }
  // a carteirinha é de um pet: só entra pela ficha dele ("Ler a carteirinha")
  if (tipo !== "vacinas") leitura.vacinas = [];
  else { leitura.clientes = []; leitura.dividas = []; leitura.agenda = []; leitura.servicos = []; }
  return leitura;
}

async function lerComOModelo(arquivos: Arquivo[], tipo: TipoDaPagina, hoje: string): Promise<{ dados: unknown } | { erro: string; mensagem: string }> {
  const cliente = new Anthropic({ apiKey: (process.env.ANTHROPIC_API_KEY ?? "").replace(/[^\x21-\x7E]/g, ""), timeout: 100_000, maxRetries: 0 });
  const conteudo: Anthropic.Beta.BetaContentBlockParam[] = arquivos.map((a) => a.tipo === "application/pdf"
    ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: a.dados } }
    : { type: "image" as const, source: { type: "base64" as const, media_type: a.tipo, data: a.dados } });
  conteudo.push({ type: "text", text: pedidoDaLeitura(tipo, hoje, arquivos.length) });
  const r = await cliente.beta.messages.create({
    model: MODELO,
    max_tokens: 16000,
    output_config: { effort: "medium", format: { type: "json_schema", schema: ESQUEMA_CADERNO as unknown as Record<string, unknown> } },
    ...(/^claude-(opus-5-5|fable-5-2)/.test(MODELO) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    system: [{ type: "text", text: INSTRUCOES_CADERNO, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: conteudo }],
  });
  if (r.stop_reason === "refusal") return { erro: "recusa", mensagem: "Não deu para ler estas páginas. Confira se as fotos são do caderno ou da lista de clientes e tente de novo." };
  if (r.stop_reason === "max_tokens") return { erro: "muito", mensagem: "Tem coisa demais nestas páginas para ler de uma vez. Mande menos fotos ou menos páginas por vez." };
  const texto = r.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  try { return { dados: JSON.parse(texto) }; } catch { return { erro: "ilegivel", mensagem: "Não deu para entender a leitura. Tente de novo com fotos mais nítidas." }; }
}

export const POST = comRegistro("/api/gestao/caderno", tratar);
