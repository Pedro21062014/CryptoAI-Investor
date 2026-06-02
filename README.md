# 🪙 CryptoAI Investor

AI-Powered Crypto Investment Desktop Application

![CryptoAI Investor](build/icon.png)

## 🚀 Features

- **Multi-Exchange Support**: Bybit, OKX, Binance, and custom exchanges
- **Multi-AI Support**: DeepSeek, OpenAI, Google AI, NVIDIA, Claude, OpenRouter, and custom providers
- **Automated Trading**: AI-driven analysis and trade execution
- **Risk Management**: Configurable risk levels, max loss, drawdown limits
- **News & Sentiment Analysis**: Real-time crypto news and market sentiment
- **Modern UI**: Dark theme with gradient effects and smooth animations

## 📦 Download

| Platform | File |
|----------|------|
| Windows | `CryptoAI_Investor_1.0.0.exe` (Portable) |
| Linux | `crypto-ai-investor_1.0.0_amd64.deb` |

## 💱 Supported Exchanges

- **Bybit** - API v5 with HMAC-SHA256 signing
- **OKX** - API v5 with passphrase support
- **Binance** - API v3 with HMAC-SHA256 signing
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

# Build for current platform
npm run build

# Build for Windows
npm run build:win

# Build for Linux
npm run build:linux

# Build for all platforms
npm run build:all
```

## 📋 Requirements

- Node.js 18+
- npm 8+

## ⚠️ Disclaimer

This software is for educational purposes only. Trading cryptocurrencies involves significant risk. Always do your own research and never invest more than you can afford to lose. The developers are not responsible for any financial losses.

## 📄 License

MIT
