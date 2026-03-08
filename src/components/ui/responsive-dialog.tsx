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

interface ResponsiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

function ResponsiveDialog({ open, onOpenChange, children }: ResponsiveDialogProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        {children}
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children}
    </Dialog>
  );
}

interface ResponsiveDialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const ResponsiveDialogContent = React.forwardRef<HTMLDivElement, ResponsiveDialogContentProps>(
  ({ className, children, ...props }, ref) => {
    const isMobile = useIsMobile();

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
  const isMobile = useIsMobile();

  if (isMobile) {
    return <DrawerHeader className={cn("text-left", className)} {...props} />;
  }

  return <DialogHeader className={className} {...props} />;
}

function ResponsiveDialogTitle({ className, ...props }: React.ComponentPropsWithoutRef<typeof DialogTitle>) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return <DrawerTitle className={className} {...props} />;
  }

  return <DialogTitle className={className} {...props} />;
}

function ResponsiveDialogDescription({ className, ...props }: React.ComponentPropsWithoutRef<typeof DialogDescription>) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return <DrawerDescription className={className} {...props} />;
  }

  return <DialogDescription className={className} {...props} />;
}

function ResponsiveDialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const isMobile = useIsMobile();

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
