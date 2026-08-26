"use client";

import { useCallback } from "react";

export type Toast = {
  id: string;
  title: string;
  message: string;
  type: "danger" | "warning" | "success" | "info";
  timestamp: number;
};

type Props = {
  toasts: Toast[];
  onDismiss: (id: string) => void;
};

const ICONS = {
  danger: "🔴",
  warning: "🟡",
  success: "🟢",
  info: "🔵",
};

const LABELS = {
  danger: "SELL ALERT",
  warning: "CAUTION",
  success: "BUY SIGNAL",
  info: "INFO",
};

const TOAST_CLASSES = {
  danger: "border-red-custom before:bg-red-custom",
  warning: "border-amber-custom before:bg-amber-custom",
  success: "border-green-custom before:bg-green-custom",
  info: "border-blue-custom before:bg-blue-custom",
};

export default function NotificationSystem({ toasts, onDismiss }: Props) {
  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:bottom-6 sm:right-6 flex flex-col gap-2 z-[200] max-w-[calc(100%-2rem)] sm:max-w-[340px] w-full">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`grid grid-cols-[auto_1fr_auto] gap-3 items-start p-[0.85rem_1rem] border bg-bg-2 animate-toast-in relative overflow-hidden before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] ${
            TOAST_CLASSES[toast.type] || TOAST_CLASSES.info
          }`}
        >
          <div className="text-[0.9rem] leading-[1.3] shrink-0">{ICONS[toast.type]}</div>
          <div className="flex flex-col gap-[0.15rem] min-w-0">
            <span className="font-mono text-[0.55rem] font-bold tracking-[0.2em] text-text-3">{LABELS[toast.type]}</span>
            <p className="font-mono text-[0.75rem] font-bold text-text-custom tracking-[0.05em]">{toast.title}</p>
            <p className="text-[0.72rem] text-text-2 leading-[1.4]">{toast.message}</p>
          </div>
          <button
            className="bg-transparent border-none text-text-3 cursor-pointer text-[0.65rem] leading-[1.3] p-0 transition-colors duration-150 shrink-0 hover:text-text-custom"
            onClick={() => onDismiss(toast.id)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

// Hook to request browser notification permission
export function useBrowserNotifications() {
  const requestPermission = useCallback(async () => {
    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }
  }, []);

  const sendBrowserNotification = useCallback((title: string, body: string, icon = "📊") => {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(`${icon} ${title}`, {
        body,
        icon: "/favicon.ico",
      });
    }
  }, []);

  return { requestPermission, sendBrowserNotification };
}