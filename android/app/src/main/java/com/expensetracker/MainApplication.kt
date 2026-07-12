package com.expensetracker

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  // This getDefaultReactHost overload is inherently bridgeless and always uses Hermes, so it does NOT
  // honor the gradle.properties newArchEnabled/hermesEnabled flags — valid only while both stay true.
  // Revisit if the app ever needs JSC or the old bridge.
  override val reactHost: ReactHost
    get() =
        getDefaultReactHost(
            context = applicationContext,
            // Packages that cannot be autolinked yet: PackageList(this).packages.apply { add(...) }
            packageList = PackageList(this).packages,
            jsMainModulePath = "index",
            useDevSupport = BuildConfig.DEBUG,
        )

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
