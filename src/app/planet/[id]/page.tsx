import { PlanetArchive } from "@/components/memories/planet-archive";

export default async function PlanetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PlanetArchive id={id} />;
}
