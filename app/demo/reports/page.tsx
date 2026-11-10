import { Card } from "@/components/ui";
import DemoReportForm from "./DemoReportForm";

export const dynamic = "force-dynamic";

/** Reports section: the only place a report is generated. */
export default function DemoReports() {
  return (
    <>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Open Water Marine · AI Voice Receptionist</div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">Client Reports</h1>
          <p className="text-sm text-slate-500 mt-1">Pick a period and generate a branded, client-ready report. Numbers calculate directly from call logs.</p>
        </div>
      </div>


      <Card title="Generate a report" className="mb-6">
        <DemoReportForm />
      </Card>
      <p className="text-xs text-slate-400">In the demo, the summary is written by the built-in rule engine. In a live workspace you can choose to have Claude Opus 5.5 write it.</p>
    </>
  );
}
