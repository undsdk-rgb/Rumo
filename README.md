<div align="center">

# Rumo — Controle de Despesas

**Webapp PWA mobile-first minimalista para controle de despesas pessoais, com visual *Liquid Glass*, funcionamento offline e sincronização com Google Planilhas, Notion e Apple Pay.**

![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-Offline_Ready-5A0FC8?style=flat-square&logo=pwa&logoColor=white)

</div>

---

## Sumário

- [Sobre o Projeto](#-sobre-o-projeto)
- [Funcionalidades](#-funcionalidades)
- [Stack Tecnológica](#-stack-tecnológica)
- [Estrutura do Projeto](#-estrutura-do-projeto)
- [Como Executar Localmente](#-como-executar-localmente)
- [Variáveis de Ambiente](#-variáveis-de-ambiente)
- [Scripts Disponíveis](#-scripts-disponíveis)
- [Deploy e Integrações](#-deploy-e-integrações)

---

## Sobre o Projeto

O **Rumo** foi projetado para oferecer uma experiência rápida e fluida de controle financeiro pessoal diretamente no navegador ou instalado como **PWA em tela cheia** (especialmente otimizado para iOS/Safari e dispositivos móveis).

Os dados são armazenados de forma transparente na sua própria planilha do **Google Sheets** via **Google Apps Script**, com suporte opcional para espelhamento em um banco de dados do **Notion** e registro automático de compras via **Apple Pay (Atalhos do iOS)**.

---

## Funcionalidades

- **Dashboard Interativo**: Cards de resumo financeiro, valores animados e gráfico de distribuição por categorias.
- **Gestão de Despesas**: Criação, edição, exclusão e listagem de transações com 20 categorias pré-configuradas e múltiplas formas de pagamento.
- **Interface *Liquid Glass***: Design minimalista com suporte a tema claro/escuro, efeitos translúcidos e gestos de navegação.
- **PWA & Offline-First**: Service Worker com estratégia *Stale-While-Revalidate* para carregamento instantâneo e fila de sincronização offline (`syncManager`).
- **Notificações Push**: Suporte a alertas e painel de notificações integrado (`sw-push.js`).
- **Tela de Bloqueio**: Proteção local de acesso ao aplicativo (`LockScreen`).
- **Automação Apple Pay (iOS)**: Endpoint compatível com o app **Atalhos** do iPhone para registrar gastos no instante da compra, com proteção anti-duplicidade de 2 minutos.
- **Sincronização Dupla**: Integração nativa com **Google Planilhas** (via Apps Script) e suporte opcional à API do **Notion**.

---

## Stack Tecnológica

### Frontend & PWA
- **React 19** + **TypeScript**
- **Vite 8** + **vite-plugin-pwa** (Workbox)
- **Tailwind CSS v4**
- **Motion** (animações e transições)
- **Lucide React** (ícones) + **Canvas Confetti**

### Backend & Integrações
- **Google Apps Script** (`backend/Code.gs`) — API REST serverless conectada ao Google Sheets
- **Express** (`server.ts`) — Servidor local/proxy para desenvolvimento e integração com Notion
- **Notion API** (`backend/notionService.ts`) — Sincronização opcional com database do Notion

### Hospedagem Recomendada
- **Cloudflare Pages** (build estático via Vite)

---

## Estrutura do Projeto

```text
RUMO/
├── backend/
│   ├── Code.gs               # Script do Google Apps Script (Web App + Planilha)
│   └── notionService.ts      # Serviço de integração com a API do Notion
├── public/
│   ├── icons/                # Ícones PWA e Apple Touch Icon
│   ├── manifest.json         # Manifesto da aplicação Web
│   └── sw-push.js            # Handler de notificações push no Service Worker
├── src/
│   ├── components/           # Componentes de UI (modais, gráficos, cards, ajustes, lockscreen)
│   ├── constants/            # Mapeamento de categorias, cores e ícones
│   ├── hooks/                # Hooks customizados (gestos, push, PWA install, sync, glare)
│   ├── services/             # Cliente API, segurança local e gerenciador de sincronização
│   ├── utils/                # Utilitários de formatação (moeda, datas)
│   ├── App.tsx               # Componente principal e roteamento de abas
│   ├── index.css             # Estilos globais e tokens Tailwind
│   ├── main.tsx              # Ponto de entrada React
│   └── types.ts              # Definições de tipos TypeScript
├── .env.example              # Modelo de variáveis de ambiente
├── index.html                # HTML base com metadados PWA/iOS
├── package.json              # Dependências e scripts
├── server.ts                 # Servidor Express para execução local e proxy
├── SETUP.md                  # Guia completo de implantação e automação iOS
├── tsconfig.json             # Configuração do TypeScript
└── vite.config.ts            # Configuração do Vite e Workbox PWA
```

---

## Como Executar Localmente

### Pré-requisitos
- **Node.js** 20 ou superior
- **npm**

### Passo a passo

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/undsdk-rgb/Rumo.git
   cd Rumo
   ```

2. **Instale as dependências:**
   ```bash
   npm install
   ```

3. **Configure as variáveis de ambiente:**
   ```bash
   cp .env.example .env
   ```
   Edite o arquivo `.env` com sua URL do Google Apps Script e seu token de autenticação (veja os detalhes abaixo).

4. **Inicie o servidor de desenvolvimento:**
   ```bash
   npm run dev
   ```

---

## Variáveis de Ambiente

Copie `.env.example` para `.env` e preencha os valores correspondentes:

| Variável | Obrigatória | Descrição |
| :--- | :---: | :--- |
| `VITE_APPS_SCRIPT_URL` | Sim | URL do Web App publicado no Google Apps Script (`https://script.google.com/macros/s/.../exec`). |
| `VITE_API_TOKEN` | Sim | Token secreto definido em `API_TOKEN` nas propriedades do Apps Script. |
| `PORT` | Não | Porta do servidor Express local (padrão: `3000`). |
| `GOOGLE_SHEET_ID` | Não | ID da planilha Google (usado pelo servidor Express local). |
| `APPS_SCRIPT_URL` | Não | URL do Apps Script usada pelo proxy `server.ts`. |
| `APPS_SCRIPT_TOKEN` | Não | Token usado pelo proxy `server.ts`. |
| `NOTION_API_KEY` | Não | Token de integração interna do Notion (`ntn_` ou `secret_`). |
| `NOTION_DATABASE_ID` | Não | ID do database do Notion para espelhamento de transações. |

> **Dica:** Caso execute o app sem variáveis injetadas no build, também é possível informar a URL do Apps Script e o Token diretamente pela aba **Ajustes** dentro do próprio aplicativo.

---

## Scripts Disponíveis

| Comando | Descrição |
| :--- | :--- |
| `npm run dev` | Inicia o servidor de desenvolvimento com `tsx server.ts`. |
| `npm run start` | Executa o servidor `server.ts` em modo Node. |
| `npm run build` | Gera o build de produção otimizado na pasta `dist/`. |
| `npm run preview` | Visualiza localmente o build gerado em `dist/`. |
| `npm run lint` | Executa a verificação de tipos TypeScript (`tsc --noEmit`). |
| `npm run clean` | Remove os artefatos de build (`dist` e `server.js`). |

---

## Deploy e Integrações

Para configurar o ambiente completo em produção — incluindo:
1. Criação da planilha e implantação do **Google Apps Script** (`backend/Code.gs`),
2. Integração opcional com **Notion**,
3. Automação de compras via **Apple Pay + Atalhos do iOS**,
4. Deploy no **Cloudflare Pages** e instalação como **PWA no iPhone**,

consulte o guia passo a passo em **[`SETUP.md`](SETUP.md)**.
