package com.xiaoman.couple;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    @PluginMethod
    public void getVersion(PluginCall call) {
        try {
            PackageInfo info = getContext().getPackageManager()
                .getPackageInfo(getContext().getPackageName(), 0);
            long versionCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? info.getLongVersionCode()
                : info.versionCode;
            JSObject result = new JSObject();
            result.put("versionCode", versionCode);
            result.put("versionName", info.versionName == null ? "" : info.versionName);
            call.resolve(result);
        } catch (Exception error) {
            call.reject(error.getMessage() == null ? "无法读取版本号" : error.getMessage());
        }
    }

    @PluginMethod
    public void download(PluginCall call) {
        String urlString = call.getString("url");
        String fileName = call.getString("fileName", "xiaoman-update.apk");
        String expectedSha = call.getString("sha256", "");
        if (urlString == null || urlString.trim().isEmpty()) {
            call.reject("缺少下载地址");
            return;
        }

        final String safeName = fileName.replaceAll("[^A-Za-z0-9._-]", "_");
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                File dir = new File(getContext().getCacheDir(), "updates");
                if (!dir.exists() && !dir.mkdirs()) {
                    throw new IOException("无法创建更新目录");
                }
                File target = new File(dir, safeName);
                if (target.exists() && !target.delete()) {
                    throw new IOException("无法清理旧安装包");
                }

                connection = (HttpURLConnection) new URL(urlString).openConnection();
                connection.setInstanceFollowRedirects(true);
                connection.setConnectTimeout(20000);
                connection.setReadTimeout(30000);
                connection.setRequestProperty("User-Agent", "XiaomanUpdater/1.0");
                int status = connection.getResponseCode();
                if (status < 200 || status >= 300) {
                    throw new IOException("下载失败：HTTP " + status);
                }

                long total = connection.getContentLengthLong();
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                try (InputStream input = connection.getInputStream();
                     FileOutputStream output = new FileOutputStream(target)) {
                    byte[] buffer = new byte[8192];
                    long downloaded = 0;
                    long lastNotify = 0;
                    int read;
                    while ((read = input.read(buffer)) != -1) {
                        output.write(buffer, 0, read);
                        digest.update(buffer, 0, read);
                        downloaded += read;
                        long now = System.currentTimeMillis();
                        if (now - lastNotify > 120 || (total > 0 && downloaded >= total)) {
                            lastNotify = now;
                            JSObject progress = new JSObject();
                            progress.put("downloaded", downloaded);
                            progress.put("total", total);
                            progress.put("progress", total > 0 ? (int) Math.min(100, downloaded * 100 / total) : -1);
                            getActivity().runOnUiThread(() -> notifyListeners("downloadProgress", progress));
                        }
                    }
                }

                if (expectedSha != null && !expectedSha.trim().isEmpty()) {
                    StringBuilder hex = new StringBuilder();
                    for (byte value : digest.digest()) {
                        hex.append(String.format("%02x", value));
                    }
                    if (!hex.toString().equalsIgnoreCase(expectedSha.trim())) {
                        target.delete();
                        throw new IOException("安装包校验失败，请重试");
                    }
                }

                JSObject result = new JSObject();
                result.put("path", target.getAbsolutePath());
                result.put("size", target.length());
                call.resolve(result);
            } catch (Exception error) {
                call.reject(error.getMessage() == null ? "下载失败" : error.getMessage());
            } finally {
                if (connection != null) connection.disconnect();
            }
        }).start();
    }

    @PluginMethod
    public void install(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.trim().isEmpty()) {
            call.reject("没有安装包路径");
            return;
        }
        try {
            File cacheDir = getContext().getCacheDir().getCanonicalFile();
            File apk = new File(path).getCanonicalFile();
            if (!apk.getPath().startsWith(cacheDir.getPath() + File.separator) || !apk.exists()) {
                call.reject("安装包不存在，请重新下载");
                return;
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !getContext().getPackageManager().canRequestPackageInstalls()) {
                Intent settings = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName())
                );
                settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(settings);
                call.reject("请允许「小满」安装未知应用，然后回来再点一次安装", "permission_required");
                return;
            }

            Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                apk
            );
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject(error.getMessage() == null ? "无法打开安装器" : error.getMessage());
        }
    }
}
