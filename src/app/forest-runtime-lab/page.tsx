import type { Metadata } from "next";
import { ForestRuntimeLab } from "@/components/forest-lab/forest-origin-lab";
import "../forest-lab/forest-lab.css";

export const metadata: Metadata = { title: "Pine Forest 原资产实时漫游实验" };
export default function Page() { return <ForestRuntimeLab />; }
