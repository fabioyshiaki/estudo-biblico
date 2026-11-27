package com.fabio.estudobiblico.plugins;

import android.Manifest;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "BibleCore")
public class BibleCorePlugin extends Plugin {

    private static final int REQ_READ_STORAGE = 4101;
    private static final int MAX_SQL_CONNECTIONS = 14;

    private ExecutorService executor;
    private SqlReadOnlyPool sqlPool;
    private SourceRegistryDb registryDb;

    @Override
    public void load() {
        executor = Executors.newFixedThreadPool(4);
        sqlPool = new SqlReadOnlyPool(MAX_SQL_CONNECTIONS);
        registryDb = new SourceRegistryDb(getContext());
    }

    @Override
    protected void handleOnStop() {
        super.handleOnStop();
        if (sqlPool != null) {
            sqlPool.closeAll();
        }
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        if (sqlPool != null) {
            sqlPool.closeAll();
        }
        if (executor != null) {
            executor.shutdownNow();
        }
        if (registryDb != null) {
            registryDb.close();
        }
    }

    @PluginMethod
    public void checkStoragePermission(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", hasStorageAccess());
        ret.put("sdkInt", Build.VERSION.SDK_INT);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestStoragePermission(PluginCall call) {
        if (hasStorageAccess()) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                Intent intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                getActivity().startActivity(intent);
            } catch (Exception e) {
                Intent fallback = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
                getActivity().startActivity(fallback);
            }
        } else {
            ActivityCompat.requestPermissions(
                    getActivity(),
                    new String[]{Manifest.permission.READ_EXTERNAL_STORAGE},
                    REQ_READ_STORAGE
            );
        }

        JSObject ret = new JSObject();
        ret.put("requested", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void getStorageRoots(PluginCall call) {
        executor.execute(() -> {
            try {
                JSObject ret = new JSObject();
                ret.put("roots", StorageBrowser.getStorageRoots(getContext()));
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Erro ao detectar armazenamentos: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void listDirectory(PluginCall call) {
        String path = call.getString("path", "");
        String formatId = call.getString("formatId", "mysword_bbl");
        if (path == null || path.trim().isEmpty()) {
            call.reject("Informe o caminho da pasta.");
            return;
        }

        executor.execute(() -> {
            try {
                List<String> extensions = StorageBrowser.getExtensionsForFormat(formatId);
                JSObject result = StorageBrowser.listDirectory(path, extensions);
                call.resolve(result);
            } catch (Exception e) {
                call.reject("Erro ao listar pasta: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void addSource(PluginCall call) {
        String path = call.getString("path", "");
        String mode = call.getString("mode", "file");
        boolean recursive = Boolean.TRUE.equals(call.getBoolean("recursive", false));
        String resourceKind = call.getString("resourceKind", "bible");
        String formatId = call.getString("formatId", "mysword_bbl");

        if (path == null || path.trim().isEmpty()) {
            call.reject("Caminho da fonte não informado.");
            return;
        }

        executor.execute(() -> {
            try {
                File target = new File(path);
                if (!target.exists()) {
                    call.reject("O caminho selecionado não existe: " + path);
                    return;
                }
                if ("file".equals(mode) && !target.isFile()) {
                    call.reject("O caminho selecionado não é um arquivo.");
                    return;
                }
                if ("folder".equals(mode) && !target.isDirectory()) {
                    call.reject("O caminho selecionado não é uma pasta.");
                    return;
                }

                // Se a mesma pasta já estava autorizada para outro tipo (ex.: Bíblias), promove para modo misto sem apagar os módulos anteriores
                String effectiveFormatId = formatId;
                String effectiveResourceKind = resourceKind;
                boolean effectiveRecursive = recursive;
                if ("folder".equals(mode)) {
                    for (JSObject existing : registryDb.getAllSourceRecords()) {
                        String existingPath = existing.getString("path");
                        if (path.equals(existingPath)) {
                            String prevFormat = existing.getString("formatId");
                            if (prevFormat != null && !prevFormat.equals(formatId)) {
                                effectiveFormatId = "mysword_all";
                                effectiveResourceKind = "mixed";
                                effectiveRecursive = recursive || Boolean.TRUE.equals(existing.getBool("recursive"));
                            }
                            break;
                        }
                    }
                }

                List<String> extensions = StorageBrowser.getExtensionsForFormat(effectiveFormatId);
                List<File> foundFiles = StorageBrowser.collectTargetFiles(target, mode, effectiveRecursive, extensions);
                List<ContentValues> validModules = new ArrayList<>();
                int matchedRequestedCount = 0;

                for (File f : foundFiles) {
                    ContentValues meta = StorageBrowser.inspectMySwordModule(f, effectiveResourceKind, effectiveFormatId, sqlPool);
                    if (meta != null) {
                        validModules.add(meta);
                        String detectedKind = meta.getAsString("resource_kind");
                        if (resourceKind.equals(detectedKind)) {
                            matchedRequestedCount++;
                        }
                    }
                }

                if ("file".equals(mode) && validModules.isEmpty()) {
                    String msg = "mysword_dct".equals(formatId)
                            ? "O arquivo selecionado não é um Dicionário MySword (.dct.mybible) válido."
                            : "O arquivo selecionado não é uma Bíblia MySword (.bbl.mybible) válida.";
                    call.reject(msg);
                    return;
                }

                String label = target.getName().isEmpty() ? path : target.getName();
                long sourceId = registryDb.upsertSource(
                        path,
                        mode,
                        effectiveRecursive,
                        effectiveResourceKind,
                        effectiveFormatId,
                        label
                );
                registryDb.replaceModulesForSource(sourceId, validModules);

                JSObject ret = new JSObject();
                ret.put("sourceId", sourceId);
                ret.put("addedCount", "mixed".equals(effectiveResourceKind) ? matchedRequestedCount : validModules.size());
                ret.put("sources", registryDb.listSources());
                ret.put("modules", registryDb.listModules(null));
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Falha ao registrar fonte: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void removeSource(PluginCall call) {
        Integer idVal = call.getInt("sourceId");
        if (idVal == null || idVal <= 0) {
            call.reject("ID da fonte inválido.");
            return;
        }

        executor.execute(() -> {
            try {
                List<String> paths = registryDb.deleteSource(idVal.longValue());
                for (String p : paths) {
                    sqlPool.closePath(p);
                }
                JSObject ret = new JSObject();
                ret.put("removed", true);
                ret.put("sources", registryDb.listSources());
                ret.put("modules", registryDb.listModules(null));
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Falha ao remover fonte: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void listSources(PluginCall call) {
        executor.execute(() -> {
            try {
                JSObject ret = new JSObject();
                ret.put("sources", registryDb.listSources());
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Erro ao listar fontes: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void listModules(PluginCall call) {
        String resourceKind = call.getString("resourceKind", null);
        executor.execute(() -> {
            try {
                JSObject ret = new JSObject();
                ret.put("modules", registryDb.listModules(resourceKind));
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Erro ao listar módulos: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void refreshSources(PluginCall call) {
        executor.execute(() -> {
            try {
                List<JSObject> sources = registryDb.getAllSourceRecords();
                for (JSObject src : sources) {
                    long sourceId = src.getLong("id");
                    String path = src.getString("path");
                    String mode = src.getString("sourceMode");
                    boolean recursive = Boolean.TRUE.equals(src.getBool("recursive"));
                    String resourceKind = src.getString("resourceKind");
                    String formatId = src.getString("formatId");

                    File target = new File(path);
                    List<String> extensions = StorageBrowser.getExtensionsForFormat(formatId);
                    List<File> files = StorageBrowser.collectTargetFiles(target, mode, recursive, extensions);
                    List<ContentValues> validModules = new ArrayList<>();

                    for (File f : files) {
                        ContentValues meta = StorageBrowser.inspectMySwordModule(f, resourceKind, formatId, sqlPool);
                        if (meta != null) {
                            validModules.add(meta);
                        }
                    }
                    registryDb.replaceModulesForSource(sourceId, validModules);
                }

                JSObject ret = new JSObject();
                ret.put("sources", registryDb.listSources());
                ret.put("modules", registryDb.listModules(null));
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Erro ao atualizar fontes registradas: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void setModuleFavorite(PluginCall call) {
        Integer idVal = call.getInt("moduleId");
        boolean favorite = Boolean.TRUE.equals(call.getBoolean("favorite", false));
        if (idVal == null || idVal <= 0) {
            call.reject("ID do módulo inválido.");
            return;
        }

        executor.execute(() -> {
            try {
                registryDb.setModuleFavorite(idVal.longValue(), favorite);
                JSObject ret = new JSObject();
                ret.put("updated", true);
                ret.put("modules", registryDb.listModules(null));
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Erro ao atualizar favorito: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void queryModule(PluginCall call) {
        String path = call.getString("path", "");
        String sql = call.getString("sql", "");
        JSArray paramsArr = call.getArray("params");

        if (path == null || path.trim().isEmpty()) {
            call.reject("Caminho do módulo não informado.");
            return;
        }

        executor.execute(() -> {
            try {
                if (!registryDb.isRegisteredModulePath(path)) {
                    call.reject("Acesso bloqueado: módulo fora da lista de fontes autorizadas.");
                    return;
                }

                String[] params = null;
                if (paramsArr != null && paramsArr.length() > 0) {
                    params = new String[paramsArr.length()];
                    for (int i = 0; i < paramsArr.length(); i++) {
                        params[i] = paramsArr.optString(i, "");
                    }
                }

                JSArray rows = sqlPool.query(path, sql, params);
                JSObject ret = new JSObject();
                ret.put("rows", rows);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Erro na consulta somente leitura: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void closeAllModules(PluginCall call) {
        executor.execute(() -> {
            sqlPool.closeAll();
            JSObject ret = new JSObject();
            ret.put("closed", true);
            call.resolve(ret);
        });
    }

    private boolean hasStorageAccess() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            return Environment.isExternalStorageManager();
        }
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_EXTERNAL_STORAGE)
                == PackageManager.PERMISSION_GRANTED;
    }
}
