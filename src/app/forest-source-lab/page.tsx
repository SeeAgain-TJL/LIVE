import type { Metadata } from "next";
import { ForestLab } from "@/components/forest-lab/forest-lab";
import "../forest-lab/forest-lab.css";

export const metadata: Metadata = { title: "Pine Forest source-asset conversion test" };

export default function Page() { return <ForestLab sourceAssets />; }
