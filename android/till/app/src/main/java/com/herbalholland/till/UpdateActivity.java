package com.herbalholland.till;

// The till's front door. It opens the till (the Trusted Web Activity) at once and, in the background, fetches a newer
// APK when /apps/hh-till.json lists one. The next time the till is opened, the downloaded APK is installed before the
// till starts, never during a sale. Android 12+ installs it with no taps once this app installed itself the first
// time (it is then the "installer of record"); older Android and that first update ask for one tap.
import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.TextView;
import com.google.androidbrowserhelper.trusted.LauncherActivity;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.util.Scanner;
import org.json.JSONObject;

public class UpdateActivity extends Activity {
    static final String APK = "update.apk";

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        File apk = new File(getFilesDir(), APK);
        PackageInfo staged = apk.exists() ? getPackageManager().getPackageArchiveInfo(apk.getPath(), 0) : null;
        if (staged != null && staged.versionCode > versionCode(this)) {
            TextView t = new TextView(this);
            t.setText("Updating the till app…");
            t.setGravity(Gravity.CENTER);
            t.setTextSize(20);
            t.setTextColor(0xFFFFFFFF);
            t.setBackgroundColor(getColor(R.color.ink));
            setContentView(t);
            try { install(apk); return; } catch (Exception e) { apk.delete(); }
        }
        apk.delete();
        new Thread(this::download).start();
        openTill(this);
        finish();
    }

    void download() {
        try {
            URL json = new URL(getString(R.string.update_url));
            JSONObject latest;
            try (InputStream in = json.openStream()) { latest = new JSONObject(new Scanner(in).useDelimiter("\\A").next()); }
            if (latest.getInt("versionCode") <= versionCode(this)) return;
            File part = new File(getFilesDir(), APK + ".part");
            try (InputStream in = new URL(json, latest.getString("url")).openStream(); OutputStream out = new FileOutputStream(part)) {
                copy(in, out);
            }
            part.renameTo(new File(getFilesDir(), APK));
        } catch (Exception ignored) {} // offline or no server: try again next launch
    }

    void install(File apk) throws Exception {
        PackageInstaller installer = getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        if (Build.VERSION.SDK_INT >= 31) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
        try (PackageInstaller.Session session = installer.openSession(installer.createSession(params))) {
            try (InputStream in = new FileInputStream(apk); OutputStream out = session.openWrite("till", 0, apk.length())) {
                copy(in, out);
                session.fsync(out);
            }
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            session.commit(PendingIntent.getBroadcast(this, 0, new Intent(this, Result.class), flags).getIntentSender());
        }
    }

    static void copy(InputStream in, OutputStream out) throws java.io.IOException {
        byte[] buf = new byte[65536];
        for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
    }

    @SuppressWarnings("deprecation")
    static int versionCode(Context c) {
        try { return c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionCode; } catch (Exception e) { return 0; }
    }

    static void openTill(Context c) {
        c.startActivity(new Intent(c, LauncherActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK));
    }

    // Android asks for a tap (first update, or Android 11): show its prompt. Any other answer but success: open the
    // till as it is. On success Android restarts nothing; the till opens on the next tap of its icon.
    public static class Result extends BroadcastReceiver {
        @Override
        @SuppressWarnings("deprecation")
        public void onReceive(Context c, Intent i) {
            int status = i.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
            if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                c.startActivity(((Intent) i.getParcelableExtra(Intent.EXTRA_INTENT)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                return;
            }
            new File(c.getFilesDir(), APK).delete();
            if (status != PackageInstaller.STATUS_SUCCESS) openTill(c);
        }
    }
}
