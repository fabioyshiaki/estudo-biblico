package com.fabio.estudobiblico.plugins;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.io.File;
import java.util.LinkedHashMap;
import java.util.Locale;

public class SqlReadOnlyPool {

    private static final int OPEN_FLAGS =
            SQLiteDatabase.OPEN_READONLY | SQLiteDatabase.NO_LOCALIZED_COLLATORS;

    private final int maxConnections;
    private final LinkedHashMap<String, SQLiteDatabase> pool;

    public SqlReadOnlyPool(int maxConnections) {
        this.maxConnections = Math.max(2, maxConnections);
        this.pool = new LinkedHashMap<>(16, 0.75f, true);
    }

    public synchronized JSArray query(String dbPath, String sql, String[] params) {
        validateReadOnlySql(sql);
        SQLiteDatabase db = getOrOpenDatabase(dbPath);
        JSArray rows = new JSArray();

        try (Cursor cursor = db.rawQuery(sql.trim(), params)) {
            String[] columns = cursor.getColumnNames();
            while (cursor.moveToNext()) {
                JSObject row = new JSObject();
                for (int i = 0; i < columns.length; i++) {
                    String col = columns[i];
                    int type = cursor.getType(i);
                    switch (type) {
                        case Cursor.FIELD_TYPE_NULL:
                            row.put(col, JSONObject.NULL);
                            break;
                        case Cursor.FIELD_TYPE_INTEGER:
                            row.put(col, cursor.getLong(i));
                            break;
                        case Cursor.FIELD_TYPE_FLOAT:
                            row.put(col, cursor.getDouble(i));
                            break;
                        case Cursor.FIELD_TYPE_STRING:
                            row.put(col, cursor.getString(i));
                            break;
                        case Cursor.FIELD_TYPE_BLOB:
                            byte[] blob = cursor.getBlob(i);
                            int len = blob != null ? blob.length : 0;
                            row.put(col, "[BLOB " + len + " bytes]");
                            break;
                        default:
                            row.put(col, cursor.getString(i));
                            break;
                    }
                }
                rows.put(row);
            }
        }
        return rows;
    }

    public synchronized void closePath(String dbPath) {
        if (dbPath == null) {
            return;
        }
        SQLiteDatabase db = pool.remove(dbPath);
        safeClose(db);
    }

    public synchronized void closeAll() {
        for (SQLiteDatabase db : pool.values()) {
            safeClose(db);
        }
        pool.clear();
    }

    private SQLiteDatabase getOrOpenDatabase(String dbPath) {
        if (dbPath == null || dbPath.trim().isEmpty()) {
            throw new IllegalArgumentException("Caminho do módulo vazio.");
        }

        SQLiteDatabase existing = pool.get(dbPath);
        if (existing != null && existing.isOpen()) {
            return existing;
        }
        if (existing != null) {
            pool.remove(dbPath);
        }

        File file = new File(dbPath);
        if (!file.exists() || !file.isFile()) {
            throw new IllegalArgumentException("Arquivo não encontrado: " + dbPath);
        }
        if (!file.canRead()) {
            throw new SecurityException("Sem permissão de leitura para: " + dbPath);
        }

        evictIfNeeded();
        SQLiteDatabase opened = SQLiteDatabase.openDatabase(dbPath, null, OPEN_FLAGS);
        pool.put(dbPath, opened);
        return opened;
    }

    private void evictIfNeeded() {
        while (pool.size() >= maxConnections) {
            String oldestKey = null;
            for (String key : pool.keySet()) {
                oldestKey = key;
                break;
            }
            if (oldestKey == null) {
                break;
            }
            SQLiteDatabase oldestDb = pool.remove(oldestKey);
            safeClose(oldestDb);
        }
    }

    private void validateReadOnlySql(String sql) {
        if (sql == null || sql.trim().isEmpty()) {
            throw new IllegalArgumentException("Consulta SQL vazia.");
        }
        String trimmed = sql.trim();
        String upper = trimmed.toUpperCase(Locale.ROOT);
        boolean allowed = upper.startsWith("SELECT ")
                || upper.startsWith("SELECT\n")
                || upper.startsWith("SELECT\t")
                || upper.startsWith("PRAGMA ");

        if (!allowed) {
            throw new SecurityException("Operação bloqueada: apenas SELECT e PRAGMA são permitidos.");
        }

        int semiIndex = trimmed.indexOf(';');
        if (semiIndex >= 0 && semiIndex < trimmed.length() - 1) {
            throw new SecurityException("Operação bloqueada: múltiplas instruções SQL não são permitidas.");
        }
    }

    private void safeClose(SQLiteDatabase db) {
        if (db != null && db.isOpen()) {
            try {
                db.close();
            } catch (Exception ignored) {
            }
        }
    }
}
