
"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

import { createClient } from "../../lib/supabase";

type ChartPoint = {
  date: string;
  actualRevenue: number | null;
  forecastRevenue: number | null;
};

type Props = {
  businessId: string;
  refreshKey?: number;
};

type SaleRecord = {
  sale_date: string;
  revenue: number | string | null;
};

type ForecastRecord = {
  forecast_date: string;
  predicted_revenue: number | string | null;
};

function dateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function safeNumber(value: number | string | null) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

export default function ForecastChart({
  businessId,
  refreshKey = 0,
}: Props) {
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [forecastCount, setForecastCount] = useState(0);

  useEffect(() => {
    if (!businessId) {
      setChartData([]);
      setForecastCount(0);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadChartData() {
      setLoading(true);
      setError("");

      try {
        const supabase = createClient();

        const today = new Date();
        const todayString = dateString(today);
        const futureDate = dateString(addDays(today, 30));

        // Fetch historical sales.
        const { data: sales, error: salesError } = await supabase
          .from("sales")
          .select("sale_date, revenue")
          .eq("business_id", businessId)
          .lte("sale_date", todayString)
          .order("sale_date", { ascending: true });

        if (salesError) throw salesError;

        // Fetch future forecasts.
        const { data: forecasts, error: forecastError } =
          await supabase
            .from("forecasts")
            .select("forecast_date, predicted_revenue")
            .eq("business_id", businessId)
            .gt("forecast_date", todayString)
            .lte("forecast_date", futureDate)
            .order("forecast_date", { ascending: true });

        if (forecastError) throw forecastError;

        const points = new Map<string, ChartPoint>();

        // Aggregate actual revenue by date.
        for (const sale of (sales ?? []) as SaleRecord[]) {
          const existing = points.get(sale.sale_date) ?? {
            date: sale.sale_date,
            actualRevenue: 0,
            forecastRevenue: null,
          };

          existing.actualRevenue =
            (existing.actualRevenue ?? 0) +
            safeNumber(sale.revenue);

          points.set(sale.sale_date, existing);
        }

        // Aggregate forecast revenue across products.
        for (const forecast of (forecasts ?? []) as ForecastRecord[]) {
          const existing = points.get(forecast.forecast_date) ?? {
            date: forecast.forecast_date,
            actualRevenue: null,
            forecastRevenue: 0,
          };

          existing.forecastRevenue =
            (existing.forecastRevenue ?? 0) +
            safeNumber(forecast.predicted_revenue);

          points.set(forecast.forecast_date, existing);
        }

        const result = Array.from(points.values()).sort(
          (a, b) => a.date.localeCompare(b.date)
        );

        if (!cancelled) {
          setChartData(result);
          setForecastCount((forecasts ?? []).length);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load forecast chart."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadChartData();

    return () => {
      cancelled = true;
    };
  }, [businessId, refreshKey]);

  const formatCurrency = (value: number) =>
    `₹${value.toLocaleString("en-IN", {
      maximumFractionDigits: 0,
    })}`;

  const formatDate = (value: string) => {
    const [, month, day] = value.split("-");
    return `${day}/${month}`;
  };

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <div className="mb-5">
        <h2 className="text-xl font-semibold text-white">
          Revenue Forecast Analysis
        </h2>

        <p className="mt-1 text-sm text-slate-400">
          Historical revenue compared with predicted revenue
          for the next 30 days.
        </p>

        {!loading && !error && (
          <p className="mt-2 text-xs text-emerald-400">
            {forecastCount} forecast records loaded
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex h-80 items-center justify-center text-slate-400">
          Loading revenue chart...
        </div>
      ) : error ? (
        <div className="rounded-lg bg-red-950/40 p-4 text-sm text-red-300">
          {error}
        </div>
      ) : chartData.length === 0 ? (
        <div className="flex h-80 items-center justify-center text-slate-400">
          No historical sales or forecast data available.
        </div>
      ) : (
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{
                top: 10,
                right: 20,
                left: 10,
                bottom: 10,
              }}
            >
              <CartesianGrid
                stroke="#263449"
                strokeDasharray="4 4"
              />

              <XAxis
                dataKey="date"
                stroke="#94a3b8"
                tick={{ fontSize: 11 }}
                tickFormatter={formatDate}
                interval="preserveStartEnd"
              />

              <YAxis
                stroke="#94a3b8"
                tick={{ fontSize: 11 }}
                tickFormatter={formatCurrency}
                width={90}
                domain={[0, "auto"]}
              />

              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: "10px",
                  color: "#ffffff",
                }}
                labelStyle={{
                  color: "#cbd5e1",
                  marginBottom: "8px",
                }}
                formatter={(value, name) => [
                  value == null
                    ? "—"
                    : formatCurrency(Number(value)),
                  name,
                ]}
                labelFormatter={(label) =>
                  `Date: ${label}`
                }
              />

              <Legend />

              <Line
                type="monotone"
                dataKey="actualRevenue"
                name="Actual Revenue"
                stroke="#06b6d4"
                strokeWidth={2.5}
                dot={false}
                connectNulls={false}
                activeDot={{ r: 5 }}
              />

              <Line
                type="monotone"
                dataKey="forecastRevenue"
                name="Forecast Revenue"
                stroke="#00d6a0"
                strokeWidth={2.5}
                strokeDasharray="7 5"
                dot={false}
                connectNulls={false}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
