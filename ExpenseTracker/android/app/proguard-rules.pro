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
