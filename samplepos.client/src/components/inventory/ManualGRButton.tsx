import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useState } from "react";
import ManualGRModal from "./ManualGRModal";

export default function ManualGRButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Create goods receipt manually"
        className="inline-flex shrink-0 items-center justify-center gap-1.5 bg-primary hover:bg-primary/90 text-sm font-medium min-h-[var(--layout-touch-target)] px-3"
        data-gr-manual-cta-btn="true"
      >
        <Plus className="w-4 h-4 shrink-0" aria-hidden />
        <span className="hidden md:inline">+ Manual GR</span>
        <span className="inline md:hidden">Manual</span>
      </Button>

      {open && <ManualGRModal open={open} onClose={() => setOpen(false)} />}
    </>
  );
}
