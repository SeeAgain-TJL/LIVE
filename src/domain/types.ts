export type PlanetType = "rocky" | "ocean" | "gas" | "ice" | "ringed";
export type Vec3 = [number, number, number];
export type Quality = "auto" | "high" | "low";

export interface PlanetAppearance {
  type: PlanetType;
  color: string;
  seed: number;
  rings: boolean;
  size: number;
}

export interface Planet {
  id: string;
  universeId: string;
  galaxyId: string | null;
  name: string | null;
  startDate: string | null;
  endDate: string | null;
  ongoing: boolean;
  description: string;
  appearance: PlanetAppearance;
  position: Vec3;
  visibility: "private";
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Memory {
  id: string;
  planetId: string;
  kind: "text";
  title: string;
  body: string;
  occurredOn: string;
  createdAt: string;
  updatedAt: string;
}

export interface Galaxy {
  id: string;
  name: string;
  color: string;
}

export interface UniverseData {
  schemaVersion: 1;
  revision: number;
  universe: { id: string; name: string };
  galaxies: Galaxy[];
  planets: Planet[];
  memories: Memory[];
}

export interface CameraBookmark {
  position: Vec3;
  target: Vec3;
}

export type PlanetInput = Pick<Planet, "name" | "startDate" | "endDate" | "ongoing" | "description" | "galaxyId" | "appearance">;
export type MemoryInput = Pick<Memory, "title" | "body" | "occurredOn">;

export interface UniverseRepository {
  load(): UniverseData;
  save(data: UniverseData, expectedRevision: number): UniverseData;
}
