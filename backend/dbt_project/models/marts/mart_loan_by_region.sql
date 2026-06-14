-- Powers: GET /api/charts/loan-by-region
-- Grain:  one row per (region, servicer_number, business_date)
SELECT
    region, servicer_number, servicer_name, business_date,
    SUM(loan_count) AS loan_count
FROM {{ ref('stg_servicer_metrics') }}
GROUP BY region, servicer_number, servicer_name, business_date
ORDER BY region, servicer_number, business_date
