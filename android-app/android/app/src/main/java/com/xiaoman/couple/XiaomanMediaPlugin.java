package com.xiaoman.couple;

import android.graphics.BitmapFactory;
import android.os.Build;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Callable;

import javax.net.ssl.SNIHostName;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

/**
 * 照片的本地存储 + 坚果云 photos/ 目录上传下载。
 * 图片字节不进入 JSON，这里只负责文件。
 */
@CapacitorPlugin(name = "XiaomanMedia")
public class XiaomanMediaPlugin extends Plugin {

    private File photosDir() {
        File dir = new File(getContext().getFilesDir(), "photos");
        if (!dir.exists() && !dir.mkdirs()) {
            // 目录创建失败时退回缓存目录，至少不崩
            dir = new File(getContext().getCacheDir(), "photos");
            // noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
        }
        return dir;
    }

    private String safeId(String id) {
        String value = id == null ? "" : id.replaceAll("[^A-Za-z0-9._-]", "_");
        return value.isEmpty() ? String.valueOf(System.currentTimeMillis()) : value;
    }

    private File photoFile(String id) {
        return new File(photosDir(), safeId(id) + ".jpg");
    }

    @PluginMethod
    public void savePhoto(PluginCall call) {
        String dataUrl = call.getString("dataUrl");
        if (dataUrl == null || !dataUrl.contains(",")) {
            call.reject("照片数据为空");
            return;
        }
        String id = safeId(call.getString("id"));
        runAsync(call, () -> {
            String base64 = dataUrl.substring(dataUrl.indexOf(',') + 1);
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            File file = photoFile(id);
            try (FileOutputStream output = new FileOutputStream(file)) {
                output.write(bytes);
            }
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(file.getAbsolutePath(), options);
            JSObject result = new JSObject();
            result.put("id", id);
            result.put("path", file.getAbsolutePath());
            result.put("width", options.outWidth);
            result.put("height", options.outHeight);
            return result;
        });
    }

    @PluginMethod
    public void photoPath(PluginCall call) {
        File file = photoFile(call.getString("id"));
        JSObject result = new JSObject();
        result.put("path", file.getAbsolutePath());
        result.put("exists", file.exists());
        call.resolve(result);
    }

    @PluginMethod
    public void readPhoto(PluginCall call) {
        String id = call.getString("id");
        runAsync(call, () -> {
            File file = photoFile(id);
            if (!file.exists()) throw new IOException("照片不在本机");
            byte[] bytes = readAll(file);
            JSObject result = new JSObject();
            result.put("dataUrl", "data:image/jpeg;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP));
            return result;
        });
    }

    @PluginMethod
    public void deletePhoto(PluginCall call) {
        File file = photoFile(call.getString("id"));
        boolean deleted = !file.exists() || file.delete();
        JSObject result = new JSObject();
        result.put("deleted", deleted);
        call.resolve(result);
    }

    @PluginMethod
    public void uploadPhoto(PluginCall call) {
        String url = call.getString("url");
        String auth = call.getString("auth");
        String id = call.getString("id");
        if (url == null || url.isEmpty()) {
            call.reject("缺少上传地址");
            return;
        }
        runAsync(call, () -> {
            File file = photoFile(id);
            if (!file.exists()) throw new IOException("本机没有这张照片");
            byte[] bytes = readAll(file);
            int status = put(url, auth, bytes);
            if (status < 200 || status >= 300) {
                throw new IOException(status == 409 || status == 404
                    ? "云端还没有 photos 文件夹，先同步一次"
                    : "照片上传失败（HTTP " + status + "）");
            }
            JSObject result = new JSObject();
            result.put("status", status);
            return result;
        });
    }

    @PluginMethod
    public void downloadPhoto(PluginCall call) {
        String url = call.getString("url");
        String auth = call.getString("auth");
        String id = call.getString("id");
        if (url == null || url.isEmpty()) {
            call.reject("缺少下载地址");
            return;
        }
        runAsync(call, () -> {
            HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(30000);
            if (auth != null && !auth.isEmpty()) connection.setRequestProperty("Authorization", auth);
            try {
                int status = connection.getResponseCode();
                if (status == 404) throw new IOException("照片还没上传到云端");
                if (status != 200) throw new IOException("照片下载失败（HTTP " + status + "）");
                File target = photoFile(id);
                File temp = new File(target.getParentFile(), target.getName() + ".part");
                try (InputStream input = connection.getInputStream();
                     OutputStream output = new FileOutputStream(temp)) {
                    byte[] buffer = new byte[8192];
                    int read;
                    while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
                }
                if (target.exists() && !target.delete()) throw new IOException("无法写入照片缓存");
                if (!temp.renameTo(target)) throw new IOException("无法写入照片缓存");
                JSObject result = new JSObject();
                result.put("path", target.getAbsolutePath());
                result.put("size", target.length());
                return result;
            } finally {
                connection.disconnect();
            }
        });
    }

    private int put(String url, String auth, byte[] bytes) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setRequestMethod("PUT");
        connection.setDoOutput(true);
        connection.setFixedLengthStreamingMode(bytes.length);
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(40000);
        connection.setRequestProperty("Content-Type", "image/jpeg");
        if (auth != null && !auth.isEmpty()) connection.setRequestProperty("Authorization", auth);
        try (OutputStream output = connection.getOutputStream()) {
            output.write(bytes);
        } finally {
            // 读取状态码后才能 disconnect
        }
        int status = connection.getResponseCode();
        connection.disconnect();
        return status;
    }

    @PluginMethod
    public void ensureFolder(PluginCall call) {
        String url = call.getString("url");
        String auth = call.getString("auth");
        if (url == null || url.isEmpty()) {
            call.reject("缺少文件夹地址");
            return;
        }
        runAsync(call, () -> {
            int status = mkcol(url, auth);
            JSObject result = new JSObject();
            result.put("status", status);
            return result;
        });
    }

    /**
     * HttpURLConnection 不允许 MKCOL 这种自定义方法，这里用原始 socket 发一个最小请求。
     */
    private int mkcol(String urlString, String auth) throws IOException {
        URL url = new URL(urlString);
        String host = url.getHost();
        boolean https = "https".equalsIgnoreCase(url.getProtocol());
        int port = url.getPort() > 0 ? url.getPort() : (https ? 443 : 80);
        Socket socket = null;
        try {
            if (https) {
                SSLSocket ssl = (SSLSocket) SSLSocketFactory.getDefault().createSocket();
                ssl.connect(new InetSocketAddress(host, port), 15000);
                SSLParameters params = ssl.getSSLParameters();
                params.setEndpointIdentificationAlgorithm("HTTPS");
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    params.setServerNames(java.util.Collections.singletonList(new SNIHostName(host)));
                }
                ssl.setSSLParameters(params);
                ssl.startHandshake();
                socket = ssl;
            } else {
                socket = new Socket();
                socket.connect(new InetSocketAddress(host, port), 15000);
            }
            String path = url.getFile();
            if (path == null || path.isEmpty()) path = "/";
            String request = "MKCOL " + path + " HTTP/1.1\r\n"
                + "Host: " + host + "\r\n"
                + "Authorization: " + auth + "\r\n"
                + "Content-Length: 0\r\n"
                + "Connection: close\r\n\r\n";
            socket.getOutputStream().write(request.getBytes(StandardCharsets.UTF_8));
            socket.getOutputStream().flush();
            BufferedReader reader = new BufferedReader(
                new InputStreamReader(socket.getInputStream(), StandardCharsets.ISO_8859_1));
            String statusLine = reader.readLine();
            if (statusLine == null) return 0;
            String[] parts = statusLine.split(" ");
            return parts.length > 1 ? Integer.parseInt(parts[1]) : 0;
        } catch (Exception error) {
            // 目录可能本来就存在，交给调用方按状态码判断
            return 0;
        } finally {
            try {
                if (socket != null) socket.close();
            } catch (IOException ignored) {
                // ignore
            }
        }
    }

    private byte[] readAll(File file) throws IOException {
        try (InputStream input = new java.io.FileInputStream(file);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
            return output.toByteArray();
        }
    }

    private void runAsync(PluginCall call, Callable<JSObject> task) {
        new Thread(() -> {
            try {
                JSObject result = task.call();
                resolve(call, result);
            } catch (Exception error) {
                reject(call, error.getMessage() == null ? "照片操作失败" : error.getMessage());
            }
        }).start();
    }

    private void resolve(PluginCall call, JSObject result) {
        if (getActivity() != null) getActivity().runOnUiThread(() -> call.resolve(result));
        else call.resolve(result);
    }

    private void reject(PluginCall call, String message) {
        if (getActivity() != null) getActivity().runOnUiThread(() -> call.reject(message));
        else call.reject(message);
    }
}
