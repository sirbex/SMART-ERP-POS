/** Shown when user tries to create SCN from RGRN before the GR has a supplier bill. */
export const SUPPLIER_BILL_REQUIRED_FOR_SCN_CODE = 'ERR_RETURN_GRN_001';

export const SUPPLIER_BILL_REQUIRED_FOR_SCN_MESSAGE =
    'Supplier bill required before credit note. ' +
    'This goods receipt has not been billed yet, so accounts payable cannot be reduced. ' +
    'Step 1: On this receipt, click **Create Supplier Bill**. ' +
    'Step 2: After the bill is created, click **Create Credit Note** on the posted return.';
