package com.expensetracker.applock

import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewGroupManager
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.viewmanagers.FocusBlockViewManagerDelegate
import com.facebook.react.viewmanagers.FocusBlockViewManagerInterface

@ReactModule(name = FocusBlockViewManager.NAME)
class FocusBlockViewManager :
    ViewGroupManager<FocusBlockView>(), FocusBlockViewManagerInterface<FocusBlockView> {

  private val delegate = FocusBlockViewManagerDelegate(this)

  override fun getDelegate(): ViewManagerDelegate<FocusBlockView> = delegate

  override fun getName(): String = NAME

  override fun createViewInstance(context: ThemedReactContext): FocusBlockView =
      FocusBlockView(context)

  @ReactProp(name = "blocked")
  override fun setBlocked(view: FocusBlockView, value: Boolean) {
    view.setBlocked(value)
  }

  @ReactProp(name = "concealed")
  override fun setConcealed(view: FocusBlockView, value: Boolean) {
    view.setConcealed(value)
  }

  companion object {
    const val NAME = "FocusBlockView"
  }
}
