#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
//  CryptoBot headless — o mesmo motor que o app usa, direto no terminal.
//  Uso:
//    npm run bot                      → roda 40 ciclos com a configuração salva
//    npm run bot -- --ciclos 80       → mais ciclos
//    npm run bot -- --estrategia dca --capital 2000
//    npm run bot -- --info            → mostra config, corretoras e carteira
//    npm run bot -- --testar          → teste completo do motor
//    npm run bot -- --preco BTC       → preço real (público) na corretora salva
//    npm run bot -- --ordem comprar BTC 25 --prever   → prévia de ordem real
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const bot = require('../src/js/bot.js');

function parseFlags(argv) {
  const opts = {};
  const resto = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [chave, valorInline] = a.slice(2).split('=');
      if (valorInline !== undefined) opts[chave] = valorInline;
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) opts[chave] = argv[++i];
      else opts[chave] = true;
    } else resto.push(a);
  }
  return { opts, resto };
}

const num = (v, padrao) => {
  if (v === undefined || v === true) return padrao;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : padrao;
};

const fmtUsd = (v) =>
  `US$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (v) => `${Number(v || 0) >= 0 ? '+' : ''}${Number(v || 0).toFixed(2)}%`;

async function ajuda() {
  const info = await bot.getBotInfo();
  console.log(`\n🤖 ${info.name} v${info.version} — motor ${info.engine?.engine || '?'} v${info.engine?.versao || '?'}\n`);
  console.log('  --ciclos N            ciclos a executar (padrão 40)');
  console.log('  --estrategia NOME     dip | momentum | dca');
  console.log('  --capital N           reinicia a carteira paper com N');
  console.log('  --intervalo MS        pausa entre ciclos (padrão 0)');
  console.log('  --semente N           semente do mercado simulado');
  console.log('  --limites             aplica os limites duros de risco');
  console.log('  --info                configuração + corretoras + carteira');
  console.log('  --testar              teste completo do motor');
  console.log('  --preco MOEDA         preço real (público)');
  console.log('  --saldos              saldos reais na corretora');
  console.log('  --ordem comprar BTC 25 [--prever|--confirmar]');
  console.log('  --config k=v          grava configuração (ex: --config modo=testnet)\n');
}

async function main() {
  const { opts, resto } = parseFlags(process.argv.slice(2));

  if (opts.ajuda || opts.help) return ajuda();

  if (opts.info) {
    const info = await bot.coinmindInfo();
    const carteira = await bot.coinmindCarteira();
    const conf = await bot.coinmindConfig();
    if (!info.ok) throw new Error(info.error);
    const e = info.engine;
    console.log(`\n🤖 CoinMind v${e.versao} · modo ${e.modo} · corretora ${e.corretora}`);
    console.log(`   estratégia: ${e.estrategia.emoji} ${e.estrategia.nome} (${JSON.stringify(e.estrategia.parametros)})`);
    console.log(`   config: ${e.configPath}`);
    console.log(`   carteira: ${e.carteiraPath}`);
    console.log(`   carteira paper: saldo ${fmtUsd(carteira.saldo)} · capital ${fmtUsd(carteira.capitalInicial)} · ${carteira.posicoes.length} posição(ões)`);
    console.log(`   corretoras: ${e.corretoras.map((c) => `${c.nome}${c.configurada ? '✅' : ''}`).join(' · ')}`);
    console.log(`   capital configurado do bot: ${fmtUsd(conf.config.bot.capital)}\n`);
    return;
  }

  if (opts.testar) {
    const r = await bot.coinmindTestar();
    console.log(`\n${r.ok ? '✅' : '❌'} ${r.mensagem || r.error}`);
    if (r.parecer) console.log(`   parecer BTC: ${r.parecer.acao || 'sem gatilho'} — ${r.parecer.motivo}`);
    if (r.carteira) console.log(`   carteira: ${fmtUsd(r.carteira.patrimonio)} (${fmtPct(r.carteira.resultadoPct)})\n`);
    return;
  }

  if (opts.preco) {
    const r = await bot.coinmindPreco(resto[0] || opts.preco, 'USDT', { corretora: opts.corretora });
    console.log(r.ok ? `\n💰 ${r.simbolo}: US$ ${r.preco} (${r.corretoraNome} · ${r.modo})\n` : `\n❌ ${r.error}\n`);
    return;
  }

  if (opts.saldos) {
    const r = await bot.coinmindSaldos({ corretora: opts.corretora });
    console.log(r.ok ? `\n💼 ${r.corretora} (${r.modo}) · chave ${r.chave}` : `\n❌ ${r.error}`);
    if (r.ok) r.saldos.forEach((s) => console.log(`   ${s.ativo}: ${s.livre}`));
    console.log();
    return;
  }

  if (opts.ordem) {
    const [lado, simbolo, valor] = resto;
    const r = await bot.coinmindOrdem({
      lado,
      simbolo,
      usd: lado === 'comprar' || lado === 'compra' ? num(valor, 0) : undefined,
      qtd: lado === 'vender' || lado === 'venda' ? valor : undefined,
      prever: opts.prever || !opts.confirmar,
      confirmar: !!opts.confirmar,
      testnet: !opts.real,
      corretora: opts.corretora
    });
    if (!r.ok) {
      console.log(`\n❌ ${r.error}\n`);
      return;
    }
    console.log(`\n${r.enviada ? '🔥 ORDEM ENVIADA' : '👁️  PRÉVIA (nada foi enviado)'}`);
    console.log(`   ${r.corretoraNome} · modo ${r.modo}`);
    console.log(`   ${r.ordem.lado} ${r.ordem.simbolo} ${r.ordem.usd ? `US$ ${r.ordem.usd}` : r.ordem.qtd}`);
    if (r.resultado) console.log(`   id ${r.resultado.idOrdem} · ${r.resultado.status} · preço médio ${r.resultado.precoMedio}`);
    console.log(`   ${r.aviso}\n`);
    return;
  }

  if (opts.config) {
    const cfg = {};
    for (const par of [].concat(opts.config)) {
      const [k, v] = String(par).split('=');
      if (k) cfg[k] = v;
    }
    const r = await bot.coinmindConfigurar({ modo: cfg.modo, estrategia: cfg.estrategia, capital: num(cfg.capital, undefined) });
    console.log(r.ok ? `\n✅ configuração salva: ${JSON.stringify(r.config.estrategia)} · modo ${r.config.modo}\n` : `\n❌ ${r.error}\n`);
    return;
  }

  // ── modo padrão: roda o robô ──────────────────────────────────────────────
  const ciclos = num(opts.ciclos, 40);
  const intervalo = num(opts.intervalo, 0);
  const capital = opts.capital !== undefined ? num(opts.capital, null) : undefined;

  console.log(`\n🤖 CryptoBot + CoinMind — ${ciclos} ciclos${capital ? ` · capital ${fmtUsd(capital)}` : ''}\n`);

  const rel = await bot.coinmindRodar({
    ciclos,
    intervalo,
    capital,
    reiniciar: capital !== undefined,
    semente: opts.semente !== undefined ? num(opts.semente, 1) : null,
    estrategia: opts.estrategia,
    aplicarLimites: !!opts.limites,
    cfg: {
      ...(opts.lote !== undefined ? { lote: num(opts.lote, 150) } : {}),
      ...(opts.queda !== undefined ? { queda: num(opts.queda, 5) / 100 } : {}),
      ...(opts.lucro !== undefined ? { lucroAlvo: num(opts.lucro, 6) / 100 } : {}),
      ...(opts.stop !== undefined ? { stopLoss: num(opts.stop, 8) / 100 } : {})
    },
    aoCiclo: intervalo > 0
      ? (r) => {
          r.trades.forEach((t) => console.log(`  [${String(r.ciclo).padStart(3)}] ${t.acao === 'compra' ? '🟢 COMPROU' : '🔴 VENDEU'} ${t.emoji} ${t.simbolo} — ${t.motivo}`));
        }
      : null
  });

  if (!rel.ok) {
    console.log(`❌ ${rel.error}\n`);
    process.exitCode = 1;
    return;
  }

  console.log(`  ${rel.emoji} estratégia ${rel.estrategia} · ${ciclos} ciclos · ${rel.moedas} moedas`);
  console.log(`  operações: ${rel.operacoes} · trades: ${rel.trades.length} · bloqueadas: ${rel.bloqueadas.length}`);
  console.log(`  patrimônio: ${fmtUsd(rel.patrimonio)} (${fmtPct(rel.resultadoPct)})`);
  console.log(`  saldo livre: ${fmtUsd(rel.saldo)} · P&L realizado ${fmtUsd(rel.pnlRealizado)} · não realizado ${fmtUsd(rel.pnlNaoRealizado)}`);

  if (rel.posicoes.length) {
    console.log('\n  posições abertas:');
    rel.posicoes.forEach((p) =>
      console.log(`   ${p.emoji} ${p.simbolo}: ${p.qtd.toFixed(6)} @ ${fmtUsd(p.precoMedio)} → ${fmtUsd(p.preco)} (${fmtPct(p.retornoPct)})`)
    );
  }

  const veredito = rel.resultado >= 0 ? '🟢 LUCRO' : '🔴 PERDA';
  console.log(`\n  ${veredito} — ${fmtUsd(rel.resultado)} (${fmtPct(rel.resultadoPct)})`);
  console.log(`  carteira salva em ${rel.caminhoCarteira}\n`);
}

main().catch((erro) => {
  console.error(`\n❌ ${erro.message}\n`);
  process.exitCode = 1;
});
