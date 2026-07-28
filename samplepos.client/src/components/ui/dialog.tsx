import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className = "", style, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    style={style}
    className={`fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 ${className}`}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogScrollArea = ({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={`min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pr-12 sm:p-6 sm:pr-14 ${className}`}
    {...props}
  />
)
DialogScrollArea.displayName = "DialogScrollArea"

function usesCompoundDialogLayout(children: React.ReactNode): boolean {
  return React.Children.toArray(children).some(
    (child) =>
      React.isValidElement(child) &&
      (child.type === DialogHeader ||
        child.type === DialogBody ||
        child.type === DialogFooter),
  );
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    /** Layout surface — AdaptiveDialog sets this from layout tier. */
    surface?: 'centered' | 'near-full' | 'full'
  }
>(({ className = "", children, surface = 'centered', style, ...props }, ref) => {
  const compound = usesCompoundDialogLayout(children);

  const surfaceClass =
    surface === 'full'
      ? 'fixed inset-0 z-50 flex w-full h-full max-w-none max-h-none translate-x-0 translate-y-0 rounded-none border-0'
      : surface === 'near-full'
        ? 'fixed left-[50%] top-[50%] z-50 flex w-[min(96vw,42rem)] max-w-none max-h-[min(92vh,56rem)] translate-x-[-50%] translate-y-[-50%] rounded-xl border'
        : 'fixed left-[50%] top-[50%] z-50 flex w-[95vw] sm:w-[90vw] md:w-[85vw] lg:w-[80vw] xl:w-[75vw] max-w-6xl max-h-[90vh] translate-x-[-50%] translate-y-[-50%] rounded-lg border';

  return (
    <DialogPortal>
      <DialogOverlay style={style} />
      <DialogPrimitive.Content
        ref={ref}
        data-dialog-surface={surface}
        style={style}
        className={`${surfaceClass} flex-col bg-white shadow-2xl duration-300 ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 overflow-hidden ${className}`}
        {...props}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {compound ? children : <DialogScrollArea>{children}</DialogScrollArea>}
        </div>
        <DialogPrimitive.Close className="absolute right-3 top-3 sm:right-4 sm:top-4 z-20 rounded-full p-1.5 sm:p-2 opacity-70 ring-offset-white transition-all hover:opacity-100 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 disabled:pointer-events-none min-h-[var(--layout-touch-target)] min-w-[var(--layout-touch-target)] flex items-center justify-center">
          <X className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={`flex shrink-0 flex-col space-y-1.5 px-4 pt-4 text-center sm:px-6 sm:pt-6 sm:text-left pr-12 sm:pr-14 ${className}`}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogBody = ({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 ${className}`}
    {...props}
  />
)
DialogBody.displayName = "DialogBody"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className = "", ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={`text-lg font-semibold leading-none tracking-tight ${className}`}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className = "", ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={`text-sm text-slate-500 ${className}`}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

const DialogFooter = ({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={`flex shrink-0 flex-col-reverse gap-2 border-t bg-white px-4 py-3 sm:flex-row sm:justify-end sm:space-x-2 sm:px-6 sm:py-4 ${className}`}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogScrollArea,
  DialogTitle,
  DialogDescription,
  DialogFooter,
}
