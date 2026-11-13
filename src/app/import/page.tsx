"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import Papa from "papaparse";
import { createClient } from "../../lib/supabase";

type Business = { id: string; name: string };

type SaleRow = {
  sale_date: string;
  product_id: string;
  product_name: string;
  category: string;
  quantity: number;
  unit_selling_price: number;
  unit_cost_price: number;
  discount: number;
  sales_channel: string;
};

const REQUIRED = [
  "sale_date",
  "product_id",
  "product_name",
  "category",
  "quantity",
  "unit_selling_price",
  "unit_cost_price",
  "discount",
  "sales_channel",
];

export default function ImportPage() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [businessId, setBusinessId] = useState("");
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadBusinesses() {
      try {
        const supabase = createClient();
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;

        if (!auth.user) {
          if (active) setStatus("Please sign in before importing sales.");
          return;
        }

        const { data, error } = await supabase
          .from("businesses")
          .select("id, name")
          .order("created_at", { ascending: true });

        if (error) throw error;
        if (!active) return;

        const availableBusinesses = (data ?? []) as Business[];
        setBusinesses(availableBusinesses);
        setBusinessId(availableBusinesses[0]?.id ?? "");

        if (availableBusinesses.length === 0) {
          setStatus("No business found. Create a business first.");
        }
      } catch (error) {
        if (active) {
          setStatus(
            error instanceof Error
              ? `Could not load businesses: ${error.message}`
              : "Could not load businesses."
          );
        }
      }
    }

    void loadBusinesses();
    return () => {
      active = false;
    };
  }, []);

  function parseNumber(value: string): number | null {
    if (value === undefined || value === null || !value.trim()) return null;
    const parsed = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setRows([]);
    setErrors([]);
    setStatus("");

    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setStatus("Please choose a CSV file.");
      event.target.value = "";
      return;
    }

    setBusy(true);
    try {
      const parsed = Papa.parse<Record<string, string>>(await file.text(), {
        header: true,
        skipEmptyLines: "greedy",
        transformHeader: (header) => header.trim().toLowerCase(),
      });

      if (parsed.errors.length > 0) {
        setStatus(`CSV error: ${parsed.errors[0].message}`);
        return;
      }

      const headers = parsed.meta.fields ?? [];
      const missing = REQUIRED.filter((header) => !headers.includes(header));
      if (missing.length > 0) {
        setStatus(`Missing columns: ${missing.join(", ")}`);
        return;
      }

      const validRows: SaleRow[] = [];
      const problems: string[] = [];

      parsed.data.forEach((record, index) => {
        const line = index + 2;
        const date = (record.sale_date ?? "").trim();
        const dateValid =
          /^\d{4}-\d{2}-\d{2}$/.test(date) &&
          !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) &&
          new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;

        const productId = (record.product_id ?? "").trim();
        const productName = (record.product_name ?? "").trim();
        const category = (record.category ?? "").trim() || "Uncategorized";
        const quantity = parseNumber(record.quantity ?? "");
        const price = parseNumber(record.unit_selling_price ?? "");
        const cost = parseNumber(record.unit_cost_price ?? "");
        const discount = parseNumber(record.discount ?? "0");

        let valid = true;
        if (!dateValid) {
          problems.push(`Row ${line}: use a valid YYYY-MM-DD date.`);
          valid = false;
        }
        if (!productId) {
          problems.push(`Row ${line}: product_id is required.`);
          valid = false;
        }
        if (!productName) {
          problems.push(`Row ${line}: product_name is required.`);
          valid = false;
        }
        if (quantity === null || quantity <= 0) {
          problems.push(`Row ${line}: quantity must be greater than zero.`);
          valid = false;
        }
        if (price === null || price < 0) {
          problems.push(`Row ${line}: selling price must be zero or greater.`);
          valid = false;
        }
        if (cost === null || cost < 0) {
          problems.push(`Row ${line}: cost price must be zero or greater.`);
          valid = false;
        }
        if (discount === null || discount < 0) {
          problems.push(`Row ${line}: discount must be zero or greater.`);
          valid = false;
        }

        if (
          !valid ||
          quantity === null ||
          price === null ||
          cost === null ||
          discount === null
        ) {
          return;
        }

        if (discount > quantity * price) {
          problems.push(`Row ${line}: discount exceeds total sales value.`);
          return;
        }

        validRows.push({
          sale_date: date,
          product_id: productId,
          product_name: productName,
          category,
          quantity,
          unit_selling_price: price,
          unit_cost_price: cost,
          discount,
          sales_channel: (record.sales_channel ?? "").trim(),
        });
      });

      setRows(validRows);
      setErrors(problems);
      setStatus(
        validRows.length > 0
          ? `${validRows.length} valid rows ready for review.`
          : "No valid rows found."
      );
    } catch {
      setStatus("Could not read the file. Please try a UTF-8 CSV.");
    } finally {
      setBusy(false);
    }
  }

  async function importSales() {
    if (!businessId || rows.length === 0) {
      setStatus("Select a business and upload a valid CSV first.");
      return;
    }

    setBusy(true);
    setStatus("");

    try {
      const supabase = createClient();
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!auth.user) throw new Error("Please sign in again.");

      const { data: business, error: businessError } = await supabase
        .from("businesses")
        .select("id, name")
        .eq("id", businessId)
        .single();

      if (businessError || !business) {
        throw new Error("Selected business is unavailable to this account.");
      }

      const { data: existingProducts, error: productsError } = await supabase
        .from("products")
        .select("id, name")
        .eq("business_id", businessId);

      if (productsError) throw productsError;

      const productMap = new Map<string, string>();
      for (const product of existingProducts ?? []) {
        productMap.set(product.name.trim().toLowerCase(), product.id);
      }

      for (const row of rows) {
        const key = row.product_name.trim().toLowerCase();
        if (productMap.has(key)) continue;

        const { data: newProduct, error: createProductError } = await supabase
          .from("products")
          .insert({
            business_id: businessId,
            name: row.product_name,
            category: row.category,
            selling_price: row.unit_selling_price,
            cost_price: row.unit_cost_price,
          })
          .select("id, name")
          .single();

        if (createProductError || !newProduct) {
          throw new Error(
            `Could not create product "${row.product_name}": ${
              createProductError?.message ?? "Unknown error"
            }`
          );
        }
        productMap.set(key, newProduct.id);
      }

      const salesToInsert = rows.map((row) => {
        const productId = productMap.get(row.product_name.trim().toLowerCase());
        if (!productId) throw new Error(`Product not found: ${row.product_name}`);

        // Do not insert generated revenue/profit columns.
        // The discount is reflected in the effective unit selling price.
        const effectivePrice =
          row.unit_selling_price - row.discount / row.quantity;

        return {
          business_id: businessId,
          product_id: productId,
          sale_date: row.sale_date,
          quantity: row.quantity,
          selling_price: Number(effectivePrice.toFixed(2)),
          cost_price: row.unit_cost_price,
        };
      });

      let insertedCount = 0;
      for (let index = 0; index < salesToInsert.length; index += 100) {
        const batch = salesToInsert.slice(index, index + 100);
        const { error: insertError } = await supabase
          .from("sales")
          .insert(batch);

        if (insertError) {
          throw new Error(
            `Import stopped after ${insertedCount} records: ${insertError.message}. Check the sales table before retrying to avoid duplicate records.`
          );
        }
        insertedCount += batch.length;
      }

      setStatus(
        `Successfully imported ${insertedCount} sales records into "${business.name}".`
      );
      setRows([]);
      setErrors([]);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Import failed. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#080f1c] p-6 text-white sm:p-10">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-semibold tracking-widest text-emerald-400">
          SMARTFIN · DATA IMPORT
        </p>
        <h1 className="mt-3 text-3xl font-bold">Import company sales</h1>
        <p className="mt-2 text-slate-400">
          Upload historical sales records to prepare them for forecasting.
        </p>

        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <label htmlFor="business" className="mb-2 block text-sm">
            Select business
          </label>
          <select
            id="business"
            value={businessId}
            onChange={(event) => setBusinessId(event.target.value)}
            disabled={busy}
            className="w-full max-w-lg rounded-lg border border-slate-700 bg-slate-950 p-3"
          >
            <option value="">Select a business</option>
            {businesses.map((business) => (
              <option key={business.id} value={business.id}>
                {business.name}
              </option>
            ))}
          </select>

          <div className="mt-6 rounded-xl border border-dashed border-slate-600 p-8 text-center">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFile}
              disabled={busy}
              className="block w-full text-sm text-slate-300 file:mr-4 file:rounded-lg file:border-0 file:bg-emerald-400 file:px-4 file:py-2 file:font-semibold file:text-slate-950"
            />
            <p className="mt-4 text-xs leading-6 text-slate-400">
              Required headers:
              <br />
              {REQUIRED.join(", ")}
            </p>
          </div>

          {status && (
            <p className="mt-5 rounded-lg bg-slate-950 p-4 text-sm" role="status">
              {status}
            </p>
          )}

          {errors.length > 0 && (
            <div className="mt-4 max-h-48 overflow-auto rounded-lg border border-amber-500/30 p-4 text-sm text-amber-200">
              <p className="font-semibold">
                {errors.length} row validation issue(s)
              </p>
              {errors.slice(0, 50).map((error, index) => (
                <p key={`${index}-${error}`} className="mt-1">
                  {error}
                </p>
              ))}
              {errors.length > 50 && (
                <p className="mt-2">Only the first 50 issues are displayed.</p>
              )}
            </div>
          )}
        </section>

        {rows.length > 0 && (
          <section className="mt-6 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <h2 className="font-semibold">CSV preview</h2>
                <p className="mt-1 text-sm text-slate-400">
                  {rows.length} valid sales rows
                </p>
              </div>
              <button
                type="button"
                onClick={importSales}
                disabled={busy || !businessId}
                className="rounded-lg bg-emerald-400 px-5 py-3 font-semibold text-slate-950 disabled:opacity-50"
              >
                {busy ? "Processing..." : "Import sales"}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="bg-slate-950 text-slate-400">
                  <tr>
                    <th className="p-3">Date</th>
                    <th className="p-3">Product</th>
                    <th className="p-3">Quantity</th>
                    <th className="p-3">Revenue</th>
                    <th className="p-3">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 100).map((row, index) => {
                    const revenue =
                      row.quantity * row.unit_selling_price - row.discount;
                    const profit =
                      revenue - row.quantity * row.unit_cost_price;

                    return (
                      <tr
                        key={`${row.sale_date}-${row.product_id}-${index}`}
                        className="border-t border-slate-800"
                      >
                        <td className="p-3">{row.sale_date}</td>
                        <td className="p-3">{row.product_name}</td>
                        <td className="p-3">{row.quantity}</td>
                        <td className="p-3">₹{revenue.toFixed(2)}</td>
                        <td className="p-3">₹{profit.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {rows.length > 100 && (
                <p className="p-4 text-xs text-slate-400">
                  Previewing 100 rows. All valid rows will be imported.
                </p>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
