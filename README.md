# PDV Bridge

Aplicativo Electron para Windows que expoe um servidor local e imprime em impressora termica ESC/POS.

## Funcionalidades iniciais

- Servidor local em `http://127.0.0.1:8181`
- Endpoint `POST /print`
- Listagem de impressoras instaladas
- Interface simples para selecionar e salvar impressora
- Minimizacao para tray
- Opcao de iniciar com Windows
- Estrutura base preparada para websocket futuro

## Tecnologias

- Electron
- Express
- node-thermal-printer
- electron-builder

## Como executar

```bash
npm install
npm run dev
```

## Endpoint de impressao

`POST http://127.0.0.1:8181/print`

Exemplo de payload:

```json
{
  "text": ["PDV BRIDGE", "Pedido #123", "Obrigado!"],
  "cut": true,
  "beep": false,
  "openCashDrawer": false
}
```

## Build para Windows

```bash
npm run build
```
