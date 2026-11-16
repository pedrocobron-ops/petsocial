/**
 * Só do servidor: as instruções da leitura do caderno ou do outro sistema, o formato exigido da resposta (JSON com esquema
 * estrito), a leitura de teste (GESTAO_CADERNO_FALSO=1) e a conferência dos arquivos (tipo pelos primeiros bytes e páginas do PDF).
 */
import type { TipoDaPagina } from "./caderno";

const CERTEZA = { type: "string", enum: ["alta", "baixa"] } as const;
const txt = { type: "string" } as const;
const NUM = { type: ["number", "null"] } as const;

/** Formato da resposta (structured outputs: o modelo só consegue responder assim). */
export const ESQUEMA_CADERNO = {
  type: "object",
  additionalProperties: false,
  required: ["pagina", "clientes", "dividas", "agenda", "servicos", "vacinas", "duvidas"],
  properties: {
    pagina: { type: "string", enum: ["clientes", "dividas", "agenda", "precos", "vacinas", "misturado", "nada"] },
    clientes: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["nome", "telefone", "pets", "obs", "certeza"],
        properties: {
          nome: txt, telefone: txt, obs: txt, certeza: CERTEZA,
          pets: {
            type: "array",
            items: {
              type: "object", additionalProperties: false, required: ["nome", "especie", "raca", "porte"],
              properties: { nome: txt, especie: { type: "string", enum: ["cao", "gato", "outro", ""] }, raca: txt, porte: { type: "string", enum: ["P", "M", "G", "GG", ""] } },
            },
          },
        },
      },
    },
    dividas: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["cliente_nome", "telefone", "valor", "desde", "descricao", "certeza"],
        properties: { cliente_nome: txt, telefone: txt, valor: { type: ["number", "null"] }, desde: txt, descricao: txt, certeza: CERTEZA },
      },
    },
    agenda: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["dia", "hora", "pet_nome", "tutor_nome", "servico", "certeza"],
        properties: { dia: txt, hora: txt, pet_nome: txt, tutor_nome: txt, servico: txt, certeza: CERTEZA },
      },
    },
    servicos: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["nome", "area", "duracao_min", "preco_unico", "preco_p", "preco_m", "preco_g", "preco_gg", "certeza"],
        properties: {
          nome: txt, area: { type: "string", enum: ["banho_tosa", "creche", "hotel", "loja"] }, duracao_min: NUM,
          preco_unico: NUM, preco_p: NUM, preco_m: NUM, preco_g: NUM, preco_gg: NUM, certeza: CERTEZA,
        },
      },
    },
    vacinas: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["tipo", "nome", "aplicada", "proxima", "veterinario", "certeza"],
        properties: { tipo: { type: "string", enum: ["vacina", "vermifugo", "antipulgas", "outro"] }, nome: txt, aplicada: txt, proxima: txt, veterinario: txt, certeza: CERTEZA },
      },
    },
    duvidas: { type: "array", items: txt },
  },
} as const;

export const INSTRUCOES_CADERNO = `Você lê páginas que a dona de um pet shop no Brasil mandou para passar para o sistema novo dela. Podem ser:
- fotos de um caderno escrito à mão (letra cursiva, abreviações, rabiscos, setas, coisas riscadas);
- prints de tela ou PDFs exportados do sistema que ela usava antes (SimplesVet, planilhas, relatórios impressos).

Também podem ser a tabela de preços do pet shop (placa na parede, post do Instagram, tela do sistema) ou a carteirinha de
vacinação de um pet.

O que pode ter nas páginas:
- clientes e pets: nome do tutor (dono do animal), telefone ou WhatsApp, nome do pet, espécie, raça, porte, observações;
- quem deve: nome do cliente, valor que deve, desde quando, do que é;
- agenda: dia, hora, nome do pet, nome do tutor, serviço (banho, tosa, unha, hidratação...);
- tabela de preços ("servicos"): nome do serviço, preço por porte (P, M, G, GG) ou um preço só, tempo do serviço se estiver
  escrito, e a área: "banho_tosa" (banho, tosa, unha, hidratação, escovação...), "creche" (diária, mensalidade da creche),
  "hotel" (diária do hotel, hospedagem) ou "loja" (produto vendido);
- carteirinha ("vacinas"): cada vacina, vermífugo ou antipulgas, com o nome do produto (V8, V10, Antirrábica, Gripe, Giárdia,
  Drontal, Bravecto...), a data em que foi aplicada, a data da próxima dose ("revacinar em", "retorno") e o veterinário.

Regras:
1. NUNCA invente. Só escreva o que está na página. O que não der para ler com certeza fica em branco ("") e vai para "duvidas",
   com uma frase curta dizendo onde está ("Linha da Marta: o telefone está borrado", "Página 2, 4ª linha: valor ilegível").
   Se leu mas não tem certeza (letra difícil), escreva o seu melhor palpite e marque "certeza": "baixa".
2. Telefone: copie os algarismos como estão escritos, com DDD se tiver (ex.: "11 98765-4321", "(21) 3333-4444"). Não complete
   número faltando nem invente DDD.
3. Valor: em reais, como número (R$ 35 → 35; 35,50 → 35.5; 1.200,00 → 1200). Ilegível: null.
4. Datas: copie como estão escritas, no formato dia/mês ou dia/mês/ano ("12/10", "12/10/2025"). Não acrescente o ano se ele não
   estiver escrito. Em "desde" vai a data em que a dívida começou (vazio se não tiver). Na agenda, o dia de cada horário; se o
   dia vem só no topo da página ou da coluna, use ele em cada horário daquele dia.
5. Hora como está ("14h", "9:30").
6. Espécie: "cao" para cachorro, cão, cadela; "gato" para gato e gata; "outro" para outros bichos; vazio se não der para saber.
   Porte: "P", "M", "G" ou "GG" só se estiver escrito (pequeno, médio, grande, gigante, mini = P); senão vazio.
7. Um tutor com vários pets é um cliente só, com os pets na lista dele. O mesmo cliente repetido (em duas fotos, dois prints que
   se sobrepõem, duas páginas do PDF) entra uma vez só: junte pelo telefone ou pelo nome igual.
8. Tabelas de sistema: use os títulos das colunas para saber o que é cada coisa. Ignore cabeçalhos repetidos em cada página,
   linhas de total ("Total", "Subtotal", "Saldo"), rodapés, números de página, menus e botões da tela, e linhas em branco.
   Em relatório de contas, só entra o que ainda está em aberto (não o que já foi pago ou quitado).
9. Coisas riscadas ou marcadas como "pago", "ok", "quitado" numa lista de quem deve não entram como dívida.
10. "pagina": o que as páginas são no geral (clientes, dividas, agenda, precos, vacinas, misturado ou nada se não tem nada disso).
12. Tabela de preços: preço por porte vai em preco_p, preco_m, preco_g, preco_gg (só os que estiverem escritos; "pequeno",
    "médio", "grande", "gigante" ou faixas de peso equivalentes); um preço só para todos vai em preco_unico. "A partir de"
    ou faixa ("R$ 50 a 80"): use o menor valor e ponha a linha em "duvidas". Tempo em minutos (1h30 → 90), null se não tiver.
13. Carteirinha: a próxima dose só se estiver ESCRITA na carteirinha. Nunca calcule a próxima dose a partir da aplicação
    (nada de "um ano depois"): sem data escrita, "proxima" fica vazio. O selo/etiqueta do produto é o nome; o carimbo é
    o veterinário.
11. Preencha só as listas do que pediram; se pediram "descubra", preencha o que encontrar.
Escreva os nomes com a primeira letra maiúscula, sem mudar a grafia. As dúvidas, em português simples.`;

/** O pedido de cada leitura: o que a pessoa disse que é e o dia de hoje (só para referência; as datas voltam como escritas). */
export function pedidoDaLeitura(tipo: TipoDaPagina, hoje: string, arquivos: number) {
  const oQue = tipo === "clientes" ? "uma lista de clientes e pets (preencha só clientes)"
    : tipo === "dividas" ? "uma lista de quem deve (preencha só dividas)"
    : tipo === "agenda" ? "a agenda de horários (preencha só agenda)"
    : tipo === "precos" ? "a tabela de preços do pet shop (preencha só servicos)"
    : tipo === "vacinas" ? "a carteirinha de vacinação de um pet (preencha só vacinas)"
    : "não sei: descubra o que é e preencha o que encontrar";
  return `${arquivos === 1 ? "Esta página é" : `Estes ${arquivos} arquivos são`}: ${oQue}. Hoje é ${hoje.split("-").reverse().join("/")}.`;
}

/* ---------- leitura de teste (sem chamar o modelo) ---------- */

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const mais = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/**
 * Resultado fixo para os testes automáticos (GESTAO_CADERNO_FALSO=1): uma página de caderno com um cliente que já existe
 * (Ana Souza, telefone da loja de teste), uma cliente sem telefone, duas dívidas (uma com "desde"), dois horários (um que
 * já passou) e uma dúvida. Com PDF, um relatório "do outro sistema" com um cliente repetido entre as páginas já juntado.
 */
export function leituraDeTeste(tipo: TipoDaPagina, hoje: string, temPdf: boolean) {
  const clientes = temPdf
    ? [
        { nome: "Clara Dias", telefone: "(11) 98888-0003", obs: "", certeza: "alta", pets: [{ nome: "Luna", especie: "cao", raca: "", porte: "M" }] },
        { nome: "Paulo Nunes", telefone: "(11) 97777-1234", obs: "Cliente desde 2019", certeza: "alta", pets: [{ nome: "Fred", especie: "gato", raca: "Siamês", porte: "" }] },
      ]
    : [
        { nome: "Ana Souza", telefone: "11 98888-0001", obs: "", certeza: "alta", pets: [{ nome: "Thor", especie: "cao", raca: "", porte: "" }, { nome: "Pipoca", especie: "cao", raca: "Poodle", porte: "P" }] },
        { nome: "Marta Gomes", telefone: "", obs: "Só vem de manhã", certeza: "baixa", pets: [{ nome: "Bolinha", especie: "cao", raca: "Shih-tzu", porte: "P" }] },
      ];
  const dividas = temPdf
    ? [{ cliente_nome: "Paulo Nunes", telefone: "(11) 97777-1234", valor: 80, desde: "05/09", descricao: "Banho e tosa", certeza: "alta" }]
    : [
        { cliente_nome: "Beto Lima", telefone: "", valor: 35, desde: "12/10", descricao: "Banho", certeza: "alta" },
        { cliente_nome: "Joana Prado", telefone: "21 99876-5432", valor: 50, desde: "", descricao: "Tosa", certeza: "alta" },
      ];
  const agenda = [
    { dia: ddmm(mais(hoje, 3)), hora: "10h", pet_nome: "Thor", tutor_nome: "Ana Souza", servico: "Banho", certeza: "alta" },
    { dia: ddmm(mais(hoje, -5)), hora: "14:30", pet_nome: "Bolinha", tutor_nome: "Marta Gomes", servico: "Tosa", certeza: "alta" },
  ];
  const duvidas = temPdf ? ["Página 2: a linha do total foi ignorada."] : ["Linha da Marta: o telefone está borrado e ficou em branco."];
  // tabela de preços: Banho muda de preço no M (60 → 55; os outros iguais aos da loja de teste), Hidratação igual, um serviço novo
  const servicos = [
    { nome: "Banho", area: "banho_tosa", duracao_min: null, preco_unico: null, preco_p: 50, preco_m: 55, preco_g: 70, preco_gg: 80, certeza: "alta" },
    { nome: "Hidratação", area: "banho_tosa", duracao_min: null, preco_unico: null, preco_p: 25, preco_m: 30, preco_g: 35, preco_gg: 40, certeza: "alta" },
    { nome: "Banho de ofurô", area: "banho_tosa", duracao_min: 40, preco_unico: 35, preco_p: null, preco_m: null, preco_g: null, preco_gg: null, certeza: "alta" },
  ];
  // carteirinha: V10 com a próxima dose escrita, antirrábica sem a próxima (fica em branco), vermífugo
  const vacinas = [
    { tipo: "vacina", nome: "V10", aplicada: ddmm(mais(hoje, -30)) + "/" + mais(hoje, -30).slice(0, 4), proxima: ddmm(mais(hoje, 335)) + "/" + mais(hoje, 335).slice(0, 4), veterinario: "Dra. Paula Reis", certeza: "alta" },
    { tipo: "vacina", nome: "Antirrábica", aplicada: ddmm(mais(hoje, -30)) + "/" + mais(hoje, -30).slice(0, 4), proxima: "", veterinario: "Dra. Paula Reis", certeza: "alta" },
    { tipo: "vermifugo", nome: "Drontal", aplicada: ddmm(mais(hoje, -10)) + "/" + mais(hoje, -10).slice(0, 4), proxima: "", veterinario: "", certeza: "baixa" },
  ];
  const so = (t: TipoDaPagina) => tipo === t || (tipo === "auto" && t !== "vacinas" && t !== "precos");
  return {
    pagina: tipo === "auto" ? "misturado" : tipo,
    clientes: so("clientes") ? clientes : [],
    dividas: so("dividas") ? dividas : [],
    agenda: so("agenda") ? agenda : [],
    servicos: so("precos") ? servicos : [],
    vacinas: so("vacinas") ? vacinas : [],
    duvidas: tipo === "vacinas" ? ["A data da próxima dose da Antirrábica não está escrita."] : tipo === "precos" ? ["“Tosa na tesoura: a partir de R$ 90”: confira o preço."] : duvidas,
  };
}

/* ---------- arquivos ---------- */

export type TipoArquivo = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
/** O tipo do arquivo pelos primeiros bytes (o nome e o tipo que o navegador diz não valem). */
export function tipoDoArquivo(b: Uint8Array): TipoArquivo | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  if (String.fromCharCode(...b.slice(0, 5)) === "%PDF-") return "application/pdf";
  return null;
}

/**
 * Páginas de um PDF, pelo texto do arquivo: conta os objetos "/Type /Page" e o maior "/Count" da árvore de páginas.
 * PDF que guarda tudo comprimido (sem nenhum dos dois à vista) devolve 0: a rota usa o número que o aparelho contou,
 * e o maior dos dois vale.
 */
export function paginasDoPdf(b: Uint8Array): number {
  const s = new TextDecoder("latin1").decode(b);
  const objetos = (s.match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;
  let contagem = 0;
  for (const m of s.matchAll(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)|\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages\b/g)) contagem = Math.max(contagem, Number(m[1] ?? m[2]) || 0);
  return Math.max(objetos, contagem);
}
