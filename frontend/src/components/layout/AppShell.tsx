import { useState } from "react";
import { Menu } from "lucide-react";
import { Outlet } from "react-router-dom";
import { Breadcrumbs } from "./Breadcrumbs";
import { Sidebar } from "./Sidebar";

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-cream-50">
      {sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-brown-900/40 lg:hidden"
          aria-label="Close menu overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex min-h-screen flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-cream-200 bg-white/90 px-4 py-3 backdrop-blur-md lg:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-brown-700 hover:bg-cream-100"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-display text-lg font-bold text-brown-900">
            ACFE Shop
          </span>
        </header>

        <Breadcrumbs />

        <main className="flex-1 px-4 py-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
