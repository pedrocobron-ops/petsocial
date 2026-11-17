"use client";

import { useState } from "react";
import { Download, ShieldCheck, UserX } from "lucide-react";
import { useGestao } from "@/components/gestao/contexto";
import { Tile } from "@/components/gestao/painel";
import { Campo, Folha, avisarMudanca, ok, useAvisos } from "@/components/gestao/ui";
import { baixarArquivo, textoCsv, type Cel } from "@/components/gestao/financeiro/comum";
import { dataCompleta, hora, isoDia, semAcento } from "@/lib/gestao/util";
import { montarZip } from "@/lib/gestao/zip";
import "./lgpd.css";

/** O que o banco devolve em `cliente_dados`: cada planilha já com as colunas e as linhas. */
type DadosDoTutor = { cliente: string; petshop: string; gerado_em: string; arquivos: { arquivo: string; explica: string; colunas: string[]; linhas: unknown[][] }[] };

const celula = (v: unknown): Cel => (v == null ? "" : typeof v === "number" ? { bruto: String(v).replace(".", ",") } : String(v));
const igual = (a: string, b: string) => semAcento(a.replace(/\s+/g, " ").trim()) === semAcento(b.replace(/\s+/g, " ").trim());

/** O .zip com os dados de um tutor: uma planilha por parte e o README.txt. Também usado pelos testes. */
export function zipDoTutor(d: DadosDoTutor, agora = new Date()) {
  const leiaMe = [
    "LEIA-ME · Dados de um cliente no Maestro Pet Gestão",
    `Cliente: ${d.cliente}`,
    `Pet shop: ${d.petshop}`,
    `Gerado em ${dataCompleta(agora)} às ${hora(agora)}.`,
    "",
    "Para responder ao pedido do cliente (LGPD, art. 18): tudo o que o pet shop guarda sobre ele e os pets dele no sistema.",
    "Cada arquivo .csv é uma planilha (UTF-8, ponto e vírgula entre as colunas). Abre no Excel e no Google Planilhas.",
    "",
    ...d.arquivos.map((a) => `${a.arquivo} (${a.linhas.length === 1 ? "1 linha" : `${a.linhas.length} linhas`})\r\n  ${a.explica}`),
    "",
    "As fotos não entram no arquivo. Valores em reais, sem o R$.",
    "",
  ].join("\r\n");
  return montarZip([
    { nome: "README.txt", conteudo: "﻿" + leiaMe },
    ...d.arquivos.map((a) => ({ nome: a.arquivo, conteudo: textoCsv([a.colunas, ...a.linhas.map((l) => l.map(celula))]) })),
  ], agora);
}

/**
 * Ficha do tutor, só para o dono: "Baixar os dados deste tutor" (para atender o pedido do cliente pela LGPD) e
 * "Apagar dados deste tutor" (anonimiza: o nome vira "Cliente removido" e o dinheiro fica, sem o nome).
 */
export default function DadosDoTutor({ cliente, pets, aoApagar }: { cliente: { id: string; nome: string }; pets: { nome: string }[]; aoApagar: () => void }) {
  const { sb } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const [baixando, setBaixando] = useState(false);
  const [apagando, setApagando] = useState(false);
  const removido = cliente.nome === "Cliente removido";

  async function baixar() {
    if (baixando) return;
    setBaixando(true);
    try {
      const d = ok(await sb.rpc("cliente_dados", { p_cliente: cliente.id })) as unknown as DadosDoTutor;
      const agora = new Date();
      const zip = zipDoTutor(d, agora);
      const apelido = semAcento(cliente.nome).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "cliente";
      baixarArquivo(new Blob([zip.buffer as ArrayBuffer], { type: "application/zip" }), `dados-${apelido}-${isoDia(agora)}.zip`);
      avisar("Dados do tutor baixados. Mande ao cliente por um canal seguro.");
    } catch (e) { avisarErro(e); } finally { setBaixando(false); }
  }

  return (
    <section className="g-card gl-tutor">
      <div className="g-card-t"><h3><Tile icone={ShieldCheck} tom="lilas" tamanho="p" />Dados deste tutor (LGPD)</h3></div>
      <p className="g-pp g-muted">O cliente pediu os dados dele, ou pediu para apagar? Baixe tudo em planilhas, ou apague os dados pessoais e mantenha só os valores para a contabilidade.</p>
      <div className="gl-tutor-acoes">
        <button type="button" className="g-btn sec" onClick={() => void baixar()} disabled={baixando}><Download />{baixando ? "Juntando…" : "Baixar os dados deste tutor"}</button>
        {!removido && <button type="button" className="g-btn perigo" onClick={() => setApagando(true)}><UserX />Apagar dados deste tutor</button>}
      </div>
      {apagando && <FolhaApagar cliente={cliente} pets={pets} aoFechar={() => setApagando(false)} aoApagar={() => { setApagando(false); avisarMudanca(); aoApagar(); }} />}
    </section>
  );
}

function FolhaApagar({ cliente, pets, aoFechar, aoApagar }: { cliente: { id: string; nome: string }; pets: { nome: string }[]; aoFechar: () => void; aoApagar: () => void }) {
  const { sb } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const [nome, setNome] = useState("");
  const [indo, setIndo] = useState(false);
  const certo = igual(nome, cliente.nome);

  async function apagar() {
    if (!certo || indo) return;
    setIndo(true);
    try {
      ok(await sb.rpc("cliente_anonimizar", { p_cliente: cliente.id, p_confirmacao: nome }));
      avisar("Dados do tutor apagados. Os valores continuam no financeiro, sem o nome.");
      aoApagar();
    } catch (e) { avisarErro(e); setIndo(false); }
  }

  return (
    <Folha titulo={`Apagar os dados de ${cliente.nome}?`} aoFechar={aoFechar}
      rodape={<>
        <button type="button" className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button type="button" className="g-btn perigo" onClick={() => void apagar()} disabled={!certo || indo}><UserX />{indo ? "Apagando…" : "Apagar os dados"}</button>
      </>}>
      <form className="g-pilha" onSubmit={(e) => { e.preventDefault(); void apagar(); }}>
        <div className="gl-confere">
          <b>O que acontece</b>
          <ul>
            <li>O nome vira &quot;Cliente removido&quot;. Telefone, e-mail, endereço e observações são apagados.</li>
            <li>{pets.length ? `${pets.map((p) => p.nome).join(", ")} ${pets.length === 1 ? "vira" : "viram"} "Pet removido"` : "Os pets viram \"Pet removido\""}, sem foto, saúde, contatos, boletins, álbum e autorizações de fotos.</li>
            <li>Os valores recebidos e a receber continuam no financeiro e nos relatórios, sem o nome do cliente.</li>
            <li>Não dá para desfazer. Se o cliente pediu os dados, baixe antes.</li>
          </ul>
        </div>
        <Campo rotulo={`Para confirmar, digite o nome do tutor: ${cliente.nome}`}>
          <input className="g-input" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" spellCheck={false} aria-label="Nome do tutor" />
        </Campo>
      </form>
    </Folha>
  );
}
