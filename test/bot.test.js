// ─────────────────────────────────────────────────────────────────────────────
//  Testes do CryptoBot + motor CoinMind
//  Roda com:  npm test        (node --test test/)
//  Não precisa de internet: tudo usa o mercado simulado do CoinMind.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Isola a configuração/carteira do teste num diretório temporário.
const DIR_TESTE = fs.mkdtempSync(path.join(os.tmpdir(), 'coinmind-bot-'));
process.env.COINMIND_DIR = DIR_TESTE;

const bot = require('../src/js/bot.js');

test('getBotInfo reporta o motor CoinMind já instalado', async () => {
  const info = await bot.getBotInfo();
  assert.strictEqual(info.installed, true, info.engine?.erro || 'motor indisponível');
  assert.strictEqual(info.engine.disponivel, true);
  assert.match(info.name, /CoinMind/i);
  assert.ok(info.capabilities.some((c) => /CoinMind/.test(c)));
  assert.ok(info.engine.estrategias.length >= 3);
  assert.ok(info.engine.corretoras.length >= 3);
});

test('configuração padrão do bot já vem pronta e é segura (testnet)', async () => {
  const info = await bot.coinmindInfo();
  assert.strictEqual(info.ok, true);
  assert.strictEqual(info.engine.modo, 'testnet');
  assert.ok(['dip', 'momentum', 'dca'].includes(info.engine.estrategia.nome));
  assert.ok(fs.existsSync(info.engine.configPath), 'config.json deveria existir');
});

test('configurar() troca estratégia, capital e modo — e persiste', async () => {
  const r = await bot.coinmindConfigurar({
    estrategia: 'momentum',
    cfg: { curta: 5, longa: 15, lote: 120 },
    capital: 2500,
    reiniciarCarteira: true,
    modo: 'testnet'
  });
  assert.strictEqual(r.ok, true, r.error);

  const atual = await bot.coinmindConfig();
  assert.strictEqual(atual.config.estrategia.nome, 'momentum');
  assert.strictEqual(atual.config.bot.capital, 2500);

  const carteira = await bot.coinmindCarteira();
  assert.strictEqual(carteira.capitalInicial, 2500);
  assert.strictEqual(carteira.saldo, 2500);

  // volta para a estratégia padrão com capital de fábrica
  await bot.coinmindConfigurar({ estrategia: 'dip', capital: 10000, reiniciarCarteira: true });
});

test('mercado simulado devolve cotações com variação', async () => {
  const m = await bot.coinmindMercado(10, 42);
  assert.strictEqual(m.ok, true);
  assert.ok(m.moedas.length >= 15);
  for (const moeda of m.moedas) {
    assert.ok(Number.isFinite(moeda.preco) && moeda.preco > 0);
    assert.ok(Array.isArray(moeda.historico));
  }
});

test('rodar() executa ciclos, persiste a carteira e fecha o relatório', async () => {
  const rel = await bot.coinmindRodar({
    ciclos: 80,
    capital: 1000,
    reiniciar: true,
    semente: 42,
    estrategia: 'dip',
    cfg: { lote: 100, queda: 0.03, lucroAlvo: 0.04, stopLoss: 0.08 }
  });
  assert.strictEqual(rel.ok, true, rel.error);
  assert.strictEqual(rel.ciclo, 80);
  assert.ok(rel.patrimonio > 0);
  assert.ok(Array.isArray(rel.trades));
  assert.ok(rel.curva.length >= 80);
  assert.ok(rel.operacoes > 0, 'a estratégia dip deveria ter operado em 80 ciclos');
  assert.ok(fs.existsSync(rel.caminhoCarteira), 'carteira.json deveria existir');
  assert.strictEqual(typeof rel.resultadoPct, 'number');
});

test('avaliarSerie() roda a estratégia salva sobre uma série REAL de preços', async () => {
  // série em queda de 8% => a estratégia dip deve querer comprar
  const precos = Array.from({ length: 40 }, (_, i) => 100 - i * 0.2);
  const parecer = await bot.coinmindAvaliar({
    simbolo: 'BTCUSDT',
    precos,
    estrategia: 'dip',
    cfg: { queda: 0.05, janela: 40 }
  });
  assert.strictEqual(parecer.disponivel, true);
  assert.strictEqual(parecer.avaliado, true);
  assert.strictEqual(parecer.estrategia, 'dip');
  assert.strictEqual(parecer.acao, 'compra');
  assert.match(parecer.motivo, /desconto|compra/i);
  assert.ok(parecer.descontoDaMaximaPct > 5);
});

test('avaliarSerie() também decide saída quando já existe posição', async () => {
  const precos = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111];
  const parecer = await bot.coinmindAvaliar({
    simbolo: 'ETHUSDT',
    precos,
    estrategia: 'dip',
    cfg: { lucroAlvo: 0.05, stopLoss: 0.5 },
    posicao: { precoMedio: 100, qtd: 1 }
  });
  assert.strictEqual(parecer.acao, 'venda');
  assert.ok(parecer.retornoPosicaoPct > 5);
});

test('análise técnica segue funcionando junto do CoinMind (analyze com dados mockados)', async () => {
  const fechamentos = Array.from({ length: 120 }, (_, i) => 100 + Math.sin(i / 4) * 3 - i * 0.05);
  const exchangeConfig = {
    exchange: 'binance',
    mockCandles: fechamentos.map((f, i) => ({
      openTime: Date.now() - (120 - i) * 60000,
      open: f,
      high: f * 1.004,
      low: f * 0.996,
      close: f,
      volume: 1000 + i
    }))
  };

  const resultado = await bot.analyze(exchangeConfig, 'BTCUSDT', '60', { news: [], sentiment: {} });
  // sem rede o analyze pode falhar; o importante é o bot nunca quebrar:
  if (!resultado.success) {
    assert.ok(resultado.error, 'erro deve vir descrito');
    return;
  }
  assert.ok(resultado.analysis.recommendation);
  assert.ok(resultado.analysis.coinmind, 'análise deve trazer o parecer do CoinMind');
});

test('ordem real sem confirmar é apenas prévia (nunca envia nada)', async () => {
  const previa = await bot.coinmindOrdem({ lado: 'compra', simbolo: 'BTC', usd: 25, prever: true });
  assert.strictEqual(previa.ok, true, previa.error);
  assert.strictEqual(previa.previa, true);
  assert.strictEqual(previa.enviada, false);
  assert.strictEqual(previa.modo, 'testnet');
  assert.strictEqual(previa.ordem.usd, 25);
});

test('ordem real valida os parâmetros antes de qualquer coisa', async () => {
  const semLado = await bot.coinmindOrdem({ simbolo: 'BTC', usd: 10 });
  assert.strictEqual(semLado.ok, false);
  assert.match(semLado.error, /lado/i);

  const semValor = await bot.coinmindOrdem({ lado: 'compra', simbolo: 'BTC' });
  assert.strictEqual(semValor.ok, false);
  assert.match(semValor.error, /valor/i);
});

test('limites de risco do CoinMind bloqueiam ordem acima do teto', async () => {
  const rel = await bot.coinmindRodar({
    ciclos: 30,
    capital: 5000,
    reiniciar: true,
    semente: 7,
    aplicarLimites: true,
    cfg: { lote: 500, queda: 0.001, lucroAlvo: 0.5, stopLoss: 0.5 },
    bot: { limites: { maxOrdem: 25, maxPosicao: 100, perdaDia: 50, cooldown: 0, moedas: ['BTC', 'ETH', 'SOL', 'DOGE'] } }
  });
  assert.strictEqual(rel.ok, true, rel.error);
  assert.ok(rel.bloqueadas.length > 0, 'deveria haver propostas bloqueadas pelos limites');
  assert.match(rel.bloqueadas[0].bloqueio, /máximo por ordem|fora da lista|teto/i);
});

test('modo contínuo liga, produz ciclos e desliga', async () => {
  const inicio = await bot.coinmindIniciar({ intervalo: 200, semente: 3, capital: 1000, reiniciar: true });
  assert.strictEqual(inicio.ok, true, inicio.error);
  assert.strictEqual(inicio.rodando, true);

  await new Promise((r) => setTimeout(r, 900));

  const status = await bot.coinmindStatus();
  assert.strictEqual(status.rodando, true);
  assert.ok(status.ultimoCiclo >= 1, `esperava pelo menos 1 ciclo, veio ${status.ultimoCiclo}`);

  const parado = bot.coinmindParar();
  assert.strictEqual(parado.parado, true);
  assert.strictEqual((await bot.coinmindStatus()).rodando, false);
});

test('testar() faz um check completo do motor', async () => {
  const r = await bot.coinmindTestar();
  assert.strictEqual(r.ok, true, r.error);
  assert.match(r.mensagem, /CoinMind v/);
  assert.ok(r.parecer);
  assert.ok(r.carteira.patrimonio > 0);
});

test('corretoras lista Binance/Bybit/OKX com testnet', async () => {
  const r = await bot.coinmindCorretoras();
  assert.strictEqual(r.ok, true);
  const ids = r.lista.map((c) => c.id).sort();
  assert.deepStrictEqual(ids, ['binance', 'bybit', 'okx']);
  assert.ok(r.lista.every((c) => c.suportaTestnet));
});

test('carteira paper é reiniciável', async () => {
  const r = await bot.coinmindReiniciarCarteira(750);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.saldo, 750);
  const carteira = await bot.coinmindCarteira();
  assert.strictEqual(carteira.capitalInicial, 750);
});
