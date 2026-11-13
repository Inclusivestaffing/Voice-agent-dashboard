import { Card } from "@/components/ui";
import DemoReportForm from "./DemoReportForm";

export const dynamic = "force-dynamic";

/** Reports section: the only place a report is generated. */
export default function DemoReports() {
  return (
    <>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
        <div>
          <h1 className="text-2xl leading-tight font-semibold tracking-[-0.022em] text-zinc-900">Reports</h1>
          <p className="text-sm text-zinc-500 mt-1.5 max-w-2xl">Pick a period and generate a branded report for your client. Every number comes straight from the call logs.</p>
        </div>
      </div>

      <Card title="Generate a report" className="mb-6">
        <DemoReportForm />
      </Card>
      <p className="text-xs text-zinc-400">In the demo, the summary is written by the built-in rule engine. In a live workspace you can choose to have Claude Opus 5.5 write it.</p>
    </>
  );
}
