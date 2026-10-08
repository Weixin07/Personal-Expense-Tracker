package com.expensetracker.applock

import android.content.Context
import com.facebook.react.views.view.ReactViewGroup
import java.lang.ref.WeakReference

class FocusBlockView(context: Context) : ReactViewGroup(context) {

  private var concealed = false
  private var requestedVisibility = VISIBLE

  init {
    applyVisibility()
  }

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
    super.setVisibility(AppLockRules.resolvedVisibility(requestedVisibility, concealed, returnHeld))
  }

  companion object {
    private var attached: WeakReference<FocusBlockView>? = null
    private var returnHeld = false

    fun current(): FocusBlockView? = attached?.get()

    /**
     * Hides the app root until released, including a root built later for a recreated
     * activity. Main thread only.
     */
    fun holdReturn(held: Boolean) {
      returnHeld = held
      current()?.applyVisibility()
    }
  }
}
