"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Porta from "@/components/gestao/porta";
import { banco } from "@/lib/gestao/supabase";

export default function NovaSenha() {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);
  const [indo, setIndo] = useState(false);

  // O link do e-mail abre esta página já com a sessão de recuperação.
  useEffect(() => {
    const sb = banco();
    void sb.auth.getSession().then(({ data }) => setPronto(Boolean(data.session)));
    const { data: sub } = sb.auth.onAuthStateChange((_e, sessao) => setPronto(Boolean(sessao)));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (senha.length < 8) { setErro("A senha precisa de pelo menos 8 caracteres."); return; }
    setIndo(true);
    const { error } = await banco().auth.updateUser({ password: senha });
    setIndo(false);
    if (error) { setErro("Não consegui salvar a senha. Peça um link novo e tente de novo."); return; }
    router.replace("/gestao/app");
  }

  return (
    <Porta titulo="Crie a sua senha nova" texto={pronto ? undefined : "Abra esta página pelo link que enviamos no seu e-mail."}>
      {pronto && (
        <form className="g-form" onSubmit={enviar}>
          <label className="g-campo"><span>Senha nova</span>
            <input className="g-input" type="password" autoComplete="new-password" required minLength={8} value={senha} onChange={(e) => setSenha(e.target.value)} />
            <small>Pelo menos 8 caracteres.</small>
          </label>
          {erro && <p className="g-erro" role="alert">{erro}</p>}
          <button className="g-btn pri cheio" disabled={indo}>{indo ? "Salvando…" : "Salvar e entrar"}</button>
        </form>
      )}
    </Porta>
  );
}
