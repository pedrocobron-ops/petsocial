import { Marca } from "@/components/gestao/marca";

/**
 * Logo do Maestro Pet: a marca em traço (rosto de border collie) + "Maestro Pet" em Fraunces.
 * Verde-garrafa, com "Pet" em itálico, igual ao site do Maestro Pet Gestão. Sem laranja: o laranja fica só no botão principal.
 * `clara` é a variante para fundo escuro. `prioridade` e `preguicosa` ficaram por compatibilidade (a logo agora é SVG no HTML).
 */
export default function Logo({ clara = false, negocios = false }: { clara?: boolean; negocios?: boolean; prioridade?: boolean; preguicosa?: boolean }) {
  return (
    <span className={`logo-marca${clara ? " logo-clara" : ""}${negocios ? " logo-verde" : ""}`}>
      <Marca tamanho={32} className="logo-desenho" />
      <span className="logo-nome">Maestro <em>Pet</em></span>
      {negocios && <span className="logo-sufixo">Negócios</span>}
    </span>
  );
}
