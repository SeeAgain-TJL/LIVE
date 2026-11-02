import type { Metadata } from "next";
import { ForestLab } from "@/components/forest-lab/forest-lab";
import "./forest-lab.css";

export const metadata: Metadata = { title: "松林环境实验（非正式星球）" };
export default function Page() { return <ForestLab />; }
