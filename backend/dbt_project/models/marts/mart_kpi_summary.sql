-- Powers: GET /api/kpi-summary
-- Grain:  one row per (servicer_number, business_date)
SELECT
    servicer_number, servicer_name, business_date, region,
    loan_count, delinquency_rate, delinquency_rate_pct,
    total_balance_usd, balance_usd_millions, metric_status
FROM {{ ref('stg_servicer_metrics') }}
ORDER BY business_date, servicer_number
