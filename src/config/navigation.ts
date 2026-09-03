import {
  Home,
  Search,
  Boxes,
  CalendarCheck,
  MessageSquare,
  User,
  LayoutDashboard,
  Warehouse,
  Wallet,
  FileText,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  to: string;
  icon?: LucideIcon;
}

export const marketingNav: NavItem[] = [
  { label: "Find Storage", to: "/find-storage" },
  { label: "Discover", to: "/discover" },
  { label: "Tools", to: "/tools" },
  { label: "Guides", to: "/guides" },
  { label: "List Your Space", to: "/list-space" },
  { label: "How It Works", to: "/how-it-works" },
  { label: "Trust & Safety", to: "/trust" },
];

export const renterNav: NavItem[] = [
  { label: "Home", to: "/renter", icon: Home },
  { label: "My Stuff", to: "/renter/inventory", icon: Boxes },
  { label: "EarnRoom AI", to: "/spacefit", icon: Sparkles },
  { label: "My Planner", to: "/planner", icon: LayoutDashboard },
  { label: "Search", to: "/renter/search", icon: Search },
  { label: "Requests", to: "/renter/requests", icon: FileText },
  { label: "Bookings", to: "/renter/bookings", icon: CalendarCheck },
  { label: "Messages", to: "/renter/messages", icon: MessageSquare },
  { label: "Transactions", to: "/renter/payments", icon: Wallet },

  { label: "Profile", to: "/profile", icon: User },
];

export const hostNav: NavItem[] = [
  { label: "Dashboard", to: "/host", icon: LayoutDashboard },
  { label: "Spaces", to: "/host/spaces", icon: Warehouse },
  { label: "EarnRoom AI", to: "/spacefit", icon: Sparkles },
  { label: "My Planner", to: "/planner", icon: LayoutDashboard },
  { label: "Bookings", to: "/host/bookings", icon: CalendarCheck },
  { label: "Messages", to: "/host/messages", icon: MessageSquare },
  { label: "Earnings", to: "/host/earnings", icon: Wallet },
];

export type UserMode = "renter" | "host";

export const navForMode = (mode: UserMode): NavItem[] =>
  mode === "host" ? hostNav : renterNav;
