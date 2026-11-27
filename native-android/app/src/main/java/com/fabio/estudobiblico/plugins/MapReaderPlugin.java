package com.fabio.estudobiblico.plugins;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "MapReader")
public class MapReaderPlugin extends Plugin {

    private final ExecutorService executor = Executors.newFixedThreadPool(2);

    @PluginMethod
    public void getMapDirectory(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("path", MapPathResolver.getSavedMapDirectory(getContext()));
        ret.put("treeUri", MapPathResolver.getSavedTreeUri(getContext()));
        call.resolve(ret);
    }

    @PluginMethod
    public void setMapDirectory(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.trim().isEmpty()) {
            call.reject("Caminho da pasta de mapas inválido.");
            return;
        }
        File dir = new File(path.trim());
        if (!dir.exists() || !dir.isDirectory()) {
            call.reject("A pasta informada não existe ou não está acessível: " + path);
            return;
        }
        MapPathResolver.saveMapDirectory(getContext(), dir.getAbsolutePath(), null);
        JSObject ret = new JSObject();
        ret.put("path", dir.getAbsolutePath());
        call.resolve(ret);
    }

    @PluginMethod
    public void pickMapDirectory(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION |
            Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
        );
        startActivityForResult(call, intent, "onMapDirectoryPicked");
    }

    @ActivityCallback
    private void onMapDirectoryPicked(PluginCall call, ActivityResult result) {
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("Seleção de pasta cancelada.");
            return;
        }
        Uri treeUri = result.getData().getData();
        if (treeUri == null) {
            call.reject("Não foi possível obter a URI da pasta selecionada.");
            return;
        }

        try {
            getContext().getContentResolver().takePersistableUriPermission(
                treeUri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION
            );
        } catch (Exception ignored) {
        }

        String resolvedPath = MapPathResolver.resolveTreeUriToPath(treeUri);
        if (resolvedPath == null) {
            call.reject("Não foi possível converter a pasta selecionada para um caminho local. Informe o caminho manualmente.");
            return;
        }

        MapPathResolver.saveMapDirectory(getContext(), resolvedPath, treeUri.toString());
        JSObject ret = new JSObject();
        ret.put("path", resolvedPath);
        ret.put("treeUri", treeUri.toString());
        call.resolve(ret);
    }

    @PluginMethod
    public void listMapModules(PluginCall call) {
        String customPath = call.getString("dirPath");
        String dirPath = (customPath != null && !customPath.isEmpty())
            ? customPath
            : MapPathResolver.getSavedMapDirectory(getContext());

        executor.execute(() -> {
            List<File> files = MapPathResolver.scanMapFiles(dirPath);
            JSArray modules = new JSArray();
            for (File f : files) {
                JSObject meta = MapSqliteRepository.inspectMapModule(f);
                if (meta != null) {
                    modules.put(meta);
                }
            }
            JSObject ret = new JSObject();
            ret.put("dirPath", dirPath);
            ret.put("modules", modules);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void getChapterMapMarkers(PluginCall call) {
        Integer book = call.getInt("book");
        Integer chapter = call.getInt("chapter");
        String specificModule = call.getString("modulePath");

        if (book == null || chapter == null) {
            call.reject("Parâmetros 'book' e 'chapter' são obrigatórios.");
            return;
        }

        executor.execute(() -> {
            Map<Integer, JSArray> merged = new HashMap<>();
            List<File> filesToCheck;

            if (specificModule != null && !specificModule.trim().isEmpty()) {
                filesToCheck = Collections.singletonList(new File(specificModule));
            } else {
                String dirPath = MapPathResolver.getSavedMapDirectory(getContext());
                filesToCheck = MapPathResolver.scanMapFiles(dirPath);
            }

            for (File f : filesToCheck) {
                JSObject meta = MapSqliteRepository.inspectMapModule(f);
                if (meta == null || !meta.optBoolean("hasMapVerse", false)) {
                    continue;
                }
                String modTitle = meta.optString("title", f.getName());
                Map<Integer, List<JSObject>> modMarkers =
                    MapSqliteRepository.getChapterVerseMaps(f, modTitle, book, chapter);

                for (Map.Entry<Integer, List<JSObject>> e : modMarkers.entrySet()) {
                    JSArray arr = merged.get(e.getKey());
                    if (arr == null) {
                        arr = new JSArray();
                        merged.put(e.getKey(), arr);
                    }
                    for (JSObject item : e.getValue()) {
                        arr.put(item);
                    }
                }
            }

            JSObject versesObj = new JSObject();
            for (Map.Entry<Integer, JSArray> e : merged.entrySet()) {
                versesObj.put(String.valueOf(e.getKey()), e.getValue());
            }

            JSObject ret = new JSObject();
            ret.put("book", book);
            ret.put("chapter", chapter);
            ret.put("verses", versesObj);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void getMapIndex(PluginCall call) {
        String modulePath = call.getString("modulePath");
        if (modulePath == null || modulePath.trim().isEmpty()) {
            call.reject("Parâmetro 'modulePath' é obrigatório.");
            return;
        }
        executor.execute(() -> {
            JSArray items = MapSqliteRepository.getMapIndex(new File(modulePath));
            JSObject ret = new JSObject();
            ret.put("items", items);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void getMapEntry(PluginCall call) {
        String modulePath = call.getString("modulePath");
        String id = call.getString("id", "");
        Integer rowId = call.getInt("rowid", -1);
        String title = call.getString("title", "");

        if (modulePath == null || modulePath.trim().isEmpty()) {
            call.reject("Parâmetro 'modulePath' é obrigatório.");
            return;
        }
        executor.execute(() -> {
            JSObject entry = MapSqliteRepository.getMapEntry(
                getContext(),
                new File(modulePath),
                id,
                rowId != null ? rowId : -1,
                title
            );
            if (entry == null) {
                call.reject("Mapa não encontrado no módulo.");
                return;
            }
            call.resolve(entry);
        });
    }

    @PluginMethod
    public void searchMaps(PluginCall call) {
        String query = call.getString("query", "");
        String specificModule = call.getString("modulePath");
        int limit = call.getInt("limit", 15);

        if (query == null || query.trim().isEmpty()) {
            JSObject empty = new JSObject();
            empty.put("results", new JSArray());
            call.resolve(empty);
            return;
        }

        executor.execute(() -> {
            JSArray all = new JSArray();
            List<File> filesToCheck = (specificModule != null && !specificModule.trim().isEmpty())
                ? Collections.singletonList(new File(specificModule))
                : MapPathResolver.scanMapFiles(MapPathResolver.getSavedMapDirectory(getContext()));

            for (File f : filesToCheck) {
                JSObject meta = MapSqliteRepository.inspectMapModule(f);
                if (meta == null) {
                    continue;
                }
                String modTitle = meta.optString("title", f.getName());
                JSArray hits = MapSqliteRepository.searchMaps(f, modTitle, query, limit);
                for (int i = 0; i < hits.length(); i++) {
                    all.put(hits.opt(i));
                }
            }
            JSObject ret = new JSObject();
            ret.put("results", all);
            call.resolve(ret);
        });
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        executor.shutdownNow();
    }
}
