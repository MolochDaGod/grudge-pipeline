import { ChatPanel } from "../components/panels/ChatPanel";
import { PipelinePanel } from "../components/panels/PipelinePanel";
import { SkeletonPanel } from "../components/panels/SkeletonPanel";

export default function Pipeline() {
  return (
    <div className="flex-1 flex flex-col md:flex-row gap-4 p-4 h-full min-h-0">
      <div className="w-full md:w-1/4 h-full min-w-[300px]">
        <ChatPanel />
      </div>
      <div className="w-full md:w-1/2 h-full">
        <PipelinePanel />
      </div>
      <div className="w-full md:w-1/4 h-full min-w-[300px]">
        <SkeletonPanel />
      </div>
    </div>
  );
}
