import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Coffee } from "lucide-react";
import { ApiError } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/Button";

export function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Unable to sign in. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-cream-100 to-cream-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-cream-200 bg-white p-8 shadow-lg">
        <div className="mb-8 text-center">
          <Coffee className="mx-auto h-10 w-10 text-amber-brand" aria-hidden />
          <h1 className="mt-3 font-display text-2xl font-bold text-brown-900">
            ACFE Shop
          </h1>
          <p className="mt-1 text-sm text-brown-600">Sign in to your account</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {error}
            </p>
          )}
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-brown-800">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-cream-200 px-3 py-2 text-brown-900 focus:border-amber-brand focus:outline-none focus:ring-2 focus:ring-amber-brand/20"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-brown-800">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-cream-200 px-3 py-2 text-brown-900 focus:border-amber-brand focus:outline-none focus:ring-2 focus:ring-amber-brand/20"
            />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
