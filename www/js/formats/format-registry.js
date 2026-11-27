import { myswordBibleAdapter } from './mysword-bible.js';
import { myswordDictionaryAdapter } from './mysword-dictionary.js';

const adapters = new Map();

export function registerFormatAdapter(adapter) {
  if (!adapter || !adapter.formatId) {
    throw new Error('Adaptador inválido: formatId obrigatório.');
  }
  adapters.set(adapter.formatId, adapter);
}

export function getFormatAdapter(formatId) {
  return adapters.get(formatId) || null;
}

export function getAdapterForModule(moduleRecord) {
  if (!moduleRecord || !moduleRecord.formatId) return null;
  return getFormatAdapter(moduleRecord.formatId);
}

export function listRegisteredFormats(resourceKind = null) {
  const all = Array.from(adapters.values());
  if (!resourceKind) return all;
  return all.filter((a) => a.resourceKind === resourceKind);
}

registerFormatAdapter(myswordBibleAdapter);
registerFormatAdapter(myswordDictionaryAdapter);
