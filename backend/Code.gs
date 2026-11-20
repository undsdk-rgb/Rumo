/**
 * Rumo — Backend Google Apps Script (Produção)
 * Integração: Google Planilhas + API do Notion + Atalhos do iOS (Apple Pay) + Rumo WebApp
 *
 * PROPRIEDADES DO SCRIPT (Configurações do Projeto > Propriedades do script):
 *   - API_TOKEN            : Token secreto compartilhado entre WebApp / Atalhos iOS e o Apps Script.
 *   - NOTION_TOKEN         : Token de integração interna da API do Notion (ex: ntn_...).
 *   - NOTION_DATABASE_ID   : ID do banco de dados no Notion onde os gastos serão espelhados.
 *
 * COMO IMPLANTAR:
 *   1. No editor do Apps Script, selecione a função "setupPlanilha" e clique em "Executar" para criar as abas.
 *   2. Clique em "Implantar" > "Nova implantação".
 *   3. Tipo: "App da Web".
 *   4. Executar como: "Eu" (sua conta Google).
 *   5. Quem pode acessar: "Qualquer pessoa" (permite requisições autenticadas por token).
 *   6. Copie o URL da Web App gerado e use em VITE_APPS_SCRIPT_URL.
 */

const EXPENSES_SHEET_NAME = 'Despesas';
const SUMMARY_SHEET_NAME = 'Resumo';
const CONFIG_SHEET_NAME = 'Config';

const EXPECTED_HEADERS = ['id', 'data', 'estabelecimento', 'valor', 'categoria', 'metodo'];

const CATEGORIES = [
  'Alimentação',
  'Mercado',
  'Transporte',
  'Lazer',
  'Assinaturas',
  'Outros',
];

const PAYMENT_METHODS = [
  'Apple Pay',
  'Pix',
  'Cartão de Crédito',
  'Cartão de Débito',
  'Dinheiro',
];

/**
 * Retorna a planilha ativa associada a este script.
 */
function getSpreadsheet_() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  throw new Error(
    'Nenhuma planilha ativa encontrada. Cole este código no Apps Script vinculado à sua planilha Google.'
  );
}

/**
 * Inicializa e formata as abas 'Despesas', 'Resumo' e 'Config'.
 * Pode ser executada pelo menu 'Rumo' ou diretamente no editor.
 */
function setupPlanilha() {
  const ss = getSpreadsheet_();

  const expensesSheet = ensureExpensesSheet_(ss);
  ensureSummarySheet_(ss);
  ensureConfigSheet_(ss);

  ss.setActiveSheet(expensesSheet);
  SpreadsheetApp.flush();

  Logger.log('Rumo inicializado com sucesso na planilha "' + ss.getName() + '".');

  try {
    SpreadsheetApp.getUi().alert(
      'Rumo configurado com sucesso!\n\n' +
        'Planilha: ' +
        ss.getName() +
        '\nAbas criadas/atualizadas: Despesas, Resumo e Config.'
    );
  } catch (e) {
    // Contexto sem interface gráfica ativa
  }

  return {
    status: 'ok',
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    sheets: [EXPENSES_SHEET_NAME, SUMMARY_SHEET_NAME, CONFIG_SHEET_NAME],
  };
}

/**
 * Adiciona o menu "Rumo" na barra superior do Google Sheets ao abrir a planilha.
 */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('Rumo')
      .addItem('Criar / atualizar abas e colunas', 'setupPlanilha')
      .addToUi();
  } catch (e) {
    // Ignora fora do contexto de UI
  }
}

function ensureExpensesSheet_(ss) {
  let sheet = ss.getSheetByName(EXPENSES_SHEET_NAME);

  if (!sheet) {
    const sheets = ss.getSheets();
    if (sheets.length === 1 && sheets[0].getLastRow() === 0) {
      sheet = sheets[0];
      sheet.setName(EXPENSES_SHEET_NAME);
    } else {
      sheet = ss.insertSheet(EXPENSES_SHEET_NAME, 0);
    }
  }

  if (sheet.getMaxColumns() < EXPECTED_HEADERS.length) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      EXPECTED_HEADERS.length - sheet.getMaxColumns()
    );
  }

  const lastRow = sheet.getLastRow();
  const firstRowValues =
    lastRow > 0
      ? sheet
          .getRange(1, 1, 1, EXPECTED_HEADERS.length)
          .getValues()[0]
          .map(function (v) {
            return String(v || '').trim().toLowerCase();
          })
      : [];

  const hasExpectedHeaders =
    firstRowValues.length === EXPECTED_HEADERS.length &&
    EXPECTED_HEADERS.every(function (h, idx) {
      return firstRowValues[idx] === h;
    });

  if (lastRow === 0 || !hasExpectedHeaders) {
    if (lastRow > 0 && !hasExpectedHeaders) {
      sheet.insertRowBefore(1);
    }
    sheet.getRange(1, 1, 1, EXPECTED_HEADERS.length).setValues([EXPECTED_HEADERS]);
  }

  // Estilização do cabeçalho
  const headerRange = sheet.getRange(1, 1, 1, EXPECTED_HEADERS.length);
  headerRange
    .setFontWeight('bold')
    .setBackground('#111827')
    .setFontColor('#FFFFFF')
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 32);
  sheet.setFrozenRows(1);

  // Larguras das colunas
  const widths = [220, 155, 240, 130, 145, 165];
  for (let c = 0; c < widths.length; c++) {
    sheet.setColumnWidth(c + 1, widths[c]);
  }

  // Formatação e regras de validação
  const maxRows = sheet.getMaxRows();
  if (maxRows > 1) {
    const rowsToFormat = Math.min(maxRows - 1, 1000);
    sheet.getRange(2, 2, rowsToFormat, 1).setNumberFormat('@');
    sheet.getRange(2, 4, rowsToFormat, 1).setNumberFormat('R$ #,##0.00');

    const categoryRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(CATEGORIES, true)
      .setAllowInvalid(true)
      .build();
    sheet.getRange(2, 5, rowsToFormat, 1).setDataValidation(categoryRule);

    const methodRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(PAYMENT_METHODS, true)
      .setAllowInvalid(true)
      .build();
    sheet.getRange(2, 6, rowsToFormat, 1).setDataValidation(methodRule);
  }

  return sheet;
}

function ensureSummarySheet_(ss) {
  let sheet = ss.getSheetByName(SUMMARY_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SUMMARY_SHEET_NAME);
  }

  sheet.clear();

  // Título
  sheet.getRange('A1:C1').merge();
  sheet
    .getRange('A1')
    .setValue('Rumo — Resumo Financeiro')
    .setFontSize(14)
    .setFontWeight('bold')
    .setBackground('#111827')
    .setFontColor('#FFFFFF')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 36);

  // KPIs
  sheet
    .getRange('A3:C3')
    .setValues([['Indicador', 'Valor', 'Observação']])
    .setFontWeight('bold')
    .setBackground('#F3F4F6');

  sheet.getRange('A4:C6').setValues([
    ['Total gasto', '=SUM(Despesas!D2:D)', 'Soma de todos os lançamentos'],
    ['Total de lançamentos', '=COUNTA(Despesas!C2:C)', 'Quantidade de saídas registradas'],
    ['Ticket médio', '=IFERROR(AVERAGE(Despesas!D2:D), 0)', 'Valor médio por lançamento'],
  ]);
  sheet.getRange('B4').setNumberFormat('R$ #,##0.00');
  sheet.getRange('B5').setNumberFormat('#,##0');
  sheet.getRange('B6').setNumberFormat('R$ #,##0.00');

  // Categorias
  sheet
    .getRange('A8:C8')
    .setValues([['Categoria', 'Total (R$)', 'Lançamentos']])
    .setFontWeight('bold')
    .setBackground('#111827')
    .setFontColor('#FFFFFF');

  const catStartRow = 9;
  const catRows = CATEGORIES.map(function (cat, idx) {
    const r = catStartRow + idx;
    return [
      cat,
      '=SUMIF(Despesas!$E$2:$E, A' + r + ', Despesas!$D$2:$D)',
      '=COUNTIF(Despesas!$E$2:$E, A' + r + ')',
    ];
  });
  sheet.getRange(catStartRow, 1, catRows.length, 3).setValues(catRows);
  sheet.getRange(catStartRow, 2, catRows.length, 1).setNumberFormat('R$ #,##0.00');
  sheet.getRange(catStartRow, 3, catRows.length, 1).setNumberFormat('#,##0');

  // Métodos de Pagamento
  const methodHeaderRow = catStartRow + catRows.length + 1;
  sheet
    .getRange(methodHeaderRow, 1, 1, 3)
    .setValues([['Método de pagamento', 'Total (R$)', 'Lançamentos']])
    .setFontWeight('bold')
    .setBackground('#111827')
    .setFontColor('#FFFFFF');

  const methodStartRow = methodHeaderRow + 1;
  const methodRows = PAYMENT_METHODS.map(function (method, idx) {
    const r = methodStartRow + idx;
    return [
      method,
      '=SUMIF(Despesas!$F$2:$F, A' + r + ', Despesas!$D$2:$D)',
      '=COUNTIF(Despesas!$F$2:$F, A' + r + ')',
    ];
  });
  sheet.getRange(methodStartRow, 1, methodRows.length, 3).setValues(methodRows);
  sheet.getRange(methodStartRow, 2, methodRows.length, 1).setNumberFormat('R$ #,##0.00');
  sheet.getRange(methodStartRow, 3, methodRows.length, 1).setNumberFormat('#,##0');

  sheet.setColumnWidth(1, 210);
  sheet.setColumnWidth(2, 150);
  sheet.setColumnWidth(3, 240);
  sheet.setFrozenRows(1);

  return sheet;
}

function ensureConfigSheet_(ss) {
  let sheet = ss.getSheetByName(CONFIG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG_SHEET_NAME);
  }

  sheet.clear();

  sheet
    .getRange('A1:B1')
    .setValues([['Parâmetro', 'Valor']])
    .setFontWeight('bold')
    .setBackground('#111827')
    .setFontColor('#FFFFFF');
  sheet.setRowHeight(1, 30);

  const now = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    'yyyy-MM-dd HH:mm:ss'
  );

  const props = getScriptCredentials_();
  const tokenStatus = props.apiToken
    ? 'Configurado'
    : 'Pendente (defina API_TOKEN nas Propriedades do script)';
  const notionStatus =
    props.notionToken && props.notionDbId
      ? 'Configurado'
      : 'Opcional (defina NOTION_TOKEN e NOTION_DATABASE_ID)';

  const rows = [
    ['spreadsheet_id', ss.getId()],
    ['aba_principal', EXPENSES_SHEET_NAME],
    ['colunas_despesas', EXPECTED_HEADERS.join(', ')],
    ['categorias_validas', CATEGORIES.join(', ')],
    ['metodos_validos', PAYMENT_METHODS.join(', ')],
    ['token_api', tokenStatus],
    ['sincronizacao_notion', notionStatus],
    ['ultima_inicializacao', now],
  ];

  sheet.getRange(2, 1, rows.length, 2).setValues(rows);
  sheet.setColumnWidth(1, 210);
  sheet.setColumnWidth(2, 460);
  sheet.setFrozenRows(1);

  return sheet;
}

/**
 * Lê credenciais com segurança das Propriedades do Script (nunca hardcoded).
 */
function getScriptCredentials_() {
  const props = PropertiesService.getScriptProperties();
  const apiToken = (props.getProperty('API_TOKEN') || props.getProperty('RUMO_API_TOKEN') || '').trim();
  const notionToken = (props.getProperty('NOTION_TOKEN') || '').trim();
  const notionDbId = (props.getProperty('NOTION_DATABASE_ID') || '').trim();

  return { apiToken: apiToken, notionToken: notionToken, notionDbId: notionDbId };
}

function validateToken_(receivedToken) {
  const creds = getScriptCredentials_();
  if (!creds.apiToken) {
    return {
      ok: false,
      message:
        'API_TOKEN não configurado nas Propriedades do Script (Configurações do Projeto > Propriedades do script).',
    };
  }
  if (!receivedToken || String(receivedToken).trim() !== creds.apiToken) {
    return { ok: false, message: 'Token de autenticação inválido.' };
  }
  return { ok: true };
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function formatRowDate_(rawDate) {
  if (rawDate instanceof Date) {
    return Utilities.formatDate(
      rawDate,
      Session.getScriptTimeZone(),
      "yyyy-MM-dd'T'HH:mm"
    );
  }
  return String(rawDate || '').trim();
}

/**
 * Limpa e converte strings monetárias brasileiras ou internacionais para float positivo.
 * Exemplos: "R$ 45,90" -> 45.90 | "45,90" -> 45.90 | 45.9 -> 45.90
 */
function parseMonetaryValue_(raw) {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? Math.abs(raw) : 0;
  }
  if (!raw) return 0;

  let str = String(raw).trim();
  // Remove símbolos monetários, espaços e caracteres não numéricos exceto vírgula e ponto
  str = str.replace(/[^0-9,\.-]/g, '');

  if (str.includes(',') && str.includes('.')) {
    // Ex: 1.250,50
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (str.includes(',')) {
    // Ex: 45,90
    str = str.replace(',', '.');
  }

  const num = parseFloat(str);
  return Number.isFinite(num) ? Math.abs(num) : 0;
}

/**
 * Normaliza e mapeia categorias do Apple Pay (iOS Shortcuts) e palavras-chave
 * para as categorias exatas do template Rumo.
 */
function resolveCategory_(rawCategory, merchant) {
  const catInput = String(rawCategory || '').trim();
  const merchantLower = String(merchant || '').toLowerCase();

  // 1. Verificação de correspondência exata ou acentuação
  const exact = CATEGORIES.find(function (c) {
    return c.toLowerCase() === catInput.toLowerCase();
  });
  if (exact) return exact;

  const catLower = catInput
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  // 2. Mapeamento de categorias padrão fornecidas pelo Apple Pay / iOS
  if (
    catLower.includes('food') ||
    catLower.includes('drink') ||
    catLower.includes('restaurant') ||
    catLower.includes('dining') ||
    catLower.includes('aliment') ||
    catLower.includes('cafe') ||
    catLower.includes('refeicao')
  ) {
    return 'Alimentação';
  }

  if (
    catLower.includes('grocer') ||
    catLower.includes('mercad') ||
    catLower.includes('supermarket') ||
    catLower.includes('hortifruti')
  ) {
    return 'Mercado';
  }

  if (
    catLower.includes('transport') ||
    catLower.includes('transit') ||
    catLower.includes('gas') ||
    catLower.includes('fuel') ||
    catLower.includes('combust') ||
    catLower.includes('uber') ||
    catLower.includes('ride') ||
    catLower.includes('taxi')
  ) {
    return 'Transporte';
  }

  if (
    catLower.includes('entertain') ||
    catLower.includes('lazer') ||
    catLower.includes('movie') ||
    catLower.includes('cinema') ||
    catLower.includes('teatro') ||
    catLower.includes('show') ||
    catLower.includes('recreation')
  ) {
    return 'Lazer';
  }

  if (
    catLower.includes('subscript') ||
    catLower.includes('assinat') ||
    catLower.includes('streaming') ||
    catLower.includes('service')
  ) {
    return 'Assinaturas';
  }

  // 3. Heurística inteligente por palavras-chave comuns de estabelecimentos
  if (
    merchantLower.includes('uber') ||
    merchantLower.includes('99app') ||
    merchantLower.includes('posto') ||
    merchantLower.includes('shell') ||
    merchantLower.includes('ipiranga') ||
    merchantLower.includes('sem parar') ||
    merchantLower.includes('veloe') ||
    merchantLower.includes('estacionamento')
  ) {
    return 'Transporte';
  }

  if (
    merchantLower.includes('ifood') ||
    merchantLower.includes('restaurante') ||
    merchantLower.includes('padaria') ||
    merchantLower.includes('starbucks') ||
    merchantLower.includes('mcdonald') ||
    merchantLower.includes('burger') ||
    merchantLower.includes('outback') ||
    merchantLower.includes('pizza') ||
    merchantLower.includes('bar ')
  ) {
    return 'Alimentação';
  }

  if (
    merchantLower.includes('pao de acucar') ||
    merchantLower.includes('carrefour') ||
    merchantLower.includes('supermercado') ||
    merchantLower.includes('mercado') ||
    merchantLower.includes('extra') ||
    merchantLower.includes('assai') ||
    merchantLower.includes('atacadao') ||
    merchantLower.includes('hortifruti') ||
    merchantLower.includes('da terra')
  ) {
    return 'Mercado';
  }

  if (
    merchantLower.includes('netflix') ||
    merchantLower.includes('spotify') ||
    merchantLower.includes('icloud') ||
    merchantLower.includes('apple.com/bill') ||
    merchantLower.includes('prime') ||
    merchantLower.includes('amazon prime') ||
    merchantLower.includes('youtube') ||
    merchantLower.includes('hbo') ||
    merchantLower.includes('max') ||
    merchantLower.includes('disney')
  ) {
    return 'Assinaturas';
  }

  if (
    merchantLower.includes('cinemark') ||
    merchantLower.includes('cinema') ||
    merchantLower.includes('teatro') ||
    merchantLower.includes('sympla') ||
    merchantLower.includes('ingresso')
  ) {
    return 'Lazer';
  }

  return 'Outros';
}

/**
 * Sincroniza o lançamento com o banco de dados do Notion.
 * Operação não-bloqueante: se a chamada falhar, registra no Logger sem abortar o salvamento na planilha.
 */
function syncToNotion_(item) {
  const creds = getScriptCredentials_();
  if (!creds.notionToken || !creds.notionDbId) {
    return; // Notion não configurado
  }

  try {
    const dateOnly = String(item.data || '').slice(0, 10) ||
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

    const payload = {
      parent: { database_id: creds.notionDbId },
      properties: {
        Nome: {
          title: [
            {
              text: {
                content: String(item.estabelecimento || 'Despesa').trim(),
              },
            },
          ],
        },
        Valor: {
          number: item.valor,
        },
        Data: {
          date: {
            start: dateOnly,
          },
        },
        Categoria: {
          select: {
            name: item.categoria,
          },
        },
      },
    };

    const options = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + creds.notionToken,
        'Notion-Version': '2022-06-28',
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    };

    const response = UrlFetchApp.fetch('https://api.notion.com/v1/pages', options);
    const code = response.getResponseCode();

    if (code >= 200 && code < 300) {
      Logger.log('Sincronizado com o Notion com sucesso: ' + item.estabelecimento);
    } else {
      Logger.log('Erro ao sincronizar com Notion (HTTP ' + code + '): ' + response.getContentText());
    }
  } catch (err) {
    Logger.log('Exceção ao chamar API do Notion: ' + err);
  }
}

/**
 * Ponto de entrada GET (leitura rápida com filtro de mês)
 * Endpoint: ?token=<TOKEN>&mes=YYYY-MM
 */
function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    const auth = validateToken_(params.token);
    if (!auth.ok) {
      return jsonResponse_({ status: 'error', message: auth.message });
    }

    // Inicialização remota de abas (?action=setup&token=...)
    if (params.action === 'setup') {
      const setupResult = setupPlanilha();
      return jsonResponse_(setupResult);
    }

    const ss = getSpreadsheet_();
    let sheet = ss.getSheetByName(EXPENSES_SHEET_NAME);
    if (!sheet) {
      sheet = ensureExpensesSheet_(ss);
    }

    // Ping / Health Check (?action=ping&token=...)
    if (params.action === 'ping') {
      return jsonResponse_({
        status: 'ok',
        spreadsheetId: ss.getId(),
        spreadsheetName: ss.getName(),
        sheetName: sheet.getName(),
        totalRows: Math.max(0, sheet.getLastRow() - 1),
        serverTime: new Date().toISOString(),
      });
    }

    const mes = String(params.mes || '').trim(); // Formato YYYY-MM
    const rows = sheet.getDataRange().getValues();
    const items = [];

    for (let i = 1; i < rows.length; i++) {
      const id = rows[i][0];
      const rawDate = rows[i][1];
      const estabelecimento = rows[i][2];
      const valor = rows[i][3];
      const categoria = rows[i][4];
      const metodo = rows[i][5];

      if (!estabelecimento && !valor) continue;

      const isoDate = formatRowDate_(rawDate);
      if (mes && !isoDate.startsWith(mes)) continue;

      items.push({
        id: String(id || 'row-' + (i + 1)),
        data: isoDate,
        estabelecimento: String(estabelecimento || '').trim(),
        valor: typeof valor === 'number' ? valor : parseMonetaryValue_(valor),
        categoria: String(categoria || 'Outros').trim(),
        metodo: String(metodo || 'Apple Pay').trim(),
      });
    }

    return jsonResponse_({
      status: 'ok',
      spreadsheetName: ss.getName(),
      syncedAt: new Date().toISOString(),
      data: items,
    });
  } catch (err) {
    return jsonResponse_({ status: 'error', message: String(err) });
  }
}

/**
 * Ponto de entrada POST (inclusão com idempotência e exclusão)
 * Suporta payloads do Apple Pay (Atalhos do iOS) e do Rumo WebApp
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const rawContent = (e && e.postData && e.postData.contents) || '{}';
    let body = {};
    try {
      body = JSON.parse(rawContent);
    } catch (parseErr) {
      return jsonResponse_({ status: 'error', message: 'Payload JSON inválido.' });
    }

    const auth = validateToken_(body.token);
    if (!auth.ok) {
      return jsonResponse_({ status: 'error', message: auth.message });
    }

    const ss = getSpreadsheet_();
    let sheet = ss.getSheetByName(EXPENSES_SHEET_NAME);
    if (!sheet) {
      sheet = ensureExpensesSheet_(ss);
    }

    const action = String(body.action || 'create').toLowerCase();

    // 1. Exclusão de lançamento
    if (action === 'delete') {
      const targetId = String(body.id || '').trim();
      if (!targetId) {
        return jsonResponse_({ status: 'error', message: 'ID obrigatório para exclusão.' });
      }
      const rows = sheet.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        const rowId = String(rows[i][0] || 'row-' + (i + 1));
        if (rowId === targetId) {
          sheet.deleteRow(i + 1);
          return jsonResponse_({ status: 'ok', deletedId: targetId });
        }
      }
      return jsonResponse_({ status: 'error', message: 'Registro não encontrado na planilha.' });
    }

    // 2. Extração e normalização de dados (Apple Pay Shortcuts ou WebApp)
    const estabelecimento = String(
      body.estabelecimento || body.merchant || body.local || ''
    ).trim();

    const rawValor = body.valor !== undefined ? body.valor : body.amount;
    const valor = parseMonetaryValue_(rawValor);

    const now = new Date();
    const data =
      String(body.data || body.date || '').trim() ||
      Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm");

    const categoriaRaw = body.categoria || body.categoria_ios || body.category;
    const categoria = resolveCategory_(categoriaRaw, estabelecimento);

    let metodo = String(body.metodo || '').trim();
    if (!metodo) {
      metodo = 'Apple Pay';
    }

    if (!estabelecimento || valor <= 0) {
      return jsonResponse_({
        status: 'error',
        message: 'Estabelecimento e valor positivo são obrigatórios.',
      });
    }

    // 3. Idempotência / Anti-duplicidade (verifica últimas 5 linhas nos últimos 2 minutos)
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const checkCount = Math.min(5, lastRow - 1);
      const startRow = lastRow - checkCount + 1;
      const recentRows = sheet.getRange(startRow, 1, checkCount, 6).getValues();

      const parseDateMs = function (dStr) {
        const d = new Date(dStr);
        return isNaN(d.getTime()) ? 0 : d.getTime();
      };

      const incomingMs = parseDateMs(data) || now.getTime();

      for (let r = 0; r < recentRows.length; r++) {
        const rDate = formatRowDate_(recentRows[r][1]);
        const rEstab = String(recentRows[r][2] || '').trim();
        const rValor = parseMonetaryValue_(recentRows[r][3]);

        const rMs = parseDateMs(rDate);
        const timeDiffMs = Math.abs(incomingMs - rMs);

        // Se o valor e estabelecimento forem idênticos em menos de 2 minutos (120.000ms)
        const isSameMerchant = rEstab.toLowerCase() === estabelecimento.toLowerCase();
        const isSameAmount = Math.abs(rValor - valor) < 0.01;
        const isRecent = timeDiffMs <= 120000;

        if (isSameMerchant && isSameAmount && isRecent) {
          Logger.log('Disparo duplicado ignorado por idempotência: ' + estabelecimento + ' - R$ ' + valor);
          return jsonResponse_({
            status: 'ok',
            duplicate: true,
            message: 'Transação idêntica já registrada nos últimos 2 minutos (ignorado).',
            data: {
              id: String(recentRows[r][0]),
              data: rDate,
              estabelecimento: rEstab,
              valor: rValor,
              categoria: String(recentRows[r][4]),
              metodo: String(recentRows[r][5]),
            },
          });
        }
      }
    }

    // 4. Inserção na Planilha Google
    const id = Utilities.getUuid();
    sheet.appendRow([id, data, estabelecimento, valor, categoria, metodo]);

    const createdItem = {
      id: id,
      data: data,
      estabelecimento: estabelecimento,
      valor: valor,
      categoria: categoria,
      metodo: metodo,
    };

    // 5. Sincronização em segundo plano com o Notion (não-bloqueante)
    syncToNotion_(createdItem);

    return jsonResponse_({
      status: 'ok',
      data: createdItem,
    });
  } catch (err) {
    return jsonResponse_({ status: 'error', message: String(err) });
  } finally {
    lock.releaseLock();
  }
}
