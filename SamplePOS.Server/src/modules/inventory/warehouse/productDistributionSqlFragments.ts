/**
 * Reusable SQL: product visible at a store for POS / selling floor search.
 * @param productAlias - products table alias (e.g. 'p')
 * @param storeParamRef - bind param for store_location_id (e.g. '$1')
 */
export function productPosVisibleAtStoreSql(
    productAlias: string,
    storeParamRef: string,
): string {
    return `(
        (
            COALESCE(${productAlias}.distribution_policy::text, 'GLOBAL') = 'GLOBAL'
            AND NOT EXISTS (
                SELECT 1 FROM product_store_assignments psa_hide
                WHERE psa_hide.product_id = ${productAlias}.id
                  AND psa_hide.store_location_id = ${storeParamRef}
                  AND psa_hide.is_pos_visible = false
            )
        )
        OR (
            ${productAlias}.distribution_policy = 'RESTRICTED'
            AND EXISTS (
                SELECT 1 FROM product_store_assignments psa_restrict
                WHERE psa_restrict.product_id = ${productAlias}.id
                  AND psa_restrict.store_location_id = ${storeParamRef}
                  AND psa_restrict.is_assigned = true
                  AND psa_restrict.is_pos_visible = true
            )
        )
    )`;
}
