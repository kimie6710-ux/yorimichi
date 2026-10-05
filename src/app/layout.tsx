import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP } from "next/font/google";

import { BottomNav } from "@/components/BottomNav";
import { NavTracker } from "@/components/NavTracker";
import { APP_NAME, APP_TAGLINE } from "@/lib/config";
import { SearchProvider } from "@/lib/store/search-context";
import "./globals.css";

const noto = Noto_Sans_JP({
  variable: "--font-noto",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
  preload: false,
});



export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_TAGLINE,
  applicationName: APP_NAME,
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#faf6ec",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${noto.variable} h-full antialiased`}>
      <body className="min-h-dvh bg-paper-deep">
        <NavTracker />
        <SearchProvider>
          {/* Phone-first: on wider screens the app sits in a phone-width column. */}
          <div className="relative mx-auto min-h-dvh max-w-[480px] bg-paper pb-[calc(76px+env(safe-area-inset-bottom))] sm:shadow-lift">
            {children}
          </div>
          <BottomNav />
        </SearchProvider>
      </body>
    </html>
  );
}
