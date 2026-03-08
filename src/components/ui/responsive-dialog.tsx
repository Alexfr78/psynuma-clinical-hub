import * as React from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

// Shared context so every child reads the same value the parent decided on
const ResponsiveContext = React.createContext(false);

interface ResponsiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

function ResponsiveDialog({ open, onOpenChange, children }: ResponsiveDialogProps) {
  const isMobile = useIsMobile();

  return (
    <ResponsiveContext.Provider value={isMobile}>
      {isMobile ? (
        <Drawer open={open} onOpenChange={onOpenChange}>
          {children}
        </Drawer>
      ) : (
        <Dialog open={open} onOpenChange={onOpenChange}>
          {children}
        </Dialog>
      )}
    </ResponsiveContext.Provider>
  );
}

interface ResponsiveDialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const ResponsiveDialogContent = React.forwardRef<HTMLDivElement, ResponsiveDialogContentProps>(
  ({ className, children, ...props }, ref) => {
    const isMobile = React.useContext(ResponsiveContext);

    if (isMobile) {
      return (
        <DrawerContent className={cn("max-h-[90vh]", className)} aria-describedby={undefined}>
          <div className="overflow-y-auto px-4 pb-4">
            {children}
          </div>
        </DrawerContent>
      );
    }

    return (
      <DialogContent ref={ref} className={className} {...props}>
        {children}
      </DialogContent>
    );
  }
);
ResponsiveDialogContent.displayName = "ResponsiveDialogContent";

function ResponsiveDialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const isMobile = React.useContext(ResponsiveContext);

  if (isMobile) {
    return <DrawerHeader className={cn("text-left", className)} {...props} />;
  }

  return <DialogHeader className={className} {...props} />;
}

function ResponsiveDialogTitle({ className, ...props }: React.ComponentPropsWithoutRef<typeof DialogTitle>) {
  const isMobile = React.useContext(ResponsiveContext);

  if (isMobile) {
    return <DrawerTitle className={className} {...props} />;
  }

  return <DialogTitle className={className} {...props} />;
}

function ResponsiveDialogDescription({ className, ...props }: React.ComponentPropsWithoutRef<typeof DialogDescription>) {
  const isMobile = React.useContext(ResponsiveContext);

  if (isMobile) {
    return <DrawerDescription className={className} {...props} />;
  }

  return <DialogDescription className={className} {...props} />;
}

function ResponsiveDialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const isMobile = React.useContext(ResponsiveContext);

  if (isMobile) {
    return <DrawerFooter className={className} {...props} />;
  }

  return <DialogFooter className={className} {...props} />;
}

export {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
};
