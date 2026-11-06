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
            if (updatedAt.isEmpty() || updatedAt.equals(baseline)) return Result.success();

            String body = buildBody(data);
            XiaomanNotifyPlugin.show(context, "小满 · 有新动静", body, "moments");
            prefs.edit().putString("baseline", updatedAt).apply();
            return Result.success();
        } catch (Exception error) {
            // 网络不稳时不打扰，下一次周期继续
            return Result.success();
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private String buildBody(JSONObject data) {
        try {
            JSONObject names = data.optJSONObject("names");
            JSONArray moments = data.optJSONArray("moments");
            if (moments != null && moments.length() > 0) {
                JSONObject newest = null;
                for (int index = 0; index < moments.length(); index += 1) {
                    JSONObject item = moments.optJSONObject(index);
                    if (item == null) continue;
                    if (newest == null || item.optString("date").compareTo(newest.optString("date")) > 0) {
                        newest = item;
                    }
                }
                if (newest != null) {
                    String text = newest.optString("text", "").trim();
                    String author = newest.optString("author", "me");
                    String who = names == null ? "" : names.optString(author, "");
                    if (text.length() > 40) text = text.substring(0, 40) + "…";
                    if (!text.isEmpty()) {
                        return (who.isEmpty() ? "TA" : who) + "：" + text;
                    }
                }
            }
        } catch (Exception ignored) {
            // 落到默认文案
        }
        return "TA 刚刚更新了小满，点开看看。";
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
