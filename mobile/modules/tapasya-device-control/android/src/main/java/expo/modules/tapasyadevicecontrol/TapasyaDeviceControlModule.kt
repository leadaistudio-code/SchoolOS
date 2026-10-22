package expo.modules.tapasyadevicecontrol

import android.app.ActivityManager
import android.app.NotificationManager
import android.app.admin.DevicePolicyManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Android focus controls for Tapasya Mode.
 *
 * Mechanisms, reported separately and never conflated:
 *  - Do Not Disturb (priority mode): needs the user to grant notification-policy
 *    access in Settings. Reduces interruptions; other apps can still be opened.
 *  - App blocker (FocusBlockerService): needs Usage access and "Display over
 *    other apps". Covers any other app with the focus panel.
 *  - Screen pinning: Android's own user-confirmed pin. The user can unpin; with
 *    "Ask for PIN before unpinning" on, unpinning locks the phone.
 *  - Managed Lock Task Mode: only when the device's DPC/EMM has allow-listed this
 *    package (DevicePolicyManager.isLockTaskPermitted). Without that allow-list,
 *    startLockTask() falls back to user-cancellable screen pinning, so this module
 *    refuses to call it and reports NOT_PERMITTED instead.
 */
class TapasyaDeviceControlModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val notifications: NotificationManager
    get() = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  private val devicePolicy: DevicePolicyManager
    get() = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

  private val activities: ActivityManager
    get() = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager

  /** The filter in force before a session changed it, restored afterwards. */
  private var previousFilter: Int? = null

  override fun definition() = ModuleDefinition {
    Name("TapasyaDeviceControl")

    Function<Map<String, Any>>("getCapabilities") {
      mapOf(
        "platform" to "android",
        "sdkInt" to Build.VERSION.SDK_INT,
        "dndAccessGranted" to notifications.isNotificationPolicyAccessGranted,
        "interruptionFilter" to notifications.currentInterruptionFilter,
        "lockTaskPermitted" to devicePolicy.isLockTaskPermitted(context.packageName),
        "lockTaskModeState" to lockTaskState(),
        "usageAccessGranted" to FocusBlockerService.hasUsageAccess(context),
        "overlayGranted" to FocusBlockerService.canDrawOverlays(context)
      )
    }

    Function<Unit>("openDoNotDisturbSettings") {
      val intent = Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    Function<Unit>("openUsageAccessSettings") {
      context.startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    Function<Unit>("openOverlaySettings") {
      val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    /** Where Android keeps "App pinning" and "Ask for PIN before unpinning". */
    Function<Unit>("openPinningSettings") {
      context.startActivity(Intent(Settings.ACTION_SECURITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    /**
     * Asks Android to pin this app. On a personal phone Android shows its own
     * confirmation and the user can unpin, so the caller must read the state
     * afterwards rather than assume it worked.
     */
    AsyncFunction<String>("requestScreenPin") {
      val activity = appContext.currentActivity ?: throw Exceptions.MissingActivity()
      if (activities.lockTaskModeState == ActivityManager.LOCK_TASK_MODE_NONE) activity.startLockTask()
      lockTaskState()
    }.runOnQueue(Queues.MAIN)

    /** Returns true only when both permissions are in place and the service was started. */
    Function("startAppBlocker") { untilMs: Double, allow: List<String> ->
      if (!FocusBlockerService.hasUsageAccess(context) || !FocusBlockerService.canDrawOverlays(context)) {
        false
      } else {
        FocusBlockerService.start(context, untilMs.toLong(), allow)
        true
      }
    }

    Function<Unit>("stopAppBlocker") {
      FocusBlockerService.stop(context)
    }

    Function<Map<String, Any?>>("getAppBlockerState") {
      mapOf(
        "running" to FocusBlockerService.running,
        "blockedCount" to FocusBlockerService.blockedCount,
        "lastBlocked" to FocusBlockerService.lastBlocked,
        "lostAccess" to FocusBlockerService.lostAccess
      )
    }

    /** Returns true only when the OS reports the requested filter afterwards. */
    Function("setDoNotDisturb") { enabled: Boolean ->
      val nm = notifications
      if (!nm.isNotificationPolicyAccessGranted) {
        false
      } else if (enabled) {
        if (previousFilter == null) previousFilter = nm.currentInterruptionFilter
        nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_PRIORITY)
        nm.currentInterruptionFilter == NotificationManager.INTERRUPTION_FILTER_PRIORITY
      } else {
        nm.setInterruptionFilter(previousFilter ?: NotificationManager.INTERRUPTION_FILTER_ALL)
        previousFilter = null
        true
      }
    }

    /** "LOCKED" (managed kiosk), "PINNED", "NONE", or "NOT_PERMITTED" when the DPC has not allow-listed the app. */
    AsyncFunction<String>("startManagedLockTask") {
      if (!devicePolicy.isLockTaskPermitted(context.packageName)) {
        "NOT_PERMITTED"
      } else {
        val activity = appContext.currentActivity ?: throw Exceptions.MissingActivity()
        activity.startLockTask()
        lockTaskState()
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction<String>("stopLockTask") {
      val activity = appContext.currentActivity ?: throw Exceptions.MissingActivity()
      if (activities.lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE) activity.stopLockTask()
      lockTaskState()
    }.runOnQueue(Queues.MAIN)

    Function<String>("getLockTaskState") {
      lockTaskState()
    }
  }

  private fun lockTaskState(): String = when (activities.lockTaskModeState) {
    ActivityManager.LOCK_TASK_MODE_LOCKED -> "LOCKED"
    ActivityManager.LOCK_TASK_MODE_PINNED -> "PINNED"
    else -> "NONE"
  }
}
