package com.fabio.estudobiblico.plugins;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Environment;
import android.provider.DocumentsContract;

import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

public final class MapPathResolver {

    private static final String PREFS_NAME = "estudo_biblico_map_reader_prefs";
    private static final String KEY_MAP_DIR_PATH = "map_dir_path";
    private static final String KEY_MAP_DIR_URI = "map_dir_uri";

    private static final String[] SUPPORTED_EXTENSIONS = {
        ".bok.mybible",
        ".map.mybible",
        ".jnl.mybible",
        ".mybible",
        ".sqlite",
        ".sqlite3",
        ".db"
    };

    private static final String[] EXCLUDED_EXTENSIONS = {
        ".bbl.mybible",
        ".dct.mybible",
        ".cmt.mybible"
    };

    private MapPathResolver() {
    }

    public static void saveMapDirectory(Context context, String path, String treeUri) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        if (path != null) {
            editor.putString(KEY_MAP_DIR_PATH, path);
        }
        if (treeUri != null) {
            editor.putString(KEY_MAP_DIR_URI, treeUri);
        }
        editor.apply();
    }

    public static String getSavedMapDirectory(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String saved = prefs.getString(KEY_MAP_DIR_PATH, null);
        if (saved != null && !saved.trim().isEmpty()) {
            return saved;
        }
        File defaultDir = new File(Environment.getExternalStorageDirectory(), "mysword/books");
        if (defaultDir.exists() && defaultDir.isDirectory()) {
            return defaultDir.getAbsolutePath();
        }
        File altDir = new File(Environment.getExternalStorageDirectory(), "mysword/maps");
        if (altDir.exists() && altDir.isDirectory()) {
            return altDir.getAbsolutePath();
        }
        return Environment.getExternalStorageDirectory().getAbsolutePath();
    }

    public static String getSavedTreeUri(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getString(KEY_MAP_DIR_URI, null);
    }

    public static String resolveTreeUriToPath(Uri treeUri) {
        if (treeUri == null) {
            return null;
        }
        try {
            String docId = DocumentsContract.getTreeDocumentId(treeUri);
            if (docId == null) {
                return null;
            }

            String[] split = docId.split(":", 2);
            String volumeId = split[0];
            String relativePath = split.length > 1 ? split[1] : "";

            if ("primary".equalsIgnoreCase(volumeId)) {
                String base = Environment.getExternalStorageDirectory().getAbsolutePath();
                return relativePath.isEmpty() ? base : base + "/" + relativePath;
            }

            File sdDir = new File("/storage/" + volumeId + (relativePath.isEmpty() ? "" : "/" + relativePath));
            if (sdDir.exists()) {
                return sdDir.getAbsolutePath();
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    public static List<File> scanMapFiles(String dirPath) {
        List<File> result = new ArrayList<>();
        if (dirPath == null || dirPath.trim().isEmpty()) {
            return result;
        }
        File root = new File(dirPath);
        if (!root.exists() || !root.isDirectory()) {
            return result;
        }
        collectFilesRecursive(root, 0, 2, result);
        Collections.sort(result, (a, b) -> a.getName().compareToIgnoreCase(b.getName()));
        return result;
    }

    private static void collectFilesRecursive(File dir, int depth, int maxDepth, List<File> out) {
        if (depth > maxDepth) {
            return;
        }
        File[] children = dir.listFiles();
        if (children == null) {
            return;
        }

        Arrays.sort(children, (a, b) -> a.getName().compareToIgnoreCase(b.getName()));
        for (File child : children) {
            if (child.getName().startsWith(".")) {
                continue;
            }
            if (child.isDirectory()) {
                collectFilesRecursive(child, depth + 1, maxDepth, out);
            } else if (child.isFile() && isCandidateExtension(child.getName())) {
                out.add(child);
            }
        }
    }

    private static boolean isCandidateExtension(String fileName) {
        String lower = fileName.toLowerCase(Locale.ROOT);
        for (String excluded : EXCLUDED_EXTENSIONS) {
            if (lower.endsWith(excluded)) {
                return false;
            }
        }
        for (String ext : SUPPORTED_EXTENSIONS) {
            if (lower.endsWith(ext)) {
                return true;
            }
        }
        return false;
    }
}
