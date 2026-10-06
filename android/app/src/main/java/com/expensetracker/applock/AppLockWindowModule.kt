package com.expensetracker.applock

import android.os.SystemClock
import android.view.WindowManager
import androidx.fragment.app.DialogFragment
import androidx.fragment.app.Fragment
import androidx.fragment.app.FragmentActivity
import androidx.fragment.app.FragmentManager
import androidx.lifecycle.Lifecycle
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.UiThreadUtil
// Codegen writes every spec under src/security into the package named by
// codegenConfig.android.javaPackageName, not into this one.
import com.expensetracker.pincrypto.NativeAppLockWindowSpec

/**
 * Window-level protection while the app lock is on: FLAG_SECURE on the app
 * window and on every dialog window, closing those dialogs while the lock
 * screen shows, and a hold on every return from the background until
 * JavaScript releases it. The hold hides any open dialog and, once the idle
 * timeout has passed, the app itself, from the first frame. Dialogs are the
 * activity's DialogFragments under the rule on `AppLockRules.guardsDialog`.
 * Settings are remembered and re-applied when the activity resumes, since a
 * recreated activity starts without them while JavaScript still holds them set.
 */
class AppLockWindowModule(reactContext: ReactApplicationContext) :
    NativeAppLockWindowSpec(reactContext), LifecycleEventListener {

  private var secure = false
  private var alertsSuppressed = false
  private var dialogsHeld = false
  private var idleTimeoutMs: Long? = null
  private var pausedAtMs: Long? = null
  private var watchedFragments: FragmentManager? = null

  private val dialogWatcher =
      object : FragmentManager.FragmentLifecycleCallbacks() {
        override fun onFragmentStarted(fm: FragmentManager, f: Fragment) {
          if (f !is DialogFragment || !AppLockRules.guardsDialog(f.tag)) {
            return
          }
          secureDialog(f)
          if (alertsSuppressed) {
            f.dismissAllowingStateLoss()
          } else if (dialogsHeld) {
            f.dialog?.hide()
          }
        }
      }

  override fun initialize() {
    super.initialize()
    reactApplicationContext.addLifecycleEventListener(this)
  }

  override fun setSecure(secure: Boolean) {
    UiThreadUtil.runOnUiThread {
      this.secure = secure
      if (!secure) {
        releaseHold()
      }
      applySecure()
      openDialogs().forEach(::secureDialog)
      applyDialogWatch()
    }
  }

  override fun setAlertsSuppressed(suppressed: Boolean) {
    UiThreadUtil.runOnUiThread {
      alertsSuppressed = suppressed
      applyDialogWatch()
    }
  }

  override fun setIdleTimeout(timeoutMs: Double?) {
    UiThreadUtil.runOnUiThread { idleTimeoutMs = timeoutMs?.toLong() }
  }

  override fun releaseReturnHold() {
    UiThreadUtil.runOnUiThread { releaseHold() }
  }

  override fun onHostResume() {
    applySecure()
    applyDialogWatch()
    val pausedAt = pausedAtMs
    val timeout = idleTimeoutMs
    pausedAtMs = null
    if (secure && AppLockRules.pastIdleDeadline(pausedAt, timeout, SystemClock.elapsedRealtime())) {
      FocusBlockView.current()?.setHeld(true)
    }
  }

  override fun onHostPause() {
    if (!secure) {
      return
    }
    pausedAtMs = SystemClock.elapsedRealtime()
    dialogsHeld = true
    openDialogs().forEach { it.dialog?.hide() }
  }

  override fun onHostDestroy() = Unit

  override fun invalidate() {
    reactApplicationContext.removeLifecycleEventListener(this)
    UiThreadUtil.runOnUiThread { unwatchDialogs() }
    super.invalidate()
  }

  private fun applySecure() {
    val window = reactApplicationContext.currentActivity?.window ?: return
    if (secure) {
      window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
    } else {
      window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
    }
  }

  private fun secureDialog(dialog: DialogFragment) {
    val window = dialog.dialog?.window ?: return
    if (secure) {
      window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
    } else {
      window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
    }
  }

  private fun applyDialogWatch() {
    unwatchDialogs()
    if (!secure && !alertsSuppressed) {
      return
    }
    val fragments = currentFragments() ?: return
    if (alertsSuppressed) {
      openDialogs().forEach { it.dismissAllowingStateLoss() }
    }
    fragments.registerFragmentLifecycleCallbacks(dialogWatcher, false)
    watchedFragments = fragments
  }

  private fun releaseHold() {
    val activity = reactApplicationContext.currentActivity as? FragmentActivity
    if (secure && activity?.lifecycle?.currentState?.isAtLeast(Lifecycle.State.RESUMED) != true) {
      return
    }
    dialogsHeld = false
    if (!alertsSuppressed) {
      openDialogs().forEach { it.dialog?.show() }
    }
    FocusBlockView.current()?.setHeld(false)
  }

  private fun currentFragments(): FragmentManager? =
      (reactApplicationContext.currentActivity as? FragmentActivity)?.supportFragmentManager

  private fun openDialogs(): List<DialogFragment> =
      currentFragments()?.fragments.orEmpty().filterIsInstance<DialogFragment>().filter {
        AppLockRules.guardsDialog(it.tag)
      }

  private fun unwatchDialogs() {
    watchedFragments?.unregisterFragmentLifecycleCallbacks(dialogWatcher)
    watchedFragments = null
  }
}
