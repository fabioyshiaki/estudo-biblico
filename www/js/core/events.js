export const EVENTS = Object.freeze({
  SOURCES_UPDATED: 'sources:updated',
  MODULE_CHANGED: 'module:changed',
  LOCATION_CHANGED: 'location:changed',
  PREFS_CHANGED: 'prefs:changed',
  VERSE_TAPPED: 'verse:tapped',
  TOAST: 'ui:toast'
});

const listeners = new Map();

export const eventBus = {
  on(eventName, handler) {
    if (!listeners.has(eventName)) {
      listeners.set(eventName, new Set());
    }
    listeners.get(eventName).add(handler);
    return () => this.off(eventName, handler);
  },

  once(eventName, handler) {
    const wrapped = (payload) => {
      this.off(eventName, wrapped);
      handler(payload);
    };
    return this.on(eventName, wrapped);
  },

  off(eventName, handler) {
    const set = listeners.get(eventName);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) {
      listeners.delete(eventName);
    }
  },

  emit(eventName, payload) {
    const set = listeners.get(eventName);
    if (!set) return;
    for (const handler of Array.from(set)) {
      try {
        handler(payload);
      } catch (err) {
        console.error('[eventBus] Erro no listener de', eventName, err);
      }
    }
  }
};
