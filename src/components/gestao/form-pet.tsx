"use client";

import { useRef, useState } from "react";
import { Camera } from "lucide-react";
import type { Cliente, Pet, PetComTutor } from "@/lib/gestao/tipos";
import { PORTES } from "@/lib/gestao/tipos";
import { semAcento } from "@/lib/gestao/util";
import { useGestao } from "./contexto";
import { AvatarPet, Campo, Folha, ok, useAvisos, useDados } from "./ui";

/** Reduz a foto para no máximo 640 px e devolve um JPEG leve (celulares mandam fotos de vários MB). */
async function reduzirFoto(arquivo: File): Promise<Blob> {
  const img = await createImageBitmap(arquivo);
  const escala = Math.min(1, 640 / Math.max(img.width, img.height));
  const tela = document.createElement("canvas");
  tela.width = Math.round(img.width * escala);
  tela.height = Math.round(img.height * escala);
  tela.getContext("2d")!.drawImage(img, 0, 0, tela.width, tela.height);
  return new Promise((res, rej) => tela.toBlob((b) => (b ? res(b) : rej(new Error("Não consegui ler a foto."))), "image/jpeg", 0.82));
}

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
  const arquivo = useRef<HTMLInputElement>(null);

  const precisaTutor = !pet && !clienteFixo;
  const { dados: clientes } = useDados(async () =>
    precisaTutor ? ok(await sb.from("clientes").select("id, nome, telefone").eq("petshop_id", petshop.id).order("nome").limit(2000)) : [],
  [petshop.id, precisaTutor]);
  const alvo = semAcento(tutorNome);
  const sugestoes = precisaTutor && !tutorId && alvo.length >= 2 ? (clientes ?? []).filter((c) => semAcento(c.nome).includes(alvo)).slice(0, 4) : [];

  async function escolherFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setEnviandoFoto(true);
    try {
      const blob = await reduzirFoto(f);
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
    if (!nome.trim()) return;
    setSalvando(true);
    try {
      let clienteId = tutorId;
      if (!clienteId) {
        if (!tutorNome.trim()) throw new Error("Diga o nome do tutor.");
        const novo = ok(await sb.from("clientes").insert({ petshop_id: petshop.id, nome: tutorNome.trim(), telefone: tutorFone.trim() || null }).select("id").single());
        clienteId = novo.id;
      }
      const campos = {
        nome: nome.trim(), especie, raca: raca.trim() || null, porte: porte || null, sexo: sexo || null,
        nascimento: nascimento || null, alertas: alertas.trim() || null, obs: obs.trim() || null, foto,
      };
      const salvo = pet
        ? ok(await sb.from("pets").update(campos).eq("id", pet.id).select("*, clientes(id, nome, telefone)").single())
        : ok(await sb.from("pets").insert({ ...campos, petshop_id: petshop.id, cliente_id: clienteId }).select("*, clientes(id, nome, telefone)").single());
      avisar(pet ? "Ficha atualizada." : `${campos.nome} foi cadastrado.`);
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
        <Campo rotulo="Nome do pet"><input className="g-input" required maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} autoFocus={!nome} /></Campo>

        {precisaTutor && (
          <div className="g-card areia g-form">
            <Campo rotulo="Tutor (dono do pet)" dica={tutorId ? undefined : "Se já for cliente, escolha na lista que aparece."}>
              <input className="g-input" required value={tutorNome} maxLength={120}
                onChange={(e) => { setTutorNome(e.target.value); setTutorId(null); }} />
            </Campo>
            {sugestoes.length > 0 && (
              <div className="g-chips">
                {sugestoes.map((c) => (
                  <button key={c.id} type="button" className="g-chip" onClick={() => { setTutorId(c.id); setTutorNome(c.nome); setTutorFone(c.telefone ?? ""); }}>{c.nome}</button>
                ))}
              </div>
            )}
            {tutorId ? <p className="g-pp g-muted">Cliente já cadastrado. O pet entra na ficha dele.</p> : (
              <Campo rotulo="WhatsApp do tutor"><input className="g-input" type="tel" inputMode="tel" placeholder="(11) 99999-9999" value={tutorFone} onChange={(e) => setTutorFone(e.target.value)} /></Campo>
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
        <Campo rotulo="Nascimento"><input className="g-input" type="date" value={nascimento} onChange={(e) => setNascimento(e.target.value)} /></Campo>
        <Campo rotulo="Cuidados e alertas" dica="Aparece em destaque na agenda. Ex.: alergia a shampoo, medo de secador, morde.">
          <textarea className="g-textarea" value={alertas} maxLength={400} onChange={(e) => setAlertas(e.target.value)} />
        </Campo>
        <Campo rotulo="Observações"><textarea className="g-textarea" value={obs} maxLength={600} onChange={(e) => setObs(e.target.value)} /></Campo>
      </form>
    </Folha>
  );
}
