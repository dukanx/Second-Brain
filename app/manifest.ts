import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Second Brain",
    short_name: "SecondBrain",
    description: "AI-powered knowledge capture & synthesis",
    start_url: "/brain",
    display: "standalone",
    orientation: "portrait",
    background_color: "#080808",
    theme_color: "#f59e0b",
    share_target: {
      action: "/share",
      method: "GET",
      params: {
        title: "title",
        text: "text",
        url: "url",
      },
    },
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
