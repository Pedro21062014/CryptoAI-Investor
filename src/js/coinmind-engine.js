// ─────────────────────────────────────────────────────────────────────────────
//  CryptoAI Investor · CoinMind Engine 🤖
//  Integra o pacote npm "coinmind" (github.com/Pedro21062014/coinmind) ao bot
//  do aplicativo:
//    · mercado simulado (blue chips, memes e web3) com eventos e volatilidade
//    · estratégias automáticas: dip 🎣 · momentum 🏃 · dca 🕰️
//    · carteira paper persistente (~/.coinmind/carteira.json)
//    · cérebro de IA opcional e limites duros de risco (agente)
//    · ordens REAIS via Binance / Bybit / OKX — testnet por padrão
//
//  Tudo chega CONFIGURADO: na primeira execução o motor cria o
//  ~/.coinmind/config.json com padrões seguros (Binance · testnet ·
//  estratégia dip com lote de US$ 150) SEM sobrescrever o que já existe.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ENGINE_NOME = 'coinmind';
const ESTRATEGIA_PADRAO = 'dip';
const CAPITAL_PADRAO = 10000;
const CICLOS_PADRAO = 40;
const INTERVALO_PADRAO = 400; // ms entre ciclos no modo contínuo

/** Configuração que o bot injeta quando o usuário ainda não configurou nada. */
const BOT_PADRAO = {
  capital: CAPITAL_PADRAO,
  ciclos: CICLOS_PADRAO,
  intervalo: INTERVALO_PADRAO,
  semente: null,
  aplicarLimites: false,
  limites: null, // null = usa LIMITES_PADRAO do agente do coinmind
  moedas: null // null = todas as moedas do mercado simulado
};

// ── carregamento do pacote (ESM) a partir do processo principal (CJS) ───────

let cache = null;
let carregando = null;
let ultimoErro = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// O app (main.js) registra aqui os diretórios onde procurar o pacote: o motor
// pode estar no node_modules do app ou num diretório de instalação sob demanda.
const diretoriosExtras = [];
let dirInstalacao = null;

/** Registra um node_modules extra para procurar o coinmind (chamado pelo main.js). */
function registrarDiretorioDeModulo(nodeModules) {
  if (nodeModules && !diretoriosExtras.includes(nodeModules)) diretoriosExtras.push(nodeModules);
}

/** Define onde instalar o motor sob demanda (padrão: ~/.cryptoai-investor/engine). */
function definirDirInstalacao(dir) {
  if (dir) dirInstalacao = dir;
}

function dirMotor() {
  return (
    dirInstalacao ||
    process.env.COINMIND_ENGINE_DIR ||
    path.join(os.homedir(), '.cryptoai-investor', 'engine')
  );
}

function dirDados() {
  return process.env.COINMIND_DIR || path.join(os.homedir(), '.coinmind');
}

async function importarCoinMind(rel) {
  const candidatos = [null, ...diretoriosExtras, path.join(dirMotor(), 'node_modules')].map((base) =>
    base ? path.join(base, `${ENGINE_NOME}/${rel}`) : null
  );

  let erroBare = null;
  try {
    return await import(`${ENGINE_NOME}/${rel}`);
  } catch (erro) {
    erroBare = erro;
  }

  for (const arquivo of candidatos.filter(Boolean)) {
    try {
      if (fs.existsSync(arquivo)) return await import(pathToFileURL(arquivo).href);
    } catch { /* tenta o próximo */ }
  }
  throw new Error(
    `pacote "${ENGINE_NOME}" não encontrado (npm install). Detalhe: ${erroBare ? erroBare.message : 'sem resolução'}`
  );
}

/** Tenta carregar o motor; devolve null se não estiver disponível. */
async function tentarCarregar() {
  try {
    return await carregar();
  } catch {
    return null;
  }
}

/** true se o motor já está instalado e carregável. */
async function motorInstalado() {
  return !!(await tentarCarregar());
}

/** Carrega (uma vez) todos os módulos do coinmind usados pelo bot. */
async function carregar() {
  if (cache) return cache;
  if (carregando) return carregando;

  carregando = (async () => {
    const [mercado, cerebro, carteira, config, corretoras, agente, versao] = await Promise.all([
      importarCoinMind('src/mercado.js'),
      importarCoinMind('src/bot.js'),
      importarCoinMind('src/carteira.js'),
      importarCoinMind('src/config.js'),
      importarCoinMind('src/corretoras/index.js'),
      importarCoinMind('src/agente.js'),
      importarCoinMind('src/versao.js')
    ]);

    cache = {
      VERSAO: versao.VERSAO,
      Mercado: mercado.Mercado,
      RNG: mercado.RNG,
      CATALOGO: mercado.CATALOGO,
      CATEGORIAS: mercado.CATEGORIAS,
      ESTRATEGIAS: cerebro.ESTRATEGIAS,
      decidir: cerebro.decidir,
      executar: cerebro.executar,
      configEstrategia: cerebro.configEstrategia,
      carteira,
      config,
      corretoras,
      agente,
      dirDados: config.dirConfig(),
      // aliases úteis
      valorTotal: carteira.valorTotal,
      pnlNaoRealizado: carteira.pnlNaoRealizado,
      pnlRealizado: carteira.pnlRealizado
    };
    return cache;
  })();

  try {
    return await carregando;
  } catch (erro) {
    carregando = null;
    ultimoErro = erro.message;
    throw erro;
  }
}

// ── configuração automática (o "já vem pronto") ─────────────────────────────

/**
 * Garante que exista uma configuração utilizável em ~/.coinmind/config.json.
 * Nunca sobrescreve valores já definidos pelo usuário.
 */
function garantirConfiguracao(core, overrides = {}) {
  const atual = core.config.lerConfig();
  const antes = JSON.stringify(atual);

  const novo = { ...atual };
  novo.corretora = novo.corretora || overrides.corretora || 'binance';
  novo.modo = novo.modo || 'testnet'; // seguro por padrão
  if (!novo.estrategia || !novo.estrategia.nome || !core.ESTRATEGIAS[novo.estrategia.nome]) {
    novo.estrategia = { nome: ESTRATEGIA_PADRAO, cfg: { ...(atual.estrategia?.cfg || {}) } };
  }
  if (!novo.estrategia.cfg) novo.estrategia.cfg = {};
  novo.bot = { ...BOT_PADRAO, ...(atual.bot || {}), ...(overrides.bot || {}) };
  novo.botAtivadoEm = atual.botAtivadoEm || new Date().toISOString();

  if (JSON.stringify(novo) !== antes) core.config.salvarConfig(novo);
  return core.config.lerConfig();
}

/** Configuração efetiva do bot (config do coinmind + defaults do app). */
async function lerConfiguracoes() {
  const core = await carregar();
  const conf = garantirConfiguracao(core);
  return { ...conf, bot: { ...BOT_PADRAO, ...(conf.bot || {}) } };
}

/**
 * Descrição dos campos de cada estratégia, montada a partir dos parâmetros
 * padrão da dependência (usada pelo modal Criar Bot para gerar os inputs).
 */
const CAMPOS_ESTRATEGIA = {
  dip: [
    { chave: 'lote', rotulo: 'Lote (US$ por compra)', tipo: 'number', unidade: 'usd' },
    { chave: 'queda', rotulo: 'Queda para comprar', tipo: 'percent' },
    { chave: 'lucroAlvo', rotulo: 'Lucro-alvo', tipo: 'percent' },
    { chave: 'stopLoss', rotulo: 'Stop-loss', tipo: 'percent' },
    { chave: 'janela', rotulo: 'Janela de máxima (ciclos)', tipo: 'number' }
  ],
  momentum: [
    { chave: 'lote', rotulo: 'Lote (US$ por compra)', tipo: 'number', unidade: 'usd' },
    { chave: 'curta', rotulo: 'Média curta', tipo: 'number' },
    { chave: 'longa', rotulo: 'Média longa', tipo: 'number' }
  ],
  dca: [
    { chave: 'lote', rotulo: 'Lote (US$ por compra)', tipo: 'number', unidade: 'usd' },
    { chave: 'cadaNCiclos', rotulo: 'Comprar a cada N ciclos', tipo: 'number' },
    { chave: 'moedas', rotulo: 'Moedas (separadas por vírgula)', tipo: 'text' }
  ]
};

/**
 * Padrões que vêm da própria dependência (coinmind): estratégias, parâmetros de
 * cada uma, limites de risco e o formato esperado. É o que o modal "Criar Bot"
 * usa para pré-preencher tudo — assim o bot nasce com o comportamento padrão
 * da dependência, sem valor mágico inventado pelo app.
 */
async function padroes() {
  const core = await carregar();

  const estrategias = Object.entries(core.ESTRATEGIAS).map(([id, e]) => ({
    id,
    nome: e.nome,
    emoji: e.emoji,
    descricao: e.desc,
    parametros: core.configEstrategia(id), // defaults da dependência
    campos: CAMPOS_ESTRATEGIA[id] || []
  }));

  return {
    ok: true,
    engine: ENGINE_NOME,
    versao: core.VERSAO,
    capital: CAPITAL_PADRAO,
    ciclos: CICLOS_PADRAO,
    intervalo: INTERVALO_PADRAO,
    estrategiaPadrao: ESTRATEGIA_PADRAO,
    estrategias,
    limites: core.agente.LIMITES_PADRAO,
    moedas: core.CATALOGO.map((m) => m.simbolo),
    corretoras: Object.values(core.corretoras.CORRETORAS).map((c) => ({
      id: c.id,
      nome: c.nome,
      suportaTestnet: !!c.suportaTestnet
    })),
    modoPadrao: 'testnet'
  };
}

// ── instalação sob demanda (quando o pacote não está presente) ──────────────

/**
 * Instala o motor `coinmind` no diretório do app (npm install num pacote
 * próprio). Usado pelo aviso "vou instalar o motor" quando ele não existe.
 * @param {{ onProgress?: (linha: {fase: string, texto: string}) => void }} opcoes
 */
async function instalarMotor(opcoes = {}) {
  const { spawn } = require('node:child_process');
  const avisar = (fase, texto) => {
    if (typeof opcoes.onProgress === 'function') opcoes.onProgress({ fase, texto: String(texto) });
  };

  if (await motorInstalado()) {
    avisar('pronto', 'motor já instalado');
    return { ok: true, jaInstalado: true, dir: dirMotor(), mensagem: 'Motor CoinMind já está instalado' };
  }

  const dir = dirMotor();
  const pacote = path.join(dir, 'package.json');
  const depVersao = String((require('../../package.json').dependencies || {})[ENGINE_NOME] || '1.3.0');
  const versao = opcoes.versao || (depVersao.startsWith('^') ? depVersao : `^${depVersao}`);

  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      pacote,
      JSON.stringify(
        {
          name: 'cryptoai-investor-engine',
          version: '1.0.0',
          private: true,
          description: 'Motor do bot do CryptoAI Investor (instalado sob demanda)',
          dependencies: { [ENGINE_NOME]: versao }
        },
        null,
        2
      ) + '\n'
    );
    avisar('preparando', `preparando instalação do motor ${ENGINE_NOME} em ${dir}`);
  } catch (erro) {
    return { ok: false, erro: `não foi possível preparar a instalação: ${erro.message}`, dir };
  }

  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const args = ['install', '--no-audit', '--no-fund', '--loglevel=error'];

  const resultado = await new Promise((resolve) => {
    let saida = '';
    let cmd;
    try {
      cmd = spawn(npm, args, { cwd: dir, shell: process.platform === 'win32', windowsHide: true });
    } catch (erro) {
      return resolve({ codigo: -1, saida: erro.message });
    }
    cmd.stdout.on('data', (d) => {
      const texto = d.toString();
      saida += texto;
      texto.split('\n').filter(Boolean).forEach((l) => avisar('instalando', l.trim()));
    });
    cmd.stderr.on('data', (d) => {
      const texto = d.toString();
      saida += texto;
      texto.split('\n').filter(Boolean).forEach((l) => avisar('instalando', l.trim()));
    });
    cmd.on('error', (erro) => resolve({ codigo: -1, saida: `${saida}\n${erro.message}` }));
    cmd.on('close', (codigo) => resolve({ codigo, saida }));
  });

  if (resultado.codigo !== 0) {
    return {
      ok: false,
      dir,
      erro:
        resultado.saida.trim().split('\n').slice(-4).join(' ') ||
        `npm install terminou com código ${resultado.codigo}`
    };
  }

  // o motor acabou de chegar: recarrega os módulos desse diretório
  registrarDiretorioDeModulo(path.join(dir, 'node_modules'));
  cache = null;
  carregando = null;

  if (!(await motorInstalado())) {
    return { ok: false, dir, erro: 'npm install terminou, mas o pacote coinmind não pôde ser carregado' };
  }

  avisar('pronto', 'motor instalado e carregado');
  return { ok: true, instalado: true, dir, versao, mensagem: 'Motor CoinMind instalado com sucesso' };
}

/**
 * Aplica configuração (corretora, modo, estratégia, capital, chaves).
 * Ex.: { modo: 'testnet', estrategia: 'momentum', capital: 5000,
 *        chaves: { binance: { apiKey, secret } } }
 */
async function configurar(opcoes = {}) {
  const core = await carregar();
  const atual = core.config.lerConfig();
  const parcial = {};

  if (opcoes.corretora) parcial.corretora = String(opcoes.corretora).toLowerCase();
  if (opcoes.modo || opcoes.testnet === true || opcoes.real === true) {
    parcial.modo = opcoes.real === true ? 'real' : opcoes.testnet === true ? 'testnet' : opcoes.modo;
    if (!['real', 'testnet'].includes(parcial.modo)) {
      throw new Error(`Modo inválido: "${parcial.modo}" (use "testnet" ou "real")`);
    }
  }

  const nomeEstrategia = opcoes.estrategia ? String(opcoes.estrategia).toLowerCase() : null;
  if (nomeEstrategia) {
    if (!core.ESTRATEGIAS[nomeEstrategia]) {
      throw new Error(
        `Estratégia inválida: "${nomeEstrategia}". Opções: ${Object.keys(core.ESTRATEGIAS).join(', ')}`
      );
    }
    const base = atual.estrategia?.nome === nomeEstrategia ? atual.estrategia.cfg || {} : {};
    const cfgBruto = opcoes.cfg || opcoes.parametros || {};
    const cfg = { ...base };
    const pct = core.config.pctParaFrac;
    const mapa = { queda: 'queda', lucro: 'lucroAlvo', lucroAlvo: 'lucroAlvo', stop: 'stopLoss', stopLoss: 'stopLoss' };
    for (const [chave, valor] of Object.entries(cfgBruto)) {
      const destino = mapa[chave] || chave;
      cfg[destino] = ['queda', 'lucroAlvo', 'stopLoss'].includes(destino) ? pct(Number(valor)) : valor;
    }
    parcial.estrategia = { nome: nomeEstrategia, cfg };
  }

  if (opcoes.chaves && typeof opcoes.chaves === 'object') parcial.chaves = opcoes.chaves;

  if (opcoes.capital !== undefined || opcoes.limites || opcoes.moedas) {
    parcial.bot = {
      ...BOT_PADRAO,
      ...(atual.bot || {}),
      ...(opcoes.capital !== undefined ? { capital: Number(opcoes.capital) } : {}),
      ...(opcoes.limites ? { limites: opcoes.limites } : {}),
      ...(opcoes.moedas ? { moedas: [].concat(opcoes.moedas).map((m) => String(m).toUpperCase()) } : {}),
      ...(opcoes.intervalo !== undefined ? { intervalo: Number(opcoes.intervalo) } : {})
    };
  }

  if (Object.keys(parcial).length) core.config.salvarConfig(parcial);
  const conf = garantirConfiguracao(core);

  // capital inicial informado => reinicia a carteira paper com esse valor
  if (opcoes.reiniciarCarteira && opcoes.capital !== undefined) {
    core.carteira.reiniciar(Number(opcoes.capital));
  }

  return {
    ok: true,
    config: conf,
    caminho: path.join(core.dirDados, 'config.json'),
    carteira: core.carteira.caminhoCarteira(),
    reiniciada: !!opcoes.reiniciarCarteira
  };
}

// ── informações do motor ────────────────────────────────────────────────────

async function info() {
  const core = await carregar();
  const conf = garantirConfiguracao(core);
  const carteira = core.carteira.carregar();
  const ia = conf.ia || (conf.chaves && conf.chaves.ia) || null;

  return {
    disponivel: true,
    engine: ENGINE_NOME,
    versao: core.VERSAO,
    nome: 'CoinMind',
    dirDados: core.dirDados,
    configPath: path.join(core.dirDados, 'config.json'),
    carteiraPath: core.carteira.caminhoCarteira(),
    corretora: conf.corretora,
    modo: conf.modo || 'testnet',
    iaConfigurada: core.agente.iaConfigurada(ia),
    estrategia: {
      nome: conf.estrategia?.nome || ESTRATEGIA_PADRAO,
      nomeBonito: core.ESTRATEGIAS[conf.estrategia?.nome || ESTRATEGIA_PADRAO]?.nome || ESTRATEGIA_PADRAO,
      emoji: core.ESTRATEGIAS[conf.estrategia?.nome || ESTRATEGIA_PADRAO]?.emoji || '🎣',
      descricao: core.ESTRATEGIAS[conf.estrategia?.nome || ESTRATEGIA_PADRAO]?.desc || '',
      parametros: core.configEstrategia(
        conf.estrategia?.nome || ESTRATEGIA_PADRAO,
        conf.estrategia?.cfg || {}
      )
    },
    estrategias: Object.entries(core.ESTRATEGIAS).map(([id, e]) => ({ id, ...e })),
    corretoras: Object.values(core.corretoras.CORRETORAS).map((c) => ({
      id: c.id,
      nome: c.nome,
      testnet: !!c.suportaTestnet,
      configurada: core.corretoras.configurada(c.id)
    })),
    moedas: core.CATALOGO.map((m) => ({
      simbolo: m.simbolo,
      nome: m.nome,
      emoji: m.emoji,
      categoria: m.categoria,
      precoBase: m.precoBase
    })),
    carteira: {
      saldo: carteira.saldo,
      capitalInicial: carteira.capitalInicial,
      posicoes: Object.keys(carteira.posicoes || {}).length,
      operacoes: (carteira.operacoes || []).length
    },
    limites: conf.bot?.limites || core.agente.LIMITES_PADRAO
  };
}

/** Tabela de cotações do mercado simulado (executa `ciclos` ticks antes). */
async function mercado(ciclos = 1, semente = null) {
  const core = await carregar();
  const m = new core.Mercado(new core.RNG(semente ?? undefined));
  for (let i = 0; i < Math.max(1, Number(ciclos) || 1); i++) m.tick();
  return {
    ok: true,
    ciclo: m.ciclo,
    moedas: m.moedas.map((c) => ({
      simbolo: c.simbolo,
      nome: c.nome,
      emoji: c.emoji,
      categoria: c.categoria,
      preco: c.preco,
      abertura: c.abertura,
      maxima: c.max,
      minima: c.min === Infinity ? c.preco : c.min,
      variacao: m.variacao(c),
      historico: [...c.historico]
    }))
  };
}

// ── parecer do cérebro do CoinMind sobre uma série REAL de preços ───────────

/**
 * Roda a estratégia salva do CoinMind sobre uma série de preços (as velas
 * reais que o bot já baixa da corretora) e devolve a proposta de operação.
 * É isso que faz o CoinMind "pilotar" o bot.
 */
async function avaliarSerie(opcoes = {}) {
  const core = await carregar();
  const conf = garantirConfiguracao(core);

  const simbolo = String(opcoes.simbolo || '').toUpperCase().replace(/USDT$/, '');
  const precos = (opcoes.precos || []).map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (!simbolo) throw new Error('avaliarSerie: informe o símbolo (ex: BTC)');
  if (precos.length < 6) {
    return {
      disponivel: true,
      avaliado: false,
      engine: ENGINE_NOME,
      versao: core.VERSAO,
      motivo: `série curta para análise (${precos.length} pontos, mínimo 6)`
    };
  }

  const nomeEstrategia = String(
    opcoes.estrategia || conf.estrategia?.nome || ESTRATEGIA_PADRAO
  ).toLowerCase();
  if (!core.ESTRATEGIAS[nomeEstrategia]) {
    throw new Error(`Estratégia inválida: "${nomeEstrategia}"`);
  }

  const parametros = core.configEstrategia(nomeEstrategia, {
    ...(conf.estrategia?.nome === nomeEstrategia ? conf.estrategia.cfg || {} : {}),
    ...(opcoes.cfg || {})
  });

  const posicao = opcoes.posicao && Number(opcoes.posicao.precoMedio) > 0
    ? {
        [simbolo]: {
          qtd: Number(opcoes.posicao.qtd || 0),
          precoMedio: Number(opcoes.posicao.precoMedio),
          investido: Number(opcoes.posicao.investido || 0)
        }
      }
    : {};

  const propostas = core.agente.decidirTick(
    nomeEstrategia,
    { [simbolo]: precos },
    posicao,
    parametros,
    Number(opcoes.tickCount || precos.length)
  );
  const proposta = propostas[0] || null;

  const janela = precos.slice(-(parametros.janela || 60));
  const maxima = Math.max(...janela);
  const minima = Math.min(...janela);
  const atual = precos[precos.length - 1];
  const retorno = posicao[simbolo] ? atual / posicao[simbolo].precoMedio - 1 : null;

  return {
    disponivel: true,
    avaliado: true,
    engine: ENGINE_NOME,
    versao: core.VERSAO,
    estrategia: nomeEstrategia,
    estrategiaNome: core.ESTRATEGIAS[nomeEstrategia].nome,
    emoji: core.ESTRATEGIAS[nomeEstrategia].emoji,
    acao: proposta ? proposta.acao : null, // 'compra' | 'venda' | null
    tipo: proposta ? proposta.tipo : null,
    motivo: proposta ? proposta.motivo : 'sem gatilho da estratégia',
    parametros,
    preco: atual,
    descontoDaMaximaPct: (1 - atual / maxima) * 100,
    altaDesdeMinimaPct: (atual / minima - 1) * 100,
    retornoPosicaoPct: retorno === null ? null : retorno * 100
  };
}

// ── sessão de trading (mercado simulado + carteira + estratégia) ─────────────

/**
 * Cria uma sessão: mercado simulado vivo, carteira paper persistente e a
 * estratégia salva no CoinMind. Usada tanto pelo "rodar N ciclos" quanto pelo
 * modo contínuo do bot no app.
 */
async function criarSessao(opcoes = {}) {
  const core = await carregar();
  const conf = garantirConfiguracao(core);
  const botCfg = { ...BOT_PADRAO, ...(conf.bot || {}), ...(opcoes.bot || {}) };

  const estrategia = String(opcoes.estrategia || conf.estrategia?.nome || ESTRATEGIA_PADRAO).toLowerCase();
  if (!core.ESTRATEGIAS[estrategia]) {
    throw new Error(`Estratégia inválida: "${estrategia}". Opções: ${Object.keys(core.ESTRATEGIAS).join(', ')}`);
  }

  const parametros = core.configEstrategia(estrategia, {
    ...(conf.estrategia?.nome === estrategia ? conf.estrategia.cfg || {} : {}),
    ...(opcoes.cfg || {})
  });

  const capital = Number(opcoes.capital ?? botCfg.capital ?? CAPITAL_PADRAO);
  const arquivo = core.carteira.caminhoCarteira();
  let carteira;
  if (opcoes.reiniciar || !fs.existsSync(arquivo)) {
    carteira = core.carteira.reiniciar(capital);
  } else {
    carteira = core.carteira.carregar();
    if (capital > 0 && Math.abs(Number(carteira.capitalInicial || 0) - capital) > 0.01 && opcoes.ajustarCapital) {
      carteira = core.carteira.reiniciar(capital);
    }
  }

  const mercado = new core.Mercado(new core.RNG(opcoes.semente ?? botCfg.semente ?? undefined));
  const limites = botCfg.limites || core.agente.LIMITES_PADRAO;
  const aplicarLimites = opcoes.aplicarLimites ?? botCfg.aplicarLimites ?? false;
  const moedasPermitidas = opcoes.moedas || botCfg.moedas || null;

  const estado = {
    ciclo: 0,
    trades: [],
    eventos: [],
    curva: [core.valorTotal(carteira, mercado)],
    bloqueadas: [],
    limites: {
      dia: new Date().toISOString().slice(0, 10),
      realizadoDia: 0,
      posicoes: carteira.posicoes,
      ultimoTradeEm: 0
    }
  };

  function resumo() {
    const total = core.valorTotal(carteira, mercado);
    const posicoes = Object.entries(carteira.posicoes || {}).map(([simbolo, pos]) => {
      const m = mercado.moedas.find((x) => x.simbolo === simbolo);
      const preco = m ? m.preco : pos.precoMedio;
      const valor = pos.qtd * preco;
      const lucro = pos.qtd * (preco - pos.precoMedio);
      return {
        simbolo,
        emoji: m ? m.emoji : '🪙',
        nome: m ? m.nome : simbolo,
        qtd: pos.qtd,
        precoMedio: pos.precoMedio,
        preco,
        investido: pos.investido,
        valor,
        lucro,
        retornoPct: pos.precoMedio > 0 ? (preco / pos.precoMedio - 1) * 100 : 0
      };
    });

    return {
      ok: true,
      engine: ENGINE_NOME,
      versao: core.VERSAO,
      ciclo: estado.ciclo,
      estrategia,
      estrategiaNome: core.ESTRATEGIAS[estrategia].nome,
      emoji: core.ESTRATEGIAS[estrategia].emoji,
      parametros,
      saldo: carteira.saldo,
      capitalInicial: carteira.capitalInicial,
      patrimonio: total,
      resultado: total - carteira.capitalInicial,
      resultadoPct: (total / carteira.capitalInicial - 1) * 100,
      pnlRealizado: core.pnlRealizado(carteira),
      pnlNaoRealizado: core.pnlNaoRealizado(carteira, mercado),
      operacoes: (carteira.operacoes || []).length,
      posicoes,
      trades: estado.trades.slice(-60),
      bloqueadas: estado.bloqueadas.slice(-20),
      eventos: estado.eventos.slice(-30),
      curva: estado.curva.slice(-120),
      aplicarLimites,
      limites,
      moedas: mercado.moedas.length,
      caminhoCarteira: core.carteira.caminhoCarteira()
    };
  }

  /** Avança 1 ciclo do mercado e executa a estratégia. */
  function tick() {
    estado.eventos.push(...mercado.tick());
    estado.ciclo += 1;

    let propostas = core.decidir(estrategia, mercado, carteira, parametros);
    if (moedasPermitidas && moedasPermitidas.length) {
      propostas = propostas.filter((p) => moedasPermitidas.includes(p.simbolo));
    }

    const permitidas = [];
    for (const proposta of propostas) {
      const comTipo = { ...proposta, tipo: proposta.acao === 'venda' ? 'saida' : 'entrada' };
      if (aplicarLimites && moedasPermitidas === null) {
        const bloqueio = core.agente.limiteBloqueia(comTipo, estado.limites, limites, parametros);
        if (bloqueio) {
          estado.bloqueadas.push({ ciclo: estado.ciclo, ...comTipo, bloqueio });
          continue;
        }
      } else if (aplicarLimites) {
        const bloqueio = core.agente.limiteBloqueia(comTipo, estado.limites, limites, parametros);
        if (bloqueio && comTipo.tipo !== 'saida') {
          estado.bloqueadas.push({ ciclo: estado.ciclo, ...comTipo, bloqueio });
          continue;
        }
      }
      permitidas.push(comTipo);
    }

    const feitas = core.executar(mercado, carteira, permitidas, estado.ciclo);

    for (const f of feitas) {
      const moeda = mercado.moedas.find((x) => x.simbolo === f.simbolo);
      const registro = {
        ciclo: estado.ciclo,
        simbolo: f.simbolo,
        emoji: moeda ? moeda.emoji : '🪙',
        acao: f.acao,
        usd: f.acao === 'compra' ? f.usd : null,
        bruto: f.acao === 'venda' ? f.usd : null,
        qtd: f.qtd,
        preco: f.preco,
        lucro: f.lucro ?? null,
        retornoPct: f.retornoPct ?? null,
        motivo: f.motivo,
        quando: new Date().toISOString()
      };
      estado.trades.push(registro);
      if (f.acao === 'venda' && Number.isFinite(registro.lucro)) {
        estado.limites.realizadoDia += registro.lucro;
      }
      estado.limites.ultimoTradeEm = Date.now();
    }

    estado.limites.posicoes = carteira.posicoes;
    core.carteira.salvar(carteira);
    estado.curva.push(core.valorTotal(carteira, mercado));
    if (estado.curva.length > 2000) estado.curva.shift();

    return {
      ciclo: estado.ciclo,
      trades: feitas.length ? estado.trades.slice(-(feitas.length)) : [],
      eventos: estado.eventos.slice(-(mercado.moedas.length)),
      resumo: resumo()
    };
  }

  return { tick, resumo, carteira: () => carteira, mercado: () => mercado, estado };
}

/** Roda N ciclos e devolve o relatório completo (equivalente a "coinmind rodar"). */
async function rodar(opcoes = {}) {
  const ciclos = Math.max(1, Number(opcoes.ciclos ?? CICLOS_PADRAO));
  const intervalo = Math.max(0, Number(opcoes.intervalo ?? 0));
  const sessao = await criarSessao(opcoes);
  const progresso = [];

  for (let i = 1; i <= ciclos; i++) {
    const resultado = sessao.tick();
    progresso.push({
      ciclo: resultado.ciclo,
      trades: resultado.trades.map((t) => `${t.acao} ${t.simbolo}`),
      patrimonio: resultado.resumo.patrimonio
    });
    if (typeof opcoes.aoCiclo === 'function') opcoes.aoCiclo(resultado);
    if (i < ciclos && intervalo > 0) await sleep(intervalo);
  }

  const resumo = sessao.resumo();
  return { ...resumo, ciclosExecutados: ciclos, progresso: progresso.slice(-ciclos) };
}

// ── modo contínuo (usado pelo bot do app) ───────────────────────────────────

let loop = null;

async function iniciar(opcoes = {}) {
  if (loop) return { ok: true, jaRodando: true, ...status() };

  const sessao = await criarSessao(opcoes);
  const intervalo = Math.max(200, Number(opcoes.intervalo ?? opcoes.bot?.intervalo ?? INTERVALO_PADRAO));
  const historico = [];

  loop = {
    sessao,
    intervalo,
    iniciadoEm: new Date().toISOString(),
    ultimo: null,
    historico,
    timer: null,
    rodando: false,
    erro: null
  };

  loop.timer = setInterval(() => {
    if (!loop || loop.rodando) return;
    loop.rodando = true;
    try {
      const resultado = sessao.tick();
      loop.ultimo = resultado.resumo;
      historico.push(...resultado.trades);
      if (historico.length > 500) historico.splice(0, historico.length - 500);
      if (typeof loop.onTick === 'function') loop.onTick(resultado);
    } catch (erro) {
      loop.erro = erro.message;
    } finally {
      loop.rodando = false;
    }
  }, intervalo);
  if (loop.timer.unref) loop.timer.unref();

  return { ok: true, iniciado: true, intervalo, ...status() };
}

function parar() {
  if (!loop) return { ok: true, parado: true, jaParado: true };
  clearInterval(loop.timer);
  const resumo = loop.ultimo || loop.sessao.resumo();
  loop = null;
  return { ok: true, parado: true, ultimo: resumo };
}

function status() {
  if (!loop) return { ok: true, rodando: false, resumo: null, intervalo: null, iniciadoEm: null, erro: null };
  return {
    ok: true,
    rodando: true,
    intervalo: loop.intervalo,
    iniciadoEm: loop.iniciadoEm,
    erro: loop.erro,
    ultimoCiclo: loop.ultimo ? loop.ultimo.ciclo : 0,
    operacoes: (loop.historico || []).length,
    resumo: loop.ultimo
  };
}

/** Assina eventos do modo contínuo (trades em tempo real no renderer). */
function aoViverTicK(callback) {
  if (loop) loop.onTick = callback;
  else console.warn('[CoinMind] inicie o modo contínuo antes de assinar os ticks');
}

// ── carteira paper ──────────────────────────────────────────────────────────

async function carteiraInfo() {
  const core = await carregar();
  const carteira = core.carteira.carregar();
  const conf = garantirConfiguracao(core);
  const capital = Number(conf.bot?.capital ?? carteira.capitalInicial ?? CAPITAL_PADRAO);
  const mercadoSimulado = new core.Mercado(new core.RNG(1));
  return {
    ok: true,
    engine: ENGINE_NOME,
    versao: core.VERSAO,
    caminho: core.carteira.caminhoCarteira(),
    saldo: carteira.saldo,
    capitalInicial: carteira.capitalInicial,
    criadaEm: carteira.criadaEm,
    pnlRealizado: core.pnlRealizado(carteira),
    posicoes: Object.entries(carteira.posicoes || {}).map(([simbolo, pos]) => ({
      simbolo,
      qtd: pos.qtd,
      precoMedio: pos.precoMedio,
      investido: pos.investido
    })),
    operacoes: (carteira.operacoes || []).slice(-100),
    capitalConfigurado: capital,
    mercadoReferencia: mercadoSimulado.moedas.length
  };
}

async function reiniciarCarteira(capital = CAPITAL_PADRAO) {
  const core = await carregar();
  const carteira = core.carteira.reiniciar(Number(capital) || CAPITAL_PADRAO);
  return {
    ok: true,
    saldo: carteira.saldo,
    capitalInicial: carteira.capitalInicial,
    caminho: core.carteira.caminhoCarteira()
  };
}

// ── ordens REAIS (testnet por padrão) ───────────────────────────────────────

const mascarar = (chave) => (chave ? `••••${String(chave).slice(-4)}` : '(ausente)');

/**
 * Monta o contexto de corretora do CoinMind de forma tolerante: sem chaves
 * ainda dá para consultar preço público e usar --prever (dry-run).
 */
async function contextoCorretora(opcoes = {}) {
  const core = await carregar();
  const conf = garantirConfiguracao(core);
  const corretora = opcoes.corretora ? String(opcoes.corretora).toLowerCase() : conf.corretora;
  const modo = opcoes.real ? 'real' : opcoes.testnet ? 'testnet' : opcoes.modo || conf.modo || 'testnet';
  return core.corretoras.contexto({
    corretora,
    modo,
    precoPublico: true,
    permitirSemCredenciais: true
  });
}

async function corretoras() {
  const core = await carregar();
  const conf = garantirConfiguracao(core);
  const atual = core.config.lerConfig();
  return {
    ok: true,
    corretoraPadrao: conf.corretora,
    modo: conf.modo,
    lista: Object.values(core.corretoras.CORRETORAS).map((c) => ({
      id: c.id,
      nome: c.nome,
      suportaTestnet: !!c.suportaTestnet,
      dicaTestnet: c.dicaTestnet || null,
      configuravel: true,
      configurada: core.corretoras.configurada(c.id),
      chave: mascarar(atual.chaves?.[c.id]?.apiKey)
    }))
  };
}

/** Preço real (público) de um par, sem precisar de chaves. */
async function precoReal(simbolo, quote = 'USDT', opcoes = {}) {
  const ctx = await contextoCorretora(opcoes);
  const preco = await ctx.mod.preco(ctx.cfg, String(simbolo).toUpperCase(), String(quote).toUpperCase());
  return {
    ok: true,
    corretora: ctx.id,
    corretoraNome: ctx.mod.nome,
    modo: ctx.modo,
    simbolo: `${String(simbolo).toUpperCase()}${String(quote).toUpperCase()}`,
    preco
  };
}

/** Saldos reais na corretora configurada. */
async function saldosReais(opcoes = {}) {
  const ctx = await contextoCorretora(opcoes);
  const saldos = await ctx.mod.saldo(ctx.cfg);
  return {
    ok: true,
    corretora: ctx.id,
    modo: ctx.modo,
    chave: mascarar(ctx.cfg.apiKey),
    saldos
  };
}

/**
 * Ordem a mercado de verdade. Sempre segura:
 *   · testnet por padrão (nada real acontece sem modo 'real' explícito)
 *   · `prever: true` = dry-run, mostra a ordem e NÃO envia
 *   · exige confirmar: true para enviar (o app pede confirmação na UI)
 */
async function ordemReal(opcoes = {}) {
  const core = await carregar();
  const ctx = await contextoCorretora(opcoes);
  const lado = String(opcoes.lado || opcoes.side || '').toLowerCase();
  if (!['compra', 'venda'].includes(lado)) throw new Error('Informe lado: "compra" ou "venda"');

  const simbolo = String(opcoes.simbolo || '').toUpperCase().replace(/USDT$/, '');
  if (!simbolo) throw new Error('Informe a moeda (ex: BTC)');
  const quote = String(opcoes.quote || 'USDT').toUpperCase();

  const ordem = { lado, simbolo, quote };
  if (lado === 'compra') {
    const usd = Number(opcoes.usd ?? opcoes.valor);
    if (!Number.isFinite(usd) || usd <= 0) throw new Error('Informe o valor em US$ (ex: usd: 25)');
    ordem.usd = usd;
  } else {
    let qtd = opcoes.qtd ?? opcoes.quantidade;
    if (qtd === 'tudo' || qtd === 'all' || qtd === 'max' || opcoes.tudo) {
      const saldos = await ctx.mod.saldo(ctx.cfg);
      const pos = saldos.find((s) => s.ativo === simbolo);
      if (!pos) throw new Error(`Você não tem ${simbolo} na ${ctx.mod.nome}.`);
      qtd = pos.livre;
    }
    const qtdNum = Number(qtd);
    if (!Number.isFinite(qtdNum) || qtdNum <= 0) throw new Error('Informe a quantidade (qtd) ou use "tudo"');
    ordem.qtd = qtdNum;
  }

  let preco = null;
  try {
    preco = await ctx.mod.preco(ctx.cfg, simbolo, quote);
  } catch { /* preço é só informativo */ }

  const previa = {
    ok: true,
    previa: true,
    enviada: false,
    corretora: ctx.id,
    corretoraNome: ctx.mod.nome,
    modo: ctx.modo,
    ordem,
    preco,
    chave: mascarar(ctx.cfg.apiKey),
    aviso:
      ctx.modo === 'real'
        ? 'MODO REAL: esta ordem gasta dinheiro de verdade. Confirme antes de enviar.'
        : 'TESTNET: dinheiro de mentira (seguro).'
  };

  if (opcoes.prever || opcoes.dryRun || opcoes.confirmar !== true) return previa;

  const resultado = await ctx.mod.criarOrdem(ctx.cfg, ordem);
  let status = null;
  try {
    status = await ctx.mod.consultarOrdem(ctx.cfg, resultado.par, resultado.idOrdem);
  } catch { /* nem toda corretora devolve status imediato */ }

  return {
    ok: true,
    previa: false,
    enviada: true,
    corretora: ctx.id,
    corretoraNome: ctx.mod.nome,
    modo: ctx.modo,
    ordem,
    preco,
    resultado: { ...resultado, ...(status || {}) },
    aviso: previa.aviso
  };
}

// ── teste rápido do motor (usado pelo botão "Testar" no app) ────────────────

async function testar() {
  const core = await carregar();
  const conf = garantirConfiguracao(core);
  const sessao = await criarSessao({ ciclos: 0, semente: 7 });
  for (let i = 0; i < 5; i++) sessao.tick();
  const parecer = await avaliarSerie({
    simbolo: 'BTC',
    precos: sessao.mercado().moeda('BTC').historico,
    tickCount: 5
  });

  const corretora = core.corretoras.contexto({
    corretora: conf.corretora,
    precoPublico: true,
    permitirSemCredenciais: true
  });

  let precoPublico = null;
  try {
    precoPublico = await corretora.mod.preco(corretora.cfg, 'BTC', 'USDT');
  } catch { /* offline é ok */ }

  return {
    ok: true,
    engine: ENGINE_NOME,
    versao: core.VERSAO,
    mensagem: `CoinMind v${core.VERSAO} pronto — estratégia ${conf.estrategia?.nome || ESTRATEGIA_PADRAO}, modo ${conf.modo || 'testnet'}`,
    corretora: corretora.id,
    modo: corretora.modo,
    precoBtcPublico: precoPublico,
    parecer,
    carteira: sessao.resumo()
  };
}

module.exports = {
  ENGINE_NOME,
  ESTRATEGIA_PADRAO,
  CAPITAL_PADRAO,
  CICLOS_PADRAO,
  INTERVALO_PADRAO,
  BOT_PADRAO,
  CAMPOS_ESTRATEGIA,

  carregar,
  tentarCarregar,
  motorInstalado,
  instalarMotor,
  registrarDiretorioDeModulo,
  definirDirInstalacao,
  dirMotor,
  dirDados,
  padroes,
  info,
  configurar,
  lerConfiguracoes,
  garantirConfiguracao,

  mercado,
  avaliarSerie,
  criarSessao,
  rodar,
  iniciar,
  parar,
  status,
  aoViverTicK,

  carteiraInfo,
  reiniciarCarteira,

  corretoras,
  contextoCorretora,
  precoReal,
  saldosReais,
  ordemReal,

  testar,

  /** Último erro de carregamento do pacote coinmind (diagnóstico). */
  get ultimoErro() {
    return ultimoErro;
  }
};
