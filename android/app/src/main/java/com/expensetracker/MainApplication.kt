package com.expensetracker

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.expensetracker.pincrypto.AppPinCryptoPackage

class MainApplication : Application(), ReactApplication {

  // This getDefaultReactHost overload is inherently bridgeless and always uses Hermes, so it does NOT
  // honor the gradle.properties newArchEnabled/hermesEnabled flags — valid only while both stay true.
  // AppPinCryptoPackage is a TurboModule and inherits that constraint.
  // Revisit if the app ever needs JSC or the old bridge.
  override val reactHost: ReactHost
    get() =
        getDefaultReactHost(
            context = applicationContext,
            // Packages in this app rather than a node_modules dependency are not autolinked.
            packageList = PackageList(this).packages.apply { add(AppPinCryptoPackage()) },
            jsMainModulePath = "index",
            useDevSupport = BuildConfig.DEBUG,
        )

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
