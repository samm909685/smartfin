
import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

export const runtime = "nodejs";

type Sale = {
  product_id: string;
  sale_date: string;
  quantity: number;
  selling_price: number;
  cost_price: number;
};

type Product = {
  id: string;
  name: string;
};

type ForecastInsert = {
  business_id: string;
  product_id: string;
  forecast_date: string;
  predicted_quantity: number;
  predicted_revenue: number;
  predicted_profit: number;
  model: string;
};

function getUTCDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const businessId = body.businessId;

    if (!businessId || typeof businessId !== "string") {
      return NextResponse.json(
        { error: "Please select a business." },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Verify signed-in user.
    const { data: auth, error: authError } =
      await supabase.auth.getUser();

    if (authError || !auth.user) {
      return NextResponse.json(
        { error: "Please sign in again." },
        { status: 401 }
      );
    }

    // Verify business access using RLS.
    const { data: business, error: businessError } =
      await supabase
        .from("businesses")
        .select("id, name")
        .eq("id", businessId)
        .single();

    if (businessError || !business) {
      return NextResponse.json(
        { error: "Business not found or access denied." },
        { status: 404 }
      );
    }

    // Fetch products.
    const { data: productsData, error: productError } =
      await supabase
        .from("products")
        .select("id, name")
        .eq("business_id", businessId);

    if (productError) throw productError;

    const products = (productsData ?? []) as Product[];

    // Fetch historical sales.
    const { data: salesData, error: salesError } =
      await supabase
        .from("sales")
        .select(
          "product_id, sale_date, quantity, selling_price, cost_price"
        )
        .eq("business_id", businessId)
        .order("sale_date", { ascending: true });

    if (salesError) throw salesError;

    const today = getUTCDateString(new Date());

    // Ignore any future-dated sales.
    const sales = ((salesData ?? []) as Sale[]).filter(
      (sale) => sale.sale_date <= today
    );

    if (sales.length === 0) {
      return NextResponse.json(
        {
          error: "No historical sales found. Import sales first.",
        },
        { status: 400 }
      );
    }

    const forecastRows: ForecastInsert[] = [];
    const skippedProducts: string[] = [];

    let productsForecasted = 0;

    for (const product of products) {
      const productSales = sales.filter(
        (sale) => sale.product_id === product.id
      );

      if (productSales.length === 0) {
        skippedProducts.push(product.name);
        continue;
      }

      // Find the latest historical sale date for this product.
      const latestSaleDate = productSales.reduce(
        (latest, sale) =>
          sale.sale_date > latest ? sale.sale_date : latest,
        productSales[0].sale_date
      );

      // Use the 30 calendar days ending on that latest sale date.
      const windowEnd = new Date(
        `${latestSaleDate}T00:00:00Z`
      );

      const windowStart = addDays(windowEnd, -29);
      const windowStartString = getUTCDateString(windowStart);

      const recentSales = productSales.filter(
        (sale) =>
          sale.sale_date >= windowStartString &&
          sale.sale_date <= latestSaleDate
      );

      // Sum quantities by date.
      const dailySales = new Map<string, number>();

      for (const sale of recentSales) {
        dailySales.set(
          sale.sale_date,
          (dailySales.get(sale.sale_date) ?? 0) +
            Number(sale.quantity)
        );
      }

      // Missing calendar days count as zero.
      let totalQuantity = 0;

      for (let offset = 0; offset < 30; offset++) {
        const date = getUTCDateString(
          addDays(windowStart, offset)
        );

        totalQuantity += dailySales.get(date) ?? 0;
      }

      const averageDailyQuantity = totalQuantity / 30;

      // Calculate weighted selling price and profit per unit
      // from the same historical window.
      const totalUnits = recentSales.reduce(
        (sum, sale) => sum + Number(sale.quantity),
        0
      );

      if (totalUnits <= 0) {
        skippedProducts.push(product.name);
        continue;
      }

      const totalRevenue = recentSales.reduce(
        (sum, sale) =>
          sum +
          Number(sale.quantity) * Number(sale.selling_price),
        0
      );

      const totalProfit = recentSales.reduce(
        (sum, sale) =>
          sum +
          Number(sale.quantity) *
            (Number(sale.selling_price) -
              Number(sale.cost_price)),
        0
      );

      const averageSellingPrice = totalRevenue / totalUnits;
      const averageProfitPerUnit = totalProfit / totalUnits;

      // Generate 30 future daily forecasts.
      for (let day = 1; day <= 30; day++) {
        const forecastDate = getUTCDateString(
          addDays(new Date(`${today}T00:00:00Z`), day)
        );

        const predictedQuantity = averageDailyQuantity;

        forecastRows.push({
          business_id: businessId,
          product_id: product.id,
          forecast_date: forecastDate,
          predicted_quantity: Number(
            predictedQuantity.toFixed(2)
          ),
          predicted_revenue: Number(
            (predictedQuantity * averageSellingPrice).toFixed(2)
          ),
          predicted_profit: Number(
            (predictedQuantity * averageProfitPerUnit).toFixed(2)
          ),
          model: "30-Day Moving Average",
        });
      }

      productsForecasted++;
    }

    if (forecastRows.length === 0) {
      return NextResponse.json(
        {
          error:
            "No products with valid historical sales were found.",
          skippedProducts,
        },
        { status: 422 }
      );
    }

    // Remove previous future forecasts for this business.
    const { error: deleteError } = await supabase
      .from("forecasts")
      .delete()
      .eq("business_id", businessId)
      .gte("forecast_date", today);

    if (deleteError) throw deleteError;

    // Save forecasts in batches.
    for (let i = 0; i < forecastRows.length; i += 500) {
      const batch = forecastRows.slice(i, i + 500);

      const { error: insertError } = await supabase
        .from("forecasts")
        .insert(batch);

      if (insertError) throw insertError;
    }

    return NextResponse.json({
      success: true,
      message: "30-day forecast generated successfully.",
      forecastCount: forecastRows.length,
      productsForecasted,
      skippedProducts,
      model: "30-Day Moving Average",
    });
  } catch (error) {
    console.error("Forecast generation error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Forecast generation failed.",
      },
      { status: 500 }
    );
  }
}
