import { appLogger } from '../core/logger.js';

function getNativePlugin() {
  if (typeof window === 'undefined') return null;
  const cap = window.Capacitor;
  if (!cap || !cap.Plugins || !cap.Plugins.BibleCore) return null;
  return cap.Plugins.BibleCore;
}

function shortFileName(path) {
  const s = String(path || '');
  const parts = s.split(/[\\/]/);
  return parts[parts.length - 1] || s;
}

const mockState = {
  sources: [],
  modules: [
    {
      id: 1,
      sourceId: 1,
      path: '/mock/DEMO.bbl.mybible',
      fileName: 'DEMO.bbl.mybible',
      title: 'Bíblia de Demonstração (Navegador)',
      abbr: 'DEMO',
      description: 'Módulo simulado exibido apenas fora do Android.',
      language: 'PT',
      hasStrongs: false,
      resourceKind: 'bible',
      formatId: 'mysword_bbl',
      fileSize: 1024,
      lastModified: Date.now(),
      isFavorite: true
    }
  ]
};

const mockVerses = [
  { Book: 1, Chapter: 1, Verse: 1, Scripture: '<TS>A criação<Ts>No princípio criou Deus os céus e a terra.' },
  { Book: 1, Chapter: 1, Verse: 2, Scripture: 'A terra, porém, estava sem forma e vazia; havia trevas sobre a face do abismo, e o Espírito de Deus pairava sobre as águas.' },
  { Book: 1, Chapter: 1, Verse: 3, Scripture: 'Disse Deus: <FR>Haja luz<Fr>; e houve luz.<RF>Texto de demonstração fora do Android.<Rf>' }
];

function createWebFallback() {
  return {
    async checkStoragePermission() {
      return { granted: true, sdkInt: 33 };
    },
    async requestStoragePermission() {
      return { granted: true };
    },
    async getStorageRoots() {
      return {
        roots: [
          { name: 'Armazenamento Interno (Simulado)', path: '/storage/emulated/0', isRemovable: false }
        ]
      };
    },
    async listDirectory({ path }) {
      return {
        currentPath: path || '/storage/emulated/0',
        parentPath: '',
        canRead: true,
        directories: [],
        files: []
      };
    },
    async addSource() {
      return {
        sourceId: 1,
        addedCount: 0,
        sources: mockState.sources,
        modules: mockState.modules
      };
    },
    async removeSource() {
      return { removed: true, sources: mockState.sources, modules: mockState.modules };
    },
    async listSources() {
      return { sources: mockState.sources };
    },
    async listModules() {
      return { modules: mockState.modules };
    },
    async refreshSources() {
      return { sources: mockState.sources, modules: mockState.modules };
    },
    async setModuleFavorite({ moduleId, favorite }) {
      mockState.modules.forEach((m) => {
        if (m.id === moduleId) m.isFavorite = Boolean(favorite);
      });
      return { updated: true, modules: mockState.modules };
    },
    async queryModule({ sql }) {
      const upper = String(sql || '').toUpperCase();
      if (upper.includes('DISTINCT BOOK')) {
        return { rows: [{ Book: 1 }] };
      }
      if (upper.includes('DISTINCT CHAPTER')) {
        return { rows: [{ Chapter: 1 }] };
      }
      return { rows: mockVerses };
    },
    async syncCommentaryIndex() {
      return {
        ready: false,
        indexing: false,
        indexedCount: 0,
        totalCount: 0,
        newlyIndexed: 0,
        elapsedMs: 0
      };
    },
    async queryCommentaryCoverage() {
      return {
        ready: false,
        indexing: false,
        indexedCount: 0,
        totalCount: 0,
        matches: []
      };
    },
    async closeAllModules() {
      return { closed: true };
    }
  };
}

const fallback = createWebFallback();

function pluginOrFallback() {
  return getNativePlugin() || fallback;
}

async function runLogged(scope, label, detailMeta, callFn) {
  try {
    return await callFn();
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    appLogger.error(scope, `${label}: ${msg}`, detailMeta);
    throw err;
  }
}

export const nativeBridge = {
  isNative() {
    return Boolean(getNativePlugin());
  },

  checkStoragePermission() {
    return runLogged('NATIVE', 'checkStoragePermission', '', () =>
      pluginOrFallback().checkStoragePermission()
    );
  },

  requestStoragePermission() {
    return runLogged('NATIVE', 'requestStoragePermission', '', () =>
      pluginOrFallback().requestStoragePermission()
    );
  },

  getStorageRoots() {
    return runLogged('NATIVE', 'getStorageRoots', '', () =>
      pluginOrFallback().getStorageRoots()
    );
  },

  listDirectory(path, formatId = 'mysword_bbl') {
    return runLogged('NATIVE', 'listDirectory', { path, formatId }, () =>
      pluginOrFallback().listDirectory({ path, formatId })
    );
  },

  addSource({
    path,
    mode = 'file',
    recursive = false,
    resourceKind = 'bible',
    formatId = 'mysword_bbl'
  }) {
    return runLogged('NATIVE', 'addSource', { path, mode, recursive, resourceKind, formatId }, () =>
      pluginOrFallback().addSource({
        path,
        mode,
        recursive: Boolean(recursive),
        resourceKind,
        formatId
      })
    );
  },

  removeSource(sourceId) {
    return runLogged('NATIVE', 'removeSource', { sourceId }, () =>
      pluginOrFallback().removeSource({ sourceId: Number(sourceId) })
    );
  },

  listSources() {
    return runLogged('NATIVE', 'listSources', '', () =>
      pluginOrFallback().listSources()
    );
  },

  listModules(resourceKind = null) {
    const payload = resourceKind ? { resourceKind } : {};
    return runLogged('NATIVE', 'listModules', payload, () =>
      pluginOrFallback().listModules(payload)
    );
  },

  refreshSources() {
    return runLogged('NATIVE', 'refreshSources', '', () =>
      pluginOrFallback().refreshSources()
    );
  },

  setModuleFavorite(moduleId, favorite) {
    return runLogged('NATIVE', 'setModuleFavorite', { moduleId, favorite }, () =>
      pluginOrFallback().setModuleFavorite({
        moduleId: Number(moduleId),
        favorite: Boolean(favorite)
      })
    );
  },

  queryModule(path, sql, params = []) {
    const strParams = Array.isArray(params) ? params.map(String) : [];
    const meta = {
      file: shortFileName(path),
      sql: String(sql || '').slice(0, 480),
      params: strParams.slice(0, 12)
    };
    return runLogged('SQL', `queryModule (${meta.file})`, meta, () =>
      pluginOrFallback().queryModule({
        path,
        sql,
        params: strParams
      })
    );
  },

  syncCommentaryIndex() {
    return runLogged('INDEX', 'syncCommentaryIndex', '', () =>
      pluginOrFallback().syncCommentaryIndex()
    );
  },

  queryCommentaryCoverage(book, chapter, verse = 1) {
    const payload = {
      book: Math.max(1, Number(book) || 1),
      chapter: Math.max(1, Number(chapter) || 1),
      verse: Math.max(1, Number(verse) || 1)
    };
    return runLogged('INDEX', 'queryCommentaryCoverage', payload, () =>
      pluginOrFallback().queryCommentaryCoverage(payload)
    );
  },

  closeAllModules() {
    return runLogged('NATIVE', 'closeAllModules', '', () =>
      pluginOrFallback().closeAllModules()
    );
  }
};
