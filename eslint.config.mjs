// ESLint do projeto (roda no CI a cada pull request: .github/workflows/ci.yml; na máquina: `npm run lint`).
// Regras do Next (inclui as dos hooks do React). `react-hooks/exhaustive-deps` fica como aviso: a lista de dependências de
// um efeito é conferida, mas não derruba o CI (os comentários `eslint-disable` que existem dizem por que cada um ficou de fora).
import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  { ignores: [".next/**", "node_modules/**", "public/**", "supabase/**", "testes/**", "scripts/**", "docs/**", "next-env.d.ts", "src/lib/gestao/banco.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // dependência de efeito: aviso (o CI mostra, não derruba)
      "react-hooks/exhaustive-deps": "warn",
      // páginas públicas e o site usam <a> de propósito (navegação inteira, sem baixar o aplicativo antes)
      "@next/next/no-html-link-for-pages": "off",
      // conversões do tipo gerado do banco e respostas do Supabase: ficam como aviso, para não esconder o que importa
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
      "@typescript-eslint/no-unused-expressions": ["error", { allowShortCircuit: true, allowTernary: true }],
      "react/no-unescaped-entities": "off",
    },
  },
];

export default config;
