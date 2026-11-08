package com.tvtimerevived.updatenotification

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.FileProvider
import java.io.File

/**
 * The app's own update notifications, drawn with custom layouts so they wear its theme (Android
 * picks every colour itself in the standard templates):
 *  - offer: "V x.y.z is available" + notes, a red Install button (starts UpdateDownloadService)
 *  - progress (the service's foreground card): dark, white text, red bar, red Cancel; expanded,
 *    the drawer's dial spins above the bar
 *  - downloaded: "Tap to install" + a red Install button, straight to Android's installer
 */
object UpdateNotifications {
  const val CHANNEL_ID = "app-updates"
  const val NOTIFICATION_ID = 4711
  /** The watchlist cards' background (theme colors.surface) */
  private const val CARD_DARK = 0xFF1A1A1A.toInt()
  private const val BRAND_RED = 0xFFE50914.toInt()
  /** Same file the in-app drawer downloads to (app enums UPDATE_APK_FILE) */
  const val APK_FILE = "watchloom-update.apk"

  fun apkFile(context: Context) = File(context.cacheDir, APK_FILE)

  fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java)
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL_ID, "App updates", NotificationManager.IMPORTANCE_DEFAULT).apply {
        description = "New versions, download progress and install"
      },
    )
  }

  /** The app's notification icon (app resource: looked up by name from this library) */
  private fun smallIcon(context: Context): Int {
    val id = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
    return if (id != 0) id else context.applicationInfo.icon
  }

  private fun openApp(context: Context): PendingIntent? {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    return PendingIntent.getActivity(context, 10, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  private fun serviceIntent(context: Context, action: String, extras: Intent.() -> Unit = {}): PendingIntent {
    val intent = Intent(context, UpdateDownloadService::class.java).setAction(action).apply(extras)
    val flags = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      PendingIntent.getForegroundService(context, action.hashCode(), intent, flags)
    } else {
      PendingIntent.getService(context, action.hashCode(), intent, flags)
    }
  }

  private fun card(context: Context, layout: Int, title: String, body: String, action: String, onAction: PendingIntent?) =
    RemoteViews(context.packageName, layout).apply {
      setTextViewText(R.id.update_title, title)
      setTextViewText(R.id.update_body, body)
      setViewVisibility(R.id.update_body, if (body.isBlank()) android.view.View.GONE else android.view.View.VISIBLE)
      setTextViewText(R.id.update_action, action)
      if (onAction != null) setOnClickPendingIntent(R.id.update_action, onAction)
    }

  private fun notify(context: Context, builder: NotificationCompat.Builder) {
    if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return
    try {
      NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build())
    } catch (_: SecurityException) {
      // POST_NOTIFICATIONS revoked meanwhile
    }
  }

  fun showOffer(context: Context, version: String, notes: String, apkUrl: String, size: Long) {
    ensureChannel(context)
    val title = "v$version is available"
    val body = notes.lineSequence().firstOrNull { it.isNotBlank() } ?: "Tap Install to download the update."
    val install = serviceIntent(context, UpdateDownloadService.ACTION_DOWNLOAD) {
      putExtra(UpdateDownloadService.EXTRA_URL, apkUrl)
      putExtra(UpdateDownloadService.EXTRA_VERSION, version)
      putExtra(UpdateDownloadService.EXTRA_SIZE, size)
      putExtra(UpdateDownloadService.EXTRA_NOTES, notes)
    }
    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(smallIcon(context))
      .setColor(BRAND_RED)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.DecoratedCustomViewStyle())
      .setCustomContentView(card(context, R.layout.update_card_small, title, body, "Install", install))
      .setCustomBigContentView(card(context, R.layout.update_card_big, title, notes.trim().ifEmpty { body }, "Install", install))
      .setContentIntent(openApp(context))
      .setAutoCancel(true)
    notify(context, builder)
  }

  /** The download service's foreground card (dark: colorized foreground-service notification) */
  fun progress(context: Context, version: String, percent: Int, detail: String): android.app.Notification {
    ensureChannel(context)
    val cancel = serviceIntent(context, UpdateDownloadService.ACTION_CANCEL)
    fun views(layout: Int) = RemoteViews(context.packageName, layout).apply {
      setTextViewText(R.id.update_title, "Upgrading")
      setTextViewText(R.id.update_percent, detail)
      setProgressBar(R.id.update_progress, 100, percent, false)
      if (layout == R.layout.update_progress_big) {
        setTextViewText(R.id.update_version, "Downloading v$version")
        setOnClickPendingIntent(R.id.update_action, cancel)
      }
    }
    return NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(smallIcon(context))
      .setColor(CARD_DARK)
      .setColorized(true)
      .setContentTitle("Upgrading")
      .setStyle(NotificationCompat.DecoratedCustomViewStyle())
      .setCustomContentView(views(R.layout.update_progress_small))
      .setCustomBigContentView(views(R.layout.update_progress_big))
      .setContentIntent(openApp(context))
      // Android otherwise holds a foreground service's card back for up to 10 seconds
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .build()
  }

  fun installIntent(context: Context, apk: File): Intent {
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.updatefileprovider", apk)
    return Intent(Intent.ACTION_VIEW)
      .setDataAndType(uri, "application/vnd.android.package-archive")
      .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
  }

  /** Download finished: tapping the card or Install opens Android's installer directly */
  fun showDownloaded(context: Context, version: String, notes: String) {
    ensureChannel(context)
    val install = PendingIntent.getActivity(
      context, 11, installIntent(context, apkFile(context)),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    val title = "v$version downloaded"
    // The red Install says what to do: the card shows the release notes, no "Tap to install"
    val firstLine = notes.lineSequence().firstOrNull { it.isNotBlank() } ?: ""
    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(smallIcon(context))
      .setColor(BRAND_RED)
      .setContentTitle(title)
      .setContentText(firstLine)
      .setStyle(NotificationCompat.DecoratedCustomViewStyle())
      .setCustomContentView(card(context, R.layout.update_card_small, title, firstLine, "Install", install))
      .setCustomBigContentView(card(context, R.layout.update_card_big, title, notes.trim(), "Install", install))
      .setContentIntent(install)
      .setAutoCancel(true)
    notify(context, builder)
  }

  /** Starts the background download (the drawer's Update and the notification's Install alike) */
  fun startDownload(context: Context, version: String, notes: String, apkUrl: String, size: Long) {
    val intent = Intent(context, UpdateDownloadService::class.java)
      .setAction(UpdateDownloadService.ACTION_DOWNLOAD)
      .putExtra(UpdateDownloadService.EXTRA_URL, apkUrl)
      .putExtra(UpdateDownloadService.EXTRA_VERSION, version)
      .putExtra(UpdateDownloadService.EXTRA_SIZE, size)
      .putExtra(UpdateDownloadService.EXTRA_NOTES, notes)
    androidx.core.content.ContextCompat.startForegroundService(context, intent)
  }

  fun cancelDownload(context: Context) {
    val intent = Intent(context, UpdateDownloadService::class.java).setAction(UpdateDownloadService.ACTION_CANCEL)
    androidx.core.content.ContextCompat.startForegroundService(context, intent)
  }

  /**
   * After an update: the downloaded APK is deleted once the app runs that build (or a newer one) —
   * a download not installed yet is kept. Leftover partial downloads go too
   */
  fun cleanupInstalledApk(context: Context) {
    if (UpdateDownloadService.downloading) return
    File(context.cacheDir, "$APK_FILE.part").delete()
    val apk = apkFile(context)
    if (!apk.exists()) return
    val pm = context.packageManager
    @Suppress("DEPRECATION")
    val archive = pm.getPackageArchiveInfo(apk.path, 0)
    @Suppress("DEPRECATION")
    val installed = pm.getPackageInfo(context.packageName, 0)
    val archiveCode = archive?.let { androidx.core.content.pm.PackageInfoCompat.getLongVersionCode(it) } ?: -1L
    val installedCode = androidx.core.content.pm.PackageInfoCompat.getLongVersionCode(installed)
    if (archive == null || archiveCode <= installedCode) apk.delete()
  }

  fun cancel(context: Context) {
    NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
  }
}
