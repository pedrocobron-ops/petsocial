"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/** Campo de senha com o botão de mostrar e esconder o que foi digitado. */
export default function CampoSenha({ valor, aoMudar, nova }: { valor: string; aoMudar: (v: string) => void; nova?: boolean }) {
  const [mostra, setMostra] = useState(false);
  return (
    <span className="g-senha">
      <input className="g-input" type={mostra ? "text" : "password"} autoComplete={nova ? "new-password" : "current-password"} required minLength={nova ? 8 : undefined}
        autoCapitalize="none" autoCorrect="off" spellCheck={false} value={valor} onChange={(e) => aoMudar(e.target.value)} />
      <button type="button" className="g-ico" aria-pressed={mostra} aria-label={mostra ? "Esconder a senha" : "Mostrar a senha"} title={mostra ? "Esconder a senha" : "Mostrar a senha"}
        onClick={() => setMostra(!mostra)}>{mostra ? <EyeOff /> : <Eye />}</button>
    </span>
  );
}
