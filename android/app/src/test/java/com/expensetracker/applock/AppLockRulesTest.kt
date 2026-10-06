package com.expensetracker.applock

import android.view.View
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AppLockRulesTest {

  @Test
  fun lockIsDueOnceTheTimeoutHasElapsed() {
    assertTrue(AppLockRules.pastIdleDeadline(pausedAtMs = 1_000, timeoutMs = 60_000, nowMs = 61_000))
    assertTrue(AppLockRules.pastIdleDeadline(pausedAtMs = 1_000, timeoutMs = 60_000, nowMs = 90_000))
  }

  @Test
  fun lockIsNotDueBeforeTheTimeout() {
    assertFalse(AppLockRules.pastIdleDeadline(pausedAtMs = 1_000, timeoutMs = 60_000, nowMs = 60_999))
  }

  @Test
  fun immediatelyIsDueOnEveryReturn() {
    assertTrue(AppLockRules.pastIdleDeadline(pausedAtMs = 1_000, timeoutMs = 0, nowMs = 1_000))
  }

  @Test
  fun neverAndUnpausedAreNotDue() {
    assertFalse(AppLockRules.pastIdleDeadline(pausedAtMs = 1_000, timeoutMs = null, nowMs = 10_000_000))
    assertFalse(AppLockRules.pastIdleDeadline(pausedAtMs = null, timeoutMs = 0, nowMs = 10_000))
  }

  @Test
  fun appRootIsHiddenWhileConcealedOrHeld() {
    assertEquals(View.INVISIBLE, AppLockRules.resolvedVisibility(View.VISIBLE, concealed = true, held = false))
    assertEquals(View.INVISIBLE, AppLockRules.resolvedVisibility(View.VISIBLE, concealed = false, held = true))
    assertEquals(View.INVISIBLE, AppLockRules.resolvedVisibility(View.VISIBLE, concealed = true, held = true))
  }

  @Test
  fun everyDialogIsGuarded() {
    assertTrue(AppLockRules.guardsDialog("com.facebook.catalyst.react.dialog.DialogModule"))
    assertTrue(AppLockRules.guardsDialog("android:support:dialog"))
    assertTrue(AppLockRules.guardsDialog(null))
  }

  @Test
  fun theBiometricPromptIsLeftAlone() {
    assertFalse(AppLockRules.guardsDialog("androidx.biometric.FingerprintDialogFragment"))
    assertFalse(AppLockRules.guardsDialog("androidx.biometric.BiometricFragment"))
  }

  @Test
  fun appRootFollowsFabricOtherwise() {
    assertEquals(View.VISIBLE, AppLockRules.resolvedVisibility(View.VISIBLE, concealed = false, held = false))
    assertEquals(View.GONE, AppLockRules.resolvedVisibility(View.GONE, concealed = false, held = false))
  }
}
