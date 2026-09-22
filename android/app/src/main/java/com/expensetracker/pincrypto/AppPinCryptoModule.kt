package com.expensetracker.pincrypto

import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import java.security.SecureRandom
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

/**
 * PBKDF2 and secure random for the app PIN. Both methods resolve on a
 * background thread: at the calibrated iteration count a derivation takes
 * roughly a quarter second, and it sits on the unlock path.
 */
class AppPinCryptoModule(reactContext: ReactApplicationContext) :
    NativeAppPinCryptoSpec(reactContext) {

  private val executor: ExecutorService = Executors.newSingleThreadExecutor()
  private val secureRandom = SecureRandom()

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

  override fun invalidate() {
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
  }
}
