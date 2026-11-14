"use client";

import { useEffect, useRef, useState } from "react";
import { HandCoins } from "lucide-react";
import { MARCAS_DO_MODELO, mensagemDeDivida, MODELO_COBRANCA, multaSugerida, OPCOES_DINHEIRO as K, opcoesDeCobranca, opcoesDeComissao, travaDePreco } from "@/lib/gestao/dinheiro-opcoes";
import { salvarOpcoes } from "@/lib/gestao/opcoes";
import { usaModulo } from "@/lib/gestao/modulos";
import { brl, isoDia, somaDias } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { CampoDinheiro } from "../loja/pecas";
import { Tile } from "../painel";
import { avisarMudanca, Campo, Folha, useAvisos, useDados, useSomenteLeitura } from "../ui";
import "../financeiro/recebimentos.css";

/** "7,5" em número entre 0 e 100; vazio vira 0; null quando não é um percentual. */
function lerPct(texto: string): number | null {
  const t = texto.trim().replace(",", ".");
  if (!t) return 0;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : null;
}
const pctTexto = (n: number) => (n > 0 ? String(n).replace(".", ",") : "");
const soPct = (s: string) => s.replace(/[^\d,.]/g, "").slice(0, 6);

function Chave({ titulo, apoio, ligado, aoMudar, desligado, nome }: { titulo: string; apoio: string; ligado: boolean; aoMudar: () => void; desligado?: boolean; nome: string }) {
  return (
    <div className="gr-op-chave">
      <div><b>{titulo}</b><span>{apoio}</span></div>
      <button type="button" role="switch" aria-checked={ligado} aria-label={nome} className="g-mp-chave" disabled={desligado} onClick={aoMudar}><i /></button>
    </div>
  );
}

/**
 * Opções de cobrança (Meu pet shop): multa e juros por atraso, chave Pix, modelo da mensagem de cobrança
 * e as regras de comissão. Tudo começa desligado: o pet shop que não mexer aqui continua como sempre foi.
 */
export default function OpcoesDeCobranca() {
  const { sb, petshop, recarregarBase } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const o = opcoesDeCobranca(petshop), c = opcoesDeComissao(petshop);
  const [fixa, setFixa] = useState<number | null>(o.multaFixa > 0 ? o.multaFixa : null);
  const [pct, setPct] = useState(pctTexto(o.multaPct));
  const [juros, setJuros] = useState(pctTexto(o.jurosMesPct));
  const [pix, setPix] = useState(o.pix);
  const [modelo, setModelo] = useState(o.modelo.trim() || MODELO_COBRANCA);
  const [prodPct, setProdPct] = useState(pctTexto(c.produtosPct));
  const trava = travaDePreco(petshop);
  const [descMax, setDescMax] = useState(pctTexto(trava.descontoMax));
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [porServico, setPorServico] = useState(false);
  const raiz = useRef<HTMLElement>(null);
  // atalho vindo do Financeiro: /gestao/app/meu-petshop#opcoes-cobranca
  useEffect(() => { if (window.location.hash === "#opcoes-cobranca") raiz.current?.scrollIntoView({ block: "start" }); }, []);

  async function gravar(mudancas: Record<string, unknown>, aviso: string) {
    if (somenteLeitura() || ocupado) return;
    setOcupado(true);
    try {
      await salvarOpcoes(sb, petshop.id, mudancas);
      await recarregarBase();
      avisarMudanca();
      avisar(aviso);
    } catch (e) { avisarErro(e); } finally { setOcupado(false); }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const p = lerPct(pct), j = lerPct(juros), pp = lerPct(prodPct);
    if (p === null || j === null) { setErro("A multa e os juros em % ficam entre 0 e 100."); return; }
    if (pp === null) { setErro("A comissão sobre produtos fica entre 0 e 100%."); return; }
    const dm = lerPct(descMax);
    if (dm === null) { setErro("O desconto máximo do caixa fica entre 0 e 100%."); return; }
    if (fixa != null && (fixa < 0 || fixa > 99999.99)) { setErro("Confira a multa em reais."); return; }
    const texto = modelo.trim();
    if (texto && !texto.includes("{contas}")) { setErro("A mensagem precisa ter {contas}: é onde entra a lista do que o cliente deve."); return; }
    setErro(null);
    await gravar({
      [K.multaFixa]: fixa ?? 0, [K.multaPct]: p, [K.jurosMesPct]: j, [K.pix]: pix.trim().slice(0, 120),
      [K.modelo]: !texto || texto === MODELO_COBRANCA ? "" : texto.slice(0, 1200), [K.comissaoProdutosPct]: pp, [K.descontoMaxCaixa]: dm,
    }, "Opções salvas.");
  }

  // exemplo com a regra que está na tela (ainda não salva): conta de R$ 100,00 vencida há 15 dias
  const hoje = isoDia(new Date());
  const rascunho = { opcoes: { ...(petshop.opcoes as object), [K.multa]: true, [K.multaFixa]: fixa ?? 0, [K.multaPct]: lerPct(pct) ?? 0, [K.jurosMesPct]: lerPct(juros) ?? 0, [K.pix]: pix, [K.modelo]: modelo } };
  const exemplo = multaSugerida(rascunho, { valor: 100, vencimento: isoDia(somaDias(new Date(), -15)) }, hoje);
  const previa = mensagemDeDivida({ ...rascunho, opcoes: { ...rascunho.opcoes, [K.multa]: o.multa }, nome: petshop.nome }, "Ana", [
    { valor: 70, valor_original: 120, descricao: "Banho · Nina", categoria: "Banho e tosa", vencimento: isoDia(somaDias(new Date(), -3)) },
  ], hoje);

  return (
    <section className="g-card g-pilha" id="opcoes-cobranca" ref={raiz}>
      <div className="g-mp-t">
        <Tile icone={HandCoins} tom="manteiga" />
        <div><h2>Opções de cobrança</h2><p className="g-muted g-p">Para quem vende fiado ou paga comissão. Ligue só o que você usa: desligado, nada muda.</p></div>
      </div>
      <form className="gr-op" onSubmit={salvar}>
        <div className="gr-op-bloco">
          <Chave nome="Multa e juros por atraso" titulo="Multa e juros por atraso" ligado={o.multa} desligado={ocupado}
            apoio="A conta atrasada mostra o valor atualizado sugerido. Só entra no recebimento se quem recebe somar, e dá para mudar ou tirar."
            aoMudar={() => void gravar({ [K.multa]: !o.multa }, o.multa ? "Multa e juros desligados." : "Multa e juros ligados. Defina os valores e salve.")} />
          {o.multa && (
            <>
              <div className="gr-op-tres">
                <Campo rotulo="Multa em reais (uma vez)"><CampoDinheiro valor={fixa} aoMudar={setFixa} rotulo="Multa em reais" /></Campo>
                <Campo rotulo="Multa em % (uma vez)"><input className="g-input g-tab" inputMode="decimal" placeholder="0" value={pct} aria-label="Multa em por cento" onChange={(e) => setPct(soPct(e.target.value))} /></Campo>
                <Campo rotulo="Juros em % ao mês"><input className="g-input g-tab" inputMode="decimal" placeholder="0" value={juros} aria-label="Juros em por cento ao mês" onChange={(e) => setJuros(soPct(e.target.value))} /></Campo>
              </div>
              <p className="g-muted g-pp">
                {exemplo
                  ? `Exemplo: uma conta de ${brl(100)} vencida há 15 dias ficaria ${brl(100 + exemplo.total)} (${brl(exemplo.multa)} de multa e ${brl(exemplo.juros)} de juros). Os juros contam por dia de atraso.`
                  : "Preencha pelo menos um dos três campos. Em branco, não há multa nem juros."}
              </p>
              <label className="g-check">
                <input type="checkbox" checked={o.multaNaMensagem} disabled={ocupado} onChange={() => void gravar({ [K.multaNaMensagem]: !o.multaNaMensagem }, o.multaNaMensagem ? "A mensagem não mostra mais a multa." : "A mensagem de cobrança vai mostrar a multa e os juros.")} />
                Mostrar a multa e os juros na mensagem de cobrança
              </label>
            </>
          )}
        </div>

        <div className="gr-op-bloco">
          <Campo rotulo="Chave Pix (se quiser)" dica="Aparece no fim da mensagem de cobrança. Em branco, não aparece.">
            <input className="g-input" value={pix} maxLength={120} placeholder="Ex.: celular, CNPJ ou e-mail" onChange={(e) => setPix(e.target.value)} />
          </Campo>
          <Campo rotulo="Mensagem de cobrança" dica={`O sistema troca ${MARCAS_DO_MODELO.map((m) => `${m.marca} por ${m.oQue}`).join("; ")}. Quem manda é sempre você, pelo WhatsApp.`}>
            <textarea className="g-textarea" rows={7} maxLength={1200} value={modelo} onChange={(e) => setModelo(e.target.value)} aria-label="Modelo da mensagem de cobrança" />
          </Campo>
          {modelo.trim() !== MODELO_COBRANCA && <div><button type="button" className="g-btn fantasma p" onClick={() => setModelo(MODELO_COBRANCA)}>Voltar ao modelo padrão</button></div>}
          <details>
            <summary className="g-muted g-pp" style={{ cursor: "pointer" }}>Ver como fica (exemplo)</summary>
            <p className="g-p" style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{previa}</p>
          </details>
        </div>

        <div className="gr-op-bloco">
          <div><b>Preço e desconto na venda</b><p className="g-muted g-pp">Toda venda com preço diferente da lista ou com desconto fica anotada (quem vendeu, de quanto para quanto) e aparece para você na tela Hoje. Isso vale sempre, sem ligar nada.</p></div>
          <Chave nome="Só o dono e quem vê o financeiro mudam preço ou dão desconto" titulo="Só o dono e quem vê o financeiro mudam preço ou dão desconto" ligado={trava.ligada} desligado={ocupado}
            apoio="Quem só opera o caixa vende pelo preço da lista: produto, serviço do horário e pacote. Desligado, qualquer pessoa que recebe pode mudar o preço (e fica anotado)."
            aoMudar={() => void gravar({ [K.precoTravado]: !trava.ligada }, trava.ligada ? "Preço liberado para quem recebe. As mudanças continuam anotadas." : "Preço travado para quem só opera o caixa.")} />
          {trava.ligada && (
            <Campo rotulo="Desconto máximo que o caixa pode dar (%)" dica="Em branco ou zero, o caixa não dá desconto nenhum. O dono e quem vê o financeiro não têm limite.">
              <input className="g-input g-tab" style={{ maxWidth: 140 }} inputMode="decimal" placeholder="0" value={descMax} aria-label="Desconto máximo do caixa em por cento" onChange={(e) => setDescMax(soPct(e.target.value))} />
            </Campo>
          )}
        </div>

        <div className="gr-op-bloco">
          <div><b>Comissão da equipe</b><p className="g-muted g-pp">Sem ligar nada aqui, vale o de sempre: o percentual de cada pessoa (em Equipe) sobre o serviço dos atendimentos que ela concluiu.</p></div>
          <Chave nome="Comissão por serviço" titulo="Percentual por serviço" ligado={c.porServico} desligado={ocupado}
            apoio="Cada serviço pode ter o próprio percentual, que vale mais que o da pessoa. Serviço sem percentual usa o da pessoa."
            aoMudar={() => void gravar({ [K.comissaoPorServico]: !c.porServico }, c.porServico ? "Comissão por serviço desligada." : "Comissão por serviço ligada. Defina o percentual de cada serviço.")} />
          {c.porServico && <div><button type="button" className="g-btn sec p" onClick={() => { if (!somenteLeitura()) setPorServico(true); }}>Definir o percentual de cada serviço</button></div>}
          <Chave nome="Extras contam para a comissão" titulo="Extras contam para a comissão" ligado={c.extras} desligado={ocupado}
            apoio="Hidratação, leva e traz e outros extras da conta entram na base, junto com o serviço."
            aoMudar={() => void gravar({ [K.comissaoExtras]: !c.extras }, c.extras ? "Extras fora da comissão." : "Extras passam a contar para a comissão.")} />
          {usaModulo(petshop, "loja") && (
            <>
              <Chave nome="Comissão sobre produtos" titulo="Comissão sobre produtos" ligado={c.produtos} desligado={ocupado}
                apoio="Produto vendido na conta de um atendimento rende comissão para quem atendeu. Venda no balcão, sem atendimento, não entra."
                aoMudar={() => void gravar({ [K.comissaoProdutos]: !c.produtos }, c.produtos ? "Comissão sobre produtos desligada." : "Comissão sobre produtos ligada. Defina o percentual e salve.")} />
              {c.produtos && (
                <Campo rotulo="Percentual sobre produtos">
                  <input className="g-input g-tab" style={{ maxWidth: 140 }} inputMode="decimal" placeholder="0" value={prodPct} aria-label="Comissão sobre produtos em por cento" onChange={(e) => setProdPct(soPct(e.target.value))} />
                </Campo>
              )}
            </>
          )}
        </div>

        {erro && <p className="g-erro" role="alert">{erro}</p>}
        <div><button className="g-btn verde" disabled={ocupado}>{ocupado ? "Salvando…" : "Salvar opções de cobrança"}</button></div>
      </form>
      {porServico && <FolhaPorServico aoFechar={() => setPorServico(false)} />}
    </section>
  );
}

/** O percentual de comissão de cada serviço. Em branco, o serviço usa o percentual da pessoa. */
function FolhaPorServico({ aoFechar }: { aoFechar: () => void }) {
  const { sb, petshop, servicos } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const ativos = servicos.filter((s) => s.ativo);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const { dados } = useDados(async () => {
    const r = await sb.from("comissao_servicos").select("servico_id, pct").eq("petshop_id", petshop.id);
    if (r.error) throw new Error(r.error.message);
    setValores(Object.fromEntries((r.data ?? []).map((x) => [x.servico_id, String(Number(x.pct)).replace(".", ",")])));
    return r.data ?? [];
  }, [petshop.id]);

  async function salvar() {
    if (salvando || !dados) return;
    const linhas: { servico_id: string; petshop_id: string; pct: number }[] = [];
    const tirar: string[] = [];
    for (const s of ativos) {
      const texto = (valores[s.id] ?? "").trim();
      if (!texto) { if (dados.some((d) => d.servico_id === s.id)) tirar.push(s.id); continue; }
      const n = lerPct(texto);
      if (n === null) { setErro(`Confira o percentual de ${s.nome}: fica entre 0 e 100.`); return; }
      linhas.push({ servico_id: s.id, petshop_id: petshop.id, pct: n });
    }
    setSalvando(true);
    try {
      if (linhas.length) {
        const r = await sb.from("comissao_servicos").upsert(linhas).select("servico_id");
        if (r.error) throw new Error(r.error.message);
        if ((r.data?.length ?? 0) < linhas.length) throw new Error("Só o dono define a comissão por serviço.");
      }
      if (tirar.length) {
        const r = await sb.from("comissao_servicos").delete().eq("petshop_id", petshop.id).in("servico_id", tirar);
        if (r.error) throw new Error(r.error.message);
      }
      avisar("Percentuais salvos.");
      avisarMudanca();
      aoFechar();
    } catch (e) { avisarErro(e); setSalvando(false); }
  }

  return (
    <Folha titulo="Comissão por serviço" aoFechar={aoFechar}
      rodape={<>
        <button type="button" className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button type="button" className="g-btn pri" onClick={() => void salvar()} disabled={salvando || !dados}>{salvando ? "Salvando…" : "Salvar"}</button>
      </>}>
      <div className="g-form">
        <p className="g-muted g-p">Escreva o percentual só nos serviços que têm regra própria. Em branco, vale o percentual de quem atendeu.</p>
        {!dados ? <p className="g-muted g-p">Carregando…</p> : !ativos.length ? <p className="g-muted g-p">Nenhum serviço cadastrado ainda.</p> : (
          <div className="gr-op-pct">
            {ativos.map((s) => (
              <label key={s.id} style={{ display: "contents" }}>
                <span>{s.nome}</span>
                <input className="g-input g-tab" inputMode="decimal" placeholder="da pessoa" value={valores[s.id] ?? ""} aria-label={`Comissão de ${s.nome} em por cento`}
                  onChange={(e) => { setValores((v) => ({ ...v, [s.id]: soPct(e.target.value) })); setErro(null); }} />
              </label>
            ))}
          </div>
        )}
        {erro && <p className="g-erro" role="alert">{erro}</p>}
      </div>
    </Folha>
  );
}
