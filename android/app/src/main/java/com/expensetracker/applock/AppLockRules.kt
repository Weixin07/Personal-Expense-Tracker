package com.expensetracker.applock

import android.view.View

internal object AppLockRules {

  /**
   * Whether a return from the background is due to lock, on the same boundary as
   * JavaScript's idle check, under the rule on `idleTimeoutMs`. False when the app
   * never paused or the lock has no idle timeout.
   */
  fun pastIdleDeadline(pausedAtMs: Long?, timeoutMs: Long?, nowMs: Long): Boolean =
      pausedAtMs != null && timeoutMs != null && nowMs - pausedAtMs >= timeoutMs

  /** The app root's visibility: hidden while concealed or held, otherwise the one Fabric last set. */
  fun resolvedVisibility(requested: Int, concealed: Boolean, held: Boolean): Int =
      if (concealed || held) View.INVISIBLE else requested

  /**
   * Whether a dialog fragment is secured, hidden over a return and closed while locked. Every
   * dialog is, except androidx.biometric's own prompt, which on API 28 and below is the dialog
   * the lock screen unlocks through. Its fragments are matched by tag, which R8 never renames.
   */
  fun guardsDialog(tag: String?): Boolean = tag?.startsWith(BIOMETRIC_TAG_PREFIX) != true

  private const val BIOMETRIC_TAG_PREFIX = "androidx.biometric."
}
