"""
Script para criar um release no GitHub com os arquivos de build
Uso: python create_release.py [tag_name]

Exemplo: python create_release.py v1.7.2
"""

import os
import sys
import json
import subprocess
import requests
from pathlib import Path

# Configurações
# Token deve ser fornecido via variável de ambiente GITHUB_TOKEN
GITHUB_TOKEN = os.environ.get('GITHUB_TOKEN', '')
if not GITHUB_TOKEN:
    print("ERRO: Token do GitHub não encontrado!")
    print("Defina a variável de ambiente GITHUB_TOKEN antes de executar este script.")
    print("Exemplo: export GITHUB_TOKEN='seu_token_aqui'")
    sys.exit(1)
    
REPO_OWNER = "Pedro21062014"
REPO_NAME = "CryptoAI-Investor"
GITHUB_API = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}"

def get_latest_version():
    """Obtém a versão atual do package.json"""
    with open('package.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
        return data.get('version', '1.0.0')

def get_build_files():
    """Lista os arquivos de build na pasta dist"""
    dist_folder = Path('dist')
    if not dist_folder.exists():
        print("ERROR: Pasta 'dist' não encontrada. Execute o build primeiro!")
        return []
    
    files = []
    for ext in ['*.exe', '*.deb', '*.zip']:
        files.extend(dist_folder.glob(ext))
    
    return files

def create_release(tag_name, release_name, body, draft=False, prerelease=False):
    """Cria um release no GitHub"""
    headers = {
        'Authorization': f'token {GITHUB_TOKEN}',
        'Accept': 'application/vnd.github.v3+json'
    }
    
    data = {
        'tag_name': tag_name,
        'name': release_name,
        'body': body,
        'draft': draft,
        'prerelease': prerelease
    }
    
    response = requests.post(f'{GITHUB_API}/releases', json=data, headers=headers)
    
    if response.status_code == 201:
        return response.json()
    else:
        print(f"Erro ao criar release: {response.status_code}")
        print(response.text)
        return None

def upload_asset(release_id, file_path):
    """Faz upload de um arquivo para o release"""
    headers = {
        'Authorization': f'token {GITHUB_TOKEN}',
        'Content-Type': 'application/octet-stream'
    }
    
    file_name = os.path.basename(file_path)
    upload_url = f"https://uploads.github.com/repos/{REPO_OWNER}/{REPO_NAME}/releases/{release_id}/assets?name={file_name}"
    
    with open(file_path, 'rb') as f:
        response = requests.post(upload_url, headers=headers, data=f)
    
    if response.status_code in [200, 201]:
        print(f"✓ Upload bem-sucedido: {file_name}")
        return True
    else:
        print(f"✗ Erro ao upload {file_name}: {response.status_code}")
        print(response.text)
        return False

def main():
    # Determinar o nome da tag
    if len(sys.argv) > 1:
        tag_name = sys.argv[1]
    else:
        version = get_latest_version()
        tag_name = f"v{version}"
    
    print("=" * 50)
    print("CryptoAI Investor - GitHub Release Creator")
    print("=" * 50)
    print(f"\nTag: {tag_name}")
    
    # Obter arquivos de build
    build_files = get_build_files()
    if not build_files:
        print("\nNenhum arquivo de build encontrado!")
        print("Execute o build antes de criar o release:")
        print("  Windows: build-windows.bat")
        print("  Linux: ./build-linux.sh")
        return 1
    
    print(f"\nArquivos encontrados ({len(build_files)}):")
    for f in build_files:
        size_mb = f.stat().st_size / (1024 * 1024)
        print(f"  - {f.name} ({size_mb:.2f} MB)")
    
    # Criar release
    release_name = f"CryptoAI Investor {tag_name}"
    body = f"""## 🚀 CryptoAI Investor {tag_name}

### Novidades desta versão:
- Melhorias de performance
- Correções de bugs
- Suporte para Windows e Linux

### Downloads:
- **Windows**: Baixe o instalador `.exe`
- **Linux**: Baixe o pacote `.deb`

### Instalação:

#### Windows:
1. Baixe o arquivo `.exe`
2. Execute o instalador
3. Siga as instruções

#### Linux (Debian/Ubuntu):
```bash
sudo dpkg -i crypto-ai-investor_*.deb
sudo apt-get install -f  # Se necessário
```

---
*Release criado automaticamente via script*
"""
    
    print(f"\nCriando release: {release_name}...")
    release = create_release(tag_name, release_name, body)
    
    if not release:
        print("\nFalha ao criar release!")
        return 1
    
    release_id = release['id']
    release_url = release['html_url']
    print(f"✓ Release criado: {release_url}")
    
    # Fazer upload dos arquivos
    print(f"\nFazendo upload de {len(build_files)} arquivo(s)...")
    success_count = 0
    for file_path in build_files:
        if upload_asset(release_id, str(file_path)):
            success_count += 1
    
    print("\n" + "=" * 50)
    print("✅ Processo concluído!")
    print(f"   Releases publicados: {success_count}/{len(build_files)}")
    print(f"   URL: {release_url}")
    print("=" * 50)
    
    return 0 if success_count == len(build_files) else 1

if __name__ == '__main__':
    sys.exit(main())
