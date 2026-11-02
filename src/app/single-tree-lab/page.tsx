import type { Metadata } from "next";
import { SingleTreeLab } from "@/components/forest-lab/single-tree-lab";

export const metadata: Metadata = { title: "Pine Forest single-tree verification" };

export default function Page() { return <SingleTreeLab />; }
