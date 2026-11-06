package com.xiaoman.couple;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;

/**
 * 直接调用系统相机拍一张，返回压缩后的 dataUrl。
 * 不声明 CAMERA 权限：用 ACTION_IMAGE_CAPTURE 交给相机 App 处理，避免多一次授权。
 */
@CapacitorPlugin(name = "XiaomanCamera")
public class XiaomanCameraPlugin extends Plugin {

    private static final int MAX_SIDE = 1600;
    private File pendingFile;

    @PluginMethod
    public void takePicture(PluginCall call) {
        if (getActivity() == null) {
            call.reject("页面还没准备好");
            return;
        }
        try {
            File dir = new File(getContext().getCacheDir(), "camera");
            if (!dir.exists() && !dir.mkdirs()) {
                call.reject("无法创建拍照缓存目录");
                return;
            }
            File target = new File(dir, "shot-" + System.currentTimeMillis() + ".jpg");
            Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                target
            );
            Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            intent.putExtra(MediaStore.EXTRA_OUTPUT, uri);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            pendingFile = target;
            startActivityForResult(call, intent, "cameraResult");
        } catch (Exception error) {
            call.reject(error.getMessage() == null ? "没有找到可用的相机" : error.getMessage());
        }
    }

    @ActivityCallback
    private void cameraResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK) {
            call.reject("canceled");
            return;
        }
        File file = pendingFile;
        pendingFile = null;
        if (file == null || !file.exists()) {
            // 某些机型不返回 data，退回到我们自己的缓存目录，取最新的一张
            File dir = new File(getContext().getCacheDir(), "camera");
            File[] files = dir.listFiles();
            if (files != null && files.length > 0) {
                File newest = files[0];
                for (File candidate : files) {
                    if (candidate.lastModified() > newest.lastModified()) newest = candidate;
                }
                file = newest;
            }
        }
        if (file == null || !file.exists()) {
            call.reject("没有拿到照片，再试一次吧");
            return;
        }
        try {
            String dataUrl = toDataUrl(file);
            JSObject payload = new JSObject();
            payload.put("dataUrl", dataUrl);
            call.resolve(payload);
        } catch (Exception error) {
            call.reject(error.getMessage() == null ? "照片处理失败" : error.getMessage());
        } finally {
            // 缓存文件用完就删，真正保存交给 PhotoStore
            // noinspection ResultOfMethodCallIgnored
            file.delete();
        }
    }

    private String toDataUrl(File file) throws IOException {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(file.getAbsolutePath(), bounds);
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
            throw new IOException("照片读不出来");
        }
        int longest = Math.max(bounds.outWidth, bounds.outHeight);
        int sample = 1;
        while (longest / (sample * 2) >= MAX_SIDE) sample *= 2;

        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = sample;
        Bitmap bitmap = BitmapFactory.decodeFile(file.getAbsolutePath(), options);
        if (bitmap == null) throw new IOException("照片读不出来");

        bitmap = rotateByExif(file, bitmap);

        int side = Math.max(bitmap.getWidth(), bitmap.getHeight());
        if (side > MAX_SIDE) {
            float scale = (float) MAX_SIDE / (float) side;
            Bitmap scaled = Bitmap.createScaledBitmap(
                bitmap,
                Math.max(1, Math.round(bitmap.getWidth() * scale)),
                Math.max(1, Math.round(bitmap.getHeight() * scale)),
                true
            );
            if (scaled != bitmap) bitmap.recycle();
            bitmap = scaled;
        }

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        bitmap.compress(Bitmap.CompressFormat.JPEG, 88, out);
        bitmap.recycle();
        String base64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
        return "data:image/jpeg;base64," + base64;
    }

    private Bitmap rotateByExif(File file, Bitmap bitmap) {
        try {
            ExifInterface exif = new ExifInterface(file.getAbsolutePath());
            int orientation = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            int degrees;
            switch (orientation) {
                case ExifInterface.ORIENTATION_ROTATE_90:
                    degrees = 90;
                    break;
                case ExifInterface.ORIENTATION_ROTATE_180:
                    degrees = 180;
                    break;
                case ExifInterface.ORIENTATION_ROTATE_270:
                    degrees = 270;
                    break;
                default:
                    return bitmap;
            }
            Matrix matrix = new Matrix();
            matrix.postRotate(degrees);
            Bitmap rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true);
            if (rotated != bitmap) bitmap.recycle();
            return rotated;
        } catch (Exception error) {
            return bitmap;
        }
    }
}
