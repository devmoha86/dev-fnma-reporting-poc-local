-- Staging: clean types + derive display-ready columns.
-- All mart models SELECT from this view, never from the raw seed.
SELECT
    unique_id,
    servicer_number,
    servicer_name,
    tenant_id,
    CAST(business_date AS DATE)                        AS business_date,
    region,
    CAST(loan_count AS INTEGER)                        AS loan_count,
    CAST(delinquency_rate AS DOUBLE)                   AS delinquency_rate,
    ROUND(CAST(delinquency_rate AS DOUBLE) * 100, 3)   AS delinquency_rate_pct,
    CAST(total_balance_usd AS DOUBLE)                  AS total_balance_usd,
    ROUND(CAST(total_balance_usd AS DOUBLE) / 1e6, 1)  AS balance_usd_millions,
    metric_status
FROM {{ ref('servicer_metrics') }}
