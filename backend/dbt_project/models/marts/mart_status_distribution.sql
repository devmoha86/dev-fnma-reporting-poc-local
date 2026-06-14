-- Powers: GET /api/charts/status-distribution
-- Grain:  one row per (metric_status, business_date)
SELECT
    metric_status, business_date,
    COUNT(DISTINCT servicer_number) AS servicer_count
FROM {{ ref('stg_servicer_metrics') }}
GROUP BY metric_status, business_date
ORDER BY business_date, metric_status
