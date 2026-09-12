# 🪙 CryptoAI Investor

AI-Powered Crypto Investment Desktop Application

![CryptoAI Investor](build/icon.png)

## 🤖 O bot agora roda com o motor **CoinMind**

A partir da **v1.9.0** o bot do app usa o [**coinmind**](https://www.npmjs.com/package/coinmind)
(`github.com/Pedro21062014/coinmind`) como motor:

- 🎣 **Estratégias automáticas** — `dip` (compra em quedas), `momentum` (cruzamento de médias) e `dca` (compra programada)
- 🧠 **Parecer do CoinMind dentro de cada análise** — a estratégia salva roda sobre as velas reais que o bot já baixa, somando confiança (ou segurando) o sinal técnico
- 💼 **Carteira paper persistente** — posições, preço médio, P&L realizado/não realizado em `~/.coinmind/carteira.json`
- 🛡️ **Limites duros de risco** — valor máximo por ordem, posição total, **perda diária que desliga o robô** e cooldown entre trades
- 🔥 **Ordens REAIS** em **Binance**, **Bybit** e **OKX** — **testnet por padrão**, com `--prever` (dry-run) antes de qualquer envio
- ⚙️ **Zero configuração inicial** — o motor já sobe com Binance · testnet · estratégia `dip` e **nunca sobrescreve** o que você já configurou

A configuração e o estado ficam em `~/.coinmind/` (`config.json`, `carteira.json`).
Tudo que o CLI do coinmind sabe fazer continua valendo — o bot só usa a mesma base.

### 🧩 Criar Bot já vem com os padrões da dependência

Ao abrir **Criar Bot**, o modal preenche sozinho tudo o que a dependência define:

- **Estratégia** (`dip` 🎣 por padrão) com os parâmetros padrão: lote US$ 150, queda 5%, lucro-alvo 6%, stop-loss 8%, janela 24
- **Limites duros de risco**: US$ 25 por ordem, US$ 100 em posições, perda diária de US$ 50 que desliga o robô, cooldown de 300s e a lista de moedas permitidas
- **Capital paper** (US$ 10.000) e **ciclos por rodada** (40)
- **Modo** testnet por padrão, com botão *Restaurar padrões* para voltar ao de fábrica

O que você salvar ali vai direto para o `~/.coinmind/config.json` e é o que o robô usa.

### ⚠️ Motor não instalado? O app avisa e instala

Se o pacote `coinmind` não estiver presente (instalação nova, `node_modules`
limpo, etc.), o app **avisa** — na tela do bot e no próprio modal — e instala
**na hora** um `npm install coinmind` num diretório próprio do app
(`<userData>/engine`), com o progresso aparecendo na interface. Depois disso o
bot já sobe pronto, sem você precisar fazer nada.

### Testar o motor sem abrir o app

```bash
npm run bot                       # 40 ciclos com a configuração salva
npm run bot -- --ciclos 80 --capital 1000
npm run bot -- --estrategia momentum --semente 42
npm run bot -- --limites          # aplica os limites duros de risco
npm run bot -- --info             # config + corretoras + carteira
npm run bot -- --testar           # teste completo do motor
npm run bot -- --preco BTC        # preço real (público, sem chave)
npm run bot -- --ordem comprar BTC 25 --prever   # prévia de ordem real
```

### Configurar corretora e modo (dentro do app ou pelo CLI)

```bash
npx coinmind config chaves --corretora binance --api-key SUA_KEY --secret SEU_SECRET
npx coinmind config modo --testnet    # dinheiro de mentira (padrão, seguro)
npx coinmind config estrategia dip --lote 120 --queda 5 --lucro 6 --stop 8
```

> ⚠️ O modo `real` movimenta **dinheiro de verdade**. O app nunca envia ordem real
> sem confirmação explícita (`confirmar: true`) e começa sempre em testnet.

## 🎨 Ícones do Gateway

Os logos da aba **Gateway** vêm do **[Iconify](https://icon-sets.iconify.design/)**
(glifo branco sobre o tile colorido de cada canal). As origens e a licença
de cada um estão em [`src/assets/logos/gateway/ICONES.md`](src/assets/logos/gateway/ICONES.md):

| Canal | Ícone Iconify | Coleção |
|-------|---------------|---------|
| Telegram | `simple-icons:telegram` | Simple Icons (CC0) |
| WhatsApp | `simple-icons:whatsapp` | Simple Icons (CC0) |
| WeChat | `simple-icons:wechat` | Simple Icons (CC0) |
| QQ | `simple-icons:tencentqq` | Simple Icons (CC0) |
| Discord | `simple-icons:discord` | Simple Icons (CC0) |
| E-mail | `mdi:email` | Material Design Icons (Apache 2.0) |
| Webhook | `mdi:webhook` | Material Design Icons (Apache 2.0) |

## 🚀 Features

- **Multi-Exchange Support**: Bybit, OKX, Binance, and custom exchanges
- **Multi-AI Support**: DeepSeek, OpenAI, Google AI, NVIDIA, Claude, OpenRouter, and custom providers
- **Automated Trading**: AI-driven analysis and trade execution
- **Bot Engine**: CoinMind (estratégias dip/momentum/dca, carteira paper, limites de risco, ordens reais)
- **Risk Management**: Configurable risk levels, max loss, drawdown limits
- **News & Sentiment Analysis**: Real-time crypto news and market sentiment
- **Modern UI**: Dark theme with gradient effects and smooth animations

## 📦 Download

Os instaladores de cada versão ficam na aba **Releases** (gerados pelo workflow
`Build & Release` a cada tag `vX.Y.Z`):

| Platform | File |
|----------|------|
| Windows | `CryptoAI Investor-<versão>-x64-Setup.exe` / `.zip` |
| Linux | `crypto-ai-investor_<versão>_amd64.deb` |

## 💱 Supported Exchanges

- **Bybit** - API v5 with HMAC-SHA256 signing
- **OKX** - API v5 with passphrase support
- **Binance** - API v3 with HMAC-SHA256 signing (spot + testnet)
- **Custom** - Any compatible exchange API

## 🤖 Supported AI Providers

- **DeepSeek** (deepseek-chat, deepseek-reasoner)
- **OpenAI** (GPT-4o, GPT-4o-mini, o1)
- **Google AI** (Gemini Pro, Flash, 1.5 Pro)
- **NVIDIA AI** (Llama 3.1, Nemotron, Mixtral)
- **Claude/Anthropic** (Sonnet 4, Opus, Haiku)
- **OpenRouter** (Access to all models)
- **Custom** (Any OpenAI-compatible API)

## 🛡️ Risk Management

- Configurable max risk level (Low/Medium/High/Extreme)
- Maximum loss per trade (% of portfolio)
- Maximum drawdown limit
- Position size limits
- Daily trade limits
- Loss cooldown periods
- Kelly Criterion position sizing
- **CoinMind**: max per order, max total position, daily-loss kill switch, whitelist de moedas

## 📰 News & Sentiment

- CoinGecko trending coins & market data
- CryptoCompare news feed
- Fear & Greed Index
- Automated sentiment analysis
- Market sentiment scoring

## ⚙️ AI Request Configuration

- Customizable request intervals
- Requests per hour limits
- Max tokens per request
- Continuous analysis mode
- Auto-trade with confirmation or fully automatic

## 🏗️ Development

```bash
# Install dependencies
npm install

# Run in development
npm start

# Run the bot tests (bot + CoinMind engine)
npm test

# Run the bot headless
npm run bot

# Build for current platform
npm run build

# Build for Windows
npm run build:win

# Build for Linux
npm run build:linux

# Build for all platforms
npm run build:all
```

### 🔁 Workflows (GitHub Actions)

| Workflow | Quando roda | O que faz |
|----------|-------------|-----------|
| `CI` | push na `main` / pull request | instala deps, roda `npm test` e o bot headless |
| `Build & Release` | tag `v*`, release publicado ou manual | testa, compila Windows (NSIS/zip) + Linux (deb) e **anexa os binários ao release** |

Publicar uma versão nova:

```bash
npm version patch     # ou minor/major -> cria a tag
git push --follow-tags
```

O workflow `Build & Release` cuida do resto: testa, builda e sobe os instaladores
no release da tag.

## 📋 Requirements

- Node.js 18+ (o app usa Node 20 no CI)
- npm 8+

## ⚠️ Disclaimer

This software is for educational purposes only. Trading cryptocurrencies involves significant risk. Always do your own research and never invest more than you can afford to lose. The developers are not responsible for any financial losses.

## 📄 License

MIT
