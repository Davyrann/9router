"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useNotificationStore } from "@/store/notificationStore";
import Sidebar from "../Sidebar";
import Header from "../Header";

function getToastClass(type) {
  if (type === "success") return "toast-success";
  if (type === "error")   return "toast-error";
  if (type === "warning") return "toast-warning";
  return "toast-info";
}

function getToastMarker(type) {
  if (type === "success") return "[+]";
  if (type === "error")   return "[x]";
  if (type === "warning") return "[!]";
  return "[i]";
}

export default function DashboardLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const notifications = useNotificationStore((state) => state.notifications);
  const removeNotification = useNotificationStore((state) => state.removeNotification);

  // Preload heavy usage charts in background when browser is idle
  useEffect(() => {
    const preload = () => {
      import("@/shared/components/UsageStats").catch(() => {});
      import("@/app/(dashboard)/dashboard/usage/components/UsageChart").catch(() => {});
      import("@/app/(dashboard)/dashboard/usage/components/ProviderBarChart").catch(() => {});
      import("@/app/(dashboard)/dashboard/usage/components/TopModelsChart").catch(() => {});
    };
    if (typeof window !== "undefined") {
      if ("requestIdleCallback" in window) {
        const id = window.requestIdleCallback(preload, { timeout: 4000 });
        return () => window.cancelIdleCallback(id);
      }
      const timer = setTimeout(preload, 2500);
      return () => clearTimeout(timer);
    }
  }, []);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[var(--color-canvas)]">
      {/* Toast notifications */}
      <div className="fixed top-4 right-4 z-[80] flex w-[min(92vw,380px)] flex-col gap-2">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`px-3 py-2 ${getToastClass(n.type)}`}
            style={{ fontFamily: "var(--font-mono)", borderRadius: "4px" }}
          >
            <div className="flex items-start gap-2">
              <span className="text-[13px] font-bold shrink-0">{getToastMarker(n.type)}</span>
              <div className="min-w-0 flex-1">
                {n.title ? <p className="text-[13px] font-bold mb-0.5">{n.title}</p> : null}
                <p className="text-[13px] whitespace-pre-wrap break-words">{n.message}</p>
              </div>
              {n.dismissible ? (
                <button
                  type="button"
                  onClick={() => removeNotification(n.id)}
                  className="text-current/70 hover:text-current text-[13px] shrink-0"
                  aria-label="Dismiss notification"
                >
                  [x]
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-[var(--color-ink)]/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Desktop */}
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      {/* Sidebar - Mobile */}
      <div
        className={`fixed inset-y-0 left-0 z-50 transform lg:hidden transition-transform duration-200 ease-in-out ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <main className="flex flex-col flex-1 h-full min-w-0 relative isolate">
        <Header key={pathname} onMenuClick={() => setSidebarOpen(true)} />
        <div
          className={`flex-1 overflow-y-auto custom-scrollbar ${
            pathname === "/dashboard/basic-chat" ? "" : "p-3.5 sm:p-6 lg:p-10"
          } ${
            pathname === "/dashboard/basic-chat" ? "flex flex-col overflow-hidden" : ""
          }`}
        >
          <div className={`${pathname === "/dashboard/basic-chat" ? "flex-1 w-full h-full flex flex-col" : "max-w-7xl mx-auto"}`}>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
