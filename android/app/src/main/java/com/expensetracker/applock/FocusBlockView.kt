package com.expensetracker.applock

import android.content.Context
import com.facebook.react.views.view.ReactViewGroup

class FocusBlockView(context: Context) : ReactViewGroup(context) {

  fun setBlocked(blocked: Boolean) {
    descendantFocusability =
        if (blocked) FOCUS_BLOCK_DESCENDANTS else FOCUS_BEFORE_DESCENDANTS
    if (blocked) {
      findFocus()?.clearFocus()
    }
  }
}
