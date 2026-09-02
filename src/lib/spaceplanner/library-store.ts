/**
 * Planner library repository.
 *
 * The UI talks to `PlannerLibraryRepository` and nothing else. Today the only
 * implementation keeps records in the browser, which is enough for a personal
 * workspace that has not been signed in and synced yet.
 *
 * FUTURE HOOK — moving to the database
 * ------------------------------------
 * Implement the same interface against `planner_inventories` /
 * `planner_runs` rows, swap the export at the bottom of this file, and no
 * component, hook or test above it changes.
 */
import {
  duplicateName,
  fromQuantities,
  type PlanRun,
  type SavedInventory,
  type SavedLine,
} from "./library";

export interface PlannerLibraryRepository {
  listInventories(): Promise<SavedInventory[]>;
  createInventory(input: {
    name: string;
    description?: string;
    spaceId: string;
    lines?: SavedLine[];
  }): Promise<SavedInventory>;
  updateInventory(
    id: string,
    patch: Partial<Pick<SavedInventory, "name" | "description" | "lines" | "spaceId" | "lastScore">>,
  ): Promise<SavedInventory>;
  touchInventory(id: string): Promise<SavedInventory>;
  duplicateInventory(id: string): Promise<SavedInventory>;
  archiveInventory(id: string): Promise<SavedInventory>;
  restoreInventory(id: string): Promise<SavedInventory>;
  deleteInventory(id: string): Promise<void>;
  listRuns(): Promise<PlanRun[]>;
  recordRun(run: Omit<PlanRun, "id" | "ranAt">): Promise<PlanRun>;
}

const INVENTORY_KEY = "earnroom.planner.inventories.v1";
const RUN_KEY = "earnroom.planner.runs.v1";
const MAX_RUNS = 60;

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const now = () => new Date().toISOString();

function read<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, rows: T[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(rows));
  } catch {
    /* storage full or blocked — the workspace still works for this session */
  }
}

class LocalPlannerLibrary implements PlannerLibraryRepository {
  async listInventories(): Promise<SavedInventory[]> {
    return read<SavedInventory>(INVENTORY_KEY);
  }

  async createInventory({
    name,
    description = "",
    spaceId,
    lines = [],
  }: {
    name: string;
    description?: string;
    spaceId: string;
    lines?: SavedLine[];
  }): Promise<SavedInventory> {
    const timestamp = now();
    const inventory: SavedInventory = {
      id: newId(),
      name: name.trim() || "Untitled inventory",
      description: description.trim(),
      lines,
      spaceId,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastOpenedAt: timestamp,
      archivedAt: null,
      lastScore: null,
    };
    write(INVENTORY_KEY, [inventory, ...(await this.listInventories())]);
    return inventory;
  }

  private async mutate(
    id: string,
    change: (inventory: SavedInventory) => SavedInventory,
  ): Promise<SavedInventory> {
    const rows = await this.listInventories();
    const index = rows.findIndex((row) => row.id === id);
    if (index === -1) throw new Error("That inventory no longer exists.");
    const next = change(rows[index]!);
    rows[index] = next;
    write(INVENTORY_KEY, rows);
    return next;
  }

  updateInventory(
    id: string,
    patch: Partial<Pick<SavedInventory, "name" | "description" | "lines" | "spaceId" | "lastScore">>,
  ): Promise<SavedInventory> {
    return this.mutate(id, (inventory) => ({ ...inventory, ...patch, updatedAt: now() }));
  }

  touchInventory(id: string): Promise<SavedInventory> {
    return this.mutate(id, (inventory) => ({ ...inventory, lastOpenedAt: now() }));
  }

  async duplicateInventory(id: string): Promise<SavedInventory> {
    const rows = await this.listInventories();
    const source = rows.find((row) => row.id === id);
    if (!source) throw new Error("That inventory no longer exists.");
    return this.createInventory({
      name: duplicateName(
        source.name,
        rows.map((row) => row.name),
      ),
      description: source.description,
      spaceId: source.spaceId,
      lines: source.lines.map((line) => ({ ...line })),
    });
  }

  archiveInventory(id: string): Promise<SavedInventory> {
    return this.mutate(id, (inventory) => ({ ...inventory, archivedAt: now() }));
  }

  restoreInventory(id: string): Promise<SavedInventory> {
    return this.mutate(id, (inventory) => ({
      ...inventory,
      archivedAt: null,
      updatedAt: now(),
    }));
  }

  async deleteInventory(id: string): Promise<void> {
    const rows = await this.listInventories();
    write(
      INVENTORY_KEY,
      rows.filter((row) => row.id !== id),
    );
    const runs = await this.listRuns();
    write(
      RUN_KEY,
      runs.filter((run) => run.inventoryId !== id),
    );
  }

  async listRuns(): Promise<PlanRun[]> {
    return read<PlanRun>(RUN_KEY);
  }

  async recordRun(run: Omit<PlanRun, "id" | "ranAt">): Promise<PlanRun> {
    const entry: PlanRun = { ...run, id: newId(), ranAt: now() };
    write(RUN_KEY, [entry, ...(await this.listRuns())].slice(0, MAX_RUNS));
    return entry;
  }
}

/** The repository the workspace runs on. Swap this line for the database one. */
export const plannerLibrary: PlannerLibraryRepository = new LocalPlannerLibrary();

export { fromQuantities };
