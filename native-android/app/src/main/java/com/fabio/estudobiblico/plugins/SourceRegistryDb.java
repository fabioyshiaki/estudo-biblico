package com.fabio.estudobiblico.plugins;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class SourceRegistryDb extends SQLiteOpenHelper {

    private static final String DB_NAME = "estudo_biblico_registry.db";
    private static final int DB_VERSION = 1;

    public SourceRegistryDb(Context context) {
        super(context, DB_NAME, null, DB_VERSION);
    }

    @Override
    public void onConfigure(SQLiteDatabase db) {
        super.onConfigure(db);
        db.setForeignKeyConstraintsEnabled(true);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL(
                "CREATE TABLE sources ("
                        + "id INTEGER PRIMARY KEY AUTOINCREMENT, "
                        + "path TEXT NOT NULL UNIQUE, "
                        + "source_mode TEXT NOT NULL, "
                        + "recursive INTEGER NOT NULL DEFAULT 0, "
                        + "resource_kind TEXT NOT NULL DEFAULT 'bible', "
                        + "format_id TEXT NOT NULL DEFAULT 'mysword_bbl', "
                        + "label TEXT NOT NULL, "
                        + "created_at INTEGER NOT NULL"
                        + ")"
        );

        db.execSQL(
                "CREATE TABLE modules ("
                        + "id INTEGER PRIMARY KEY AUTOINCREMENT, "
                        + "source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE, "
                        + "path TEXT NOT NULL UNIQUE, "
                        + "file_name TEXT NOT NULL, "
                        + "title TEXT NOT NULL, "
                        + "abbr TEXT NOT NULL, "
                        + "description TEXT, "
                        + "language TEXT, "
                        + "has_strongs INTEGER NOT NULL DEFAULT 0, "
                        + "resource_kind TEXT NOT NULL DEFAULT 'bible', "
                        + "format_id TEXT NOT NULL DEFAULT 'mysword_bbl', "
                        + "file_size INTEGER NOT NULL DEFAULT 0, "
                        + "last_modified INTEGER NOT NULL DEFAULT 0, "
                        + "is_favorite INTEGER NOT NULL DEFAULT 0"
                        + ")"
        );

        db.execSQL("CREATE INDEX idx_modules_kind ON modules(resource_kind)");
        db.execSQL("CREATE INDEX idx_modules_source ON modules(source_id)");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        // Reservado para migrações futuras sem perda de dados
    }

    public synchronized long upsertSource(
            String path,
            String mode,
            boolean recursive,
            String resourceKind,
            String formatId,
            String label
    ) {
        SQLiteDatabase db = getWritableDatabase();
        long existingId = -1;

        try (Cursor c = db.rawQuery("SELECT id FROM sources WHERE path = ? LIMIT 1", new String[]{path})) {
            if (c.moveToFirst()) {
                existingId = c.getLong(0);
            }
        }

        ContentValues cv = new ContentValues();
        cv.put("path", path);
        cv.put("source_mode", mode);
        cv.put("recursive", recursive ? 1 : 0);
        cv.put("resource_kind", resourceKind);
        cv.put("format_id", formatId);
        cv.put("label", label);

        if (existingId >= 0) {
            db.update("sources", cv, "id = ?", new String[]{String.valueOf(existingId)});
            return existingId;
        }

        cv.put("created_at", System.currentTimeMillis());
        return db.insertOrThrow("sources", null, cv);
    }

    public synchronized void replaceModulesForSource(long sourceId, List<ContentValues> items) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            Map<String, Integer> prevFavorites = new HashMap<>();
            try (Cursor c = db.rawQuery(
                    "SELECT path, is_favorite FROM modules WHERE source_id = ?",
                    new String[]{String.valueOf(sourceId)}
            )) {
                while (c.moveToNext()) {
                    prevFavorites.put(c.getString(0), c.getInt(1));
                }
            }

            db.delete("modules", "source_id = ?", new String[]{String.valueOf(sourceId)});

            for (ContentValues item : items) {
                ContentValues copy = new ContentValues(item);
                copy.put("source_id", sourceId);
                String modPath = copy.getAsString("path");
                if (modPath != null && prevFavorites.containsKey(modPath)) {
                    copy.put("is_favorite", prevFavorites.get(modPath));
                }
                db.insertWithOnConflict("modules", null, copy, SQLiteDatabase.CONFLICT_REPLACE);
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    public synchronized List<String> deleteSource(long sourceId) {
        SQLiteDatabase db = getWritableDatabase();
        List<String> removedPaths = new ArrayList<>();

        try (Cursor c = db.rawQuery(
                "SELECT path FROM modules WHERE source_id = ?",
                new String[]{String.valueOf(sourceId)}
        )) {
            while (c.moveToNext()) {
                removedPaths.add(c.getString(0));
            }
        }

        db.delete("sources", "id = ?", new String[]{String.valueOf(sourceId)});
        return removedPaths;
    }

    public synchronized JSArray listSources() {
        SQLiteDatabase db = getReadableDatabase();
        JSArray result = new JSArray();
        String sql = "SELECT s.id, s.path, s.source_mode, s.recursive, s.resource_kind, "
                + "s.format_id, s.label, s.created_at, "
                + "(SELECT COUNT(*) FROM modules m WHERE m.source_id = s.id) AS module_count "
                + "FROM sources s ORDER BY s.created_at DESC";

        try (Cursor c = db.rawQuery(sql, null)) {
            while (c.moveToNext()) {
                JSObject obj = new JSObject();
                obj.put("id", c.getLong(0));
                obj.put("path", c.getString(1));
                obj.put("sourceMode", c.getString(2));
                obj.put("recursive", c.getInt(3) == 1);
                obj.put("resourceKind", c.getString(4));
                obj.put("formatId", c.getString(5));
                obj.put("label", c.getString(6));
                obj.put("createdAt", c.getLong(7));
                obj.put("moduleCount", c.getInt(8));
                result.put(obj);
            }
        }
        return result;
    }

    public synchronized List<JSObject> getAllSourceRecords() {
        JSArray arr = listSources();
        List<JSObject> list = new ArrayList<>();
        for (int i = 0; i < arr.length(); i++) {
            try {
                list.add(JSObject.fromJSONObject(arr.getJSONObject(i)));
            } catch (Exception ignored) {
            }
        }
        return list;
    }

    public synchronized JSArray listModules(String resourceKind) {
        SQLiteDatabase db = getReadableDatabase();
        JSArray result = new JSArray();
        String sql;
        String[] args;

        if (resourceKind != null && !resourceKind.trim().isEmpty()) {
            sql = "SELECT id, source_id, path, file_name, title, abbr, description, language, "
                    + "has_strongs, resource_kind, format_id, file_size, last_modified, is_favorite "
                    + "FROM modules WHERE resource_kind = ? ORDER BY is_favorite DESC, title COLLATE NOCASE ASC";
            args = new String[]{resourceKind.trim()};
        } else {
            sql = "SELECT id, source_id, path, file_name, title, abbr, description, language, "
                    + "has_strongs, resource_kind, format_id, file_size, last_modified, is_favorite "
                    + "FROM modules ORDER BY is_favorite DESC, title COLLATE NOCASE ASC";
            args = null;
        }

        try (Cursor c = db.rawQuery(sql, args)) {
            while (c.moveToNext()) {
                JSObject obj = new JSObject();
                obj.put("id", c.getLong(0));
                obj.put("sourceId", c.getLong(1));
                obj.put("path", c.getString(2));
                obj.put("fileName", c.getString(3));
                obj.put("title", c.getString(4));
                obj.put("abbr", c.getString(5));
                obj.put("description", c.isNull(6) ? "" : c.getString(6));
                obj.put("language", c.isNull(7) ? "" : c.getString(7));
                obj.put("hasStrongs", c.getInt(8) == 1);
                obj.put("resourceKind", c.getString(9));
                obj.put("formatId", c.getString(10));
                obj.put("fileSize", c.getLong(11));
                obj.put("lastModified", c.getLong(12));
                obj.put("isFavorite", c.getInt(13) == 1);
                result.put(obj);
            }
        }
        return result;
    }

    public synchronized boolean isRegisteredModulePath(String path) {
        if (path == null || path.trim().isEmpty()) {
            return false;
        }
        SQLiteDatabase db = getReadableDatabase();
        try (Cursor c = db.rawQuery("SELECT 1 FROM modules WHERE path = ? LIMIT 1", new String[]{path})) {
            return c.moveToFirst();
        }
    }

    public synchronized void setModuleFavorite(long moduleId, boolean favorite) {
        SQLiteDatabase db = getWritableDatabase();
        ContentValues cv = new ContentValues();
        cv.put("is_favorite", favorite ? 1 : 0);
        db.update("modules", cv, "id = ?", new String[]{String.valueOf(moduleId)});
    }
}
