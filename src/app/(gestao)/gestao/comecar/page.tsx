"use client";

import { ERRO_TELEFONE, mascaraTelefone, telefoneValido } from "@/lib/gestao/util";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Porta from "@/components/gestao/porta";
import { banco } from "@/lib/gestao/supabase";
import EscolherModulos from "@/components/gestao/modulos";
import type { Modulo } from "@/lib/gestao/modulos";

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

/** Primeiro acesso: cria o pet shop e começa o teste de 7 dias. */
export default function Comecar() {
  const router = useRouter();
  const [pronto, setPronto] = useState(false);
  // por que a pessoa caiu aqui sem pet shop: perdeu o acesso, o convite não foi achado ou é conta nova mesmo
  const [motivo, setMotivo] = useState<{ tipo: "retirado" | "sem-convite"; loja?: string; email?: string } | null>(null);
  const [conferindo, setConferindo] = useState(false);
  const [nome, setNome] = useState("");
  const [seuNome, setSeuNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  // o mais comum já vem marcado; cada opção é um toque
  const [modulos, setModulos] = useState<Modulo[]>(["banho_tosa"]);
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
      const u = data.session.user;
      setSeuNome(String(u.user_metadata?.nome ?? ""));
      // esta conta já entrou num pet shop neste aparelho e agora não tem nenhum: o acesso foi retirado
      let antes: { user?: string; nome?: string } | null = null;
      try { antes = JSON.parse(localStorage.getItem("maestro-gestao-ultimo-acesso") ?? "null"); } catch { antes = null; }
      if (antes?.user === u.id) setMotivo({ tipo: "retirado", loja: antes.nome });
      // criou a conta pelo link de um convite, mas nenhum convite bate com este e-mail
      else if (u.user_metadata?.convidado) setMotivo({ tipo: "sem-convite", email: u.email });
      setPronto(true);
    })();
  }, [router]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (telefone.trim() && !telefoneValido(telefone)) { setErro(ERRO_TELEFONE); return; }
    if (!modulos.length) { setErro("Marque pelo menos uma coisa que o seu negócio faz."); return; }
    setIndo(true);
    const { error } = await banco().rpc("criar_petshop", { p_nome: nome, p_seu_nome: seuNome, p_telefone: telefone.replace(/\D/g, ""), p_cidade: cidade, p_uf: uf, p_modulos: modulos });
    setIndo(false);
    if (error) { setErro("Não consegui criar o pet shop. Confira os dados e tente de novo."); return; }
    router.replace("/gestao/app?boas-vindas=1");
  }

  async function conferirDeNovo() {
    setConferindo(true);
    const { data: vinculos } = await banco().rpc("entrar");
    setConferindo(false);
    if (vinculos?.length) router.replace("/gestao/app");
    else setErro("Ainda não achei nenhum pet shop ligado a esta conta.");
  }
  async function sair() {
    await banco().auth.signOut();
    router.replace("/gestao/entrar");
  }

  if (!pronto) return <Porta titulo="Só um instante…"><span /></Porta>;

  if (motivo) {
    const retirado = motivo.tipo === "retirado";
    return (
      <Porta titulo={retirado ? "Seu acesso a este pet shop foi retirado" : "Não achei o seu convite"}
        texto={retirado
          ? `Esta conta não está mais ligada ${motivo.loja ? `ao ${motivo.loja}` : "ao pet shop"}. Fale com o dono para ele liberar de novo, em Equipe.`
          : `Nenhum pet shop convidou o e-mail ${motivo.email ?? "desta conta"}. Peça ao dono para conferir se o convite foi feito para este mesmo e-mail e se você já confirmou o e-mail pelo link que enviamos.`}>
        <div className="g-pilha p">
          {erro && <p className="g-erro" role="alert">{erro}</p>}
          <button type="button" className="g-btn pri cheio" onClick={() => void conferirDeNovo()} disabled={conferindo}>{conferindo ? "Conferindo…" : "O dono já liberou: tentar de novo"}</button>
          <button type="button" className="g-btn sec cheio" onClick={() => void sair()}>Sair desta conta</button>
          <p className="g-muted g-p">Quer abrir um pet shop seu, separado desse? <button type="button" className="g-link" onClick={() => { setErro(null); setMotivo(null); }}>Criar um pet shop novo</button></p>
        </div>
      </Porta>
    );
  }

  return (
    <Porta titulo="Como se chama o seu negócio?" texto="Aqui você cria um pet shop novo, do zero, com 7 dias grátis. Foi convidado para a equipe de um pet shop que já existe? Então não crie outro: peça ao dono para conferir o e-mail do convite.">
      <form className="g-form" onSubmit={enviar}>
        <label className="g-campo"><span>Nome do pet shop, banho e tosa, creche ou hotel</span>
          <input className="g-input" required minLength={2} maxLength={80} placeholder="Ex.: Banho & Cia ou Creche Patinhas" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
        </label>
        <div className="g-campo"><span>O que o seu negócio faz?</span>
          <EscolherModulos valor={modulos} aoMudar={(v) => { setModulos(v); setErro(null); }} />
          <small>Marque tudo o que vale. O sistema abre só com as telas do que você usa, e dá para mudar depois.</small>
        </div>
        <label className="g-campo"><span>Como você quer ser chamado</span>
          <input className="g-input" required maxLength={80} value={seuNome} onChange={(e) => setSeuNome(e.target.value)} />
        </label>
        <label className="g-campo"><span>WhatsApp do pet shop</span>
          <input className="g-input" type="tel" inputMode="tel" placeholder="(11) 99999-9999" value={telefone} onChange={(e) => setTelefone(mascaraTelefone(e.target.value))} />
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
        <button className="g-btn pri cheio" disabled={indo}>{indo ? "Criando…" : "Criar meu pet shop novo"}</button>
      </form>
    </Porta>
  );
}
