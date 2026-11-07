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
  }
}
