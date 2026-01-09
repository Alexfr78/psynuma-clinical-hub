import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Calendar, FileText, CreditCard, Users, ClipboardCheck } from "lucide-react";

const Index = () => {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="max-w-2xl text-center">
          <h1 className="mb-4 text-4xl font-bold">Psycma</h1>
          <p className="text-xl text-muted-foreground mb-8">
            Sistema de gestión para profesionales de la salud mental
          </p>
          
          <div className="text-left bg-muted/50 rounded-lg p-6 mb-8">
            <h2 className="text-lg font-semibold mb-4 text-center">
              Plataforma integral para clínicas y consultas de psicología
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <span className="text-muted-foreground">Gestión de agenda y citas con pacientes</span>
              </div>
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <span className="text-muted-foreground">Historiales clínicos y evaluaciones psicológicas</span>
              </div>
              <div className="flex items-start gap-3">
                <CreditCard className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <span className="text-muted-foreground">Facturación y control de pagos</span>
              </div>
              <div className="flex items-start gap-3">
                <ClipboardCheck className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <span className="text-muted-foreground">Consentimientos informados digitales</span>
              </div>
              <div className="flex items-start gap-3 sm:col-span-2 justify-center">
                <Users className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <span className="text-muted-foreground">Portal para pacientes</span>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild size="lg">
              <Link to="/auth">Iniciar sesión</Link>
            </Button>
          </div>
        </div>
      </div>
      
      <footer className="border-t py-6">
        <div className="container flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground">
          <a 
            href="https://psicologosexual.com/terminos-y-condiciones/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hover:text-foreground hover:underline"
          >
            Términos y condiciones de uso
          </a>
          <span>•</span>
          <a 
            href="https://psicologosexual.com/politica-de-privacidad/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hover:text-foreground hover:underline"
          >
            Política de privacidad
          </a>
        </div>
        <p className="text-center text-xs text-muted-foreground mt-4">
          © 2025 Psycma - Todos los derechos reservados
        </p>
      </footer>
    </div>
  );
};

export default Index;
