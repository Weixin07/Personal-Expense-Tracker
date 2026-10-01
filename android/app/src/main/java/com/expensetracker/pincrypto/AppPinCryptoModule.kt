package com.expensetracker.pincrypto

import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.util.Base64
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.UiThreadUtil
import java.security.SecureRandom
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

/**
 * PBKDF2 and secure random for the app PIN, whether the device has a secure
 * lock screen, and the system prompt that confirms it. The crypto methods
 * resolve on a background thread: at the calibrated iteration count a
 * derivation takes roughly a quarter second, and it sits on the unlock path.
 */
class AppPinCryptoModule(reactContext: ReactApplicationContext) :
    NativeAppPinCryptoSpec(reactContext) {

  private val executor: ExecutorService = Executors.newSingleThreadExecutor()
  private val secureRandom = SecureRandom()
  private var pendingCredential: Promise? = null

  private val credentialResultListener =
      object : BaseActivityEventListener() {
        override fun onActivityResult(
            activity: Activity,
            requestCode: Int,
            resultCode: Int,
            data: Intent?,
        ) {
          if (requestCode != DEVICE_CREDENTIAL_REQUEST_CODE) {
            return
          }
          val promise = pendingCredential ?: return
          pendingCredential = null
          promise.resolve(resultCode == Activity.RESULT_OK)
        }
      }

  init {
    reactContext.addActivityEventListener(credentialResultListener)
  }

  override fun randomBytesBase64(byteCount: Double, promise: Promise) {
    executor.execute {
      try {
        val count = byteCount.toInt()
        require(count in 1..MAX_RANDOM_BYTES) {
          "byteCount must be between 1 and $MAX_RANDOM_BYTES"
        }
        val bytes = ByteArray(count)
        secureRandom.nextBytes(bytes)
        promise.resolve(Base64.encodeToString(bytes, Base64.NO_WRAP))
      } catch (error: Exception) {
        promise.reject(ERROR_CODE, error.message, error)
      }
    }
  }

  override fun pbkdf2Sha256Base64(
      password: String,
      saltBase64: String,
      iterations: Double,
      keyLengthBits: Double,
      promise: Promise,
  ) {
    executor.execute {
      var spec: PBEKeySpec? = null
      try {
        val salt = Base64.decode(saltBase64, Base64.NO_WRAP)
        spec =
            PBEKeySpec(
                password.toCharArray(),
                salt,
                iterations.toInt(),
                keyLengthBits.toInt(),
            )
        val derived = SecretKeyFactory.getInstance(ALGORITHM).generateSecret(spec).encoded
        promise.resolve(Base64.encodeToString(derived, Base64.NO_WRAP))
      } catch (error: Exception) {
        promise.reject(ERROR_CODE, error.message, error)
      } finally {
        // Best effort only: the bridge already delivered the PIN as an
        // immutable String that cannot be wiped, which is why callers keep its
        // lifetime short rather than relying on this.
        spec?.clearPassword()
      }
    }
  }

  /**
   * `isDeviceSecure`, not `isKeyguardSecure`: the latter also answers true for a
   * locked SIM, which does not satisfy Keystore's secure-lock-screen
   * precondition for authentication-bound keys.
   */
  override fun isDeviceSecure(promise: Promise) {
    try {
      val keyguard =
          reactApplicationContext.getSystemService(Context.KEYGUARD_SERVICE)
              as KeyguardManager?
      if (keyguard == null) {
        promise.reject(ERROR_CODE, "KeyguardManager unavailable")
        return
      }
      promise.resolve(keyguard.isDeviceSecure)
    } catch (error: Exception) {
      promise.reject(ERROR_CODE, error.message, error)
    }
  }

  /**
   * Not bound to any Keystore key, so it still works after the lock screen was
   * removed and re-added, which permanently invalidates authentication-bound
   * keys.
   */
  override fun confirmDeviceCredential(
      title: String,
      description: String,
      promise: Promise,
  ) {
    UiThreadUtil.runOnUiThread {
      try {
        if (pendingCredential != null) {
          promise.reject(IN_PROGRESS_CODE, "A device credential prompt is already showing")
          return@runOnUiThread
        }
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
          promise.reject(NO_ACTIVITY_CODE, "No activity to show the prompt from")
          return@runOnUiThread
        }
        val keyguard =
            reactApplicationContext.getSystemService(Context.KEYGUARD_SERVICE)
                as KeyguardManager?
        // TODO: when minSdkVersion reaches 30, replace with BiometricPrompt +
        // DEVICE_CREDENTIAL from androidx.biometric.
        val intent =
            if (keyguard?.isDeviceSecure == true) {
              @Suppress("DEPRECATION")
              keyguard.createConfirmDeviceCredentialIntent(title, description)
            } else {
              null
            }
        if (intent == null) {
          promise.reject(NO_DEVICE_CREDENTIAL_CODE, "The device has no screen lock")
          return@runOnUiThread
        }
        pendingCredential = promise
        activity.startActivityForResult(intent, DEVICE_CREDENTIAL_REQUEST_CODE)
      } catch (error: Exception) {
        pendingCredential = null
        promise.reject(ERROR_CODE, error.message, error)
      }
    }
  }

  override fun invalidate() {
    reactApplicationContext.removeActivityEventListener(credentialResultListener)
    pendingCredential?.reject(NO_ACTIVITY_CODE, "The module was torn down")
    pendingCredential = null
    executor.shutdown()
    super.invalidate()
  }

  private companion object {
    /**
     * The SHA-1 factory truncates each password character to eight bits, so its
     * output does not match other platforms' for non-ASCII input. The SHA-256
     * factory does not, and it needs API 26 against a minSdk of 28.
     */
    const val ALGORITHM = "PBKDF2WithHmacSHA256"
    const val ERROR_CODE = "app_pin_crypto_error"
    const val MAX_RANDOM_BYTES = 1024
    const val NO_DEVICE_CREDENTIAL_CODE = "no_device_credential"
    const val NO_ACTIVITY_CODE = "no_activity"
    const val IN_PROGRESS_CODE = "in_progress"

    /** Must stay unique among every module handling results on `MainActivity`. */
    const val DEVICE_CREDENTIAL_REQUEST_CODE = 24091
  }
}
