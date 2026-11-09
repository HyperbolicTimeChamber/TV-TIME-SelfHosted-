package com.tvtimerevived.updatenotification

import android.content.Context
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** JS side: app/modules/update-notification/index.ts (used by services/updateNotifications.ts) */
class UpdateNotificationModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("UpdateNotification")

    Function("showOffer") { version: String, notes: String, apkUrl: String, size: Double ->
      UpdateNotifications.showOffer(context, version, notes, apkUrl, size.toLong())
    }

    Function("cancel") {
      UpdateNotifications.cancel(context)
    }

    // The drawer's Update: the same foreground-service download as the notification's Install, so
    // it carries on (with its progress card) when the app is closed or swiped away
    Events("onDownload")

    Function("startDownload") { version: String, notes: String, apkUrl: String, size: Double ->
      UpdateNotifications.startDownload(context, version, notes, apkUrl, size.toLong())
    }

    Function("cancelDownload") {
      UpdateNotifications.cancelDownload(context)
    }

    Function("cleanupInstalledApk") {
      UpdateNotifications.cleanupInstalledApk(context)
    }

    Function("discardStaleDownload") { offeredBuild: Double ->
      UpdateNotifications.discardStaleDownload(context, offeredBuild.toLong())
    }

    OnCreate {
      UpdateDownloadService.listener = { event, data ->
        sendEvent("onDownload", data + ("type" to event))
      }
    }

    OnDestroy {
      UpdateDownloadService.listener = null
    }
  }
}
