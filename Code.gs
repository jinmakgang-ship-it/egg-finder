/* ══════════════════════════════════════════
   계란 알림이 — Google Apps Script
   역할: 식단 데이터 저장(Sheets) + 매일 9시 텔레그램 알림 발송
══════════════════════════════════════════ */

/* ── CONFIG ── */
function getConfig() {
  const props = PropertiesService.getScriptProperties();
  return {
    tgToken:     props.getProperty('tgToken')     || '',
    tgChatId:    props.getProperty('tgChatId')    || '',
    tgChatIds:   JSON.parse(props.getProperty('tgChatIds') || '[]'),
    clovaUrl:    props.getProperty('clovaUrl')    || '',
    clovaSecret: props.getProperty('clovaSecret') || '',
  };
}

function saveConfig(cfg) {
  const props = PropertiesService.getScriptProperties();
  if (cfg.tgToken)     props.setProperty('tgToken',     cfg.tgToken);
  if (cfg.clovaUrl)    props.setProperty('clovaUrl',    cfg.clovaUrl);
  if (cfg.clovaSecret) props.setProperty('clovaSecret', cfg.clovaSecret);
}

// 기기별 chat ID 등록 (중복 없이 추가)
function registerChatId(chatId) {
  if (!chatId) return;
  const props = PropertiesService.getScriptProperties();
  const ids = JSON.parse(props.getProperty('tgChatIds') || '[]');
  if (ids.indexOf(chatId) === -1) {
    ids.push(chatId);
    props.setProperty('tgChatIds', JSON.stringify(ids));
  }
}

/* ── WEB APP ── */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // 텔레그램 webhook update 감지 (update_id 존재 여부로 구분)
    if (data.update_id !== undefined) {
      return handleTelegramUpdate(data);
    }

    if (data.type === 'checkPw') {
      const stored = PropertiesService.getScriptProperties().getProperty('lockPw') || '';
      const ok2 = data.pw === stored;
      return ContentService.createTextOutput(JSON.stringify({ ok: ok2 })).setMimeType(ContentService.MimeType.JSON);
    } else if (data.type === 'config') {
      saveConfig(data);
      if (data.tgChatId) registerChatId(data.tgChatId);
      return ok();
    } else if (data.type === 'registerChatId') {
      registerChatId(data.chatId);
      return ok();
    } else if (data.type === 'meal') {
      saveMeal(data);
      return ok();
    } else if (data.type === 'batchMeals') {
      for (const meal of (data.meals || [])) saveMeal(meal);
      if (data.message) {
        const cfg = getConfig();
        if (cfg.tgToken) {
          const chatIds = cfg.tgChatIds.length ? cfg.tgChatIds : (cfg.tgChatId ? [cfg.tgChatId] : []);
          chatIds.forEach(function(id) {
            try { sendTelegram(cfg.tgToken, id, data.message); } catch(e) {}
          });
        }
      }
      return ok();
    } else if (data.type === 'getMeals') {
      const sheet  = getSheet();
      const values = sheet.getDataRange().getValues();
      const meals  = {};
      for (let i = 1; i < values.length; i++) {
        if (!values[i][0]) continue;
        const raw = values[i][0];
        const dateKey = raw instanceof Date ? fmtDate(raw) : String(raw).trim();
        if (!dateKey) continue;
        meals[dateKey] = {
          hasEgg:  values[i][1] === true || values[i][1] === 'true',
          menus:   JSON.parse(values[i][2] || '[]'),
          rawText: values[i][3],
        };
      }
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true, meals }))
        .setMimeType(ContentService.MimeType.JSON);
    } else if (data.type === 'broadcast') {
      const cfg = getConfig();
      if (cfg.tgToken && data.message) {
        const chatIds = cfg.tgChatIds.length ? cfg.tgChatIds : (cfg.tgChatId ? [cfg.tgChatId] : []);
        chatIds.forEach(function(id) {
          try { sendTelegram(cfg.tgToken, id, data.message); } catch(e) {}
        });
      }
      return ok();
    } else if (data.type === 'ocr') {
      const result = callClovaOcr(data.imageBase64, data.mimeType);
      return ContentService
        .createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }
    return ok();
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/* ── CLOVA OCR PROXY ── */
function callClovaOcr(imageBase64, mimeType) {
  const cfg = getConfig();
  if (!cfg.clovaUrl || !cfg.clovaSecret) return { ok: false, error: 'OCR 미설정' };
  const format = mimeType && mimeType.includes('png') ? 'png' : 'jpg';
  try {
    const res = UrlFetchApp.fetch(cfg.clovaUrl, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'X-OCR-SECRET': cfg.clovaSecret },
      payload: JSON.stringify({
        version: 'V2', requestId: 'r-' + Date.now(), timestamp: 0,
        enableTableDetect: true,
        images: [{ format, name: 'meal', data: imageBase64 }]
      }),
      muteHttpExceptions: true,
    });
    return JSON.parse(res.getContentText());
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function doGet(e) {
  if (e?.parameter?.action === 'meals') {
    const sheet  = getSheet();
    const values = sheet.getDataRange().getValues();
    const meals  = {};
    for (let i = 1; i < values.length; i++) {
      if (!values[i][0]) continue;
      const raw = values[i][0];
      const dateKey = raw instanceof Date ? fmtDate(raw) : String(raw).trim();
      if (!dateKey) continue;
      meals[dateKey] = {
        hasEgg: values[i][1] === true || values[i][1] === 'true',
        menus:  JSON.parse(values[i][2] || '[]'),
        rawText: values[i][3],
      };
    }
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, meals }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return ok();
}

function ok() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ── SHEETS ── */
function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('meals');
  if (!sheet) {
    sheet = ss.insertSheet('meals');
    sheet.appendRow(['date', 'hasEgg', 'menus', 'rawText']);
  }
  return sheet;
}

function saveMeal(data) {
  const sheet  = getSheet();
  const values = sheet.getDataRange().getValues();

  let rowIndex = -1;
  for (let i = 1; i < values.length; i++) {
    const raw = values[i][0];
    const dateKey = raw instanceof Date ? fmtDate(raw) : String(raw).trim();
    if (dateKey === data.date) { rowIndex = i + 1; break; }
  }

  const row = [
    data.date,
    data.hasEgg,
    JSON.stringify(data.menus || []),
    data.rawText || '',
  ];

  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, 4).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
}

function getMeal(dateStr) {
  const sheet  = getSheet();
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    const raw = values[i][0];
    const dateKey = raw instanceof Date ? fmtDate(raw) : String(raw).trim();
    if (dateKey === dateStr) {
      return {
        date:    dateKey,
        hasEgg:  values[i][1] === true || values[i][1] === 'true',
        menus:   JSON.parse(values[i][2] || '[]'),
        rawText: values[i][3],
      };
    }
  }
  return null;
}

/* ── TELEGRAM ── */
function sendTelegram(token, chatId, text) {
  UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method:      'post',
    contentType: 'application/json',
    payload:     JSON.stringify({ chat_id: chatId, text: text }),
  });
}

/* ── TELEGRAM WEBHOOK 처리 ── */
function handleTelegramUpdate(update) {
  const cfg = getConfig();
  if (!cfg.tgToken) return ok();

  const msg = update.message || update.edited_message;
  if (!msg) return ok();

  const chatId = String(msg.chat.id);
  const text   = (msg.text || '').trim();

  // /start, /status, /오늘 명령어에만 응답
  if (text === '/start' || text === '/status' || text === '/오늘') {
    sendTelegram(cfg.tgToken, chatId, buildWelcomeMessage());
  }

  return ok();
}

function buildWelcomeMessage() {
  const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
  const today    = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  const todayStr = fmtDate(today);
  const tmrStr   = fmtDate(tomorrow);

  // ── 오늘 / 내일 섹션 (sendDailyNotif과 동일 로직) ──
  function daySection(dateStr, date, label) {
    const meal = getMeal(dateStr);
    const lbl  = `${date.getMonth() + 1}월 ${date.getDate()}일(${DAYS[date.getDay()]})`;
    if (!meal) return `📅 ${label}(${lbl})\n📭 식단 미등록`;
    if (meal.hasEgg) {
      const list = meal.menus && meal.menus.length
        ? meal.menus.map(function(m) {
            const n = m.allergens && m.allergens.length ? ` [${m.allergens.join(',')}번]` : '';
            return `• ${m.slot}: ${m.menu}${n}`;
          }).join('\n')
        : '• 알레르기 번호 1번(알류) 포함';
      return `📅 ${label}(${lbl})\n⚠️ 계란 포함 메뉴 있어요!\n${list}`;
    }
    return `📅 ${label}(${lbl})\n✅ 계란 메뉴 없어요.`;
  }

  const todaySection    = daySection(todayStr, today,    '오늘');
  const tomorrowSection = daySection(tmrStr,   tomorrow, '내일');

  // ── 이달 식단 요약 ──
  const yr  = today.getFullYear();
  const mon = today.getMonth(); // 0-based
  const sheet  = getSheet();
  const values = sheet.getDataRange().getValues();

  // dateKey → row 데이터 (중복 시 마지막 행 우선)
  const dateMap = {};
  for (let i = 1; i < values.length; i++) {
    if (!values[i][0]) continue;
    const raw     = values[i][0];
    const dateKey = raw instanceof Date ? fmtDate(raw) : String(raw).trim();
    if (!dateKey) continue;
    const d = new Date(dateKey);
    if (d.getFullYear() !== yr || d.getMonth() !== mon) continue;
    dateMap[dateKey] = { d, hasEgg: values[i][1] === true || values[i][1] === 'true', menus: JSON.parse(values[i][2] || '[]') };
  }

  const eggLines  = [];
  const safeDates = [];

  Object.keys(dateMap).sort().forEach(function(dk) {
    const { d, hasEgg, menus } = dateMap[dk];
    const lbl = `${d.getDate()}일(${DAYS[d.getDay()]})`;
    if (hasEgg) {
      const menuStr = menus.length
        ? menus.map(function(m) { return `${m.slot}: ${m.menu}`; }).join(', ')
        : '알류 포함';
      eggLines.push(`• ${lbl} — ${menuStr}`);
    } else {
      safeDates.push(lbl);
    }
  });

  const monLabel = `${yr}년 ${mon + 1}월`;
  let monthSection = `📋 ${monLabel} 식단 현황\n`;
  if (eggLines.length === 0) {
    monthSection += '이번 달 계란 포함 식단이 없어요. ✅';
  } else {
    monthSection += `⚠️ 계란 있는 날\n${eggLines.join('\n')}`;
  }

  return `🥚 계란 알림이\n\n${todaySection}\n\n${tomorrowSection}\n\n${monthSection.trimEnd()}\n\n🔗 https://jinmakgang-ship-it.github.io/egg-finder/`;
}

/* ── WEBHOOK 등록 (최초 1회 GAS 편집기에서 직접 실행) ── */
function setWebhook() {
  const cfg = getConfig();
  if (!cfg.tgToken) { Logger.log('tgToken 미설정'); return; }
  const url = PropertiesService.getScriptProperties().getProperty('gasUrl');
  Logger.log('등록할 URL: ' + url);
  const res = UrlFetchApp.fetch(
    `https://api.telegram.org/bot${cfg.tgToken}/setWebhook`,
    {
      method:      'post',
      contentType: 'application/json',
      payload:     JSON.stringify({ url: url, drop_pending_updates: true }),
      muteHttpExceptions: true,
    }
  );
  Logger.log('setWebhook 응답: ' + res.getContentText());
}

/* ── WEBHOOK 상태 확인 ── */
function checkWebhook() {
  const cfg = getConfig();
  if (!cfg.tgToken) { Logger.log('tgToken 미설정'); return; }
  const res = UrlFetchApp.fetch(
    `https://api.telegram.org/bot${cfg.tgToken}/getWebhookInfo`,
    { muteHttpExceptions: true }
  );
  Logger.log('webhook 상태: ' + res.getContentText());
}

/* ── WEBHOOK 해제 ── */
function deleteWebhook() {
  const cfg = getConfig();
  if (!cfg.tgToken) return;
  const res = UrlFetchApp.fetch(`https://api.telegram.org/bot${cfg.tgToken}/deleteWebhook`, {
    method: 'post', muteHttpExceptions: true,
  });
  Logger.log('deleteWebhook 응답: ' + res.getContentText());
}

/* ══════════════════════════════════════════
   대체 음식 추천 (index.html 로직과 동일)
══════════════════════════════════════════ */
const DISH_SUBS = [
  { keys: ['샌드위치'],                              recs: ['치즈샌드위치', '잼토스트', '크래커+치즈'] },
  { keys: ['찜'],                                    recs: ['두부찜', '순두부', '감자조림'] },
  { keys: ['말이'],                                  recs: ['어묵볶음', '두부구이', '멸치볶음'] },
  { keys: ['국', '탕', '찌개'],                      recs: ['미역국', '콩나물국', '두부된장국'] },
  { keys: ['후라이', '부침', '구이'],                 recs: ['두부부침', '고구마조림', '콩자반'] },
  { keys: ['스크램블', '오믈렛'],                    recs: ['감자볶음', '야채볶음', '두부스크램블'] },
  { keys: ['볶음밥'],                                recs: ['참치볶음밥', '야채볶음밥', '주먹밥'] },
  { keys: ['케이크', '머핀', '쿠키', '빵', '와플'],  recs: ['쌀과자', '고구마', '과일', '요거트'] },
  { keys: ['죽'],                                    recs: ['흰죽', '야채죽', '참치죽'] },
];

const SLOT_SUBS = {
  '오전간식': ['바나나', '사과', '귤', '요거트', '치즈+크래커'],
  '오후간식': ['바나나', '고구마', '요거트', '쌀과자', '과일'],
  '점심':     ['두부조림', '멸치볶음', '콩나물무침', '시금치나물'],
  '아침':     ['과일', '치즈', '삶은 고구마', '요거트'],
};

function getSubstitutes(menus) {
  return menus.map(function(m) {
    for (var i = 0; i < DISH_SUBS.length; i++) {
      var ds = DISH_SUBS[i];
      if (ds.keys.some(function(k) { return m.menu.indexOf(k) !== -1; })) {
        return { slot: m.slot, recs: ds.recs };
      }
    }
    var fallback = SLOT_SUBS[m.slot] || SLOT_SUBS['오전간식'];
    return { slot: m.slot, recs: fallback };
  });
}

/* ══════════════════════════════════════════
   매일 오전 9시 알림 (트리거로 실행)
══════════════════════════════════════════ */
function sendDailyNotif() {
  const cfg = getConfig();
  const chatIds = cfg.tgChatIds.length ? cfg.tgChatIds : (cfg.tgChatId ? [cfg.tgChatId] : []);
  if (!cfg.tgToken || !chatIds.length) return;

  const today = new Date();
  const todayStr = fmtDate(today);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tmrStr = fmtDate(tomorrow);

  const meal = getMeal(tmrStr);

  const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
  const dl = `${tomorrow.getMonth() + 1}월 ${tomorrow.getDate()}일 (${DAYS[tomorrow.getDay()]})`;
  const todayLabel = `${today.getMonth() + 1}월 ${today.getDate()}일 (${DAYS[today.getDay()]})`;

  // 오늘 식단 리마인드
  const todayMeal = getMeal(todayStr);
  let todaySection;
  if (!todayMeal) {
    todaySection = `📅 오늘(${todayLabel})\n📭 식단 미등록`;
  } else if (todayMeal.hasEgg) {
    const todayList = todayMeal.menus && todayMeal.menus.length
      ? todayMeal.menus.map(function(m) {
          const numStr = m.allergens && m.allergens.length ? ` [${m.allergens.join(',')}번]` : '';
          return `• ${m.slot}: ${m.menu}${numStr}`;
        }).join('\n')
      : '• 알레르기 번호 1번(알류) 포함';
    todaySection = `📅 오늘(${todayLabel})\n⚠️ 계란 포함 메뉴 있어요!\n${todayList}`;
  } else {
    todaySection = `📅 오늘(${todayLabel})\n✅ 계란 메뉴 없어요.`;
  }

  let tomorrowSection;
  if (!meal) {
    tomorrowSection = `📅 내일(${dl})\n📭 식단 미등록`;
  } else if (meal.hasEgg) {
    const list = meal.menus && meal.menus.length
      ? meal.menus.map(function(m) {
          const numStr = m.allergens && m.allergens.length ? ` [${m.allergens.join(',')}번]` : '';
          return `• ${m.slot}: ${m.menu}${numStr}`;
        }).join('\n')
      : '• 알레르기 번호 1번(알류) 포함';

    const srcMenus = meal.menus && meal.menus.length
      ? meal.menus
      : [{ slot: '식단', menu: '계란 포함 메뉴' }];
    const subs    = getSubstitutes(srcMenus);
    const subText = subs.map(function(s) {
      return `[${s.slot} 대신]\n→ ${s.recs.slice(0, 3).join(', ')}`;
    }).join('\n\n');

    tomorrowSection = `📅 내일(${dl})\n⚠️ 계란 포함 메뉴\n${list}\n\n※ 메뉴명과 번호를 직접 확인해 주세요\n\n🍱 대체 음식 추천\n${subText}\n\n👜 내일 등원 시 대체 간식을 챙겨주세요!`;
  } else {
    tomorrowSection = `📅 내일(${dl})\n✅ 계란 메뉴 없어요. 안심하세요!`;
  }

  const msg = `🥚 어린이집 계란 알림\n\n${todaySection}\n\n${tomorrowSection}\n\n🔗 https://jinmakgang-ship-it.github.io/egg-finder/`;

  chatIds.forEach(function(id) { sendTelegram(cfg.tgToken, id, msg); });
}

/* ── UTILS ── */
function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ══════════════════════════════════════════
   트리거 자동 설치 (최초 1회만 실행)
   Apps Script 편집기에서 직접 실행하세요.
══════════════════════════════════════════ */
function installTrigger() {
  // 기존 트리거 모두 제거
  ScriptApp.getProjectTriggers().forEach(function(t) {
    ScriptApp.deleteTrigger(t);
  });
  // 매일 오전 8시(KST) 알림 트리거
  ScriptApp.newTrigger('sendDailyNotif')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .inTimezone('Asia/Seoul')
    .create();
  // 1분마다 Telegram 폴링
  ScriptApp.newTrigger('pollTelegram')
    .timeBased()
    .everyMinutes(1)
    .create();
  Logger.log('트리거 설치 완료 ✅');
}

/* ══════════════════════════════════════════
   Telegram 폴링 (1분마다 트리거 실행)
   webhook 대신 사용 — GAS POST 302 문제 우회
══════════════════════════════════════════ */
function pollTelegram() {
  const cfg = getConfig();
  if (!cfg.tgToken) return;

  const props  = PropertiesService.getScriptProperties();
  const offset = parseInt(props.getProperty('tgOffset') || '0');

  const res = UrlFetchApp.fetch(
    `https://api.telegram.org/bot${cfg.tgToken}/getUpdates?offset=${offset}&limit=10&timeout=0`,
    { muteHttpExceptions: true }
  );
  const data = JSON.parse(res.getContentText());
  if (!data.ok || !data.result || !data.result.length) return;

  for (var i = 0; i < data.result.length; i++) {
    var update = data.result[i];
    handleTelegramUpdate(update);
    props.setProperty('tgOffset', String(update.update_id + 1));
  }
}
