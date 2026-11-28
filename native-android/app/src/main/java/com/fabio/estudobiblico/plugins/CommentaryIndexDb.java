package com.fabio.estudobiblico.plugins;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.database.sqlite.SQLiteStatement;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import java.io.File;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

public class CommentaryIndexDb extends SQLiteOpenHelper {

    private static final String DB_NAME = "estudo_biblico_cmt_index.db";
    private static final int DB_VERSION = 1;
    private static final int READONLY_FLAGS =
            SQLiteDatabase.OPEN_READONLY | SQLiteDatabase.NO_LOCALIZED_COLLATORS;

    private static final String[] PREFERRED_TABLES = {
            "commentary", "commentaries", "comments", "notes", "biblecommentary"
    };
    private static final String[] BOOK_COLS = {"book", "book_number", "bookid", "b"};
    private static final String[] CHAPTER_COLS = {"chapter", "chapterbegin", "fromchapter", "from_chapter", "c"};
    private static final String[] CHAPTER_END_COLS = {"chapterend", "tochapter", "to_chapter", "endchapter"};
    private static final String[] FROM_VERSE_COLS = {"fromverse", "from_verse", "verse", "beginverse", "startverse", "v"};
    private static final String[] TO_VERSE_COLS = {"toverse", "to_verse", "endverse", "verseend"};
    private static final String[] DATA_COLS = {"data", "comments", "comment", "text", "content", "body", "note"};

    private final Object writeLock = new Object();
    private final AtomicBoolean indexing = new AtomicBoolean(false);
    private final AtomicInteger indexedCount = new AtomicInteger(0);
    private final AtomicInteger totalCount = new AtomicInteger(0);

    public static class ModuleMeta {
        public final String path;
        public final long fileSize;
        public final long lastModified;

        public ModuleMeta(String path, long fileSize, long lastModified) {
            this.path = path;
            this.fileSize = fileSize;
            this.lastModified = lastModified;
        }
    }

    private static class ExistingModule {
        final long id;
        final long fileSize;
        final long lastModified;

        ExistingModule(long id, long fileSize, long lastModified) {
            this.id = id;
            this.fileSize = fileSize;
            this.lastModified = lastModified;
        }
    }

    private static class BestMatch {
        final String path;
        final int book;
        final int chapter;
        final int chapterEnd;
        final int fromVerse;
        final int toVerse;
        final int scopePri;
        final int spanSize;

        BestMatch(
                String path,
                int book,
                int chapter,
                int chapterEnd,
                int fromVerse,
                int toVerse,
                int scopePri,
                int spanSize
        ) {
            this.path = path;
            this.book = book;
            this.chapter = chapter;
            this.chapterEnd = chapterEnd;
            this.fromVerse = fromVerse;
            this.toVerse = toVerse;
            this.scopePri = scopePri;
            this.spanSize = spanSize;
        }
    }

    public CommentaryIndexDb(Context context) {
        super(context, DB_NAME, null, DB_VERSION);
    }

    @Override
    public void onConfigure(SQLiteDatabase db) {
        super.onConfigure(db);
        db.setForeignKeyConstraintsEnabled(true);
        db.enableWriteAheadLogging();
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL(
                "CREATE TABLE indexed_modules ("
                        + "id INTEGER PRIMARY KEY AUTOINCREMENT, "
                        + "path TEXT NOT NULL UNIQUE, "
                        + "file_size INTEGER NOT NULL DEFAULT 0, "
                        + "last_modified INTEGER NOT NULL DEFAULT 0, "
                        + "row_count INTEGER NOT NULL DEFAULT 0, "
                        + "status INTEGER NOT NULL DEFAULT 1"
                        + ")"
        );

        db.execSQL(
                "CREATE TABLE coverage ("
                        + "module_id INTEGER NOT NULL REFERENCES indexed_modules(id) ON DELETE CASCADE, "
                        + "book INTEGER NOT NULL, "
                        + "chapter INTEGER NOT NULL, "
                        + "chapter_end INTEGER NOT NULL, "
                        + "from_verse INTEGER NOT NULL, "
                        + "to_verse INTEGER NOT NULL, "
                        + "scope_pri INTEGER NOT NULL, "
                        + "span_size INTEGER NOT NULL"
                        + ")"
        );

        db.execSQL("CREATE INDEX idx_cov_mod ON coverage(module_id)");
        db.execSQL("CREATE INDEX idx_cov_bc ON coverage(book, chapter, from_verse, to_verse)");
        db.execSQL("CREATE INDEX idx_cov_multi ON coverage(book, chapter, chapter_end) WHERE chapter_end > chapter");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        db.execSQL("DROP TABLE IF EXISTS coverage");
        db.execSQL("DROP TABLE IF EXISTS indexed_modules");
        onCreate(db);
    }

    public boolean isIndexing() {
        return indexing.get();
    }

    public int getIndexedCount() {
        return indexedCount.get();
    }

    public int getTotalCount() {
        return totalCount.get();
    }

    public boolean isUpToDate(List<ModuleMeta> currentModules) {
        if (currentModules == null || currentModules.isEmpty()) {
            return true;
        }
        Map<String, ExistingModule> existing = loadExistingMap(getReadableDatabase());
        if (existing.size() != currentModules.size()) {
            return false;
        }
        for (ModuleMeta m : currentModules) {
            ExistingModule ex = existing.get(m.path);
            if (ex == null || ex.fileSize != m.fileSize || ex.lastModified != m.lastModified) {
                return false;
            }
        }
        return true;
    }

    public JSObject syncModules(List<ModuleMeta> currentModules) {
        long t0 = System.currentTimeMillis();
        List<ModuleMeta> safeList = currentModules != null ? currentModules : new ArrayList<>();

        synchronized (writeLock) {
            indexing.set(true);
            totalCount.set(safeList.size());
            int newlyIndexed = 0;

            try {
                SQLiteDatabase db = getWritableDatabase();
                Map<String, ExistingModule> existing = loadExistingMap(db);
                Set<String> currentPaths = new HashSet<>();
                List<ModuleMeta> toScan = new ArrayList<>();

                for (ModuleMeta mod : safeList) {
                    if (mod == null || mod.path == null || mod.path.trim().isEmpty()) continue;
                    currentPaths.add(mod.path);
                    ExistingModule ex = existing.get(mod.path);
                    if (ex == null || ex.fileSize != mod.fileSize || ex.lastModified != mod.lastModified) {
                        toScan.add(mod);
                    }
                }

                List<String> toRemove = new ArrayList<>();
                for (String oldPath : existing.keySet()) {
                    if (!currentPaths.contains(oldPath)) {
                        toRemove.add(oldPath);
                    }
                }

                if (!toRemove.isEmpty()) {
                    db.beginTransaction();
                    try {
                        for (String p : toRemove) {
                            db.delete("indexed_modules", "path = ?", new String[]{p});
                        }
                        db.setTransactionSuccessful();
                    } finally {
                        db.endTransaction();
                    }
                }

                int alreadyReady = Math.max(0, safeList.size() - toScan.size());
                indexedCount.set(alreadyReady);

                if (toScan.isEmpty()) {
                    JSObject ret = new JSObject();
                    ret.put("ready", true);
                    ret.put("indexing", false);
                    ret.put("indexedCount", safeList.size());
                    ret.put("totalCount", safeList.size());
                    ret.put("newlyIndexed", 0);
                    ret.put("elapsedMs", System.currentTimeMillis() - t0);
                    return ret;
                }

                SQLiteStatement insertCov = db.compileStatement(
                        "INSERT INTO coverage "
                                + "(module_id, book, chapter, chapter_end, from_verse, to_verse, scope_pri, span_size) "
                                + "VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
                );

                try {
                    for (ModuleMeta mod : toScan) {
                        List<int[]> rows = null;
                        int status = 1;
                        try {
                            rows = scanExternalCommentary(mod.path);
                            if (rows == null) {
                                status = 0;
                                rows = new ArrayList<>();
                            }
                        } catch (Exception ignored) {
                            status = 0;
                            rows = new ArrayList<>();
                        }

                        db.beginTransaction();
                        try {
                            db.delete("indexed_modules", "path = ?", new String[]{mod.path});

                            ContentValues cv = new ContentValues();
                            cv.put("path", mod.path);
                            cv.put("file_size", mod.fileSize);
                            cv.put("last_modified", mod.lastModified);
                            cv.put("row_count", rows.size());
                            cv.put("status", status);
                            long modId = db.insertOrThrow("indexed_modules", null, cv);

                            for (int[] r : rows) {
                                insertCov.clearBindings();
                                insertCov.bindLong(1, modId);
                                insertCov.bindLong(2, r[0]); // book
                                insertCov.bindLong(3, r[1]); // chapter
                                insertCov.bindLong(4, r[2]); // chapter_end
                                insertCov.bindLong(5, r[3]); // from_verse
                                insertCov.bindLong(6, r[4]); // to_verse
                                insertCov.bindLong(7, r[5]); // scope_pri
                                insertCov.bindLong(8, r[6]); // span_size
                                insertCov.executeInsert();
                            }

                            db.setTransactionSuccessful();
                            newlyIndexed++;
                        } finally {
                            db.endTransaction();
                        }

                        indexedCount.incrementAndGet();
                    }
                } finally {
                    insertCov.close();
                }

                JSObject ret = new JSObject();
                ret.put("ready", true);
                ret.put("indexing", false);
                ret.put("indexedCount", safeList.size());
                ret.put("totalCount", safeList.size());
                ret.put("newlyIndexed", newlyIndexed);
                ret.put("elapsedMs", System.currentTimeMillis() - t0);
                return ret;
            } finally {
                indexing.set(false);
            }
        }
    }

    public JSArray queryCoverage(int book, int chapter, int verse) {
        JSArray out = new JSArray();
        if (book <= 0 || chapter <= 0) {
            return out;
        }
        int safeVerse = Math.max(1, verse);
        String bStr = String.valueOf(book);
        String cStr = String.valueOf(chapter);
        String vStr = String.valueOf(safeVerse);

        String sql =
                "SELECT m.path, c.book, c.chapter, c.chapter_end, c.from_verse, c.to_verse, c.scope_pri, c.span_size "
                        + "FROM coverage c "
                        + "JOIN indexed_modules m ON m.id = c.module_id "
                        + "WHERE c.book = ? AND c.chapter = ? AND c.chapter_end = c.chapter "
                        + "AND (c.from_verse <= 0 OR (c.from_verse <= ? AND c.to_verse >= ?)) "
                        + "UNION ALL "
                        + "SELECT m.path, c.book, c.chapter, c.chapter_end, c.from_verse, c.to_verse, c.scope_pri, c.span_size "
                        + "FROM coverage c "
                        + "JOIN indexed_modules m ON m.id = c.module_id "
                        + "WHERE c.book = ? AND c.chapter_end > c.chapter "
                        + "AND c.chapter <= ? AND c.chapter_end >= ? "
                        + "AND ("
                        + "(c.chapter < ? AND c.chapter_end > ?) "
                        + "OR (c.chapter = ? AND (c.from_verse <= 0 OR ? >= c.from_verse)) "
                        + "OR (c.chapter_end = ? AND (c.to_verse <= 0 OR ? <= c.to_verse))"
                        + ")";

        String[] args = new String[]{
                bStr, cStr, vStr, vStr,
                bStr, cStr, cStr, cStr, cStr, cStr, vStr, cStr, vStr
        };

        Map<String, BestMatch> bestByPath = new HashMap<>();
        SQLiteDatabase db = getReadableDatabase();

        try (Cursor cur = db.rawQuery(sql, args)) {
            while (cur.moveToNext()) {
                String path = cur.getString(0);
                int b = cur.getInt(1);
                int c = cur.getInt(2);
                int cEnd = cur.getInt(3);
                int fv = cur.getInt(4);
                int tv = cur.getInt(5);
                int pri = cur.getInt(6);
                int span = cur.getInt(7);

                BestMatch prev = bestByPath.get(path);
                if (prev == null
                        || pri < prev.scopePri
                        || (pri == prev.scopePri && span < prev.spanSize)
                        || (pri == prev.scopePri && span == prev.spanSize && fv > prev.fromVerse)) {
                    bestByPath.put(path, new BestMatch(path, b, c, cEnd, fv, tv, pri, span));
                }
            }
        }

        for (BestMatch m : bestByPath.values()) {
            JSObject obj = new JSObject();
            obj.put("path", m.path);
            obj.put("book", m.book);
            obj.put("chapter", m.chapter);
            obj.put("chapterEnd", m.chapterEnd);
            obj.put("fromVerse", m.fromVerse);
            obj.put("toVerse", m.toVerse);
            out.put(obj);
        }
        return out;
    }

    private Map<String, ExistingModule> loadExistingMap(SQLiteDatabase db) {
        Map<String, ExistingModule> map = new HashMap<>();
        try (Cursor c = db.rawQuery("SELECT id, path, file_size, last_modified FROM indexed_modules", null)) {
            while (c.moveToNext()) {
                long id = c.getLong(0);
                String path = c.getString(1);
                long size = c.getLong(2);
                long mod = c.getLong(3);
                map.put(path, new ExistingModule(id, size, mod));
            }
        }
        return map;
    }

    private List<int[]> scanExternalCommentary(String modulePath) {
        File file = new File(modulePath);
        if (!file.exists() || !file.isFile() || !file.canRead()) {
            return null;
        }

        SQLiteDatabase extDb = null;
        try {
            extDb = SQLiteDatabase.openDatabase(modulePath, null, READONLY_FLAGS);
            String tableName = detectCommentaryTable(extDb);
            if (tableName == null || tableName.isEmpty()) {
                return null;
            }

            List<String> cols = readTableColumns(extDb, tableName);
            String bookCol = pickColumn(cols, BOOK_COLS);
            String chapterCol = pickColumn(cols, CHAPTER_COLS);
            String chapterEndCol = pickColumn(cols, CHAPTER_END_COLS);
            String fromVerseCol = pickColumn(cols, FROM_VERSE_COLS);
            String toVerseCol = pickColumn(cols, TO_VERSE_COLS);
            String dataCol = pickColumn(cols, DATA_COLS);

            if (bookCol == null || chapterCol == null || fromVerseCol == null || dataCol == null) {
                return null;
            }

            String qTable = quoteIdent(tableName);
            String qBook = quoteIdent(bookCol);
            String qChap = quoteIdent(chapterCol);
            String qChapEnd = chapterEndCol != null ? "CAST(COALESCE(" + quoteIdent(chapterEndCol) + ", 0) AS INTEGER)" : "0";
            String qFrom = "CAST(COALESCE(" + quoteIdent(fromVerseCol) + ", 0) AS INTEGER)";
            String qTo = toVerseCol != null ? "CAST(COALESCE(" + quoteIdent(toVerseCol) + ", 0) AS INTEGER)" : "0";

            String sql = "SELECT DISTINCT "
                    + "CAST(" + qBook + " AS INTEGER), "
                    + "CAST(COALESCE(" + qChap + ", 0) AS INTEGER), "
                    + qChapEnd + ", "
                    + qFrom + ", "
                    + qTo
                    + " FROM " + qTable
                    + " WHERE CAST(" + qBook + " AS INTEGER) > 0 AND CAST(COALESCE(" + qChap + ", 0) AS INTEGER) > 0";

            List<int[]> rows = new ArrayList<>();
            try (Cursor cur = extDb.rawQuery(sql, null)) {
                while (cur.moveToNext()) {
                    int b = cur.isNull(0) ? 0 : cur.getInt(0);
                    int c = cur.isNull(1) ? 0 : cur.getInt(1);
                    if (b <= 0 || c <= 0) continue;

                    int rawCEnd = cur.isNull(2) ? 0 : cur.getInt(2);
                    int cEnd = rawCEnd > c ? rawCEnd : c;
                    int fv = Math.max(0, cur.isNull(3) ? 0 : cur.getInt(3));
                    int rawTv = Math.max(0, cur.isNull(4) ? 0 : cur.getInt(4));

                    int tv;
                    int scopePri;
                    int spanSize;

                    if (cEnd > c) {
                        tv = rawTv;
                        scopePri = 3;
                        spanSize = (cEnd - c + 1) * 1000;
                    } else if (fv <= 0) {
                        fv = 0;
                        tv = 0;
                        scopePri = 2;
                        spanSize = 999;
                    } else {
                        tv = rawTv >= fv ? rawTv : fv;
                        if (tv > fv) {
                            scopePri = 1;
                            spanSize = tv - fv + 1;
                        } else {
                            scopePri = 0;
                            spanSize = 1;
                        }
                    }

                    rows.add(new int[]{b, c, cEnd, fv, tv, scopePri, spanSize});
                }
            }
            return rows;
        } finally {
            if (extDb != null && extDb.isOpen()) {
                try {
                    extDb.close();
                } catch (Exception ignored) {
                }
            }
        }
    }

    private String detectCommentaryTable(SQLiteDatabase db) {
        List<String> tables = new ArrayList<>();
        try (Cursor cur = db.rawQuery("SELECT name FROM sqlite_master WHERE type='table'", null)) {
            while (cur.moveToNext()) {
                String name = cur.getString(0);
                if (name != null && !name.isEmpty()) {
                    tables.add(name);
                }
            }
        }

        for (String pref : PREFERRED_TABLES) {
            for (String t : tables) {
                if (t.equalsIgnoreCase(pref)) {
                    return t;
                }
            }
        }

        for (String t : tables) {
            String low = t.toLowerCase(Locale.ROOT);
            if (!low.startsWith("details")
                    && !low.startsWith("info")
                    && !low.startsWith("sqlite_")
                    && !low.startsWith("android_metadata")
                    && !low.startsWith("books")) {
                return t;
            }
        }
        return null;
    }

    private List<String> readTableColumns(SQLiteDatabase db, String tableName) {
        List<String> cols = new ArrayList<>();
        try (Cursor cur = db.rawQuery("PRAGMA table_info(" + quoteIdent(tableName) + ")", null)) {
            int nameIdx = cur.getColumnIndex("name");
            if (nameIdx < 0) nameIdx = 1;
            while (cur.moveToNext()) {
                String col = cur.getString(nameIdx);
                if (col != null && !col.isEmpty()) {
                    cols.add(col);
                }
            }
        }
        return cols;
    }

    private String pickColumn(List<String> cols, String[] candidates) {
        for (String cand : candidates) {
            for (String col : cols) {
                if (col.equalsIgnoreCase(cand)) {
                    return col;
                }
            }
        }
        return null;
    }

    private String quoteIdent(String name) {
        return "\"" + name.replace("\"", "\"\"") + "\"";
    }
}
