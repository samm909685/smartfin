
"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "../../lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleReset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const supabase = createClient();

      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: `${window.location.origin}/reset-password`,
        }
      );

      if (error) {
        setMessage(error.message);
      } else {
        setMessage(
          "If this email belongs to an account, a password reset link will be sent. Check your inbox and spam folder."
        );
      }
    } catch {
      setMessage("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8">
        <h1 className="text-2xl font-bold">Forgot password?</h1>
        <p className="mt-2 text-sm text-slate-300">
          Enter your SmartFin account email and we will send you a reset link.
        </p>

        <form onSubmit={handleReset} className="mt-6 space-y-4">
          <label htmlFor="email" className="block text-sm font-medium">
            Email address
          </label>

          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-blue-500"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 p-3 font-semibold hover:bg-blue-500 disabled:opacity-50"
          >
            {loading ? "Sending..." : "Send reset link"}
          </button>
        </form>

        {message && (
          <p role="status" className="mt-4 break-words text-sm text-slate-200">
            {message}
          </p>
        )}

        <p className="mt-6 text-sm text-slate-300">
          Remember your password?{" "}
          <Link
            href="/login"
            className="text-blue-400 hover:underline"
          >
            Back to login
          </Link>
        </p>
      </div>
    </main>
  );
}
