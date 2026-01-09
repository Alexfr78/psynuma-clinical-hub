// Update this page (the content is just a fallback if you fail to update the page)

const Index = () => {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <h1 className="mb-4 text-4xl font-bold">Psycma</h1>
          <p className="text-xl text-muted-foreground">Sistema de gestión para profesionales de la salud mental</p>
        </div>
      </div>
      <footer className="border-t py-4">
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
      </footer>
    </div>
  );
};

export default Index;
