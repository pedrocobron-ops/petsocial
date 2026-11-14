"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock } from "lucide-react";
import { useGestao } from "./contexto";

/** Dia e hora "de parede" num fuso, como minutos desde 1970 (para comparar com a hora do aparelho). null se o fuso não existe. */
function paredeEm(fuso: string, d: Date): number | null {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d).map((x) => [x.type, x.value]));
    return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute)) / 60000;
  } catch { return null; }
}
const dois = (n: number) => String(n).padStart(2, "0");

/**
 * As telas mostram os horários e o "hoje" pela hora do aparelho; o banco faz as contas no fuso do pet shop
 * (`petshops.fuso`, que acompanha a UF). Quando os dois não batem (aparelho com o fuso errado, viagem, ou pet shop
 * sem o estado preenchido fora do horário de Brasília), a agenda aparece deslocada e o dia vira em horas diferentes.
 * Este aviso só aparece nesse caso, e diz o que conferir. "Entendi" esconde até a pessoa fechar o navegador.
 */
export default function AvisoDeFuso() {
  const { petshop, souDono } = useGestao();
  const [dif, setDif] = useState<{ horas: string; adiantado: boolean; la: string } | null>(null);
  const [visto, setVisto] = useState(false);
  useEffect(() => {
    const medir = () => {
      const agora = new Date();
      const la = paredeEm(petshop.fuso || "America/Sao_Paulo", agora);
      if (la == null) return setDif(null);
      const aqui = Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate(), agora.getHours(), agora.getMinutes()) / 60000;
      const min = Math.round(aqui - la);
      if (Math.abs(min) < 30) return setDif(null);
      const h = Math.floor(Math.abs(min) / 60), m = Math.abs(min) % 60;
      const x = new Date(la * 60000);
      setDif({ horas: m ? `${h}h${dois(m)}` : h === 1 ? "1 hora" : `${h} horas`, adiantado: min > 0, la: `${dois(x.getUTCHours())}:${dois(x.getUTCMinutes())}` });
    };
    medir();
    try { setVisto(sessionStorage.getItem("maestro:fuso-visto") === petshop.id); } catch { /* sem armazenamento: o aviso só não some */ }
    const relogio = setInterval(medir, 10 * 60_000);
    return () => clearInterval(relogio);
  }, [petshop.id, petshop.fuso]);
  if (!dif || visto) return null;
  return (
    <div className="g-aviso" role="alert">
      <Clock aria-hidden />
      <span className="g-cresce">
        <b>O relógio deste aparelho está {dif.horas} {dif.adiantado ? "na frente" : "atrás"} do horário do pet shop</b> (lá são {dif.la}).
        A agenda e o dia de hoje aparecem pela hora do aparelho, então podem sair deslocados. Acerte o fuso do aparelho
        {souDono ? <>, ou, se o pet shop fica em outro estado, confira o estado em <Link className="g-link" href="/gestao/app/meu-petshop">Meu pet shop</Link>, no cartão Dados.</> : ", ou peça para o dono conferir o estado em Meu pet shop."}
      </span>
      <button type="button" className="g-btn p sec" onClick={() => { setVisto(true); try { sessionStorage.setItem("maestro:fuso-visto", petshop.id); } catch { /* segue sem lembrar */ } }}>Entendi</button>
    </div>
  );
}
