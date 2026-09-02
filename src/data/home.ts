import garagePhoto from "@/assets/sample-garage.jpg";
import spareRoomPhoto from "@/assets/sample-spare-room.jpg";
import secureGaragePhoto from "@/assets/sample-secure-garage.jpg";
import loftPhoto from "@/assets/sample-loft.jpg";
import shedPhoto from "@/assets/sample-shed.jpg";

import type { Pence, SecurityFeature, SpaceType } from "@/types/models";

export interface HomeListing {
  id: string;
  title: string;
  spaceType: SpaceType;
  areaName: string;
  distanceMiles: number;
  pricePerMonth: Pence;
  rating: number;
  reviewCount: number;
  hostVerified: boolean;
  spaceFitScore: number;
  features: SecurityFeature[];
  extraFeatures?: string[];
  photoUrl: string;
  photoAlt: string;
}

/** Illustrative mock listings used to demonstrate nearby storage. No real addresses. */
export const homeListings: HomeListing[] = [
  {
    id: "l1",
    title: "Garage Space",
    spaceType: "garage",
    areaName: "Southsea",
    distanceMiles: 0.6,
    pricePerMonth: 4900,
    rating: 4.9,
    reviewCount: 27,
    hostVerified: true,
    spaceFitScore: 96,
    features: ["dry", "cctv"],
    extraFeatures: ["Indoor"],
    photoUrl: garagePhoto,
    photoAlt: "Tidy residential garage in Southsea with stacked storage boxes and a bicycle",
  },
  {
    id: "l2",
    title: "Spare Room Storage",
    spaceType: "room",
    areaName: "Milton",
    distanceMiles: 1.1,
    pricePerMonth: 3900,
    rating: 4.8,
    reviewCount: 14,
    hostVerified: true,
    spaceFitScore: 91,
    features: ["locked_door"],
    extraFeatures: ["Indoor", "Host present"],
    photoUrl: spareRoomPhoto,
    photoAlt: "Bright spare room in a Milton home with space for boxes and suitcases",
  },
  {
    id: "l3",
    title: "Secure Garage",
    spaceType: "garage",
    areaName: "Eastney",
    distanceMiles: 1.4,
    pricePerMonth: 5500,
    rating: 5,
    reviewCount: 11,
    hostVerified: true,
    spaceFitScore: 94,
    features: ["cctv", "ground_floor"],
    photoUrl: secureGaragePhoto,
    photoAlt: "Clean white-painted garage in Eastney with shelving, a side door and a CCTV camera",
  },
  {
    id: "l4",
    title: "Loft Storage",
    spaceType: "loft",
    areaName: "Southsea",
    distanceMiles: 0.8,
    pricePerMonth: 3200,
    rating: 4.7,
    reviewCount: 9,
    hostVerified: true,
    spaceFitScore: 88,
    features: ["dry"],
    extraFeatures: ["Indoor"],
    photoUrl: loftPhoto,
    photoAlt: "Boarded loft space in a Southsea house holding neatly stacked storage boxes",
  },
];

export interface CategoryChip {
  id: string;
  label: string;
  types?: SpaceType[];
}

export const categoryChips: CategoryChip[] = [
  { id: "all", label: "All" },
  { id: "garage", label: "Garage", types: ["garage"] },
  { id: "room", label: "Spare room", types: ["room"] },
  { id: "loft", label: "Loft", types: ["loft"] },
  { id: "shed", label: "Shed", types: ["shed"] },
  { id: "storage_room", label: "Storage room", types: ["basement", "outbuilding"] },
  { id: "commercial", label: "Commercial", types: ["warehouse", "container"] },
];

export const hostSpaceCategories = [
  "Garage",
  "Spare room",
  "Loft",
  "Shed",
  "Basement",
  "Storage room",
  "Unused corner",
  "Commercial space",
];

export { shedPhoto };
