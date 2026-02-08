
# Plan: Optimizar WhatsAppLinkDialog para móvil

## Problema Identificado

El diálogo de WhatsApp tiene dos problemas:
1. Se corta en móvil porque usa `Dialog` estándar sin adaptación responsive
2. El texto del botón dice "Abrir WhatsApp" cuando debería ser más claro como "Enviar WhatsApp"

## Solución

Implementar el patrón Drawer/Dialog responsive que ya usan otros componentes del proyecto (como `CreateBonoDialog`):

- En **móvil**: Usar `Drawer` (slide-up desde abajo, más natural en móvil)
- En **desktop**: Mantener `Dialog` centrado

## Cambios Técnicos

### Archivo: `src/components/agenda/WhatsAppLinkDialog.tsx`

1. **Importar componentes necesarios**:
   - `useIsMobile` hook
   - Drawer components (DrawerContent, DrawerHeader, etc.)

2. **Reestructurar componente**:
   - Extraer el contenido del diálogo a una variable `dialogContent`
   - Usar condicional: si `isMobile` → renderizar Drawer, sino → Dialog

3. **Cambiar texto del botón**:
   - De "Abrir WhatsApp" a "Enviar WhatsApp"
   - Cambiar icono de `ExternalLink` a `Send` de lucide-react

4. **Simplificar footer**:
   - Mover el teléfono a un lugar más discreto
   - Eliminar botón "Cerrar" redundante (el Drawer/Dialog tiene X)

## Estructura del código resultante

```text
WhatsAppLinkDialog
├── useIsMobile() para detectar dispositivo
├── dialogContent (contenido compartido)
│   ├── Vista previa del mensaje con botón copiar
│   ├── Botón principal "Enviar WhatsApp"
│   └── Teléfono como texto pequeño
│
├── Si isMobile:
│   └── Drawer (desde abajo)
│       └── DrawerContent con dialogContent
│
└── Si desktop:
    └── Dialog (centrado)
        └── DialogContent con dialogContent
```

## Resultado Visual

**Móvil**: El diálogo aparece como un panel deslizante desde abajo, ocupando lo necesario sin cortarse

**Desktop**: Diálogo centrado como actualmente, pero con texto más claro

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/components/agenda/WhatsAppLinkDialog.tsx` | Implementar patrón Drawer/Dialog responsive y cambiar textos |
