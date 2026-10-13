export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="mb-12">
          <p className="mb-3 text-sm font-medium text-blue-400">
            SMARTFIN
          </p>

          <h1 className="text-4xl font-bold tracking-tight md:text-6xl">
            Financial Forecasting
            <br />
            & Recommendation System
          </h1>

          <p className="mt-6 max-w-2xl text-lg text-slate-400">
            Analyze historical sales, forecast future performance,
            and generate data-driven financial recommendations.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-sm text-slate-400">Revenue</p>
            <p className="mt-2 text-3xl font-bold">₹0</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-sm text-slate-400">Profit</p>
            <p className="mt-2 text-3xl font-bold">₹0</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-sm text-slate-400">Forecast</p>
            <p className="mt-2 text-3xl font-bold">Coming Soon</p>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-8">
          <h2 className="text-xl font-semibold">
            Sales Forecast
          </h2>

          <p className="mt-2 text-slate-400">
            Your historical sales and future forecast will appear here.
          </p>
        </div>
      </div>
    </main>
  );
}