"use client";

import { useEffect, useState } from "react";
import { CalendarDays, CalendarX, Cake, HandCoins, HeartPulse, MessageCircle, Receipt, Ticket, X } from "lucide-react";
import { linhasDoBomDia, type DadosDoBomDia, type LinhaDoBomDia } from "@/lib/gestao/bom-dia";
import { gerarContasFixas } from "@/lib/gestao/contas-fixas";
import { nomeDaCasa } from "@/lib/gestao/modulos";
import { isoDia, saudacao } from "@/lib/gestao/util";
import { useGestao } from "./contexto";
import { Selo } from "./marca";
import { guardarLembrado, lerLembrado } from "./lembrado";
import { abrirAssistente } from "./ui";
import "./bom-dia.css";

/**
 * "Bom dia" do Mozart: na primeira vez que a pessoa abre a tela Hoje no dia, um cartão curto (até 3 linhas) com o que importa,
 * tirado do banco por uma leitura só (`gestao_bom_dia`) e escrito sem IA (`linhasDoBomDia`). Respeita o papel: o banco só
 * entrega o que a pessoa pode ver (dinheiro só para quem tem área de dinheiro). Fecha pelo dia ("Dispensar por hoje").
 * Independente do resto da tela: não usa nem muda os dados que a tela Hoje carrega.
 *
 * "Primeira vez no dia": a marca fica no aparelho, por pessoa e por pet shop. Na mesma aba, o cartão continua até ser fechado;
 * numa abertura nova do aplicativo no mesmo dia, não volta.
 */
const ICONES: Record<LinhaDoBomDia["id"], React.ComponentType<{ "aria-hidden"?: boolean }>> = {
  dia: CalendarDays, devem: HandCoins, contas: Receipt, validade: CalendarX, vacinas: HeartPulse, pacotes: Ticket, niver: Cake,
};

/** "Bom dia!" de manhã, "Boa tarde!" à tarde, "Boa noite!" à noite (às 16h o cartão dizia "Bom dia!" embaixo de "Boa tarde"). */
export const saudacaoDaHora = (d: Date) => (d.getHours() < 12 ? "Bom dia!" : d.getHours() < 18 ? "Boa tarde!" : "Boa noite!");

export const chaveBomDia = (petshop: string, pessoa: string) => `maestro-gestao-bomdia-${petshop}-${pessoa}`;

function lerSessao(chave: string) { try { return sessionStorage.getItem(chave); } catch { return null; } }
function guardarSessao(chave: string, v: string) { try { sessionStorage.setItem(chave, v); } catch { /* sem armazenamento: só não lembra */ } }

export default function BomDia() {
  const { sb, petshop, eu, cuidoDoFinanceiro } = useGestao();
  const [linhas, setLinhas] = useState<LinhaDoBomDia[] | null>(null);
  const [fechado, setFechado] = useState(false);
  const chave = chaveBomDia(petshop.id, eu.id);
  const hoje = isoDia(new Date());

  useEffect(() => {
    // já fechou hoje, ou já viu hoje numa abertura anterior do aplicativo: não aparece (nem pergunta ao banco)
    const marca = lerLembrado(chave);
    if (marca === `${hoje}:fechado` || (marca === `${hoje}:visto` && lerSessao(chave) !== hoje)) { setFechado(true); return; }
    let vivo = true;
    void (async () => {
      // contas fixas: a conta do mês entra em A pagar antes do resumo ler (só quem cuida do financeiro; os outros não veem)
      if (cuidoDoFinanceiro) await gerarContasFixas(sb, petshop.id);
      const r = await sb.rpc("gestao_bom_dia", { p: petshop.id });
      if (!vivo || r.error || !r.data) return; // sem o resumo, a tela segue igual
      const l = linhasDoBomDia(r.data as unknown as DadosDoBomDia, { horario: petshop.horario, nomeDaCasa: nomeDaCasa(petshop) });
      setLinhas(l);
      if (l.length) { guardarLembrado(chave, `${hoje}:visto`); guardarSessao(chave, hoje); }
    })();
    return () => { vivo = false; };
  }, [petshop.id, eu.id, hoje]); // eslint-disable-line react-hooks/exhaustive-deps

  if (fechado || !linhas?.length) return null;
  function dispensar() {
    guardarLembrado(chave, `${hoje}:fechado`);
    setFechado(true);
  }
  return (
    <section className="g-bomdia" aria-label="Bom dia do Mozart" data-teste="bom-dia">
      <div className="g-bomdia-cab">
        <Selo tamanho={30} tom="verde" />
        <h2>{saudacaoDaHora(new Date())} O que importa hoje</h2>
        <button type="button" className="g-ico fechar" aria-label="Dispensar o resumo por hoje" title="Dispensar por hoje" onClick={dispensar}><X /></button>
      </div>
      <ul>
        {linhas.map((l) => {
          const Icone = ICONES[l.id];
          return <li key={l.id} data-linha={l.id}><Icone aria-hidden />{l.texto}</li>;
        })}
      </ul>
      <button type="button" className="g-btn p fantasma" onClick={() => abrirAssistente(`${saudacao()}, Mozart! O que tenho de mais importante hoje?`)}><MessageCircle />Perguntar ao Mozart</button>
    </section>
  );
}
