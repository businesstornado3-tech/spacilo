/**
 * Domain models for the marketplace.
 * These are interface definitions only — no database is connected yet.
 * Monetary amounts are stored in pence (GBP) to avoid floating point errors.
 */

export type ID = string;
export type ISODateString = string;
export type Pence = number;

/* ------------------------------------------------------------------ Users */

export type UserMode = "renter" | "host";
export type UserRole = "user" | "admin";

export interface User {
  id: ID;
  email: string;
  phone?: string;
  firstName: string;
  lastName?: string;
  avatarUrl?: string;
  /** Postcode district only for privacy, e.g. "PO4" */
  postcodeDistrict?: string;
  role: UserRole;
  activeMode: UserMode;
  isHost: boolean;
  isRenter: boolean;
  verifications: Verification[];
  createdAt: ISODateString;
  lastActiveAt?: ISODateString;
}

export interface HostProfile {
  id: ID;
  userId: ID;
  displayName: string;
  bio?: string;
  responseRatePercent?: number;
  responseTimeMinutes?: number;
  ratingAverage?: number;
  reviewCount: number;
  spaceIds: ID[];
  payoutAccountConnected: boolean;
  joinedAt: ISODateString;
}

export interface RenterProfile {
  id: ID;
  userId: ID;
  displayName: string;
  bio?: string;
  ratingAverage?: number;
  reviewCount: number;
  defaultSearchPostcode?: string;
  joinedAt: ISODateString;
}

/* ----------------------------------------------------------- Verification */

export type VerificationType =
  | "email"
  | "phone"
  | "id"
  | "address"
  | "space"
  | "payment";

export type VerificationStatus = "unverified" | "pending" | "verified" | "failed";

export interface Verification {
  id: ID;
  subjectId: ID;
  subjectType: "user" | "space";
  type: VerificationType;
  status: VerificationStatus;
  verifiedAt?: ISODateString;
  expiresAt?: ISODateString;
}

/* ---------------------------------------------------------------- Spaces */

export type SpaceType =
  | "garage"
  | "room"
  | "loft"
  | "shed"
  | "basement"
  | "outbuilding"
  | "warehouse"
  | "container"
  | "driveway"
  | "other";

export type SpaceStatus = "draft" | "in_review" | "listed" | "paused" | "archived";

export type SecurityFeature =
  | "cctv"
  | "alarm"
  | "locked_door"
  | "gated"
  | "lighting"
  | "dry"
  | "heated"
  | "ground_floor"
  | "vehicle_access"
  | "24_7_access";

export interface Space {
  id: ID;
  hostId: ID;
  title: string;
  type: SpaceType;
  description?: string;
  /** Approximate usable floor area */
  areaSqFt: number;
  heightFt?: number;
  pricePerMonth: Pence;
  /** Public area label only — full address stays private until booking */
  areaName: string;
  postcodeDistrict: string;
  /** Approximate coordinates, offset for privacy */
  approxLat?: number;
  approxLng?: number;
  photos: SpacePhoto[];
  securityFeatures: SecurityFeature[];
  accessNotes?: string;
  status: SpaceStatus;
  verifications: Verification[];
  ratingAverage?: number;
  reviewCount: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface SpacePhoto {
  id: ID;
  spaceId: ID;
  url: string;
  /** Required for accessibility */
  alt: string;
  width?: number;
  height?: number;
  isCover: boolean;
  sortOrder: number;
}

/* ------------------------------------------------------------- Inventory */

export type ItemCategory =
  | "furniture"
  | "boxes"
  | "appliances"
  | "sports"
  | "garden"
  | "business_stock"
  | "vehicle"
  | "other";

export interface Item {
  id: ID;
  inventoryId: ID;
  name: string;
  category: ItemCategory;
  quantity: number;
  /** Estimated dimensions in centimetres */
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  estimatedVolumeM3?: number;
  photoUrl?: string;
  photoAlt?: string;
  /** True when dimensions came from an AI estimate rather than the user */
  isAiEstimated: boolean;
  aiConfidence?: number;
  notes?: string;
}

export interface Inventory {
  id: ID;
  renterId: ID;
  name: string;
  items: Item[];
  totalVolumeM3: number;
  estimatedAreaSqFt: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/* --------------------------------------------------------------- Search */

export interface SearchRequest {
  id: ID;
  renterId?: ID;
  postcode: string;
  radiusMiles: number;
  inventoryId?: ID;
  requiredAreaSqFt?: number;
  maxPricePerMonth?: Pence;
  spaceTypes?: SpaceType[];
  requiredFeatures?: SecurityFeature[];
  startDate?: ISODateString;
  durationMonths?: number;
  createdAt: ISODateString;
}

export type SpaceFitBand = "excellent" | "good" | "possible" | "poor";

/**
 * SpaceFit is an estimated compatibility score, not a guarantee
 * that belongings will physically fit.
 */
export interface SpaceMatch {
  id: ID;
  searchRequestId: ID;
  spaceId: ID;
  spaceFitScore: number; // 0–100
  band: SpaceFitBand;
  distanceMiles: number;
  reasons: string[];
  calculatedAt: ISODateString;
}

/* ------------------------------------------------------------- Bookings */

export type BookingStatus =
  | "enquiry"
  | "pending_host"
  | "confirmed"
  | "active"
  | "ending"
  | "completed"
  | "cancelled"
  | "declined";

export interface Booking {
  id: ID;
  spaceId: ID;
  hostId: ID;
  renterId: ID;
  inventoryId?: ID;
  status: BookingStatus;
  startDate: ISODateString;
  endDate?: ISODateString;
  monthlyPrice: Pence;
  platformFee: Pence;
  checkIn?: CheckIn;
  checkOut?: CheckOut;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export type PaymentStatus =
  | "requires_action"
  | "processing"
  | "paid"
  | "failed"
  | "refunded"
  | "payout_scheduled"
  | "paid_out";

export interface Payment {
  id: ID;
  bookingId: ID;
  amount: Pence;
  currency: "GBP";
  status: PaymentStatus;
  periodStart: ISODateString;
  periodEnd: ISODateString;
  /** Provider reference only — never store card data */
  providerReference?: string;
  createdAt: ISODateString;
}

/* ------------------------------------------------------- Check in / out */

export interface CheckIn {
  id: ID;
  bookingId: ID;
  completedAt?: ISODateString;
  declaredItemIds: ID[];
  photoUrls: string[];
  hostSignedAt?: ISODateString;
  renterSignedAt?: ISODateString;
  notes?: string;
}

export interface CheckOut {
  id: ID;
  bookingId: ID;
  completedAt?: ISODateString;
  photoUrls: string[];
  hostSignedAt?: ISODateString;
  renterSignedAt?: ISODateString;
  conditionNotes?: string;
}

/* ------------------------------------------------------- Messages, etc. */

export interface Message {
  id: ID;
  threadId: ID;
  bookingId?: ID;
  senderId: ID;
  recipientId: ID;
  body: string;
  attachmentUrls?: string[];
  readAt?: ISODateString;
  createdAt: ISODateString;
}

export interface Review {
  id: ID;
  bookingId: ID;
  authorId: ID;
  subjectId: ID;
  subjectType: "host" | "renter" | "space";
  rating: number; // 1–5
  body?: string;
  createdAt: ISODateString;
}

export type DisputeStatus = "open" | "in_review" | "resolved" | "closed";

export interface Dispute {
  id: ID;
  bookingId: ID;
  raisedByUserId: ID;
  status: DisputeStatus;
  reason: string;
  details?: string;
  evidenceUrls?: string[];
  resolutionNotes?: string;
  createdAt: ISODateString;
  resolvedAt?: ISODateString;
}
