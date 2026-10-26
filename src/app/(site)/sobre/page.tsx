import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Instagram, Mail, MessageCircle } from "lucide-react";
import { Seta } from "@/components/icones";
import { EMPRESA, linkInstagram, linkWhatsapp } from "@/lib/empresa";
import { PRODUTOS, linhaDe } from "@/lib/produtos";

export const metadata: Metadata = {
  title: "Quem faz",
  description: "O Maestro Pet faz guias práticos para tutores de cães e gatos e manuais para quem trabalha no mercado pet. Só o que dá para provar.",
  alternates: { canonical: "/sobre" },
};

/** O método em 4 pilares (o mesmo "Como fazemos" da home). */
const PILARES = [
  ["Pesquisa com fonte e data", "Leis, preços e dados vêm de órgãos oficiais e entidades do setor, citados no próprio material."],
  ["Reforço positivo, veterinário primeiro", "Nada de castigo. Quando pode ser saúde, o guia manda procurar o veterinário."],
  ["Sem depoimento inventado", "Preferimos mostrar as páginas de verdade a inventar elogios."],
  ["7 dias para desistir", "Se não valer a pena, o dinheiro volta pelo mesmo meio do pagamento."],
] as const;

/**
 * /sobre (brief 20, 7.10): hero só tipográfico enquanto não houver retrato real (nunca moldura vazia),
 * 3 fatos reais, os 4 pilares, onde nos encontrar, identificação em bloco suave e o Mozart acenando só no fim.
 */
export default function SobrePage() {
  const f = EMPRESA.fundador;
  const wa = linkWhatsapp();
  const ig = linkInstagram();
  const aVenda = PRODUTOS.filter((p) => p.lancado).length;
  const tutores = PRODUTOS.filter((p) => linhaDe(p) === "tutor").length;
  const manuais = PRODUTOS.filter((p) => linhaDe(p) === "negocios").length;
  const fatos: [string, string][] = [
    [String(aVenda), aVenda === 1 ? "guia à venda hoje" : "guias à venda hoje"],
    [String(tutores + manuais), `guias, kits e manuais, à venda ou em preparo (${manuais} para negócios pet)`],
    ["7 dias", "para desistir de qualquer compra"],
  ];
  const identificacao: [string, string][] = [
    ["Marca", EMPRESA.marca],
    ...(EMPRESA.razaoSocial ? [["Razão social", EMPRESA.razaoSocial] as [string, string]] : []),
    ...(EMPRESA.cnpj ? [["CNPJ", EMPRESA.cnpj] as [string, string]] : []),
    ...(EMPRESA.endereco ? [["Endereço", EMPRESA.endereco] as [string, string]] : []),
    ["E-mail", EMPRESA.email],
    ["Pagamentos", "processados pela Cakto, plataforma brasileira de pagamento"],
  ];
  return (
    <>
      <section className="hero hero-inst">
        <div className="container">
          <div className="hero-texto">
            <span className="rotulo">Quem faz</span>
            <h1>Um tutor, um border collie <em>e uma regra.</em></h1>
            <p className="lead">A regra: só o que dá para provar. Fazemos guias para quem tem cão ou gato e manuais para quem trabalha com eles.</p>
            {f.nome && <p className="inst-assina">{f.nome}, {f.papel}</p>}
          </div>
          <ul className="inst-fatos">
            {fatos.map(([n, t]) => <li key={t} className="rv"><b className="num">{n}</b><span>{t}</span></li>)}
          </ul>
        </div>
      </section>

      <section className="secao" aria-labelledby="metodo-titulo">
        <div className="container">
          <div className="cab rv">
            <span className="rotulo">Como fazemos</span>
            <h2 id="metodo-titulo">Só o que dá <em>para provar.</em></h2>
          </div>
          <ol className="pilares-n">
            {PILARES.map(([t, d], i) => (
              <li key={t} className="rv"><span aria-hidden>{String(i + 1).padStart(2, "0")}</span><b>{t}</b><p>{d}</p></li>
            ))}
          </ol>
          <div className="botoes inst-botoes">
            <Link className="btn btn-secundario" href="/tutor">Ver os guias<Seta /></Link>
            <Link className="btn btn-secundario" href="/negocios">Ver os manuais<Seta /></Link>
          </div>
        </div>
      </section>

      <section className="secao" aria-labelledby="encontrar-titulo">
        <div className="container inst-grid">
          <div className="cab rv">
            <span className="rotulo">Onde nos encontrar</span>
            <h2 id="encontrar-titulo">Fale com <em>a gente.</em></h2>
            <p>Respondemos em até 2 dias úteis.</p>
          </div>
          <ul className="canais">
            {ig && <li className="rv"><Instagram size={20} strokeWidth={1.75} aria-hidden /><div><b>Instagram</b><a href={ig} rel="noopener noreferrer">@{EMPRESA.instagram}</a></div></li>}
            <li className="rv"><Mail size={20} strokeWidth={1.75} aria-hidden /><div><b>E-mail</b><a className="canal-email" href={`mailto:${EMPRESA.email}`}>{EMPRESA.email}</a></div></li>
            {wa && <li className="rv"><MessageCircle size={20} strokeWidth={1.75} aria-hidden /><div><b>WhatsApp</b><a className="btn btn-secundario btn-pq" href={wa}>Chamar no WhatsApp</a></div></li>}
          </ul>
        </div>
      </section>

      <section className="secao bloco-suave" aria-labelledby="id-titulo">
        <div className="container inst-grid">
          <div className="cab rv">
            <span className="rotulo">Identificação</span>
            <h2 id="id-titulo">Quem <em>vende.</em></h2>
          </div>
          <div className="inst-id rv">
            <dl>
              {identificacao.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
            </dl>
            <Image className="inst-mozart" src="/mozart/acenando.webp" alt="Mozart, o border collie do Maestro Pet, acenando" width={160} height={160} sizes="160px" />
          </div>
        </div>
      </section>
    </>
  );
}
