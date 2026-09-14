package com.denaneya.collector.data.local

import android.content.Context
import android.util.Log
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.denaneya.collector.security.SecureStorage
import net.zetetic.database.sqlcipher.SupportOpenHelperFactory

@Database(
    entities = [CollectorEventEntity::class],
    version = 1,
    exportSchema = false
)
abstract class CollectorDatabase : RoomDatabase() {

    abstract fun collectorEventDao(): CollectorEventDao

    companion object {
        private const val TAG = "CollectorDatabase"
        private const val DB_NAME = "denaneya_collector.db"

        @Volatile
        private var INSTANCE: CollectorDatabase? = null

        fun getInstance(context: Context): CollectorDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: buildDatabase(context.applicationContext).also { INSTANCE = it }
            }
        }

        private fun buildDatabase(appContext: Context): CollectorDatabase {
            val builder = Room.databaseBuilder(appContext, CollectorDatabase::class.java, DB_NAME)
                .fallbackToDestructiveMigration()

            try {
                // Initialize SQLCipher passphrase
                val secureStorage = SecureStorage.getInstance(appContext)
                val passphrase = secureStorage.getOrCreateDatabasePassphrase()
                val factory = SupportOpenHelperFactory(passphrase)
                builder.openHelperFactory(factory)
            } catch (e: Exception) {
                Log.w(TAG, "SQLCipher initialization warning, falling back to standard factory: ${e.message}")
            }

            return builder.build()
        }
    }
}
