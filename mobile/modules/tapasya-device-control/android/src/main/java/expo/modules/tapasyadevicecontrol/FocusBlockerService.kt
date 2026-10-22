package expo.modules.tapasyadevicecontrol

import android.app.AppOpsManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.Process
import android.provider.Settings
import android.telecom.TelecomManager
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Keeps other apps out of reach for the length of a focus session.
 *
 * Uses only public Android APIs the user grants in Settings: Usage access to
 * see which app is in front, and "Display over other apps" to cover it with a
 * panel that leads back to MyCampusView. Calls, the dialler and system UI are
 * never covered. The student can revoke either permission in Settings; the
 * service notices and reports `lostAccess` rather than pretending to block.
 */
class FocusBlockerService : Service() {
  companion object {
    private const val EXTRA_UNTIL = "until"
    private const val EXTRA_ALLOW = "allow"
    private const val CHANNEL_ID = "tapasya_focus_blocker"
    private const val NOTIFICATION_ID = 7341
    private const val POLL_MS = 600L

    private val ALWAYS_ALLOWED = setOf(
      "android",
      "com.android.systemui",
      "com.android.phone",
      "com.android.server.telecom",
      "com.android.emergency",
      "com.google.android.dialer",
      "com.android.dialer",
      "com.google.android.apps.safetyhub",
      "com.android.permissioncontroller",
      "com.google.android.permissioncontroller",
    )

    @Volatile var running = false
      private set
    @Volatile var blockedCount = 0
      private set
    @Volatile var lastBlocked: String? = null
      private set
    @Volatile var lostAccess = false
      private set

    fun start(context: Context, untilMs: Long, allow: List<String>) {
      val intent = Intent(context, FocusBlockerService::class.java)
        .putExtra(EXTRA_UNTIL, untilMs)
        .putStringArrayListExtra(EXTRA_ALLOW, ArrayList(allow))
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, FocusBlockerService::class.java))
    }

    fun hasUsageAccess(context: Context): Boolean {
      val ops = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
      val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
      } else {
        @Suppress("DEPRECATION")
        ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
      }
      return mode == AppOpsManager.MODE_ALLOWED
    }

    fun canDrawOverlays(context: Context): Boolean =
      Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)
  }

  private val handler = Handler(Looper.getMainLooper())
  private var untilMs = 0L
  private var allow: Set<String> = emptySet()
  private var foreground: String? = null
  private var lastQueryAt = 0L
  private var overlay: View? = null
  private var coveredPackage: String? = null

  private val tick = object : Runnable {
    override fun run() {
      poll()
      if (running) handler.postDelayed(this, POLL_MS)
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    startInForeground()
    val fresh = !running
    untilMs = intent?.getLongExtra(EXTRA_UNTIL, 0L) ?: 0L
    allow = intent?.getStringArrayListExtra(EXTRA_ALLOW)?.toSet() ?: emptySet()
    if (fresh) {
      running = true
      blockedCount = 0
      lastBlocked = null
      lostAccess = false
      lastQueryAt = System.currentTimeMillis() - 60_000
      handler.post(tick)
    }
    return START_REDELIVER_INTENT
  }

  override fun onDestroy() {
    running = false
    handler.removeCallbacks(tick)
    hideOverlay()
    super.onDestroy()
  }

  private fun poll() {
    val now = System.currentTimeMillis()
    if (untilMs in 1 until now) {
      stopSelf()
      return
    }
    if (!hasUsageAccess(this) || !canDrawOverlays(this)) {
      lostAccess = true
      hideOverlay()
      return
    }

    val usage = getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    val events = usage.queryEvents(lastQueryAt, now)
    val event = UsageEvents.Event()
    while (events.hasNextEvent()) {
      events.getNextEvent(event)
      @Suppress("DEPRECATION")
      if (event.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND) foreground = event.packageName
    }
    lastQueryAt = now - 1_000

    val front = foreground
    if (front != null && !isAllowed(front)) showOverlay(front) else hideOverlay()
  }

  private fun isAllowed(pkg: String): Boolean {
    if (pkg == packageName || pkg in allow || pkg in ALWAYS_ALLOWED) return true
    val dialer = (getSystemService(Context.TELECOM_SERVICE) as? TelecomManager)?.defaultDialerPackage
    return pkg == dialer
  }

  private fun showOverlay(pkg: String) {
    if (coveredPackage != pkg) {
      blockedCount += 1
      lastBlocked = pkg
      coveredPackage = pkg
    }
    if (overlay != null) return

    val dp = { v: Float -> TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, resources.displayMetrics).toInt() }
    val panel = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setBackgroundColor(Color.parseColor("#F20F172A"))
      setPadding(dp(32f), dp(32f), dp(32f), dp(32f))
      isClickable = true
    }
    panel.addView(TextView(this).apply {
      text = "Focus session in progress"
      setTextColor(Color.WHITE)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
      gravity = Gravity.CENTER
    })
    panel.addView(TextView(this).apply {
      text = "Other apps are blocked until your Tapasya session ends. To use one, ask your guardian for an exception in MyCampusView. Calls stay available."
      setTextColor(Color.parseColor("#CBD5E1"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
      gravity = Gravity.CENTER
      setPadding(0, dp(12f), 0, dp(24f))
    })
    panel.addView(Button(this).apply {
      text = "Back to Focus Room"
      setOnClickListener { returnToApp() }
    })

    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.MATCH_PARENT,
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
      else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE,
      WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.TRANSLUCENT,
    )
    try {
      (getSystemService(Context.WINDOW_SERVICE) as WindowManager).addView(panel, params)
      overlay = panel
    } catch (_: Exception) {
      lostAccess = true
    }
  }

  private fun hideOverlay() {
    coveredPackage = null
    val view = overlay ?: return
    overlay = null
    try {
      (getSystemService(Context.WINDOW_SERVICE) as WindowManager).removeView(view)
    } catch (_: Exception) {
    }
  }

  private fun returnToApp() {
    val launch = packageManager.getLaunchIntentForPackage(packageName) ?: return
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
    startActivity(launch)
  }

  private fun startInForeground() {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CHANNEL_ID) == null) {
      manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Focus session", NotificationManager.IMPORTANCE_LOW))
    }
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val content = launch?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, CHANNEL_ID)
    else @Suppress("DEPRECATION") Notification.Builder(this)
    val notification = builder
      .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
      .setContentTitle("Tapasya focus session")
      .setContentText("Other apps are blocked until the session ends.")
      .setOngoing(true)
      .setContentIntent(content)
      .build()
    if (Build.VERSION.SDK_INT >= 34) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }
}
