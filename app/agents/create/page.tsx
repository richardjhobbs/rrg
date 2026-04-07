import RRGHeader from '@/components/rrg/RRGHeader';
import { CreateAgentWizard } from '@/components/agent/CreateAgentWizard';

export default function CreateAgentPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <RRGHeader active="agent" />
      <main className="px-6 py-12">
        <CreateAgentWizard />
      </main>
    </div>
  );
}
