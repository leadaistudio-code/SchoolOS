import ExpoModulesCore
import UIKit
#if canImport(FamilyControls)
import FamilyControls
#endif
#if canImport(ManagedSettings)
import ManagedSettings
#endif

/**
 * iOS focus controls for Tapasya Mode.
 *
 *  - Screen Time (FamilyControls + ManagedSettings): authorization works only in
 *    a build signed with Apple's com.apple.developer.family-controls entitlement.
 *    Without it, requestAuthorization fails and the app stays timer-only.
 *  - Single App Mode: requestGuidedAccessSession succeeds only on a supervised
 *    device whose MDM profile allows Autonomous Single App Mode for this app.
 *    A true result is the OS confirming a managed kiosk, nothing less.
 */
public class TapasyaDeviceControlModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TapasyaDeviceControl")

    AsyncFunction("getCapabilities") { () -> [String: Any] in
      return [
        "platform": "ios",
        "osVersion": UIDevice.current.systemVersion,
        "guidedAccessActive": UIAccessibility.isGuidedAccessEnabled,
        "screenTimeStatus": TapasyaDeviceControlModule.screenTimeStatus()
      ]
    }.runOnQueue(.main)

    AsyncFunction("requestScreenTimeAuthorization") { () async -> String in
      #if canImport(FamilyControls)
      if #available(iOS 16.0, *) {
        do {
          try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
        } catch {
          return "failed"
        }
        return TapasyaDeviceControlModule.screenTimeStatus()
      }
      #endif
      return "unavailable"
    }

    /** Shields every app and web category in a named store; clearing removes only what this store set. */
    AsyncFunction("setShield") { (enabled: Bool) -> Bool in
      #if canImport(ManagedSettings)
      if #available(iOS 16.0, *) {
        let store = ManagedSettingsStore(named: ManagedSettingsStore.Name("tapasya"))
        if enabled {
          store.shield.applicationCategories = .all()
          store.shield.webDomainCategories = .all()
        } else {
          store.clearAllSettings()
        }
        return true
      }
      #endif
      return false
    }.runOnQueue(.main)

    AsyncFunction("requestSingleAppMode") { (enabled: Bool, promise: Promise) in
      UIAccessibility.requestGuidedAccessSession(enabled: enabled) { ok in
        promise.resolve(ok)
      }
    }.runOnQueue(.main)
  }

  static func screenTimeStatus() -> String {
    #if canImport(FamilyControls)
    if #available(iOS 16.0, *) {
      switch AuthorizationCenter.shared.authorizationStatus {
      case .approved: return "approved"
      case .denied: return "denied"
      case .notDetermined: return "notDetermined"
      @unknown default: return "unknown"
      }
    }
    #endif
    return "unavailable"
  }
}
