"use client";

import useTimezoneStore from "@/store/timezoneStore";
import { TIMEZONE_CONFIG } from "@/shared/constants/config";

/**
 * Display timezone override.
 * timeZone "" = follow browser. Pass as `timeZone` to Date toLocale* methods.
 */
export function useTimezone() {
  const { timeZone, setTimeZone } = useTimezoneStore();
  return { timeZone: timeZone || TIMEZONE_CONFIG.defaultTimeZone, setTimeZone };
}

/** Format epoch/ms/Date in the stored display timezone. */
export function useFormatTime() {
  const { timeZone } = useTimezone();
  return (date, options = {}) =>
    new Date(date).toLocaleString(undefined, timeZone ? { ...options, timeZone } : options);
}

/** IANA zone list for the settings dropdown (browser support varies). */
export function listTimeZones() {
  if (typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function") {
    return Intl.supportedValuesOf("timeZone");
  }
  return TIMEZONE_CONFIG.fallbackZones;
}
