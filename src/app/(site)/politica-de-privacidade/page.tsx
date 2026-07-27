import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: "Política de privacidade do Maestro Pet.",
  alternates: { canonical: "/politica-de-privacidade" },
};

export default function PrivacidadePage() {
  return (
    <div className="prose">
      <h1>Política de Privacidade</h1>
      <p>
        Esta Política de Privacidade descreve como o <strong>Maestro Pet</strong>{" "}
        (&ldquo;nós&rdquo;) trata as informações de quem visita este site, em conformidade
        com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).
      </p>

      <h2>1. Dados que coletamos</h2>
      <p>
        A leitura do jornal não exige cadastro. Coletamos apenas dados de
        navegação de forma automática e agregada (páginas visitadas, tipo de
        dispositivo e navegador), usados para medir audiência e melhorar o
        conteúdo.
      </p>

      <h2>2. Cookies e publicidade</h2>
      <p>
        Este site pode exibir anúncios fornecidos pelo <strong>Google AdSense</strong>.
        O Google e seus parceiros utilizam cookies para exibir anúncios com
        base em visitas anteriores a este e a outros sites. O cookie DART
        permite a veiculação de anúncios personalizados.
      </p>
      <ul>
        <li>
          Você pode desativar a publicidade personalizada nas{" "}
          <a href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer">
            Configurações de anúncios do Google
          </a>.
        </li>
        <li>
          Saiba mais sobre como o Google usa dados em{" "}
          <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer">
            policies.google.com/technologies/partner-sites
          </a>.
        </li>
      </ul>

      <h2>3. Compartilhamento de dados</h2>
      <p>
        Não vendemos nem compartilhamos dados pessoais com terceiros, exceto os
        dados de navegação processados automaticamente pelos serviços de
        medição de audiência e publicidade citados acima.
      </p>

      <h2>4. Seus direitos (LGPD)</h2>
      <p>
        Você pode solicitar informações sobre tratamento de dados, correção ou
        exclusão de dados pessoais escrevendo para{" "}
        <a href="mailto:contato@maestropet.com">contato@maestropet.com</a>.
      </p>

      <h2>5. Alterações desta política</h2>
      <p>
        Esta política pode ser atualizada periodicamente. A versão mais recente
        estará sempre disponível nesta página.
      </p>
    </div>
  );
}
