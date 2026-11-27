package com.fabio.estudobiblico.plugins;

import android.content.ContentValues;
import android.content.Context;
import android.os.Environment;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

public final class StorageBrowser {

    private static final int MAX_RECURSIVE_DEPTH = 6;

    private StorageBrowser() {
    }

    public static List<String> getExtensionsForFormat(String formatId) {
        if ("mysword_dct".equals(formatId)) {
            return Collections.singletonList(".dct.mybible");
        }
        if ("mysword_all".equals(formatId)) {
            return Arrays.asList(".bbl.mybible", ".dct.mybible");
        }
        return Collections.singletonList(".bbl.mybible");
    }

    public static JSArray getStorageRoots(Context context) {
        JSArray roots = new JSArray();
        Set<String> seen = new LinkedHashSet<>();

        File internal = Environment.getExternalStorageDirectory();
        if (internal != null && internal.exists() && internal.isDirectory()) {
            String path = internal.getAbsolutePath();
            seen.add(path);
            JSObject item = new JSObject();
            item.put("name", "Armazenamento Interno");
            item.put("path", path);
            item.put("isRemovable", false);
            roots.put(item);
        }

        File[] appDirs = context.getExternalFilesDirs(null);
        if (appDirs != null) {
            for (File appDir : appDirs) {
                if (appDir == null) {
                    continue;
                }
                String full = appDir.getAbsolutePath();
                int marker = full.indexOf("/Android/data");
                if (marker <= 0) {
                    continue;
                }
                String rootPath = full.substring(0, marker);
                if (seen.contains(rootPath)) {
                    continue;
                }
                File rootFile = new File(rootPath);
                if (!rootFile.exists() || !rootFile.isDirectory()) {
                    continue;
                }
                seen.add(rootPath);
                boolean removable = true;
                try {
                    removable = Environment.isExternalStorageRemovable(rootFile);
                } catch (Exception ignored) {
                }
                JSObject item = new JSObject();
                item.put("name", removable ? "Cartão SD (" + rootFile.getName() + ")" : rootFile.getName());
                item.put("path", rootPath);
                item.put("isRemovable", removable);
                roots.put(item);
            }
        }
        return roots;
    }

    public static JSObject listDirectory(String dirPath, List<String> allowedExtensions) {
        File dir = new File(dirPath);
        if (!dir.exists() || !dir.isDirectory()) {
            throw new IllegalArgumentException("Pasta inválida ou inacessível: " + dirPath);
        }

        File[] children = dir.listFiles();
        List<File> dirs = new ArrayList<>();
        List<File> files = new ArrayList<>();

        if (children != null) {
            for (File child : children) {
                String name = child.getName();
                if (name.startsWith(".")) {
                    continue;
                }
                if (child.isDirectory()) {
                    dirs.add(child);
                } else if (child.isFile() && matchesExtensions(name, allowedExtensions)) {
                    files.add(child);
                }
            }
        }

        Comparator<File> byName = (a, b) -> a.getName().compareToIgnoreCase(b.getName());
        Collections.sort(dirs, byName);
        Collections.sort(files, byName);

        JSArray dirArray = new JSArray();
        for (File d : dirs) {
            JSObject obj = new JSObject();
            obj.put("name", d.getName());
            obj.put("path", d.getAbsolutePath());
            dirArray.put(obj);
        }

        JSArray fileArray = new JSArray();
        for (File f : files) {
            JSObject obj = new JSObject();
            obj.put("name", f.getName());
            obj.put("path", f.getAbsolutePath());
            obj.put("sizeBytes", f.length());
            obj.put("lastModified", f.lastModified());
            fileArray.put(obj);
        }

        File parent = dir.getParentFile();
        JSObject result = new JSObject();
        result.put("currentPath", dir.getAbsolutePath());
        result.put("parentPath", parent != null ? parent.getAbsolutePath() : "");
        result.put("canRead", dir.canRead());
        result.put("directories", dirArray);
        result.put("files", fileArray);
        return result;
    }

    public static List<File> collectTargetFiles(
            File target,
            String mode,
            boolean recursive,
            List<String> allowedExtensions
    ) {
        List<File> collected = new ArrayList<>();
        if (!target.exists()) {
            return collected;
        }

        if ("file".equals(mode)) {
            if (target.isFile() && matchesExtensions(target.getName(), allowedExtensions)) {
                collected.add(target);
            }
            return collected;
        }

        if (target.isDirectory()) {
            collectFromFolder(target, recursive, 0, allowedExtensions, collected);
        }
        return collected;
    }

    private static void collectFromFolder(
            File folder,
            boolean recursive,
            int depth,
            List<String> allowedExtensions,
            List<File> out
    ) {
        if (depth > MAX_RECURSIVE_DEPTH) {
            return;
        }
        File[] children = folder.listFiles();
        if (children == null) {
            return;
        }
        Arrays.sort(children, (a, b) -> a.getName().compareToIgnoreCase(b.getName()));
        for (File child : children) {
            if (child.getName().startsWith(".")) {
                continue;
            }
            if (child.isFile() && matchesExtensions(child.getName(), allowedExtensions)) {
                out.add(child);
            } else if (recursive && child.isDirectory()) {
                collectFromFolder(child, true, depth + 1, allowedExtensions, out);
            }
        }
    }

    public static ContentValues inspectMySwordBible(
            File file,
            String resourceKind,
            String formatId,
            SqlReadOnlyPool sqlPool
    ) {
        return inspectMySwordModule(file, resourceKind, formatId, sqlPool);
    }

    public static ContentValues inspectMySwordModule(
            File file,
            String resourceKind,
            String formatId,
            SqlReadOnlyPool sqlPool
    ) {
        String lowerName = file.getName().toLowerCase(Locale.ROOT);
        boolean isDict = lowerName.endsWith(".dct.mybible") || "mysword_dct".equals(formatId);
        String actualKind = isDict ? "dictionary" : "bible";
        String actualFormatId = isDict ? "mysword_dct" : "mysword_bbl";
        String path = file.getAbsolutePath();

        try {
            String checkSql = isDict
                    ? "SELECT name FROM sqlite_master WHERE type='table' "
                    + "AND lower(name) NOT IN ('details', 'info', 'android_metadata', 'bible') "
                    + "AND lower(name) NOT LIKE 'sqlite_%' LIMIT 1"
                    : "SELECT name FROM sqlite_master WHERE type='table' AND lower(name)='bible' LIMIT 1";
            JSArray tableCheck = sqlPool.query(path, checkSql, null);
            if (tableCheck.length() == 0) {
                return null;
            }
        } catch (Exception e) {
            return null;
        }

        String ext = isDict ? ".dct.mybible" : ".bbl.mybible";
        String baseName = stripExtension(file.getName(), ext);
        String title = baseName;
        String abbr = buildFallbackAbbr(baseName, isDict ? "DCT" : "BIB");
        String description = "";
        String language = "";
        int hasStrongs = 0;

        try {
            JSArray details = sqlPool.query(path, "SELECT * FROM Details LIMIT 1", null);
            if (details.length() > 0) {
                JSONObject row = details.getJSONObject(0);
                String t = pickField(row, "title", "description");
                String a = pickField(row, "abbreviation", "abbr");
                String info = pickField(row, "information", "comments", "description");
                String lang = pickField(row, "language");
                String strongs = pickField(row, "strongs", "strong");

                if (!t.isEmpty()) {
                    title = cleanSimpleText(t);
                }
                if (!a.isEmpty()) {
                    abbr = cleanSimpleText(a);
                }
                if (!info.isEmpty()) {
                    description = cleanSimpleText(info);
                }
                if (!lang.isEmpty()) {
                    language = lang.trim().toUpperCase(Locale.ROOT);
                }
                if ("1".equals(strongs) || "true".equalsIgnoreCase(strongs)) {
                    hasStrongs = 1;
                }
            }
        } catch (Exception ignored) {
        }

        ContentValues cv = new ContentValues();
        cv.put("path", path);
        cv.put("file_name", file.getName());
        cv.put("title", title);
        cv.put("abbr", abbr);
        cv.put("description", description);
        cv.put("language", language);
        cv.put("has_strongs", hasStrongs);
        cv.put("resource_kind", actualKind);
        cv.put("format_id", actualFormatId);
        cv.put("file_size", file.length());
        cv.put("last_modified", file.lastModified());
        return cv;
    }

    private static boolean matchesExtensions(String fileName, List<String> allowedExtensions) {
        if (allowedExtensions == null || allowedExtensions.isEmpty()) {
            return true;
        }
        String lower = fileName.toLowerCase(Locale.ROOT);
        for (String ext : allowedExtensions) {
            if (lower.endsWith(ext.toLowerCase(Locale.ROOT))) {
                return true;
            }
        }
        return false;
    }

    private static String stripExtension(String name, String ext) {
        if (name.toLowerCase(Locale.ROOT).endsWith(ext)) {
            return name.substring(0, name.length() - ext.length());
        }
        return name;
    }

    private static String buildFallbackAbbr(String baseName, String fallback) {
        String clean = baseName.replaceAll("[^A-Za-z0-9]", "").toUpperCase(Locale.ROOT);
        if (clean.isEmpty()) {
            return fallback;
        }
        return clean.length() > 10 ? clean.substring(0, 10) : clean;
    }

    private static String pickField(JSONObject row, String... candidateKeys) {
        for (String wanted : candidateKeys) {
            Iterator<String> keys = row.keys();
            while (keys.hasNext()) {
                String actualKey = keys.next();
                if (actualKey.equalsIgnoreCase(wanted) && !row.isNull(actualKey)) {
                    String val = String.valueOf(row.opt(actualKey)).trim();
                    if (!val.isEmpty() && !"null".equalsIgnoreCase(val)) {
                        return val;
                    }
                }
            }
        }
        return "";
    }

    private static String cleanSimpleText(String raw) {
        return raw.replaceAll("<[^>]*>", " ").replaceAll("\\s+", " ").trim();
    }
}
