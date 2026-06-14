-- Powers: GET /api/charts/delinquency-trend
-- Grain:  one row per (servicer_number, business_date)
SELECT servicer_number, servicer_name, business_date, delinquency_rate_pct
FROM {{ ref('stg_servicer_metrics') }}
ORDER BY servicer_number, business_date
