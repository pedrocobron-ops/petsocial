"use client";

import { useRef, useState } from "react";
import { Camera } from "lucide-react";
import type { Cliente, Pet, PetComTutor } from "@/lib/gestao/tipos";
import { contando, lerTudo } from "@/lib/gestao/paginas";
import { PORTES } from "@/lib/gestao/tipos";
import { ERRO_TELEFONE, isoDia, mascaraTelefone, semAcento, soDigitos, telefoneValido } from "@/lib/gestao/util";
import { reduzirFoto } from "@/lib/gestao/foto";
import { useGestao } from "./contexto";
import { AvatarPet, Campo, Folha, ok, useAvisos, useDados } from "./ui";

/**
 * Cadastro ou edição de um pet. Em cadastro novo, escolhe um tutor existente ou cria o tutor junto.
 * `aoSalvar` recebe o pet já com o tutor.
 */
export default function FormPet({ pet, clienteFixo, nomeInicial, aoFechar, aoSalvar }: {
  pet?: Pet; clienteFixo?: Pick<Cliente, "id" | "nome" | "telefone">; nomeInicial?: string;
  aoFechar: () => void; aoSalvar: (pet: PetComTutor) => void;
}) {
  const { sb, petshop } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const [nome, setNome] = useState(pet?.nome ?? nomeInicial ?? "");
  const [especie, setEspecie] = useState(pet?.especie ?? "cao");
  const [raca, setRaca] = useState(pet?.raca ?? "");
  const [porte, setPorte] = useState(pet?.porte ?? "");
  const [sexo, setSexo] = useState(pet?.sexo ?? "");
  const [nascimento, setNascimento] = useState(pet?.nascimento ?? "");
  const [alertas, setAlertas] = useState(pet?.alertas ?? "");
  const [obs, setObs] = useState(pet?.obs ?? "");
  const [foto, setFoto] = useState<string | null>(pet?.foto ?? null);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [tutorNome, setTutorNome] = useState("");
  const [tutorFone, setTutorFone] = useState("");
  const [tutorId, setTutorId] = useState<string | null>(clienteFixo?.id ?? pet?.cliente_id ?? null);
  const [salvando, setSalvando] = useState(false);
  const [erroFone, setErroFone] = useState<string | null>(null);
  const [erroNasc, setErroNasc] = useState<string | null>(null);
  const hoje = isoDia(new Date());
  const arquivo = useRef<HTMLInputElement>(null);

  const precisaTutor = !pet && !clienteFixo;
  const { dados: clientes } = useDados(async () =>
    precisaTutor ? lerTudo<{ id: string; nome: string; telefone: string | null }>((de, ate, contar) => sb.from("clientes").select("id, nome, telefone", contando(contar)).eq("petshop_id", petshop.id).order("nome").order("id").range(de, ate)) : [],
  [petshop.id, precisaTutor]);
  const alvo = semAcento(tutorNome);
  const sugestoes = precisaTutor && !tutorId && alvo.length >= 2 ? (clientes ?? []).filter((c) => semAcento(c.nome).includes(alvo)).slice(0, 4) : [];

  async function escolherFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setEnviandoFoto(true);
    try {
      let blob: Blob;
      try {
        if (f.type && !f.type.startsWith("image/")) throw new Error("não é imagem");
        blob = await reduzirFoto(f);
      } catch { throw new Error("Esse arquivo não é uma foto. Escolha uma imagem JPG ou PNG."); }
      const caminho = `${petshop.id}/${crypto.randomUUID()}.jpg`;
      const { error } = await sb.storage.from("pets").upload(caminho, blob, { contentType: "image/jpeg" });
      if (error) throw error;
      setFoto(caminho);
    } catch (err) { avisarErro(err); }
    setEnviandoFoto(false);
    e.target.value = "";
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim() || salvando) return;
    if (!tutorId && precisaTutor && !telefoneValido(tutorFone)) { setErroFone(ERRO_TELEFONE); return; }
    if (nascimento && nascimento > hoje) { setErroNasc("O nascimento não pode ser depois de hoje."); return; }
    setSalvando(true);
    try {
      let clienteId = tutorId;
      if (!clienteId) {
        if (!tutorNome.trim()) throw new Error("Diga o nome do tutor.");
        const novo = ok(await sb.from("clientes").insert({ petshop_id: petshop.id, nome: tutorNome.trim(), telefone: soDigitos(tutorFone) || null }).select("id").single());
        clienteId = novo.id;
      }
      const campos = {
        nome: nome.trim(), especie, raca: raca.trim() || null, porte: porte || null, sexo: sexo || null,
        nascimento: nascimento || null, alertas: alertas.trim() || null, obs: obs.trim() || null, foto,
      };
      const salvo = pet
        ? ok(await sb.from("pets").update(campos).eq("id", pet.id).select("*, clientes(id, nome, telefone)").single())
        : ok(await sb.from("pets").insert({ ...campos, petshop_id: petshop.id, cliente_id: clienteId }).select("*, clientes(id, nome, telefone)").single());
      avisar(pet ? "Ficha atualizada." : `${campos.nome} entrou no cadastro.`);
      aoSalvar(salvo as PetComTutor);
    } catch (err) { avisarErro(err); }
    setSalvando(false);
  }

  return (
    <Folha titulo={pet ? `Ficha de ${pet.nome}` : "Pet novo"} aoFechar={aoFechar}
      rodape={<><button type="button" className="g-btn sec" onClick={aoFechar}>Cancelar</button><button className="g-btn pri" form="form-pet" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button></>}>
      <form id="form-pet" className="g-form" onSubmit={salvar}>
        <div className="g-fila">
          <AvatarPet pet={{ nome: nome || "Pet", foto, especie }} tamanho="g" />
          <button type="button" className="g-btn sec p" onClick={() => arquivo.current?.click()} disabled={enviandoFoto}><Camera />{enviandoFoto ? "Enviando…" : foto ? "Trocar foto" : "Colocar foto"}</button>
          <input ref={arquivo} type="file" accept="image/*" hidden onChange={escolherFoto} />
        </div>
        <Campo rotulo="Nome do pet" dica={nome.length >= 60 ? `${nome.length} de 80 letras${nome.length >= 80 ? ": chegou ao limite." : "."}` : undefined}>
          <input className="g-input" required maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} autoFocus={!nome} />
        </Campo>

        {precisaTutor && (
          <div className="g-card areia g-form">
            <Campo rotulo="Tutor (dono do pet)" dica={tutorId ? undefined : "Se já for cliente, escolha na lista que aparece."}>
              <input className="g-input" required value={tutorNome} maxLength={120}
                onChange={(e) => { setTutorNome(e.target.value); setTutorId(null); }} />
            </Campo>
            {sugestoes.length > 0 && (
              <div className="g-chips">
                {sugestoes.map((c) => (
                  <button key={c.id} type="button" className="g-chip" onClick={() => { setTutorId(c.id); setTutorNome(c.nome); setTutorFone(c.telefone ?? ""); setErroFone(null); }}>{c.nome}</button>
                ))}
              </div>
            )}
            {tutorId ? <p className="g-pp g-muted">Cliente já cadastrado. O pet entra na ficha dele.</p> : (
              <Campo rotulo="WhatsApp do tutor" erro={erroFone} dica="DDD e número. Pode ficar em branco.">
                <input className="g-input" type="tel" inputMode="tel" autoComplete="off" placeholder="(11) 99999-9999" maxLength={16} value={tutorFone} aria-invalid={!!erroFone}
                  onChange={(e) => { setTutorFone(mascaraTelefone(e.target.value)); setErroFone(null); }}
                  onBlur={() => setErroFone(telefoneValido(tutorFone) ? null : ERRO_TELEFONE)} />
              </Campo>
            )}
          </div>
        )}

        <div className="g-campo"><span>Espécie</span>
          <div className="g-chips">
            {[["cao", "Cachorro"], ["gato", "Gato"], ["outro", "Outro"]].map(([id, r]) => (
              <button key={id} type="button" className="g-chip" aria-pressed={especie === id} onClick={() => setEspecie(id)}>{r}</button>
            ))}
          </div>
        </div>
        <div className="g-campo"><span>Porte</span>
          <div className="g-chips">
            {PORTES.map((p) => <button key={p.id} type="button" className="g-chip" aria-pressed={porte === p.id} onClick={() => setPorte(porte === p.id ? "" : p.id)}>{p.rotulo}</button>)}
          </div>
          <small>O porte define o preço do banho.</small>
        </div>
        <div className="dupla">
          <Campo rotulo="Raça"><input className="g-input" value={raca} maxLength={60} onChange={(e) => setRaca(e.target.value)} /></Campo>
          <Campo rotulo="Sexo">
            <select className="g-select" value={sexo} onChange={(e) => setSexo(e.target.value)}><option value="">—</option><option value="M">Macho</option><option value="F">Fêmea</option></select>
          </Campo>
        </div>
        <Campo rotulo="Nascimento" erro={erroNasc}>
          <input className="g-input" type="date" max={hoje} value={nascimento} aria-invalid={!!erroNasc}
            onChange={(e) => { setNascimento(e.target.value); setErroNasc(e.target.value && e.target.value > hoje ? "O nascimento não pode ser depois de hoje." : null); }} />
        </Campo>
        <Campo rotulo="Cuidados e alertas" dica="Aparece em destaque na agenda. Ex.: alergia a shampoo, medo de secador, morde.">
          <textarea className="g-textarea" value={alertas} maxLength={400} onChange={(e) => setAlertas(e.target.value)} />
        </Campo>
        <Campo rotulo="Observações"><textarea className="g-textarea" value={obs} maxLength={600} onChange={(e) => setObs(e.target.value)} /></Campo>
      </form>
    </Folha>
  );
}
