
"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../lib/supabase";

type TestBusiness = {
  id: string;
  name: string;
  owner_id: string;
};

type TestProduct = {
  id: string;
  name: string;
  business_id: string;
};

type TestRecord = {
  table: string;
  id: string;
};

export default function AccountCheckPage() {
  const [email, setEmail] = useState("Checking...");
  const [businesses, setBusinesses] = useState<TestBusiness[]>([]);
  const [message, setMessage] = useState("Loading...");
  const [busy, setBusy] = useState(false);
  const [testRecords, setTestRecords] = useState<TestRecord[]>([]);
  const [testBusinessId, setTestBusinessId] = useState("");
  const [testProductId, setTestProductId] = useState("");

  async function loadBusinesses() {
    const supabase = createClient();
    const { data: userData, error: userError } =
      await supabase.auth.getUser();

    if (userError || !userData.user) {
      setEmail("No account signed in");
      setMessage("Please sign in first.");
      setBusinesses([]);
      return;
    }

    setEmail(userData.user.email ?? "Email unavailable");

    const { data, error } = await supabase
      .from("businesses")
      .select("id, name, owner_id");

    if (error) {
      setMessage("Query failed: " + error.message);
      return;
    }

    setBusinesses(data ?? []);
    setMessage(
      `Query successful. ${data?.length ?? 0} business(es) visible.`
    );
  }

  useEffect(() => {
    loadBusinesses();
  }, []);

  async function createTestDataset() {
    if (busy) return;

    setBusy(true);
    setMessage("Creating test dataset...");

    const supabase = createClient();
    const created: TestRecord[] = [];

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setMessage("Please sign in first.");
        return;
      }

      const { data: business, error: businessError } = await supabase
        .from("businesses")
        .insert({
          owner_id: user.id,
          name: "SmartFin RLS Test",
          currency: "INR",
        })
        .select("id, name, owner_id")
        .single();

      if (businessError || !business) {
        setMessage("Business insert failed: " + businessError?.message);
        return;
      }

      created.push({ table: "businesses", id: business.id });
      setTestBusinessId(business.id);

      const { data: product, error: productError } = await supabase
        .from("products")
        .insert({
          business_id: business.id,
          name: "RLS Test Product",
          category: "Test",
          selling_price: 100,
          cost_price: 60,
        })
        .select("id, name, business_id")
        .single();

      if (productError || !product) {
        setTestRecords(created);
        setMessage(
          "Business created, but product insert failed: " +
            productError?.message
        );
        await loadBusinesses();
        return;
      }

      created.push({ table: "products", id: product.id });
      setTestProductId(product.id);

      const { data: sale, error: saleError } = await supabase
        .from("sales")
        .insert({
          business_id: business.id,
          product_id: product.id,
          sale_date: new Date().toISOString().slice(0, 10),
          quantity: 2,
          selling_price: 100,
          cost_price: 60,
          revenue: 200,
          profit: 80,
        })
        .select("id")
        .single();

      if (saleError || !sale) {
        setTestRecords(created);
        setMessage(
          "Business and product created, but sale insert failed: " +
            saleError?.message
        );
        await loadBusinesses();
        return;
      }

      created.push({ table: "sales", id: sale.id });

      const forecastDate = new Date();
      forecastDate.setDate(forecastDate.getDate() + 1);

      const { data: forecast, error: forecastError } = await supabase
        .from("forecasts")
        .insert({
          business_id: business.id,
          product_id: product.id,
          forecast_date: forecastDate.toISOString().slice(0, 10),
          predicted_quantity: 3,
          predicted_revenue: 300,
          predicted_profit: 120,
          model: "RLS Test",
        })
        .select("id")
        .single();

      if (forecastError || !forecast) {
        setTestRecords(created);
        setMessage(
          "Earlier records created, but forecast insert failed: " +
            forecastError?.message
        );
        await loadBusinesses();
        return;
      }

      created.push({ table: "forecasts", id: forecast.id });

      const { data: recommendation, error: recommendationError } =
        await supabase
          .from("recommendations")
          .insert({
            business_id: business.id,
            product_id: product.id,
            recommendation_type: "test",
            message: "Temporary RLS isolation test",
            priority: "low",
          })
          .select("id")
          .single();

      if (recommendationError || !recommendation) {
        setTestRecords(created);
        setMessage(
          "Earlier records created, but recommendation insert failed: " +
            recommendationError?.message
        );
        await loadBusinesses();
        return;
      }

      created.push({
        table: "recommendations",
        id: recommendation.id,
      });

      setTestRecords(created);
      setMessage(
        "All five test records created successfully. Now test User B."
      );

      await loadBusinesses();
    } catch {
      setTestRecords(created);
      setMessage(
        "Unexpected error. Some test records may have been created. " +
          "Use the cleanup button below."
      );
    } finally {
      setBusy(false);
    }
  }

  async function checkRelatedTables() {
    const supabase = createClient();

    const checks = [
      "products",
      "sales",
      "forecasts",
      "recommendations",
    ] as const;

    const results: string[] = [];

    for (const table of checks) {
      let query = supabase
        .from(table)
        .select("id", { count: "exact", head: true });

      if (table === "products") {
        query = query.eq("id", testProductId) as typeof query;
      } else {
        query = query.eq("business_id", testBusinessId) as typeof query;
      }

      const { count, error } = await query;

      if (error) {
        results.push(`${table}: ERROR — ${error.message}`);
      } else {
        results.push(`${table}: ${count ?? 0} matching row(s) visible`);
      }
    }

    setMessage(results.join("\n"));
  }

  async function cleanupTestDataset() {
    if (busy) return;

    if (!testBusinessId) {
      setMessage(
        "No test business ID is saved on this page. " +
          "Refresh the page only if no test records were created."
      );
      return;
    }

    const confirmed = window.confirm(
      "Delete the temporary SmartFin RLS test records only? " +
        "This removes test recommendations, forecasts, sales, product, and business."
    );

    if (!confirmed) return;

    setBusy(true);
    const supabase = createClient();

    try {
      const tables = [
        "recommendations",
        "forecasts",
        "sales",
        "products",
        "businesses",
      ] as const;

      for (const table of tables) {
        const record = testRecords.find((item) => item.table === table);
        if (!record) continue;

        const { error } = await supabase
          .from(table)
          .delete()
          .eq("id", record.id);

        if (error) {
          setMessage(
            `Cleanup stopped at ${table}: ${error.message}. ` +
              "Some test records may remain."
          );
          return;
        }
      }

      setTestRecords([]);
      setTestBusinessId("");
      setTestProductId("");
      setMessage("Saved test records cleaned up successfully.");
      await loadBusinesses();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-bold">SmartFin RLS Test</h1>

      <p className="mt-4">
        Signed-in account: <strong>{email}</strong>
      </p>

      <p className="mt-2 whitespace-pre-wrap">{message}</p>

      <h2 className="mt-6 text-xl font-semibold">
        Businesses visible to this account
      </h2>

      {businesses.length === 0 ? (
        <p className="mt-2">No businesses visible.</p>
      ) : (
        <ul className="mt-2 list-disc pl-6">
          {businesses.map((business) => (
            <li key={business.id}>
              {business.name} — owner ID: {business.owner_id}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          onClick={createTestDataset}
          disabled={busy || !!testBusinessId}
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          Create test dataset
        </button>

        <button
          onClick={checkRelatedTables}
          disabled={!testBusinessId || !testProductId || busy}
          className="rounded border px-4 py-2 disabled:opacity-50"
        >
          Check related tables
        </button>

        <button
          onClick={cleanupTestDataset}
          disabled={!testBusinessId || busy}
          className="rounded bg-red-600 px-4 py-2 text-white disabled:opacity-50"
        >
          Clean up test records
        </button>

        <button
          onClick={loadBusinesses}
          disabled={busy}
          className="rounded border px-4 py-2 disabled:opacity-50"
        >
          Refresh business list
        </button>
      </div>

      {testBusinessId && (
        <p className="mt-4 break-all text-sm">
          Test business ID: {testBusinessId}
        </p>
      )}
    </main>
  );
}
