// ==UserScript==
// @name         Fullcast 求人まとめ＋無限スクロール v2.4.2
// @namespace    codex.local
// @version      2.4.2
// @description  類似求人の集約、自動読込、検索条件保存、ログイン維持補助を行います。
// @match        https://fullcast.jp/*
// @match        https://sp.fullcast.jp/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(() => {
  'use strict';

  // 氏名・キャストIDを含む「ようこそ」欄は、フルキャストの全ページで隠す。
  var privacyStyle = document.getElementById('fcjg-privacy-style');
  if (!privacyStyle) {
    privacyStyle = document.createElement('style');
    privacyStyle.id = 'fcjg-privacy-style';
    privacyStyle.textContent = '.name_Area { display: none !important; visibility: hidden !important; }';
    (document.head || document.documentElement).append(privacyStyle);
  }

  var STORE_KEEP_SESSION = 'fcjg-keep-session';
  var STORE_KEEP_SESSION_LAST = 'fcjg-keep-session-last';
  var KEEP_SESSION_INTERVAL = 4 * 60 * 1000;
  var keepSessionTimer = 0;

  function globalSavedBoolean(key, defaultValue) {
    var saved = localStorage.getItem(key);
    return saved === null ? defaultValue : saved === 'true';
  }

  function startSessionKeepalive() {
    if (keepSessionTimer) return;
    async function pingSession(force) {
      if (!globalSavedBoolean(STORE_KEEP_SESSION, true)) return;
      var now = Date.now();
      var last = Number(localStorage.getItem(STORE_KEEP_SESSION_LAST) || 0);
      if (!force && now - last < KEEP_SESSION_INTERVAL - 5000) return;
      // 全タブで送信時刻を共有し、複数タブから同時にアクセスしない。
      localStorage.setItem(STORE_KEEP_SESSION_LAST, String(now));
      try {
        await fetch('/flinkccpc/sc/cca1201/', {
          method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'follow'
        });
      } catch (error) {
        console.debug('[FCJG] ログイン維持アクセスを送信できませんでした', error);
      }
    }
    keepSessionTimer = window.setInterval(() => pingSession(false), KEEP_SESSION_INTERVAL);
    window.addEventListener('focus', () => pingSession(false));
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) pingSession(false);
    });
  }

  if (globalSavedBoolean(STORE_KEEP_SESSION, true)) startSessionKeepalive();

  // 求人詳細（cbc1113）や日別詳細（cbc1103）では絶対に動かさない。
  // @matchに加え、実行時にも求人一覧の既知URLだけを許可する。
  var LIST_PAGE = /^\/flinkccpc\/sc\/ucas1010\/(?:listPagingWithSearch|searchHold)?\/?$/;
  if (!LIST_PAGE.test(location.pathname)) return;

  function startMain() {

  var CARD = '.result-detail-box';
  var LIST = '.search-result-box';
  var PAGER = '.pager-box';
  var NEXT = 'a.page-link.next';
  var STORE_MODE = 'fcjg-group-mode';
  var STORE_AUTO = 'fcjg-auto-load';
  var STORE_LOAD_ALL = 'fcjg-load-all';
  var STORE_HIDE_CLOSED = 'fcjg-hide-closed';
  var STORE_TIME_FROM = 'fcjg-time-from';
  var STORE_TIME_TO = 'fcjg-time-to';
  var STORE_TIME_PRESETS = 'fcjg-time-presets';
  var STORE_TIME_PRESET_SELECTED = 'fcjg-time-preset-selected';
  var STORE_WEEKDAYS = 'fcjg-weekdays';
  var STORE_SEEN = 'fcjg-seen-jobs';
  var STORE_SEEN_GROUPS = 'fcjg-seen-job-groups';
  var STORE_CALENDAR_OPEN = 'fcjg-calendar-open';
  var STORE_COLLAPSED_SLOTS = 'fcjg-collapsed-slots';
  var STORE_COMPACT_JOBS = 'fcjg-compact-jobs';
  var STORE_DATE_FROM = 'fcjg-search-date-from';
  var STORE_DATE_TO = 'fcjg-search-date-to';
  var STORE_DATE_STATE = 'fcjg-search-date-state';
  var STORE_SAVE_DATES = 'fcjg-save-search-dates';
  var WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

  function savedBoolean(key, defaultValue) {
    var saved = localStorage.getItem(key);
    return saved === null ? defaultValue : saved === 'true';
  }

  function savedMode() {
    var saved = localStorage.getItem(STORE_MODE);
    return ['standard', 'broad', 'off'].includes(saved) ? saved : 'standard';
  }

  function savedWeekdays() {
    try {
      var values = JSON.parse(localStorage.getItem(STORE_WEEKDAYS));
      if (Array.isArray(values)) return values.map(Number).filter((value) => value >= 0 && value <= 6);
    } catch {}
    return [0, 1, 2, 3, 4, 5, 6];
  }

  function savedArray(key) {
    try {
      var values = JSON.parse(localStorage.getItem(key));
      return Array.isArray(values) ? values : [];
    } catch {
      return [];
    }
  }

  function savedTimePresetName() {
    var name = localStorage.getItem(STORE_TIME_PRESET_SELECTED) || '';
    var from = localStorage.getItem(STORE_TIME_FROM) || '';
    var to = localStorage.getItem(STORE_TIME_TO) || '';
    var preset = savedArray(STORE_TIME_PRESETS).find((item) => item && item.name === name);
    return preset && (preset.from || '') === from && (preset.to || '') === to ? name : '';
  }

  function restoreAndBindSearchDates() {
    if (!savedBoolean(STORE_SAVE_DATES, true)) return;
    var form = document.getElementById('form_search');
    if (!form || form.dataset.fcjgDatesBound === '1') return;
    var validDate = (value) => /^\d{4}\/\d{2}\/\d{2}$/.test(value || '');
    function dateRow() {
      return [...form.querySelectorAll('tr')].find((row) => /^日付/.test(clean(row.cells?.[0]?.innerText || ''))) || null;
    }
    function controls() {
      var row = dateRow();
      if (!row) return { inputs: [], radios: [] };
      return {
        inputs: [...row.querySelectorAll('input[type="text"], input[type="date"]')],
        radios: [...row.querySelectorAll('input[type="radio"]')]
      };
    }
    var initial = controls();
    if (!initial.inputs.length && !initial.radios.length) return;

    var savedState = null;
    try {
      savedState = JSON.parse(localStorage.getItem(STORE_DATE_STATE) || 'null');
    } catch {}
    // v2.3.0/2.3.1で保存された開始・終了日も、初回だけ新形式へ引き継ぐ。
    if (!savedState || !Array.isArray(savedState.values)) {
      var legacyFrom = localStorage.getItem(STORE_DATE_FROM) || '';
      var legacyTo = localStorage.getItem(STORE_DATE_TO) || '';
      savedState = {
        modeIndex: initial.radios.findIndex((radio) => radio.checked),
        modeValue: initial.radios.find((radio) => radio.checked)?.value || '',
        values: [legacyFrom, legacyTo].filter(validDate)
      };
    }

    var restoring = true;
    function restoreValues() {
      var current = controls();
      current.inputs.forEach((input, index) => {
        var value = savedState.values[index] || '';
        if (validDate(value)) input.value = value;
      });
    }
    function restoreMode(triggerSiteHandler) {
      var current = controls();
      var target = current.radios[savedState.modeIndex];
      if (!target && savedState.modeValue !== undefined) {
        target = current.radios.find((radio) => radio.value === String(savedState.modeValue));
      }
      if (target) {
        target.checked = true;
        // フルキャスト側の表示切替処理も動かし、期間用の2欄を表示させる。
        if (triggerSiteHandler) target.click();
      }
      restoreValues();
    }
    function saveDates() {
      if (restoring || !savedBoolean(STORE_SAVE_DATES, true)) return;
      var current = controls();
      var checked = current.radios.find((radio) => radio.checked);
      // 空欄も位置情報として残し、1日用・期間用の入力欄が混在してもずれないようにする。
      var values = current.inputs.map((input) => validDate(input.value) ? input.value : '');
      localStorage.setItem(STORE_DATE_STATE, JSON.stringify({
        modeIndex: checked ? current.radios.indexOf(checked) : -1,
        modeValue: checked?.value || '',
        values
      }));
      if (values[0]) localStorage.setItem(STORE_DATE_FROM, values[0]);
      if (values[1]) localStorage.setItem(STORE_DATE_TO, values[1]);
    }

    restoreMode(false);
    form.addEventListener('input', (event) => {
      if (dateRow()?.contains(event.target)) setTimeout(saveDates, 0);
    }, true);
    form.addEventListener('change', (event) => {
      if (dateRow()?.contains(event.target)) setTimeout(saveDates, 0);
    }, true);
    form.addEventListener('submit', saveDates, true);
    window.addEventListener('pagehide', saveDates);
    form.dataset.fcjgDatesBound = '1';
    // ページ側のDOMContentLoaded処理が揃った後、ラジオのclick処理を一度通す。
    setTimeout(() => {
      restoreMode(true);
      setTimeout(restoreValues, 0);
      // フルキャスト側に遅延表示処理があっても、最後にもう一度値を戻す。
      setTimeout(() => {
        restoreValues();
        restoring = false;
      }, 120);
    }, 0);
  }

  function setDateSaving(enabled) {
    localStorage.setItem(STORE_SAVE_DATES, String(enabled));
    if (!enabled) {
      localStorage.removeItem(STORE_DATE_STATE);
      localStorage.removeItem(STORE_DATE_FROM);
      localStorage.removeItem(STORE_DATE_TO);
      return;
    }
    restoreAndBindSearchDates();
  }

  injectStyle();
  restoreAndBindSearchDates();
  if (!document.querySelector(CARD) || !document.querySelector(LIST)) {
    injectSearchTimeFilter();
    if (!document.getElementById('fcjg-toolbar')) createInitialToolbar();
    return;
  }
  if (document.getElementById('fcjg-toolbar')) return;

  var state = {
    mode: savedMode(),
    auto: savedBoolean(STORE_AUTO, true),
    loadAll: savedBoolean(STORE_LOAD_ALL, false),
    hideClosed: savedBoolean(STORE_HIDE_CLOSED, false),
    timeFrom: localStorage.getItem(STORE_TIME_FROM) || '',
    timeTo: localStorage.getItem(STORE_TIME_TO) || '',
    timePreset: savedTimePresetName(),
    weekdays: savedWeekdays(),
    excludedDates: new Set(),
    includedDates: new Set(),
    calendarMonthKey: '',
    seen: new Set(savedArray(STORE_SEEN)),
    firstSeenRun: localStorage.getItem(STORE_SEEN) === null,
    seenGroups: new Set(savedArray(STORE_SEEN_GROUPS)),
    firstGroupSeenRun: localStorage.getItem(STORE_SEEN_GROUPS) === null,
    newGroupsThisView: new Set(),
    collapsedSlots: new Set(savedArray(STORE_COLLAPSED_SLOTS)),
    compactJobs: new Set(savedArray(STORE_COMPACT_JOBS)),
    loading: false,
    sessionStopped: false,
    hasNext: Boolean(findNextLink(document)),
    loadedPages: 1,
    resultTotal: resultTotalOf(document),
    groups: new Map(),
    pagingDocument: document,
    pagingUrl: location.href,
  };

  console.info('[FCJG v2.4.2] 起動しました（保存設定を適用）');
  var ui = createToolbar();
  var list = document.querySelector(LIST);
  injectSearchTimeFilter((from, to, presetName) => {
    state.timeFrom = from;
    state.timeTo = to;
    state.timePreset = presetName || '';
    regroupAll();
    var range = `${state.timeFrom || '指定なし'} ～ ${state.timeTo || '指定なし'}`;
    var loaded = document.querySelectorAll(CARD).length;
    setMessage(`読込済み${loaded}件を再利用し、勤務時間を「${range}」で絞り込みました（再読込なし）`);
  });
  var pager = list.querySelector(PAGER) || document.querySelector(PAGER);
  var sentinel = document.createElement('div');
  sentinel.id = 'fcjg-sentinel';
  sentinel.textContent = 'ここまで来ると次のページを読み込みます';
  (pager?.parentElement === list ? pager : list.lastElementChild)?.before?.(sentinel);
  if (!sentinel.isConnected) list.append(sentinel);
  if (pager) pager.classList.add('fcjg-original-pager');

  regroupAll();

  var LOAD_MARGIN = 1200;
  var scrollCheckScheduled = false;
  var observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) loadNextPage();
  }, { rootMargin: LOAD_MARGIN + 'px 0px' });
  observer.observe(sentinel);

  // IntersectionObserverは、要素が監視範囲内に居続けると再発火しない。
  // スクロール・リサイズ時にも位置を確認して取りこぼしを防ぐ。
  function isSentinelNearViewport() {
    var rect = sentinel.getBoundingClientRect();
    return rect.top <= window.innerHeight + LOAD_MARGIN && rect.bottom >= -LOAD_MARGIN;
  }

  function scheduleLoadCheck() {
    if (scrollCheckScheduled) return;
    scrollCheckScheduled = true;
    requestAnimationFrame(() => {
      scrollCheckScheduled = false;
      if (isSentinelNearViewport()) loadNextPage();
    });
  }

  window.addEventListener('scroll', scheduleLoadCheck, { passive: true });
  window.addEventListener('resize', scheduleLoadCheck, { passive: true });

  function clean(value) {
    return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  }

  function rowText(card, iconClass) {
    var icon = card.querySelector(`.${iconClass}`);
    return clean(icon?.parentElement?.querySelector('.col-11')?.innerText);
  }

  function detailHref(card) {
    var detailElements = [...card.querySelectorAll('a, button, [onclick], [data-href], [data-url]')];
    var candidates = detailElements.filter((element) =>
      /cbc1113|詳細を見る|詳細はこちら/.test([
        element.getAttribute('href'), element.getAttribute('onclick'),
        element.getAttribute('data-href'), element.getAttribute('data-url'),
        element.textContent
      ].join(' '))
    );

    for (var element of candidates) {
      var values = [element.getAttribute('href'), element.getAttribute('data-href'), element.getAttribute('data-url')];
      for (var value of values) {
        var raw = clean(value);
        if (raw && !/^(?:javascript:|#)/i.test(raw)) {
          try { return new URL(raw, location.href).href; } catch {}
        }
      }

      // hrefがjavascriptの場合は、onclick内に埋め込まれた詳細URLを取り出す。
      var handler = element.getAttribute('onclick') || '';
      var urlMatch = handler.match(/['"]([^'"]*\/cbc1113\/\d+[^'"]*)['"]/i);
      if (urlMatch) {
        try { return new URL(urlMatch[1], location.href).href; } catch {}
      }
      var idMatch = handler.match(/(?:cbc1113|detail|shosai)[^\d]{0,30}(\d{6,})/i);
      if (idMatch) return new URL(`/flinkccpc/ns/cbc1113/${idMatch[1]}`, location.origin).href;
    }

    // サイト側がリンクを作らずIDだけを持つ画面用の予備処理。
    var idFields = card.querySelectorAll('input[type="hidden"], [data-job-id], [data-condition-id]');
    for (var field of idFields) {
      var fieldName = [field.getAttribute('name'), field.id, field.getAttribute('data-job-id'), field.getAttribute('data-condition-id')].join(' ');
      var fieldValue = clean(field.value || field.getAttribute('data-job-id') || field.getAttribute('data-condition-id'));
      if (/(?:job|recruit|condition|boshu|anken).*(?:id|no)|(?:id|no).*(?:job|recruit|condition|boshu|anken)/i.test(fieldName) && /^\d{6,}$/.test(fieldValue)) {
        return new URL(`/flinkccpc/ns/cbc1113/${fieldValue}`, location.origin).href;
      }
    }
    return '';
  }

  function titleOf(card) {
    return clean(card.querySelector('.job-title')?.innerText);
  }

  function normalizedTitle(title) {
    return clean(title)
      .toLowerCase()
      .replace(/\d{1,2}\s*[:：]\s*\d{2}\s*(?:[～〜~\-]|から)\s*\d{1,2}\s*[:：]\s*\d{2}/g, '')
      .replace(/(?:時給|日給|日額|給与|手当)\s*[￥¥]?\s*[\d,.]+\s*円?/g, '')
      .replace(/[￥¥]\s*[\d,.]+\s*円?/g, '')
      .replace(/\d{1,2}\s*時\s*(?:から|～|〜|~|\-)?\s*\d{0,2}\s*時?/g, '')
      .replace(/(?:早番|中番|遅番|朝勤|昼勤|夕勤|夜勤|日勤|時間帯|シフト)/g, '')
      .replace(/(?:即払(?:い)?可?|交通費|交あり|交付|直行)/g, '')
      .replace(/[\s\[\]【】()（）「」『』!！?？☆★♪◎●・:：+＋_\-]/g, '');
  }

  function imageKey(card) {
    var img = card.querySelector('.job-detail-slider-box img, img');
    var raw = img?.currentSrc || img?.src || img?.getAttribute('data-src') || '';
    try { return new URL(raw, location.href).pathname; } catch { return raw; }
  }

  function companyName(card) {
    var lines = [...card.querySelectorAll('.job-detail-row .col-11, [class*="company"], [class*="client"]')]
      .flatMap((element) => String(element.innerText || '').split(/\n+/))
      .map(clean);
    var hit = lines.find((line) => /^(?:企業名|会社名|勤務先|就業先(?:企業)?)[：:]/.test(line));
    return hit ? clean(hit.replace(/^[^：:]+[：:]/, '')) : '';
  }

  function firstStation(card) {
    var text = rowText(card, 'job-detail-station');
    return clean(text.split('/')[0]);
  }

  function groupKey(card) {
    var href = detailHref(card);
    if (state.mode === 'off') return href || `unique-${Math.random()}`;

    var address = rowText(card, 'job-detail-address');
    var work = rowText(card, 'job-detail-work');
    var company = companyName(card);

    // 「広め」は会社名の有無に左右されず、画像・場所・職種で判定する。
    if (state.mode === 'broad') {
      return `broad|${imageKey(card)}|${address}|${work}`;
    }

    // 「標準」は会社名を取得できれば会社単位、できなければ案件名を使用する。
    if (company) return `company|${company}|${address}|${work}`;
    var core = normalizedTitle(titleOf(card));
    if (core.length >= 4) return `title|${core}|${address}|${work}`;
    return `fallback|${imageKey(card)}|${address}|${firstStation(card)}|${work}`;
  }

  function variantOf(card) {
    return {
      href: detailHref(card),
      nativeDetail: [...card.querySelectorAll('a, button, [onclick]')].find((element) => /(?:お仕事)?詳細(?:を)?見(?:る|こちら)/.test(clean(element.textContent))),
      title: titleOf(card),
      date: rowText(card, 'job-detail-term') || '日付記載なし',
      time: rowText(card, 'job-detail-time') || '時間記載なし',
      salary: rowText(card, 'job-detail-salary') || '給与記載なし',
    };
  }

  function variantId(v) {
    return [v.href, v.date, v.time, v.salary].join('|');
  }

  function dateInfo(value) {
    var match = String(value || '').match(/(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s*\(([日月火水木金土])\))?/);
    if (!match) return null;
    var year = Number(match[1]);
    var month = Number(match[2]);
    var day = Number(match[3]);
    var weekday = match[4] ? WEEKDAY_LABELS.indexOf(match[4]) : new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return { year, month, day, weekday, key: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` };
  }

  function smallHash(value) {
    var hash = 2166136261;
    for (var index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function cardIdentity(card) {
    var detail = variantOf(card);
    var handler = detail.nativeDetail?.getAttribute('onclick') || '';
    return smallHash([handler, detail.href, detail.title, detail.date, detail.time, detail.salary].join('|'));
  }

  function jobIdentity(card) {
    var detail = variantOf(card);
    var handler = detail.nativeDetail?.getAttribute('onclick') || '';
    var conditionId = handler.match(/['"]bosyuJyokenId['"]\s*,\s*['"]?(\d{6,})/i);
    if (conditionId) return `condition-${conditionId[1]}`;
    var hrefId = detail.href.match(/\/cbc1113\/(\d{6,})/i);
    if (hrefId) return `detail-${hrefId[1]}`;
    return `content-${smallHash([companyName(card), normalizedTitle(detail.title), rowText(card, 'job-detail-address'), rowText(card, 'job-detail-work'), imageKey(card)].join('|'))}`;
  }

  function markNewCard(card) {
    if (card.dataset.fcjgSeenChecked === '1') return;
    card.dataset.fcjgSeenChecked = '1';
    var identity = cardIdentity(card);
    if (!state.firstSeenRun && !state.seen.has(identity)) card.dataset.fcjgNewDate = '1';
    state.seen.add(identity);
    var recent = [...state.seen].slice(-2500);
    state.seen = new Set(recent);
    localStorage.setItem(STORE_SEEN, JSON.stringify(recent));

    var groupIdentity = jobIdentity(card);
    card.dataset.fcjgJobIdentity = groupIdentity;
    if (!state.firstGroupSeenRun && !state.seenGroups.has(groupIdentity)) state.newGroupsThisView.add(groupIdentity);
    if (state.newGroupsThisView.has(groupIdentity)) card.dataset.fcjgNewJob = '1';
    state.seenGroups.add(groupIdentity);
    var recentGroups = [...state.seenGroups].slice(-1500);
    state.seenGroups = new Set(recentGroups);
    localStorage.setItem(STORE_SEEN_GROUPS, JSON.stringify(recentGroups));
  }

  function ensureBox(card) {
    var box = card.querySelector(':scope > .fcjg-variants');
    if (box) return box;
    box = document.createElement('section');
    box.className = 'fcjg-variants';
    box.innerHTML = '<div class="fcjg-variants-title"><span>募集枠</span><span class="fcjg-badge">0</span><span class="fcjg-new-job-badge" hidden>NEW案件</span><button class="fcjg-slots-toggle" type="button"></button></div><div class="fcjg-variant-list"></div>';
    card.append(box);
    return box;
  }

  function storeIdentitySet(key, values) {
    var recent = [...values].slice(-1500);
    localStorage.setItem(key, JSON.stringify(recent));
    return new Set(recent);
  }

  function ensureGroupPresentation(group) {
    var card = group.card;
    [...card.children].forEach((child) => {
      if (child !== group.box) child.dataset.fcjgOriginalChild = '1';
    });
    var controls = document.createElement('div');
    controls.className = 'fcjg-card-controls';
    controls.innerHTML = '<button class="fcjg-job-compact-toggle" type="button"></button>';
    var summary = document.createElement('div');
    summary.className = 'fcjg-compact-summary';
    summary.innerHTML = `<strong>${escapeHtml(titleOf(card) || '案件名記載なし')}</strong><span>${escapeHtml(rowText(card, 'job-detail-address') || '勤務地記載なし')}</span><span>${escapeHtml(rowText(card, 'job-detail-work') || '職種記載なし')}</span>`;
    card.prepend(summary);
    card.prepend(controls);
    group.controls = controls;
    group.slotButton = group.box.querySelector('.fcjg-slots-toggle');
    // 旧版で求人だけ省略済みだった場合も、初回表示時に募集枠を合わせて省略する。
    if (state.compactJobs.has(group.storageKey) && !state.collapsedSlots.has(group.storageKey)) {
      state.collapsedSlots.add(group.storageKey);
      state.collapsedSlots = storeIdentitySet(STORE_COLLAPSED_SLOTS, state.collapsedSlots);
    }

    controls.querySelector('.fcjg-job-compact-toggle').addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (state.compactJobs.has(group.storageKey)) {
        state.compactJobs.delete(group.storageKey);
      } else {
        state.compactJobs.add(group.storageKey);
        state.collapsedSlots.add(group.storageKey);
        state.collapsedSlots = storeIdentitySet(STORE_COLLAPSED_SLOTS, state.collapsedSlots);
      }
      state.compactJobs = storeIdentitySet(STORE_COMPACT_JOBS, state.compactJobs);
      applyGroupPresentation(group);
    });
    group.slotButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (state.collapsedSlots.has(group.storageKey)) state.collapsedSlots.delete(group.storageKey);
      else state.collapsedSlots.add(group.storageKey);
      state.collapsedSlots = storeIdentitySet(STORE_COLLAPSED_SLOTS, state.collapsedSlots);
      applyGroupPresentation(group);
    });
    applyGroupPresentation(group);
  }

  function applyGroupPresentation(group) {
    var compact = state.compactJobs.has(group.storageKey);
    var slotsCollapsed = state.collapsedSlots.has(group.storageKey);
    var hiddenSlotCount = Math.max(0, group.ids.size - 3);
    var slotButton = group.slotButton;
    group.card.classList.toggle('fcjg-card-compact', compact);
    group.box.classList.toggle('fcjg-slots-collapsed', slotsCollapsed);
    group.controls.querySelector('.fcjg-job-compact-toggle').textContent = compact ? '求人を全表示' : '求人を省略表示';
    slotButton.hidden = group.ids.size <= 3;
    slotButton.textContent = slotsCollapsed ? `残り${hiddenSlotCount}件を一覧表示` : '募集枠を省略';
  }

  function addVariant(group, variant) {
    var id = variantId(variant);
    if (group.ids.has(id)) return;
    group.ids.add(id);

    var row = document.createElement('a');
    row.className = 'fcjg-variant';
    // ログイン後一覧の詳細遷移はonclickやフォームに認証状態が含まれる。
    // 公開用URLへ置換せず、フルキャスト本来のクリック処理を呼び出す。
    row.href = '#';
    row.innerHTML = `
      <span class="fcjg-date">${escapeHtml(variant.date)}${variant.isNewDate ? '<em class="fcjg-new-date-badge">NEW日付</em>' : ''}</span>
      <strong class="fcjg-time">${escapeHtml(variant.time)}</strong>
      <span class="fcjg-pay">${escapeHtml(variant.salary)}</span>
      <span class="fcjg-link">詳細を見る →</span>`;
    row.title = variant.title;
    row.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      activateNativeDetail(variant.nativeDetail, event.ctrlKey || event.metaKey || event.shiftKey);
    });
    row.addEventListener('auxclick', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.button === 1) activateNativeDetail(variant.nativeDetail, true);
    });
    group.box.querySelector('.fcjg-variant-list').append(row);
    group.box.querySelector('.fcjg-badge').textContent = String(group.ids.size);
    group.variants.push(variant);
    if (variant.isNewJob) group.isNewJob = true;
    group.box.querySelector('.fcjg-new-job-badge').hidden = !group.isNewJob;
    group.card.classList.toggle('fcjg-grouped', group.ids.size > 1);
    applyGroupPresentation(group);
  }

  function activateNativeDetail(detail, newTab) {
    if (!detail) {
      setMessage('元の詳細リンクが見つかりません');
      return;
    }

    var handler = detail.getAttribute('onclick') || '';
    var formMatch = handler.match(/actSubmit3\(\s*['"]([^'"]+)['"]/);
    var form = formMatch ? document.getElementById(formMatch[1]) : null;
    if (!newTab) {
      detail.click();
      return;
    }
    if (!form) {
      setMessage('新しいタブ用の送信フォームが見つかりません');
      return;
    }

    var oldTarget = form.getAttribute('target');
    form.setAttribute('target', '_blank');
    try {
      // actSubmit3へ元の募集条件ID・枠ID・日付をそのまま渡す。
      detail.click();
    } finally {
      setTimeout(() => {
        if (oldTarget === null) form.removeAttribute('target');
        else form.setAttribute('target', oldTarget);
      }, 0);
    }
  }

  function closedLabel(card) {
    // 「終了」という単語だけでは判定せず、応募状態として使われる表現だけを拾う。
    var closedPattern = /^(?:応募終了|募集終了|受付終了|応募受付終了|応募締切|募集締切|締切済み|受付終了しました|応募受付を終了しました|募集を終了しました|この求人は(?:応募|募集|受付)(?:を)?終了(?:しました|しています)?|募集定員に達しました|定員に達しました)[。！!]*$/;
    var statusPattern = /^(?:closed|ended|finished|recruit(?:ment)?[-_ ]?end(?:ed)?|application[-_ ]?closed)$/i;

    var statusNodes = card.querySelectorAll([
      'button', 'a', 'input', '[role="button"]', '[aria-label]', '[title]',
      '[data-status]', '[class*="status"]', '[class*="closed"]',
      '[class*="finish"]', '[class*="recruit-end"]', '[class*="entry-end"]'
    ].join(','));

    for (var node of statusNodes) {
      var dataStatus = clean(node.getAttribute('data-status'));
      if (dataStatus && statusPattern.test(dataStatus)) return dataStatus;
      var values = [node.innerText, node.value, node.getAttribute('aria-label'), node.getAttribute('title'), node.getAttribute('alt')];
      for (var value of values) {
        var lines = String(value || '').split(/\n+/).map(clean).filter(Boolean);
        var matched = lines.find((line) => closedPattern.test(line));
        if (matched) return matched;
      }
    }

    // 専用classが無い場合に備え、短い独立テキスト要素も確認する。
    var elements = card.querySelectorAll('span, strong, em, p, div');
    for (var element of elements) {
      if (element.children.length || element.closest('.fcjg-variants')) continue;
      var label = clean(element.textContent);
      if (label.length <= 40 && closedPattern.test(label)) return label;
    }
    return '';
  }

  function timeMinutes(value) {
    var match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
    return match ? (Number(match[1]) * 60) + Number(match[2]) : null;
  }

  function workTimeOf(card) {
    var text = rowText(card, 'job-detail-time');
    var match = text.match(/(\d{1,2}):(\d{2})\s*(?:-|–|—|－|~|～|〜|から)\s*(\d{1,2}):(\d{2})/);
    if (!match) return null;
    var start = (Number(match[1]) * 60) + Number(match[2]);
    var end = (Number(match[3]) * 60) + Number(match[4]);
    if (end <= start) end += 24 * 60;
    return { start, end };
  }

  function matchesTimeFilter(card) {
    if (!state.timeFrom && !state.timeTo) return true;
    var workTime = workTimeOf(card);
    // 時刻を取得できない求人は、誤って消さないよう表示を維持する。
    if (!workTime) return true;
    var from = timeMinutes(state.timeFrom);
    var to = timeMinutes(state.timeTo);
    if (from !== null && to !== null && to <= from) to += 24 * 60;
    if (from !== null && workTime.start < from) return false;
    if (to !== null && workTime.end > to) return false;
    return true;
  }

  function matchesWeekdayFilter(card) {
    if (state.weekdays.length === 7) return true;
    var info = dateInfo(rowText(card, 'job-detail-term'));
    // 日付を取得できない求人は誤って消さない。
    return !info || state.weekdays.includes(info.weekday) || state.includedDates.has(info.key);
  }

  function matchesDateFilter(card) {
    var info = dateInfo(rowText(card, 'job-detail-term'));
    return !info || !state.excludedDates.has(info.key);
  }

  function processCard(card) {
    if (card.dataset.fcjgProcessed === '1') return;
    card.dataset.fcjgProcessed = '1';
    markNewCard(card);
    card.style.display = '';
    delete card.dataset.fcjgHiddenClosed;
    delete card.dataset.fcjgHiddenTime;
    delete card.dataset.fcjgHiddenWeekday;
    delete card.dataset.fcjgHiddenDate;
    var closed = closedLabel(card);
    if (closed) card.dataset.fcjgClosed = closed;
    else delete card.dataset.fcjgClosed;
    if (state.hideClosed && closed) {
      card.dataset.fcjgHiddenClosed = '1';
      card.style.display = 'none';
      return;
    }
    if (!matchesTimeFilter(card)) {
      card.dataset.fcjgHiddenTime = '1';
      card.style.display = 'none';
      return;
    }
    if (!matchesWeekdayFilter(card)) {
      card.dataset.fcjgHiddenWeekday = '1';
      card.style.display = 'none';
      return;
    }
    if (!matchesDateFilter(card)) {
      card.dataset.fcjgHiddenDate = '1';
      card.style.display = 'none';
      return;
    }
    var key = groupKey(card);
    var group = state.groups.get(key);
    if (!group) {
      group = { card, box: ensureBox(card), ids: new Set(), variants: [], isNewJob: false, storageKey: card.dataset.fcjgJobIdentity || jobIdentity(card) };
      state.groups.set(key, group);
      ensureGroupPresentation(group);
    } else {
      card.style.display = 'none';
    }
    var variant = variantOf(card);
    variant.isNewDate = card.dataset.fcjgNewDate === '1';
    variant.isNewJob = card.dataset.fcjgNewJob === '1';
    addVariant(group, variant);
  }

  function regroupAll() {
    state.groups.clear();
    document.querySelectorAll(CARD).forEach((card) => {
      card.style.display = '';
      delete card.dataset.fcjgProcessed;
      delete card.dataset.fcjgHiddenClosed;
      delete card.dataset.fcjgHiddenTime;
      delete card.dataset.fcjgHiddenWeekday;
      delete card.dataset.fcjgHiddenDate;
      card.classList.remove('fcjg-grouped');
      card.classList.remove('fcjg-card-compact');
      card.querySelectorAll(':scope > .fcjg-card-controls, :scope > .fcjg-compact-summary').forEach((element) => element.remove());
      card.querySelectorAll(':scope > [data-fcjg-original-child]').forEach((element) => delete element.dataset.fcjgOriginalChild);
      card.querySelectorAll(':scope > .fcjg-variants').forEach((box) => box.remove());
    });
    document.querySelectorAll(CARD).forEach(processCard);
    stopAtResultTotal();
    updateStatus();
    updateDateFilterCalendar();
  }

  function resultTotalOf(pageDocument) {
    var text = clean(pageDocument.body?.innerText);
    var match = text.match(/検索結果\s*([\d,]+)\s*件\s*中/);
    return match ? Number(match[1].replace(/,/g, '')) : 0;
  }

  function cardCounts() {
    var cards = [...document.querySelectorAll(CARD)];
    var closed = cards.filter((card) => Boolean(card.dataset.fcjgClosed)).length;
    var timeExcluded = cards.filter((card) => card.dataset.fcjgHiddenTime === '1').length;
    var weekdayExcluded = cards.filter((card) => card.dataset.fcjgHiddenWeekday === '1').length;
    var dateExcluded = cards.filter((card) => card.dataset.fcjgHiddenDate === '1').length;
    var newDateCount = cards.filter((card) => card.dataset.fcjgNewDate === '1').length;
    var newJobCount = new Set(cards.filter((card) => card.dataset.fcjgNewJob === '1').map((card) => card.dataset.fcjgJobIdentity)).size;
    var shown = cards.filter((card) => card.style.display !== 'none').length;
    return { raw: cards.length, closed, available: cards.length - closed, timeExcluded, weekdayExcluded, dateExcluded, newDateCount, newJobCount, shown };
  }

  function stopAtResultTotal() {
    if (!state.resultTotal) return false;
    var counts = cardCounts();
    if (counts.available < state.resultTotal) return false;
    state.hasNext = false;
    return true;
  }

  async function loadNextPage(force = false) {
    if (!state.hasNext) {
      if (force) setMessage('追加ページはありません（読み込み完了）');
      return;
    }
    if ((!state.auto && !state.loadAll && !force) || state.loading || (state.sessionStopped && !force)) return;
    if (force) state.sessionStopped = false;
    state.loading = true;
    setMessage('次のページを読み込み中…');
    try {
      var pageDocument = await requestNextDocument();
      var incoming = [...pageDocument.querySelectorAll(`${LIST} > ${CARD}`)];
      if (!incoming.length) throw new Error('求人カードが見つかりません');

      for (var sourceCard of incoming) {
        var card = document.importNode(sourceCard, true);
        card.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
        card.querySelectorAll('.slick-initialized').forEach((element) => element.classList.remove('slick-initialized'));
        list.insertBefore(card, sentinel);
        processCard(card);
      }

      state.resultTotal = resultTotalOf(pageDocument) || state.resultTotal;
      state.hasNext = Boolean(findNextLink(pageDocument));
      state.loadedPages += 1;
      var reachedTotal = stopAtResultTotal();
      setMessage(reachedTotal ? `応募可能件数が検索結果${state.resultTotal}件に到達したため、読込を停止しました` : (!state.hasNext ? '最後のページまで読み込みました' : (state.loadAll ? `最後まで一括読込中…（${state.loadedPages}ページ完了）` : '下へスクロールすると続きを読み込みます')));
      updateStatus();
      updateDateFilterCalendar();
    } catch (error) {
      console.warn('[Fullcast Job Grouper]', error);
      // 通信失敗はこの画面の読込だけを止める。ユーザーが選んだ設定は変更しない。
      state.sessionStopped = true;
      setMessage(`この画面での自動読込を停止しました（設定は保存済み・${error.message}）`);
    } finally {
      state.loading = false;
      if (!state.sessionStopped && state.loadAll && state.hasNext) {
        // 一括読込はサーバーへ連打しすぎないよう少し間隔を空ける。
        setTimeout(() => loadNextPage(true), 350);
      } else if (!state.sessionStopped && state.auto && state.hasNext && isSentinelNearViewport()) {
        // 追加後も下端が近い場合は、交差イベントを待たず次ページを確認する。
        setTimeout(loadNextPage, 150);
      }
    }
  }

  function findNextLink(pageDocument) {
    var candidates = [...pageDocument.querySelectorAll(`${NEXT}, a.next, a, button`)].filter((element) => {
      var text = clean(element.textContent);
      return text === '次のページへ' || text === '次へ' || text === '次の10件';
    });
    return candidates.find((element) =>
      !element.matches('[disabled], .disabled, [aria-disabled="true"]') &&
      !element.closest('.disabled, [aria-disabled="true"]')
    ) || null;
  }

  async function requestNextDocument() {
    var sourceDocument = state.pagingDocument;
    var next = findNextLink(sourceDocument);
    if (!next) {
      state.hasNext = false;
      throw new Error('次のページが見つかりません');
    }

    var rawHref = clean(next.getAttribute('href'));
    var response;

    if (rawHref && !rawHref.toLowerCase().startsWith('javascript:')) {
      var requestUrl = new URL(rawHref, state.pagingUrl).href;
      response = await fetch(requestUrl, { credentials: 'same-origin' });
    } else {
      // ログイン後のスポット求人では次の形式になっている：
      // goPaging('form_paging', 1, 10)
      var handler = next.getAttribute('onclick') || '';
      var args = handler.match(/goPaging\(\s*['"]([^'"]+)['"]\s*,\s*(-?\d+)\s*,\s*(\d+)\s*\)/);
      if (!args) throw new Error('ページ送りの設定を読み取れません');

      var form = sourceDocument.getElementById(args[1]);
      if (!form) throw new Error(`ページ送りフォーム「${args[1]}」が見つかりません`);

      var step = Number(args[2]);
      var pageSize = Number(args[3]);
      var body = new URLSearchParams();
      new FormData(form).forEach((value, name) => {
        if (typeof value === 'string') body.append(name, value);
      });

      // フルキャスト公式 common.js の goPaging と同じ計算。
      var currentOffset = Number.parseInt(body.get('offset') || '0', 10) || 0;
      var nextOffset = currentOffset + (pageSize * step);
      body.set('offset', String(nextOffset));
      body.set('position', String(Math.floor(nextOffset / pageSize)));

      var requestUrl = new URL(form.getAttribute('action') || state.pagingUrl, state.pagingUrl);
      var method = clean(form.getAttribute('method') || 'post').toUpperCase();
      if (method === 'GET') {
        body.forEach((value, name) => requestUrl.searchParams.append(name, value));
        response = await fetch(requestUrl.href, { credentials: 'same-origin' });
      } else {
        response = await fetch(requestUrl.href, {
          method,
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body: body.toString(),
        });
      }
    }

    if (!response.ok) throw new Error(`ページ取得に失敗しました（HTTP ${response.status}）`);
    var html = await response.text();
    var parsedDocument = new DOMParser().parseFromString(html, 'text/html');
    if (!parsedDocument.querySelector(CARD)) {
      if (/ログインID|パスワード/.test(clean(parsedDocument.body?.innerText))) {
        throw new Error('ログイン状態を引き継げませんでした');
      }
      throw new Error('取得したページに求人がありません');
    }
    state.pagingDocument = parsedDocument;
    state.pagingUrl = response.url || state.pagingUrl;
    return parsedDocument;
  }

  function escapeHtml(value) {
    var span = document.createElement('span');
    span.textContent = value;
    return span.innerHTML;
  }

  function weekdayFilterHtml() {
    return `<fieldset class="fcjg-weekdays"><legend>曜日</legend><div class="fcjg-weekday-list">${[1, 2, 3, 4, 5, 6, 0].map((day) => `<label><input type="checkbox" data-fcjg-weekday="${day}"> ${WEEKDAY_LABELS[day]}</label>`).join('')}</div><div class="fcjg-weekday-quick"><button type="button" data-days="0,1,2,3,4,5,6">全て</button><button type="button" data-days="1,2,3,4,5">平日</button><button type="button" data-days="0,6">土日</button></div></fieldset>`;
  }

  function bindWeekdayFilter(bar, initialValues, onChange) {
    var selected = initialValues.slice();
    var checks = [...bar.querySelectorAll('[data-fcjg-weekday]')];
    function render() {
      checks.forEach((check) => { check.checked = selected.includes(Number(check.dataset.fcjgWeekday)); });
    }
    function commit() {
      selected = checks.filter((check) => check.checked).map((check) => Number(check.dataset.fcjgWeekday));
      localStorage.setItem(STORE_WEEKDAYS, JSON.stringify(selected));
      if (onChange) onChange(selected.slice());
    }
    checks.forEach((check) => check.addEventListener('change', commit));
    bar.querySelectorAll('[data-days]').forEach((button) => button.addEventListener('click', () => {
      var requested = button.dataset.days.split(',').map(Number);
      var requestedAlreadySelected = requested.length === 7 && requested.every((day) => selected.includes(day));
      selected = requestedAlreadySelected ? [] : requested;
      render();
      commit();
    }));
    render();
  }

  function dateFilterHtml(available) {
    return `<details class="fcjg-date-filter"><summary>日付フィルター <span id="fcjg-date-filter-label">${available ? '個別指定なし' : '検索結果で利用できます'}</span></summary><div id="fcjg-date-filter-calendar">${available ? '日付を読み取り中…' : '求人を検索すると、読込済み求人の日付がここに表示されます。'}</div></details>`;
  }

  function bindCalendarOpenState(bar) {
    var details = bar.querySelector('.fcjg-date-filter');
    if (!details) return;
    details.open = savedBoolean(STORE_CALENDAR_OPEN, false);
    details.addEventListener('toggle', () => {
      localStorage.setItem(STORE_CALENDAR_OPEN, String(details.open));
    });
  }

  function updateDateFilterCalendar() {
    var root = ui?.bar.querySelector('#fcjg-date-filter-calendar');
    var label = ui?.bar.querySelector('#fcjg-date-filter-label');
    if (!root || !label) return;
    var dateCounts = new Map();
    document.querySelectorAll(CARD).forEach((card) => {
      var info = dateInfo(rowText(card, 'job-detail-term'));
      if (!info) return;
      var entry = dateCounts.get(info.key) || { info, count: 0, newCount: 0 };
      entry.count += 1;
      if (card.dataset.fcjgNewDate === '1') entry.newCount += 1;
      dateCounts.set(info.key, entry);
    });
    var entries = [...dateCounts.values()].sort((a, b) => a.info.key.localeCompare(b.info.key));
    var validKeys = new Set(entries.map((entry) => entry.info.key));
    state.excludedDates = new Set([...state.excludedDates].filter((key) => validKeys.has(key)));
    state.includedDates = new Set([...state.includedDates].filter((key) => validKeys.has(key)));
    var exceptionParts = [];
    if (state.includedDates.size) exceptionParts.push(`${state.includedDates.size}日追加`);
    if (state.excludedDates.size) exceptionParts.push(`${state.excludedDates.size}日除外`);
    label.textContent = exceptionParts.length ? `個別${exceptionParts.join('・')}` : '個別指定なし';
    root.replaceChildren();
    if (!entries.length) {
      root.textContent = '日付を取得できる求人がありません。';
      return;
    }
    var clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'fcjg-date-clear';
    clear.textContent = '個別の日付指定をすべて解除';
    clear.disabled = state.excludedDates.size === 0 && state.includedDates.size === 0;
    clear.addEventListener('click', () => {
      state.excludedDates.clear();
      state.includedDates.clear();
      regroupAll();
      setMessage('個別の日付追加・除外をすべて解除しました');
    });
    root.append(clear);
    var months = new Map();
    entries.forEach((entry) => {
      var key = `${entry.info.year}-${entry.info.month}`;
      if (!months.has(key)) months.set(key, []);
      months.get(key).push(entry);
    });
    var monthKeys = [...months.keys()];
    if (!monthKeys.includes(state.calendarMonthKey)) state.calendarMonthKey = monthKeys[0];
    var monthIndex = monthKeys.indexOf(state.calendarMonthKey);
    var monthEntries = months.get(state.calendarMonthKey);
    var first = monthEntries[0].info;
    var section = document.createElement('section');
    section.className = 'fcjg-filter-month';
    section.innerHTML = `<div class="fcjg-calendar-nav"><button type="button" class="fcjg-month-prev" aria-label="前月">‹</button><strong>${first.year}年${first.month}月</strong><button type="button" class="fcjg-month-next" aria-label="次月">›</button></div><div class="fcjg-calendar-grid"><span class="fcjg-sun">日</span><span>月</span><span>火</span><span>水</span><span>木</span><span>金</span><span class="fcjg-sat">土</span></div>`;
    var previous = section.querySelector('.fcjg-month-prev');
    var next = section.querySelector('.fcjg-month-next');
    previous.disabled = monthIndex <= 0;
    next.disabled = monthIndex >= monthKeys.length - 1;
    previous.addEventListener('click', () => {
      if (monthIndex <= 0) return;
      state.calendarMonthKey = monthKeys[monthIndex - 1];
      updateDateFilterCalendar();
    });
    next.addEventListener('click', () => {
      if (monthIndex >= monthKeys.length - 1) return;
      state.calendarMonthKey = monthKeys[monthIndex + 1];
      updateDateFilterCalendar();
    });
    var grid = section.querySelector('.fcjg-calendar-grid');
    var byDay = new Map(monthEntries.map((entry) => [entry.info.day, entry]));
    var firstWeekday = new Date(Date.UTC(first.year, first.month - 1, 1)).getUTCDay();
    var days = new Date(Date.UTC(first.year, first.month, 0)).getUTCDate();
    for (var blank = 0; blank < firstWeekday; blank += 1) grid.append(document.createElement('i'));
    for (var day = 1; day <= days; day += 1) {
      let entry = byDay.get(day);
      if (!entry) {
        var unavailable = document.createElement('i');
        unavailable.textContent = String(day);
        grid.append(unavailable);
        continue;
      }
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'fcjg-calendar-day';
      var weekdaySelected = state.weekdays.includes(entry.info.weekday);
      var dateIncluded = state.includedDates.has(entry.info.key);
      var weekdayDisabled = !weekdaySelected && !dateIncluded;
      var dateExcluded = state.excludedDates.has(entry.info.key);
      button.classList.toggle('fcjg-weekday-disabled', weekdayDisabled);
      button.classList.toggle('fcjg-date-included', dateIncluded && !weekdaySelected);
      button.classList.toggle('fcjg-date-excluded', dateExcluded);
      button.classList.toggle('fcjg-calendar-new-date', entry.newCount > 0);
      button.innerHTML = `${day}<small>${entry.count}</small>`;
      button.title = !weekdaySelected
        ? `${entry.info.year}/${entry.info.month}/${entry.info.day}を${dateIncluded ? '再び無効化' : '個別に有効化'}${entry.newCount ? `（NEW日付 ${entry.newCount}件）` : ''}`
        : `${entry.info.year}/${entry.info.month}/${entry.info.day}を${dateExcluded ? '再選択' : '除外'}${entry.newCount ? `（NEW日付 ${entry.newCount}件）` : ''}`;
      button.addEventListener('click', () => {
        if (!state.weekdays.includes(entry.info.weekday)) {
          state.excludedDates.delete(entry.info.key);
          if (state.includedDates.has(entry.info.key)) state.includedDates.delete(entry.info.key);
          else state.includedDates.add(entry.info.key);
        } else {
          state.includedDates.delete(entry.info.key);
          if (state.excludedDates.has(entry.info.key)) state.excludedDates.delete(entry.info.key);
          else state.excludedDates.add(entry.info.key);
        }
        regroupAll();
        setMessage(`日付の個別指定：${state.includedDates.size}日追加・${state.excludedDates.size}日除外`);
      });
      grid.append(button);
    }
    // 月ごとの週数にかかわらず6週間（42日枠）を確保し、月送り時の高さを固定する。
    for (var trailing = firstWeekday + days; trailing < 42; trailing += 1) {
      grid.append(document.createElement('i'));
    }
    root.append(section);
  }

  function fitToolbarToViewport(bar) {
    var scheduled = false;
    function fit() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        // transform後もoffsetHeightは元寸法なので、開閉のたびに安定して倍率を計算できる。
        var available = Math.max(240, window.innerHeight - 24);
        var scale = Math.min(1, available / Math.max(1, bar.offsetHeight));
        bar.style.setProperty('--fcjg-fit-scale', String(scale));
      });
    }
    if ('ResizeObserver' in window) new ResizeObserver(fit).observe(bar);
    window.addEventListener('resize', fit);
    fit();
  }

  function createInitialToolbar() {
    var bar = document.createElement('aside');
    bar.id = 'fcjg-toolbar';
    bar.innerHTML = `
      <div class="fcjg-toolbar-title">求人すっきり表示 <small>v2.4.2</small></div>
      <label>まとめ方
        <select id="fcjg-mode">
          <option value="standard">標準（案件名＋勤務地＋職種）</option>
          <option value="broad">広め（画像＋勤務地＋職種）</option>
          <option value="off">まとめない</option>
        </select>
      </label>
      <label class="fcjg-check"><input id="fcjg-hide-closed" type="checkbox"> 応募終了の案件を非表示</label>
      <label class="fcjg-check"><input id="fcjg-save-dates" type="checkbox"> 検索日付と検索方式を保存</label>
      <label class="fcjg-check"><input id="fcjg-keep-session" type="checkbox"> ログイン状態を維持（定期アクセス）</label>
      <label class="fcjg-check"><input id="fcjg-auto" type="checkbox"> 下端付近で自動読込</label>
      <label class="fcjg-check"><input id="fcjg-load-all" type="checkbox"> スクロールせず最後まで一括読込</label>
      ${weekdayFilterHtml()}
      ${dateFilterHtml(false)}
      <div id="fcjg-message">この設定を次の検索結果へ適用します</div>`;
    document.body.append(bar);
    fitToolbarToViewport(bar);
    var mode = bar.querySelector('#fcjg-mode');
    var hideClosed = bar.querySelector('#fcjg-hide-closed');
    var saveDates = bar.querySelector('#fcjg-save-dates');
    var keepSession = bar.querySelector('#fcjg-keep-session');
    var auto = bar.querySelector('#fcjg-auto');
    var loadAll = bar.querySelector('#fcjg-load-all');
    mode.value = savedMode();
    hideClosed.checked = savedBoolean(STORE_HIDE_CLOSED, false);
    saveDates.checked = savedBoolean(STORE_SAVE_DATES, true);
    keepSession.checked = globalSavedBoolean(STORE_KEEP_SESSION, true);
    auto.checked = savedBoolean(STORE_AUTO, true);
    loadAll.checked = savedBoolean(STORE_LOAD_ALL, false);
    bindWeekdayFilter(bar, savedWeekdays());
    bindCalendarOpenState(bar);
    mode.addEventListener('change', () => localStorage.setItem(STORE_MODE, mode.value));
    hideClosed.addEventListener('change', () => localStorage.setItem(STORE_HIDE_CLOSED, String(hideClosed.checked)));
    saveDates.addEventListener('change', () => setDateSaving(saveDates.checked));
    keepSession.addEventListener('change', () => {
      localStorage.setItem(STORE_KEEP_SESSION, String(keepSession.checked));
      if (keepSession.checked) startSessionKeepalive();
    });
    auto.addEventListener('change', () => localStorage.setItem(STORE_AUTO, String(auto.checked)));
    loadAll.addEventListener('change', () => localStorage.setItem(STORE_LOAD_ALL, String(loadAll.checked)));
    return { bar, mode, hideClosed, saveDates, keepSession, auto, loadAll };
  }

  function createToolbar() {
    var bar = document.createElement('aside');
    bar.id = 'fcjg-toolbar';
    bar.innerHTML = `
      <div class="fcjg-toolbar-title">求人すっきり表示 <small>v2.4.2</small></div>
      <label>まとめ方
        <select id="fcjg-mode">
          <option value="standard">標準（案件名＋勤務地＋職種）</option>
          <option value="broad">広め（画像＋勤務地＋職種）</option>
          <option value="off">まとめない</option>
        </select>
      </label>
      <label class="fcjg-check"><input id="fcjg-hide-closed" type="checkbox"> 応募終了の案件を非表示</label>
      <label class="fcjg-check"><input id="fcjg-save-dates" type="checkbox"> 検索日付と検索方式を保存</label>
      <label class="fcjg-check"><input id="fcjg-keep-session" type="checkbox"> ログイン状態を維持（定期アクセス）</label>
      <label class="fcjg-check"><input id="fcjg-auto" type="checkbox"> 下端付近で自動読込</label>
      <label class="fcjg-check"><input id="fcjg-load-all" type="checkbox"> スクロールせず最後まで一括読込</label>
      ${weekdayFilterHtml()}
      ${dateFilterHtml(true)}
      <button id="fcjg-load-now" type="button">次を今すぐ読み込む</button>
      <div id="fcjg-status"></div>
      <div id="fcjg-message"></div>`;
    document.body.append(bar);
    fitToolbarToViewport(bar);
    var mode = bar.querySelector('#fcjg-mode');
    var hideClosed = bar.querySelector('#fcjg-hide-closed');
    var saveDates = bar.querySelector('#fcjg-save-dates');
    var keepSession = bar.querySelector('#fcjg-keep-session');
    var auto = bar.querySelector('#fcjg-auto');
    var loadAll = bar.querySelector('#fcjg-load-all');
    var loadNow = bar.querySelector('#fcjg-load-now');
    mode.value = state.mode;
    hideClosed.checked = state.hideClosed;
    saveDates.checked = savedBoolean(STORE_SAVE_DATES, true);
    keepSession.checked = globalSavedBoolean(STORE_KEEP_SESSION, true);
    auto.checked = state.auto;
    loadAll.checked = state.loadAll;
    bindWeekdayFilter(bar, state.weekdays, (weekdays) => {
      state.weekdays = weekdays;
      regroupAll();
      var label = weekdays.length === 7 ? '全て' : [1, 2, 3, 4, 5, 6, 0].filter((day) => weekdays.includes(day)).map((day) => WEEKDAY_LABELS[day]).join('・') || 'なし';
      setMessage(`読込済み求人を曜日「${label}」で再絞り込みしました`);
    });
    bindCalendarOpenState(bar);
    saveDates.addEventListener('change', () => {
      setDateSaving(saveDates.checked);
      setMessage(saveDates.checked ? '検索日付と検索方式を保存します' : '保存済みの検索日付と検索方式を削除しました');
    });
    keepSession.addEventListener('change', () => {
      localStorage.setItem(STORE_KEEP_SESSION, String(keepSession.checked));
      if (keepSession.checked) startSessionKeepalive();
    });
    mode.addEventListener('change', () => {
      state.mode = mode.value;
      localStorage.setItem(STORE_MODE, state.mode);
      regroupAll();
      var labels = { standard: '標準', broad: '広め', off: 'まとめない' };
      var raw = document.querySelectorAll(CARD).length;
      var shown = [...document.querySelectorAll(CARD)].filter((card) => card.style.display !== 'none').length;
      setMessage(`${labels[state.mode]}で再構成しました（${raw}件 → ${shown}枚）`);
      list.classList.remove('fcjg-mode-changed');
      void list.offsetWidth;
      list.classList.add('fcjg-mode-changed');
    });
    hideClosed.addEventListener('change', () => {
      state.hideClosed = hideClosed.checked;
      localStorage.setItem(STORE_HIDE_CLOSED, String(state.hideClosed));
      regroupAll();
      var closedCount = document.querySelectorAll(`${CARD}[data-fcjg-closed]`).length;
      setMessage(state.hideClosed ? `応募終了の案件を${closedCount}件非表示にしました` : '応募終了の案件も表示します');
    });
    loadNow.addEventListener('click', () => {
      state.sessionStopped = false;
      loadNextPage(true);
    });
    loadAll.addEventListener('change', () => {
      state.loadAll = loadAll.checked;
      localStorage.setItem(STORE_LOAD_ALL, String(state.loadAll));
      if (state.loadAll) state.sessionStopped = false;
      setMessage(statusMessage());
      if (state.loadAll) loadNextPage(true);
    });
    auto.addEventListener('change', () => {
      state.auto = auto.checked;
      localStorage.setItem(STORE_AUTO, String(state.auto));
      if (state.auto) state.sessionStopped = false;
      setMessage(statusMessage());
      if (state.auto) loadNextPage();
    });
    return { bar, mode, hideClosed, saveDates, keepSession, auto, loadAll };
  }

  function injectSearchTimeFilter(onChange) {
    var existingRow = document.getElementById('fcjg-search-time-row');
    if (existingRow) existingRow.remove();
    var searchForm = document.getElementById('form_search') || document.querySelector('.search-box form, form[id*="search"]');
    if (!searchForm) return;
    var rows = [...searchForm.querySelectorAll('tr')];
    var timeRow = rows.find((row) => clean(row.cells?.[0]?.innerText) === '時間帯');
    var dateRow = rows.find((row) => /^日付/.test(clean(row.cells?.[0]?.innerText)));
    if (!timeRow || !timeRow.parentElement || timeRow.cells.length < 2) return;

    var row = document.createElement('tr');
    row.id = 'fcjg-search-time-row';
    var heading = document.createElement(timeRow.cells[0].tagName || 'td');
    var controls = document.createElement(timeRow.cells[1].tagName || 'td');
    heading.textContent = '勤務時間指定';
    controls.colSpan = timeRow.cells[1].colSpan || 1;
    var startOptions = timePickerOptions(0, 23 * 60 + 50);
    var endOptions = timePickerOptions(10, 24 * 60);
    controls.innerHTML = `
      <div class="fcjg-search-time-controls">
        <div class="fcjg-time-control">
          <span>開始</span>
          <button id="fcjg-time-from" class="fcjg-time-field" type="button" aria-haspopup="listbox">指定なし</button>
          <div id="fcjg-time-from-picker" class="fcjg-time-picker" role="listbox" hidden>${startOptions}</div>
          <span>以降</span>
        </div>
        <span>～</span>
        <div class="fcjg-time-control">
          <span>終了</span>
          <button id="fcjg-time-to" class="fcjg-time-field" type="button" aria-haspopup="listbox">指定なし</button>
          <div id="fcjg-time-to-picker" class="fcjg-time-picker" role="listbox" hidden>${endOptions}</div>
          <span>以前</span>
        </div>
        <button id="fcjg-time-clear" type="button">指定解除</button>
        <div class="fcjg-time-presets">
          <select id="fcjg-time-preset"><option value="">時間プリセット</option></select>
          <button id="fcjg-time-preset-save" type="button">現在値を保存</button>
          <button id="fcjg-time-preset-delete" type="button">削除</button>
        </div>
        <small>10分単位・循環なし。時刻欄全体をクリックして選択します。</small>
      </div>`;
    row.append(heading, controls);
    // 検索条件を「日付 → 勤務時間指定 → 給与体系 → 時間帯」の順にする。
    (dateRow || timeRow).insertAdjacentElement('afterend', row);

    var fromInput = row.querySelector('#fcjg-time-from');
    var toInput = row.querySelector('#fcjg-time-to');
    var fromPicker = row.querySelector('#fcjg-time-from-picker');
    var toPicker = row.querySelector('#fcjg-time-to-picker');
    var clearButton = row.querySelector('#fcjg-time-clear');
    var presetSelect = row.querySelector('#fcjg-time-preset');
    var presetSave = row.querySelector('#fcjg-time-preset-save');
    var presetDelete = row.querySelector('#fcjg-time-preset-delete');
    var fromValue = localStorage.getItem(STORE_TIME_FROM) || '';
    var toValue = localStorage.getItem(STORE_TIME_TO) || '';
    var presets = savedArray(STORE_TIME_PRESETS).filter((preset) => preset && typeof preset.name === 'string');
    var selectedPresetName = localStorage.getItem(STORE_TIME_PRESET_SELECTED) || '';
    var restoredPreset = presets.find((preset) => preset.name === selectedPresetName);
    if (!restoredPreset || (restoredPreset.from || '') !== fromValue || (restoredPreset.to || '') !== toValue) {
      selectedPresetName = '';
      localStorage.setItem(STORE_TIME_PRESET_SELECTED, '');
    }

    function renderPresets(selectedName) {
      presetSelect.replaceChildren(new Option('時間プリセット', ''));
      presets.forEach((preset) => presetSelect.add(new Option(`${preset.name}（${preset.from || '指定なし'}～${preset.to || '指定なし'}）`, preset.name)));
      presetSelect.value = selectedName || '';
    }

    function storePresets() {
      presets = presets.slice(-12);
      localStorage.setItem(STORE_TIME_PRESETS, JSON.stringify(presets));
    }

    function setSelectedPreset(name) {
      selectedPresetName = name || '';
      localStorage.setItem(STORE_TIME_PRESET_SELECTED, selectedPresetName);
      presetSelect.value = selectedPresetName;
    }

    function updateFields() {
      fromInput.textContent = fromValue || '指定なし';
      toInput.textContent = toValue || '指定なし';
      fromInput.classList.toggle('fcjg-time-empty', !fromValue);
      toInput.classList.toggle('fcjg-time-empty', !toValue);
    }

    function saveTimeFilter(presetName) {
      localStorage.setItem(STORE_TIME_FROM, fromValue);
      localStorage.setItem(STORE_TIME_TO, toValue);
      setSelectedPreset(presetName || '');
      updateFields();
      if (onChange) onChange(fromValue, toValue, selectedPresetName);
    }
    function closePickers() {
      fromPicker.hidden = true;
      toPicker.hidden = true;
      fromInput.setAttribute('aria-expanded', 'false');
      toInput.setAttribute('aria-expanded', 'false');
    }
    function openPicker(field, picker) {
      var willOpen = picker.hidden;
      closePickers();
      if (!willOpen) return;
      picker.hidden = false;
      field.setAttribute('aria-expanded', 'true');
      var selected = picker.querySelector(`[data-time="${field === fromInput ? fromValue : toValue}"]`) || picker.querySelector('[data-time]');
      // scrollIntoViewは祖先であるページ本体まで動かすため使わない。
      // 時刻候補のスクロール領域だけを、選択位置へ滑らかに移動する。
      requestAnimationFrame(() => {
        if (!selected) return;
        var pickerTop = selected.offsetTop - ((picker.clientHeight - selected.offsetHeight) / 2);
        picker.scrollTo({ top: Math.max(0, pickerTop), behavior: 'smooth' });
      });
    }
    function bindPicker(field, picker, setValue) {
      field.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openPicker(field, picker);
      });
      picker.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        var option = event.target.closest('[data-time]');
        if (!option) return;
        setValue(option.dataset.time);
        closePickers();
        saveTimeFilter();
      });
    }
    bindPicker(fromInput, fromPicker, (value) => { fromValue = value; });
    bindPicker(toInput, toPicker, (value) => { toValue = value; });
    document.addEventListener('click', closePickers);
    clearButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      fromValue = '';
      toValue = '';
      saveTimeFilter();
    });
    presetSelect.addEventListener('change', (event) => {
      event.stopPropagation();
      var preset = presets.find((item) => item.name === presetSelect.value);
      if (!preset) {
        saveTimeFilter('');
        return;
      }
      fromValue = preset.from || '';
      toValue = preset.to || '';
      saveTimeFilter(preset.name);
    });
    presetSave.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      var defaultName = `${fromValue || '指定なし'}～${toValue || '指定なし'}`;
      var entered = window.prompt('この時間設定の名前を入力してください', defaultName);
      var name = clean(entered);
      if (!name) return;
      var existing = presets.find((item) => item.name === name);
      if (existing) {
        existing.from = fromValue;
        existing.to = toValue;
      } else {
        presets.push({ name, from: fromValue, to: toValue });
      }
      storePresets();
      renderPresets(name);
      saveTimeFilter(name);
    });
    presetDelete.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      var deletingName = presetSelect.value;
      if (!deletingName) return;
      presets = presets.filter((item) => item.name !== deletingName);
      storePresets();
      renderPresets('');
      saveTimeFilter('');
    });
    renderPresets(selectedPresetName);
    updateFields();
  }

  function timePickerOptions(firstMinute, lastMinute) {
    var html = '<button type="button" role="option" data-time="">指定なし</button>';
    for (var minute = firstMinute; minute <= lastMinute; minute += 10) {
      var label = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
      html += `<button type="button" role="option" data-time="${label}">${label}</button>`;
    }
    return html;
  }

  function updateStatus() {
    var counts = cardCounts();
    var totalText = state.resultTotal ? `${state.resultTotal}件` : '取得不能';
    var weekdayText = state.weekdays.length === 7 ? '全て' : [1, 2, 3, 4, 5, 6, 0].filter((day) => state.weekdays.includes(day)).map((day) => WEEKDAY_LABELS[day]).join('・') || 'なし';
    ui.bar.querySelector('#fcjg-status').innerHTML = `
      <span>元の検索結果：${totalText}</span>
      <span>読込済み：${counts.raw}件</span>
      <span>応募可能（終了除外後）：${counts.available}件</span>
      <span>応募終了：${counts.closed}件${state.hideClosed ? '（非表示）' : ''}</span>
      <span>勤務時間：${state.timeFrom || '指定なし'} ～ ${state.timeTo || '指定なし'}${state.timePreset ? `（${escapeHtml(state.timePreset)}）` : ''}</span>
      <span>指定時間外：${counts.timeExcluded}件</span>
      <span>曜日：${weekdayText}（曜日外${counts.weekdayExcluded}件）</span>
      <span>日付：${state.includedDates.size}日追加・${state.excludedDates.size}日除外（日付外${counts.dateExcluded}件）</span>
      <span>NEW案件：${counts.newJobCount}件</span>
      <span>NEW日付：${counts.newDateCount}件</span>
      <span>まとめ後の表示：${counts.shown}枚</span>`;
  }

  function setMessage(message) {
    var messageBox = ui.bar.querySelector('#fcjg-message');
    messageBox.textContent = message;
    messageBox.title = message;
    sentinel.textContent = message;
  }

  function statusMessage() {
    if (!state.hasNext) return '追加ページはありません（読み込み完了）';
    if (state.loadAll) return '最後のページまで一括読込中…';
    return state.auto ? '下へスクロールすると続きを読み込みます' : '自動読込は停止中です';
  }

  setMessage(statusMessage());
  if (state.loadAll && state.hasNext) setTimeout(() => loadNextPage(true), 200);

  function injectStyle() {
    if (document.getElementById('fcjg-style')) return;
    var style = document.createElement('style');
    style.id = 'fcjg-style';
    style.textContent = `
      #fcjg-toolbar {
        position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
        width: min(340px, calc(100vw - 24px)); overflow: visible; padding: 12px 14px;
        color: #172033; background: rgba(255,255,255,.97); border: 1px solid #ccd5e3;
        border-radius: 12px; box-shadow: 0 8px 30px rgba(20,35,60,.2);
        transform: scale(var(--fcjg-fit-scale, 1)); transform-origin: right bottom;
        font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .fcjg-toolbar-title { font-weight: 700; font-size: 15px; margin-bottom: 7px; }
      #fcjg-toolbar label { display: block; margin: 6px 0; }
      #fcjg-toolbar select { max-width: 100%; margin-left: 4px; padding: 3px; }
      #fcjg-toolbar .fcjg-check { cursor: pointer; }
      .fcjg-weekdays { margin: 8px 0; padding: 7px 8px; border: 1px solid #d5dde8; border-radius: 7px; }
      .fcjg-weekdays legend { width: auto; margin: 0; padding: 0 4px; font-size: 12px; font-weight: 700; }
      .fcjg-weekday-list { display: flex; flex-wrap: wrap; gap: 3px 7px; }
      .fcjg-weekday-list label { display: inline-block !important; margin: 0 !important; cursor: pointer; }
      .fcjg-weekday-quick { display: flex; gap: 5px; margin-top: 6px; }
      .fcjg-weekday-quick button { padding: 2px 7px; border: 1px solid #98a2b3; border-radius: 5px; background: white; cursor: pointer; }
      .fcjg-date-filter { position: relative; margin: 8px 0; border: 1px solid #d5dde8; border-radius: 7px; background: #f8fafc; }
      .fcjg-date-filter > summary { padding: 7px 8px; cursor: pointer; font-weight: 700; }
      #fcjg-date-filter-label { color: #176b50; font-size: 11px; }
      #fcjg-date-filter-calendar { position: static; width: auto; overflow: visible; padding: 8px; background: rgba(255,255,255,.99); border-top: 1px solid #d5dde8; border-radius: 0 0 7px 7px; }
      .fcjg-date-filter:not([open]) #fcjg-date-filter-calendar { display: none; }
      .fcjg-date-clear { margin-bottom: 7px; padding: 3px 7px; color: #176b50; background: white; border: 1px solid #8bcab8; border-radius: 5px; cursor: pointer; }
      .fcjg-date-clear:disabled { color: #98a2b3; border-color: #d0d5dd; cursor: default; }
      .fcjg-filter-month { margin-bottom: 8px; padding: 6px; border: 1px solid #dce8e4; border-radius: 7px; background: white; }
      .fcjg-calendar-nav { display: grid; grid-template-columns: 32px 1fr 32px; gap: 5px; align-items: center; margin-bottom: 5px; text-align: center; }
      .fcjg-calendar-nav button { padding: 2px; color: #176b50; background: #f4fbf8; border: 1px solid #8bcab8; border-radius: 5px; cursor: pointer; font-size: 17px; line-height: 1; }
      .fcjg-calendar-nav button:disabled { color: #b8c0cc; background: #f2f4f7; border-color: #d0d5dd; cursor: default; }
      #fcjg-search-time-row > :first-child { font-weight: 700; }
      .fcjg-search-time-controls { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; padding: 5px 0; scroll-behavior: smooth; }
      .fcjg-time-control { position: relative; display: inline-flex; align-items: center; gap: 5px; }
      .fcjg-time-field { position: relative; min-width: 94px; padding: 7px 28px 7px 10px !important; text-align: left; color: #172033; background: white; border: 1px solid #98a2b3; border-radius: 6px; cursor: pointer; }
      .fcjg-time-field::after { content: '▾'; position: absolute; margin-left: 9px; }
      .fcjg-time-field.fcjg-time-empty { color: #667085; }
      .fcjg-time-picker { position: absolute; top: calc(100% + 4px); left: 34px; z-index: 2147483646; width: 116px; max-height: 250px; overflow-y: auto; overscroll-behavior: contain; scroll-behavior: smooth; scroll-snap-type: none; padding: 4px; background: white; border: 1px solid #98a2b3; border-radius: 7px; box-shadow: 0 8px 22px rgba(20,35,60,.22); }
      .fcjg-time-picker[hidden] { display: none !important; }
      .fcjg-time-picker button { display: block; width: 100%; padding: 6px 8px; text-align: center; border: 0; border-radius: 4px; background: transparent; cursor: pointer; }
      .fcjg-time-picker button:hover, .fcjg-time-picker button:focus { color: white; background: #16856a; }
      .fcjg-search-time-controls > button { padding: 3px 7px; border: 1px solid #98a2b3; border-radius: 5px; background: white; cursor: pointer; }
      .fcjg-time-presets { display: inline-flex; flex-wrap: wrap; gap: 5px; align-items: center; }
      .fcjg-time-presets select, .fcjg-time-presets button { padding: 4px 7px; border: 1px solid #98a2b3; border-radius: 5px; background: white; cursor: pointer; }
      .fcjg-search-time-controls small { width: 100%; color: #667085; }
      #fcjg-load-now { padding: 5px 9px; border: 1px solid #16856a; border-radius: 6px; color: #176b50; background: white; cursor: pointer; }
      #fcjg-load-now:hover { color: white; background: #16856a; }
      #fcjg-status { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 1px 10px; color: #176b50; font-weight: 700; margin-top: 6px; }
      #fcjg-status span { display: block; min-width: 0; overflow-wrap: anywhere; }
      #fcjg-message { height: 35px; overflow: hidden; color: #667085; font-size: 12px; line-height: 17px; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
      .fcjg-original-pager { display: none !important; }
      #fcjg-sentinel { min-height: 42px; padding: 14px; text-align: center; color: #667085; }
      .fcjg-card-controls { position: relative; z-index: 30; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; margin: 6px 0 8px; padding: 0 6px; }
      .fcjg-card-controls button, .fcjg-slots-toggle { padding: 4px 8px; color: #176b50; background: white; border: 1px solid #8bcab8; border-radius: 6px; cursor: pointer; font: 12px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .fcjg-card-controls button[hidden], .fcjg-slots-toggle[hidden] { display: none !important; }
      .fcjg-card-controls button:hover, .fcjg-slots-toggle:hover { color: white; background: #16856a; }
      .fcjg-compact-summary { display: none; margin: 7px 6px; padding: 9px 10px; border-left: 4px solid #16856a; background: #f4fbf8; }
      .fcjg-compact-summary strong, .fcjg-compact-summary span { display: block; }
      .fcjg-compact-summary span { margin-top: 3px; color: #475467; font-size: 12px; }
      .fcjg-card-compact > [data-fcjg-original-child="1"] { display: none !important; }
      .fcjg-card-compact > .fcjg-compact-summary { display: block; }
      .fcjg-card-compact { opacity: .72; filter: saturate(.45); }
      .fcjg-card-compact:hover { opacity: .88; }
      .fcjg-card-compact > .fcjg-compact-summary { color: #667085; background: #f2f4f7; border-left-color: #98a2b3; }
      .fcjg-card-compact > .fcjg-variants { background: #f8f9fa; border-color: #d0d5dd; }
      .fcjg-card-compact > .fcjg-card-controls { opacity: .82; }
      .fcjg-variants {
        position: relative; z-index: 20; clear: both; margin: 12px 0; padding: 10px; border: 1px solid #b9d8cf;
        border-radius: 9px; background: #f4fbf8;
      }
      .fcjg-variants-title { display: flex; align-items: center; gap: 4px; color: #176b50; font-weight: 700; margin-bottom: 7px; }
      .fcjg-variants-title .fcjg-slots-toggle { margin-left: auto; }
      .fcjg-badge { display: inline-block; min-width: 22px; padding: 1px 7px; margin-left: 4px; text-align: center; color: white; background: #16856a; border-radius: 999px; }
      .fcjg-new-job-badge { display: inline-block; margin-left: 7px; padding: 2px 7px; color: white; background: #d92d20; border-radius: 999px; font-size: 11px; }
      .fcjg-new-job-badge[hidden] { display: none !important; }
      .fcjg-new-date-badge { display: inline-block; margin-left: 6px; padding: 1px 5px; color: #b42318; background: #fee4e2; border: 1px solid #fda29b; border-radius: 999px; font-size: 10px; font-style: normal; white-space: nowrap; }
      .fcjg-calendar-title { margin-bottom: 4px; text-align: center; color: #344054; font-weight: 700; }
      .fcjg-calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); grid-auto-rows: 28px; gap: 2px; text-align: center; }
      .fcjg-calendar-grid > span { padding: 2px 0; color: #667085; font-size: 11px; }
      .fcjg-calendar-grid .fcjg-sun { color: #d92d20; }
      .fcjg-calendar-grid .fcjg-sat { color: #175cd3; }
      .fcjg-calendar-grid > i { min-height: 28px; padding-top: 5px; color: #c2c8d0; font-style: normal; font-size: 11px; }
      .fcjg-calendar-day { position: relative; height: 28px; padding: 2px; color: #176b50; background: #e9f8f2; border: 1px solid #8bcab8; border-radius: 5px; cursor: pointer; font-weight: 700; }
      .fcjg-calendar-day:hover { color: white; background: #16856a; }
      .fcjg-calendar-day small { display: block; font-size: 8px; line-height: 1; opacity: .75; }
      .fcjg-calendar-day.fcjg-date-excluded { color: #667085; background: #f2f4f7; border-color: #c8ced7; text-decoration: line-through; box-shadow: inset 0 0 0 1px #e5484d; }
      .fcjg-calendar-day.fcjg-weekday-disabled { color: #98a2b3; background: repeating-linear-gradient(135deg,#f2f4f7,#f2f4f7 4px,#e4e7ec 4px,#e4e7ec 8px); border-color: #d0d5dd; text-decoration: line-through; opacity: .72; }
      .fcjg-calendar-day.fcjg-date-included { color: white; background: #175cd3; border-color: #175cd3; text-decoration: none; box-shadow: 0 0 0 2px rgba(23,92,211,.18); opacity: 1; }
      .fcjg-calendar-day.fcjg-calendar-new-date::after { content: 'N'; position: absolute; top: -4px; right: -3px; min-width: 12px; height: 12px; color: white; background: #d92d20; border-radius: 999px; font: 700 8px/12px sans-serif; text-align: center; text-decoration: none; }
      .fcjg-variant-list { display: grid; gap: 6px; }
      .fcjg-slots-collapsed > .fcjg-variant-list > .fcjg-variant:nth-child(n+4) { display: none; }
      .fcjg-variant {
        position: relative; z-index: 21; pointer-events: auto;
        display: grid; grid-template-columns: minmax(155px,1.2fr) minmax(115px,.8fr) minmax(180px,1.4fr) auto;
        gap: 8px; align-items: center; padding: 7px 9px; color: #172033 !important;
        background: white; border: 1px solid #dce8e4; border-radius: 7px; text-decoration: none !important;
      }
      .fcjg-variant:hover { border-color: #16856a; box-shadow: 0 2px 8px rgba(22,133,106,.13); }
      .fcjg-time { color: #b54708; }
      .fcjg-pay { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .fcjg-link { color: #176b50; font-weight: 700; white-space: nowrap; }
      .fcjg-variant[data-fcjg-missing-href="1"] { cursor: not-allowed; opacity: .65; }
      .fcjg-grouped { outline: 2px solid rgba(22,133,106,.28); outline-offset: 2px; }
      .fcjg-mode-changed { animation: fcjg-flash .5s ease-out; }
      @keyframes fcjg-flash { 0% { opacity: .45; } 100% { opacity: 1; } }
      @media (max-width: 720px) {
        #fcjg-toolbar { right: 8px; bottom: 8px; }
        .fcjg-variant { grid-template-columns: 1fr 1fr; }
        .fcjg-pay { grid-column: 1 / -1; }
        .fcjg-link { justify-self: end; }
      }`;
    document.head.append(style);
  }

  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startMain, { once: true });
  } else {
    startMain();
  }
})();

