export type PlanetType = "rocky" | "ocean" | "gas" | "ice" | "ringed";
export type Vec3 = [number, number, number];
export type Quality = "auto" | "high" | "medium" | "low";

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
  kind: "text" | "mixed";
  title: string;
  body: string;
  occurredOn: string;
  createdAt: string;
  updatedAt: string;
  mediaIds?: string[];
}

export type MediaKind = "image" | "video";
export interface Media {
  id: string;
  memoryId: string;
  kind: MediaKind;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
}
export interface UploadFile {
  name: string;
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface Galaxy {
  id: string;
  name: string;
  color: string;
}

export interface UniverseData {
  schemaVersion: 1 | 2;
  revision: number;
  universe: { id: string; name: string };
  galaxies: Galaxy[];
  planets: Planet[];
  memories: Memory[];
  media?: Media[];
}

export interface CameraBookmark {
  position: Vec3;
  target: Vec3;
}

export type PlanetInput = Pick<Planet, "name" | "startDate" | "endDate" | "ongoing" | "description" | "galaxyId" | "appearance">;
export type MemoryInput = Pick<Memory, "title" | "body" | "occurredOn"> & {
  files?: UploadFile[];
  removeMediaIds?: string[];
};

export interface UniverseRepository {
  load(): UniverseData;
  save(data: UniverseData, expectedRevision: number): UniverseData;
}
