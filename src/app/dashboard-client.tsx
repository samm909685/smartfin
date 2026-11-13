"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Bell,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  CreditCard,
  Download,
  LayoutDashboard,
  Package,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Wallet,
  LogOut,
  RefreshCw,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabase";
import Link from "next/link";

type Business = {
  id: string;
  name: string;
  currency: string | null;
};
type Product = {
  id: string;
  business_id: string;
  name: string;
  category: string | null;
  selling_price: number | string | null;
  cost_price: number | string | null;
};
type Sale = {
  id: string;
  business_id: string;
  product_id: string | null;
  sale_date: string;
  quantity: number | string | null;
  selling_price: number | string | null;
  cost_price: number | string | null;
  revenue: number | string | null;
  profit: number | string | null;
};
type Forecast = {
  id: string;
  predicted_profit: number | string | null;
  predicted_revenue: number | string | null;
  forecast_date: string;
};
type Recommendation = {
  id: string;
  message: string;
  priority: string | null;
  recommendation_type: string | null;
};

const currency = (amount: number, code = "INR") =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: code || "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);

const numberValue = (value: number | string | null | undefined) =>
  Number(value ?? 0) || 0;

const shortDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

function MetricCard({
  title,
  value,
  description,
  icon: Icon,
}: {
  title: string;
  value: string;
  description: string;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 transition hover:border-slate-700">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-400">{title}</p>
        <div className="rounded-xl border border-slate-700 bg-slate-800 p-2.5">
          <Icon size={19} className="text-emerald-400" />
        </div>
      </div>
      <h3 className="mt-4 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
        {value}
      </h3>
      <p className="mt-3 text-xs text-slate-500">{description}</p>
    </div>
  );
}

export default function DashboardClient() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [activeBusinessId, setActiveBusinessId] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);

  async function loadDashboard(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        router.replace("/login");
        return;
      }
      setUserEmail(authData.user.email ?? "");

      const { data: businessRows, error: businessError } = await supabase
        .from("businesses")
        .select("id, name, currency")
        .order("created_at", { ascending: true });

      if (businessError) throw businessError;

      const ownedBusinesses = (businessRows ?? []) as Business[];
      setBusinesses(ownedBusinesses);

      if (ownedBusinesses.length === 0) {
        setActiveBusinessId("");
        setProducts([]);
        setSales([]);
        setForecasts([]);
        setRecommendations([]);
        return;
      }

      const preferredId =
        activeBusinessId && ownedBusinesses.some((b) => b.id === activeBusinessId)
          ? activeBusinessId
          : ownedBusinesses[0].id;
      setActiveBusinessId(preferredId);

      const { data: productRows, error: productsError } = await supabase
        .from("products")
        .select("id, business_id, name, category, selling_price, cost_price")
        .eq("business_id", preferredId)
        .order("created_at", { ascending: false });
      if (productsError) throw productsError;

      const { data: salesRows, error: salesError } = await supabase
        .from("sales")
        .select("id, business_id, product_id, sale_date, quantity, selling_price, cost_price, revenue, profit")
        .eq("business_id", preferredId)
        .order("sale_date", { ascending: false });
      if (salesError) throw salesError;

      const { data: forecastRows, error: forecastsError } = await supabase
        .from("forecasts")
        .select("id, predicted_profit, predicted_revenue, forecast_date")
        .eq("business_id", preferredId)
        .order("forecast_date", { ascending: true });
      if (forecastsError) throw forecastsError;

      const { data: recommendationRows, error: recommendationsError } = await supabase
        .from("recommendations")
        .select("id, message, priority, recommendation_type")
        .eq("business_id", preferredId)
        .order("created_at", { ascending: false })
        .limit(5);
      if (recommendationsError) throw recommendationsError;

      setProducts((productRows ?? []) as Product[]);
      setSales((salesRows ?? []) as Sale[]);
      setForecasts((forecastRows ?? []) as Forecast[]);
      setRecommendations((recommendationRows ?? []) as Recommendation[]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not load dashboard data.";
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
    // load once when the page mounts; business switching is handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function switchBusiness(id: string) {
    setActiveBusinessId(id);
    setLoading(true);
    setError("");
    try {
      const [productResult, salesResult, forecastResult, recommendationResult] =
        await Promise.all([
          supabase.from("products").select("id, business_id, name, category, selling_price, cost_price").eq("business_id", id).order("created_at", { ascending: false }),
          supabase.from("sales").select("id, business_id, product_id, sale_date, quantity, selling_price, cost_price, revenue, profit").eq("business_id", id).order("sale_date", { ascending: false }),
          supabase.from("forecasts").select("id, predicted_profit, predicted_revenue, forecast_date").eq("business_id", id).order("forecast_date", { ascending: true }),
          supabase.from("recommendations").select("id, message, priority, recommendation_type").eq("business_id", id).order("created_at", { ascending: false }).limit(5),
        ]);
      const failed = [productResult, salesResult, forecastResult, recommendationResult].find((r) => r.error);
      if (failed?.error) throw failed.error;
      setProducts((productResult.data ?? []) as Product[]);
      setSales((salesResult.data ?? []) as Sale[]);
      setForecasts((forecastResult.data ?? []) as Forecast[]);
      setRecommendations((recommendationResult.data ?? []) as Recommendation[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not switch business.");
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const activeBusiness = businesses.find((b) => b.id === activeBusinessId);
  const currencyCode = activeBusiness?.currency || "INR";

  const salesWithValues = sales.map((sale) => {
    const quantity = numberValue(sale.quantity);
    const revenue =
      sale.revenue !== null && sale.revenue !== undefined
        ? numberValue(sale.revenue)
        : quantity * numberValue(sale.selling_price);
    const profit =
      sale.profit !== null && sale.profit !== undefined
        ? numberValue(sale.profit)
        : quantity * (numberValue(sale.selling_price) - numberValue(sale.cost_price));
    return { ...sale, quantity, calculatedRevenue: revenue, calculatedProfit: profit };
  });

  const totalRevenue = salesWithValues.reduce((sum, sale) => sum + sale.calculatedRevenue, 0);
  const totalProfit = salesWithValues.reduce((sum, sale) => sum + sale.calculatedProfit, 0);
  const totalOrders = salesWithValues.length;
  const totalUnits = salesWithValues.reduce((sum, sale) => sum + sale.quantity, 0);
  const averageOrderValue = totalOrders ? totalRevenue / totalOrders : 0;

  const chartData = (() => {
    const monthMap = new Map<string, { month: string; revenue: number; expenses: number; sort: string }>();
    for (const sale of salesWithValues) {
      const date = new Date(`${sale.sale_date}T00:00:00`);
      if (Number.isNaN(date.getTime())) continue;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const month = date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
      const row = monthMap.get(key) ?? { month, revenue: 0, expenses: 0, sort: key };
      row.revenue += sale.calculatedRevenue;
      row.expenses += sale.calculatedRevenue - sale.calculatedProfit;
      monthMap.set(key, row);
    }
    return [...monthMap.values()].sort((a, b) => a.sort.localeCompare(b.sort)).slice(-8);
  })();

  const productById = new Map(products.map((product) => [product.id, product]));
  const recentSales = [...salesWithValues].slice(0, 6);
  const latestForecast = forecasts[forecasts.length - 1];
  const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  return (
    <main className="min-h-screen bg-[#080f1c] text-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-[#080f1c]/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-[1600px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex shrink-0 items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400 text-slate-950">
              <Activity size={21} strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">Smart<span className="text-emerald-400">Fin</span></h1>
              <p className="hidden text-[10px] tracking-[0.18em] text-slate-500 sm:block">BUSINESS INTELLIGENCE</p>
            </div>
          </div>
          <nav className="flex max-w-[55vw] items-center gap-1 overflow-x-auto lg:max-w-none">
  {[
    { label: "Overview", icon: LayoutDashboard, href: "#overview" },
    { label: "Sales", icon: ShoppingCart, href: "#transactions" },
    { label: "Products", icon: Package, href: "#products" },
    { label: "Import Sales", icon: Download, href: "/import" },
    { label: "Forecasts", icon: TrendingUp, href: "/forecasts" },
    { label: "Recommendations", icon: Sparkles, href: "#recommendations" },
  ].map((item) => {
    const Icon = item.icon;
    const isPageLink =
      item.href === "/import" || item.href === "/forecasts";

    const className =
      "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:bg-slate-800 hover:text-white";

    return isPageLink ? (
      <Link key={item.label} href={item.href} className={className}>
        <Icon size={16} />
        {item.label}
      </Link>
    ) : (
      <a key={item.label} href={item.href} className={className}>
        <Icon size={16} />
        {item.label}
      </a>
    );
  })}
</nav>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void loadDashboard(true)} aria-label="Refresh dashboard" className="rounded-lg border border-slate-800 p-2 text-slate-400 hover:text-white">
              <RefreshCw size={17} className={refreshing ? "animate-spin" : ""} />
            </button>
            <button type="button" aria-label="Notifications" className="relative rounded-lg border border-slate-800 p-2 text-slate-400 hover:text-white">
              <Bell size={18} />
            </button>
            <button type="button" onClick={signOut} className="flex items-center gap-2 rounded-lg border border-slate-800 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">
              <LogOut size={16} /><span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <div id="overview" className="mx-auto max-w-[1600px] px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />BUSINESS OVERVIEW
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Dashboard</h2>
            <p className="mt-2 text-sm text-slate-400">
              {activeBusiness ? `Performance overview for ${activeBusiness.name}.` : "Your business performance at a glance."}
            </p>
            {userEmail && <p className="mt-1 text-xs text-slate-500">Signed in as {userEmail}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {businesses.length > 0 && (
              <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-300">
                <span className="text-slate-500">Business</span>
                <select aria-label="Choose business" value={activeBusinessId} onChange={(e) => void switchBusiness(e.target.value)} className="max-w-[180px] bg-transparent text-white outline-none">
                  {businesses.map((business) => <option className="bg-slate-900" key={business.id} value={business.id}>{business.name}</option>)}
                </select>
                <ChevronDown size={14} />
              </label>
            )}
            <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300">
              <Download size={16} />Export report
            </button>
          </div>
        </div>

        {error && (
          <div role="alert" className="mt-6 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            <p className="font-semibold">Could not load dashboard data</p>
            <p className="mt-1 break-words">{error}</p>
            <p className="mt-1 text-xs text-red-200/80">Check the table columns and Supabase permissions, then use Refresh.</p>
          </div>
        )}

        {loading ? (
          <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/80 p-10 text-center text-slate-400">
            Loading your secure business data…
          </div>
        ) : businesses.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-8">
            <div className="flex items-start gap-3">
              <CircleHelp className="mt-1 text-emerald-400" />
              <div>
                <h3 className="text-lg font-semibold text-white">Create your first business</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">Your account is signed in, but no business is linked to it yet. Add a business in Supabase or build the business setup form next. No demo financial figures are shown here.</p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <section aria-label="Business metrics" className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard title="Total Revenue" value={currency(totalRevenue, currencyCode)} description="Sum of recorded sales revenue" icon={Wallet} />
              <MetricCard title="Net Profit" value={currency(totalProfit, currencyCode)} description={`${profitMargin.toFixed(1)}% profit margin on recorded sales`} icon={TrendingUp} />
              <MetricCard title="Sales Records" value={totalOrders.toLocaleString("en-IN")} description={`${totalUnits.toLocaleString("en-IN")} units sold in total`} icon={ShoppingCart} />
              <MetricCard title="Average Sale Value" value={currency(averageOrderValue, currencyCode)} description="Revenue divided by sales records" icon={CreditCard} />
            </section>

            <section className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 sm:p-6 xl:col-span-2">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-white">Revenue overview</h3>
                    <p className="mt-1 text-xs text-slate-500">Revenue and estimated expenses from recorded sales</p>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-2 text-slate-400"><span className="h-2 w-2 rounded-full bg-emerald-400" />Revenue</span>
                    <span className="flex items-center gap-2 text-slate-400"><span className="h-2 w-2 rounded-full bg-sky-400" />Expenses</span>
                  </div>
                </div>
                <div className="mt-7 h-[280px] w-full">
                  {chartData.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-slate-500">Your chart will appear after you record sales.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
                        <defs>
                          <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#34d399" stopOpacity={0.24} /><stop offset="95%" stopColor="#34d399" stopOpacity={0} /></linearGradient>
                          <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#38bdf8" stopOpacity={0.12} /><stop offset="95%" stopColor="#38bdf8" stopOpacity={0} /></linearGradient>
                        </defs>
                        <CartesianGrid stroke="#253247" strokeDasharray="4 5" vertical={false} />
                        <XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} tickMargin={12} />
                        <YAxis tickFormatter={(value) => `${currency(Number(value), currencyCode)}`} tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} tickMargin={8} width={78} />
                        <Tooltip formatter={(value, name) => [currency(Number(value), currencyCode), name === "revenue" ? "Revenue" : "Expenses"]} contentStyle={{ backgroundColor: "#111c2e", border: "1px solid #334155", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} labelStyle={{ color: "#94a3b8", marginBottom: 4 }} />
                        <Area type="monotone" dataKey="revenue" stroke="#34d399" strokeWidth={2.5} fill="url(#revenueFill)" />
                        <Area type="monotone" dataKey="expenses" stroke="#38bdf8" strokeWidth={2} fill="url(#expenseFill)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div className="mt-4 flex items-center gap-2 border-t border-slate-800 pt-4 text-xs text-slate-500"><Activity size={14} className="text-emerald-400" />Figures calculated from your Supabase sales records.</div>
              </div>

              <div id="forecasts" className="relative overflow-hidden rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-emerald-400/10 via-slate-900 to-slate-900 p-5 sm:p-6">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-emerald-400/15 p-2"><Sparkles size={18} className="text-emerald-400" /></div>
                  <h3 className="font-semibold text-white">SmartFin Insights</h3>
                </div>
                {latestForecast ? (
                  <>
                    <p className="mt-6 text-xs font-medium uppercase tracking-wider text-emerald-400">Latest stored forecast</p>
                    <h4 className="mt-2 text-xl font-semibold leading-7 text-white">{currency(numberValue(latestForecast.predicted_revenue), currencyCode)} predicted revenue</h4>
                    <p className="mt-3 text-sm leading-6 text-slate-400">Forecast date: {shortDate(latestForecast.forecast_date)}. Predicted profit: {currency(numberValue(latestForecast.predicted_profit), currencyCode)}.</p>
                  </>
                ) : (
                  <>
                    <p className="mt-6 text-xs font-medium uppercase tracking-wider text-emerald-400">Forecast status</p>
                    <h4 className="mt-2 text-xl font-semibold leading-7 text-white">No forecast yet</h4>
                    <p className="mt-3 text-sm leading-6 text-slate-400">Once forecasting is implemented and saved to Supabase, your business predictions will appear here.</p>
                  </>
                )}
                <div className="mt-6 rounded-xl border border-slate-700/70 bg-slate-950/40 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-200"><ArrowUpRight size={17} className="text-emerald-400" />Business snapshot</div>
                  <p className="mt-2 text-xs leading-5 text-slate-400">{products.length} products registered and {totalOrders} sales records available for this business.</p>
                </div>
                <div className="mt-5 flex items-center gap-2 text-xs text-slate-500"><Sparkles size={13} />Stored forecast data only; no new ML prediction is generated by this dashboard.</div>
              </div>
            </section>

            <section id="transactions" className="mt-6 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-5 sm:px-6">
                <div><h3 className="font-semibold text-white">Recent sales</h3><p className="mt-1 text-xs text-slate-500">Latest sales records from your selected business</p></div>
                <span className="text-sm text-emerald-400">{sales.length} records</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[650px] text-left text-sm">
                  <thead><tr className="border-b border-slate-800 text-xs text-slate-500"><th className="px-5 py-4 font-medium sm:px-6">Product</th><th className="px-5 py-4 font-medium">Date</th><th className="px-5 py-4 font-medium">Quantity</th><th className="px-5 py-4 text-right font-medium sm:px-6">Revenue</th></tr></thead>
                  <tbody>
                    {recentSales.map((sale) => {
                      const product = sale.product_id ? productById.get(sale.product_id) : undefined;
                      const name = product?.name ?? "Product";
                      const initials = name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
                      return <tr key={sale.id} className="border-b border-slate-800/70 last:border-0 hover:bg-slate-800/30">
                        <td className="px-5 py-4 sm:px-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-xs font-semibold text-emerald-300">{initials || "SA"}</div><div><p className="font-medium text-slate-200">{name}</p><p className="mt-1 text-xs text-slate-500">{product?.category || "Sales record"}</p></div></div></td>
                        <td className="px-5 py-4 text-slate-400">{shortDate(sale.sale_date)}</td>
                        <td className="px-5 py-4 text-slate-400">{sale.quantity.toLocaleString("en-IN")}</td>
                        <td className="px-5 py-4 text-right font-medium text-white sm:px-6">{currency(sale.calculatedRevenue, currencyCode)}</td>
                      </tr>;
                    })}
                    {recentSales.length === 0 && <tr><td colSpan={4} className="px-5 py-10 text-center text-slate-500">No sales recorded yet. Your sales will appear here after you add them.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>

            <section id="products" className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/80">
              <div className="border-b border-slate-800 px-5 py-5 sm:px-6"><h3 className="font-semibold text-white">Products</h3><p className="mt-1 text-xs text-slate-500">Products registered for this business</p></div>
              {products.length ? <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">{products.slice(0, 9).map((product) => <div key={product.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-medium text-slate-200">{product.name}</p><p className="mt-1 text-xs text-slate-500">{product.category || "Uncategorized"}</p></div><Package size={17} className="text-emerald-400" /></div><div className="mt-4 flex justify-between gap-3 text-xs"><span className="text-slate-500">Selling price</span><span className="font-medium text-white">{currency(numberValue(product.selling_price), currencyCode)}</span></div><div className="mt-2 flex justify-between gap-3 text-xs"><span className="text-slate-500">Cost price</span><span className="text-slate-300">{currency(numberValue(product.cost_price), currencyCode)}</span></div></div>)}</div> : <p className="px-5 py-8 text-center text-sm text-slate-500">No products registered yet.</p>}
            </section>

            <section id="recommendations" className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/80">
              <div className="border-b border-slate-800 px-5 py-5 sm:px-6"><h3 className="font-semibold text-white">Recommendations</h3><p className="mt-1 text-xs text-slate-500">Recommendations already saved for this business</p></div>
              {recommendations.length ? <div className="divide-y divide-slate-800">{recommendations.map((item) => <div key={item.id} className="flex items-start gap-3 p-5"><div className="rounded-lg bg-emerald-400/10 p-2"><Sparkles size={16} className="text-emerald-400" /></div><div className="min-w-0 flex-1"><p className="text-sm leading-6 text-slate-200">{item.message}</p><p className="mt-1 text-xs text-slate-500">{item.recommendation_type || "Business insight"}{item.priority ? ` · Priority: ${item.priority}` : ""}</p></div></div>)}</div> : <p className="px-5 py-8 text-center text-sm text-slate-500">No recommendations saved yet.</p>}
            </section>
          </>
        )}

        <footer className="mt-8 flex flex-col gap-3 border-t border-slate-800 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 SmartFin. Financial intelligence for growing businesses.</p>
          <div className="flex items-center gap-4"><span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Connected dashboard</span><button type="button" onClick={() => void loadDashboard(true)} className="flex items-center gap-1.5 hover:text-slate-300"><CalendarDays size={14} />Refresh data</button></div>
        </footer>
      </div>
    </main>
  );
}
