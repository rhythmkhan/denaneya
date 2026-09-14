# DenaNeya Android Collector Proguard Rules

# Keep data models serialized by kotlinx.serialization and Retrofit
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod
-keepclassmembers class * {
    @kotlinx.serialization.SerialName <fields>;
}

# SQLCipher
-keep class net.sqlcipher.** { *; }
-keep class net.sqlcipher.database.** { *; }

# ZXing Core
-keep class com.google.zxing.** { *; }

# AndroidX Room
-keep class * extends androidx.room.RoomDatabase
-dontwarn androidx.room.paging.**

# Keep Keystore and Security models
-keep class com.denaneya.collector.security.models.** { *; }
-keep class com.denaneya.collector.data.remote.dto.** { *; }
-keep class com.denaneya.collector.data.local.** { *; }
