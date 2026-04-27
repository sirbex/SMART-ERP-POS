package com.smarterp.pos

/**
 * ReceiptData — mirrors the TypeScript `ReceiptData` interface in
 * `samplepos.client/src/lib/print.ts`.
 *
 * Gson deserialises the JSON string sent from the JS bridge into this class.
 * Fields must match the camelCase keys the frontend serialises.
 */
data class ReceiptData(
    val saleNumber: String = "",
    val saleDate: String = "",
    val totalAmount: Double = 0.0,
    val subtotal: Double? = null,
    val discountAmount: Double? = null,
    val taxAmount: Double? = null,
    val cashierName: String? = null,
    val items: List<ReceiptItem>? = null,
    val paymentMethod: String? = null,
    val amountPaid: Double? = null,
    val changeAmount: Double? = null,
    val payments: List<SplitPayment>? = null,
    val changeGiven: Double? = null,
    val customerName: String? = null,
    val companyName: String? = null,
    val companyAddress: String? = null,
    val companyPhone: String? = null,
    val customReceiptNote: String? = null,
)

data class ReceiptItem(
    val name: String = "",
    val quantity: Double = 0.0,
    val unitPrice: Double = 0.0,
    val subtotal: Double = 0.0,
    val uom: String? = null,
    val discountAmount: Double? = null,
)

data class SplitPayment(
    val method: String = "",
    val amount: Double = 0.0,
    val reference: String? = null,
)
