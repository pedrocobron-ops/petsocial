import { bancoDoUsuario, configurado } from "@/lib/gestao/supabase";
import { bancoDeServico } from "@/lib/gestao/faxina";
import { copiaCompleta } from "@/lib/gestao/copia-completa";
import { comRegistro, registrarErroServidor } from "@/lib/gestao/erros-servidor";

/**
 * "Baixar cópia completa" do painel do administrador: um .zip com todas as tabelas do banco em JSON (sem logins, senhas,
 * arquivos e segredos; ver copia-completa.ts), mandado aos poucos. Quem pede manda o próprio login (Authorization: Bearer);
 * só passa quem o banco diz que é admin (sou_admin). A leitura usa a chave de serviço (SUPABASE_SERVICE_ROLE_KEY), que só o
 * servidor tem: sem ela, 503.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const json = (status: number, corpo: Record<string, unknown>) => Response.json(corpo, { status, headers: { "Cache-Control": "no-store" } });

async function tratar(req: Request) {
  if (!configurado) return json(503, { erro: "sem_banco", mensagem: "O sistema não está ligado neste endereço." });
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(401, { erro: "sem_login", mensagem: "Entre de novo para baixar a cópia." });
  const eu = bancoDoUsuario(token);
  const [quem, admin] = await Promise.all([eu.auth.getUser(token), eu.rpc("sou_admin")]);
  if (quem.error || !quem.data.user) return json(401, { erro: "sem_login", mensagem: "Entre de novo para baixar a cópia." });
  if (admin.error || admin.data !== true) return json(403, { erro: "sem_acesso", mensagem: "Só a equipe Maestro Pet baixa a cópia completa." });
  const sb = bancoDeServico();
  if (!sb) return json(503, { erro: "sem_chave", mensagem: "A cópia completa não está configurada neste endereço (falta a chave de serviço)." });

  const usuario = { id: quem.data.user.id, email: quem.data.user.email ?? null };
  const dia = new Date().toISOString().slice(0, 10);
  const fluxo = new ReadableStream<Uint8Array>({
    async start(controle) {
      try {
        await copiaCompleta(sb, (b) => controle.enqueue(b), usuario);
        controle.close();
      } catch (e) {
        await registrarErroServidor("/api/gestao/admin/copia", e);
        controle.error(e);
      }
    },
  });
  return new Response(fluxo, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="maestro-copia-completa-${dia}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}

export const GET = comRegistro("/api/gestao/admin/copia", tratar);
