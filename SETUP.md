# Guia de Configuração e Produção — Rumo

Este guia contém o passo a passo completo para colocar o **Rumo — Controle de Despesas** em produção permanente utilizando **Google Planilhas + Google Apps Script + API do Notion + Atalhos do iOS (Apple Pay) + Cloudflare Pages**.

---

## 1. Google Planilhas & Backend Google Apps Script

### 1.1. Criar a Planilha e Vincular o Script
1. Crie uma nova planilha no [Google Sheets](https://sheets.new) com o nome que desejar (ex: `Rumo — Controle Financeiro`).
2. No menu superior da planilha, clique em **Extensões > Apps Script**.
3. Renomeie o projeto do script para `Rumo Backend`.
4. Substitua todo o conteúdo do arquivo `Código.gs` pelo conteúdo do arquivo [`backend/Code.gs`](file:///c:/RUMO/backend/Code.gs).
5. Clique no ícone de salvar (ou `Ctrl+S` / `Cmd+S`).

### 1.2. Configurar as Propriedades do Script (Credenciais Seguras)
No editor do Google Apps Script:
1. Clique no ícone de **Configurações do projeto** (engrenagem no menu lateral esquerdo).
2. Role até a seção **Propriedades do script** e clique em **Editar propriedades do script**.
3. Adicione as seguintes chaves e valores:
   * **`API_TOKEN`**: Crie um token secreto forte (ex: `rumo_sec_9f82d1c7a4e6...`). Guarde este token, pois ele será usado no Cloudflare Pages e no app Atalhos do iPhone.
   * **`NOTION_TOKEN`** *(Opcional)*: Token de integração interna da API do Notion (iniciado por `ntn_` ou `secret_`).
   * **`NOTION_DATABASE_ID`** *(Opcional)*: ID do banco de dados no Notion onde as despesas serão sincronizadas.
4. Clique em **Salvar propriedades do script**.

### 1.3. Inicializar as Abas da Planilha
1. Retorne ao editor de código (`< > Editor`).
2. Na barra superior de execução, certifique-se de que a função selecionada é **`setupPlanilha`** e clique em **Executar**.
3. Na primeira execução, o Google solicitará permissão para autorizar o script a acessar a planilha. Clique em **Revisar permissões > Escolha sua conta > Avançado > Acessar Rumo Backend (não seguro) > Permitir**.
4. Volte à aba da sua planilha: você verá que as abas **Despesas**, **Resumo** (com fórmulas e KPIs prontos) e **Config** foram criadas automaticamente com formatação profissional.

### 1.4. Implantar como Web App
1. No canto superior direito do editor do Apps Script, clique em **Implantar > Nova implantação**.
2. Clique na engrenagem ao lado de "Selecionar tipo" e escolha **App da Web**.
3. Preencha as configurações:
   * **Descrição**: `Rumo v1 Produção`
   * **Executar como**: **Eu (seu email)**
   * **Quem pode acessar**: **Qualquer pessoa** *(necessário para permitir requisições HTTPS diretas do Cloudflare Pages e do app Atalhos com o token)*
4. Clique em **Implantar**.
5. Copie o **URL do App da Web** gerado (formato: `https://script.google.com/macros/s/AKfycb.../exec`).

---

## 2. Automação no iPhone com Apple Pay (Atalhos do iOS)

Com essa automação, cada compra feita via Apple Pay no seu cartão registra instantaneamente o gasto na sua planilha e no Notion, sem precisar abrir o app.

1. Abra o app **Atalhos** (*Shortcuts*) no seu iPhone.
2. Toque na aba inferior **Automação** e toque em **+** (ou "Criar Automação Pessoal").
3. Selecione o gatilho **Transação** (ou *Carteira / Apple Pay*).
4. Em **Cartão**, escolha "Qualquer Cartão" (ou o cartão específico).
5. Em **Categoria**, escolha "Qualquer Categoria".
6. Marque a opção **Executar Imediatamente** e desative "Notificar ao Executar". Toque em **Avançar**.
7. Selecione **Nova Automação em Branco** e adicione as seguintes ações:

### Ação 1: Dicionário
Adicione a ação **Dicionário** e configure as seguintes chaves de Texto:
* `token` : `SEU_TOKEN_SECRETO` (o mesmo valor de `API_TOKEN` das propriedades do script)
* `valor` : Selecione a variável de entrada da transação **Valor**
* `estabelecimento` : Selecione a variável de entrada da transação **Estabelecimento** (ou Comerciante)
* `cartao` : Selecione a variável de entrada da transação **Cartão**
* `categoria_ios` : Selecione a variável de entrada da transação **Categoria**

### Ação 2: Obter Conteúdo de URL
Adicione a ação **Obter Conteúdo de URL**:
* **URL**: Cole a **URL do App da Web** gerada no passo 1.4 (`https://script.google.com/macros/s/.../exec`).
* Toque na seta para expandir os detalhes da requisição:
  * **Método**: `POST`
  * **Cabeçalhos**:
    * `Content-Type`: `text/plain;charset=utf-8` (ou `application/json`)
  * **Corpo da Solicitação**: Selecione `Arquivo` ou `JSON` e aponte para o **Dicionário** criado na Ação 1.
8. Toque em **OK** para salvar a automação.

> **Proteção anti-duplicidade embutida**: O backend possui proteção de 2 minutos contra disparos repetidos. Se o iOS disparar o atalho duas vezes para a mesma compra, o script detecta a duplicidade e não grava duas vezes.

---

## 3. Deploy no Cloudflare Pages

1. Envie este repositório para o seu **GitHub** (repositório privado ou público).
2. Acesse o painel da [Cloudflare](https://dash.cloudflare.com/) e navegue até **Workers & Pages > Create > Pages > Connect to Git**.
3. Selecione o repositório `Rumo` do GitHub.
4. Na etapa de configuração de build:
   * **Framework preset**: `Vite`
   * **Build command**: `npm run build`
   * **Build output directory**: `dist`
   * **Node version**: `20` ou superior
5. Na seção **Environment variables (Variáveis de Ambiente)**, adicione:
   * **`VITE_APPS_SCRIPT_URL`**: A URL da sua Web App do Google Apps Script (`https://script.google.com/macros/s/.../exec`).
   * **`VITE_API_TOKEN`**: O mesmo `API_TOKEN` cadastrado na planilha.
6. Clique em **Save and Deploy**. Em menos de 1 minuto seu site estará online com HTTPS gratuito e CDN global ultra-rápida.

---

## 4. Experiência Nativa no iPhone (PWA em Tela Cheia)

1. No seu iPhone, abra o link gerado pelo Cloudflare Pages no **Safari**.
2. Toque no botão de **Compartilhar** (ícone do quadrado com a seta para cima na barra inferior do Safari).
3. Role para baixo e selecione **Adicionar à Tela de Início**.
4. Confirme o nome como **Rumo** e toque em **Adicionar**.
5. Abra o app pelo novo ícone na sua Tela de Início:
   * Ele abrirá em **tela cheia nativa** (sem a barra de navegação nem a barra de status do Safari).
   * O visual **Liquid Glass** se adapta ao modo claro/escuro com desfoque translúcido e resposta háptica a toques.
   * Funciona offline graças ao service worker SWR embutido.

---

## 5. Resolução de Problemas

* **Status "Conexão pendente de configuração" no app**:
  * Se você abriu o app localmente ou sem variáveis injetadas no build, vá até a aba **Ajustes** dentro do app, insira a URL do Apps Script e o Token no formulário e toque em **Salvar e conectar**.
* **Erro de CORS ou requisição bloqueada**:
  * Certifique-se de que a implantação do Apps Script está definida com **Quem pode acessar: Qualquer pessoa**. Se você atualizar o código do script no Google, crie uma **Nova versão** da implantação.
