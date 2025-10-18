import * as React from "react"
import { cn } from "../../lib/utils"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"

const ToastProvider = React.createContext({
  toast: (_props: ToastProps) => {}
})

export const useToast = () => React.useContext(ToastProvider)

export interface ToastProps extends VariantProps<typeof toastVariants> {
  title?: string
  description?: string
  action?: React.ReactNode
  onClose?: () => void
  duration?: number
  className?: string
}

const Toast: React.FC<ToastProps> = ({
  className,
  title,
  description,
  variant,
  action,
  onClose,
  ...props
}) => {
  return (
    <div
      className={cn(
        "group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-6 pr-8 shadow-lg transition-all",
        toastVariants({ variant }),
        className
      )}
      {...props}
    >
      <div className="flex flex-col gap-1">
        {title && <div className="text-sm font-semibold">{title}</div>}
        {description && (
          <div className="text-sm opacity-90">{description}</div>
        )}
      </div>
      {action}
      <button onClick={onClose} className="absolute right-2 top-2 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </button>
    </div>
  )
}

const toastVariants = cva(
  "border bg-background text-foreground",
  {
    variants: {
      variant: {
        default: "bg-background text-foreground",
        destructive: "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
        success: "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-300",
        warning: "border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
        info: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

interface ToastContainerProps {
  children: React.ReactNode
}

const ToastContainer: React.FC<ToastContainerProps> = ({ children }) => {
  return (
    <div className="fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]">
      {children}
    </div>
  )
}

interface ToastContextProviderProps {
  children: React.ReactNode
}

export const ToastContextProvider: React.FC<ToastContextProviderProps> = ({ children }) => {
  const [toasts, setToasts] = React.useState<Array<ToastProps & { id: string }>>([])
  
  const toast = React.useCallback((props: ToastProps) => {
    const id = Math.random().toString(36).substr(2, 9)
    const newToast = { ...props, id }
    
    setToasts((prev) => [...prev, newToast])
    
    if (props.duration !== Infinity) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
        props.onClose?.()
      }, props.duration || 5000)
    }
  }, [])
  
  const handleClose = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const toast = toasts.find((t) => t.id === id)
    toast?.onClose?.()
  }, [toasts])
  
  return (
    <ToastProvider.Provider value={{ toast }}>
      {children}
      <ToastContainer>
        {toasts.map((t) => (
          <Toast 
            key={t.id} 
            title={t.title} 
            description={t.description} 
            variant={t.variant}
            action={t.action}
            onClose={() => handleClose(t.id)}
          />
        ))}
      </ToastContainer>
    </ToastProvider.Provider>
  )
}

export { Toast, ToastContainer, toastVariants }