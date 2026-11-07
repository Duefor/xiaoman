package com.xiaoman.couple;

import android.content.Context;
import android.content.SharedPreferences;
import android.text.TextUtils;

import androidx.annotation.NonNull;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

/**
 * 每天早上去看一眼纪念日，提前 7 / 3 / 1 天和当天发一条本地通知。
 * 纪念日列表由 JS 在保存/同步后写进 SharedPreferences。
 */
public class XiaomanReminderWorker extends Worker {

    private static final String WORK_NAME = "xiaoman-reminders";
    private static final int[] REMIND_DAYS = {7, 3, 1, 0};

    public XiaomanReminderWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        SharedPreferences prefs = context.getSharedPreferences(XiaomanSyncWorker.PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean("reminderEnabled", false)) return Result.success();

        Calendar today = startOfToday();
        String todayKey = dateKey(today);
        if (todayKey.equals(prefs.getString("lastReminderDay", ""))) return Result.success();

        List<String> messages = new ArrayList<>();
        try {
            JSONArray items = new JSONArray(prefs.getString("reminderItems", "[]"));
            for (int index = 0; index < items.length(); index += 1) {
                JSONObject item = items.optJSONObject(index);
                if (item == null) continue;
                String title = item.optString("title", "").trim();
                if (title.isEmpty()) continue;
                Calendar target = parseDate(item.optString("date", ""));
                if (target == null) continue;

                Calendar occurrence = (Calendar) target.clone();
                if (item.optBoolean("recurring", false)) {
                    occurrence.set(Calendar.YEAR, today.get(Calendar.YEAR));
                    if (occurrence.before(today)) occurrence.add(Calendar.YEAR, 1);
                }
                int days = daysBetween(today, occurrence);
                String label = null;
                if (days == 0) label = "今天";
                else if (days == 1) label = "明天";
                else if (days == 3) label = "3 天后";
                else if (days == 7) label = "一周后";
                if (label != null) messages.add(label + " · " + title);
            }
        } catch (Exception ignored) {
            // 数据坏了就不打扰
        }

        if (!messages.isEmpty()) {
            XiaomanNotifyPlugin.showReminder(context, "纪念日提醒", TextUtils.join("；", messages));
            prefs.edit().putString("lastReminderDay", todayKey).apply();
        }
        return Result.success();
    }

    private Calendar startOfToday() {
        Calendar calendar = Calendar.getInstance();
        calendar.set(Calendar.HOUR_OF_DAY, 0);
        calendar.set(Calendar.MINUTE, 0);
        calendar.set(Calendar.SECOND, 0);
        calendar.set(Calendar.MILLISECOND, 0);
        return calendar;
    }

    private Calendar parseDate(String value) {
        try {
            SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
            format.setLenient(false);
            Date date = format.parse(value);
            if (date == null) return null;
            Calendar calendar = Calendar.getInstance();
            calendar.setTime(date);
            calendar.set(Calendar.HOUR_OF_DAY, 0);
            calendar.set(Calendar.MINUTE, 0);
            calendar.set(Calendar.SECOND, 0);
            calendar.set(Calendar.MILLISECOND, 0);
            return calendar;
        } catch (Exception error) {
            return null;
        }
    }

    private int daysBetween(Calendar from, Calendar to) {
        long diff = to.getTimeInMillis() - from.getTimeInMillis();
        return (int) Math.round(diff / 86400000.0);
    }

    private String dateKey(Calendar calendar) {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(calendar.getTime());
    }

    public static void schedule(Context context) {
        Calendar now = Calendar.getInstance();
        Calendar target = Calendar.getInstance();
        target.set(Calendar.HOUR_OF_DAY, 9);
        target.set(Calendar.MINUTE, 0);
        target.set(Calendar.SECOND, 0);
        target.set(Calendar.MILLISECOND, 0);
        if (!target.after(now)) target.add(Calendar.DAY_OF_YEAR, 1);
        long delay = Math.max(0, target.getTimeInMillis() - now.getTimeInMillis());

        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
            XiaomanReminderWorker.class,
            24,
            TimeUnit.HOURS
        )
            .setInitialDelay(delay, TimeUnit.MILLISECONDS)
            .build();
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
