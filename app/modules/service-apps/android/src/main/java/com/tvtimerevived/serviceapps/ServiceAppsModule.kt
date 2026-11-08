package com.tvtimerevived.serviceapps

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Where to Watch: opens a streaming service in its own app, never via the browser first.
 * A plain https link went to Chrome whenever the app didn't claim that exact URL (a home page),
 * and the site then bounced to the app. Order: the link in the service's app → the app's home
 * screen → (not installed) false, and JS opens the link in the browser.
 */
class ServiceAppsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ServiceApps")

    Function("openInApp") { url: String, packageName: String? ->
      // An activity starts another app's activity most reliably (no new-task / background-start rules)
      val context = appContext.currentActivity ?: appContext.reactContext ?: return@Function false
      val view = Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      if (packageName != null) {
        view.setPackage(packageName)
      } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        // Unknown service: whichever installed app (not a browser) handles the link
        view.addFlags(Intent.FLAG_ACTIVITY_REQUIRE_NON_BROWSER)
      } else {
        return@Function false
      }
      try {
        context.startActivity(view)
        return@Function true
      } catch (_: ActivityNotFoundException) {
        // The app doesn't take this link (e.g. its home page): open the app itself
      }
      val launch = packageName?.let { context.packageManager.getLaunchIntentForPackage(it) }
        ?: return@Function false
      context.startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      true
    }
  }
}
