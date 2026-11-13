"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../lib/supabase";
import ForecastChart from "./forecast-chart";

type Business = {
  id: string;
  name: string;
};

type Product = {
  id: string;
  name: string;
};

type Forecast = {
  id: string;
  product_id: string;
  forecast_date: string;
  predicted_quantity: number;
  predicted_revenue: number;
  predicted_profit: number;
  model: string;
};

export default function ForecastsPage() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [businessId, setBusinessId] = useState("");
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [status, setStatus] = useState("Loading...");
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const supabase = createClient();

  async function loadForecasts(id: string) {
    if (!id) {
      setForecasts([]);
      setProducts([]);
      return;
    }

    const today = new Date();
    const todayString = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0"),
    ].join("-");

    const { data: forecastData, error: forecastError } =
      await supabase
        .from("forecasts")
        .select(
          "id, product_id, forecast_date, predicted_quantity, predicted_revenue, predicted_profit, model"
        )
        .eq("business_id", id)
        .gte("forecast_date", todayString)
        .order("forecast_date", { ascending: true });

    if (forecastError) {
      setStatus(forecastError.message);
      return;
    }

    const { data: productData, error: productError } =
      await supabase
        .from("products")
        .select("id, name")
        .eq("business_id", id);

    if (productError) {
      setStatus(productError.message);
      return;
    }

    setForecasts((forecastData ?? []) as Forecast[]);
    setProducts((productData ?? []) as Product[]);

    setStatus(
      forecastData?.length
        ? `${forecastData.length} forecast records loaded.`
        : "No forecasts generated yet. Click Generate Forecast."
    );
  }

  useEffect(() => {
    let active = true;

    async function loadBusinesses() {
      const { data: auth, error: authError } =
        await supabase.auth.getUser();

      if (authError || !auth.user) {
        if (active) setStatus("Please sign in first.");
        return;
      }

      const { data, error } = await supabase
        .from("businesses")
        .select("id, name")
        .order("created_at", { ascending: true });

      if (!active) return;

      if (error) {
        setStatus(error.message);
        return;
      }

      const list = (data ?? []) as Business[];
      setBusinesses(list);

      if (list.length === 0) {
        setStatus("Create a business before generating forecasts.");
        return;
      }

      setBusinessId(list[0].id);
      await loadForecasts(list[0].id);
    }

    void loadBusinesses();

    return () => {
      active = false;
    };
  }, []);

  async function handleBusinessChange(id: string) {
    setBusinessId(id);
    setForecasts([]);
    setProducts([]);
    setStatus("Loading business forecasts...");

    await loadForecasts(id);

    // Refresh the chart for the newly selected business.
    setRefreshKey((previous) => previous + 1);
  }

  async function generateForecast() {
    if (!businessId) {
      setStatus("Please select a business.");
      return;
    }

    setBusy(true);
    setStatus("Calculating your 30-day forecast...");

    try {
      const response = await fetch("/api/forecasts/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ businessId }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ?? "Forecast generation failed."
        );
      }

      await loadForecasts(businessId);

      // Reload the chart after successful generation.
      setRefreshKey((previous) => previous + 1);

      setStatus(
        `${result.message} ${result.forecastCount} daily predictions saved.`
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Could not generate forecast."
      );
    } finally {
      setBusy(false);
    }
  }

  const productNames = new Map(
    products.map((product) => [product.id, product.name])
  );

  const totalRevenue = forecasts.reduce(
    (sum, item) => sum + Number(item.predicted_revenue),
    0
  );

  const totalProfit = forecasts.reduce(
    (sum, item) => sum + Number(item.predicted_profit),
    0
  );

  const totalQuantity = forecasts.reduce(
    (sum, item) => sum + Number(item.predicted_quantity),
    0
  );

  const money = (value: number) =>
    `₹${value.toLocaleString("en-IN", {
      maximumFractionDigits: 2,
    })}`;

  return (
    <main className="min-h-screen bg-[#080f1c] p-6 text-white sm:p-10">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-semibold tracking-widest text-emerald-400">
          SMARTFIN · FORECASTING
        </p>

        <h1 className="mt-3 text-3xl font-bold">
          Sales Forecast
        </h1>

        <p className="mt-2 text-slate-400">
          Predict product demand, revenue and profit for the next 30 days.
        </p>

        {/* Business selection */}
        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <label
            htmlFor="business"
            className="mb-2 block text-sm"
          >
            Select business
          </label>

          <select
            id="business"
            value={businessId}
            onChange={(event) =>
              void handleBusinessChange(event.target.value)
            }
            disabled={busy || businesses.length === 0}
            className="w-full max-w-lg rounded-lg border border-slate-700 bg-slate-950 p-3"
          >
            {businesses.map((business) => (
              <option key={business.id} value={business.id}>
                {business.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={generateForecast}
            disabled={busy || !businessId}
            className="mt-5 rounded-lg bg-emerald-400 px-5 py-3 font-semibold text-slate-950 disabled:opacity-50"
          >
            {busy
              ? "Calculating..."
              : "Generate 30-Day Forecast"}
          </button>

          {status && (
            <p
              className="mt-5 rounded-lg bg-slate-950 p-4 text-sm"
              role="status"
            >
              {status}
            </p>
          )}
        </section>

        {/* Forecast summary */}
        {forecasts.length > 0 && (
          <section className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <p className="text-sm text-slate-400">
                Forecast Revenue
              </p>
              <h2 className="mt-2 text-2xl font-bold">
                {money(totalRevenue)}
              </h2>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <p className="text-sm text-slate-400">
                Forecast Profit
              </p>
              <h2 className="mt-2 text-2xl font-bold">
                {money(totalProfit)}
              </h2>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <p className="text-sm text-slate-400">
                Forecast Units
              </p>
              <h2 className="mt-2 text-2xl font-bold">
                {totalQuantity.toFixed(2)}
              </h2>
            </div>
          </section>
        )}

        {/* Revenue chart - also visible when no forecasts exist */}
        {businessId && (
          <section className="mt-6">
            <ForecastChart
              businessId={businessId}
              refreshKey={refreshKey}
            />
          </section>
        )}

        {/* Forecast details */}
        {forecasts.length > 0 && (
          <section className="mt-6 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="mb-4 text-lg font-semibold">
              30-Day Forecast Details
            </h2>

            <table className="w-full min-w-[750px] text-left text-sm">
              <thead className="bg-slate-950 text-slate-400">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3">Product</th>
                  <th className="p-3">Quantity</th>
                  <th className="p-3">Revenue</th>
                  <th className="p-3">Profit</th>
                  <th className="p-3">Model</th>
                </tr>
              </thead>

              <tbody>
                {forecasts.map((item) => (
                  <tr
                    key={item.id}
                    className="border-t border-slate-800"
                  >
                    <td className="p-3">
                      {item.forecast_date}
                    </td>

                    <td className="p-3">
                      {productNames.get(item.product_id) ??
                        "Unknown product"}
                    </td>

                    <td className="p-3">
                      {Number(item.predicted_quantity).toFixed(2)}
                    </td>

                    <td className="p-3">
                      {money(Number(item.predicted_revenue))}
                    </td>

                    <td className="p-3">
                      {money(Number(item.predicted_profit))}
                    </td>

                    <td className="p-3 text-emerald-400">
                      {item.model}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </main>
  );
}