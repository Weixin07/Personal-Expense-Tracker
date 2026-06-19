# Project-specific ProGuard/R8 rules.
#
# React Native's own consumer rules ship inside the react-android AAR and keep
# @ReactModule / @ReactMethod / @DoNotStrip members, JNI entry points, Hermes,
# and the New Architecture (Fabric/TurboModule) codegen. Autolinked native
# modules that rely on those annotations therefore need nothing here; list only
# the gaps below.

# react-native-config reads every .env value out of BuildConfig by reflection,
# so R8 must not rename or remove that class.
-keep class com.expensetracker.BuildConfig { *; }

# The merged native library libreact_devsupportjni.so resolves
# com.facebook.react.devsupport.CxxInspectorPackagerConnection by name through
# JNI when InspectorFlags initializes at startup. R8 cannot see that native-side
# reference, strips the class, and the release build then crashes on launch with
# ClassNotFoundException. Keep the devsupport package so the JNI lookup resolves.
-keep class com.facebook.react.devsupport.** { *; }
-dontwarn com.facebook.react.devsupport.**
