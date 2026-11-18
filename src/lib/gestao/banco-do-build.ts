/**
 * De qual projeto do Supabase este build fala. Lido pelo `next.config.ts` na hora do build e gravado nas variáveis
 * `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (que `supabase-config.ts` lê).
 *
 * - Com as duas variáveis definidas: valem elas.
 * - Sem elas, no build de PRODUÇÃO da Vercel (`VERCEL_ENV=production`): vale o projeto de produção de hoje, para o site
 *   publicado não parar se alguém apagar as variáveis. Os dois valores são públicos por natureza (vão para o navegador).
 * - Sem elas, em qualquer outro build (prévia da Vercel, máquina de alguém, teste): NÃO fala com produção. O build avisa
 *   bem alto e o aplicativo abre dizendo que o banco não foi configurado. Quem quiser mesmo o banco de produção numa
 *   máquina define as duas variáveis (ou `GESTAO_BANCO_DE_PRODUCAO=1`).
 */
export const BANCO_DE_PRODUCAO = { url: "https://pifuiczrytmizqxzygbi.supabase.co", chave: "sb_publishable_0WFj3aYhEER7N0yrDQ6Q1Q_Lk1I4XwY" } as const;

export type BancoDoBuild = { url: string; chave: string; origem: "variaveis" | "producao" | "nenhum"; aviso: string | null };

export function bancoDoBuild(env: Record<string, string | undefined>): BancoDoBuild {
  const url = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim(), chave = (env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
  if (url && chave) return { url, chave, origem: "variaveis", aviso: null };
  const falta = [!url && "NEXT_PUBLIC_SUPABASE_URL", !chave && "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"].filter(Boolean).join(" e ");
  if (env.VERCEL_ENV === "production" || env.GESTAO_BANCO_DE_PRODUCAO === "1") {
    return { ...BANCO_DE_PRODUCAO, origem: "producao", aviso: `Falta ${falta}: este build de produção usa o projeto do Supabase de produção que está no código. Defina as variáveis na Vercel.` };
  }
  return {
    url: "", chave: "", origem: "nenhum",
    aviso: `ATENÇÃO: falta ${falta}. Este build NÃO é o de produção, então não fala com o banco de produção: o Maestro Pet Gestão vai abrir dizendo que o banco não foi configurado. Defina as duas variáveis (em .env.local, ou na Vercel para as prévias) com o projeto do Supabase que este build deve usar.`,
  };
}
