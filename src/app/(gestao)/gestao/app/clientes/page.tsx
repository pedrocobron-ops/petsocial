"use client";

import { Suspense, useCallback, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Esqueleto } from "@/components/gestao/ui";
import { BASE } from "@/components/gestao/clientes/comum";
import FichaPet from "@/components/gestao/clientes/ficha-pet";
import FichaTutor from "@/components/gestao/clientes/ficha-tutor";
import Lista from "@/components/gestao/clientes/lista";
import "./clientes.css";

/** Caminho percorrido dentro desta tela, para o "Voltar" saber se pode usar o voltar do navegador. */
let caminho: string[] = [];

function Tela() {
  const router = useRouter();
  const params = useSearchParams();
  const pet = params.get("pet");
  const cliente = params.get("cliente");
  const chave = pet ? `pet:${pet}` : cliente ? `cliente:${cliente}` : "lista";
  const rolagem = useRef(0);

  useEffect(() => {
    // voltou um passo (botão do celular ou do navegador): encurta o caminho; senão, anda para a frente
    if (caminho.length >= 2 && caminho[caminho.length - 2] === chave) caminho = caminho.slice(0, -1);
    else if (caminho[caminho.length - 1] !== chave) caminho = [...caminho, chave];
    // a ficha abre no topo; a lista volta para onde estava
    window.scrollTo(0, chave === "lista" ? rolagem.current : 0);
  }, [chave]);
  useEffect(() => () => { caminho = []; }, []);

  const guardarRolagem = useCallback(() => { rolagem.current = window.scrollY; }, []);
  const irPara = useCallback((url: string) => router.push(url, { scroll: false }), [router]);
  const voltar = useCallback(() => {
    if (caminho.length > 1) router.back();
    else router.replace(BASE, { scroll: false });
  }, [router]);
  const sairDaFicha = useCallback(() => {
    caminho = [];
    rolagem.current = 0;
    router.replace(BASE, { scroll: false });
  }, [router]);

  return (
    <>
      {/* a lista fica montada por baixo da ficha: busca, filtro e posição continuam como estavam */}
      <div hidden={chave !== "lista"}>
        <Lista aoAbrir={guardarRolagem} irPara={irPara} />
      </div>
      {pet ? <FichaPet key={pet} id={pet} voltar={voltar} />
        : cliente ? <FichaTutor key={cliente} id={cliente} voltar={voltar} aoExcluir={sairDaFicha} /> : null}
    </>
  );
}

export default function Clientes() {
  return (
    <Suspense fallback={<Esqueleto linhas={6} />}>
      <Tela />
    </Suspense>
  );
}
