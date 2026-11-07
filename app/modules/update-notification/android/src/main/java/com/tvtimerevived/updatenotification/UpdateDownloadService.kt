package com.tvtimerevived.updatenotification

import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.ServiceCompat
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import kotlin.concurrent.thread

/**
 * The notification's Install: downloads the APK to the app cache as a foreground service (Android
 * keeps it alive with the app closed), its card showing the progress, then the "downloaded" card
 * opens the installer. Cancel stops it and removes the card
 */
class UpdateDownloadService : Service() {
  companion object {
    const val ACTION_DOWNLOAD = "com.tvtimerevived.update.DOWNLOAD"
    const val ACTION_CANCEL = "com.tvtimerevived.update.CANCEL"
    const val EXTRA_URL = "url"
    const val EXTRA_VERSION = "version"
    const val EXTRA_SIZE = "size"
    const val EXTRA_NOTES = "notes"
    /** Progress repaints at most this often (the notification can't redraw faster) */
    private const val PROGRESS_INTERVAL_MS = 500L
  }

  @Volatile private var cancelled = false
  @Volatile private var running = false
  /** Release notes shown on the expanded download card */
  private var notes = ""

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_CANCEL -> {
        cancelled = true
        // Started (as a foreground service) only to cancel: it must go foreground before stopping
        if (!running) startInForeground("", 0, "")
        finish(removeCard = true)
      }
      ACTION_DOWNLOAD -> {
        val url = intent.getStringExtra(EXTRA_URL)
        val version = intent.getStringExtra(EXTRA_VERSION) ?: ""
        val size = intent.getLongExtra(EXTRA_SIZE, 0L)
        notes = intent.getStringExtra(EXTRA_NOTES) ?: ""
        startInForeground(version, 0, "Starting…")
        if (url == null || running) return START_NOT_STICKY
        running = true
        cancelled = false
        thread(name = "update-download") { download(url, version, size) }
      }
      else -> stopSelf()
    }
    return START_NOT_STICKY
  }

  private fun startInForeground(version: String, percent: Int, detail: String) {
    val notification = UpdateNotifications.progress(this, version, percent, detail, notes)
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC else 0
    ServiceCompat.startForeground(this, UpdateNotifications.NOTIFICATION_ID, notification, type)
  }

  private fun mb(bytes: Long) = String.format(Locale.US, "%.1f", bytes / 1_048_576.0)

  private fun download(url: String, version: String, expectedSize: Long) {
    val target = UpdateNotifications.apkFile(this)
    val partial = File(cacheDir, "${UpdateNotifications.APK_FILE}.part")
    try {
      val connection = (URL(url).openConnection() as HttpURLConnection).apply {
        instanceFollowRedirects = true
        connectTimeout = 15_000
        readTimeout = 30_000
      }
      if (connection.responseCode !in 200..299) throw IllegalStateException("HTTP ${connection.responseCode}")
      val total = connection.contentLengthLong.takeIf { it > 0 } ?: expectedSize
      var written = 0L
      var lastPaint = 0L
      connection.inputStream.use { input ->
        partial.outputStream().use { output ->
          val buffer = ByteArray(64 * 1024)
          while (!cancelled) {
            val read = input.read(buffer)
            if (read < 0) break
            output.write(buffer, 0, read)
            written += read
            val now = System.currentTimeMillis()
            if (total > 0 && now - lastPaint >= PROGRESS_INTERVAL_MS) {
              lastPaint = now
              val percent = ((written * 100) / total).toInt().coerceIn(0, 99)
              startInForeground(version, percent, "${mb(written)} of ${mb(total)} MB")
            }
          }
        }
      }
      if (cancelled) {
        partial.delete()
        return
      }
      target.delete()
      partial.renameTo(target)
      finish(removeCard = true)
      UpdateNotifications.showDownloaded(this, version, notes)
    } catch (_: Exception) {
      partial.delete()
      finish(removeCard = true)
    } finally {
      running = false
    }
  }

  private fun finish(removeCard: Boolean) {
    ServiceCompat.stopForeground(
      this,
      if (removeCard) ServiceCompat.STOP_FOREGROUND_REMOVE else ServiceCompat.STOP_FOREGROUND_DETACH,
    )
    stopSelf()
  }
}
