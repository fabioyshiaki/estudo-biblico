package com.fabio.estudobiblico.plugins;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class MapSqliteRepository {

    private static final int BLOB_CHUNK_SIZE = 512 * 1024;
    private static final Pattern IMG_SRC_PATTERN =
        Pattern.compile("(?i)<img[^>]+src\\s*=\\s*['\"]([^'\"]+)['\"]");

    private enum VerseEncoding {
        DECIMAL_1M,
        BITSHIFT_16
    }

    private MapSqliteRepository() {
    }

    private static SQLiteDatabase openReadOnly(File file) {
        return SQLiteDatabase.openDatabase(
            file.getAbsolutePath(),
            null,
            SQLiteDatabase.OPEN_READONLY | SQLiteDatabase.NO_LOCALIZED_COLLATORS
        );
    }

    private static boolean hasTable(SQLiteDatabase db, String tableName) {
        Cursor c = null;
        try {
            c = db.rawQuery(
                "SELECT 1 FROM sqlite_master WHERE type IN ('table','view') AND name = ? COLLATE NOCASE LIMIT 1",
                new String[]{tableName}
            );
            return c.moveToFirst();
        } finally {
            if (c != null) {
                c.close();
            }
        }
    }

    public static JSObject inspectMapModule(File file) {
        SQLiteDatabase db = null;
        Cursor c = null;
        try {
            db = openReadOnly(file);
            if (!hasTable(db, "journal") || !hasTable(db, "data")) {
                return null;
            }

            JSObject meta = new JSObject();
            meta.put("path", file.getAbsolutePath());
            meta.put("fileName", file.getName());
            meta.put("sizeBytes", file.length());
            meta.put("hasMapVerse", hasTable(db, "mapverse"));
            meta.put("hasMapTable", hasTable(db, "map"));
            meta.put("hasFts", hasTable(db, "journalFTS"));

            String name = file.getName();
            String title = file.getName();
            String abbreviation = "";
            String author = "";
            String description = "";
            String attribution = "";

            if (hasTable(db, "details")) {
                c = db.rawQuery("SELECT * FROM details LIMIT 1", null);
                if (c.moveToFirst()) {
                    name = safeString(c, "name", name);
                    title = safeString(c, "title", title);
                    abbreviation = safeString(c, "abbreviation", "");
                    author = safeString(c, "author", "");
                    description = safeString(c, "description", "");
                    attribution = safeString(c, "mapattribution", "");
                }
                c.close();
                c = null;
            }

            c = db.rawQuery("SELECT COUNT(*) FROM journal WHERE COALESCE(hidden, 0) = 0", null);
            int mapCount = c.moveToFirst() ? c.getInt(0) : 0;

            meta.put("name", name);
            meta.put("title", title);
            meta.put("abbreviation", abbreviation);
            meta.put("author", author);
            meta.put("description", description);
            meta.put("attribution", attribution);
            meta.put("mapCount", mapCount);
            return meta;
        } catch (Exception ignored) {
            return null;
        } finally {
            if (c != null) {
                c.close();
            }
            if (db != null) {
                db.close();
            }
        }
    }

    public static JSArray getMapIndex(File file) {
        JSArray list = new JSArray();
        SQLiteDatabase db = null;
        Cursor c = null;
        try {
            db = openReadOnly(file);
            c = db.rawQuery(
                "SELECT rowid, id, title, tags, relativeorder FROM journal " +
                "WHERE COALESCE(hidden, 0) = 0 ORDER BY relativeorder ASC, rowid ASC",
                null
            );
            while (c.moveToNext()) {
                JSObject item = new JSObject();
                item.put("rowid", c.getInt(0));
                item.put("id", c.isNull(1) ? "" : c.getString(1));
                item.put("title", c.isNull(2) ? "" : c.getString(2));
                item.put("tags", c.isNull(3) ? "" : c.getString(3));
                list.put(item);
            }
        } catch (Exception ignored) {
        } finally {
            if (c != null) {
                c.close();
            }
            if (db != null) {
                db.close();
            }
        }
        return list;
    }

    public static Map<Integer, List<JSObject>> getChapterVerseMaps(File file, String moduleTitle, int book, int chapter) {
        Map<Integer, List<JSObject>> markers = new HashMap<>();
        SQLiteDatabase db = null;
        Cursor c = null;
        try {
            db = openReadOnly(file);
            if (!hasTable(db, "mapverse")) {
                return markers;
            }

            VerseEncoding encoding = detectVerseEncoding(db);
            int chapStart = encodeVerse(encoding, book, chapter, 1);
            int chapEnd = encodeVerse(encoding, book, chapter, 200);

            String sql =
                "SELECT mv.id, CAST(mv.versefrom AS INTEGER), CAST(mv.verseto AS INTEGER), j.rowid, j.title " +
                "FROM mapverse mv " +
                "LEFT JOIN journal j ON (j.id = mv.id COLLATE NOCASE OR j.title = mv.id COLLATE NOCASE OR CAST(j.rowid AS TEXT) = mv.id) " +
                "WHERE CAST(mv.versefrom AS INTEGER) <= " + chapEnd + " " +
                "AND CAST(mv.verseto AS INTEGER) >= " + chapStart + " " +
                "ORDER BY CAST(mv.versefrom AS INTEGER) ASC";

            c = db.rawQuery(sql, null);
            while (c.moveToNext()) {
                String mapId = c.isNull(0) ? "" : c.getString(0);
                int vFrom = c.getInt(1);
                int vTo = c.getInt(2);
                int rowId = c.isNull(3) ? -1 : c.getInt(3);
                String mapTitle = c.isNull(4) ? mapId : c.getString(4);

                int startV = extractStartVerseInChapter(encoding, vFrom, book, chapter);
                int endV = extractEndVerseInChapter(encoding, vTo, book, chapter);

                for (int v = startV; v <= endV; v++) {
                    List<JSObject> list = markers.get(v);
                    if (list == null) {
                        list = new ArrayList<>();
                        markers.put(v, list);
                    }
                    if (!containsMap(list, file.getAbsolutePath(), mapId)) {
                        JSObject ref = new JSObject();
                        ref.put("id", mapId);
                        ref.put("rowid", rowId);
                        ref.put("title", mapTitle);
                        ref.put("modulePath", file.getAbsolutePath());
                        ref.put("moduleTitle", moduleTitle);
                        ref.put("sourceType", "mapverse");
                        list.add(ref);
                    }
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (c != null) {
                c.close();
            }
            if (db != null) {
                db.close();
            }
        }
        return markers;
    }

    public static JSObject getMapEntry(Context context, File file, String id, int rowId, String title) {
        SQLiteDatabase db = null;
        Cursor c = null;
        try {
            db = openReadOnly(file);

            if (rowId > 0) {
                c = db.rawQuery(
                    "SELECT rowid, id, title, content FROM journal WHERE rowid = " + rowId + " LIMIT 1",
                    null
                );
            } else if (id != null && !id.isEmpty()) {
                c = db.rawQuery(
                    "SELECT rowid, id, title, content FROM journal WHERE id = ? COLLATE NOCASE LIMIT 1",
                    new String[]{id}
                );
            } else if (title != null && !title.isEmpty()) {
                c = db.rawQuery(
                    "SELECT rowid, id, title, content FROM journal WHERE title = ? COLLATE NOCASE LIMIT 1",
                    new String[]{title}
                );
            }

            if ((c == null || !c.moveToFirst()) && id != null && !id.isEmpty()) {
                if (c != null) {
                    c.close();
                }
                c = db.rawQuery(
                    "SELECT rowid, id, title, content FROM journal WHERE title = ? COLLATE NOCASE LIMIT 1",
                    new String[]{id}
                );
            }

            if (c == null || !c.moveToFirst()) {
                return null;
            }

            JSObject entry = new JSObject();
            int foundRowId = c.getInt(0);
            String foundId = c.isNull(1) ? "" : c.getString(1);
            String foundTitle = c.isNull(2) ? "" : c.getString(2);
            String htmlContent = c.isNull(3) ? "" : c.getString(3);

            entry.put("rowid", foundRowId);
            entry.put("id", foundId);
            entry.put("title", foundTitle);
            entry.put("content", htmlContent);
            entry.put("modulePath", file.getAbsolutePath());

            JSArray images = new JSArray();
            Set<String> seen = new HashSet<>();
            Matcher matcher = IMG_SRC_PATTERN.matcher(htmlContent);
            while (matcher.find()) {
                String src = matcher.group(1);
                if (src != null && seen.add(src.toLowerCase(Locale.ROOT))) {
                    JSObject imgObj = extractImageBlobToCache(context, db, file, src);
                    if (imgObj != null) {
                        images.put(imgObj);
                    }
                }
            }
            entry.put("images", images);
            return entry;
        } catch (Exception ignored) {
            return null;
        } finally {
            if (c != null) {
                c.close();
            }
            if (db != null) {
                db.close();
            }
        }
    }

    public static JSArray searchMaps(File file, String moduleTitle, String query, int limit) {
        JSArray results = new JSArray();
        SQLiteDatabase db = null;
        Cursor c = null;
        try {
            db = openReadOnly(file);
            if (!hasTable(db, "journal")) {
                return results;
            }

            int safeLimit = Math.max(1, Math.min(limit, 100));
            String likeParam = "%" + query.trim() + "%";
            c = db.rawQuery(
                "SELECT rowid, id, title FROM journal " +
                "WHERE COALESCE(hidden, 0) = 0 AND (title LIKE ? OR tags LIKE ? OR content LIKE ?) " +
                "ORDER BY CASE WHEN title LIKE ? THEN 0 ELSE 1 END, relativeorder ASC LIMIT " + safeLimit,
                new String[]{likeParam, likeParam, likeParam, likeParam}
            );
            while (c.moveToNext()) {
                JSObject item = new JSObject();
                item.put("rowid", c.getInt(0));
                item.put("id", c.isNull(1) ? "" : c.getString(1));
                item.put("title", c.isNull(2) ? "" : c.getString(2));
                item.put("modulePath", file.getAbsolutePath());
                item.put("moduleTitle", moduleTitle);
                results.put(item);
            }
        } catch (Exception ignored) {
        } finally {
            if (c != null) {
                c.close();
            }
            if (db != null) {
                db.close();
            }
        }
        return results;
    }

    private static JSObject extractImageBlobToCache(Context context, SQLiteDatabase db, File moduleFile, String imgName) {
        Cursor c = null;
        try {
            c = db.rawQuery(
                "SELECT rowid, filename, length(content) FROM data " +
                "WHERE id = ? COLLATE NOCASE OR filename = ? COLLATE NOCASE OR description = ? COLLATE NOCASE LIMIT 1",
                new String[]{imgName, imgName, imgName}
            );
            if (!c.moveToFirst()) {
                return null;
            }

            long dataRowId = c.getLong(0);
            String dbFileName = c.isNull(1) ? imgName : c.getString(1);
            long blobSize = c.isNull(2) ? 0 : c.getLong(2);
            c.close();
            c = null;

            if (blobSize <= 0) {
                return null;
            }

            String moduleHash = shortHash(moduleFile.getAbsolutePath() + "_" + moduleFile.lastModified());
            File cacheDir = new File(new File(context.getCacheDir(), "map_cache"), moduleHash);
            if (!cacheDir.exists()) {
                cacheDir.mkdirs();
            }

            String safeFileName = dbFileName.replaceAll("[^a-zA-Z0-9._-]", "_");
            File outFile = new File(cacheDir, safeFileName);

            if (!outFile.exists() || outFile.length() != blobSize) {
                boolean written = writeBlobChunkedToFile(db, dataRowId, blobSize, outFile);
                if (!written) {
                    return null;
                }
            }

            JSObject obj = new JSObject();
            obj.put("src", imgName);
            obj.put("fileName", dbFileName);
            obj.put("filePath", outFile.getAbsolutePath());
            obj.put("mimeType", detectMimeTypeFromFile(outFile, dbFileName));
            obj.put("sizeBytes", blobSize);
            return obj;
        } catch (Exception ignored) {
            return null;
        } finally {
            if (c != null) {
                c.close();
            }
        }
    }

    private static boolean writeBlobChunkedToFile(SQLiteDatabase db, long dataRowId, long totalSize, File outFile) {
        File tmpFile = new File(outFile.getAbsolutePath() + ".tmp");
        try (FileOutputStream fos = new FileOutputStream(tmpFile)) {
            long offset = 1;
            while (offset <= totalSize) {
                long remaining = totalSize - offset + 1;
                long chunkLen = Math.min(BLOB_CHUNK_SIZE, remaining);
                Cursor chunkCursor = null;
                try {
                    chunkCursor = db.rawQuery(
                        "SELECT substr(content, " + offset + ", " + chunkLen + ") FROM data WHERE rowid = " + dataRowId + " LIMIT 1",
                        null
                    );
                    if (!chunkCursor.moveToFirst() || chunkCursor.isNull(0)) {
                        return false;
                    }
                    byte[] bytes = chunkCursor.getBlob(0);
                    if (bytes == null || bytes.length == 0) {
                        return false;
                    }
                    fos.write(bytes);
                    offset += bytes.length;
                } finally {
                    if (chunkCursor != null) {
                        chunkCursor.close();
                    }
                }
            }
            fos.flush();
        } catch (Exception e) {
            tmpFile.delete();
            return false;
        }

        if (outFile.exists()) {
            outFile.delete();
        }
        return tmpFile.renameTo(outFile);
    }

    private static VerseEncoding detectVerseEncoding(SQLiteDatabase db) {
        Cursor c = null;
        try {
            c = db.rawQuery("SELECT CAST(versefrom AS INTEGER) FROM mapverse WHERE CAST(versefrom AS INTEGER) > 0 LIMIT 20", null);
            int decValid = 0;
            int bitValid = 0;
            while (c.moveToNext()) {
                int val = c.getInt(0);
                int dbBook = val / 1_000_000;
                int dbChap = (val / 1_000) % 1_000;
                int dbVerse = val % 1_000;
                if (dbBook >= 1 && dbBook <= 66 && dbChap >= 1 && dbChap <= 150 && dbVerse >= 1 && dbVerse <= 176) {
                    decValid++;
                }

                int bsBook = (val >> 16) & 0xFF;
                int bsChap = (val >> 8) & 0xFF;
                int bsVerse = val & 0xFF;
                if (val < 4_500_000 && bsBook >= 1 && bsBook <= 66 && bsChap >= 1 && bsChap <= 150 && bsVerse >= 1 && bsVerse <= 176) {
                    bitValid++;
                }
            }
            if (bitValid > decValid) {
                return VerseEncoding.BITSHIFT_16;
            }
        } catch (Exception ignored) {
        } finally {
            if (c != null) {
                c.close();
            }
        }
        return VerseEncoding.DECIMAL_1M;
    }

    private static int encodeVerse(VerseEncoding encoding, int book, int chapter, int verse) {
        if (encoding == VerseEncoding.BITSHIFT_16) {
            return (book << 16) | (chapter << 8) | verse;
        }
        return (book * 1_000_000) + (chapter * 1_000) + verse;
    }

    private static int extractStartVerseInChapter(VerseEncoding enc, int encodedFrom, int book, int chapter) {
        int b = (enc == VerseEncoding.BITSHIFT_16) ? ((encodedFrom >> 16) & 0xFF) : (encodedFrom / 1_000_000);
        int c = (enc == VerseEncoding.BITSHIFT_16) ? ((encodedFrom >> 8) & 0xFF) : ((encodedFrom / 1_000) % 1_000);
        int v = (enc == VerseEncoding.BITSHIFT_16) ? (encodedFrom & 0xFF) : (encodedFrom % 1_000);
        if (b < book || (b == book && c < chapter)) {
            return 1;
        }
        return Math.max(1, Math.min(176, v));
    }

    private static int extractEndVerseInChapter(VerseEncoding enc, int encodedTo, int book, int chapter) {
        int b = (enc == VerseEncoding.BITSHIFT_16) ? ((encodedTo >> 16) & 0xFF) : (encodedTo / 1_000_000);
        int c = (enc == VerseEncoding.BITSHIFT_16) ? ((encodedTo >> 8) & 0xFF) : ((encodedTo / 1_000) % 1_000);
        int v = (enc == VerseEncoding.BITSHIFT_16) ? (encodedTo & 0xFF) : (encodedTo % 1_000);
        if (b > book || (b == book && c > chapter)) {
            return 176;
        }
        return Math.max(1, Math.min(176, v));
    }

    private static boolean containsMap(List<JSObject> list, String path, String mapId) {
        for (JSObject item : list) {
            if (path.equals(item.getString("modulePath")) && mapId.equalsIgnoreCase(item.getString("id"))) {
                return true;
            }
        }
        return false;
    }

    private static String detectMimeTypeFromFile(File file, String fileName) {
        byte[] header = new byte[4];
        try (FileInputStream fis = new FileInputStream(file)) {
            int read = fis.read(header);
            if (read >= 4) {
                int b0 = header[0] & 0xFF;
                int b1 = header[1] & 0xFF;
                int b2 = header[2] & 0xFF;
                int b3 = header[3] & 0xFF;
                if (b0 == 0xFF && b1 == 0xD8) return "image/jpeg";
                if (b0 == 0x89 && b1 == 0x50 && b2 == 0x4E && b3 == 0x47) return "image/png";
                if (b0 == 0x42 && b1 == 0x4D) return "image/bmp";
                if (b0 == 0x47 && b1 == 0x49 && b2 == 0x46) return "image/gif";
                if (b0 == 0x52 && b1 == 0x49 && b2 == 0x46 && b3 == 0x46) return "image/webp";
            }
        } catch (Exception ignored) {
        }
        String lower = fileName.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".bmp")) return "image/bmp";
        if (lower.endsWith(".gif")) return "image/gif";
        return "image/jpeg";
    }

    private static String safeString(Cursor c, String colName, String fallback) {
        int idx = c.getColumnIndex(colName);
        if (idx < 0 || c.isNull(idx)) {
            return fallback;
        }
        String val = c.getString(idx);
        return (val == null || val.trim().isEmpty()) ? fallback : val.trim();
    }

    private static String shortHash(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] digest = md.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 6; i++) {
                sb.append(String.format(Locale.ROOT, "%02x", digest[i]));
            }
            return sb.toString();
        } catch (Exception e) {
            return String.valueOf(Math.abs(input.hashCode()));
        }
    }
}
