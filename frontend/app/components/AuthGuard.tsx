"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import TopNav from "./TopNav";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const username = localStorage.getItem("sp_username");
    
    if (!username && pathname !== "/login") {
      setAuthorized(false);
      router.push("/login");
    } else {
      setAuthorized(true);
    }
  }, [pathname, router]);

  // Prevent flash of unauthenticated layout content during redirect
  if (!authorized && pathname !== "/login") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg font-mono text-xs text-text-3">
        REDIRECTING TO SESSION LOGIN...
      </div>
    );
  }

  return (
    <>
      {pathname !== "/login" && <TopNav />}
      {children}
    </>
  );
}
