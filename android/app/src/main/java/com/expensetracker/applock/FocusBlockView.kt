package com.expensetracker.applock

import android.content.Context
import com.facebook.react.views.view.ReactViewGroup
import java.lang.ref.WeakReference

class FocusBlockView(context: Context) : ReactViewGroup(context) {

  private var concealed = false
  private var held = false
  private var requestedVisibility = VISIBLE

  fun setBlocked(blocked: Boolean) {
    descendantFocusability =
        if (blocked) FOCUS_BLOCK_DESCENDANTS else FOCUS_BEFORE_DESCENDANTS
    if (blocked) {
      findFocus()?.clearFocus()
    }
  }

  fun setConcealed(concealed: Boolean) {
    this.concealed = concealed
    applyVisibility()
  }

  fun setHeld(held: Boolean) {
    this.held = held
    applyVisibility()
  }

  // Fabric's layout pass sets VISIBLE on every update (SurfaceMountingManager.updateLayout).
  override fun setVisibility(visibility: Int) {
    requestedVisibility = visibility
    applyVisibility()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    attached = WeakReference(this)
  }

  override fun onDetachedFromWindow() {
    if (attached?.get() === this) {
      attached = null
    }
    super.onDetachedFromWindow()
  }

  private fun applyVisibility() {
    super.setVisibility(AppLockRules.resolvedVisibility(requestedVisibility, concealed, held))
  }

  companion object {
    private var attached: WeakReference<FocusBlockView>? = null

    fun current(): FocusBlockView? = attached?.get()
  }
}
