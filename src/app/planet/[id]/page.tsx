import { PlanetMemorySpace } from "@/components/memories/planet-memory-space";

export default async function PlanetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PlanetMemorySpace key={id} id={id} />;
}
