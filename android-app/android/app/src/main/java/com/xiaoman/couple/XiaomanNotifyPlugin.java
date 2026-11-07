package com.xiaoman.couple;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "XiaomanNotify",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class XiaomanNotifyPlugin extends Plugin {

    private static final String CHANNEL_ID = "xiaoman_updates";
    private static final String CHANNEL_NAME = "小满的新动态";
    private static final String REMINDER_CHANNEL_ID = "xiaoman_reminders";
    private static final String REMINDER_CHANNEL_NAME = "纪念日提醒";
    private static final int NOTIFICATION_ID = 2026;
    private static final int REMINDER_NOTIFICATION_ID = 2027;

    public static void createChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            CHANNEL_NAME,
            NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription("TA 更新小满时提醒你");
        channel.enableLights(true);
        manager.createNotificationChannel(channel);
    }

    public static void showReminder(Context context, String title, String body) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                NotificationChannel channel = new NotificationChannel(
                    REMINDER_CHANNEL_ID,
                    REMINDER_CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_DEFAULT
                );
                channel.setDescription("纪念日和生日提前提醒");
                manager.createNotificationChannel(channel);
            }
        }
        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("route", "days");
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pendingIntent = PendingIntent.getActivity(context, 2, intent, flags);

        Notification notification = new NotificationCompat.Builder(context, REMINDER_CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build();

        try {
            NotificationManagerCompat.from(context).notify(REMINDER_NOTIFICATION_ID, notification);
        } catch (SecurityException error) {
            // 没有通知权限时静默失败
        }
    }

    public static void show(Context context, String title, String body, String route) {
        createChannel(context);
        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("route", route == null ? "moments" : route);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pendingIntent = PendingIntent.getActivity(context, 1, intent, flags);

        Notification notification = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build();

        try {
            NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification);
        } catch (SecurityException error) {
            // 没有通知权限时静默失败
        }
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", hasNotificationPermission());
        call.resolve(result);
    }

    private boolean hasNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return ContextCompat.checkSelfPermission(
                getContext(),
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED;
        }
        return NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            JSObject result = new JSObject();
            result.put("granted", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
            call.resolve(result);
            return;
        }
        if (getPermissionState("notifications") == PermissionState.GRANTED) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        requestPermissionForAlias("notifications", call, "permissionCallback");
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", getPermissionState("notifications") == PermissionState.GRANTED);
        call.resolve(result);
    }

    @PluginMethod
    public void notify(PluginCall call) {
        if (!hasNotificationPermission()) {
            call.reject("还没有通知权限");
            return;
        }
        String title = call.getString("title", "小满");
        String body = call.getString("body", "TA 刚刚更新了小满。");
        String route = call.getString("route", "moments");
        show(getContext(), title, body, route);
        call.resolve();
    }

    @PluginMethod
    public void configure(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(XiaomanSyncWorker.PREFS, Context.MODE_PRIVATE);
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        Integer intervalValue = call.getInt("interval", 30);
        int interval = intervalValue == null ? 30 : intervalValue;
        String sharedUrl = call.getString("sharedUrl", "");
        String auth = call.getString("auth", "");
        String quietStart = call.getString("quietStart", "23:00");
        String quietEnd = call.getString("quietEnd", "08:00");
        String baseline = call.getString("baseline", "");
        String identity = call.getString("identity", "me");

        prefs.edit()
            .putBoolean("enabled", enabled)
            .putString("sharedUrl", sharedUrl == null ? "" : sharedUrl)
            .putString("auth", auth == null ? "" : auth)
            .putString("quietStart", quietStart == null ? "23:00" : quietStart)
            .putString("quietEnd", quietEnd == null ? "08:00" : quietEnd)
            .putString("baseline", baseline == null ? "" : baseline)
            .putString("identity", identity == null ? "me" : identity)
            .apply();

        if (enabled && sharedUrl != null && !sharedUrl.isEmpty()) {
            XiaomanSyncWorker.schedule(getContext(), interval);
        } else {
            XiaomanSyncWorker.cancel(getContext());
        }
        JSObject result = new JSObject();
        result.put("scheduled", enabled);
        call.resolve(result);
    }

    @PluginMethod
    public void configureReminders(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(XiaomanSyncWorker.PREFS, Context.MODE_PRIVATE);
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        JSArray items = call.getArray("items");
        prefs.edit()
            .putBoolean("reminderEnabled", enabled)
            .putString("reminderItems", items == null ? "[]" : items.toString())
            .apply();
        if (enabled) XiaomanReminderWorker.schedule(getContext());
        else XiaomanReminderWorker.cancel(getContext());
        JSObject result = new JSObject();
        result.put("scheduled", enabled);
        call.resolve(result);
    }

    @PluginMethod
    public void openExternal(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("缺少链接");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("没有找到能打开这个链接的应用");
        }
    }

    @PluginMethod
    public void getLaunchRoute(PluginCall call) {
        JSObject result = new JSObject();
        if (getActivity() != null) {
            Intent intent = getActivity().getIntent();
            String route = intent == null ? null : intent.getStringExtra("route");
            if (route != null) {
                intent.removeExtra("route");
                result.put("route", route);
            }
        }
        call.resolve(result);
    }
}
