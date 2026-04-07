import { SiteNav } from '@/components/nav/SiteNav';
import { CreateAgentWizard } from '@/components/agent/CreateAgentWizard';

export default function CreateAgentPage() {
  return (
    <>
      <SiteNav />
      <main className="min-h-screen px-6 py-12">
        <CreateAgentWizard />
      </main>
    </>
  );
}
