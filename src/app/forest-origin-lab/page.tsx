import type { Metadata } from "next";
import { ForestOriginLab } from "@/components/forest-lab/forest-origin-lab";
import "../forest-lab/forest-lab.css";

export const metadata: Metadata = { title: "Pine Forest 原场景布局转换验证" };
export default function Page() { return <ForestOriginLab />; }
