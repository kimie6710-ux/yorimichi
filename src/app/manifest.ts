import type { MetadataRoute } from "next";
import { APP_NAME, APP_TAGLINE } from "@/lib/config";

// Lets people add the app to their phone's home screen and open it full-screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description: APP_TAGLINE,
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fafbfc",
    theme_color: "#fafbfc",
    lang: "ja",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
