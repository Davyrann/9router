"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { TIMEZONE_CONFIG } from "@/shared/constants/config";

// Display timezone override. "" = follow browser (default).
const useTimezoneStore = create(
  persist(
    (set) => ({
      timeZone: TIMEZONE_CONFIG.defaultTimeZone,

      setTimeZone: (timeZone) => set({ timeZone }),
    }),
    {
      name: TIMEZONE_CONFIG.storageKey,
    }
  )
);

export default useTimezoneStore;
