/**
 * Human labels for policy categories.
 *
 * Renters see these words when they confirm or correct what an item is. The
 * keys must match the categories the server rules are written against.
 */
export const POLICY_CATEGORY_LABELS: Record<string, string> = {
  household: "Everyday household items",
  furniture: "Furniture",
  appliances: "Appliances",
  electronics: "Electronics",
  documents: "Paperwork",
  bicycles: "Bikes",
  chemicals: "Household chemicals",
  flammable: "Batteries or flammable goods",
  perishables: "Food or perishables",
  plants: "Plants or soil",
  liquids: "Bulk liquids",
  medicines: "Medicines",
  cash_securities: "Cash or valuables",
  irreplaceable_documents: "Irreplaceable documents",
  unidentified_container: "Sealed or unmarked container",
  fuel: "Fuel",
  compressed_gas: "Gas cylinders",
  explosives: "Fireworks or explosives",
  weapons: "Weapons",
  controlled_substances: "Controlled substances",
  biological: "Medical or biological waste",
  animals: "Live animals",
  waste: "Waste or refuse",
};

export function policyCategoryLabel(category: string): string {
  return POLICY_CATEGORY_LABELS[category] ?? "Something else";
}
