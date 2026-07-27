import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
    formats: ["image/avif", "image/webp"],
  },
  poweredByHeader: false,

  /**
   * Redirecionamentos permanentes (301) das rotas do app antigo.
   * O jornal herdou o domínio de um aplicativo de rede social cujas matérias
   * viviam em /ler/[slug]. Essas URLs já estão indexadas no Google, então
   * apontamos cada uma para o novo endereço em vez de devolver 404, o que
   * preserva a autoridade acumulada e evita erro para quem vem da busca.
   */
  async redirects() {
    return [
      // matérias do portal antigo
      { source: "/ler/:slug", destination: "/noticias/:slug", permanent: true },
      { source: "/jornal", destination: "/", permanent: true },
      { source: "/jornal/:path*", destination: "/", permanent: true },

      // telas do aplicativo de rede social (não existem mais)
      { source: "/feed", destination: "/", permanent: true },
      { source: "/descobrir", destination: "/", permanent: true },
      { source: "/perfil", destination: "/", permanent: true },
      { source: "/perfil/:path*", destination: "/", permanent: true },
      { source: "/pet/:path*", destination: "/", permanent: true },
      { source: "/post/:path*", destination: "/", permanent: true },
      { source: "/meetup/:path*", destination: "/", permanent: true },
      { source: "/meetups", destination: "/", permanent: true },
      { source: "/lugares", destination: "/", permanent: true },
      { source: "/lugares/:path*", destination: "/", permanent: true },
      { source: "/sign-in", destination: "/", permanent: true },
      { source: "/sign-up", destination: "/", permanent: true },
      { source: "/onboarding", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
