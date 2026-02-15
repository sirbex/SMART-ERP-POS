import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useState } from "react";
import ManualGRModal from "./ManualGRModal";

export default function ManualGRButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button 
        onClick={() => setOpen(true)} 
        className="bg-primary hover:bg-primary/90 w-full sm:w-auto text-sm sm:text-base"
      >
        <Plus className="w-4 h-4 mr-2" />
        <span className="hidden sm:inline">Create GR Manually</span>
        <span className="inline sm:hidden">Manual GR</span>
      </Button>

      {open && <ManualGRModal open={open} onClose={() => setOpen(false)} />}
    </>
  );
}
