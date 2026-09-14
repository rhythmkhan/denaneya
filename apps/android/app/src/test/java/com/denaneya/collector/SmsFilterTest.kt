package com.denaneya.collector

import com.denaneya.collector.receiver.SmsBroadcastReceiver
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SmsFilterTest {

    @Test
    fun testWhitelistedMfsSendersAccepted() {
        val validSenders = listOf(
            "bKash", "BKASH", "16247",
            "Nagad", "NAGAD", "16167",
            "Rocket", "ROCKET", "16216", "DBBL",
            "Upay", "UPAY", "16268", "UCB"
        )

        for (sender in validSenders) {
            assertTrue("Sender '$sender' must be accepted by whitelist", SmsBroadcastReceiver.isWhitelistedSender(sender))
            assertTrue("Sender '$sender' with surrounding whitespace must be accepted", SmsBroadcastReceiver.isWhitelistedSender("  $sender  "))
        }
    }

    @Test
    fun testNonMfsSendersRejected() {
        val spamAndTelcoSenders = listOf(
            "GP", "Grameenphone", "Banglalink", "BL", "Robi", "Airtel", "Teletalk",
            "121", "1234", "01712345678", "01899999999",
            "Foodpanda", "Pathao", "Uber", "Daraz", "Google", "Facebook", "Microsoft",
            null, "", "   "
        )

        for (sender in spamAndTelcoSenders) {
            assertFalse("Sender '$sender' must be rejected as non-MFS", SmsBroadcastReceiver.isWhitelistedSender(sender))
        }
    }

    @Test
    fun testMultipartSmsPduConcatenation() {
        val segment1 = "You have received Tk 1,500.00 from 01712345678. "
        val segment2 = "Fee Tk 0.00. Balance Tk 25,430.00. TrxID 9K28JA821."

        val bodyBuilder = StringBuilder()
        bodyBuilder.append(segment1)
        bodyBuilder.append(segment2)

        val fullMessage = bodyBuilder.toString()
        val expected = "You have received Tk 1,500.00 from 01712345678. Fee Tk 0.00. Balance Tk 25,430.00. TrxID 9K28JA821."

        assertEquals("Concatenated multipart message must match full body", expected, fullMessage)
        assertTrue(fullMessage.contains("TrxID 9K28JA821"))
        assertTrue(fullMessage.contains("1,500.00"))
    }
}
