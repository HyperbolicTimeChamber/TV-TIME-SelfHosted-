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

    /** The app's update drawer, while it's open: progress / done / failed / cancelled (module events) */
    @Volatile var listener: ((event: String, data: Map<String, Any?>) -> Unit)? = null
    /** A download is in progress (cleanup leaves its files alone) */
    @Volatile var downloading = false
    private fun emit(event: String, data: Map<String, Any?> = emptyMap()) {
      try {
        listener?.invoke(event, data)
      } catch (_: Exception) {
        // The JS side went away (reload): the download carries on regardless
      }
    }
  }

  @Volatile private var cancelled = false
  @Volatile private var running = false
  /** Release notes, for the expanded "downloaded" card */
  private var notes = ""

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_CANCEL -> {
        cancelled = true
        emit("cancelled")
        // Every start comes from startForegroundService, so it must go foreground before stopping —
        // always, not only when idle: a download finishing at the same moment has already left the
        // foreground while `running` is still true, and stopping then crashes the app
        // (ForegroundServiceDidNotStartInTimeException)
        startInForeground("", 0, "")
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
        downloading = true
        cancelled = false
        thread(name = "update-download") { download(url, version, size) }
      }
      else -> {
        startInForeground("", 0, "")
        finish(removeCard = true)
      }
    }
    return START_NOT_STICKY
  }

  private fun startInForeground(version: String, percent: Int, detail: String) {
    val notification = UpdateNotifications.progress(this, version, percent, detail)
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
            // Cancelled during the read: don't repaint the card the cancel just removed
            if (read < 0 || cancelled) break
            output.write(buffer, 0, read)
            written += read
            val now = System.currentTimeMillis()
            if (total > 0 && now - lastPaint >= PROGRESS_INTERVAL_MS) {
              lastPaint = now
              val percent = ((written * 100) / total).toInt().coerceIn(0, 99)
              startInForeground(version, percent, "${mb(written)} of ${mb(total)} MB")
              emit("progress", mapOf("fraction" to (written.toDouble() / total).coerceAtMost(0.99)))
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
      emit("done", mapOf("uri" to android.net.Uri.fromFile(target).toString()))
    } catch (_: Exception) {
      partial.delete()
      finish(removeCard = true)
      emit("failed")
    } finally {
      running = false
      downloading = false
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
