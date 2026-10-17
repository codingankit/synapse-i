import { getMemoryStatusCore } from "@synapse/core/memory";
import { ConsoleDashboard } from "@/components/ConsoleDashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const initialMemory = await getMemoryStatusCore();

  return <ConsoleDashboard initialMemory={initialMemory} />;
}
