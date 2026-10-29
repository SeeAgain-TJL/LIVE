import type { Metadata } from "next";
import { GuideLab } from "@/components/guide-lab/guide-lab";
import "./guide-lab.css";

export const metadata: Metadata = { title: "VRM 角色实验室（非正式角色）" };
export default function Page() { return <GuideLab />; }
