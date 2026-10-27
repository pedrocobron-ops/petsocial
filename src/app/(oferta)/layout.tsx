/** Páginas do pós-compra: sem menu nem rodapé, para o cliente decidir sem distração. */
export default function OfertaLayout({ children }: { children: React.ReactNode }) {
  return <main className="pc-pg">{children}</main>;
}
