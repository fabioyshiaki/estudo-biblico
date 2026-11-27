const LOG_STORAGE_KEY = 'estudo_biblico_error_logs_v1';
const MAX_LOGS = 220;
const MAX_DETAIL_CHARS = 1600;

let memoryLogs = loadFromStorage();
let globalsInstalled = false;
let contextProvider = null;

function loadFromStorage() {
  try {
    const raw = window.localStorage.getItem(LOG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(-MAX_LOGS) : [];
  } catch (err) {
    return [];
  }
}

function saveToStorage() {
  try {
    window.localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(memoryLogs));
  } catch (err) {
    try {
      memoryLogs = memoryLogs.slice(-80);
      window.localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(memoryLogs));
    } catch (err2) {
      // Ignora se localStorage estiver bloqueado ou sem espaço
    }
  }
}

function truncate(str, maxLen = MAX_DETAIL_CHARS) {
  const s = String(str || '');
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen)}… [truncado]`;
}

function serializeValue(val) {
  if (val === undefined || val === null) return '';
  if (typeof val === 'string') return truncate(val);
  if (val instanceof Error) {
    return truncate(`${val.name || 'Error'}: ${val.message || ''}${val.stack ? `\n${val.stack}` : ''}`);
  }
  try {
    const seen = new WeakSet();
    const json = JSON.stringify(
      val,
      (key, value) => {
        if (value instanceof Error) {
          return { name: value.name, message: value.message, stack: value.stack };
        }
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) return '[Circular]';
          seen.add(value);
        }
        return value;
      },
      2
    );
    return truncate(json);
  } catch (err) {
    return truncate(String(val));
  }
}

function formatTime(ts) {
  try {
    const d = new Date(ts);
    const pad = (n, len = 2) => String(n).padStart(len, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
  } catch (err) {
    return String(ts);
  }
}

function pushEntry(level, scope, message, detail = '') {
  const entry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    ts: Date.now(),
    level: level === 'error' || level === 'warn' ? level : 'info',
    scope: String(scope || 'APP').toUpperCase(),
    message: truncate(String(message || 'Sem mensagem'), 500),
    detail: serializeValue(detail)
  };

  memoryLogs.push(entry);
  if (memoryLogs.length > MAX_LOGS) {
    memoryLogs = memoryLogs.slice(-MAX_LOGS);
  }
  saveToStorage();
  return entry;
}

export const appLogger = {
  setContextProvider(fn) {
    contextProvider = typeof fn === 'function' ? fn : null;
  },

  error(scope, message, detail = '') {
    return pushEntry('error', scope, message, detail);
  },

  warn(scope, message, detail = '') {
    return pushEntry('warn', scope, message, detail);
  },

  info(scope, message, detail = '') {
    return pushEntry('info', scope, message, detail);
  },

  getLogs({ level = 'all' } = {}) {
    memoryLogs = loadFromStorage();
    const list = memoryLogs.slice().reverse();
    if (level === 'error' || level === 'warn' || level === 'info') {
      return list.filter((item) => item.level === level);
    }
    return list;
  },

  getStats() {
    memoryLogs = loadFromStorage();
    let errors = 0;
    let warns = 0;
    for (const item of memoryLogs) {
      if (item.level === 'error') errors++;
      else if (item.level === 'warn') warns++;
    }
    return {
      total: memoryLogs.length,
      errors,
      warns
    };
  },

  clearLogs() {
    memoryLogs = [];
    try {
      window.localStorage.removeItem(LOG_STORAGE_KEY);
    } catch (err) {
      // Ignora erro ao remover
    }
  },

  formatLogsForShare({ level = 'all', maxItems = 80 } = {}) {
    const entries = this.getLogs({ level }).slice(0, maxItems);
    const lines = [];
    lines.push('=== RELATÓRIO DE LOGS — ESTUDO BÍBLICO ===');
    lines.push(`Gerado em: ${formatTime(Date.now())}`);
    lines.push(`Plataforma: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'desconhecida'}`);

    if (contextProvider) {
      try {
        const ctx = contextProvider();
        if (ctx && typeof ctx === 'object') {
          for (const [k, v] of Object.entries(ctx)) {
            lines.push(`${k}: ${v}`);
          }
        }
      } catch (err) {
        lines.push(`Contexto: erro ao coletar (${err.message || err})`);
      }
    }

    lines.push(`Registros no relatório: ${entries.length} (filtro: ${level})`);
    lines.push('------------------------------------------');

    if (!entries.length) {
      lines.push('(Nenhum log registrado.)');
      return lines.join('\n');
    }

    for (const item of entries) {
      lines.push(`[${formatTime(item.ts)}] [${item.level.toUpperCase()}] [${item.scope}] ${item.message}`);
      if (item.detail) {
        lines.push(item.detail);
      }
      lines.push('');
    }

    return lines.join('\n').trim();
  },

  installGlobalHandlers() {
    if (globalsInstalled || typeof window === 'undefined') return;
    globalsInstalled = true;

    window.addEventListener('error', (ev) => {
      const msg = ev && ev.message ? ev.message : 'Erro global não tratado';
      const detail = {
        file: ev && ev.filename ? ev.filename : '',
        line: ev && ev.lineno ? ev.lineno : 0,
        col: ev && ev.colno ? ev.colno : 0,
        stack: ev && ev.error && ev.error.stack ? ev.error.stack : ''
      };
      pushEntry('error', 'WINDOW', msg, detail);
    });

    window.addEventListener('unhandledrejection', (ev) => {
      const reason = ev ? ev.reason : 'Promessa rejeitada sem motivo';
      const msg = reason && reason.message ? reason.message : String(reason);
      pushEntry('error', 'PROMISE', msg, reason);
    });

    const origError = console.error ? console.error.bind(console) : null;
    const origWarn = console.warn ? console.warn.bind(console) : null;

    if (origError) {
      console.error = (...args) => {
        try {
          const msg = args.map((a) => (a instanceof Error ? a.message : String(a))).join(' ');
          const extra = args.find((a) => a instanceof Error || (typeof a === 'object' && a !== null));
          pushEntry('error', 'CONSOLE', msg, extra || '');
        } catch (err) {
          // Evita recursão
        }
        origError(...args);
      };
    }

    if (origWarn) {
      console.warn = (...args) => {
        try {
          const msg = args.map((a) => (a instanceof Error ? a.message : String(a))).join(' ');
          const extra = args.find((a) => a instanceof Error || (typeof a === 'object' && a !== null));
          pushEntry('warn', 'CONSOLE', msg, extra || '');
        } catch (err) {
          // Evita recursão
        }
        origWarn(...args);
      };
    }
  }
};
