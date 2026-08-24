# IsotopeAI ProGuard Rules
# ================================================================

# Capacitor & WebView
# ================================================================
# Keep Capacitor plugin classes and interfaces
-keep class com.getcapacitor.** { *; }
-keep class com.getcapacitor.plugin.** { *; }

# Keep WebView JavaScript interfaces
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep Capacitor bridge classes
-keep class com.getcapacitor.bridge.** { *; }
-keep class com.getcapacitor.plugin.** { *; }

# Keep Capacitor PluginHandle and PluginCall
-keep class com.getcapacitor.plugin.PluginHandle { *; }
-keep class com.getcapacitor.plugin.PluginCall { *; }

# ================================================================
# Capacitor Cordova Plugins
# ================================================================
-keep class org.apache.cordova.** { *; }
-keep class com.getcapacitor.cordova.** { *; }

# ================================================================
# Capacitor Plugins - Specific
# ================================================================
# Filesystem
-keep class com.capacitorjs.plugins.filesystem.** { *; }
-keep class com.capacitorjs.plugins.filesystem.* { *; }

# Local Notifications
-keep class com.capacitorjs.plugins.localnotifications.** { *; }

# Network
-keep class com.capacitorjs.plugins.network.** { *; }

# Preferences
-keep class com.capacitorjs.plugins.preferences.** { *; }

# Share
-keep class com.capacitorjs.plugins.share.** { *; }

# Splash Screen
-keep class com.capacitorjs.plugins.splashscreen.** { *; }

# Status Bar
-keep class com.capacitorjs.plugins.statusbar.** { *; }

# Camera (if used)
-keep class com.capacitorjs.plugins.camera.** { *; }

# Geolocation (if used)
-keep class com.capacitorjs.plugins.geolocation.** { *; }

# Haptics (if used)
-keep class com.capacitorjs.plugins.haptics.** { *; }

# Keyboard (if used)
-keep class com.capacitorjs.plugins.keyboard.** { *; }

# ================================================================
# Capacitor Community Plugins
# ================================================================
-keep class com.capacitorcommunity.** { *; }

# ================================================================
# Supabase / Realtime
# ================================================================
-keep class io.supabase.** { *; }
-keep class io.supabase.realtime.** { *; }

# ================================================================
# Gson / JSON Serialization
# ================================================================
-keepattributes Signature
-keepattributes *Annotation*
-keep class com.google.gson.** { *; }
-keep class com.google.gson.stream.** { *; }
-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName <fields>;
}

# ================================================================
# OkHttp / Okio
# ================================================================
-keep class okhttp3.** { *; }
-keep class okio.** { *; }
-keep class okhttp3.internal.publicsuffix.PublicSuffixDatabase

# ================================================================
# Kotlin Coroutines
# ================================================================
-keep class kotlinx.coroutines.** { *; }
-keep class kotlinx.coroutines.flow.** { *; }

# ================================================================
# AndroidX / Jetpack
# ================================================================
-keep class androidx.** { *; }

# ================================================================
# Kotlin Stdlib
# ================================================================
-keep class kotlin.** { *; }

# ================================================================
# Keep Parcelable implementations
# ================================================================
-keep class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}

# ================================================================
# Keep Serializable
# ================================================================
-keep class * implements java.io.Serializable {
    private static final long serialVersionUID;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# ================================================================
# Keep Enum values
# ================================================================
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# ================================================================
# Keep Native Methods
# ================================================================
-keepclasseswithmembernames class * {
    native <methods>;
}

# ================================================================
# Keep Native Library Loaders
# ================================================================
-keep class com.google.android.gms.** { *; }

# ================================================================
# Keep Annotations
# ================================================================
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes InnerClasses
-keepattributes EnclosingMethod

# ================================================================
# Preserve Line Numbers & Source File (for debugging)
# ================================================================
-keepattributes SourceFile,LineNumberTable

# ================================================================
# Rename Source File
# ================================================================
-renamesourcefileattribute SourceFile

# ================================================================
# WebView / Capacitor Bridge
# ================================================================
# Keep JavaScript interface classes used by WebView
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep Capacitor bridge classes
-keep class com.getcapacitor.JavaScriptObject { *; }
-keep class com.getcapacitor.bridge.** { *; }

# ================================================================
# Keep Resource Names
# ================================================================
-keep class **.R
-keep class **.R$* {
    <fields>;
}

# ================================================================
# Suppress Warnings
# ================================================================
-dontwarn com.getcapacitor.**
-dontwarn org.apache.cordova.**
-dontwarn com.google.gson.**
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn kotlinx.coroutines.**
-dontwarn androidx.**
-dontwarn kotlin.**
-dontwarn org.jetbrains.annotations.**

# ================================================================
# Optimize (R8 handles optimization automatically; ProGuard legacy options removed)
# ================================================================
# -optimizationpasses 5 (ProGuard only, R8 uses different optimization)
# -allowaccessmodification (R8 handles via keep rules)
# -mergeinterfacesaggressively (Not supported in R8)
# -overloadaggressively (Not supported in R8)
# -mergeclasses (Not supported in R8)
# -mergesequence (Not supported in R8)