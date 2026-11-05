import type { Metadata } from "next";
import { LibraryGallery } from "./library-gallery";
import "./library.css";

export const metadata: Metadata = { title: "星球视觉库 V1" };

export default function PlanetVisualLibraryPage() {
  return <LibraryGallery />;
}
