#!/usr/bin/env node
// Executor da suíte: roda cada arquivo de teste num processo próprio (um depois do outro), junta os resultados e
// termina com código 1 se algo falhou.
//
//   node testes/rodar.js unidade      só os testes de unidade (sem banco e sem servidor: é o que o CI roda)
//   node testes/rodar.js banco        unidade + banco (API do Supabase e rotas do servidor)
//   node testes/rodar.js telas        telas no navegador (Playwright)
//   node testes/rodar.js migracoes    prova de ordem das migrações (banco de rascunho)
//   node testes/rodar.js tudo         tudo acima
//   node testes/rodar.js limpar       apaga o que testes interrompidos deixaram (lojas @teste-auto.local)
//   node testes/rodar.js banco/dinheiro telas/caixa   só esses arquivos
// SO=texto filtra pelo nome do arquivo. VERBOSO=1 mostra a saída inteira de cada teste. Saída completa em testes/saida/.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

process.env.TZ = process.env.TZ || 'America/Sao_Paulo';
const B = require('./lib/base');
const DIR = __dirname;
const SAIDA = path.join(DIR, 'saida');
const lista = (pasta) => fs.readdirSync(path.join(DIR, pasta)).filter((f) => f.endsWith('.js') || f.endsWith('.sh')).sort().map((f) => `${pasta}/${f}`);
const GRUPOS = {
  // só os testes de unidade: não precisam de banco nem de servidor (é o que o CI roda a cada pull request)
  unidade: () => lista('unidade'),
  banco: () => [...lista('unidade'), ...lista('banco')],
  telas: () => lista('telas'),
  migracoes: () => lista('migracoes'),
  tudo: () => [...lista('unidade'), ...lista('banco'), ...lista('migracoes'), ...lista('telas')],
};
const PRECISA_SERVIDOR = /^(telas\/|banco\/(tutor|link-ia|cakto|erros|caderno|boletim|fotos-redes|entrada|seguranca-rodada9|seguranca-reforcos|resumo-do-dia|mozart-anexos)\.js)/;

function rodar(arq) {
  return new Promise((fim) => {
    const t0 = Date.now();
    const cmd = arq.endsWith('.sh') ? ['bash', [path.join(DIR, arq)]] : [process.execPath, [path.join(DIR, arq)]];
    const p = spawn(cmd[0], cmd[1], { env: process.env, cwd: B.RAIZ });
    let out = '';
    const linha = (l) => {
      if (process.env.VERBOSO) console.log(l);
      else if (/^\s+(FALHOU|CONHECIDO)|^FALHOU|erro inesperado/.test(l)) console.log('   ' + l.trim());
    };
    let resto = '';
    const ler = (d) => { out += d; resto += d; const ls = resto.split('\n'); resto = ls.pop(); ls.forEach(linha); };
    p.stdout.on('data', ler); p.stderr.on('data', ler);
    p.on('close', (codigo) => {
      if (resto) linha(resto);
      fs.writeFileSync(path.join(SAIDA, arq.replace(/[\/.]/g, '_') + '.log'), out);
      const m = out.match(/^##RESULTADO (.*)$/m);
      let r = m ? JSON.parse(m[1]) : null;
      if (!r) r = { suite: arq, passou: 0, falhou: 1, conhecidos: [], falhas: ['o teste parou sem resultado (veja o log)'] };
      r.arquivo = arq; r.codigo = codigo; r.segundos = (Date.now() - t0) / 1000;
      if (codigo !== 0 && !r.falhou) r.falhou = 1;
      fim(r);
    });
  });
}

async function principal() {
  const args = process.argv.slice(2);
  fs.mkdirSync(SAIDA, { recursive: true });
  if (args[0] === 'limpar') { console.log('Apagado:', require('./lib/semente').limparTudo()); return 0; }
  let arqs = [];
  for (const a of args.length ? args : ['tudo']) {
    if (GRUPOS[a]) arqs.push(...GRUPOS[a]());
    else { const f = /\.(js|sh)$/.test(a) ? a : `${a}.js`; if (!fs.existsSync(path.join(DIR, f))) { console.error(`Não achei ${f}. Grupos: ${Object.keys(GRUPOS).join(', ')}, limpar.`); return 2; } arqs.push(f); }
  }
  if (process.env.SO) arqs = arqs.filter((a) => a.includes(process.env.SO));
  arqs = [...new Set(arqs)];

  // antes de começar: o banco responde? o servidor está no ar (se algum teste precisa)?
  // (só testes de unidade: não precisam de banco nem de servidor; é assim que o CI roda)
  const soUnidade = arqs.length > 0 && arqs.every((x) => x.startsWith('unidade/'));
  if (!soUnidade) try { B.sql('select 1'); } catch (e) { console.error(`Sem acesso ao Postgres local (contêiner ${B.DB_CONTAINER}): ${e.message.split('\n')[0]}\nSuba o Supabase local (npx supabase start) ou defina DB_CONTAINER / DATABASE_URL.`); return 2; }
  if (!soUnidade) try { const r = await fetch(`${B.SUPABASE_URL}/rest/v1/`, { headers: { apikey: B.SUPABASE_KEY } }); if (r.status >= 500) throw new Error('HTTP ' + r.status); } catch (e) { console.error(`A API do Supabase não responde em ${B.SUPABASE_URL}: ${e.message}`); return 2; }
  if (arqs.some((a) => PRECISA_SERVIDOR.test(a)) && !(await B.servidorNoAr())) {
    console.error(`O servidor do aplicativo não responde em ${B.BASE_URL}.\nRode: npx next build && ANTHROPIC_API_KEY=sk-ant-chave-falsa GESTAO_LINK_IA_FALSO=1 npx next start -p 3214\n(ou defina BASE_URL).`);
    return 2;
  }

  // Banco LOCAL sem a trava do servidor gravada: renova a carência (migração 20261228) para os testes do Tirar dúvida do
  // link, do chat de venda e da entrada não dependerem de quando o banco foi criado. Nunca mexe num banco que não é local.
  if (/\/\/(127\.0\.0\.1|localhost)[:/]/.test(B.SUPABASE_URL)) {
    try {
      B.sql(`insert into public.config_interna (chave, valor) select 'servidor_trava_carencia_ate', (now() + interval '30 days')::text
               where not exists (select 1 from public.config_interna where chave = 'servidor_segredo_sha256')
             on conflict (chave) do update set valor = excluded.valor`);
    } catch { /* banco sem a migração: segue */ }
  }

  console.log(`Suíte: ${arqs.length} arquivo(s) · Supabase ${B.SUPABASE_URL} · servidor ${B.BASE_URL} · TZ ${process.env.TZ}\n`);
  const t0 = Date.now();
  const rs = [];
  for (const a of arqs) {
    console.log(`▸ ${a}`);
    const r = await rodar(a);
    rs.push(r);
    console.log(`  ${r.falhou ? 'FALHOU' : 'ok'} — ${r.passou} ok, ${r.falhou} falha(s)${r.conhecidos?.length ? `, ${r.conhecidos.length} conhecido(s)` : ''} (${r.segundos.toFixed(1)}s)`);
  }
  const tot = rs.reduce((t, r) => ({ passou: t.passou + r.passou, falhou: t.falhou + r.falhou, conhecidos: t.conhecidos + (r.conhecidos?.length ?? 0) }), { passou: 0, falhou: 0, conhecidos: 0 });
  const seg = ((Date.now() - t0) / 1000).toFixed(0);
  console.log('\n──────── resumo ────────');
  for (const r of rs) console.log(`${r.falhou ? 'FALHOU' : 'ok    '} ${r.arquivo.padEnd(28)} ${String(r.passou).padStart(4)} ok ${String(r.falhou).padStart(3)} falha(s)${r.conhecidos?.length ? ` ${r.conhecidos.length} conhecido(s)` : ''}  ${r.segundos.toFixed(1)}s`);
  const ruins = rs.filter((r) => r.falhou);
  if (ruins.length) { console.log('\nO que falhou:'); for (const r of ruins) for (const f of r.falhas ?? []) console.log(`  ${r.arquivo}: ${f}`); }
  const conh = rs.flatMap((r) => (r.conhecidos ?? []).map((c) => `${r.arquivo}: ${c}`));
  if (conh.length) { console.log('\nProblemas conhecidos (não derrubam a suíte; ESTRITO=1 faz derrubar):'); conh.forEach((c) => console.log('  ' + c)); }
  console.log(`\n${ruins.length ? 'FALHOU' : 'PASSOU'}: ${tot.passou} conferências ok, ${tot.falhou} falha(s)${tot.conhecidos ? `, ${tot.conhecidos} conhecida(s)` : ''}, ${rs.length} arquivo(s), ${seg}s. Logs em testes/saida/.`);
  return ruins.length ? 1 : 0;
}

principal().then((c) => process.exit(c), (e) => { console.error(e); process.exit(2); });
