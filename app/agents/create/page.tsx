import RRGHeader from '@/components/rrg/RRGHeader';
import RRGFooter from '@/components/rrg/RRGFooter';
import { CreateAgentWizard } from '@/components/agent/CreateAgentWizard';

export default function CreateAgentPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <RRGHeader active="agent" />
      <main className="px-6 py-12 max-w-2xl mx-auto">
        <a href="/agents" className="inline-flex items-center gap-1 text-sm text-white/50 hover:text-green-400 transition-colors mb-6">
          &larr; Back
        </a>
        <CreateAgentWizard />
      </main>
      <RRGFooter />
    </div>
  );
}
