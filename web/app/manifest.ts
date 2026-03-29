import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GSD - Get Shit Done",
    short_name: "GSD",
    description:
      "The evolution of Get Shit Done — now a real coding agent. One command. Walk away. Come back to a built project.",
    start_url: "/",
    display: "standalone",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: "/icon-dark-32x32.png",
        sizes: "32x32",
        type: "image/png",
      },
    ],
  }
}
