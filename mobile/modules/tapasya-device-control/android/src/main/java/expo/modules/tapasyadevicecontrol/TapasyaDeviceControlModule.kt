package expo.modules.tapasyadevicecontrol

import android.app.ActivityManager
import android.app.NotificationManager
import android.app.admin.DevicePolicyManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Android focus controls for Tapasya Mode.
 *
 * Two mechanisms, reported separately and never conflated:
 *  - Do Not Disturb (priority mode): needs the user to grant notification-policy
 *    access in Settings. Reduces interruptions; other apps can still be opened.
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
        "lockTaskModeState" to lockTaskState()
      )
    }

    Function<Unit>("openDoNotDisturbSettings") {
      val intent = Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
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
