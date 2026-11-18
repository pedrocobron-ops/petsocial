"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { mensagemDeValidacao, TEXTO_SEM_INTERNET } from "@/lib/gestao/validacao";

type ComValidade = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
const ehCampo = (el: EventTarget | null): el is ComValidade =>
  el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement;

/**
 * O balão do navegador para campo obrigatório ou fora do formato sai em português, no app inteiro e nas páginas do cliente
 * ("Preencha este campo." no lugar de "Please fill out this field."). Campo com mensagem própria (setCustomValidity da tela)
 * fica como está. Ao digitar, a mensagem sai e o navegador confere de novo.
 */
function useValidacaoEmPortugues() {
  useEffect(() => {
    const nossas = new WeakSet<ComValidade>();
    const invalido = (ev: Event) => {
      const el = ev.target;
      if (!ehCampo(el)) return;
      // mensagem que a própria tela pôs: não troca
      if (el.validity.customError && !nossas.has(el)) return;
      if (nossas.has(el)) el.setCustomValidity("");
      if (el.validity.valid) return;
      const c = el as HTMLInputElement;
      el.setCustomValidity(mensagemDeValidacao(el.validity, { type: c.type, min: c.min, max: c.max, minLength: c.minLength, maxLength: c.maxLength, tagName: el.tagName }));
      nossas.add(el);
    };
    const mudou = (ev: Event) => {
      const el = ev.target;
      if (ehCampo(el) && nossas.has(el)) { el.setCustomValidity(""); nossas.delete(el); }
    };
    document.addEventListener("invalid", invalido, true);
    document.addEventListener("input", mudou, true);
    document.addEventListener("change", mudou, true);
    return () => {
      document.removeEventListener("invalid", invalido, true);
      document.removeEventListener("input", mudou, true);
      document.removeEventListener("change", mudou, true);
    };
  }, []);
}

/**
 * Faixa no alto da tela enquanto o aparelho está sem internet: a pessoa sabe antes de tocar em salvar. Some sozinha quando
 * a conexão volta. Lida só com o que o navegador diz (navigator.onLine); quando ele erra, os avisos de erro dizem o resto.
 */
function AvisoSemInternet() {
  const [fora, setFora] = useState(false);
  useEffect(() => {
    const ver = () => setFora(navigator.onLine === false);
    ver();
    window.addEventListener("online", ver);
    window.addEventListener("offline", ver);
    return () => { window.removeEventListener("online", ver); window.removeEventListener("offline", ver); };
  }, []);
  if (!fora) return null;
  return (
    <div className="g-sem-internet" role="status" aria-live="polite">
      <WifiOff aria-hidden />
      <span>{TEXTO_SEM_INTERNET}</span>
    </div>
  );
}

/** Vigias do app inteiro: validação em português e o aviso de sem internet. */
export function Robustez() {
  useValidacaoEmPortugues();
  return <AvisoSemInternet />;
}
