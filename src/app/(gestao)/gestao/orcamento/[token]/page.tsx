import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarClock, Check, FileText, MessageCircle, Package, Scissors } from "lucide-react";
import LogoLoja from "@/components/gestao/logo-loja";
import { corPropria, TEMAS } from "@/lib/gestao/identidade";
import { lerOrcamento } from "@/lib/gestao/orcamento-servidor";
import { STATUS_ORCAMENTO, textoQueroFechar } from "@/lib/gestao/orcamento";
import { brl, linkWhatsApp, centavos } from "@/lib/gestao/util";
import "../../agendar/[codigo]/agendar.css";
import "./orcamento.css";

/**
 * Orçamento: a página que o cliente abre pelo link do WhatsApp (sem login). O servidor lê pela função `orcamento_publico`
 * (só com o código certo e a conta liberada; no máximo 60 aberturas por minuto). Mostra a loja, os itens, o total e a
 * validade; "Quero fechar" abre o WhatsApp do pet shop com a mensagem pronta. Fora do Google.
 */
export const dynamic = "force-dynamic";

const fmtQtd = (n: number) => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const o = await lerOrcamento(token);
  const base: Metadata = { robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer" };
  if (!o || o === "devagar") return { ...base, title: "Orçamento" };
  const titulo = `Orçamento nº ${o.numero} · ${o.petshop.nome}`;
  return { ...base, title: { absolute: titulo }, description: `Total ${brl(o.total)}.`, openGraph: { title: titulo, description: `Total ${brl(o.total)}.`, siteName: o.petshop.nome, locale: "pt_BR" } };
}

export default async function Orcamento({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const o = await lerOrcamento(token);
  if (!o) notFound();
  if (o === "devagar") {
    return <div className="g-raiz g-op"><main className="g-lk-miolo"><p className="g-op-vazio" role="status">Este orçamento foi aberto muitas vezes no último minuto. Espere um minuto e abra de novo.</p></main></div>;
  }
  const fuso = o.petshop.fuso || "America/Sao_Paulo";
  const dia = (iso: string) => new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: iso.length === 10 ? "UTC" : fuso }).format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso));
  const propria = corPropria(o.petshop.tema);
  const tema = !propria && o.petshop.tema && o.petshop.tema !== "floresta" && TEMAS.some((t) => t.id === o.petshop.tema) ? o.petshop.tema : undefined;
  const estilo = propria ? ({ "--tema": propria.tema, "--destaque": propria.destaque } as React.CSSProperties) : undefined;
  const onde = [o.petshop.cidade, o.petshop.uf].filter(Boolean).join(" · ");
  const status = STATUS_ORCAMENTO[o.status] ?? STATUS_ORCAMENTO.aberto;
  const valendo = o.status === "aberto" || o.status === "aceito";
  const zap = linkWhatsApp(o.petshop.telefone, valendo ? textoQueroFechar(o.numero, o.total) : `Oi! Vi o orçamento nº ${o.numero} (${brl(o.total)}). Ainda dá para fechar?`);

  return (
    <div className="g-raiz g-op" data-tema={tema} style={estilo}>
      <main className="g-lk-miolo">
        <header className="g-op-cab">
          <div className="g-op-loja">
            <LogoLoja nome={o.petshop.nome} logo={o.petshop.logo} tamanho={44} />
            <div>
              <b>{o.petshop.nome}</b>
              {onde && <span>{onde}</span>}
            </div>
          </div>
          <p className="g-op-sobre"><FileText aria-hidden />Orçamento nº {o.numero}</p>
          <h1>{o.para ? `Para ${o.para}` : "Seu orçamento"}</h1>
          <p className="g-op-quando">
            <span className={`g-op-selo ${o.status}`}>{o.status === "convertido" ? <Check aria-hidden /> : <CalendarClock aria-hidden />}{status.rotulo}</span>
            <span>{o.status === "vencido" ? `Venceu em ${dia(o.validade)}` : o.status === "convertido" ? "Já fechado com a loja" : `Vale até ${dia(o.validade)}`}</span>
          </p>
        </header>

        <section className="g-op-bloco" aria-label="Itens do orçamento">
          <ul className="g-op-itens">
            {o.itens.map((i, n) => (
              <li key={n}>
                <span className="ico" aria-hidden>{i.tipo === "servico" ? <Scissors /> : <Package />}</span>
                <span className="t"><b>{i.nome}</b>{i.qtd !== 1 && <small>{fmtQtd(i.qtd)} × {brl(i.valor)}</small>}</span>
                <b className="v">{brl(centavos(i.qtd * i.valor))}</b>
              </li>
            ))}
          </ul>
          <dl className="g-op-conta">
            {o.desconto > 0 && <div><dt>Soma</dt><dd>{brl(o.subtotal)}</dd></div>}
            {o.desconto > 0 && <div><dt>Desconto</dt><dd>− {brl(o.desconto)}</dd></div>}
            <div className="total"><dt>Total</dt><dd>{brl(o.total)}</dd></div>
          </dl>
          {o.obs && <p className="g-op-obs">{o.obs}</p>}
        </section>

        <div className="g-op-acoes">
          {zap && <a className="g-btn zap cheio" href={zap} target="_blank" rel="noopener noreferrer"><MessageCircle />{valendo ? "Quero fechar" : `Falar com ${o.petshop.nome}`}</a>}
          {!zap && <p className="g-op-vazio">Para fechar, fale com {o.petshop.nome}.</p>}
        </div>
      </main>
      <footer className="g-lk-rodape">
        <span>Orçamento feito em {dia(o.criado_em)}. Os valores podem mudar depois da validade.</span>
        <a href="/gestao/privacidade">Privacidade</a>
      </footer>
    </div>
  );
}
