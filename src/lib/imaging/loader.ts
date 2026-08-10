import { niftiAdapter } from "@/lib/imaging/nifti/adapter";
import type { FormatAdapter, Volume } from "@/lib/imaging/types";

/** Registry of file-format adapters, tried in order. */
export const ADAPTERS: readonly FormatAdapter[] = [niftiAdapter];

/** How many bytes of the file we sniff before deciding which adapter to use. */
const SNIFF_BYTES = 540;

export interface ResolvedAdapter {
  readonly adapter: FormatAdapter;
  readonly head: Uint8Array;
}

export async function resolveAdapter(file: File): Promise<ResolvedAdapter> {
  const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
  const adapter = ADAPTERS.find((a) => a.canLoad({ name: file.name, head }));
  if (!adapter) {
    throw new Error(`No adapter for ${file.name}`);
  }
  return { adapter, head };
}

/**
 * Dispatch a dropped/uploaded file to the right format adapter.
 * Throws if no adapter claims the file.
 */
export async function loadFile(file: File, signal?: AbortSignal): Promise<readonly Volume[]> {
  const { adapter } = await resolveAdapter(file);
  return adapter.load(file, signal);
}
