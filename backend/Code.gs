/**
 * Rumo — Backend Google Apps Script (Produção)
 * Integração: Google Planilhas + API do Notion + Atalhos do iOS (Apple Pay) + Rumo WebApp
 *
 * PROPRIEDADES DO SCRIPT (Configurações do Projeto > Propriedades do script):
 *   - API_TOKEN            : Token secreto compartilhado entre WebApp / Atalhos iOS e o Apps Script.
 *   - NOTION_TOKEN         : Token de integração interna da API do Notion (ex: ntn_... ou secret_...).
 *   - NOTION_DATABASE_ID   : ID do banco de dados no Notion onde os gastos serão espelhados.
 *
 * COMO IMPLANTAR:
 *   1. No editor do Apps Script, selecione a função "setupPlanilha" e clique em "Executar" para criar as abas.
 *   2. Clique em "Implantar" > "Gerenciar implantações" > "Editar" > "Nova versão" > "Implantar".
 *   3. Tipo: "App da Web".
 *   4. Executar como: "Eu" (sua conta Google).
 *   5. Quem pode acessar: "Qualquer pessoa" (permite requisições autenticadas por token).
 *   6. Copie o URL da Web App gerado e use em VITE_APPS_SCRIPT_URL.
 */

const EXPENSES_SHEET_NAME = 'Despesas';
const SUMMARY_SHEET_NAME = 'Resumo';
const CONFIG_SHEET_NAME = 'Config';

// Coluna G adicionada para rastreamento 1:1 com Notion
const EXPECTED_HEADERS = ['id', 'data', 'estabelecimento', 'valor', 'categoria', 'metodo', 'notion_id'];

// 20 categorias oficiais do Rumo
const CATEGORIES = [
  'Geral',
  'Cartão',
  'Luz+Agua',
  'Internet',
  'Aluguel',
  'Combustível',
  'Alimentação',
  'Mercado',
  'Investimento',
  'Salário',
  'Extra',
  'Remédio',
  'Academia',
  'Netflix',
  'Amazon Prime',
  'Google Drive',
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
        '\nAbas criadas/atualizadas: Despesas (com notion_id), Resumo e Config (20 categorias).'
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
      .addItem('Testar conexão com o Notion', 'testarConexaoNotion')
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
    firstRowValues.length >= EXPECTED_HEADERS.length &&
    EXPECTED_HEADERS.every(function (h, idx) {
      return firstRowValues[idx] === h;
    });

  if (lastRow === 0 || !hasExpectedHeaders) {
    if (lastRow > 0 && !hasExpectedHeaders) {
      // Se já existem cabeçalhos mas falta a coluna notion_id
      if (firstRowValues.length === 6 && firstRowValues[0] === 'id') {
        sheet.getRange(1, 7).setValue('notion_id');
      } else {
        sheet.insertRowBefore(1);
        sheet.getRange(1, 1, 1, EXPECTED_HEADERS.length).setValues([EXPECTED_HEADERS]);
      }
    } else {
      sheet.getRange(1, 1, 1, EXPECTED_HEADERS.length).setValues([EXPECTED_HEADERS]);
    }
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

  // Larguras das colunas: id, data, estabelecimento, valor, categoria, metodo, notion_id
  const widths = [220, 155, 240, 130, 145, 165, 240];
  for (let c = 0; c < widths.length; c++) {
    sheet.setColumnWidth(c + 1, widths[c]);
  }

  // Formatação e regras de validação (todas as 20 categorias)
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

  // Categorias (20 categorias completas)
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

  // Preserva valores existentes caso a aba já contenha preferências salvas
  const existingValues = sheet.getLastRow() > 1 ? sheet.getDataRange().getValues() : [];
  const configMap = {};
  for (let i = 1; i < existingValues.length; i++) {
    const key = String(existingValues[i][0] || '').trim();
    if (key) configMap[key] = existingValues[i][1];
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

  const baseRows = [
    ['spreadsheet_id', ss.getId()],
    ['aba_principal', EXPENSES_SHEET_NAME],
    ['colunas_despesas', EXPECTED_HEADERS.join(', ')],
    ['categorias_validas', CATEGORIES.join(', ')],
    ['metodos_validos', PAYMENT_METHODS.join(', ')],
    ['token_api', tokenStatus],
    ['sincronizacao_notion', notionStatus],
    ['ultima_inicializacao', now],
    // Preferências de Usuário do Rumo App
    ['user_theme', configMap['user_theme'] || 'system'],
    ['user_glass_clarity', configMap['user_glass_clarity'] || 'equilibrado'],
    ['user_monthly_budget', configMap['user_monthly_budget'] || 3500],
    ['user_auto_sync_seconds', configMap['user_auto_sync_seconds'] || 30],
    ['user_privacy_mode', configMap['user_privacy_mode'] || false],
    ['user_settings_updated_at', configMap['user_settings_updated_at'] || now],
  ];

  sheet.getRange(2, 1, baseRows.length, 2).setValues(baseRows);
  sheet.setColumnWidth(1, 230);
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
  const notionToken = (props.getProperty('NOTION_TOKEN') || props.getProperty('NOTION_API_KEY') || '').trim();
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
    var tz = Session.getScriptTimeZone();
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      if (ss) tz = ss.getSpreadsheetTimeZone() || tz;
    } catch (e) {}
    return Utilities.formatDate(rawDate, tz, "yyyy-MM-dd'T'HH:mm");
  }
  var str = String(rawDate || '').trim();
  if (!str) return '';
  // Formato ISO simples ou com timestamp YYYY-MM-DD...
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.length === 10 ? str + 'T12:00' : str.replace(' ', 'T').slice(0, 16);
  }
  // Formato brasileiro DD/MM/YYYY ou DD/MM/YYYY HH:mm
  var brMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[T\s]+(\d{1,2}):(\d{1,2}))?/);
  if (brMatch) {
    var day = brMatch[1].length === 1 ? '0' + brMatch[1] : brMatch[1];
    var month = brMatch[2].length === 1 ? '0' + brMatch[2] : brMatch[2];
    var year = brMatch[3];
    var hour = brMatch[4] ? (brMatch[4].length === 1 ? '0' + brMatch[4] : brMatch[4]) : '12';
    var min = brMatch[5] ? (brMatch[5].length === 1 ? '0' + brMatch[5] : brMatch[5]) : '00';
    return year + '-' + month + '-' + day + 'T' + hour + ':' + min;
  }
  return str;
}

/**
 * Limpa e converte strings monetárias brasileiras ou internacionais para float positivo.
 */
function parseMonetaryValue_(raw) {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? Math.abs(raw) : 0;
  }
  if (!raw) return 0;

  let str = String(raw).trim();
  str = str.replace(/[^0-9,\.-]/g, '');

  if (str.includes(',') && str.includes('.')) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (str.includes(',')) {
    str = str.replace(',', '.');
  }

  const num = parseFloat(str);
  return Number.isFinite(num) ? Math.abs(num) : 0;
}

/**
 * Normaliza e mapeia categorias do Apple Pay e palavras-chave
 * para as 20 categorias do template Rumo.
 */
function resolveCategory_(rawCategory, merchant) {
  const catInput = String(rawCategory || '').trim();
  const merchantLower = String(merchant || '').toLowerCase();

  // 1. Correspondência exata
  const exact = CATEGORIES.find(function (c) {
    return c.toLowerCase() === catInput.toLowerCase();
  });
  if (exact) return exact;

  const catLower = catInput
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  // 2. Mapeamento por tipo / palavras-chave
  if (catLower.includes('luz') || catLower.includes('agua') || catLower.includes('energia') || catLower.includes('enel') || catLower.includes('sabesp')) {
    return 'Luz+Agua';
  }
  if (catLower.includes('internet') || catLower.includes('wifi') || catLower.includes('fibra') || catLower.includes('vivo') || catLower.includes('claro') || catLower.includes('tim')) {
    return 'Internet';
  }
  if (catLower.includes('aluguel') || catLower.includes('condominio') || catLower.includes('imovel') || catLower.includes('moradia')) {
    return 'Aluguel';
  }
  if (catLower.includes('combustivel') || catLower.includes('gasolina') || catLower.includes('etanol') || catLower.includes('posto') || catLower.includes('shell') || catLower.includes('ipiranga')) {
    return 'Combustível';
  }
  if (catLower.includes('remedio') || catLower.includes('farmacia') || catLower.includes('droga') || catLower.includes('saude') || catLower.includes('drogasil') || catLower.includes('raia')) {
    return 'Remédio';
  }
  if (catLower.includes('academia') || catLower.includes('fitness') || catLower.includes('smart fit') || catLower.includes('gym')) {
    return 'Academia';
  }
  if (catLower.includes('netflix')) return 'Netflix';
  if (catLower.includes('prime') || catLower.includes('amazon')) return 'Amazon Prime';
  if (catLower.includes('drive') || catLower.includes('google') || catLower.includes('icloud') || catLower.includes('storage') || catLower.includes('nuvem')) return 'Google Drive';
  if (catLower.includes('invest') || catLower.includes('renda') || catLower.includes('cdi') || catLower.includes('tesouro')) return 'Investimento';
  if (catLower.includes('salario') || catLower.includes('pagamento') || catLower.includes('provento')) return 'Salário';
  if (catLower.includes('extra') || catLower.includes('freela') || catLower.includes('bico')) return 'Extra';
  if (catLower.includes('cartao') || catLower.includes('fatura') || catLower.includes('nubank') || catLower.includes('bradesco') || catLower.includes('itau')) return 'Cartão';

  if (catLower.includes('food') || catLower.includes('restaurante') || catLower.includes('aliment') || catLower.includes('cafe') || catLower.includes('refeicao') || catLower.includes('ifood') || catLower.includes('mcdonald')) {
    return 'Alimentação';
  }
  if (catLower.includes('grocer') || catLower.includes('mercad') || catLower.includes('supermercado') || catLower.includes('pao de acucar') || catLower.includes('carrefour') || catLower.includes('hortifruti')) {
    return 'Mercado';
  }
  if (catLower.includes('transport') || catLower.includes('uber') || catLower.includes('99app') || catLower.includes('taxi') || catLower.includes('metro') || catLower.includes('onibus')) {
    return 'Transporte';
  }
  if (catLower.includes('lazer') || catLower.includes('cinema') || catLower.includes('show') || catLower.includes('bar ') || catLower.includes('teatro') || catLower.includes('viagem')) {
    return 'Lazer';
  }
  if (catLower.includes('assinat') || catLower.includes('subscript') || catLower.includes('spotify') || catLower.includes('youtube') || catLower.includes('hbo') || catLower.includes('disney')) {
    return 'Assinaturas';
  }

  // 3. Heurísticas por estabelecimento
  if (merchantLower.includes('posto') || merchantLower.includes('shell') || merchantLower.includes('ipiranga')) return 'Combustível';
  if (merchantLower.includes('uber') || merchantLower.includes('99app') || merchantLower.includes('sem parar') || merchantLower.includes('veloe')) return 'Transporte';
  if (merchantLower.includes('drogasil') || merchantLower.includes('droga raia') || merchantLower.includes('drogaria') || merchantLower.includes('farmacia')) return 'Remédio';
  if (merchantLower.includes('smart fit') || merchantLower.includes('bluefit') || merchantLower.includes('academia')) return 'Academia';
  if (merchantLower.includes('ifood') || merchantLower.includes('mcdonald') || merchantLower.includes('starbucks') || merchantLower.includes('padaria') || merchantLower.includes('burger')) return 'Alimentação';
  if (merchantLower.includes('carrefour') || merchantLower.includes('pao de acucar') || merchantLower.includes('extra') || merchantLower.includes('assai') || merchantLower.includes('atacadao') || merchantLower.includes('supermercado')) return 'Mercado';

  return 'Geral';
}

/**
 * Cria o payload com schema exato do banco de dados do Notion.
 * Propriedades: Nome, Valor, Tipo, 'Categoria ', 'Data programada ', 'Data Realizada', Realizado, Observação.
 */
function buildNotionPayload_(item) {
  const dateOnly = String(item.data || '').slice(0, 10) ||
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  return {
    Nome: {
      title: [{ text: { content: String(item.estabelecimento || 'Despesa').trim() } }],
    },
    Valor: {
      number: Number(item.valor || 0),
    },
    Tipo: {
      select: { name: 'Saída' },
    },
    'Categoria ': {
      select: { name: String(item.categoria || 'Geral').trim() },
    },
    'Data programada ': {
      date: { start: dateOnly },
    },
    'Data Realizada': {
      date: { start: dateOnly },
    },
    Realizado: {
      checkbox: true,
    },
    Observação: {
      rich_text: [{ text: { content: 'Método: ' + (item.metodo || 'Apple Pay') + ' (Lançado via Rumo)' } }],
    },
  };
}

/**
 * Sincroniza novo lançamento com o Notion (POST /v1/pages).
 * Retorna o ID da página gerada no Notion ou null se desativado/erro.
 */
function syncToNotion_(item) {
  const creds = getScriptCredentials_();
  if (!creds.notionToken || !creds.notionDbId) {
    return null;
  }

  try {
    const payload = {
      parent: { database_id: creds.notionDbId },
      properties: buildNotionPayload_(item),
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
    const resText = response.getContentText();

    if (code >= 200 && code < 300) {
      const resJson = JSON.parse(resText);
      Logger.log('Criado no Notion com sucesso: ' + item.estabelecimento + ' (ID: ' + resJson.id + ')');
      return resJson.id;
    } else {
      Logger.log('Erro ao criar no Notion (HTTP ' + code + '): ' + resText);
      return null;
    }
  } catch (err) {
    Logger.log('Exceção ao sincronizar com Notion: ' + err);
    return null;
  }
}

/**
 * Atualiza lançamento existente no Notion (PATCH /v1/pages/:id).
 */
function updateNotion_(pageId, item) {
  const creds = getScriptCredentials_();
  if (!creds.notionToken || !pageId) return false;

  try {
    const payload = {
      properties: buildNotionPayload_(item),
    };

    const options = {
      method: 'patch',
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + creds.notionToken,
        'Notion-Version': '2022-06-28',
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    };

    const response = UrlFetchApp.fetch('https://api.notion.com/v1/pages/' + pageId, options);
    const code = response.getResponseCode();

    if (code >= 200 && code < 300) {
      Logger.log('Atualizado no Notion com sucesso (ID: ' + pageId + ')');
      return true;
    } else {
      Logger.log('Erro ao atualizar no Notion (HTTP ' + code + '): ' + response.getContentText());
      return false;
    }
  } catch (err) {
    Logger.log('Exceção ao atualizar no Notion: ' + err);
    return false;
  }
}

/**
 * Arquiva (deleta) lançamento no Notion (PATCH /v1/pages/:id { archived: true }).
 */
function archiveNotion_(pageId) {
  const creds = getScriptCredentials_();
  if (!creds.notionToken || !pageId) return false;

  try {
    const options = {
      method: 'patch',
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + creds.notionToken,
        'Notion-Version': '2022-06-28',
      },
      payload: JSON.stringify({ archived: true }),
      muteHttpExceptions: true,
    };

    const response = UrlFetchApp.fetch('https://api.notion.com/v1/pages/' + pageId, options);
    const code = response.getResponseCode();
    return code >= 200 && code < 300;
  } catch (err) {
    Logger.log('Exceção ao arquivar no Notion: ' + err);
    return false;
  }
}

/**
 * Fallback: Busca ID da página no Notion por estabelecimento + data + valor
 * para itens legados que não possuem notion_id gravado na planilha.
 */
function findNotionPageIdByMatch_(item) {
  const creds = getScriptCredentials_();
  if (!creds.notionToken || !creds.notionDbId) return null;

  try {
    const dateOnly = String(item.data || '').slice(0, 10);
    const body = {
      page_size: 10,
      filter: {
        and: [
          {
            property: 'Nome',
            title: {
              equals: String(item.estabelecimento || '').trim(),
            },
          },
        ],
      },
    };

    const options = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + creds.notionToken,
        'Notion-Version': '2022-06-28',
      },
      payload: JSON.stringify(body),
      muteHttpExceptions: true,
    };

    const response = UrlFetchApp.fetch(
      'https://api.notion.com/v1/databases/' + creds.notionDbId + '/query',
      options
    );

    if (response.getResponseCode() === 200) {
      const data = JSON.parse(response.getContentText());
      const results = data.results || [];
      for (let i = 0; i < results.length; i++) {
        const p = results[i];
        if (p.archived) continue;
        const val = p.properties && p.properties.Valor && p.properties.Valor.number;
        if (typeof val === 'number' && Math.abs(val - Number(item.valor)) < 0.05) {
          return p.id;
        }
      }
      if (results.length > 0 && !results[0].archived) {
        return results[0].id;
      }
    }
  } catch (e) {
    Logger.log('Aviso: falha na busca de página correspondente no Notion: ' + e);
  }
  return null;
}

/**
 * Função de diagnóstico executável no editor do Apps Script para validar o Notion.
 */
function testarConexaoNotion() {
  const creds = getScriptCredentials_();
  Logger.log('=== TESTE DE CONEXÃO COM O NOTION ===');
  Logger.log('Token presente: ' + Boolean(creds.notionToken));
  Logger.log('Database ID: ' + (creds.notionDbId || 'NÃO CONFIGURADO'));

  if (!creds.notionToken || !creds.notionDbId) {
    const msg = 'Erro: Defina NOTION_TOKEN e NOTION_DATABASE_ID nas Propriedades do Script.';
    Logger.log(msg);
    try {
      SpreadsheetApp.getUi().alert(msg);
    } catch (e) {}
    return { ok: false, message: msg };
  }

  try {
    const options = {
      method: 'get',
      headers: {
        Authorization: 'Bearer ' + creds.notionToken,
        'Notion-Version': '2022-06-28',
      },
      muteHttpExceptions: true,
    };

    const res = UrlFetchApp.fetch(
      'https://api.notion.com/v1/databases/' + creds.notionDbId,
      options
    );
    const code = res.getResponseCode();
    const text = res.getContentText();

    if (code === 200) {
      const db = JSON.parse(text);
      const title = (db.title && db.title[0] && db.title[0].plain_text) || 'Sem título';
      const propNames = Object.keys(db.properties || {});
      const msg =
        'Conexão com o Notion bem-sucedida!\n\n' +
        'Database: ' +
        title +
        '\nPropriedades encontradas (' +
        propNames.length +
        '): ' +
        propNames.join(', ');
      Logger.log(msg);
      try {
        SpreadsheetApp.getUi().alert(msg);
      } catch (e) {}
      return { ok: true, title: title, properties: propNames };
    } else {
      const msg = 'Falha na conexão com o Notion (HTTP ' + code + '):\n' + text;
      Logger.log(msg);
      try {
        SpreadsheetApp.getUi().alert(msg);
      } catch (e) {}
      return { ok: false, error: text };
    }
  } catch (err) {
    const msg = 'Exceção ao testar Notion: ' + err;
    Logger.log(msg);
    try {
      SpreadsheetApp.getUi().alert(msg);
    } catch (e) {}
    return { ok: false, error: String(err) };
  }
}

/**
 * Ponto de entrada GET (leitura de transações e configurações)
 * Endpoint: ?token=<TOKEN>&mes=YYYY-MM
 */
function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    const auth = validateToken_(params.token);
    if (!auth.ok) {
      return jsonResponse_({ status: 'error', message: auth.message });
    }

    const action = String(params.action || 'list').toLowerCase();
    const ss = getSpreadsheet_();

    // 1. Inicialização remota de abas (?action=setup&token=...)
    if (action === 'setup') {
      const setupResult = setupPlanilha();
      return jsonResponse_(setupResult);
    }

    // 2. Ping / Health Check (?action=ping&token=...)
    if (action === 'ping') {
      const creds = getScriptCredentials_();
      return jsonResponse_({
        status: 'ok',
        spreadsheetId: ss.getId(),
        spreadsheetName: ss.getName(),
        notionConfigured: Boolean(creds.notionToken && creds.notionDbId),
        serverTime: new Date().toISOString(),
      });
    }

    // 3. Leitura de Configurações salvas (?action=get_settings&token=...)
    if (action === 'get_settings') {
      const configSheet = ss.getSheetByName(CONFIG_SHEET_NAME) || ensureConfigSheet_(ss);
      const rows = configSheet.getDataRange().getValues();
      const settings = {};
      for (let i = 1; i < rows.length; i++) {
        const k = String(rows[i][0] || '').trim();
        if (k.startsWith('user_')) {
          const cleanKey = k.replace(/^user_/, '');
          settings[cleanKey] = rows[i][1];
        }
      }
      return jsonResponse_({ status: 'ok', settings: settings });
    }

    // 4. Listagem de Transações (?mes=YYYY-MM&token=...)
    let sheet = ss.getSheetByName(EXPENSES_SHEET_NAME);
    if (!sheet) {
      sheet = ensureExpensesSheet_(ss);
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
      const notionId = rows[i][6];

      if (!estabelecimento && !valor) continue;

      const isoDate = formatRowDate_(rawDate);
      if (mes && !isoDate.startsWith(mes)) continue;

      items.push({
        id: String(id || 'row-' + (i + 1)),
        data: isoDate,
        estabelecimento: String(estabelecimento || '').trim(),
        valor: typeof valor === 'number' ? valor : parseMonetaryValue_(valor),
        categoria: String(categoria || 'Geral').trim(),
        metodo: String(metodo || 'Apple Pay').trim(),
        notionId: notionId ? String(notionId).trim() : undefined,
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
 * Ponto de entrada POST (inclusão, edição, exclusão e gravação de preferências)
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

    // 1. Gravar configurações (?action=save_settings)
    if (action === 'save_settings') {
      const configSheet = ss.getSheetByName(CONFIG_SHEET_NAME) || ensureConfigSheet_(ss);
      const confData = configSheet.getDataRange().getValues();
      const settingsPayload = body.settings || {};
      const nowIso = new Date().toISOString();

      const keyMap = {
        theme: 'user_theme',
        glassClarity: 'user_glass_clarity',
        monthlyBudget: 'user_monthly_budget',
        autoSyncSeconds: 'user_auto_sync_seconds',
        privacyMode: 'user_privacy_mode',
      };

      for (const [propKey, sheetKey] of Object.entries(keyMap)) {
        if (settingsPayload[propKey] !== undefined) {
          let found = false;
          for (let r = 1; r < confData.length; r++) {
            if (String(confData[r][0] || '').trim() === sheetKey) {
              configSheet.getRange(r + 1, 2).setValue(settingsPayload[propKey]);
              found = true;
              break;
            }
          }
          if (!found) {
            configSheet.appendRow([sheetKey, settingsPayload[propKey]]);
          }
        }
      }

      // Atualiza timestamp
      let tsFound = false;
      for (let r = 1; r < confData.length; r++) {
        if (String(confData[r][0] || '').trim() === 'user_settings_updated_at') {
          configSheet.getRange(r + 1, 2).setValue(nowIso);
          tsFound = true;
          break;
        }
      }
      if (!tsFound) {
        configSheet.appendRow(['user_settings_updated_at', nowIso]);
      }

      return jsonResponse_({ status: 'ok', savedAt: nowIso });
    }

    // 2. Exclusão de lançamento (?action=delete)
    if (action === 'delete') {
      const targetId = String(body.id || '').trim();
      if (!targetId) {
        return jsonResponse_({ status: 'error', message: 'ID obrigatório para exclusão.' });
      }
      const rows = sheet.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        const rowId = String(rows[i][0] || 'row-' + (i + 1));
        if (rowId === targetId) {
          const notionId = String(rows[i][6] || body.notionId || '').trim();
          sheet.deleteRow(i + 1);

          // Arquiva no Notion se configurado e não solicitado skip
          if (notionId && body.skipNotion !== true) {
            archiveNotion_(notionId);
          }
          return jsonResponse_({ status: 'ok', deletedId: targetId });
        }
      }
      return jsonResponse_({ status: 'error', message: 'Registro não encontrado na planilha.' });
    }

    // Extração e normalização de dados comuns (criação e edição)
    const targetId = String(body.id || '').trim();
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

    // 3. Edição de lançamento (?action=update)
    if (action === 'update') {
      if (!targetId) {
        return jsonResponse_({ status: 'error', message: 'ID obrigatório para edição.' });
      }

      const rows = sheet.getDataRange().getValues();
      let rowIndex = -1;
      let existingNotionId = String(body.notionId || '').trim();

      for (let i = 1; i < rows.length; i++) {
        const rowId = String(rows[i][0] || 'row-' + (i + 1));
        if (rowId === targetId) {
          rowIndex = i + 1;
          if (!existingNotionId) {
            existingNotionId = String(rows[i][6] || '').trim();
          }
          break;
        }
      }

      // Fallback: se o ID não bater diretamente, busca por aproximação (estabelecimento antigo + valor + data)
      if (rowIndex === -1 && body.original) {
        const origEst = String(body.original.estabelecimento || '').trim().toLowerCase();
        const origVal = parseMonetaryValue_(body.original.valor);
        const origDate = String(body.original.data || '').slice(0, 10);

        for (let i = 1; i < rows.length; i++) {
          const rEst = String(rows[i][2] || '').trim().toLowerCase();
          const rVal = parseMonetaryValue_(rows[i][3]);
          const rDate = formatRowDate_(rows[i][1]).slice(0, 10);

          if (rEst === origEst && Math.abs(rVal - origVal) < 0.05 && rDate === origDate) {
            rowIndex = i + 1;
            if (!existingNotionId) {
              existingNotionId = String(rows[i][6] || '').trim();
            }
            break;
          }
        }
      }

      if (rowIndex === -1) {
        return jsonResponse_({ status: 'error', message: 'Lançamento não encontrado para edição.' });
      }

      // Se ainda não temos notion_id, tenta localizar a página correspondente no Notion
      if (!existingNotionId && body.skipNotion !== true) {
        existingNotionId = findNotionPageIdByMatch_(body.original || { estabelecimento, valor, data });
      }

      // Atualiza na planilha Google: data, estabelecimento, valor, categoria, metodo, notion_id
      sheet.getRange(rowIndex, 2, 1, 6).setValues([[
        data,
        estabelecimento,
        valor,
        categoria,
        metodo,
        existingNotionId || '',
      ]]);

      const updatedItem = {
        id: targetId,
        data: data,
        estabelecimento: estabelecimento,
        valor: valor,
        categoria: categoria,
        metodo: metodo,
        notionId: existingNotionId || undefined,
      };

      // Atualiza no Notion se configurado e não solicitado skip
      if (existingNotionId && body.skipNotion !== true) {
        updateNotion_(existingNotionId, updatedItem);
      } else if (!existingNotionId && body.skipNotion !== true) {
        // Se a página não existia, cria e grava o notion_id
        const newNotionId = syncToNotion_(updatedItem);
        if (newNotionId) {
          sheet.getRange(rowIndex, 7).setValue(newNotionId);
          updatedItem.notionId = newNotionId;
        }
      }

      return jsonResponse_({
        status: 'ok',
        data: updatedItem,
      });
    }

    // 4. Criação de lançamento (?action=create)
    // Idempotência / Anti-duplicidade (verifica últimas 5 linhas nos últimos 2 minutos)
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const checkCount = Math.min(5, lastRow - 1);
      const startRow = lastRow - checkCount + 1;
      const recentRows = sheet.getRange(startRow, 1, checkCount, EXPECTED_HEADERS.length).getValues();

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
              notionId: String(recentRows[r][6] || '').trim() || undefined,
            },
          });
        }
      }
    }

    const id = Utilities.getUuid();
    let notionId = String(body.notionId || '').trim();

    // Sincroniza com o Notion antes ou em paralelo, se não vier do servidor local (skipNotion)
    if (!notionId && body.skipNotion !== true) {
      const createdNotionId = syncToNotion_({
        estabelecimento: estabelecimento,
        valor: valor,
        categoria: categoria,
        metodo: metodo,
        data: data,
      });
      if (createdNotionId) {
        notionId = createdNotionId;
      }
    }

    sheet.appendRow([id, data, estabelecimento, valor, categoria, metodo, notionId || '']);

    const createdItem = {
      id: id,
      data: data,
      estabelecimento: estabelecimento,
      valor: valor,
      categoria: categoria,
      metodo: metodo,
      notionId: notionId || undefined,
    };

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
