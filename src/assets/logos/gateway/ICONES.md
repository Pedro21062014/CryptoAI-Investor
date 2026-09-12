# Ícones do Gateway — origens

Todos os ícones desta pasta vêm do **[Iconify](https://icon-sets.iconify.design/)** e
foram baixados pela API oficial (`https://api.iconify.design/<set>/<nome>.svg`).

| Canal | Arquivo | Ícone no Iconify | Coleção | Licença |
|-------|---------|------------------|---------|---------|
| Telegram | `telegram.svg` | `simple-icons:telegram` | [Simple Icons](https://icon-sets.iconify.design/simple-icons/) | CC0 1.0 |
| WhatsApp | `whatsapp.svg` | `simple-icons:whatsapp` | [Simple Icons](https://icon-sets.iconify.design/simple-icons/) | CC0 1.0 |
| WeChat | `wechat.svg` | `simple-icons:wechat` | [Simple Icons](https://icon-sets.iconify.design/simple-icons/) | CC0 1.0 |
| QQ | `qq.svg` | `simple-icons:tencentqq` | [Simple Icons](https://icon-sets.iconify.design/simple-icons/) | CC0 1.0 |
| Discord | `discord.svg` | `simple-icons:discord` | [Simple Icons](https://icon-sets.iconify.design/simple-icons/) | CC0 1.0 |
| E-mail | `email.svg` | `mdi:email` | [Material Design Icons](https://icon-sets.iconify.design/mdi/) | Apache 2.0 |
| Webhook | `webhook.svg` | `mdi:webhook` | [Material Design Icons](https://icon-sets.iconify.design/mdi/) | Apache 2.0 |

Os arquivos são glifos brancos (24×24) desenhados sobre o tile colorido de cada
canal na página **Gateway** (`gatewayIcon()` em `src/js/renderer.js`).

Para atualizar/adicionar um canal:

```bash
curl -s "https://api.iconify.design/simple-icons/<nome>.svg?color=%23ffffff" \
  -o src/assets/logos/gateway/<nome>.svg
```

Depois adicione/ajuste a entrada correspondente em `GATEWAY_CHANNELS`
(`src/js/renderer.js`) com o campo `icone` apontando para o nome no Iconify.
