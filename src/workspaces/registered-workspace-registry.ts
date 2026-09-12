import { realpathSync } from "node:fs";
import { basename, isAbsolute, normalize } from "node:path";

import { CoreError } from "../core/errors.js";

interface WorkspaceRegistration {
  readonly id: string;
  readonly root: string;
}

interface WorkspaceLookup {
  readonly id: string;
  readonly root: string;
  readonly source: "manual" | "managed";
}

type Registration = {
  root: string;
  source: "manual" | "managed";
};

export class RegisteredWorkspaceRegistry {
  private readonly registrations = new Map<string, Registration>();
  private readonly canonicalRoots = new Map<string, string>();
  private readonly canonicalize: (root: string) => string;

  constructor(
    entries: readonly WorkspaceRegistration[],
    canonicalize: (root: string) => string = bestEffortCanonicalRoot
  ) {
    this.canonicalize = canonicalize;
    for (const entry of entries) {
      if (typeof entry.id !== "string" || entry.id.length === 0 ||
          typeof entry.root !== "string" || entry.root.length === 0 ||
          !isAbsolute(entry.root) || normalize(entry.root) !== entry.root ||
          this.registrations.has(entry.id)) {
        throw new CoreError("WORKSPACE_BOUNDARY_VIOLATION");
      }
      const canonicalRoot = canonicalize(entry.root);
      this.registrations.set(entry.id, {
        root: entry.root,
        source: "manual"
      });
      // Duplicate canonical roots among manual entries do not fail startup;
      // the first entry wins for canonical lookup.
      if (!this.canonicalRoots.has(canonicalRoot)) this.canonicalRoots.set(canonicalRoot, entry.id);
    }
  }

  resolve(workspaceId: string): string {
    const registration = this.registrations.get(workspaceId);
    if (registration === undefined) throw new CoreError("UNKNOWN_WORKSPACE");
    return registration.root;
  }

  replaceWith(next: RegisteredWorkspaceRegistry): void {
    this.registrations.clear();
    this.canonicalRoots.clear();
    for (const [id, registration] of next.registrations) {
      this.registrations.set(id, { ...registration });
    }
    for (const [root, id] of next.canonicalRoots) this.canonicalRoots.set(root, id);
  }

  list(query = "") {
    const needle = query.trim().normalize("NFKC").toLowerCase();
    return [...this.registrations].map(([id, entry]) => ({
      workspace_id: id,
      name: basename(entry.root),
      root: entry.root,
      source: entry.source
    })).filter(entry => !needle || [entry.name, entry.root, entry.workspace_id]
      .some(value => value.normalize("NFKC").toLowerCase().includes(needle)))
      .sort((a, b) => a.root.localeCompare(b.root));
  }

  findByRoot(canonicalRoot: string): WorkspaceLookup | undefined {
    const id = this.canonicalRoots.get(canonicalRoot);
    if (id === undefined) return undefined;
    const registration = this.registrations.get(id);
    if (registration === undefined) return undefined;
    return {
      id,
      root: registration.root,
      source: registration.source
    };
  }

  registerManaged(id: string, root: string): void {
    const existing = this.registrations.get(id);
    if (existing !== undefined) {
      if (existing.root === root) return;
      throw new CoreError("WORKSPACE_BOUNDARY_VIOLATION");
    }
    const canonicalRoot = this.canonicalize(root);
    if (this.canonicalRoots.has(canonicalRoot)) throw new CoreError("WORKSPACE_BOUNDARY_VIOLATION");
    this.registrations.set(id, { root, source: "managed" });
    this.canonicalRoots.set(canonicalRoot, id);
  }
}

function bestEffortCanonicalRoot(root: string): string {
  try {
    return realpathSync(root);
  } catch {
    return root;
  }
}
