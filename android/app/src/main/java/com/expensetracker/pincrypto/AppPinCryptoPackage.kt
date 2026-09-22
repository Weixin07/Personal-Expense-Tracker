package com.expensetracker.pincrypto

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class AppPinCryptoPackage : BaseReactPackage() {

  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
      if (name == NativeAppPinCryptoSpec.NAME) AppPinCryptoModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(
        NativeAppPinCryptoSpec.NAME to
            ReactModuleInfo(
                NativeAppPinCryptoSpec.NAME,
                AppPinCryptoModule::class.java.name,
                false,
                false,
                false,
                true,
            ))
  }
}
