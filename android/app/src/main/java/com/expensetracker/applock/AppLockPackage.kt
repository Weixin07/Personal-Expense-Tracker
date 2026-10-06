package com.expensetracker.applock

import com.expensetracker.pincrypto.NativeAppLockWindowSpec
import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.ModuleSpec
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class AppLockPackage : BaseReactPackage() {

  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
      if (name == NativeAppLockWindowSpec.NAME) AppLockWindowModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(
        NativeAppLockWindowSpec.NAME to
            ReactModuleInfo(
                NativeAppLockWindowSpec.NAME,
                AppLockWindowModule::class.java.name,
                false,
                false,
                false,
                true,
            ))
  }

  override fun getViewManagers(reactContext: ReactApplicationContext): List<ModuleSpec> =
      listOf(ModuleSpec.viewManagerSpec { FocusBlockViewManager() })
}
