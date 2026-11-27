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
    private static final Pattern MAP_KEYWORD_PATTERN =
        Pattern.compile("(?i)(?:^|[^a-z])(map|maps|mapa|mapas|atlas|rumsey|mcnally|geograf|cartograf|terra\\s*santa|holy\\s*land|palestin)");
    private static final Pattern PHOTO_KEYWORD_PATTERN =
        Pattern.compile("(?i)(?:^|[^a-z])(photo|photos|foto|fotos|picture|pictures|image|images|imagem|imagens|illustrat|ilustra|gallery|galeria|drawing|drawings|desenho|desenhos|painting|pintura|archaeolog|arqueolog|artifact|artefat|panorama|scenery|dore|doré|chart|charts|diagram|diagrama|infograf)");
    private static final Pattern DOUBLE_PATTERN =
        Pattern.compile("-?\\d+(?:\\.\\d+)?");

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

    private static int countRows(SQLiteDatabase db, String sql) {
        Cursor c = null;
        try {
            c = db.rawQuery(sql, null);
            return c.moveToFirst() ? c.getInt(0) : 0;
        } catch (Exception ignored) {
            return 0;
        } finally {
            if (c != null) {
                c.close();
            }
        }
    }

    /**
     * Classifica módulos visuais SQLite em:
     * - "map": atlas/mapas cartográficos (com tabela `map`, `mapattribution` ou metadados de atlas sem serem fotos).
     * - "photo": acervos de fotos, ilustrações, gravuras, diagramas ou gráficos bíblicos.
     * Rejeita livros comuns (.bok.mybible) sem imagens reais em `data`.
     */
    public static JSObject inspectMapModule(File file) {
        SQLiteDatabase db = null;
        Cursor c = null;
        try {
            db = openReadOnly(file);
            if (!hasTable(db, "journal") || !hasTable(db, "data")) {
                return null;
            }

            int dataImageCount = countRows(db, "SELECT COUNT(*) FROM data WHERE content IS NOT NULL AND length(content) > 0");
            if (dataImageCount <= 0) {
                return null;
            }

            boolean hasMapTable = hasTable(db, "map");
            int mapTableRows = hasMapTable ? countRows(db, "SELECT COUNT(*) FROM map") : 0;
            boolean hasMapVerse = hasTable(db, "mapverse");
            int mapVerseRows = hasMapVerse ? countRows(db, "SELECT COUNT(*) FROM mapverse") : 0;

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

            int journalCount = countRows(db, "SELECT COUNT(*) FROM journal WHERE COALESCE(hidden, 0) = 0");
            int imgJournalCount = countRows(
                db,
                "SELECT COUNT(*) FROM journal WHERE COALESCE(hidden, 0) = 0 AND content LIKE '%<img%'"
            );

            String primaryBag = file.getName() + " " + name + " " + title + " " + abbreviation;
            String fullBag = primaryBag + " " + description;

            boolean matchesPhotoPrimary = PHOTO_KEYWORD_PATTERN.matcher(primaryBag).find();
            boolean matchesPhotoFull = matchesPhotoPrimary || PHOTO_KEYWORD_PATTERN.matcher(fullBag).find();
            boolean matchesMapKeyword = MAP_KEYWORD_PATTERN.matcher(fullBag).find();
            boolean mostlyImages = imgJournalCount >= 3 || (journalCount > 0 && imgJournalCount * 2 >= journalCount);

            String moduleKind = null;

            // 1. Foto / Ilustração tem prioridade quando não existe tabela georreferenciada `map`
            if (matchesPhotoPrimary && mapTableRows == 0) {
                moduleKind = "photo";
            } else if (mapTableRows > 0) {
                moduleKind = "map";
            } else if (matchesPhotoFull && imgJournalCount > 0 && attribution.isEmpty()) {
                moduleKind = "photo";
            } else if (mapVerseRows > 0 || !attribution.isEmpty()) {
                moduleKind = "map";
            } else if (matchesMapKeyword && mostlyImages) {
                moduleKind = "map";
            } else if (imgJournalCount >= 3 && journalCount > 0 && imgJournalCount * 2 >= journalCount) {
                // Acervos majoritariamente visuais sem palavra-chave explícita entram em Fotos e Ilustrações
                moduleKind = "photo";
            }

            if (moduleKind == null) {
                return null;
            }

            JSObject meta = new JSObject();
            meta.put("path", file.getAbsolutePath());
            meta.put("fileName", file.getName());
            meta.put("sizeBytes", file.length());
            meta.put("moduleKind", moduleKind);
            meta.put("hasMapVerse", mapVerseRows > 0);
            meta.put("hasMapTable", mapTableRows > 0);
            meta.put("hasGeoBounds", mapTableRows > 0);
            meta.put("hasFts", hasTable(db, "journalFTS"));
            meta.put("name", name);
            meta.put("title", title);
            meta.put("abbreviation", abbreviation);
            meta.put("author", author);
            meta.put("description", description);
            meta.put("attribution", attribution);
            meta.put("mapCount", imgJournalCount > 0 ? imgJournalCount : journalCount);
            meta.put("imageCount", dataImageCount);
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
            boolean hasMapTable = hasTable(db, "map") && countRows(db, "SELECT COUNT(*) FROM map") > 0;

            if (hasMapTable) {
                c = db.rawQuery(
                    "SELECT rowid, id, title, tags, content FROM journal " +
                    "WHERE COALESCE(hidden, 0) = 0 ORDER BY relativeorder ASC, rowid ASC",
                    null
                );
                while (c.moveToNext()) {
                    int rowId = c.getInt(0);
                    String id = c.isNull(1) ? "" : c.getString(1);
                    String title = c.isNull(2) ? "" : c.getString(2);
                    String tags = c.isNull(3) ? "" : c.getString(3);
                    String content = c.isNull(4) ? "" : c.getString(4);

                    String firstImg = "";
                    Matcher m = IMG_SRC_PATTERN.matcher(content);
                    if (m.find() && m.group(1) != null) {
                        firstImg = m.group(1);
                    }

                    JSObject item = new JSObject();
                    item.put("rowid", rowId);
                    item.put("id", id);
                    item.put("title", title);
                    item.put("tags", tags);
                    item.put("hasImage", !firstImg.isEmpty());
                    item.put("primaryImage", firstImg);

                    if (!firstImg.isEmpty()) {
                        JSObject geo = findGeoOverlayForEntry(db, rowId, id, title, firstImg);
                        if (geo != null && geo.has("bounds")) {
                            item.put("bounds", geo.optJSONObject("bounds"));
                        }
                    }
                    list.put(item);
                }
            } else {
                // Caminho leve para módulos sem tabela `map` (ex.: 2.030 fotos) sem carregar HTML completo
                c = db.rawQuery(
                    "SELECT rowid, id, title, tags, CASE WHEN content LIKE '%<img%' THEN 1 ELSE 0 END " +
                    "FROM journal WHERE COALESCE(hidden, 0) = 0 ORDER BY relativeorder ASC, rowid ASC",
                    null
                );
                while (c.moveToNext()) {
                    JSObject item = new JSObject();
                    item.put("rowid", c.getInt(0));
                    item.put("id", c.isNull(1) ? "" : c.getString(1));
                    item.put("title", c.isNull(2) ? "" : c.getString(2));
                    item.put("tags", c.isNull(3) ? "" : c.getString(3));
                    item.put("hasImage", c.getInt(4) == 1);
                    list.put(item);
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
        return list;
    }

    public static Map<Integer, List<JSObject>> getChapterVerseMaps(
            File file,
            String moduleTitle,
            String moduleKind,
            int book,
            int chapter
    ) {
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
                        ref.put("moduleKind", moduleKind);
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
            c.close();
            c = null;

            String attribution = "";
            if (hasTable(db, "details")) {
                c = db.rawQuery("SELECT * FROM details LIMIT 1", null);
                if (c.moveToFirst()) {
                    attribution = safeString(c, "mapattribution", "");
                }
                c.close();
                c = null;
            }

            entry.put("rowid", foundRowId);
            entry.put("id", foundId);
            entry.put("title", foundTitle);
            entry.put("content", htmlContent);
            entry.put("modulePath", file.getAbsolutePath());
            entry.put("attribution", attribution);

            JSArray images = new JSArray();
            Set<String> seen = new HashSet<>();
            String firstImgSrc = "";
            Matcher matcher = IMG_SRC_PATTERN.matcher(htmlContent);
            while (matcher.find()) {
                String src = matcher.group(1);
                if (src != null && seen.add(src.toLowerCase(Locale.ROOT))) {
                    if (firstImgSrc.isEmpty()) {
                        firstImgSrc = src;
                    }
                    JSObject imgObj = extractImageBlobToCache(context, db, file, src);
                    if (imgObj != null) {
                        images.put(imgObj);
                    }
                }
            }
            entry.put("images", images);

            if (hasTable(db, "map")) {
                JSObject geo = findGeoOverlayForEntry(db, foundRowId, foundId, foundTitle, firstImgSrc);
                if (geo != null) {
                    if (geo.has("bounds")) {
                        entry.put("bounds", geo.optJSONObject("bounds"));
                    }
                    if (geo.has("rawMapMeta")) {
                        entry.put("rawMapMeta", geo.optJSONObject("rawMapMeta"));
                    }
                }
            }

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

    public static JSArray searchMaps(
            File file,
            String moduleTitle,
            String moduleKind,
            String query,
            int limit
    ) {
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
                "WHERE COALESCE(hidden, 0) = 0 AND content LIKE '%<img%' " +
                "AND (title LIKE ? OR tags LIKE ? OR content LIKE ?) " +
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
                item.put("moduleKind", moduleKind);
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

    private static JSObject findGeoOverlayForEntry(
            SQLiteDatabase db,
            int journalRowId,
            String journalId,
            String journalTitle,
            String imgSrc
    ) {
        Cursor c = null;
        try {
            c = db.rawQuery("SELECT rowid AS _mr, * FROM map", null);
            String[] cols = c.getColumnNames();

            String imgBase = imgSrc != null ? imgSrc.replaceAll("\\.[a-zA-Z0-9]+$", "") : "";
            Set<String> matchKeys = new HashSet<>();
            if (journalId != null && !journalId.trim().isEmpty()) {
                matchKeys.add(journalId.trim().toLowerCase(Locale.ROOT));
            }
            if (journalTitle != null && !journalTitle.trim().isEmpty()) {
                matchKeys.add(journalTitle.trim().toLowerCase(Locale.ROOT));
            }
            if (imgSrc != null && !imgSrc.trim().isEmpty()) {
                matchKeys.add(imgSrc.trim().toLowerCase(Locale.ROOT));
            }
            if (!imgBase.isEmpty()) {
                matchKeys.add(imgBase.trim().toLowerCase(Locale.ROOT));
            }

            JSObject bestBounds = null;
            JSObject bestRawMeta = null;
            int bestPriority = -1;

            while (c.moveToNext()) {
                int priority = scoreMapRowMatch(c, cols, journalRowId, matchKeys, imgBase);
                if (priority <= bestPriority) {
                    continue;
                }

                JSObject bounds = parseBoundsFromCursor(c, cols);
                if (bounds != null) {
                    bestPriority = priority;
                    bestBounds = bounds;
                    bestRawMeta = collectLightRowMeta(c, cols);
                    if (priority >= 100) {
                        break;
                    }
                }
            }

            if (bestBounds == null) {
                return null;
            }
            JSObject out = new JSObject();
            out.put("bounds", bestBounds);
            if (bestRawMeta != null) {
                out.put("rawMapMeta", bestRawMeta);
            }
            return out;
        } catch (Exception ignored) {
            return null;
        } finally {
            if (c != null) {
                c.close();
            }
        }
    }

    private static int scoreMapRowMatch(
            Cursor c,
            String[] cols,
            int journalRowId,
            Set<String> matchKeys,
            String imgBase
    ) {
        int score = -1;
        for (int i = 0; i < cols.length; i++) {
            String col = cols[i].toLowerCase(Locale.ROOT);
            if (c.isNull(i)) {
                continue;
            }
            int type = c.getType(i);
            if (type == Cursor.FIELD_TYPE_BLOB) {
                continue;
            }

            String val = String.valueOf(type == Cursor.FIELD_TYPE_INTEGER ? c.getLong(i) : c.getString(i)).trim();
            if (val.isEmpty()) {
                continue;
            }
            String lowerVal = val.toLowerCase(Locale.ROOT);

            if (col.equals("id") || col.equals("journalid") || col.equals("journal_id")
                    || col.equals("dataid") || col.equals("data_id") || col.equals("filename")
                    || col.equals("image") || col.equals("img") || col.equals("name") || col.equals("title")) {
                if (matchKeys.contains(lowerVal)) {
                    score = Math.max(score, 100);
                } else if (journalRowId > 0 && val.equals(String.valueOf(journalRowId))) {
                    score = Math.max(score, 85);
                } else if (!imgBase.isEmpty() && lowerVal.equals(imgBase.toLowerCase(Locale.ROOT))) {
                    score = Math.max(score, 90);
                }
            } else if (col.equals("_mr") && journalRowId > 0 && c.getInt(i) == journalRowId) {
                score = Math.max(score, 40);
            }
        }
        return score;
    }

    private static JSObject parseBoundsFromCursor(Cursor c, String[] cols) {
        Map<String, Double> numMap = new HashMap<>();
        String boundsStr = "";

        for (int i = 0; i < cols.length; i++) {
            if (c.isNull(i)) {
                continue;
            }
            int type = c.getType(i);
            if (type == Cursor.FIELD_TYPE_BLOB) {
                continue;
            }
            String col = cols[i].toLowerCase(Locale.ROOT);
            if (type == Cursor.FIELD_TYPE_FLOAT || type == Cursor.FIELD_TYPE_INTEGER) {
                numMap.put(col, c.getDouble(i));
            } else if (type == Cursor.FIELD_TYPE_STRING) {
                String s = c.getString(i);
                if (s == null) {
                    continue;
                }
                s = s.trim();
                if (col.contains("bound") || col.contains("bbox") || col.contains("coord") || col.contains("extent")) {
                    boundsStr = s;
                } else {
                    try {
                        numMap.put(col, Double.parseDouble(s));
                    } catch (NumberFormatException ignored) {
                    }
                }
            }
        }

        Double south = pickDouble(numMap, "south", "lat_s", "latsouth", "minlat", "min_lat", "latmin", "swlat", "sw_lat", "bottom", "lat1", "y1", "ymin", "miny", "s");
        Double north = pickDouble(numMap, "north", "lat_n", "latnorth", "maxlat", "max_lat", "latmax", "nelat", "ne_lat", "top", "lat2", "y2", "ymax", "maxy", "n");
        Double west = pickDouble(numMap, "west", "lon_w", "lng_w", "lonwest", "lngwest", "minlon", "min_lon", "minlng", "min_lng", "lonmin", "lngmin", "swlon", "swlng", "sw_lon", "sw_lng", "left", "lon1", "lng1", "x1", "xmin", "minx", "w");
        Double east = pickDouble(numMap, "east", "lon_e", "lng_e", "loneast", "lngeast", "maxlon", "max_lon", "maxlng", "max_lng", "lonmax", "lngmax", "nelon", "nelng", "ne_lon", "ne_lng", "right", "lon2", "lng2", "x2", "xmax", "maxx", "e");

        if (south != null && north != null && west != null && east != null) {
            return buildValidatedBounds(south, west, north, east);
        }

        if (!boundsStr.isEmpty()) {
            List<Double> nums = new ArrayList<>();
            Matcher m = DOUBLE_PATTERN.matcher(boundsStr);
            while (m.find() && nums.size() < 4) {
                try {
                    nums.add(Double.parseDouble(m.group()));
                } catch (NumberFormatException ignored) {
                }
            }
            if (nums.size() == 4) {
                return buildValidatedBounds(nums.get(0), nums.get(1), nums.get(2), nums.get(3));
            }
        }

        return null;
    }

    private static JSObject buildValidatedBounds(double latA, double lngA, double latB, double lngB) {
        double south = Math.min(latA, latB);
        double north = Math.max(latA, latB);
        double west = Math.min(lngA, lngB);
        double east = Math.max(lngA, lngB);

        if (south < -90.0 || north > 90.0 || west < -180.0 || east > 180.0) {
            return null;
        }
        if ((north - south) < 0.0005 || (east - west) < 0.0005) {
            return null;
        }

        JSObject b = new JSObject();
        b.put("south", south);
        b.put("west", west);
        b.put("north", north);
        b.put("east", east);
        return b;
    }

    private static Double pickDouble(Map<String, Double> map, String... keys) {
        for (String k : keys) {
            if (map.containsKey(k)) {
                return map.get(k);
            }
        }
        return null;
    }

    private static JSObject collectLightRowMeta(Cursor c, String[] cols) {
        JSObject obj = new JSObject();
        for (int i = 0; i < cols.length; i++) {
            if (c.isNull(i) || c.getType(i) == Cursor.FIELD_TYPE_BLOB) {
                continue;
            }
            String col = cols[i];
            if ("_mr".equals(col)) {
                continue;
            }
            if (c.getType(i) == Cursor.FIELD_TYPE_FLOAT) {
                obj.put(col, c.getDouble(i));
            } else if (c.getType(i) == Cursor.FIELD_TYPE_INTEGER) {
                obj.put(col, c.getLong(i));
            } else {
                String val = c.getString(i);
                if (val != null && val.length() <= 160) {
                    obj.put(col, val);
                }
            }
        }
        return obj;
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
