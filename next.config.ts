import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
  },
  poweredByHeader: false,

  /**
   * Redirecionamentos permanentes (301) das versões antigas do domínio
   * (rede social e jornal). As URLs antigas seguem indexadas no Google; em vez
   * de 404, mandamos quem chega por elas para a página inicial da loja.
   */
  async redirects() {
    return [
      // linha Feed Pronto mudou para a área de negócios
      { source: "/feed-pronto", destination: "/negocios/feed-pronto", permanent: true },
      { source: "/feed-pronto/:pagina([a-z-]+)", destination: "/negocios/feed-pronto/:pagina", permanent: true }, // só páginas: as imagens continuam em /feed-pronto/<área>/...
      // link citado no PDF do Xixi ("Continue com o Mozart"); a página não existe, leva para a vitrine
      { source: "/adestramento", destination: "/tutor", permanent: false },

            // jornal (versão anterior)
      { source: "/noticias/:path*", destination: "/", permanent: true },
      { source: "/categoria/:path*", destination: "/", permanent: true },
      { source: "/animal/:path*", destination: "/", permanent: true },
      { source: "/autor/:path*", destination: "/", permanent: true },
      { source: "/redacao/:path*", destination: "/", permanent: true },
      { source: "/redacao", destination: "/", permanent: true },
      { source: "/principios-editoriais", destination: "/sobre", permanent: true },
      { source: "/creditos-de-imagem", destination: "/sobre", permanent: true },
      { source: "/rss.xml", destination: "/", permanent: true },
      { source: "/news-sitemap.xml", destination: "/sitemap.xml", permanent: true },
      { source: "/ler/:slug", destination: "/", permanent: true },
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
