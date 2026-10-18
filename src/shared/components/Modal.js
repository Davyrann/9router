"use client";

import { useEffect } from "react";
import { cn } from "@/shared/utils/cn";
import Button from "./Button";

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = "md",
  closeOnOverlay = true,
  showTrafficLights = false, // removed traffic lights — not in design system
  className,
  bodyClassName,
  scrollable = true,
}) {
  const sizes = {
    sm:   "max-w-sm",
    md:   "max-w-md",
    lg:   "max-w-lg",
    xl:   "max-w-xl",
    full: "max-w-4xl",
  };

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-[var(--color-ink)]/40 fade-in"
        onClick={closeOnOverlay ? onClose : undefined}
      />

      {/* Modal content */}
      <div
        className={cn(
          "relative w-full bg-[var(--color-canvas)]",
          "border border-[var(--color-hairline)]",
          "rounded-none",
          "fade-in",
          sizes[size],
          className
        )}
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-hairline)]">
            <h2 className="text-[16px] font-bold text-[var(--color-ink)]">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-[var(--color-mute)] hover:text-[var(--color-ink)] transition-colors text-[13px]"
            >
              [x]
            </button>
          </div>
        )}

        {/* Body */}
        <div
          className={cn(
            "p-5",
            scrollable && "max-h-[calc(85vh-100px)] overflow-y-auto custom-scrollbar",
            bodyClassName
          )}
        >
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[var(--color-hairline)]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirm",
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "danger",
  loading = false,
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelText}
          </Button>
          <Button variant={variant} onClick={onConfirm} loading={loading}>
            {confirmText}
          </Button>
        </>
      }
    >
      <p className="text-[15px] text-[var(--color-body)]">{message}</p>
    </Modal>
  );
}
