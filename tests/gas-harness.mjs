// Runs the real Apps Script files inside a Node vm with in-memory fakes of the Google services
// they use. Lets us exercise doPost/webhook/trigger flows end-to-end without deploying.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const GAS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'thai-sme-booking', 'templates', 'apps-script');
const TZ_MIN = 420;

function sheetsCoerce(v) {
  if (typeof v === 'string' && v.startsWith("'")) return v.slice(1);
  if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) return Number(v); // what Sheets does to "0812345678"
  return v;
}

function display(v) {
  if (v instanceof Date) return new Date(v.getTime() + TZ_MIN * 60000).toISOString().slice(0, 16).replace('T', ' ');
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return v === null || v === undefined ? '' : String(v);
}

class FakeRange {
  constructor(sheet, row, col, nRows, nCols) { Object.assign(this, { sheet, row, col, nRows, nCols }); }
  cells(fn) {
    const out = [];
    for (let r = 0; r < this.nRows; r++) {
      const line = [];
      for (let c = 0; c < this.nCols; c++) line.push(fn(this.sheet.get(this.row + r, this.col + c)));
      out.push(line);
    }
    return out;
  }
  getValues() { return this.cells((v) => (v === undefined ? '' : v)); }
  getDisplayValues() { return this.cells(display); }
  setValues(values) { values.forEach((line, r) => line.forEach((v, c) => this.sheet.set(this.row + r, this.col + c, sheetsCoerce(v)))); return this; }
  setValue(v) { this.sheet.set(this.row, this.col, sheetsCoerce(v)); return this; }
  getSheet() { return this.sheet; }
  getRow() { return this.row; }
  getColumn() { return this.col; }
  getNumRows() { return this.nRows; }
}
['setFontWeight', 'setBackground', 'setNumberFormat', 'setDataValidation'].forEach((m) => { FakeRange.prototype[m] = function () { return this; }; });

class FakeSheet {
  constructor(name) { this.name = name; this.data = []; }
  get(r, c) { return (this.data[r - 1] || [])[c - 1]; }
  set(r, c, v) { while (this.data.length < r) this.data.push([]); this.data[r - 1][c - 1] = v; }
  getName() { return this.name; }
  getLastRow() { return this.data.length; }
  getLastColumn() { return Math.max(0, ...this.data.map((r) => r.length)); }
  getMaxRows() { return 1000; }
  getDataRange() { return new FakeRange(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  getRange(r, c, nr = 1, nc = 1) { return new FakeRange(this, r, c, nr, nc); }
  appendRow(values) { this.data.push(values.map(sheetsCoerce)); }
  deleteRows(start, n) { this.data.splice(start - 1, n); }
  clear() { this.data = []; }
  setFrozenRows() {}
  autoResizeColumns() {}
  setConditionalFormatRules() {}
}

function chain(final) {
  return new Proxy({}, { get: (_, k) => (k === 'build' || k === 'create' ? () => final : () => chain(final)) });
}

export function loadGas({ fetchHandler, props = {} } = {}) {
  const sheets = [new FakeSheet('Sheet1')];
  const spreadsheet = {
    getSheetByName: (n) => sheets.find((s) => s.name === n) || null,
    insertSheet: (n) => { const s = new FakeSheet(n); sheets.push(s); return s; },
    getSheets: () => sheets,
    deleteSheet: (s) => sheets.splice(sheets.indexOf(s), 1),
    getSpreadsheetTimeZone: () => 'Asia/Bangkok',
    toast() {},
    setActiveSheet() {}
  };
  const record = { fetches: [], mails: [], alerts: [], events: [], triggers: [] };
  const properties = { ...props };
  const cache = {};

  const calendar = {
    createEvent(title, start, end, opts) {
      const tags = {};
      const ev = {
        id: 'ev' + (record.events.length + 1), title, start, end, opts, deleted: false,
        setTag: (k, v) => { tags[k] = v; }, getTag: (k) => tags[k] || null, getId: () => ev.id,
        getStartTime: () => start, getEndTime: () => end, deleteEvent: () => { ev.deleted = true; }
      };
      record.events.push(ev);
      return ev;
    },
    getEvents: (s, e) => record.events.filter((ev) => !ev.deleted && ev.start < e && s < ev.end),
    getEventById: (id) => record.events.find((ev) => ev.id === id) || null
  };

  const context = {
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => spreadsheet,
      getUi: () => ({ createMenu: () => chain(null), alert: (m) => record.alerts.push(m) }),
      flush() {},
      newDataValidation: () => chain({}),
      newConditionalFormatRule: () => chain({})
    },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (k) => properties[k] ?? null, setProperty: (k, v) => { properties[k] = v; } })
    },
    CacheService: { getScriptCache: () => ({ get: (k) => cache[k] ?? null, put: (k, v) => { cache[k] = v; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    UrlFetchApp: {
      fetch(url, opts = {}) {
        record.fetches.push({ url, opts });
        const r = fetchHandler ? fetchHandler(url, opts) : { code: 200, body: '{}' };
        return {
          getResponseCode: () => r.code ?? 200,
          getContentText: () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body ?? {})),
          getBlob: () => ({ setName() { return this; }, bytes: 'fake-image' })
        };
      }
    },
    Utilities: {
      formatDate(d, tz, fmt) {
        if (fmt === 'Z') return '+0700';
        const iso = new Date(d.getTime() + TZ_MIN * 60000).toISOString();
        if (fmt === 'yyyy-MM-dd') return iso.slice(0, 10);
        if (fmt === 'HH:mm') return iso.slice(11, 16);
        return iso;
      }
    },
    Session: { getScriptTimeZone: () => 'Asia/Bangkok', getEffectiveUser: () => ({ getEmail: () => 'dev@example.com' }) },
    CalendarApp: { getDefaultCalendar: () => calendar, getCalendarById: () => calendar },
    ContentService: { createTextOutput: (s) => ({ setMimeType() { return this; }, text: s }), MimeType: { JSON: 'json' } },
    MailApp: { sendEmail: (to, subject, body) => record.mails.push({ to, subject, body }) },
    ScriptApp: {
      getProjectTriggers: () => [],
      deleteTrigger() {},
      newTrigger: (fn) => chain(record.triggers.push(fn))
    }
  };
  vm.createContext(context);
  const files = fs.readdirSync(GAS_DIR).filter((f) => f.endsWith('.js'));
  files.sort((a, b) => (a === 'Lib.js' ? -1 : b === 'Lib.js' ? 1 : a.localeCompare(b)));
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(GAS_DIR, f), 'utf8'), context, { filename: f });

  const post = (payload) => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(payload) } }).text);
  const tab = (name) => {
    const s = spreadsheet.getSheetByName(name);
    const [header, ...rows] = s.data;
    return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
  };
  return { g: context, post, tab, record, properties, sheets };
}
