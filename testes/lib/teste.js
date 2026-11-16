// Placar de um arquivo de teste. Uso:
//   const T = require('../lib/teste')('nome da suíte');
//   T.secao('isolamento'); T.ok('B não lê A', cond, extra);
//   T.rodar(async () => { ... });   // trata erro inesperado, limpa e imprime o resumo
// A última linha impressa é `##RESULTADO {...}` (o executor lê) e o código de saída é 1 se algo falhou.
module.exports = function (suite) {
  let passou = 0, falhou = 0, secao = '';
  const falhas = [], conhecidos = [];
  const limpezas = [];
  const curto = (x) => { if (x === undefined || x === null || x === '') return ''; const s = typeof x === 'string' ? x : JSON.stringify(x); return s.length > 400 ? s.slice(0, 400) + '…' : s; };
  const T = {
    secao(nome) { secao = nome; console.log(`\n— ${nome}`); },
    /** Uma conferência. `extra` só aparece quando falha (ou com VERBOSO=1). */
    ok(nome, cond, extra) {
      const bom = Boolean(cond);
      if (bom) passou++; else { falhou++; falhas.push(`${secao ? secao + ' › ' : ''}${nome}`); }
      const mais = (!bom || process.env.VERBOSO) && curto(extra) ? ` — ${curto(extra)}` : '';
      console.log(`  ${bom ? 'ok    ' : 'FALHOU'} ${nome}${mais}`);
      return bom;
    },
    /**
     * Problema CONHECIDO e ainda não consertado (anotado em testes/LEIAME.md): a conferência roda e aparece no resumo,
     * mas não derruba a suíte. Quando passar a dar certo, avisa para tirar o "conhecido". Com ESTRITO=1, conta como falha.
     */
    conhecido(nome, cond, motivo, extra) {
      if (process.env.ESTRITO) return T.ok(nome, cond, extra);
      const bom = Boolean(cond);
      if (bom) { passou++; console.log(`  ok     ${nome} (era um problema conhecido: já pode virar T.ok)`); return true; }
      conhecidos.push(`${secao ? secao + ' › ' : ''}${nome} — ${motivo}`);
      console.log(`  CONHECIDO ${nome} — ${motivo}${curto(extra) ? ` — ${curto(extra)}` : ''}`);
      return false;
    },
    /** A resposta do Supabase deu erro (recusa). `re`: o texto do erro tem de bater. */
    recusa(nome, r, re) { const e = r && r.error; return T.ok(nome, e && (!re || re.test(e.message)), e ? e.message : `passou: ${curto(r && r.data)}`); },
    /** A resposta não deu erro. */
    passa(nome, r, cond = true) { return T.ok(nome, r && !r.error && cond, r && r.error ? r.error.message : curto(r && r.data)); },
    /** Algo a desfazer no fim, mesmo se o teste quebrar no meio (roda na ordem inversa). */
    depois(f) { limpezas.push(f); },
    async rodar(corpo) {
      const t0 = Date.now();
      let quebrou = null;
      try { await corpo(); } catch (e) { quebrou = e; falhou++; falhas.push(`erro inesperado: ${e.message}`); console.log(`\n  FALHOU erro inesperado: ${e.stack || e.message}`); }
      for (const f of limpezas.reverse()) { try { await f(); } catch (e) { console.log(`  (limpeza: ${e.message})`); } }
      const s = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`\n${suite}: ${passou} ok, ${falhou} falharam${conhecidos.length ? `, ${conhecidos.length} problema(s) conhecido(s)` : ''} (${s}s)`);
      if (falhas.length) console.log('Falharam:\n' + falhas.map((f) => '  - ' + f).join('\n'));
      if (conhecidos.length) console.log('Conhecidos (não derrubam a suíte):\n' + conhecidos.map((f) => '  - ' + f).join('\n'));
      console.log('##RESULTADO ' + JSON.stringify({ suite, passou, falhou, conhecidos, segundos: Number(s), falhas }));
      process.exitCode = falhou || quebrou ? 1 : 0;
      // clientes do Supabase e o navegador às vezes seguram o processo
      setTimeout(() => process.exit(process.exitCode), 200).unref();
    },
  };
  return T;
};
