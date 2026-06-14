-- Powers: GET /api/charts/portfolio-balance
-- Grain:  one row per (servicer_number, business_date)
SELECT
    servicer_number, servicer_name, business_date,
    SUM(total_balance_usd)    AS total_balance_usd,
    SUM(balance_usd_millions) AS balance_usd_millions
FROM {{ ref('stg_servicer_metrics') }}
GROUP BY servicer_number, servicer_name, business_date
ORDER BY business_date, balance_usd_millions
