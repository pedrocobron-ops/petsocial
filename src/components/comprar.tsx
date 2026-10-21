import type { Produto } from "@/lib/produtos";

/** Botão de compra: leva ao checkout da Cakto, ou mostra "Em breve" se ainda não houver link. */
export default function Comprar({ produto, texto = "Quero o guia agora", grande = false }: { produto: Produto; texto?: string; grande?: boolean }) {
  const cls = `btn${grande ? " btn-lg" : ""}`;
  if (!produto.checkout) {
    return <span className={`${cls} btn-off`} aria-disabled="true">Em breve</span>;
  }
  return (
    <a className={cls} href={produto.checkout} rel="nofollow">
      {texto}
    </a>
  );
}
