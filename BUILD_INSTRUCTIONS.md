# CryptoAI Investor - Scripts de Build e Release

Este repositório inclui scripts de build/release **e workflows de CI/CD** (GitHub Actions).

## 🤖 Workflows (recomendado)

| Workflow | Arquivo | Quando roda | O que faz |
|----------|---------|-------------|-----------|
| `CI` | `.github/workflows/ci.yml` | push na `main` e pull requests | instala deps, roda `npm test` e o bot headless (`npm run bot`) |
| `Build & Release` | `.github/workflows/release.yml` | tag `v*`, release publicado ou execução manual | testa → compila Windows (NSIS/zip) + Linux (deb) → **anexa os binários ao release da tag** |

Fluxo para publicar uma versão:

```bash
npm version patch        # ou minor / major — cria a tag vX.Y.Z
git push --follow-tags   # dispara o workflow Build & Release
```

Para rodar manualmente: **Actions → Build & Release → Run workflow** (pode informar a tag).

## 🧪 Testar o bot (sem build)

```bash
npm ci --ignore-scripts   # deps de teste (sem baixar o Electron)
npm test                  # testes do bot + motor CoinMind
npm run bot -- --ciclos 40 --capital 1000
npm run bot -- --info
```

O motor do bot é o pacote npm [`coinmind`](https://www.npmjs.com/package/coinmind)
(declarado em `dependencies` e desempacotado do asar em `build.asarUnpack`).
Estado e configuração ficam em `~/.coinmind/` (`config.json`, `carteira.json`).

## 📜 Scripts locais (sem CI)

## 📦 Scripts Disponíveis

### Windows (`build-windows.bat`)
Script batch para construir o instalador Windows (.exe) e pacote Linux (.deb).

**Requisitos:**
- Node.js instalado (https://nodejs.org/)
- npm (incluído com Node.js)

**Como usar:**
1. Abra o Prompt de Comando ou PowerShell
2. Navegue até a pasta do projeto
3. Execute: `build-windows.bat`

### Linux (`build-linux.sh`)
Script bash para construir o pacote Linux (.deb) e instalador Windows (.exe).

**Requisitos:**
- Node.js instalado
- npm (incluído com Node.js)

**Como usar:**
```bash
chmod +x build-linux.sh
./build-linux.sh
```

### Python (`create_release.py`)
Script Python para criar um release no GitHub e fazer upload dos arquivos de build.

**Requisitos:**
- Python 3.x
- Biblioteca `requests`: `pip install requests`
- Token do GitHub configurado no script

**Como usar:**
```bash
# Instalar dependência
pip install requests

# Criar release com a versão do package.json
python create_release.py

# Ou especificar uma tag personalizada
python create_release.py v1.7.2
```

## 🚀 Fluxo de Trabalho Completo

### No Windows:
```batch
REM 1. Executar o build
build-windows.bat

REM 2. Instalar dependências do Python (se necessário)
pip install requests

REM 3. Criar release no GitHub
python create_release.py
```

### No Linux:
```bash
# 1. Tornar o script executável
chmod +x build-linux.sh

# 2. Executar o build
./build-linux.sh

# 3. Instalar dependências do Python (se necessário)
pip install requests

# 4. Criar release no GitHub
python3 create_release.py
```

## 📁 Estrutura de Saída

Após o build, os arquivos serão gerados na pasta `dist/`:

- **Windows**: `CryptoAI Investor-{version}-{arch}-Setup.exe`
- **Linux**: `crypto-ai-investor_{version}_{arch}.deb`

## 🔧 Configuração do Token GitHub

O token já está configurado no script `create_release.py`. Para segurança, você pode:

1. Usar variáveis de ambiente:
   ```python
   import os
   GITHUB_TOKEN = os.environ.get('GITHUB_TOKEN')
   ```

2. Ou editar diretamente o arquivo `create_release.py` e substituir o token.

## 📝 Notas Importantes

- O build para Windows requer Wine se estiver rodando no Linux
- O build para Linux não funciona nativamente no Windows sem WSL
- Certifique-se de ter espaço em disco suficiente (~500MB+)
- O token do GitHub precisa de permissões: `repo` e `write:packages`

## 🆘 Solução de Problemas

### Erro: "No space left on device"
Libere espaço em disco ou aumente o tamanho do disco.

### Erro: "Node.js not found"
Instale o Node.js de https://nodejs.org/

### Erro: "Token invalid"
Verifique se o token está correto e tem as permissões necessárias.

---

**Autor:** CryptoAI Investor  
**Licença:** MIT
