"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Porta from "@/components/gestao/porta";
import { banco } from "@/lib/gestao/supabase";

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

/** Primeiro acesso: cria o pet shop e começa o teste de 7 dias. */
export default function Comecar() {
  const router = useRouter();
  const [pronto, setPronto] = useState(false);
  const [nome, setNome] = useState("");
  const [seuNome, setSeuNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [indo, setIndo] = useState(false);

  useEffect(() => {
    const sb = banco();
    void (async () => {
      const { data } = await sb.auth.getSession();
      if (!data.session) { router.replace("/gestao/entrar"); return; }
      // quem foi convidado para uma equipe, ou já tem pet shop, vai direto para o aplicativo
      const { data: vinculos } = await sb.rpc("entrar");
      if (vinculos?.length) { router.replace("/gestao/app"); return; }
      setSeuNome(String(data.session.user.user_metadata?.nome ?? ""));
      setPronto(true);
    })();
  }, [router]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setIndo(true);
    const { error } = await banco().rpc("criar_petshop", { p_nome: nome, p_seu_nome: seuNome, p_telefone: telefone, p_cidade: cidade, p_uf: uf });
    setIndo(false);
    if (error) { setErro("Não consegui criar o pet shop. Confira os dados e tente de novo."); return; }
    router.replace("/gestao/app?boas-vindas=1");
  }

  if (!pronto) return <Porta titulo="Só um instante…"><span /></Porta>;

  return (
    <Porta titulo="Como se chama o seu pet shop?" texto="Leva um minuto. Depois você ajusta horários, serviços e preços.">
      <form className="g-form" onSubmit={enviar}>
        <label className="g-campo"><span>Nome do pet shop</span>
          <input className="g-input" required minLength={2} maxLength={80} placeholder="Ex.: Banho & Cia" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
        </label>
        <label className="g-campo"><span>Como você quer ser chamado</span>
          <input className="g-input" required maxLength={80} value={seuNome} onChange={(e) => setSeuNome(e.target.value)} />
        </label>
        <label className="g-campo"><span>WhatsApp do pet shop</span>
          <input className="g-input" type="tel" inputMode="tel" placeholder="(11) 99999-9999" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
        </label>
        <div className="dupla">
          <label className="g-campo"><span>Cidade</span>
            <input className="g-input" value={cidade} onChange={(e) => setCidade(e.target.value)} />
          </label>
          <label className="g-campo"><span>Estado</span>
            <select className="g-select" value={uf} onChange={(e) => setUf(e.target.value)}>
              <option value="">Escolha</option>
              {UFS.map((u) => <option key={u}>{u}</option>)}
            </select>
          </label>
        </div>
        {erro && <p className="g-erro" role="alert">{erro}</p>}
        <button className="g-btn pri cheio" disabled={indo}>{indo ? "Criando…" : "Abrir meu pet shop"}</button>
      </form>
    </Porta>
  );
}
