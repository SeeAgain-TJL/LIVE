import type { Metadata } from "next";
import { ForestMemoryLab } from "@/components/forest-lab/forest-memory-lab";
import "../forest-lab/forest-lab.css";
import "./forest-memory.css";

export const metadata: Metadata = { title: "Pine Forest · 记忆漫游" };

export default function Page() { return <ForestMemoryLab />; }
