import {
  Home,
  Search,
  CalendarCheck,
  MessageSquare,
  User,
  LayoutDashboard,
  Warehouse,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  to: string;
  icon?: LucideIcon;
}

export const marketingNav: NavItem[] = [
  { label: "Find Storage", to: "/find-storage" },
  { label: "List Your Space", to: "/list-space" },
  { label: "How It Works", to: "/how-it-works" },
  { label: "Trust & Safety", to: "/trust" },
];

export const renterNav: NavItem[] = [
  { label: "Home", to: "/renter", icon: Home },
  { label: "Search", to: "/renter/search", icon: Search },
  { label: "Bookings", to: "/renter/bookings", icon: CalendarCheck },
  { label: "Messages", to: "/renter/messages", icon: MessageSquare },
  { label: "Profile", to: "/profile", icon: User },
];

export const hostNav: NavItem[] = [
  { label: "Dashboard", to: "/host", icon: LayoutDashboard },
  { label: "Spaces", to: "/host/spaces", icon: Warehouse },
  { label: "Bookings", to: "/host/bookings", icon: CalendarCheck },
  { label: "Messages", to: "/host/messages", icon: MessageSquare },
  { label: "Earnings", to: "/host/earnings", icon: Wallet },
];

export type UserMode = "renter" | "host";

export const navForMode = (mode: UserMode): NavItem[] =>
  mode === "host" ? hostNav : renterNav;
