package com.xiaoman.couple;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Calendar;
import java.util.concurrent.TimeUnit;

/**
 * 定期去坚果云看一眼 shared.json，发现 updatedAt 变了就发一条本地通知。
 * 没有服务器，所以只能做到“定期检查”，不是真正的推送。
 */
public class XiaomanSyncWorker extends Worker {

    public static final String PREFS = "xiaoman_notify";
    private static final String WORK_NAME = "xiaoman-sync";

    public XiaomanSyncWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean("enabled", false)) return Result.success();

        String url = prefs.getString("sharedUrl", "");
        String auth = prefs.getString("auth", "");
        if (url == null || url.isEmpty()) return Result.success();
        if (inQuietHours(prefs)) return Result.success();

        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(20000);
            if (auth != null && !auth.isEmpty()) connection.setRequestProperty("Authorization", auth);
            int status = connection.getResponseCode();
            if (status != 200) return Result.success();

            StringBuilder builder = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) builder.append(line);
            }
            JSONObject payload = new JSONObject(builder.toString());
            JSONObject data = payload.optJSONObject("data");
            if (data == null) return Result.success();
            String updatedAt = data.optString("updatedAt", "");
            String baseline = prefs.getString("baseline", "");
            String identity = prefs.getString("identity", "me");
            if (updatedAt.isEmpty() || updatedAt.equals(baseline)) return Result.success();
            if (baseline.isEmpty()) {
                prefs.edit().putString("baseline", updatedAt).apply();
                return Result.success();
            }

            Notice notice = buildNotice(data, baseline, identity);
            if (notice == null) {
                // 只有自己的改动，更新基线但不提醒
                prefs.edit().putString("baseline", updatedAt).apply();
                return Result.success();
            }
            XiaomanNotifyPlugin.show(context, "小满 · 有新动静", notice.body, notice.route);
            prefs.edit().putString("baseline", updatedAt).apply();
            return Result.success();
        } catch (Exception error) {
            // 网络不稳时不打扰，下一次周期继续
            return Result.success();
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static class Notice {
        final String body;
        final String route;

        Notice(String body, String route) {
            this.body = body;
            this.route = route;
        }
    }

    private Notice buildNotice(JSONObject data, String baseline, String identity) {
        JSONObject names = data.optJSONObject("names");
        Notice best = null;
        String bestAt = "";

        JSONArray moments = data.optJSONArray("moments");
        if (moments != null) {
            for (int index = 0; index < moments.length(); index += 1) {
                JSONObject item = moments.optJSONObject(index);
                if (item == null) continue;
                String at = item.optString("updatedAt", item.optString("date", ""));
                if (at.compareTo(baseline) <= 0) continue;
                String actor = item.optString("lastActor", "");
                if (actor.isEmpty()) actor = item.optString("author", "me");
                if (actor.equals(identity)) continue;
                if (at.compareTo(bestAt) <= 0) continue;
                bestAt = at;
                best = describeMoment(item, names, actor);
            }
        }

        JSONArray nudges = data.optJSONArray("nudges");
        if (nudges != null) {
            for (int index = 0; index < nudges.length(); index += 1) {
                JSONObject item = nudges.optJSONObject(index);
                if (item == null) continue;
                String at = item.optString("at", "");
                if (at.compareTo(baseline) <= 0) continue;
                String from = item.optString("from", "me");
                if (from.equals(identity)) continue;
                if (at.compareTo(bestAt) <= 0) continue;
                String who = names == null ? "" : names.optString(from, "");
                bestAt = at;
                best = new Notice((who.isEmpty() ? "TA" : who) + " 想你了一下，点开回一个。", "home");
            }
        }
        return best;
    }

    private Notice describeMoment(JSONObject item, JSONObject names, String actor) {
        String who = names == null ? "" : names.optString(actor, "");
        if (who.isEmpty()) who = "TA";
        String action = item.optString("lastAction", "");

        if ("comment".equals(action)) {
            String latest = "";
            String latestAt = "";
            JSONArray comments = item.optJSONArray("comments");
            if (comments != null) {
                for (int index = 0; index < comments.length(); index += 1) {
                    JSONObject comment = comments.optJSONObject(index);
                    if (comment == null) continue;
                    if (!actor.equals(comment.optString("author", ""))) continue;
                    String at = comment.optString("at", "");
                    if (at.compareTo(latestAt) > 0) {
                        latestAt = at;
                        latest = comment.optString("text", "").trim();
                    }
                }
            }
            if (!latest.isEmpty()) {
                return new Notice(who + " 评论了：" + ellipsis(latest, 50), "moments");
            }
        }

        if ("react".equals(action)) {
            JSONObject reactions = item.optJSONObject("reactions");
            String key = reactions == null ? "" : reactions.optString(actor, "");
            String emoji = "🤗";
            if ("miss".equals(key)) emoji = "🥺";
            else if ("laugh".equals(key)) emoji = "😂";
            return new Notice(who + " 回应了你的动态 " + emoji, "moments");
        }

        String text = item.optString("text", "").trim();
        if (text.isEmpty()) text = "一张照片";
        return new Notice(who + "：" + ellipsis(text, 50), "moments");
    }

    private String ellipsis(String text, int limit) {
        if (text == null) return "";
        String value = text.trim();
        return value.length() > limit ? value.substring(0, limit) + "…" : value;
    }

    private boolean inQuietHours(SharedPreferences prefs) {
        String start = prefs.getString("quietStart", "");
        String end = prefs.getString("quietEnd", "");
        int startMinute = parseMinute(start);
        int endMinute = parseMinute(end);
        if (startMinute < 0 || endMinute < 0 || startMinute == endMinute) return false;
        Calendar calendar = Calendar.getInstance();
        int now = calendar.get(Calendar.HOUR_OF_DAY) * 60 + calendar.get(Calendar.MINUTE);
        if (startMinute < endMinute) return now >= startMinute && now < endMinute;
        return now >= startMinute || now < endMinute;
    }

    private int parseMinute(String value) {
        if (value == null) return -1;
        String[] parts = value.split(":");
        if (parts.length != 2) return -1;
        try {
            int hour = Integer.parseInt(parts[0].trim());
            int minute = Integer.parseInt(parts[1].trim());
            if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return -1;
            return hour * 60 + minute;
        } catch (NumberFormatException error) {
            return -1;
        }
    }

    public static void schedule(Context context, int minutes) {
        int interval = Math.max(15, minutes);
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
            XiaomanSyncWorker.class,
            interval,
            TimeUnit.MINUTES
        ).setConstraints(constraints).build();
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            WORK_NAME,
            ExistingPeriodicWorkPolicy.UPDATE,
            request
        );
    }

    public static void cancel(Context context) {
        WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME);
    }
}
